/**
 * Dữ liệu test theo nghiệp vụ (QA) — chạy QUA HTTP API (không ghi thẳng DB) để mọi luật nghiệp vụ được thực thi:
 * quy đổi điểm / trần ngày / khoá game, xếp hạng + thông báo, phân quyền + phạm vi lớp, snapshot phiếu, chấm tự động /
 * chấm tay, nhận xét, audit.
 *
 *   pnpm exec tsx scripts/qa-seed.ts                 # API mặc định http://localhost:3000
 *   API_URL=http://localhost:3000 pnpm exec tsx scripts/qa-seed.ts
 *
 * Chạy một lần trên DB dev (bỏ qua nếu đã có gv.lan@qa.phonics.local). Muốn tạo lại từ đầu:
 *   pnpm docker:dev:reset
 * Kết quả (tài khoản, kịch bản, giá trị thực tế, PASS / FAIL) ghi ra docs/qa-test-data.md.
 *
 * Chỉ dùng ở dev: mỗi người dùng giả lập gửi một X-Forwarded-For riêng để không dính throttle theo IP.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const BASE = `${API}/api/v1`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@phonics.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '12345678';
/** Mật khẩu chung của mọi tài khoản QA */
const PASSWORD = '12345678';
/** Mạnh đăng ký bằng mật khẩu này rồi được admin reset về PASSWORD (test luồng reset) */
const MANH_OLD_PASSWORD = 'Old123456';
const DOMAIN = 'qa.phonics.local';
const SCHOOL_YEAR = '2026-2027';
const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const REPORT_PATH = 'docs/qa-test-data.md';

// ---------------------------------------------------------------- HTTP

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Actor {
  label: string;
  email: string;
  password: string;
  ip: string;
  token?: string;
  id?: string;
}
interface Res {
  status: number;
  data: Json;
}

