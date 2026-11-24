# Cơ sở dữ liệu TOEIC

Dữ liệu cho website luyện thi TOEIC: thông tin đề thi 2025–2026, đề luyện tập theo đúng cấu trúc 7 phần, từ vựng, ngữ pháp và chiến thuật làm bài.

## Cấu trúc thư mục

```
database/
├── data/                 ← NGUỒN GỐC: sửa/thêm dữ liệu ở đây
│   ├── exam_info.json    cấu trúc đề, các part, thang điểm, bậc CEFR
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
├── tts/                  generate-audio.mjs + edge_synth.py + synthesize.ps1 (sinh audio phần Nghe)
├── audio/                ← SINH TỰ ĐỘNG: MP3 từng set + manifest.json
├── illustrations/        part1.mjs: vẽ ảnh minh họa Part 1 bằng SVG
├── images/               ảnh Part 1: <set-id>.jpg (trắng đen) + credits.json (nguồn, prompt)
├── toeic.db              ← SINH TỰ ĐỘNG: SQLite cho backend
└── toeic.json            ← SINH TỰ ĐỘNG: một file JSON cho frontend/seed DB khác
```

## Build

Cần Node.js ≥ 22.5 (dùng `node:sqlite` có sẵn, không cần cài gói npm):

```powershell
node database/build.mjs
```

Script sẽ dừng và liệt kê lỗi nếu dữ liệu sai (đáp án không nằm trong lựa chọn, Part 2 không đủ 3 lựa chọn, thiếu transcript/giải thích, trùng từ vựng...). Với đề có `test_type: "full"`, số câu của từng Part phải khớp đúng cấu trúc đề thật trong `exam_parts`.

Cuối mỗi lần build, script in ra phân bố đáp án A/B/C/D. Hãy giữ phân bố đều và tránh quy luật lặp, nhất là ở Part 2.

## Nội dung hiện có

| Bảng | Số dòng | Ghi chú |
|---|---|---|
| `exam_formats` | 2 | Listening & Reading, Speaking & Writing |
| `exam_parts` | 15 | 7 part L&R + 8 phần S&W |
| `tests` / `questions` | 2 / 283 | **Full Test 01** (200 câu, đúng cấu trúc đề thật: P1=6, P2=25, P3=39, P4=30, P5=30, P6=16, P7=54) và Mini Test 01 (83 câu) |
| `vocabulary` | 109 | 13 chủ đề, gắn mức điểm mục tiêu 450/650/850 |
| `grammar_topics` | 13 | |
| `strategies` | 14 | |
| `score_conversion` | 202 | Bảng quy đổi **ước lượng** số câu đúng → điểm |

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
- **Phần Nghe:** đã có audio TTS (xem mục bên dưới). Ảnh Part 1 là **ảnh trắng đen** (cả 12 ảnh tạo bằng Gemini; xem mục Ảnh Part 1). Biểu đồ Part 3/4/7 được website vẽ trực tiếp từ dữ liệu `graphic`.
- **Điểm quy đổi** chỉ là ước lượng, vì ETS không công bố bảng cố định (điểm được equating theo từng đề).

## Audio phần Nghe (TTS)

Mỗi set Part 1–4 có một file MP3 tại `audio/<test-id>/<set-id>.mp3` (mono 64 kbps). Đường dẫn được ghi vào `question_sets.audio_url`, tương đối so với thư mục `database/`, kèm thời lượng ở `audio_duration_sec`.

```powershell
node database/build.mjs
```

```powershell
node database/tts/generate-audio.mjs
```

