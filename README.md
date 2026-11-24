# Ôn TOEIC

Website luyện thi TOEIC Listening & Reading (Vite + React + TypeScript). Dữ liệu đề thi, audio và tài liệu nằm trong [`database/`](database/README.md).

## Chạy

```powershell
npm install
```

```powershell
npm run dev
```

Mở http://localhost:5173. Lệnh `dev` và `build` tự chép `database/toeic.json` và `database/audio/` vào `public/data/` trước khi chạy.

```powershell
npm run build
```

Kết quả nằm trong `dist/`. Đây là site tĩnh, dùng `HashRouter` và đường dẫn tương đối, nên có thể đưa lên bất kỳ host tĩnh nào (Netlify, Vercel, GitHub Pages, Nginx...) mà không cần cấu hình rewrite.

## Triển khai (Docker + nginx, chạy trên máy)

Cần Docker. Quy trình gồm ba bước: lên staging, kiểm tra, rồi mới lên production.

```powershell
npm run deploy:staging      # build dist/, build image nginx, chạy tại http://127.0.0.1:8081 và tự kiểm tra
npm run deploy:production   # kiểm tra lại staging, rồi chạy CHÍNH image đó tại http://localhost
npm run deploy:rollback     # quay về image production trước đó
npm run check-site -- http://127.0.0.1:8081   # chạy riêng bộ kiểm tra
```

- Production không build lại mà gắn tag mới (`on-ta-web:production`) cho đúng image đã kiểm tra trên staging. Image production cũ được giữ ở tag `on-ta-web:previous` để rollback.
- `scripts/check-site.mjs` có 53 kiểm tra: trang và tài nguyên tải được, mọi file audio/ảnh trong `toeic.json` đều có, audio tua được (HTTP 206), header bảo mật (CSP, nosniff, X-Frame-Options...), chặn path traversal, không lộ dotfile, không liệt kê thư mục, chỉ cho phép GET/HEAD. Có bất kỳ kiểm tra nào trượt thì không lên production.
- Container chạy với filesystem chỉ đọc, bỏ hết Linux capability (chỉ giữ 4 quyền nginx cần) và giới hạn RAM/tiến trình. Production tự khởi động lại cùng Docker (`--restart unless-stopped`).
- Mặc định production chỉ mở cho chính máy này (`127.0.0.1:80`). Muốn máy khác trong mạng LAN truy cập: `$env:ONTA_PROD_BIND = '0.0.0.0:80'; npm run deploy:production`.
- Cấu hình nằm trong `deploy/` (`Dockerfile`, `nginx.conf`, `security-headers.conf`).

## Cập nhật dữ liệu

```powershell
npm run db:build
```

```powershell
npm run db:audio
```

`db:build` kiểm tra và build lại database từ `database/data/`. `db:audio` sinh lại audio cho những câu Nghe đã thay đổi. Sau đó chạy lại `npm run dev`.

## Tính năng

| Trang | Đường dẫn | Nội dung |
|---|---|---|
| Trang chủ | `#/` | Danh sách đề, câu Part 5 làm thử ngay, lịch sử bài đã nộp |
| Giới thiệu đề | `#/de/:testId` | Chọn làm cả bài, chỉ Nghe hoặc chỉ Đọc; làm tiếp bài dở |
| Làm bài | `#/de/:testId/lam-bai/:scope` | Đồng hồ đếm ngược, audio tự phát theo nhóm câu, phiếu trả lời để chuyển câu, tự lưu, tự nộp khi hết giờ |
| Kết quả | `#/ket-qua/:id` | Điểm quy đổi thang 990, trình độ CEFR, đúng/sai theo Part, xem lại kèm transcript và giải thích |
| Luyện theo phần | `#/luyen-tap/part-N` | Làm từng nhóm câu của một Part, có đáp án ngay |
| Từ vựng | `#/tu-vung` | Lọc theo chủ đề và mức điểm, nghe phát âm, ẩn nghĩa để tự kiểm tra, đánh dấu đã thuộc |
| Ngữ pháp | `#/ngu-phap/:slug` | 13 chủ điểm, bẫy thường gặp, câu Part 5 liên quan để luyện |
| Về kỳ thi | `#/ky-thi` | Cấu trúc đề, thang điểm, lệ phí, mốc thay đổi 2025–2026, mẹo làm bài |

Bài làm, kết quả và tiến độ chỉ lưu trong `localStorage` của trình duyệt. Chưa có tài khoản hay đồng bộ giữa các máy.

## Cấu trúc mã

```
src/
├── lib/          types.ts (kiểu dữ liệu), data.tsx (tải toeic.json), exam.ts (chấm điểm, thời gian), storage.ts (localStorage)
├── components/   QuestionBlock (ô tròn A–D), Stimulus (audio, ảnh, đoạn văn, biểu đồ), AnswerSheet, AudioPlayer, Layout
├── pages/        Home, TestIntro, Exam, ResultPage, Practice, PracticeIndex, VocabPage, GrammarPage, InfoPage
└── styles.css    toàn bộ style; màu và cỡ chữ khai báo ở :root
```