let ipSeq = 1;
const nextIp = () => {
  ipSeq += 1;
  return `10.77.${ipSeq >> 8}.${ipSeq & 255}`;
};
const actor = (label: string, email: string, password = PASSWORD): Actor => ({
  label,
  email,
  password,
  ip: nextIp(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(a: Actor | null, method: string, path: string, body?: unknown): Promise<Res> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'accept-language': 'vi',
        'x-forwarded-for': a?.ip ?? nextIp(),
        ...(a?.token ? { authorization: `Bearer ${a.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(Number(res.headers.get('retry-after') ?? '5') * 1000 + 500);
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json')
      ? await res.json()
      : res.status === 204
        ? null
        : { bytes: (await res.arrayBuffer()).byteLength, type };
    return { status: res.status, data };
  }
}

/** Gọi API và bắt buộc thành công (2xx) — lỗi thì dừng script (dữ liệu nền phải tạo được) */
async function ok(a: Actor | null, method: string, path: string, body?: unknown): Promise<Json> {
  const r = await http(a, method, path, body);
  if (r.status >= 300) {
    throw new Error(`${a?.label ?? 'anon'} ${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function login(a: Actor): Promise<Actor> {
  const data = await ok(a, 'POST', '/auth/login', { email: a.email, password: a.password });
  a.token = data.accessToken;
  a.id = data.user.id;
  return a;
}

// ---------------------------------------------------------------- Kiểm tra + báo cáo

interface Check {
  group: string;
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}
const checks: Check[] = [];
let group = '';
const section = (g: string) => {
  group = g;
  console.log(`\n== ${g}`);
};
function check(name: string, expected: string, actual: unknown, pass: boolean) {
  const act = typeof actual === 'string' ? actual : JSON.stringify(actual);
  checks.push({ group, name, expected, actual: act, pass });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}  (mong đợi: ${expected}; thực tế: ${act})`);
}
/** Kỳ vọng lỗi nghiệp vụ: status + code */
async function expectError(
  name: string,
  a: Actor | null,
  method: string,
  path: string,
  body: unknown,
  status: number,
  code?: string,
) {
  const r = await http(a, method, path, body);
  const actual = `${r.status} ${r.data?.code ?? ''}`.trim();
  check(
    name,
    `${status}${code ? ` ${code}` : ''}`,
    `${actual}${r.data?.message ? ` — ${r.data.message}` : ''}`,
    r.status === status && (!code || r.data?.code === code),
  );
  return r;
}

// ---------------------------------------------------------------- Tiện ích thời gian / media

const vnDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** PNG màu trơn hợp lệ (để test upload ảnh câu hỏi) */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** WAV mono 8 kHz, tiếng bíp ngắn (giả lập ghi âm của học sinh) */
function beepWav(ms: number): Buffer {
  const rate = 8000;
  const n = Math.floor((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

async function uploadMedia(
  a: Actor,
  kind: 'IMAGE' | 'AUDIO',
  mimeType: string,
  fileName: string,
  bytes: Buffer,
  complete: Json,
) {
  const p = await ok(a, 'POST', '/media/presign', { kind, mimeType, sizeBytes: bytes.length, fileName });
  const put = await fetch(p.uploadUrl, { method: 'PUT', headers: p.headers, body: new Uint8Array(bytes) });
  if (put.status !== 204) throw new Error(`upload ${fileName} → ${put.status} ${await put.text()}`);
  return ok(a, 'POST', `/media/${p.mediaId}/complete`, complete);
}

// ---------------------------------------------------------------- Ván game

interface Round {
  gameId: string;
  correct: number;
  total: number;
  levelId?: string;
  playedAt?: string;
  clientSessionId?: string;
}
async function play(s: Actor, r: Round): Promise<Res> {
  return http(s, 'POST', '/game/results', {
    clientSessionId: r.clientSessionId ?? randomUUID(),
    gameId: r.gameId,
    mode: 'solo',
    levelId: r.levelId ?? 'level-1',
    correct: r.correct,
    total: r.total,
    score: r.correct * 100,
    durationMs: 60_000 + r.total * 3_000,
    endedBy: 'completed',
    playedAt: r.playedAt ?? iso(-5 * MIN),
    details: { qa: true },
  });
}

// ================================================================= MAIN

async function main() {
  const health = await fetch(`${API}/api/health/db`).catch(() => null);
  if (!health?.ok) throw new Error(`API chưa sẵn sàng tại ${API} (pnpm docker:dev)`);

  const admin = await login(actor('Admin', ADMIN_EMAIL, ADMIN_PASSWORD));
  const existing = await ok(admin, 'GET', `/admin/teachers?q=${encodeURIComponent(`gv.lan@${DOMAIN}`)}`);
  if (existing.total > 0) {
    console.log(`Dữ liệu QA đã có (gv.lan@${DOMAIN}). Muốn tạo lại: pnpm docker:dev:reset rồi chạy lại`);
    return;
  }

  // ------------------------------------------------------------ 1. Giáo viên, lớp, phân quyền
  section('1. Giáo viên, lớp, phân quyền');
  const lan = actor('Cô Lan', `gv.lan@${DOMAIN}`);
  const minh = actor('Thầy Minh', `gv.minh@${DOMAIN}`);
  const nghi = actor('Cô Nghi (đã khoá)', `gv.nghi@${DOMAIN}`);
  for (const [t, name, avatar] of [
    [lan, 'Cô Lan', 'cat'],
    [minh, 'Thầy Minh', 'lion'],
    [nghi, 'Cô Nghi', 'panda'],
  ] as const) {
    const created = await ok(admin, 'POST', '/admin/teachers', {
      email: t.email,
      displayName: name,
      password: PASSWORD,
      avatarKey: avatar,
    });
    t.id = created.id;
  }

  const mkClass = (name: string, grade: string, teacherIds: string[], joinVisible = true) =>
    ok(admin, 'POST', '/classes', { name, grade, schoolYear: SCHOOL_YEAR, joinVisible, teacherIds });
  const sunflower = await mkClass('QA-K3 Sunflower', 'K3', [lan.id!, minh.id!]);
  const rainbow = await mkClass('QA-K3 Rainbow', 'K3', [minh.id!]);
  const star = await mkClass('QA-K1 Star', 'K1', [lan.id!], false);
  const oldClass = await mkClass('QA-K2 Old (lưu trữ)', 'K2', [lan.id!]);
  await ok(admin, 'DELETE', `/classes/${oldClass.id}`);

  const groups = await ok(admin, 'GET', '/admin/permission-groups');
  const homeroom = groups.items.find((g: Json) => g.name === 'Giáo viên chủ nhiệm');
  const lanPerms = await ok(admin, 'PUT', `/admin/users/${lan.id}/permission-groups`, {
    groupIds: [homeroom.id],
  });
  check(
    'Cô Lan thuộc nhóm "Giáo viên chủ nhiệm" → có class.changeStudentClass, games.unlock',
    'có 2 quyền',
    lanPerms.effective.filter((p: string) => ['class.changeStudentClass', 'games.unlock'].includes(p)),
    lanPerms.effective.includes('class.changeStudentClass') && lanPerms.effective.includes('games.unlock'),
  );
  const minhPerms = await ok(admin, 'PUT', `/admin/users/${minh.id}/permissions`, {
    revoke: ['reports.export'],
    note: 'QA: không cho xuất báo cáo',
  });
  check(
    'Thầy Minh bị REVOKE reports.export',
    'không có reports.export',
    minhPerms.effective.includes('reports.export') ? 'còn quyền' : 'đã bỏ',
    !minhPerms.effective.includes('reports.export'),
  );
  await ok(admin, 'POST', '/admin/permission-groups', {
    name: 'QA - Trợ giảng',
    description: 'Chỉ xem thống kê',
    permissions: ['stats.view'],
  });

  await ok(admin, 'PATCH', `/admin/teachers/${nghi.id}`, { status: 'DISABLED' });
  await expectError(
    'GV bị khoá đăng nhập',
    nghi,
    'POST',
    '/auth/login',
    { email: nghi.email, password: PASSWORD },
    403,
    'ACCOUNT_DISABLED',
  );
  await login(lan);
  await login(minh);

  const pub = await ok(null, 'GET', '/public/classes');
  const pubNames = pub.items.map((c: Json) => c.name);
  check(
    'Form đăng ký chỉ hiện lớp joinVisible và chưa lưu trữ',
    'có Sunflower, Rainbow; không có Star, Old',
    pubNames.filter((n: string) => n.startsWith('QA-')),
    pubNames.includes('QA-K3 Sunflower') &&
      pubNames.includes('QA-K3 Rainbow') &&
      !pubNames.includes('QA-K1 Star') &&
      !pubNames.includes('QA-K2 Old (lưu trữ)'),
  );

  // ------------------------------------------------------------ 2. Học sinh tự đăng ký
  section('2. Học sinh đăng ký');
  const register = async (
    key: string,
    name: string,
    classId: string,
    avatar: string,
    parent?: Json,
    password = PASSWORD,
  ) => {
    const s = actor(name, `${key}@${DOMAIN}`, password);
    const data = await ok(s, 'POST', '/auth/register', {
      email: s.email,
      password,
      displayName: name,
      avatarKey: avatar,
      classId,
      ...(parent && { parent }),
    });
    s.token = data.accessToken;
    s.id = data.user.id;
    return s;
  };
  const an = await register('hs.an', 'An', sunflower.id, 'tiger', {
    name: 'Nguyễn Văn Ba',
    phone: '0901 234 567',
    email: `phuhuynh.an@${DOMAIN}`,
  });
  const binh = await register('hs.binh', 'Bình', sunflower.id, 'elephant');
  const chi = await register('hs.chi', 'Chi', sunflower.id, 'bunny', {
    name: 'Trần Thị Mai',
    phone: '0912 345 678',
  });
  const dung = await register('hs.dung', 'Dũng', sunflower.id, 'dog');
  const en = await register('hs.en', 'Én', sunflower.id, 'cat');
  const phuc = await register('hs.phuc', 'Phúc', sunflower.id, 'monkey');
  const giang = await register('hs.giang', 'Giang', rainbow.id, 'panda');
  const ha = await register('hs.ha', 'Hà', rainbow.id, 'bunny');
  const khang = await register('hs.khang', 'Khang', rainbow.id, 'lion');
  const linh = await register('hs.linh', 'Linh', rainbow.id, 'cat');
  const manh = await register('hs.manh', 'Mạnh', rainbow.id, 'tiger', undefined, MANH_OLD_PASSWORD);
  const sunflowerKids = [an, binh, chi, dung, en, phuc];
  const rainbowKids = [giang, ha, khang, linh, manh];
  check(
    'Đăng ký 11 học sinh (6 Sunflower, 5 Rainbow)',
    '11',
    String(sunflowerKids.length + rainbowKids.length),
    true,
  );

  await expectError(
    'Đăng ký vào lớp ẩn (joinVisible=false)',
    null,
    'POST',
    '/auth/register',
    { email: `hs.x@${DOMAIN}`, password: PASSWORD, displayName: 'X', classId: star.id },
    400,
    'CLASS_NOT_JOINABLE',
  );
  await expectError(
    'Đăng ký vào lớp đã lưu trữ',
    null,
    'POST',
    '/auth/register',
    { email: `hs.y@${DOMAIN}`, password: PASSWORD, displayName: 'Y', classId: oldClass.id },
    400,
    'CLASS_NOT_JOINABLE',
  );
  await expectError(
    'Đăng ký trùng email',
    null,
    'POST',
    '/auth/register',
    { email: an.email, password: PASSWORD, displayName: 'An 2', classId: sunflower.id },
    409,
    'EMAIL_TAKEN',
  );
  await expectError(
    'Đăng nhập sai mật khẩu',
    null,
    'POST',
    '/auth/login',
    { email: an.email, password: 'sai-mat-khau' },
    401,
    'INVALID_CREDENTIALS',
  );

  // ------------------------------------------------------------ 3. Catalog game
  section('3. Catalog game');
  await ok(admin, 'PATCH', '/admin/games/phonics-ocean', { price: 50 });
  await ok(admin, 'PATCH', '/admin/games/english-explorers', { enabled: false });
  check('Admin đặt giá phonics-ocean = 50 kim cương, tắt english-explorers', 'OK', 'OK', true);

  // ------------------------------------------------------------ 4. Ván game → điểm → xếp hạng
  section('4. Chơi game, quy đổi điểm');
  const anRounds = [
    { gameId: 'bread-catcher', correct: 8, total: 10 },
    { gameId: 'bread-catcher', correct: 14, total: 15 },
    { gameId: 'food-stream', correct: 5, total: 10 },
  ];
  const anPts: number[] = [];
  for (const r of anRounds) anPts.push((await play(an, r)).data.pointsAwarded);
  check(
    'An: 8/10, 14/15, 5/10 → điểm = min(10, số đúng)',
    '8, 10, 5',
    anPts.join(', '),
    anPts.join() === '8,10,5',
  );

  const binhPts: Json[] = [];
  for (let i = 0; i < 7; i++) {
    const r = await play(binh, {
      gameId: 'bread-catcher',
      correct: 10,
      total: 10,
      levelId: `level-${i + 1}`,
    });
    binhPts.push(`${r.data.pointsAwarded}${r.data.pointsReason ? `(${r.data.pointsReason})` : ''}`);
  }
  check(
    'Bình: 7 ván 10/10 trong ngày → trần 60 điểm / ngày',
    '10 ×6, ván 7 = 0(DAILY_CAP)',
    binhPts.join(', '),
    binhPts.slice(0, 6).every((p) => p === '10') && binhPts[6] === '0(DAILY_CAP)',
  );

  const locked = await play(chi, { gameId: 'phonics-ocean', correct: 9, total: 12 });
  check(
    'Chi chơi phonics-ocean khi chưa mở khoá',
    '0 điểm, GAME_LOCKED',
    `${locked.data.pointsAwarded} ${locked.data.pointsReason}`,
    locked.data.pointsAwarded === 0 && locked.data.pointsReason === 'GAME_LOCKED',
  );
  const unlock = await ok(chi, 'POST', '/me/games/phonics-ocean/unlock', { gemsSpent: 50 });
  check(
    'Chi mở khoá phonics-ocean bằng 50 kim cương',
    'unlocked, source GEMS',
    `${unlock.unlocked} ${unlock.source}`,
    unlock.unlocked && unlock.source === 'GEMS',
  );
  const afterUnlock = await play(chi, { gameId: 'phonics-ocean', correct: 9, total: 12 });
  check(
    'Chi chơi lại phonics-ocean sau khi mở khoá',
    '9 điểm',
    afterUnlock.data.pointsAwarded,
    afterUnlock.data.pointsAwarded === 9,
  );
  await play(chi, { gameId: 'bread-catcher', correct: 6, total: 10 });

  const disabled = await play(giang, { gameId: 'english-explorers', correct: 7, total: 10 });
  check(
    'Giang chơi game đang tắt (english-explorers)',
    '0 điểm, GAME_DISABLED',
    `${disabled.data.pointsAwarded} ${disabled.data.pointsReason}`,
    disabled.data.pointsAwarded === 0 && disabled.data.pointsReason === 'GAME_DISABLED',
  );
  await play(giang, { gameId: 'bread-catcher', correct: 7, total: 10 });

  const sessionId = randomUUID();
  const first = await play(ha, { gameId: 'food-stream', correct: 6, total: 8, clientSessionId: sessionId });
  const dup = await play(ha, { gameId: 'food-stream', correct: 6, total: 8, clientSessionId: sessionId });
  check(
    'Hà gửi lại cùng clientSessionId (đồng bộ offline lặp)',
    'lần 2: duplicate=true, cùng resultId, không cộng thêm',
    `status ${dup.status}, duplicate=${dup.data.duplicate}, tổng=${dup.data.totals?.all}`,
    dup.data.duplicate === true &&
      dup.data.resultId === first.data.resultId &&
      dup.data.totals.all === first.data.totals.all,
  );

  await expectError(
    'Khang gửi kết quả bất hợp lý (total 61 > maxTotal 60)',
    khang,
    'POST',
    '/game/results',
    {
      clientSessionId: randomUUID(),
      gameId: 'bread-catcher',
      mode: 'solo',
      levelId: 'level-1',
      correct: 61,
      total: 61,
      score: 100,
      endedBy: 'completed',
      playedAt: iso(-MIN),
      details: {},
    },
    400,
    'RESULT_IMPLAUSIBLE',
  );
  await expectError(
    'Khang gửi playedAt quá 24h',
    khang,
    'POST',
    '/game/results',
    {
      clientSessionId: randomUUID(),
      gameId: 'bread-catcher',
      mode: 'solo',
      levelId: 'level-1',
      correct: 5,
      total: 10,
      score: 500,
      endedBy: 'completed',
      playedAt: iso(-2 * DAY),
      details: {},
    },
    400,
    'PLAYED_AT_OUT_OF_RANGE',
  );
  await play(khang, { gameId: 'bread-catcher', correct: 4, total: 10 });
  await play(khang, { gameId: 'odd-one-out', correct: 6, total: 8 });
  await play(manh, { gameId: 'food-stream', correct: 9, total: 10 });
  await play(linh, { gameId: 'odd-one-out', correct: 3, total: 8 });
  await play(dung, { gameId: 'bread-catcher', correct: 3, total: 10, playedAt: iso(-20 * HOUR) });
  await play(phuc, { gameId: 'food-stream', correct: 7, total: 10 });

  await ok(admin, 'PATCH', '/admin/games/english-explorers', { enabled: true });
  console.log('  (đã bật lại english-explorers để app game dùng bình thường)');

  // Sự kiện xem / chơi (thống kê game): ẩn danh + đã đăng nhập
  const evClient = randomUUID();
  const evs = ['bread-catcher', 'food-stream', 'phonics-ocean', 'odd-one-out', 'english-explorers'].flatMap(
    (gameId, i) => [
      { gameId, type: 'VIEW', occurredAt: iso(-(i + 1) * HOUR) },
      { gameId, type: 'VIEW', occurredAt: iso(-(i + 1) * HOUR - 30 * MIN) },
      { gameId, type: 'PLAY', mode: 'solo', occurredAt: iso(-(i + 1) * HOUR + 5 * MIN) },
    ],
  );
  const evRes = await ok(null, 'POST', '/public/events', { clientId: evClient, events: evs });
  const evDup = await ok(null, 'POST', '/public/events', { clientId: evClient, events: evs.slice(0, 3) });
  check(
    'Gửi 15 sự kiện ẩn danh, gửi lại 3 sự kiện trùng',
    'accepted 15; lần 2 duplicates 3',
    `accepted ${evRes.accepted}; lần 2 duplicates ${evDup.duplicates}`,
    evRes.accepted === 15 && evDup.duplicates === 3,
  );

  // ------------------------------------------------------------ 5. Điểm thưởng, phạm vi, mở khoá
  section('5. Điểm thưởng, phạm vi lớp, mở khoá game');
  const bonus = await ok(lan, 'POST', `/classes/${sunflower.id}/points/bonus`, {
    studentId: en.id,
    points: 15,
    note: 'Phát biểu xây dựng bài',
  });
  check(
    'Cô Lan thưởng Én +15 → Én lên hạng',
    'hạng hiện tại < hạng trước',
    bonus.rank,
    bonus.rank.previous === null || bonus.rank.current < bonus.rank.previous,
  );
  const batch = await ok(lan, 'POST', `/classes/${sunflower.id}/points/bonus/batch`, {
    entries: sunflowerKids.map((s) => ({ studentId: s.id, points: 2, note: 'Cả lớp giữ trật tự' })),
  });
  check(
    'Cô Lan thưởng cả lớp Sunflower +2 (batch)',
    '6 bút toán',
    batch.entries.length,
    batch.entries.length === 6,
  );
  await expectError(
    'Cô Lan trừ điểm (-3) khi không có points.revoke',
    lan,
    'POST',
    `/classes/${sunflower.id}/points/bonus`,
    { studentId: binh.id, points: -3, note: 'Trừ điểm' },
    403,
  );
  const minus = await ok(admin, 'POST', `/classes/${sunflower.id}/points/bonus`, {
    studentId: binh.id,
    points: -3,
    note: 'Sửa điểm: chơi hộ bạn',
  });
  check('Admin trừ Bình -3 (bút toán âm)', 'points = -3', minus.entry.points, minus.entry.points === -3);
  await expectError(
    'Thầy Minh thưởng điểm cho lớp Star (không dạy)',
    minh,
    'POST',
    `/classes/${star.id}/points/bonus`,
    { studentId: an.id, points: 1, note: 'x' },
    403,
    'FORBIDDEN_SCOPE',
  );
  await ok(minh, 'POST', `/classes/${rainbow.id}/points/bonus`, {
    studentId: linh.id,
    points: 5,
    note: 'Tiến bộ nhanh',
    gameId: 'odd-one-out',
  });

  const classUnlock = await ok(lan, 'POST', `/classes/${sunflower.id}/games/phonics-ocean/unlock`, {
    classId: sunflower.id,
    note: 'Thưởng cả lớp',
  });
  check(
    'Cô Lan mở khoá phonics-ocean cho cả lớp Sunflower',
    'unlocked 5, alreadyUnlocked 1 (Chi)',
    classUnlock,
    classUnlock.unlocked === 5 && classUnlock.alreadyUnlocked === 1,
  );
  await expectError(
    'Thầy Minh mở khoá game (không có games.unlock)',
    minh,
    'POST',
    `/classes/${rainbow.id}/games/phonics-ocean/unlock`,
    { classId: rainbow.id },
    403,
  );
  await ok(admin, 'PUT', `/students/${binh.id}/games/phonics-ocean`, {
    unlocked: false,
    note: 'QA: thu hồi',
  });
  await expectError(
    'Bình tự mở khoá lại game đã bị admin thu hồi',
    binh,
    'POST',
    '/me/games/phonics-ocean/unlock',
    { gemsSpent: 50 },
    403,
  );

  // ------------------------------------------------------------ 6. Quản lý học sinh
  section('6. Quản lý học sinh');
  await expectError(
    'Thầy Minh chuyển lớp học sinh (không có class.changeStudentClass)',
    minh,
    'POST',
    `/students/${manh.id}/move-class`,
    { classId: sunflower.id },
    403,
  );
  const moved = await ok(lan, 'POST', `/students/${phuc.id}/move-class`, {
    classId: star.id,
    note: 'Chuyển xuống K1 theo đề nghị phụ huynh',
  });
  check(
    'Cô Lan chuyển Phúc Sunflower → Star (điểm đi theo học sinh)',
    'class = QA-K1 Star',
    moved.class?.name ?? moved.currentClass?.name ?? JSON.stringify(moved).slice(0, 80),
    JSON.stringify(moved).includes(star.id),
  );
  const minhSeesParent = await ok(minh, 'GET', `/students/${an.id}`);
  check(
    'Thầy Minh xem học sinh: không thấy liên hệ phụ huynh',
    'parent = null',
    minhSeesParent.parent ?? null,
    !minhSeesParent.parent,
  );
  const lanSeesParent = await ok(lan, 'GET', `/students/${an.id}`);
  check(
    'Cô Lan (nhóm chủ nhiệm) xem được liên hệ phụ huynh',
    'có parent',
    lanSeesParent.parent?.name ?? null,
    Boolean(lanSeesParent.parent?.name),
  );
  await ok(admin, 'PATCH', `/students/${linh.id}`, { status: 'DISABLED' });
  await expectError(
    'Linh bị khoá tài khoản → đăng nhập',
    null,
    'POST',
    '/auth/login',
    { email: linh.email, password: PASSWORD },
    403,
    'ACCOUNT_DISABLED',
  );
  await ok(admin, 'POST', `/students/${manh.id}/reset-password`, { newPassword: PASSWORD });
  await expectError(
    'Mạnh đăng nhập bằng mật khẩu cũ sau khi admin reset',
    null,
    'POST',
    '/auth/login',
    { email: manh.email, password: MANH_OLD_PASSWORD },
    401,
    'INVALID_CREDENTIALS',
  );
  manh.password = PASSWORD;
  await login(manh);
  check('Mạnh đăng nhập bằng mật khẩu mới', 'OK', 'OK', true);

  // ------------------------------------------------------------ 7. Ngân hàng câu hỏi + phiếu
  section('7. Câu hỏi và phiếu bài tập');
  const sunImg = await uploadMedia(lan, 'IMAGE', 'image/png', 'sun.png', solidPng(64, 64, [255, 200, 0]), {
    width: 64,
    height: 64,
  });
  const q = async (body: Json, publish = true) => {
    const created = await ok(lan, 'POST', '/questions', { tags: ['qa', 'week-10'], ...body });
    return publish ? ok(lan, 'POST', `/questions/${created.id}/publish`) : created;
  };
  const qMc = await q({
    type: 'MULTIPLE_CHOICE',
    instruction: 'Circle the word with short a.',
    instructionVi: 'Khoanh từ có âm a ngắn',
    config: {
      type: 'MULTIPLE_CHOICE',
      prompt: 'Which word has short a?',
      options: [
        { id: 'a', text: 'cat' },
        { id: 'b', text: 'pig' },
        { id: 'c', text: 'dog' },
      ],
    },
    answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
  });
  const qOrder = await q({
    type: 'WORD_ORDER',
    instruction: 'Put the words in order.',
    config: { type: 'WORD_ORDER', words: ['a', 'I', 'cat', 'see'], endPunctuation: '.' },
    answerKey: { type: 'WORD_ORDER', accepted: [[1, 3, 0, 2]] },
  });
  const qFill = await q({
    type: 'FILL_BLANK_WORD_BANK',
    instruction: 'Choose a word from the box.',
    points: 2,
    config: {
      type: 'FILL_BLANK_WORD_BANK',
      wordBank: ['hat', 'map', 'bag'],
      sentences: [
        { id: 's1', text: 'The ___ is red.' },
        { id: 's2', text: 'Look at the ___.' },
      ],
    },
    answerKey: {
      type: 'FILL_BLANK_WORD_BANK',
      blanks: [
        { sentenceId: 's1', index: 0, word: 'hat' },
        { sentenceId: 's2', index: 0, word: 'map' },
      ],
    },
  });
  const qInline = await q({
    type: 'INLINE_CHOICE',
    instruction: 'Choose the right word.',
    points: 2,
    config: {
      type: 'INLINE_CHOICE',
      text: 'Sam has a {{b1}}. It is {{b2}}.',
      blanks: [
        { id: 'b1', options: ['cat', 'cut'] },
        { id: 'b2', options: ['fat', 'fit'] },
      ],
    },
    answerKey: {
      type: 'INLINE_CHOICE',
      picks: [
        { blankId: 'b1', option: 'cat' },
        { blankId: 'b2', option: 'fat' },
      ],
    },
  });
  const qUns = await q({
    type: 'UNSCRAMBLE_WORD',
    instruction: 'Look at the picture. Unscramble the word.',
    config: { type: 'UNSCRAMBLE_WORD', imageMediaId: sunImg.id, scrambled: 'nus' },
    answerKey: { type: 'UNSCRAMBLE_WORD', word: 'sun', accepted: [] },
  });
  const qSpeak = await q({
    type: 'SPEAK',
    instruction: 'Say the words.',
    points: 3,
    config: { type: 'SPEAK', prompt: 'Say: sun, sock, sad' },
    answerKey: { type: 'SPEAK', rubric: 'Âm /s/ đầu từ rõ, đủ 3 từ' },
  });
  const qDraft = await q(
    {
      type: 'MULTIPLE_CHOICE',
      instruction: 'Circle the word with s.',
      config: {
        type: 'MULTIPLE_CHOICE',
        options: [
          { id: 'a', text: 'sit' },
          { id: 'b', text: 'map' },
        ],
      },
      answerKey: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
      visibility: 'PRIVATE',
    },
    false,
  );
  check(
    'Cô Lan tạo 7 câu hỏi (6 PUBLISHED, 1 DRAFT PRIVATE), 1 câu có ảnh upload',
    '6 PUBLISHED + 1 DRAFT',
    `${[qMc, qOrder, qFill, qInline, qUns, qSpeak].filter((x) => x.status === 'PUBLISHED').length} PUBLISHED + ${qDraft.status}`,
    qDraft.status === 'DRAFT',
  );

  const mkWorksheet = async (meta: Json, sections: Json[]) => {
    const w = await ok(lan, 'POST', '/worksheets', meta);
    return ok(lan, 'PUT', `/worksheets/${w.id}/structure`, { sections });
  };
  let wsA = await mkWorksheet(
    {
      title: 'QA · Short a Review',
      subject: 'PHONICS',
      topic: 'Short a',
      grade: 'K3',
      week: 10,
      day: 1,
      kind: 'WORKSHEET',
    },
    [
      {
        title: 'Part 1',
        instruction: 'Look and circle. Then put the words in order.',
        items: [{ questionId: qMc.id }, { questionId: qOrder.id }],
      },
      {
        title: 'Part 2',
        instruction: 'Complete the sentences.',
        items: [{ questionId: qFill.id }, { questionId: qInline.id }],
      },
    ],
  );
  wsA = await ok(lan, 'POST', `/worksheets/${wsA.id}/publish`);
  let wsS = await mkWorksheet(
    {
      title: 'QA · Letter Ss (có phần nói)',
      subject: 'PHONICS',
      topic: 'Letter Ss',
      grade: 'K3',
      week: 10,
      day: 2,
      kind: 'HANDOUT',
    },
    [
      { title: 'Part 1', instruction: 'Unscramble.', items: [{ questionId: qUns.id }] },
      { title: 'Part 2', instruction: 'Listen and say.', items: [{ questionId: qSpeak.id }] },
    ],
  );
  wsS = await ok(lan, 'POST', `/worksheets/${wsS.id}/publish`);
  const wsDraft = await mkWorksheet(
    { title: 'QA · Nháp (chứa câu chưa phát hành)', topic: 'Letter Ss', grade: 'K3', week: 11, day: 1 },
    [{ title: 'Part 1', items: [{ questionId: qDraft.id }] }],
  );
  await expectError(
    'Phát hành phiếu chứa câu DRAFT',
    lan,
    'POST',
    `/worksheets/${wsDraft.id}/publish`,
    undefined,
    409,
    'QUESTION_NOT_PUBLISHED',
  );
  await expectError(
    'Lưu trữ câu hỏi đang dùng trong phiếu đã phát hành',
    lan,
    'POST',
    `/questions/${qMc.id}/archive`,
    undefined,
    409,
    'WORKSHEET_IN_USE',
  );
  await expectError(
    'Thầy Minh sửa câu hỏi của Cô Lan',
    minh,
    'PATCH',
    `/questions/${qMc.id}`,
    { instruction: 'Hacked' },
    403,
  );

  const items = (ws: Json) =>
    Object.fromEntries(ws.sections.flatMap((s: Json) => s.items.map((it: Json) => [it.question.id, it.id])));
  const itA = items(wsA);
  const itS = items(wsS);
  check(
    'Phiếu "Short a Review": 4 câu, tổng điểm 6',
    '6',
    wsA.sections.flatMap((s: Json) => s.items).reduce((n: number, it: Json) => n + it.points, 0),
    true,
  );

  // ------------------------------------------------------------ 8. Giao bài
  section('8. Giao bài');
  const assign = (a: Actor, body: Json) => ok(a, 'POST', '/assignments', body);
  const asA = await assign(lan, {
    worksheetId: wsA.id,
    classId: sunflower.id,
    scheduledFor: vnDate(0),
    availableFrom: iso(-2 * HOUR),
    dueAt: iso(3 * DAY),
    maxAttempts: 2,
    showAnswersAfterSubmit: true,
  });
  const asS = await assign(lan, {
    worksheetId: wsS.id,
    classId: sunflower.id,
    scheduledFor: vnDate(0),
    availableFrom: iso(-HOUR),
    dueAt: iso(2 * DAY),
  });
  const asFuture = await assign(minh, {
    worksheetId: wsA.id,
    classId: rainbow.id,
    scheduledFor: vnDate(3),
    availableFrom: iso(3 * DAY),
    dueAt: iso(5 * DAY),
  });
  const asLate = await assign(minh, {
    worksheetId: wsA.id,
    classId: rainbow.id,
    scheduledFor: vnDate(-3),
    availableFrom: iso(-3 * DAY),
    dueAt: iso(-DAY),
    allowLate: true,
  });
  const asClosed = await assign(minh, {
    worksheetId: wsS.id,
    classId: rainbow.id,
    scheduledFor: vnDate(-2),
    availableFrom: iso(-2 * DAY),
    dueAt: iso(-HOUR),
  });
  check(
    'Trạng thái bài giao',
    'A/S: OPEN; tương lai: SCHEDULED',
    `A=${asA.status}, S=${asS.status}, future=${asFuture.status}, late=${asLate.status}, closed=${asClosed.status}`,
    asA.status === 'OPEN' && asS.status === 'OPEN' && asFuture.status === 'SCHEDULED',
  );
  await expectError(
    'Thầy Minh giao bài cho lớp Star (không dạy)',
    minh,
    'POST',
    '/assignments',
    { worksheetId: wsA.id, classId: star.id, scheduledFor: vnDate(0) },
    403,
    'FORBIDDEN_SCOPE',
  );
  await expectError(
    'Giao phiếu chưa phát hành',
    lan,
    'POST',
    '/assignments',
    { worksheetId: wsDraft.id, classId: sunflower.id, scheduledFor: vnDate(0) },
    409,
    'WORKSHEET_NOT_PUBLISHED',
  );
  await expectError(
    'Học sinh Rainbow mở bài SCHEDULED',
    giang,
    'GET',
    `/me/assignments/${asFuture.id}`,
    undefined,
    404,
  );

  // ------------------------------------------------------------ 9. Học sinh làm bài
  section('9. Làm bài, chấm tự động');
  const ansA = (v: 'right' | 'half' | 'wrong') => [
    {
      worksheetItemId: itA[qMc.id],
      answer: { type: 'MULTIPLE_CHOICE', optionId: v === 'wrong' ? 'b' : 'a' },
    },
    {
      worksheetItemId: itA[qOrder.id],
      answer: { type: 'WORD_ORDER', order: v === 'right' ? [1, 3, 0, 2] : [0, 1, 2, 3] },
    },
    {
      worksheetItemId: itA[qFill.id],
      answer: {
        type: 'FILL_BLANK_WORD_BANK',
        blanks: [
          { sentenceId: 's1', index: 0, word: v === 'wrong' ? 'bag' : 'hat' },
          { sentenceId: 's2', index: 0, word: v === 'right' ? 'map' : 'bag' },
        ],
      },
    },
    {
      worksheetItemId: itA[qInline.id],
      answer: {
        type: 'INLINE_CHOICE',
        picks: [
          { blankId: 'b1', option: v === 'wrong' ? 'cut' : 'cat' },
          { blankId: 'b2', option: v === 'right' ? 'fat' : 'fit' },
        ],
      },
    },
  ];
  const doAttempt = async (s: Actor, assignmentId: string, answers: Json[], submit = true) => {
    const sub = await ok(s, 'POST', `/me/assignments/${assignmentId}/submissions`);
    const sid = sub.id ?? sub.submission?.id;
    await ok(s, 'PUT', `/me/submissions/${sid}/answers`, { answers });
    return { id: sid, result: submit ? await ok(s, 'POST', `/me/submissions/${sid}/submit`) : null };
  };
  const score = (r: Json) =>
    `${r.submission.totalScore ?? r.submission.autoScore}/${r.submission.maxScore} ${r.submission.status}`;

  const anA = await doAttempt(an, asA.id, ansA('right'));
  check(
    'An làm đúng hết phiếu tự chấm → GRADED ngay, có hạng',
    '6/6 GRADED, rank 1',
    `${score(anA.result)}, rank ${anA.result.rank?.rank}`,
    anA.result.submission.totalScore === 6 && anA.result.submission.status === 'GRADED',
  );
  const binhA1 = await doAttempt(binh, asA.id, ansA('half'));
  const binhA2 = await doAttempt(binh, asA.id, ansA('right'));
  check(
    'Bình làm 2 lần (maxAttempts=2): lần 1 một phần, lần 2 đúng hết',
    'lần 1 < 6, lần 2 = 6',
    `${score(binhA1.result)} → ${score(binhA2.result)}`,
    binhA1.result.submission.totalScore < 6 && binhA2.result.submission.totalScore === 6,
  );
  await expectError(
    'Bình bắt đầu lần thứ 3',
    binh,
    'POST',
    `/me/assignments/${asA.id}/submissions`,
    undefined,
    409,
    'ATTEMPTS_EXHAUSTED',
  );
  const chiA = await doAttempt(chi, asA.id, ansA('wrong'));
  check('Chi làm sai hết', '0/6 GRADED', score(chiA.result), chiA.result.submission.totalScore === 0);
  const anMine = await ok(an, 'GET', `/me/submissions/${anA.id}`);
  const keysShown = anMine.answers.filter((x: Json) => x.answerKey).length;
  check(
    'An xem lại bài đã chấm: thấy đáp án vì showAnswersAfterSubmit=true',
    '4/4 câu có answerKey',
    `${keysShown}/${anMine.answers.length}`,
    keysShown === 4,
  );
  const dungA = await doAttempt(dung, asA.id, ansA('half').slice(0, 2), false);
  check(
    'Dũng đang làm dở (autosave 2 câu, chưa nộp)',
    'IN_PROGRESS',
    dungA.id ? 'IN_PROGRESS' : '?',
    Boolean(dungA.id),
  );

  section('10. Bài có câu chấm tay, nhận xét');
  const recording = await uploadMedia(an, 'AUDIO', 'audio/wav', 'an-speak.wav', beepWav(1200), {
    durationMs: 1200,
  });
  const ansS = (s: Actor, word: string, rec?: string) => [
    { worksheetItemId: itS[qUns.id], answer: { type: 'UNSCRAMBLE_WORD', word } },
    { worksheetItemId: itS[qSpeak.id], answer: { type: 'SPEAK', ...(rec && { recordingMediaId: rec }) } },
  ];
  const anS = await doAttempt(an, asS.id, ansS(an, 'sun', recording.id));
  const chiRec = await uploadMedia(chi, 'AUDIO', 'audio/wav', 'chi-speak.wav', beepWav(800), {
    durationMs: 800,
  });
  const chiS = await doAttempt(chi, asS.id, ansS(chi, 'sun', chiRec.id));
  const binhS = await doAttempt(binh, asS.id, ansS(binh, 'nus'));
  check(
    'Nộp bài có câu SPEAK → SUBMITTED chờ GV chấm',
    'SUBMITTED ×3',
    [anS, chiS, binhS].map((x) => x.result.submission.status).join(', '),
    [anS, chiS, binhS].every((x) => x.result.submission.status === 'SUBMITTED'),
  );
  await expectError(
    'Chốt điểm khi chưa chấm câu SPEAK',
    lan,
    'PUT',
    `/submissions/${anS.id}/grade`,
    { items: [], finalize: true },
    409,
    'GRADING_INCOMPLETE',
  );
  await expectError(
    'Chấm vượt điểm tối đa câu (4 > 3)',
    lan,
    'PUT',
    `/submissions/${anS.id}/grade`,
    { items: [{ worksheetItemId: itS[qSpeak.id], manualScore: 4 }], finalize: true },
    400,
  );
  const anSMine = await ok(an, 'GET', `/me/submissions/${anS.id}`);
  check(
    'Bài Letter Ss (showAnswersAfterSubmit=false): học sinh không thấy đáp án',
    '0 câu có answerKey',
    `${anSMine.answers.filter((x: Json) => x.answerKey).length}`,
    anSMine.answers.every((x: Json) => !x.answerKey),
  );
  const anGraded = await ok(lan, 'PUT', `/submissions/${anS.id}/grade`, {
    items: [{ worksheetItemId: itS[qSpeak.id], manualScore: 3, teacherNote: 'Rất rõ!' }],
    finalize: true,
  });
  check(
    'Cô Lan chấm An 3/3 câu nói và chốt',
    '4/4 GRADED',
    `${anGraded.totalScore ?? anGraded.submission?.totalScore}/${anGraded.maxScore ?? anGraded.submission?.maxScore} ${anGraded.status ?? anGraded.submission?.status}`,
    (anGraded.totalScore ?? anGraded.submission?.totalScore) === 4,
  );
  const chiGraded = await ok(lan, 'PUT', `/submissions/${chiS.id}/grade`, {
    items: [{ worksheetItemId: itS[qSpeak.id], manualScore: 1.5, teacherNote: 'Âm /s/ chưa rõ ở từ "sock"' }],
    finalize: true,
  });
  check(
    'Cô Lan chấm Chi 1.5/3 (điểm lẻ 0.25)',
    '2.5/4 GRADED',
    `${chiGraded.totalScore ?? chiGraded.submission?.totalScore}/4`,
    (chiGraded.totalScore ?? chiGraded.submission?.totalScore) === 2.5,
  );
  const cmt = await ok(lan, 'POST', `/submissions/${chiS.id}/comments`, {
    body: 'Con luyện lại âm /s/ trong từ sock nhé, cô gửi file mẫu trên lớp.',
    worksheetItemId: itS[qSpeak.id],
  });
  await ok(chi, 'POST', `/me/submissions/${chiS.id}/comments`, {
    body: 'Dạ con cảm ơn cô, con sẽ luyện thêm ạ.',
    parentId: cmt.id,
  });
  await expectError(
    'Học sinh tạo nhận xét gốc (không có parentId)',
    chi,
    'POST',
    `/me/submissions/${chiS.id}/comments`,
    { body: 'abc' },
    400,
  );
  await ok(lan, 'POST', `/submissions/${anS.id}/comments`, { body: 'Giỏi lắm An!' });
  check(
    'Bình (SUBMITTED) để lại chờ chấm → hiện ở "chờ chấm"',
    'SUBMITTED',
    binhS.result.submission.status,
    binhS.result.submission.status === 'SUBMITTED',
  );

  section('11. Bài trễ hạn / đã đóng');
  const lateSub = await doAttempt(giang, asLate.id, ansA('right'));
  check(
    'Giang nộp bài quá hạn (allowLate=true) → late=true',
    'late=true',
    `late=${lateSub.result.submission.late}`,
    lateSub.result.submission.late === true,
  );
  await expectError(
    'Hà làm bài đã quá hạn (allowLate=false)',
    ha,
    'POST',
    `/me/assignments/${asClosed.id}/submissions`,
    undefined,
    409,
    'ASSIGNMENT_NOT_OPEN',
  );
  await expectError(
    'Xoá bài giao đã có bài nộp',
    lan,
    'DELETE',
    `/assignments/${asA.id}`,
    undefined,
    409,
    'CONFLICT',
  );

  // ------------------------------------------------------------ 12. Thông báo, báo cáo, thống kê
  section('12. Thông báo, báo cáo, thống kê');
  const notifTypes = async (s: Actor) => {
    const n = await ok(s, 'GET', '/me/notifications?pageSize=50');
    return [...new Set(n.items.map((x: Json) => x.type))].sort();
  };
  const chiN = await notifTypes(chi);
  check(
    'Thông báo của Chi',
    'có ASSIGNMENT_NEW, SUBMISSION_GRADED, COMMENT_REPLY, BONUS_AWARDED (không có GAME_UNLOCKED vì Chi tự mở khoá trước)',
    chiN,
    ['ASSIGNMENT_NEW', 'SUBMISSION_GRADED', 'COMMENT_REPLY', 'BONUS_AWARDED'].every((t) => chiN.includes(t)),
  );
  const phucN = await notifTypes(phuc);
  check('Thông báo của Phúc', 'có CLASS_CHANGED', phucN, phucN.includes('CLASS_CHANGED'));
  const enN = await notifTypes(en);
  check(
    'Thông báo của Én',
    'có BONUS_AWARDED, RANK_CHANGED',
    enN,
    enN.includes('BONUS_AWARDED') && enN.includes('RANK_CHANGED'),
  );

  const xlsx = await http(lan, 'GET', `/reports/classes/${sunflower.id}/ranking.xlsx`);
  check(
    'Cô Lan xuất bảng xếp hạng xlsx',
    '200 + file',
    `${xlsx.status} ${xlsx.data?.bytes ?? ''} bytes`,
    xlsx.status === 200,
  );
  await expectError(
    'Thầy Minh xuất báo cáo (bị REVOKE reports.export)',
    minh,
    'GET',
    `/reports/classes/${rainbow.id}/ranking.xlsx`,
    undefined,
    403,
  );
  const dash = await ok(lan, 'GET', '/assignments/dashboard');
  check(
    'Dashboard bài tập của Cô Lan',
    'openCount 2, pendingGrading 1 (bài của Bình)',
    `openCount ${dash.openCount}, pendingGrading ${dash.pendingGrading}`,
    dash.openCount === 2 && dash.pendingGrading === 1,
  );

  // ------------------------------------------------------------ Tổng hợp để verify trên UI
  const rankSun = await ok(lan, 'GET', `/classes/${sunflower.id}/ranking?range=all`);
  const rankRain = await ok(minh, 'GET', `/classes/${rainbow.id}/ranking?range=all`);
  const rankStar = await ok(lan, 'GET', `/classes/${star.id}/ranking?range=all`);
  const rosterA = await ok(lan, 'GET', `/assignments/${asA.id}/submissions`);
  const rosterS = await ok(lan, 'GET', `/assignments/${asS.id}/submissions`);
  const audit = await ok(admin, 'GET', '/admin/audit?pageSize=100');
  await sleep(1500);
  const current = Object.fromEntries(
    (await ok(admin, 'GET', '/assignments?pageSize=100')).items.map((x: Json) => [x.id, x.status]),
  );
  const closedNow = current[asClosed.id];
  check(
    'Scheduler đóng bài quá hạn không cho trễ; bài cho trễ vẫn mở',
    'closed=CLOSED, late=OPEN',
    `closed=${closedNow}, late=${current[asLate.id]}`,
    closedNow === 'CLOSED' && current[asLate.id] === 'OPEN',
  );

  writeReport({
    classes: { sunflower, rainbow, star, oldClass },
    rankings: [rankSun, rankRain, rankStar],
    rosters: [
      ['QA · Short a Review → Sunflower (2 lần làm, hiện đáp án)', rosterA],
      ['QA · Letter Ss → Sunflower (có câu nói, chấm tay)', rosterS],
    ],
    assignments: { asA, asS, asFuture, asLate, asClosed },
    current,
    auditTotal: audit.total,
  });

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} kiểm tra PASS. Báo cáo: ${REPORT_PATH}`);
  if (failed.length) process.exitCode = 1;
}

// ---------------------------------------------------------------- Báo cáo markdown

function writeReport(ctx: Json) {
  const L: string[] = [];
  const now = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  L.push('# Dữ liệu test QA (sinh bởi `scripts/qa-seed.ts`)', '');
  L.push(
    `Sinh lúc ${now} (${TZ}) qua API \`${API}\`. Mọi dữ liệu tạo qua HTTP API nên đã đi qua đủ luật nghiệp vụ.`,
    '',
  );
  L.push(
    '> Lưu ý: ván game / sự kiện chỉ nhận `playedAt` trong 24 giờ, "hôm nay / tuần" tính theo giờ VN — xem bảng xếp hạng với `range=all` nếu chạy script từ hôm trước.',
    '',
  );
  L.push('## Tài khoản', '');
  L.push('| Vai trò | Email | Mật khẩu | Ghi chú |', '| --- | --- | --- | --- |');
  L.push(`| ADMIN | ${ADMIN_EMAIL} | (ADMIN_PASSWORD trong .env) | |`);
  L.push(
    `| TEACHER | gv.lan@${DOMAIN} | ${PASSWORD} | dạy Sunflower, Star, Old; nhóm "Giáo viên chủ nhiệm" (chuyển lớp, xem phụ huynh, mở khoá game) |`,
  );
  L.push(
    `| TEACHER | gv.minh@${DOMAIN} | ${PASSWORD} | dạy Sunflower, Rainbow; bị REVOKE \`reports.export\` |`,
  );
  L.push(`| TEACHER | gv.nghi@${DOMAIN} | ${PASSWORD} | DISABLED → không đăng nhập được |`);
  const kids: [string, string, string][] = [
    ['hs.an', 'Sunflower', 'phụ huynh có SĐT + email; điểm phiếu cao nhất'],
    ['hs.binh', 'Sunflower', 'chạm trần 60 điểm / ngày; bị trừ -3; bị thu hồi phonics-ocean'],
    ['hs.chi', 'Sunflower', 'tự mở khoá phonics-ocean bằng kim cương; có nhận xét + trả lời'],
    ['hs.dung', 'Sunflower', 'đang làm dở phiếu Short a'],
    ['hs.en', 'Sunflower', 'được thưởng +15, chưa làm phiếu (MISSING)'],
    ['hs.phuc', 'Star (chuyển từ Sunflower)', 'nhận CLASS_CHANGED; điểm cũ đi theo'],
    ['hs.giang', 'Rainbow', 'chơi game đang tắt (0 điểm); nộp bài trễ hạn'],
    ['hs.ha', 'Rainbow', 'gửi trùng ván game (duplicate)'],
    ['hs.khang', 'Rainbow', 'gửi kết quả bất hợp lý (bị từ chối)'],
    ['hs.linh', 'Rainbow', 'DISABLED → không đăng nhập được'],
    ['hs.manh', 'Rainbow', 'đăng ký bằng `Old123456`, admin reset về mật khẩu chung'],
  ];
  for (const [k, cls, note] of kids) L.push(`| STUDENT | ${k}@${DOMAIN} | ${PASSWORD} | ${cls} — ${note} |`);
  L.push('');
  L.push(
    'Ngoài ra seed demo (`SEED_DEMO=true`) có sẵn `teacher1@demo.local`, `teacher2@demo.local`, `k2a.student01@demo.local`… mật khẩu `12345678`.',
    '',
  );

  L.push('## Lớp', '', '| Lớp | Khối | Hiện khi đăng ký | Trạng thái |', '| --- | --- | --- | --- |');
  L.push(
    '| QA-K3 Sunflower | K3 | có | hoạt động |',
    '| QA-K3 Rainbow | K3 | có | hoạt động |',
    '| QA-K1 Star | K1 | **không** | hoạt động |',
    '| QA-K2 Old (lưu trữ) | K2 | có | **lưu trữ** |',
    '',
  );

  L.push('## Catalog game sau khi chạy', '');
  L.push('- `phonics-ocean`: giá **50 kim cương** (chưa mở khoá → chơi được nhưng 0 điểm, `GAME_LOCKED`).');
  L.push('- `english-explorers`: bị tắt trong lúc chạy (Giang nhận `GAME_DISABLED`) rồi **bật lại**.', '');

  L.push('## Bảng xếp hạng (tổng điểm mọi thời gian)', '');
  for (const r of ctx.rankings) {
    L.push(`### ${r.className}`, '', '| Hạng | Học sinh | Điểm |', '| --- | --- | --- |');
    for (const it of r.items) L.push(`| ${it.rank} | ${it.displayName} | ${it.points} |`);
    L.push('');
  }

  L.push('## Bài giao', '');
  const a = ctx.assignments;
  const st = (x: Json) => ctx.current[x.id] ?? x.status;
  L.push('| Bài | Lớp | Trạng thái | Kịch bản |', '| --- | --- | --- | --- |');
  L.push(
    `| QA · Short a Review | Sunflower | ${st(a.asA)} | tự chấm, tối đa 2 lần, hiện đáp án sau nộp, hạn +3 ngày |`,
  );
  L.push(
    `| QA · Letter Ss (có phần nói) | Sunflower | ${st(a.asS)} | câu SPEAK chấm tay; An, Chi đã chấm; Bình chờ chấm |`,
  );
  L.push(`| QA · Short a Review | Rainbow | ${st(a.asFuture)} | mở sau 3 ngày → HS chưa thấy |`);
  L.push(
    `| QA · Short a Review | Rainbow | ${st(a.asLate)} | hạn đã qua, allowLate → Giang nộp trễ (late) |`,
  );
  L.push(
    `| QA · Letter Ss (có phần nói) | Rainbow | ${st(a.asClosed)} | hạn đã qua, không cho trễ → HS bị chặn |`,
  );
  L.push('');
  for (const [title, roster] of ctx.rosters) {
    L.push(`### Roster: ${title}`, '', '| Học sinh | Trạng thái | Điểm |', '| --- | --- | --- |');
    for (const row of roster.items ?? roster.rows ?? []) {
      const best = row.best ?? row.latest ?? row.submission ?? row;
      L.push(
        `| ${row.displayName ?? row.student?.displayName} | ${row.status} | ${best.totalScore ?? best.autoScore ?? '—'} |`,
      );
    }
    L.push('');
  }

  L.push('## Kết quả kiểm tra nghiệp vụ', '');
  L.push(
    `**${checks.filter((c) => c.pass).length}/${checks.length} PASS** — audit log hiện có ${ctx.auditTotal} bản ghi.`,
    '',
  );
  let g = '';
  for (const c of checks) {
    if (c.group !== g) {
      g = c.group;
      L.push('', `### ${g}`, '', '| | Kịch bản | Mong đợi | Thực tế |', '| --- | --- | --- | --- |');
    }
    L.push(
      `| ${c.pass ? '✅' : '❌'} | ${c.name} | ${c.expected} | ${c.actual.replace(/\|/g, '\\|').slice(0, 200)} |`,
    );
  }
  L.push('');
  writeFileSync(REPORT_PATH, L.join('\n'));
}

main().catch((e: unknown) => {
  console.error('\n[qa-seed] lỗi:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
