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

## Kiểm thử

```powershell
npm run lint            # oxlint: lỗi code, quy tắc React hooks và TypeScript (.oxlintrc.json)
npm run typecheck       # tsc --noEmit (TypeScript 7)
npm test                # Vitest: tests/unit (chấm điểm, localStorage, Leitner, Worker, dữ liệu)
npm run test:coverage   # như trên, kèm độ phủ; dưới ngưỡng trong vitest.config.ts thì báo lỗi
npm run e2e             # Playwright: tests/e2e, chạy vào site đang chạy (mặc định http://127.0.0.1:8081)
```

- Lint dùng [oxlint](https://oxc.rs) thay cho ESLint: typescript-eslint chưa chạy được với TypeScript 7.0 (bản 7.0 chưa có compiler API).
- Báo cáo độ phủ nằm trong `coverage/`, báo cáo E2E trong `playwright-report/`, trace và ảnh chụp khi test lỗi trong `test-results/`. Các thư mục này không được commit.
- `E2E_BASE_URL` đổi site cần kiểm tra, ví dụ bản staging trên Cloudflare.
- Chạy `npm run e2e` ngay trên máy (ngoài Docker) thì lần đầu cần `npx playwright install` để tải trình duyệt.
- Test chậm (phát audio thật) được gắn `@slow`: bỏ qua bằng `npm run e2e -- --grep-invert @slow`.

**Chạy E2E trong Docker vào staging trên máy.** Image Playwright phải cùng phiên bản với `@playwright/test` (1.57.0). Trên Docker Desktop cho Windows, `--network host` không dùng được, nên container gọi về máy qua `host.docker.internal`. Lệnh dưới đây chép mã sang `/app` trong container rồi mới `npm ci`, để `node_modules` bản Linux không ghi đè `node_modules` trên máy, sau đó chép báo cáo về lại thư mục repo.

```powershell
npm run deploy:staging   # build và chạy staging tại http://127.0.0.1:8081
docker run --rm --ipc=host -v "${PWD}:/src" -e E2E_BASE_URL=http://host.docker.internal:8081 mcr.microsoft.com/playwright:v1.57.0-noble sh -c 'mkdir /app && cd /src && tar -cf - package.json package-lock.json playwright.config.ts tests src | tar -xf - -C /app && cd /app && npm ci --ignore-scripts --no-audit --no-fund && npx playwright test; rc=$?; rm -rf /src/test-results /src/playwright-report; cp -r test-results playwright-report /src/; exit $rc'
```

Thêm `--project=chromium` (hoặc `firefox`, `webkit`, `mobile-375`, `tablet-768`) sau `npx playwright test` để chạy một trình duyệt. Xem báo cáo: `npx playwright show-report`.

### CI trên GitHub

Mỗi PR vào `staging` hoặc `main` chạy `.github/workflows/ci.yml` (không deploy, không dùng secret nên PR từ fork cũng chạy an toàn):

- `checks / lint`, `checks / typecheck`, `checks / unit` (kèm độ phủ), `checks / data` (`db:build` và `database/toeic.json` đã commit phải khớp với nguồn), `checks / build` (JS đầu không quá 400 kB). Các job này nằm trong `_checks.yml`, sau này `staging.yml` dùng lại.
- `secrets`: Gitleaks quét các commit của PR.
- `deps`: osv-scanner trên `package-lock.json` và `npm audit --audit-level=high` (gồm cả devDependencies). Muốn chấp nhận một lỗ hổng thì thêm vào `osv-scanner.toml` kèm lý do và `ignoreUntil`, không bỏ qua hàng loạt.
- `sast`: CodeQL (`security-extended`). Kết quả nằm ở tab Security; ruleset chặn merge khi có cảnh báo.
- `container`: hadolint, `docker build` và Trivy, chỉ chạy khi PR đổi `deploy/`, `.dockerignore` hoặc `.trivyignore`. Ngoại lệ ghi trong `.trivyignore`, có lý do và `exp:`.
- `ci-ok`: gom kết quả các job trên. Ruleset chỉ yêu cầu **một** check này; job bị bỏ qua (skipped) vẫn tính là đạt, job lỗi hay bị hủy thì `ci-ok` đỏ.

Mọi action được pin theo SHA. Kiểm tra workflow trên máy trước khi push (cần Docker):

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
docker run --rm -v "${PWD}/.github:/repo/.github:ro" -w /repo ghcr.io/zizmorcore/zizmor:1.32.0@sha256:3014cc8f68f663935f69b3c3e0e41f5ce102b268d97db13db0f62208747f860d --offline .github/workflows
```

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

## Triển khai trên Cloudflare Workers

Worker `english-project` nối với repo này qua Workers Builds. Mỗi lần push, Cloudflare chạy `npm run build` rồi `npx wrangler deploy`, theo cấu hình trong `wrangler.jsonc`.

- Push lên `main` sẽ cập nhật production: https://english-project.leminhkhang2234.workers.dev
- Push lên nhánh khác sẽ tạo bản preview, dùng như staging. Kiểm tra bản preview bằng `npm run check-site -- <URL preview>`, đạt thì mới merge vào `main`.
- `public/_headers` gắn header bảo mật và cache cho file tĩnh. Nội dung phải giống `deploy/security-headers.conf`.
- `worker/index.js` chỉ xử lý `/data/audio/*`. Static assets của Cloudflare không hỗ trợ `Range`, nên Worker này tự trả `206 Partial Content` để trình duyệt tua được audio. Worker cũng tự gắn header bảo mật, vì `_headers` không áp dụng cho response do Worker tạo ra.
- Đường dẫn sai trả lỗi 404 thật với trang `public/404.html`.
- Chạy thử trên máy: Smart App Control của Windows chặn `workerd.exe` (file không có chữ ký số), nên phải chạy `wrangler dev` trong Docker:

  ```bash
  docker run --rm -p 127.0.0.1:8787:8787 -v "$PWD:/src:ro" node:24-bookworm-slim sh -c 'apt-get update -qq && apt-get install -y -qq ca-certificates >/dev/null && mkdir /app && cd /src && tar --exclude=./node_modules --exclude=./.git -cf - . | tar -xf - -C /app && cd /app && npm ci && npx wrangler dev --ip 0.0.0.0 --port 8787'
  ```

  Chạy `npm run build` trước để có `dist/`.

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
| Về kỳ thi | `#/ky-thi` | Cấu trúc đề, thang điểm, mẹo làm bài |

Bài làm, kết quả và tiến độ chỉ lưu trong `localStorage` của trình duyệt. Chưa có tài khoản hay đồng bộ giữa các máy.

## Cấu trúc mã

```
src/
├── lib/          types.ts (kiểu dữ liệu), data.tsx (tải toeic.json), exam.ts (chấm điểm, thời gian), storage.ts (localStorage)
├── components/   QuestionBlock (ô tròn A–D), Stimulus (audio, ảnh, đoạn văn, biểu đồ), AnswerSheet, AudioPlayer, Layout
├── pages/        Home, TestIntro, Exam, ResultPage, Practice, PracticeIndex, VocabPage, GrammarPage, InfoPage
└── styles.css    toàn bộ style; màu và cỡ chữ khai báo ở :root
```
