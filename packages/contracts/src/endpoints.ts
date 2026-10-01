/**
 * Đường dẫn API (không có prefix `/api`). Client ghép `${API_URL}/api${path}`.
 * Hàm nhận id để tránh ghép chuỗi tay ở client.
 */
export const API_PREFIX = '/api';

export const ENDPOINTS = {
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
