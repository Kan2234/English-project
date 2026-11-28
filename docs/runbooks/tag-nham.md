# Tag nhầm

Tag `v*` được ruleset `rule_for_tags` bảo vệ: chỉ admin tạo được, **không xóa, không dời** được. Đây là chủ ý: một số phiên bản luôn chỉ một trạng thái code. Không tắt ruleset để sửa tag.

## Dấu hiệu

- Đặt sai số (ví dụ `v1.3.0` thay vì `v1.2.1`), đặt lên sai commit, hoặc tag đúng nhưng bản phát hành có lỗi.
- Lượt chạy `production` của tag đó đỏ ở `gate`, hoặc đang chờ Approve.

## Các bước

1. **Đang chờ Approve**: Actions → lượt chạy → **Review deployments** → **Reject** (hoặc Cancel workflow). Chưa có gì được deploy.
2. **Gate từ chối** (tag không nằm trên merge commit của Release PR, cây file khác staging, sai định dạng SemVer…): không có gì được deploy, không có GitHub Release. Để nguyên tag đó; nó không bao giờ phát hành được.
3. **Đã deploy, sai số phiên bản nhưng đúng code**: để nguyên. Các bản sau đánh số tiếp từ số cao nhất (SemVer cho phép bỏ qua số). Ghi chú trong changelog của Release PR kế tiếp.
4. **Đã deploy và bản đó lỗi**: làm theo [production-loi-sau-deploy.md](production-loi-sau-deploy.md) (rollback), rồi sửa qua `staging` và phát hành **bản patch kế tiếp**.
5. Tạo đúng tag cho lần phát hành thật, theo README mục "Phát hành production": tag trên merge commit mới nhất của `main`.

Không làm: `git push --delete origin vX.Y.Z`, `git tag -f`, force-push tag, xóa GitHub Release của tag để "làm lại".

## Kiểm chứng

- Environments → `production`: deployment mới nhất là tag đúng.
- Tab Releases: bản mới nhất là tag đúng, có `dist.tar.gz`, `sbom.cdx.json`.
- `npm run check-site -- https://english-project.leminhkhang2234.workers.dev` → 64/64.

## Hậu kiểm

- Ghi trong mô tả Release PR kế tiếp: tag nào bị nhầm, đã xử lý ra sao.
- Trước khi tag: `git fetch origin; git log -1 --oneline origin/main` và `git tag --list "v*" --sort=-v:refname | Select-Object -First 3` để chắc commit và số phiên bản.
