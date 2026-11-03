/**
 * Đường dẫn API (không có prefix). Client ghép `${API_URL}${API_PREFIX}${path}` → `/api/v1/auth/login`.
 * Hàm nhận id để tránh ghép chuỗi tay ở client.
 *
 * Versioning theo URI (ADR 0015): server phục vụ song song nhiều version (`/api/v1`, `/api/v2`...);
 * `API_VERSION` là version mà client trong monorepo đang dùng. Riêng `/api/health` không có version.
 */
import type { ReportFormat } from './reports.js';

export const API_ROOT = '/api';
export const API_VERSION = 'v1';
export const API_PREFIX = `${API_ROOT}/${API_VERSION}`;

export const ENDPOINTS = {
  /** Không có version: `${API_ROOT}/health` */
  health: '/health',
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    google: '/auth/google',
    /** POST: liên kết Google vào tài khoản đang đăng nhập; DELETE: gỡ (cần còn mật khẩu) */
    googleLink: '/auth/google/link',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    changePassword: '/auth/change-password',
    registerFamily: '/auth/register-family',
    profiles: '/auth/profiles',
    switchProfile: '/auth/switch-profile',
    setPassword: '/auth/set-password',
  },
  public: {
    classes: '/public/classes',
    avatars: '/public/avatars',
    games: '/public/games',
    events: '/public/events',
  },
  me: {
    profile: '/me/profile',
    points: '/me/points',
    pointsHistory: '/me/points/history',
    ranking: '/me/class/ranking',
    gameResults: '/me/game-results',
    games: '/me/games',
    unlockGame: (gameId: string) => `/me/games/${gameId}/unlock`,
    notifications: '/me/notifications',
    notificationsRead: '/me/notifications/read',
    // Phiếu bài tập (học sinh)
    assignments: '/me/assignments',
    assignment: (id: string) => `/me/assignments/${id}`,
    assignmentSubmissions: (id: string) => `/me/assignments/${id}/submissions`,
    assignmentRanking: (id: string) => `/me/assignments/${id}/ranking`,
    submission: (id: string) => `/me/submissions/${id}`,
    submissionAnswers: (id: string) => `/me/submissions/${id}/answers`,
    submit: (id: string) => `/me/submissions/${id}/submit`,
    submissionComments: (id: string) => `/me/submissions/${id}/comments`,
    worksheetStats: '/me/worksheet-stats',
    // Tài khoản gia đình (PARENT)
    children: '/me/children',
    child: (id: string) => `/me/children/${id}`,
    guardian: '/me/guardian',
  },
  media: {
    presign: '/media/presign',
    complete: (id: string) => `/media/${id}/complete`,
    detail: (id: string) => `/media/${id}`,
  },
  questions: {
    list: '/questions',
    tags: '/questions/tags',
    detail: (id: string) => `/questions/${id}`,
    publish: (id: string) => `/questions/${id}/publish`,
    archive: (id: string) => `/questions/${id}/archive`,
    duplicate: (id: string) => `/questions/${id}/duplicate`,
  },
  worksheets: {
    list: '/worksheets',
    detail: (id: string) => `/worksheets/${id}`,
    structure: (id: string) => `/worksheets/${id}/structure`,
    publish: (id: string) => `/worksheets/${id}/publish`,
    archive: (id: string) => `/worksheets/${id}/archive`,
    duplicate: (id: string) => `/worksheets/${id}/duplicate`,
  },
  assignments: {
    list: '/assignments',
    dashboard: '/assignments/dashboard',
    detail: (id: string) => `/assignments/${id}`,
    close: (id: string) => `/assignments/${id}/close`,
    reopen: (id: string) => `/assignments/${id}/reopen`,
    submissions: (id: string) => `/assignments/${id}/submissions`,
    ranking: (id: string) => `/assignments/${id}/ranking`,
    stats: (id: string) => `/assignments/${id}/stats`,
  },
  submissions: {
    detail: (id: string) => `/submissions/${id}`,
    grade: (id: string) => `/submissions/${id}/grade`,
    reopen: (id: string) => `/submissions/${id}/reopen`,
    comments: (id: string) => `/submissions/${id}/comments`,
  },
  comments: {
    detail: (id: string) => `/comments/${id}`,
  },
  worksheetStats: {
    classOverview: (id: string) => `/worksheet-stats/classes/${id}/overview`,
    student: (id: string) => `/worksheet-stats/students/${id}`,
  },
  game: {
    results: '/game/results',
  },
  classes: {
    list: '/classes',
    detail: (id: string) => `/classes/${id}`,
    teachers: (id: string) => `/classes/${id}/teachers`,
    students: (id: string) => `/classes/${id}/students`,
    ranking: (id: string) => `/classes/${id}/ranking`,
    points: (id: string) => `/classes/${id}/points`,
    bonus: (id: string) => `/classes/${id}/points/bonus`,
    bonusBatch: (id: string) => `/classes/${id}/points/bonus/batch`,
    unlockGame: (id: string, gameId: string) => `/classes/${id}/games/${gameId}/unlock`,
  },
  students: {
    list: '/students',
    /** POST: tạo học sinh chưa có tài khoản (từ 1.10.0) */
    create: '/students',
    detail: (id: string) => `/students/${id}`,
    moveClass: (id: string) => `/students/${id}/move-class`,
    resetPassword: (id: string) => `/students/${id}/reset-password`,
    deletePreview: (id: string) => `/students/${id}/delete-preview`,
    points: (id: string) => `/students/${id}/points`,
    pointsByGame: (id: string) => `/students/${id}/points/by-game`,
    gameResults: (id: string) => `/students/${id}/game-results`,
    games: (id: string) => `/students/${id}/games`,
    game: (id: string, gameId: string) => `/students/${id}/games/${gameId}`,
    guardians: (id: string) => `/students/${id}/guardians`,
    extra: (id: string) => `/students/${id}/extra`,
    slotAssignments: (id: string) => `/students/${id}/slot-assignments`,
    slotAssignment: (id: string, assignmentId: string) => `/students/${id}/slot-assignments/${assignmentId}`,
    moveSlotAssignment: (id: string, assignmentId: string) =>
      `/students/${id}/slot-assignments/${assignmentId}/move`,
    rates: (id: string) => `/students/${id}/rates`,
    applySlotAssignments: (id: string) => `/students/${id}/slot-assignments/apply`,
    attendance: (id: string) => `/students/${id}/attendance`,
    /** GET: học phí theo tháng (từ 1.13.0) */
    tuition: (id: string) => `/students/${id}/tuition`,
    /** GET: phiếu báo học phí một tháng (PDF, gộp các bé cùng phụ huynh nhận học phí) — từ 1.17.0 */
    tuitionStatement: (id: string) => `/students/${id}/tuition-statement.pdf`,
  },
  extraRates: {
    detail: (id: string) => `/extra-rates/${id}`,
    apply: (id: string) => `/extra-rates/${id}/apply`,
  },
  attendance: {
    sessions: '/attendance/sessions',
    session: (id: string) => `/attendance/sessions/${id}`,
    records: (id: string) => `/attendance/sessions/${id}/records`,
    confirm: (id: string) => `/attendance/sessions/${id}/confirm`,
    cancel: '/attendance/sessions/cancel',
    pendingCount: '/attendance/sessions/pending/count',
    /** POST ADMIN: gửi lại mail xác nhận cho GV các buổi đã chọn (từ 1.13.0) */
    resendDigest: '/attendance/sessions/resend-digest',
    /** GET ADMIN: thống kê học phí tổng quát theo tháng (từ 1.13.0) */
    tuitionOverview: '/attendance/tuition',
    digest: (token: string) => `/attendance/public/digests/${token}`,
    confirmDigest: (token: string) => `/attendance/public/digests/${token}/confirm`,
  },
  extraSlots: {
    list: '/extra-slots',
    detail: (id: string) => `/extra-slots/${id}`,
    teachers: (id: string) => `/extra-slots/${id}/teachers`,
    students: (id: string) => `/extra-slots/${id}/students`,
    rates: (id: string) => `/extra-slots/${id}/rates`,
  },
  guardians: {
    list: '/guardians',
    detail: (id: string) => `/guardians/${id}`,
    familyAccount: (id: string) => `/guardians/${id}/family-account`,
    convertPreview: (id: string) => `/guardians/${id}/convert-preview`,
    convert: (id: string) => `/guardians/${id}/convert`,
    deletePreview: (id: string) => `/guardians/${id}/delete-preview`,
  },
  families: {
    pending: '/families/pending',
    pendingCount: '/families/pending/count',
    approve: (id: string) => `/families/${id}/approve`,
    reject: (id: string) => `/families/${id}/reject`,
    merge: (id: string) => `/families/${id}/merge`,
  },
  admin: {
    teachers: '/admin/teachers',
    teacher: (id: string) => `/admin/teachers/${id}`,
    teacherClasses: (id: string) => `/admin/teachers/${id}/classes`,
    teacherDeletePreview: (id: string) => `/admin/teachers/${id}/delete-preview`,
    permissions: '/admin/permissions',
    userPermissions: (id: string) => `/admin/users/${id}/permissions`,
    userPermissionGroups: (id: string) => `/admin/users/${id}/permission-groups`,
    permissionGroups: '/admin/permission-groups',
    permissionGroup: (id: string) => `/admin/permission-groups/${id}`,
    audit: '/admin/audit',
    /** GET / PUT ADMIN: cài đặt phiếu học phí (từ 1.17.0) */
    tuitionSettings: '/admin/settings/tuition',
    games: '/admin/games',
    game: (id: string) => `/admin/games/${id}`,
  },
  reports: {
    classRanking: (id: string, format: ReportFormat) => `/reports/classes/${id}/ranking.${format}`,
    classPoints: (id: string) => `/reports/classes/${id}/points.xlsx`,
    assignmentResults: (id: string) => `/reports/assignments/${id}/results.xlsx`,
  },
  stats: {
    overview: '/stats/overview',
    classPointsTimeline: (id: string) => `/stats/classes/${id}/points-timeline`,
    classTopStudents: (id: string) => `/stats/classes/${id}/top-students`,
    classDistribution: (id: string) => `/stats/classes/${id}/distribution`,
    classGames: (id: string) => `/stats/classes/${id}/games`,
    gameTimeline: (id: string) => `/stats/games/${id}/timeline`,
    gameByClass: (id: string) => `/stats/games/${id}/by-class`,
  },
} as const;
