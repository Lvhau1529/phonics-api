#!/bin/sh
# Service `backup` trong docker-compose.yml: chạy ngay khi khởi động rồi mỗi 24 giờ.
#   /backups/db-<thời điểm>.dump      pg_dump định dạng custom — khôi phục: xem README > Backup
#   /backups/media-<thời điểm>.tar.gz  toàn bộ ảnh / audio
# Ghi ra file .part rồi đổi tên (không để lại bản dở); xoá bản cũ hơn BACKUP_KEEP_DAYS ngày.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

backup() {
  ts=$(date -u +%Y%m%d-%H%M%S)
  pg_dump --format=custom --file="/backups/db-$ts.dump.part"
  mv "/backups/db-$ts.dump.part" "/backups/db-$ts.dump"
  tar -czf "/backups/media-$ts.tar.gz.part" -C /data media
  mv "/backups/media-$ts.tar.gz.part" "/backups/media-$ts.tar.gz"
  find /backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
  find /backups -maxdepth 1 -name '*.part' -delete
  echo "[backup] $ts xong ($(du -sh /backups | cut -f1) trong /backups)"
}

while true; do
  backup || echo "[backup] LỖI — thử lại sau 24 giờ" >&2
  sleep 86400
done
