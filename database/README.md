# Cơ sở dữ liệu TOEIC

Dữ liệu cho website luyện thi TOEIC: thông tin đề thi 2025–2026, đề luyện tập theo đúng cấu trúc 7 phần, từ vựng, ngữ pháp và chiến thuật làm bài.

## Cấu trúc thư mục

```
database/
├── data/                 ← NGUỒN GỐC: sửa/thêm dữ liệu ở đây
│   ├── exam_info.json    cấu trúc đề, các part, thang điểm, lệ phí, tin tức 2025–2026, nguồn
│   ├── tests/            đề luyện tập (mỗi đề có thể chia nhiều file, gộp theo test.id)
│   │   ├── mini-test-01.listening.json
│   │   ├── mini-test-01.reading.json
│   │   ├── full-test-01.1-part1-2.json
│   │   ├── full-test-01.2-part3.json
│   │   ├── full-test-01.3-part4.json
│   │   ├── full-test-01.4-part5-6.json
│   │   ├── full-test-01.5-part7-single.json
│   │   └── full-test-01.6-part7-multiple.json
│   ├── vocabulary.json   từ vựng theo chủ đề (IPA, nghĩa, ví dụ, collocation)
│   ├── grammar.json      13 chủ điểm ngữ pháp kèm quy tắc và bẫy thường gặp
│   └── strategies.json   chiến thuật theo từng part
├── schema.sql            schema SQLite (dùng được cho PostgreSQL/MySQL với chỉnh sửa nhỏ)
├── build.mjs             kiểm tra dữ liệu + sinh toeic.db và toeic.json
├── tts/                  generate-audio.mjs + synthesize.ps1 (sinh audio phần Nghe)
├── audio/                ← SINH TỰ ĐỘNG: MP3 từng set + manifest.json
├── illustrations/        part1.mjs: vẽ ảnh minh họa Part 1 bằng SVG
├── images/               ảnh Part 1: <set-id>.svg|png|jpg|webp (build tự gắn image_url)
├── toeic.db              ← SINH TỰ ĐỘNG: SQLite cho backend
└── toeic.json            ← SINH TỰ ĐỘNG: một file JSON cho frontend/seed DB khác
```

## Build

Cần Node.js ≥ 22.5 (dùng `node:sqlite` có sẵn, không cần cài gói npm):

```powershell
node database/build.mjs
```

Script sẽ dừng và liệt kê lỗi nếu dữ liệu sai (đáp án không nằm trong lựa chọn, Part 2 không đủ 3 lựa chọn, thiếu transcript/giải thích, trùng từ vựng, nguồn không tồn tại...). Với đề có `test_type: "full"`, số câu của từng Part phải khớp đúng cấu trúc đề thật trong `exam_parts`.

Cuối mỗi lần build, script in ra phân bố đáp án A/B/C/D. Hãy giữ phân bố đều và tránh quy luật lặp, nhất là ở Part 2.

## Nội dung hiện có

| Bảng | Số dòng | Ghi chú |
|---|---|---|
| `exam_formats` | 3 | L&R (tuyến tính), L&R thích ứng, Speaking & Writing |
| `exam_parts` | 15 | 7 part L&R + 8 phần S&W |
| `tests` / `questions` | 2 / 283 | **Full Test 01** (200 câu, đúng cấu trúc đề thật: P1=6, P2=25, P3=39, P4=30, P5=30, P6=16, P7=54) và Mini Test 01 (83 câu) |
| `vocabulary` | 109 | 13 chủ đề, gắn mức điểm mục tiêu 450/650/850 |
| `grammar_topics` | 13 | |
| `strategies` | 14 | |
| `score_conversion` | 202 | Bảng quy đổi **ước lượng** số câu đúng → điểm |
| `updates`, `fees`, `sources` | 5 / 3 / 8 | Có cờ `verified` |

## Một số truy vấn mẫu

