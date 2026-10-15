/**
 * Message lỗi trả về client — tiếng Việt (bộ NGUỒN: `messages.en.ts` phải có đúng các khoá / tham số này).
 * Khoá viết HOA = message mặc định của `ErrorCode`; khoá camelCase = message riêng của một tình huống.
 * Message có tham số là hàm nhận object (`notTeacherId({ id })`).
 */
import { type ErrorCode } from '@phonics/contracts';

const codeMessages = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ',
  UNAUTHORIZED: 'Cần đăng nhập',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn',
  INVALID_REFRESH: 'Refresh token không hợp lệ',
  REFRESH_REUSED: 'Refresh token đã bị dùng lại, vui lòng đăng nhập lại',
  FORBIDDEN: 'Không có quyền truy cập',
  FORBIDDEN_PERMISSION: 'Thiếu quyền thực hiện thao tác này',
  FORBIDDEN_SCOPE: 'Không thuộc phạm vi lớp của bạn',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khoá',
  INVALID_CREDENTIALS: 'Sai email hoặc mật khẩu',
  EMAIL_TAKEN: 'Email đã được sử dụng',
  PROFILE_REQUIRED: 'Cần chọn lớp và tên hiển thị để tạo tài khoản',
  GOOGLE_EMAIL_UNVERIFIED: 'Email Google chưa được xác thực',
  GOOGLE_TOKEN_INVALID: 'Token Google không hợp lệ',
  CLASS_NOT_JOINABLE: 'Lớp này không nhận học sinh mới',
  NOT_FOUND: 'Không tìm thấy',
  CONFLICT: 'Dữ liệu bị trùng',
  UNKNOWN_GAME: 'Game không tồn tại',
  RESULT_IMPLAUSIBLE: 'Kết quả không hợp lệ',
  PLAYED_AT_OUT_OF_RANGE: 'Thời điểm chơi không hợp lệ',
  DETAILS_TOO_LARGE: 'Chi tiết ván chơi quá lớn',
  RATE_LIMITED: 'Thao tác quá nhanh, thử lại sau',
  INTERNAL: 'Lỗi hệ thống',
  MEDIA_TYPE_UNSUPPORTED: 'Định dạng file không hỗ trợ',
  MEDIA_TOO_LARGE: 'File quá lớn',
  MEDIA_NOT_READY: 'File chưa tải lên xong hoặc không thuộc về bạn',
  MEDIA_UPLOAD_INCOMPLETE: 'File chưa được tải lên đúng (thiếu, sai kích thước hoặc định dạng)',
  MEDIA_STORAGE_DISABLED: 'Chưa cấu hình kho lưu trữ file',
  QUESTION_NOT_PUBLISHED: 'Câu hỏi chưa được phát hành',
  WORKSHEET_NOT_PUBLISHED: 'Phiếu bài tập chưa được phát hành',
  WORKSHEET_EMPTY: 'Phiếu bài tập chưa có câu hỏi',
  WORKSHEET_IN_USE: 'Câu hỏi đang được dùng trong phiếu bài tập',
  ASSIGNMENT_NOT_OPEN: 'Bài tập chưa mở hoặc đã đóng',
  ATTEMPTS_EXHAUSTED: 'Đã hết số lần làm bài',
  SUBMISSION_NOT_EDITABLE: 'Bài làm đã nộp, không sửa được',
  SUBMISSION_NOT_SUBMITTED: 'Bài làm chưa được nộp',
  GRADING_INCOMPLETE: 'Còn câu chấm tay chưa có điểm',
  ANSWER_TYPE_MISMATCH: 'Câu trả lời không đúng dạng câu hỏi',
} satisfies Record<ErrorCode, string>;

export const vi = {
  ...codeMessages,

  // Không tìm thấy
  assignmentNotFound: 'Không tìm thấy bài giao',
  homeworkNotFound: 'Không tìm thấy bài tập',
  classNotFound: 'Không tìm thấy lớp',
  classIdNotFound: (p: { id: string }) => `Không tìm thấy lớp ${p.id}`,
  commentNotFound: 'Không tìm thấy nhận xét',
  parentCommentNotFound: 'Không tìm thấy nhận xét gốc',
  submissionNotFound: 'Không tìm thấy bài làm',
  gameNotFound: 'Không tìm thấy game',
  studentNotFound: 'Không tìm thấy học sinh',
  teacherNotFound: 'Không tìm thấy giáo viên',
  userNotFound: 'Không tìm thấy người dùng',
  fileNotFound: 'Không tìm thấy file',
  permissionGroupNotFound: 'Không tìm thấy nhóm quyền',
  questionNotFound: 'Không tìm thấy câu hỏi',
  worksheetNotFound: 'Không tìm thấy phiếu bài tập',
  noClassYet: 'Bạn chưa thuộc lớp nào',
  studentNotInClass: 'Học sinh không thuộc lớp này',
  studentsNotInClass: 'Có học sinh không thuộc lớp này',

  // Tài khoản / quyền
  wrongCurrentPassword: 'Mật khẩu hiện tại không đúng',
  googleLoginDisabled: 'Đăng nhập Google chưa được bật',
  teacherFieldsOnly: 'Giáo viên chỉ được sửa tên hiển thị và avatar',
  systemGroupUndeletable: 'Không xoá nhóm quyền hệ thống',
  adminPermissionsLocked: 'Không sửa quyền của admin',
  permissionGroupNameTaken: 'Tên nhóm quyền đã tồn tại',
  permissionGroupsMissing: 'Có nhóm quyền không tồn tại',

  // Lớp / học sinh / giáo viên
  classNameTaken: 'Lớp cùng tên đã tồn tại trong năm học này',
  classArchived: 'Lớp đã lưu trữ',
  classIdMismatch: 'classId phải trùng với classId trên URL',
  classesMissing: 'Có lớp không tồn tại',
  notTeacherIds: 'Có id không phải giáo viên',
  notTeacherId: (p: { id: string }) => `${p.id} không phải giáo viên`,
  studentAlreadyInClass: 'Học sinh đang ở lớp này rồi',
  gameLocked: 'Game đang bị giáo viên khoá',

  // Bài giao / bài làm / nhận xét
  dueAfterOpen: 'Hạn nộp phải sau thời điểm mở',
  assignmentHasSubmissions: 'Đã có bài nộp — hãy đóng bài thay vì xoá',
  studentRepliesOnly: 'Học sinh chỉ trả lời nhận xét của giáo viên',
  itemNotInSubmission: 'Không có câu này trong bài',
  overMaxScore: (p: { id: string }) => `${p.id}: vượt điểm tối đa`,

  // Câu hỏi / phiếu bài tập
  questionTypeImmutable: 'Không đổi được dạng câu hỏi',
  questionsUnavailable: 'Có câu hỏi không tồn tại, đã lưu trữ hoặc bạn không được dùng',
  sectionNotInWorksheet: (p: { id: string }) => `Part ${p.id} không thuộc phiếu này`,
  itemNotInWorksheet: (p: { id: string }) => `Câu ${p.id} không thuộc phiếu này`,

  // Media
  uploadLinkInvalid: 'Link tải lên không hợp lệ hoặc đã hết hạn',
  fileAlreadyUploaded: 'File đã tải lên xong',
  contentTypeMismatch: 'Content-Type khác lúc presign',
  fileEmpty: 'File rỗng',
};

export type Messages = typeof vi;