- Mặc định dùng **giọng neural của Microsoft** (giọng "Đọc to" của trình duyệt Edge) qua gói mã nguồn mở [edge-tts](https://github.com/rany2/edge-tts). Giọng tự nhiên, gần người thật, và **luân phiên 4 giọng Anh–Mỹ, Anh–Anh, Canada, Úc** như đề thật.
- **Cần internet và Docker Desktop** (máy không cần cài Python, edge-tts chạy trong container `python:3.12-slim`). Cài một lần:

  ```powershell
  docker volume create on-ta-pip
  docker run --rm -v on-ta-pip:/pip python:3.12-slim pip install --target /pip edge-tts==7.2.3
  ```

  Nếu máy đã có Python cài sẵn edge-tts, đặt biến `EDGE_TTS_PYTHON` trỏ tới python đó để chạy không cần Docker. Cần ffmpeg trong PATH, hoặc đặt biến `FFMPEG_PATH`.
- **Lưu ý:** edge-tts là client **không chính thức**, gửi transcript tới dịch vụ đọc online của Microsoft Edge. Dùng cho dự án học tập thì ổn; nếu dùng thương mại, hãy chuyển sang dịch vụ chính thức **Azure Speech** (cùng tên giọng). Dịch vụ có giới hạn tần suất (HTTP 429), nên script gửi chậm, tự thử lại, và lưu cache từng câu (`EDGE_TTS_CACHE`, mặc định trong thư mục tạm của hệ điều hành). Bị ngắt giữa chừng thì chạy lại, các câu đã có sẽ không gửi lại.
- Mỗi câu thoại được đọc riêng rồi ghép bằng ffmpeg với khoảng lặng chính xác, âm lượng các giọng được cân bằng.
- Định dạng giống đề thật: người dẫn đọc "Number 7…", "Questions 32 through 34 refer to the following conversation…". Part 3/4 đọc câu hỏi và chừa 8 giây để trả lời (12 giây với câu có biểu đồ).
- Phân vai (cố định theo thứ tự set, không ngẫu nhiên):

  | Vai | Giọng |
  |---|---|
  | Người dẫn (đọc số câu, câu hỏi Part 3/4) | Andrew (Mỹ), chậm hơn 5% |
  | Mỹ (US) | Nữ: Ava, Emma · Nam: Brian, Christopher |
  | Anh (GB) | Nữ: Sonia, Libby · Nam: Ryan, Thomas |
  | Canada (CA) | Nữ: Clara · Nam: Liam |
  | Úc (AU) | Nữ: Natasha · Nam: William |

  Các giọng hội thoại đọc chậm hơn mặc định 4% (Brian, Ryan, Thomas, William vốn nói nhanh nên chậm 8%) để người học dễ nghe.

  - Part 1: một giọng đọc cả 4 câu mô tả; giọng đổi theo từng set US → GB → CA → AU, xen kẽ nam/nữ.
  - Part 2: người hỏi và người trả lời luôn khác cả giọng vùng lẫn giới tính.
  - Part 3: mỗi người nói (`M`, `W`, `M1`, `M2`, `W1`, `W2`) một giọng vùng khác nhau, nên hai người cùng giới không bao giờ trùng giọng.
  - Part 4: một người nói mỗi set, giọng vùng xoay vòng; nếu người nói tự giới thiệu tên ("This is Sandra…") thì giới tính giọng khớp với tên (bảng `NAME_GENDER` trong script, script nhắc khi gặp tên mới).
  - Trên cả đề, 4 giọng vùng xuất hiện gần đều nhau; script in bảng phân bố mỗi lần chạy. `audio/manifest.json` ghi `voices` và `accents` của từng set.
- Chỉ tạo lại những set có nội dung hoặc phân vai thay đổi (so hash trong `audio/manifest.json`). Script tự build lại database sau khi xong.
- Tùy chọn: `--test full-test-01`, `--force`, `--pause 5` (đổi thời gian chờ trả lời), `--no-questions` (chỉ đọc hội thoại, không đọc câu hỏi), `--report <file>` (ghi thống kê từng câu: thời lượng, tốc độ đọc, âm lượng).
- **Chạy offline:** `--engine onecore` dùng giọng có sẵn của Windows (Microsoft David, Zira, Mark), không gửi dữ liệu ra ngoài, nhưng chỉ có giọng Mỹ và nghe máy móc (`M`/`M1` = David, `M2` = Mark, `W`/`W1` = Zira, `W2` = Zira giọng cao hơn, người dẫn là Mark).

## Ảnh Part 1

Cả 12 set dùng ảnh JPG trắng đen (thang xám, 1000×750, mỗi file dưới 180 KB) tại `images/<set-id>.jpg`:

| Nguồn | Set | Bản quyền |
|---|---|---|
| Tạo bằng Google Gemini (model "Neon") | cả 12 set | Ảnh tự tạo, không phải ảnh của bên thứ ba; có thể mang watermark ẩn SynthID của Google |

- `images/credits.json` ghi nguồn, prompt và cách xử lý của từng ảnh.
- Hiện không ảnh nào cần ghi công. Nếu sau này dùng ảnh cần ghi công, thêm trường `attribution` (`{text, url}`) vào `credits.json`; build sẽ gắn `image_credit` vào set và website hiện dòng "Ảnh: …" dưới ảnh.
- Mỗi ảnh đã được soát đủ hai điều kiện: đáp án đúng phải đúng với ảnh, và cả ba phương án nhiễu phải sai.

Khi build, mỗi set Part 1 tự được gắn `image_url` theo thứ tự ưu tiên `jpg`, `webp`, `png`, rồi mới đến `svg`. Build cũng nhắc tên những set còn thiếu ảnh. Ảnh thay thế phải khớp từng chi tiết mà câu hỏi dựa vào: có người hay không, đang làm gì, đồ vật ở đâu.

Bản minh họa vector cũ vẫn tạo lại được làm phương án dự phòng:

```powershell
node database/illustrations/part1.mjs
```

Script ghi 12 file SVG vào `images/`. Vì ảnh chụp được ưu tiên, các file SVG này chỉ được dùng khi set đó không có file `.jpg`, `.webp` hay `.png`.

## Bản dịch tiếng Việt và lý do loại đáp án

Mỗi đề có thể kèm các trường tùy chọn sau (website chỉ hiện sau khi người học trả lời ở chế độ luyện tập, hoặc khi xem lại bài; không bao giờ hiện trong lúc thi):

| Trường | Đặt ở | Kiểu | Cột SQLite |
|---|---|---|---|
| `transcript_vi` | set Part 1–4 | chuỗi | `question_sets.transcript_vi` |
| `text_vi` | từng đoạn trong `passages` (Part 6–7) | chuỗi | trong JSON `question_sets.passages` |
| `prompt_vi` | câu hỏi có `prompt` (Part 3, 4, 5, 7) | chuỗi hoặc `null` | `questions.prompt_vi` |
| `why_wrong_vi` | câu hỏi | `{ "<nhãn>": "<một câu ngắn>" }` cho **mọi** đáp án sai | `questions.why_wrong_vi` (JSON) |

```json
"prompt": "By the time the shipment arrived, the store ------- out of the product.",
"prompt_vi": "Vào lúc lô hàng đến, cửa hàng đã hết sản phẩm đó.",
"answer": "D",
"why_wrong_vi": { "A": "Sai thì: ...", "B": "Sai thì: cần quá khứ hoàn thành vì hành động xảy ra trước 'by the time'", "C": "..." }
```

- Dịch tự nhiên, không dịch từng chữ; giữ nguyên tên riêng, con số, giờ giấc. Part 5–6: dịch câu/đoạn văn **đã điền đáp án đúng**. Giữ ký hiệu `— [1] —` của câu chèn Part 7.
- Lý do sai phải là lý do thật: sai thì, sai từ loại, bẫy âm, thông tin có trong bài nhưng nói về đối tượng khác...
- Part 1–2 không có `prompt` nên không cần `prompt_vi`; Part 6 có prompt dạng `(131)` cũng vậy.
- Build **báo lỗi** nếu chuỗi rỗng, `why_wrong_vi` có nhãn không tồn tại hoặc giải thích chính đáp án đúng. Thiếu bản dịch chỉ là **cảnh báo** (`note: <file> is missing N Vietnamese translation(s)`), để có thể bổ sung dần.

## Thêm đề mới

Tạo `data/tests/mini-test-02.*.json` với cùng định dạng (`test` + `sets[]`, mỗi set có `part` và `questions[]`). ID của set/câu hỏi và số thứ tự câu được build script tự sinh, nên không cần đánh số thủ công.
