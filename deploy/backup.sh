#!/bin/sh
# Service `backup` trong docker-compose.yml: chạy ngay khi khởi động rồi mỗi 24 giờ.
#   /backups/db-<thời điểm>.dump      pg_dump định dạng custom — khôi phục: xem README > Backup
#   /backups/media-<thời điểm>.tar.gz  toàn bộ ảnh / audio
# Ghi ra file .part rồi đổi tên (không để lại bản dở); xoá bản cũ hơn BACKUP_KEEP_DAYS ngày.
#
# Tuỳ chọn (biến trong file .env của compose, xem README > Cảnh báo & backup ngoài VPS):
#   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  báo Telegram: backup lỗi, ổ đĩa sắp đầy, (mặc định) mỗi lần backup xong
#   BACKUP_S3_BUCKET (+ BACKUP_S3_*)        chép bản backup sang kho S3 (Cloudflare R2 / Backblaze B2…) bằng rclone,
#                                          giữ BACKUP_OFFSITE_KEEP_DAYS ngày ở đó
set -u

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
OFFSITE_KEEP_DAYS="${BACKUP_OFFSITE_KEEP_DAYS:-30}"
DISK_ALERT_PCT="${BACKUP_DISK_ALERT_PCT:-85}"
NOTIFY_SUCCESS="${BACKUP_NOTIFY_SUCCESS:-true}"
LABEL="${BACKUP_LABEL:-phonics-api}"

log() { echo "[backup] $*"; }
err() { echo "[backup] $*" >&2; }

telegram_enabled() { [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; }
offsite_enabled() { [ -n "${BACKUP_S3_BUCKET:-}" ]; }

# Gửi tin Telegram (không có token → bỏ qua; gửi lỗi chỉ ghi log, không làm hỏng backup)
notify() {
  telegram_enabled || return 0
  curl -fsS -m 20 -o /dev/null -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$1" \
    || err "không gửi được tin Telegram"
}

# Image postgres:alpine không có curl / rclone: chỉ cài thứ đang dùng. Cài lỗi (mất mạng) → backup vẫn chạy cục bộ.
install_tools() {
  pkgs=""
  telegram_enabled && pkgs="$pkgs curl"
  offsite_enabled && pkgs="$pkgs rclone"
  [ -z "$pkgs" ] && return 0
  # shellcheck disable=SC2086 # tách danh sách gói là cố ý
  apk add --no-cache --quiet $pkgs || err "không cài được:$pkgs"
}

# Ổ chứa /backups (bind mount → chính ổ của VPS) dùng quá ngưỡng → báo
check_disk() {
  pct=$(df -P /backups | awk 'NR == 2 { sub("%", "", $5); print $5 }')
  [ -n "$pct" ] || return 0
  if [ "$pct" -ge "$DISK_ALERT_PCT" ]; then
    err "ổ đĩa đã dùng ${pct}%"
    notify "⚠️ ${LABEL}: ổ đĩa VPS đã dùng ${pct}% (ngưỡng ${DISK_ALERT_PCT}%). Dọn bớt ảnh Docker / backup cũ hoặc nới ổ."
  fi
}

# Chép các bản backup sang kho S3 (remote `offsite` cấu hình bằng biến RCLONE_CONFIG_OFFSITE_* trong compose),
# rồi xoá bản cũ hơn BACKUP_OFFSITE_KEEP_DAYS ngày ở kho
sync_offsite() {
  offsite_enabled || return 0
  command -v rclone > /dev/null || { echo "chưa có rclone"; return 1; }
  # "/" cuối: rclone không HEAD thử prefix như một file (nếu không, sai endpoint / bucket lại báo "is a file not a directory")
  dest="offsite:${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-phonics-api}/"
  rclone copy /backups "$dest" --include 'db-*.dump' --include 'media-*.tar.gz' --s3-no-check-bucket --log-level ERROR 2>&1 \
    || return 1
  rclone delete "$dest" --min-age "${OFFSITE_KEEP_DAYS}d" --s3-no-check-bucket --log-level ERROR 2>&1 || return 1
}

# Mỗi bước kiểm tra lỗi tường minh: hàm được gọi trong `if` nên `set -e` không có tác dụng ở đây
backup() {
  ts=$(date -u +%Y%m%d-%H%M%S)
  pg_dump --format=custom --file="/backups/db-$ts.dump.part" 2>&1 || { echo "pg_dump lỗi"; return 1; }
  mv "/backups/db-$ts.dump.part" "/backups/db-$ts.dump" || return 1
  tar -czf "/backups/media-$ts.tar.gz.part" -C /data media 2>&1 || { echo "nén media lỗi"; return 1; }
  mv "/backups/media-$ts.tar.gz.part" "/backups/media-$ts.tar.gz" || return 1
  find /backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
  db_size=$(du -h "/backups/db-$ts.dump" | cut -f1)
  media_size=$(du -h "/backups/media-$ts.tar.gz" | cut -f1)
  echo "db ${db_size}, media ${media_size}"
}

run_once() {
  find /backups -maxdepth 1 -name '*.part' -delete
  if ! out=$(backup); then
    err "LỖI — thử lại sau 24 giờ: $out"
    notify "❌ ${LABEL}: backup LỖI — $(printf '%s' "$out" | tail -n 3)"
    check_disk
    return
  fi
  log "xong ($out, tổng $(du -sh /backups | cut -f1) trong /backups)"
  offsite_note=""
  if offsite_enabled; then
    if sync_out=$(sync_offsite); then
      offsite_note=", đã chép ra kho ngoài"
    else
      err "chép ra kho ngoài LỖI: $sync_out"
      notify "❌ ${LABEL}: backup cục bộ xong nhưng chép ra kho ngoài LỖI — $(printf '%s' "$sync_out" | tail -n 3)"
      offsite_note=", CHƯA chép ra kho ngoài"
    fi
  fi
  [ "$NOTIFY_SUCCESS" = "true" ] && notify "✅ ${LABEL}: backup xong ($out${offsite_note})"
  check_disk
}

install_tools
while true; do
  run_once
  sleep 86400
done
