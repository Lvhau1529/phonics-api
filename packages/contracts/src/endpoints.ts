/**
 * Đường dẫn API (không có prefix). Client ghép `${API_URL}${API_PREFIX}${path}` → `/api/v1/auth/login`.
 * Hàm nhận id để tránh ghép chuỗi tay ở client.
 *
 * Versioning theo URI (ADR 0015): server phục vụ song song nhiều version (`/api/v1`, `/api/v2`...);
 * `API_VERSION` là version mà client trong monorepo đang dùng. Riêng `/api/health` không có version.
 */
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
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    changePassword: '/auth/change-password',
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
    detail: (id: string) => `/students/${id}`,
    moveClass: (id: string) => `/students/${id}/move-class`,
    resetPassword: (id: string) => `/students/${id}/reset-password`,
    points: (id: string) => `/students/${id}/points`,
    pointsByGame: (id: string) => `/students/${id}/points/by-game`,
    gameResults: (id: string) => `/students/${id}/game-results`,
    games: (id: string) => `/students/${id}/games`,
    game: (id: string, gameId: string) => `/students/${id}/games/${gameId}`,
  },
  admin: {
    teachers: '/admin/teachers',
    teacher: (id: string) => `/admin/teachers/${id}`,
    teacherClasses: (id: string) => `/admin/teachers/${id}/classes`,
    permissions: '/admin/permissions',
    userPermissions: (id: string) => `/admin/users/${id}/permissions`,
    userPermissionGroups: (id: string) => `/admin/users/${id}/permission-groups`,
    permissionGroups: '/admin/permission-groups',
    permissionGroup: (id: string) => `/admin/permission-groups/${id}`,
    audit: '/admin/audit',
    games: '/admin/games',
    game: (id: string) => `/admin/games/${id}`,
  },
  reports: {
    classRanking: (id: string, format: 'xlsx' | 'pdf') => `/reports/classes/${id}/ranking.${format}`,
    classPoints: (id: string) => `/reports/classes/${id}/points.xlsx`,
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