```sql
-- Toàn bộ câu hỏi của một part, kèm lựa chọn dạng JSON
SELECT * FROM v_questions_full WHERE test_id = 'mini-test-01' AND part_number = 5 ORDER BY number;

-- Chấm điểm: đổi số câu đúng sang điểm
SELECT scaled_score FROM score_conversion WHERE section = 'listening' AND correct_answers = 72;

-- Từ vựng theo chủ đề và mức điểm
SELECT word, ipa, meaning_vi FROM vocabulary WHERE topic = 'finance' AND level <= '650';

-- Câu hỏi theo chủ điểm ngữ pháp (tags là mảng JSON)
SELECT q.* FROM questions q, json_each(q.tags) t WHERE t.value = 'grammar:relative-clause';
```

## Lưu ý quan trọng

- **Bản quyền:** Đề thi TOEIC thật và các bộ sách ETS là tài liệu có bản quyền, nên **không** được đưa vào đây. Toàn bộ câu hỏi, đoạn văn và transcript được biên soạn mới theo đúng định dạng, độ khó và dạng bẫy của đề thật (`tests.origin = 'original'`).
- **Phần Nghe:** đã có audio TTS (xem mục bên dưới). Ảnh Part 1 là **minh họa vector thang xám**, vẽ bằng `illustrations/part1.mjs` theo đúng `image_description`, không phải ảnh chụp. Biểu đồ Part 3/4/7 được website vẽ trực tiếp từ dữ liệu `graphic`.
- **Điểm quy đổi** chỉ là ước lượng, vì ETS không công bố bảng cố định (điểm được equating theo từng đề).
- **Lệ phí** lấy từ nguồn bên thứ ba (`verified = 0`); cần đối chiếu với IIG Việt Nam trước khi hiển thị như số liệu chính thức. Tin rút gọn bài thi 4 kỹ năng từ 3/8/2026 cũng **chưa được ETS xác nhận**.

## Audio phần Nghe (TTS)

Mỗi set Part 1–4 có một file MP3 tại `audio/<test-id>/<set-id>.mp3` (mono 48 kbps). Đường dẫn được ghi vào `question_sets.audio_url`, tương đối so với thư mục `database/`, kèm thời lượng ở `audio_duration_sec`.

```powershell
node database/build.mjs
```

```powershell
node database/tts/generate-audio.mjs
```

- Dùng giọng đọc **offline có sẵn của Windows** (Microsoft David, Zira, Mark), không gửi dữ liệu ra ngoài. Cần ffmpeg trong PATH, hoặc đặt biến `FFMPEG_PATH`.
- Định dạng giống đề thật: người dẫn đọc "Number 7…", "Questions 32 through 34 refer to the following conversation…". Part 3/4 đọc câu hỏi và chừa 8 giây để trả lời (12 giây với câu có biểu đồ).
- Phân vai theo transcript: `M`/`M1` = David, `M2` = Mark, `W`/`W1` = Zira, `W2` = Zira giọng cao hơn. Người dẫn là Mark.
- Chỉ tạo lại những set có nội dung thay đổi (so hash trong `audio/manifest.json`). Script tự build lại database sau khi xong.
- Tùy chọn: `--test full-test-01`, `--force`, `--pause 5` (đổi thời gian chờ trả lời), `--no-questions` (chỉ đọc hội thoại, không đọc câu hỏi).
- Hạn chế: chỉ có giọng Mỹ, nghe còn máy móc. Đề thật có cả giọng Anh, Úc, Canada. Có thể thay bằng giọng neural (Azure, Google, ElevenLabs...) bằng cách sửa `tts/synthesize.ps1`, vẫn giữ nguyên SSML.

## Ảnh Part 1

```powershell
node database/illustrations/part1.mjs
```

Script vẽ lại 12 file SVG vào `images/`. Khi build, mỗi set Part 1 tự được gắn `image_url` nếu có file `images/<set-id>.svg|png|jpg|webp`, và build sẽ nhắc tên những set còn thiếu ảnh.

Muốn thay bằng ảnh chụp thật, đặt file cùng tên (ví dụ `images/ft01-p1-s01.jpg`) và xóa file `.svg` tương ứng. Ảnh phải khớp từng chi tiết mà câu hỏi dựa vào: có người hay không, đang làm gì, đồ vật ở đâu.

## Thêm đề mới

Tạo `data/tests/mini-test-02.*.json` với cùng định dạng (`test` + `sets[]`, mỗi set có `part` và `questions[]`). ID của set/câu hỏi và số thứ tự câu được build script tự sinh, nên không cần đánh số thủ công.
