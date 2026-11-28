# Xoay token Cloudflare định kỳ (90 ngày)

Mỗi Environment (`staging`, `production`) có token riêng trong secret `CLOUDFLARE_API_TOKEN`. Xoay mỗi 90 ngày, hoặc ngay khi nghi lộ (khi đó dùng [lo-token-cloudflare.md](lo-token-cloudflare.md)).

## Dấu hiệu

- Đã 90 ngày kể từ lần cập nhật secret. Xem ngày cập nhật:

  ```powershell
  gh api repos/Kan2234/English-project/environments/staging/secrets/CLOUDFLARE_API_TOKEN --jq .updated_at
  gh api repos/Kan2234/English-project/environments/production/secrets/CLOUDFLARE_API_TOKEN --jq .updated_at
  ```

- Đặt nhắc lịch cho lần kế tiếp ngay sau mỗi lần xoay.

## Các bước

Thứ tự: tạo token mới → cập nhật secret → kiểm chứng → mới xóa token cũ. Như vậy không lúc nào pipeline không có token chạy được.

1. dash.cloudflare.com → **My Profile** → **API Tokens** → **Create Token** → Custom token:
   - Permissions: `Account` · `Workers Scripts` · `Edit` (thêm `D1` · `Edit` khi đã có backend).
   - Account Resources: đúng account của bạn. Không cấp Zone/DNS.
   - Tên có Environment và tháng, ví dụ `onta-staging-2027-02`.
2. **Staging**: Settings → Environments → `staging` → `CLOUDFLARE_API_TOKEN` → Update secret.
3. Kiểm chứng staging (xem bên dưới), rồi xóa token staging cũ trên Cloudflare.
4. **Production**: nên làm ngay trước một lần phát hành đã định. Tạo token, Update secret trong Environment `production`.
5. Kiểm chứng production ở lần phát hành đó, rồi xóa token production cũ.

## Kiểm chứng

- Staging: Actions → `staging` → **Run workflow** trên nhánh `staging` → job `deploy` xanh. Ruleset cấm push thẳng vào `staging`, nên Run workflow thay cho "commit trống". Nếu muốn thử cả đường rollback: Actions → `drill` → **Run workflow** trên `staging` (cũng dùng token staging).
- Production: không có cách thử token mà không đụng production, nên dùng lần phát hành kế tiếp. Bước `Record the active version` của `_release.yml` gọi API bằng token mới **trước** khi deploy; nếu token sai thì lượt chạy dừng ở đó và Cloudflare không thay đổi gì. Khi đó cập nhật lại secret rồi **Re-run all jobs**.
- Trên Cloudflare chỉ còn token mới của từng Environment.

## Hậu kiểm

- Ghi ngày xoay và ngày đến hạn kế tiếp (lịch cá nhân hoặc một issue nhắc việc).
- Nếu bước kiểm chứng lỗi: ghi lại nguyên nhân (thiếu quyền, chọn sai account) để lần sau tránh.
