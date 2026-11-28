# Runbook

Mỗi runbook đi theo cùng một khung: **Dấu hiệu → Các bước → Kiểm chứng → Hậu kiểm**. Làm theo thứ tự, không bỏ bước. Bối cảnh về pipeline nằm trong README gốc, mục "CI trên GitHub".

| Tình huống | Runbook |
|---|---|
| Production lỗi sau khi deploy (đã hoặc chưa tự rollback) | [production-loi-sau-deploy.md](production-loi-sau-deploy.md) |
| Lộ token Cloudflare | [lo-token-cloudflare.md](lo-token-cloudflare.md) |
| CVE trong dependency npm hoặc base image Docker | [cve-dependency-base-image.md](cve-dependency-base-image.md) |
| Xoay token Cloudflare định kỳ (90 ngày) | [xoay-token-90-ngay.md](xoay-token-90-ngay.md) |
| Tag nhầm | [tag-nham.md](tag-nham.md) |
| Job hằng đêm đỏ (issue `Scheduled: … failing`) | [scheduled-job-do.md](scheduled-job-do.md) |
| Cập nhật tay tool binary và image đã pin | [cap-nhat-pin-thu-cong.md](cap-nhat-pin-thu-cong.md) |
| Diễn tập rollback (`drill.yml`) | [dien-tap-rollback.md](dien-tap-rollback.md) |
| GitHub tắt schedule sau 60 ngày không hoạt động | [schedule-bi-tat.md](schedule-bi-tat.md) |

Quy ước chung:

- Mọi thay đổi code, kể cả hotfix, đi qua `staging`: nhánh `fix/…` từ `staging` → PR → `staging/verified` xanh → Release PR vào `main` → tag bản patch.
- Tag `v*` không xóa, không dời được. Không tắt ruleset để "sửa nhanh".
- Repo public, log Actions cũng public: không dán token, log có secret hay dữ liệu cá nhân vào issue, comment hay commit.
- Postmortem viết ngắn ngay trong issue liên quan: chuyện gì xảy ra, ảnh hưởng, nguyên nhân, vì sao kiểm tra không bắt được, việc cần làm để không lặp lại.
