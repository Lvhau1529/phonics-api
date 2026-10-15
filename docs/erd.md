# ERD

Nguồn sự thật: [`prisma/schema/`](../prisma/schema/) (mỗi domain một file `.prisma`; tên bảng / cột snake_case).

```mermaid
erDiagram
  users ||--o| student_profiles : "là học sinh"
  users ||--o{ class_teachers : "dạy"
  classes ||--o{ class_teachers : ""
  student_profiles ||--o{ class_memberships : "thuộc lớp (1 active)"
  classes ||--o{ class_memberships : ""
  users ||--o{ user_permissions : "override quyền"
  users ||--o{ user_permission_groups : "thuộc nhóm quyền"
  permission_groups ||--o{ user_permission_groups : ""
  student_profiles ||--o{ game_results : "ván solo"
  games ||--o{ game_results : ""
  game_results ||--o| point_entries : "sinh ra"
  student_profiles ||--o{ point_entries : "sổ điểm"
  classes o|--o{ point_entries : "lớp lúc cộng"
  games o|--o{ point_entries : "theo game"
  users o|--o{ point_entries : "người tạo (BONUS)"
  student_profiles ||--o{ student_game_unlocks : ""
  games ||--o{ student_game_unlocks : ""
  games ||--o{ game_events : "VIEW / PLAY"
  users o|--o{ game_events : "nếu đăng nhập"
  users ||--o{ notifications : ""
  users ||--o{ refresh_tokens : ""
  users o|--o{ audit_logs : "actor"
  users ||--o{ media_assets : "tải lên"
  users ||--o{ questions : "tạo"
  users ||--o{ worksheets : "tạo"
  worksheets ||--o{ worksheet_sections : "Part"
  worksheet_sections ||--o{ worksheet_items : ""
  questions ||--o{ worksheet_items : "dùng trong"
  worksheets ||--o{ assignments : "giao (snapshot)"
  classes ||--o{ assignments : ""
  assignments ||--o{ submissions : ""
  student_profiles ||--o{ submissions : "làm bài"
  submissions ||--o{ submission_answers : ""
  submissions ||--o{ submission_comments : ""
  submission_comments o|--o{ submission_comments : "trả lời"

  users {
    uuid id PK
    string email UK
    string password_hash "null với Google"
    string google_sub UK
    enum provider "LOCAL | GOOGLE"
    enum role "ADMIN | TEACHER | STUDENT"
    enum status "ACTIVE | DISABLED"
    string display_name
    string avatar_key "preset"
    int token_version
    datetime last_login_at
  }
  student_profiles {
    uuid user_id PK
    string parent_name
    string parent_email
    string parent_phone
    string notes "admin"
  }
  classes {
    uuid id PK
    string name
    string grade
    string school_year
    bool join_visible
    datetime archived_at
  }
  class_teachers {
    uuid class_id PK
    uuid teacher_id PK
  }
  class_memberships {
    uuid id PK
    uuid student_id
    uuid class_id
    datetime joined_at
    datetime left_at "null = đang học"
    int last_rank "hạng lần tính gần nhất"
  }
  user_permissions {
    uuid user_id
    string permission "mã trong contracts"
    enum effect "GRANT | REVOKE"
    uuid granted_by_id
  }
  permission_groups {
    uuid id PK
    string name UK
    string description
    string_array permissions "mã trong contracts"
    bool is_system
  }
  user_permission_groups {
    uuid user_id PK
    uuid group_id PK
  }
  games {
    string id PK "manifest id"
    string title
    bool enabled
    bool coming_soon
    int price "null = miễn phí"
    int sort_order
  }
  student_game_unlocks {
    uuid student_id PK
    string game_id PK
    enum source "GEMS | ADMIN"
    int gems_spent
    datetime unlocked_at
    datetime revoked_at
  }
  game_events {
    uuid id PK
    string game_id
    enum type "VIEW | PLAY"
    uuid user_id "null = khách"
    uuid client_id "thiết bị"
    string mode
    datetime occurred_at "làm tròn giây"
  }
  game_results {
    uuid id PK
    uuid student_id
    uuid class_id
    string game_id
    string level_id
    int correct
    int total
    int score
    datetime played_at
    uuid client_session_id "idempotent"
    int points_awarded
    string points_reason
    json details
  }
  point_entries {
    uuid id PK
    uuid student_id
    uuid class_id
    string game_id
    enum kind "GAME | BONUS"
    int points "BONUS có thể âm"
    string note
    uuid game_result_id UK
    uuid created_by_id
    datetime created_at
  }
  notifications {
    uuid id PK
    uuid user_id
    enum type
    string title
    string body
    json data
    datetime read_at
  }
  refresh_tokens {
    uuid id PK
    uuid user_id
    string token_hash UK
    uuid family_id
    datetime expires_at
    datetime revoked_at
  }
  audit_logs {
    uuid id PK
    uuid actor_id
    string action
    string target_type
    string target_id
    json before
    json after
  }
  media_assets {
    uuid id PK
    uuid owner_id
    enum kind "IMAGE | AUDIO"
    string key UK "media/{owner}/{uuid}.{ext}"
    string url "public, null khi PENDING"
    string mime_type
    int size_bytes
    enum status "PENDING | READY"
  }
  questions {
    uuid id PK
    enum type "14 dạng"
    enum grading_mode "AUTO | MANUAL"
    string instruction
    int points
    string_array tags
    json config
    json answer_key
    enum status "DRAFT | PUBLISHED | ARCHIVED"
    enum visibility "PRIVATE | SHARED"
    uuid created_by_id
  }
  worksheets {
    uuid id PK
    string title
    enum subject "PHONICS | ESL"
    string topic
    string grade
    int week
    int day "1..5"
    enum kind "EXTRA | HANDOUT | WORKSHEET"
    enum status
    enum visibility
    uuid created_by_id
  }
  worksheet_sections {
    uuid id PK
    uuid worksheet_id
    int order
    string title "Part 1"
    string instruction
  }
  worksheet_items {
    uuid id PK "snapshot tham chiếu"
    uuid worksheet_id
    uuid section_id
    uuid question_id
    int order
    int points_override
  }
  assignments {
    uuid id PK
    uuid worksheet_id
    uuid class_id
    uuid assigned_by_id
    date scheduled_for "ngày trên lịch"
    datetime available_from
    datetime due_at
    bool allow_late
    int max_attempts
    bool show_answers_after_submit
    enum status "SCHEDULED | OPEN | CLOSED"
    json snapshot "nội dung + answerKey đóng băng"
    int max_score
    bool has_manual_items
  }
  submissions {
    uuid id PK
    uuid assignment_id
    uuid student_id
    int attempt_no
    enum status "IN_PROGRESS | SUBMITTED | GRADED"
    datetime submitted_at
    float auto_score
    float manual_score
    float total_score "chỉ khi GRADED"
    int max_score
    int duration_ms
    bool late
  }
  submission_answers {
    uuid id PK
    uuid submission_id
    uuid worksheet_item_id "không FK"
    enum question_type
    int max_points
    json answer
    bool is_correct
    float auto_score
    float manual_score
    string teacher_note
    json grade_detail
  }
  submission_comments {
    uuid id PK
    uuid submission_id
    uuid worksheet_item_id "null = cả bài"
    uuid author_id
    uuid parent_id "một cấp"
    string body
    datetime deleted_at "xoá mềm"
  }
```

