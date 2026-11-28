# Lộ token Cloudflare

Token nằm trong secret `CLOUDFLARE_API_TOKEN` của hai GitHub Environment: `staging` (dùng bởi `staging.yml`, `drill.yml`) và `production` (dùng bởi `production.yml` qua `_release.yml`, và `rollback.yml`). Quyền đúng: chỉ `Account › Workers Scripts › Edit`.

## Dấu hiệu

- Cảnh báo **secret scanning** (tab Security) hoặc push bị **push protection** chặn.
- Job `secrets` của `ci.yml` đỏ, hoặc issue `Scheduled: secrets-history failing`.
- Token xuất hiện trong log Actions, issue, comment, ảnh chụp màn hình, file trong repo.
- Cloudflare có deployment lạ trên `english-project`, `english-project-staging` hoặc Worker không ai tạo.

Nghi ngờ là đủ để làm. Revoke trước, điều tra sau.

## Các bước

1. **Revoke ngay** trên Cloudflare: dash.cloudflare.com → **My Profile** → **API Tokens** → token bị lộ → **Delete**. Chưa biết token nào thì xóa cả hai (staging và production).
2. **Tạo token mới** cho từng Environment: **Create Token** → Custom token → Permissions `Account` · `Workers Scripts` · `Edit`; Account Resources: đúng account của bạn; không cấp quyền Zone/DNS. Đặt tên có ngày, ví dụ `onta-production-2027-02`.
3. **Cập nhật GitHub**: Settings → **Environments** → `staging` (rồi `production`) → `CLOUDFLARE_API_TOKEN` → Update secret. Không đặt token thành repository secret.
4. **Xem kẻ lạ đã làm gì**:
   - Cloudflare → Manage Account → **Audit Log**, lọc theo khoảng thời gian token còn sống.
   - Workers & Pages → từng Worker → **Deployments**: có version nào không do `release vX.Y.Z`, `staging <sha>`, `drill-…` hay `auto-rollback`/`manual rollback` tạo ra không. Có thì rollback production theo [production-loi-sau-deploy.md](production-loi-sau-deploy.md), xóa Worker lạ.
5. **Tìm chỗ lộ và dọn**:
   - Trong commit: lịch sử public đã bị sao chép (fork, cache), viết lại lịch sử không cứu được. Revoke ở bước 1 mới là cách sửa. Quét toàn bộ lịch sử: Actions → `scheduled` → **Run workflow** (nhánh `main`, tick `weekly`), xem job `secrets-history`.
   - Trong log Actions: mở lượt chạy → **⋯** → **Delete all logs**.
   - Trong issue/comment: sửa nội dung, rồi xóa bản cũ trong lịch sử chỉnh sửa (Edited → chọn bản → Delete revision).
   - Trên máy: không để file chứa token trong thư mục repo hay thư mục được đồng bộ lên mạng.

## Kiểm chứng

- Token cũ không còn trong danh sách API Tokens.
- Token staging mới: Actions → `staging` → **Run workflow** trên nhánh `staging` → job `deploy` xanh (lượt này deploy lại staging, vô hại). Ruleset cấm push thẳng vào `staging`, nên dùng Run workflow thay cho commit trống.
- Token production mới: được dùng ở lần phát hành kế tiếp; bước `Record the active version` (trước khi deploy) đọc API bằng token này, lỗi ở đó thì chưa có gì thay đổi trên Cloudflare.
- Job `secrets-history` xanh (hoặc chỉ còn phát hiện của token đã revoke, xem Hậu kiểm).

## Hậu kiểm

1. Mở issue (không dán token, không dán log có token): mốc thời gian, token nào, lộ ở đâu, đã revoke lúc nào, audit log có gì.
2. Nếu token đã revoke vẫn nằm trong lịch sử git: Gitleaks sẽ tiếp tục báo. Thêm fingerprint của phát hiện (in trong log, giá trị đã che bằng `--redact`) vào `.gitleaksignore` kèm comment `# revoked YYYY-MM-DD`, qua PR vào `staging`.
3. Ghi lại nguyên nhân gốc và cách chặn (ví dụ: thêm hook, đổi thói quen lưu token).
