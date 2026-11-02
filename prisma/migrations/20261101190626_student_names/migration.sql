-- Tên học sinh: tiếng Việt (bắt buộc) + tiếng Anh (tuỳ chọn) + cột tìm không dấu / sắp xếp theo tên.
-- Học sinh đã có: vietnamese_name = display_name hiện tại, chưa có tên tiếng Anh.

ALTER TABLE "student_profiles" ADD COLUMN "vietnamese_name" TEXT,
ADD COLUMN "english_name" TEXT,
ADD COLUMN "name_search" TEXT NOT NULL DEFAULT '',
ADD COLUMN "name_sort_key" TEXT NOT NULL DEFAULT '';

-- Bỏ dấu giống `foldName` (src/modules/students/utils/student-names.ts): ký tự Latin có dấu → chữ gốc, đ → d,
-- chữ thường, gộp khoảng trắng. translate trước rồi mới lower để không phụ thuộc collation của DB.
CREATE FUNCTION pg_temp.fold_name(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(translate(t,
    'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ',
    'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZzOoUuAaIiOoUuUuUuUuUuAaAaGgKkOoOojGgNnAaAaAaEeEeIiIiOoOoRrRrUuUuSsTtHhAaEeOoOoOoOoYyAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIiOoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuYyYyYyYy')), '\s+', ' ', 'g'))
$$;

UPDATE "student_profiles" sp
SET    "vietnamese_name" = btrim(u."display_name"),
       "name_search"     = pg_temp.fold_name(u."display_name"),
       "name_sort_key"   = pg_temp.fold_name(regexp_replace(btrim(u."display_name"), '^.*\s', '') || ' ' || u."display_name")
FROM   "users" u
WHERE  u."id" = sp."user_id";

ALTER TABLE "student_profiles" ALTER COLUMN "vietnamese_name" SET NOT NULL;

-- CreateIndex
CREATE INDEX "student_profiles_name_sort_key_idx" ON "student_profiles"("name_sort_key");