## Quyết định dữ liệu

- **Một bảng `users`** cho cả 3 role; `student_profiles` chỉ thêm thông tin phụ huynh. Giáo viên / admin không
  có profile.
- **Membership có lịch sử**: đổi lớp = đóng dòng cũ (`left_at`) + tạo dòng mới. Partial unique index
  `class_memberships_active_student (student_id) WHERE left_at IS NULL` (thêm tay trong migration) bảo đảm
  mỗi học sinh một lớp tại một thời điểm.
- **Sổ điểm (`point_entries`) là ledger**: không có cột "tổng điểm"; tổng = `SUM(points)`. Xếp hạng lớp = tổng
  điểm (mọi lớp, mọi game) của các thành viên đang hoạt động → **điểm đi theo học sinh** ([ADR 0006](../adr/0006-points-follow-student.md)).
  `class_id` trên bút toán chỉ để báo cáo "điểm phát sinh khi ở lớp nào". Lọc theo `game_id` cho xếp hạng
  theo game.
- **`last_rank`** nằm trên membership (hạng là khái niệm theo lớp); tính lại sau mỗi bút toán để phát hiện đổi hạng.
- **Quyền**: catalog chức năng trong code; admin tạo **nhóm quyền** (`permission_groups`) từ catalog và gán cho
  user; override GRANT / REVOKE theo user vẫn có. Hiệu lực = mặc định role ∪ nhóm ∪ GRANT − REVOKE
  ([ADR 0007](../adr/0007-permissions-catalog-in-code.md), [ADR 0013](../adr/0013-permission-groups.md)).
- **Game catalog** trên server (`games`) để admin bật / tắt / đặt giá; client vẫn giữ manifest để tải code.
  Mở khoá theo học sinh ở `student_game_unlocks` (`revoked_at` = admin thu hồi).
- **Sự kiện** ẩn danh theo `client_id`; unique `(client_id, game_id, type, occurred_at)` để gửi lại không trùng.
- **Refresh token**: chỉ lưu hash; `family_id` để phát hiện dùng lại ([ADR 0002](../adr/0002-api-separate-origin-jwt-refresh-transport.md)).
- Xoá lớp = `archived_at` (mềm); xoá user là cascade (chỉ admin, hiếm).
- **Phiếu bài tập** ([ADR 0017](../../phonics-dev/docs/adr/0017-worksheet-domain.md)): `questions.config` / `answer_key`
  là JSON theo discriminated union của contracts; giao bài = **đóng băng snapshot** vào `assignments.snapshot`, nên
  `submission_answers.worksheet_item_id` không có FK (phiếu / câu sửa sau không ảnh hưởng bài đã chấm). Partial unique
  `submissions_one_in_progress (assignment_id, student_id) WHERE status = 'IN_PROGRESS'` và GIN index `questions_tags_gin`
  thêm tay trong migration.
- **Điểm phiếu tách khỏi `point_entries`** ([ADR 0019](../../phonics-dev/docs/adr/0019-worksheet-grading-ranking.md)):
  `submissions.total_score` (float, một phần) chỉ có khi GRADED; xếp hạng theo bài giao = bài tốt nhất mỗi HS.
- **Media** ([ADR 0018](../../phonics-dev/docs/adr/0018-media-object-storage.md)): `media_assets.key` bất biến trên bucket
  public_read, lưu URL public; `PENDING` quá 24h bị cron xoá.
