# Production lỗi sau khi deploy

Production: Worker `english-project`, https://english-project.leminhkhang2234.workers.dev.

## Dấu hiệu

- Lượt chạy `production` (tag `vX.Y.Z`) đỏ, có issue nhãn `incident` tên `Incident: release vX.Y.Z of english-project …`.
- Hoặc release đã xanh nhưng sau đó site lỗi: issue `Scheduled: site-prod failing` / `Scheduled: dast-prod failing`, hoặc người dùng báo.

## Các bước

Trước hết xác định đang ở trường hợp nào: mở issue `incident` (nếu có), xem dòng **Rolled back** và **Rollback verified**.

### A. Auto-rollback đã chạy và đã xác minh (`Rolled back = true`, `Rollback verified = true`)

Production đang chạy lại version trước và đã qua `check-site`. Không cần làm gì gấp.

1. Mở link **Run** trong issue → trang Summary (bảng `Release vX.Y.Z -> english-project`).
2. Tìm nguyên nhân: log job `release / deploy`, các bước `Smoke - check-site` và `Smoke - Playwright (@smoke, chromium)`; tải artifact `release-smoke-vX.Y.Z` (báo cáo Playwright, trace).
3. Sang mục Hậu kiểm.

### B. Auto-rollback lỗi hoặc chưa xác minh (`Rollback verified = false`)

1. Chạy rollback tay ngay: tab **Actions** → `rollback` → **Run workflow**.
   - "Use workflow from": chọn **tag** phát hành mới nhất (`vX.Y.Z`), không chọn nhánh (Environment `production` chỉ nhận tag `v*`).
   - `version_id`: để trống (= version chạy trước version hiện tại), hoặc dán version ID ở dòng **Version before** trong issue.
   - `reason`: ví dụ `auto-rollback v1.2.3 not verified`.
2. **Review deployments** → `production` → **Approve and deploy**.
3. Nếu workflow từ chối vì deployment hiện tại đã là một lần rollback: lấy version ID từ bảng "Recent deployments" trong Summary rồi chạy lại với `version_id`.
4. Nếu GitHub Actions không chạy được: làm theo mục D.

### C. Release đã xanh, lỗi phát hiện sau (auto-rollback không chạy)

1. Xác nhận: `npm run check-site -- https://english-project.leminhkhang2234.workers.dev`.
2. Lỗi thật thì rollback như mục B, bước 1–3.
3. Muốn quay về **nguyên một bản phát hành cũ** (build lại và deploy đúng tag đó): Actions → lượt chạy `production` của tag cũ → **Re-run all jobs**. Gate và bước Approve chạy lại; GitHub Release đã có thì giữ nguyên.

### D. Rollback trên Cloudflare dashboard (khi Actions không dùng được)

1. dash.cloudflare.com → **Workers & Pages** → `english-project` → **Deployments**.
2. Chọn version trước version lỗi (message `release vX.Y.Z` của bản tốt gần nhất) → **⋯** → **Rollback** → ghi lý do.
3. Ghi lại version ID đã chọn vào issue.

## Kiểm chứng

- `npm run check-site -- https://english-project.leminhkhang2234.workers.dev` → `64 passed, 0 failed`.
- Summary của lượt `rollback`: dòng **Rollback** = `success`, **check-site** = `success`.
- Mở site trên điện thoại: trang chủ, một đề, phát được audio.
- Đêm sau, issue `Scheduled: site-prod failing` (nếu có) tự đóng.

## Hậu kiểm

1. Sửa lỗi qua `staging` như hotfix (nhánh `fix/…` từ `staging`), chờ `staging/verified`, Release PR vào `main`, tag **bản patch kế tiếp**. Không dùng lại tag đã hỏng.
2. Bổ sung kiểm tra để lần sau bắt được lỗi trước production: test `@smoke`, mục trong `scripts/check-site.mjs`, hoặc E2E.
3. Viết postmortem trong issue `incident`: mốc thời gian, ảnh hưởng (bao lâu, trang nào), nguyên nhân, vì sao staging không bắt được, việc tiếp theo. Rồi đóng issue.
4. Theo mục 8 của kế hoạch CI/CD, một release đã bị rollback được tính là **thất bại**, kể cả khi rollback thành công.
