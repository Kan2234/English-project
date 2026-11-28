# Cập nhật tay tool binary và image đã pin

Dependabot (`.github/dependabot.yml`) tự cập nhật npm, action (SHA + comment `# vX.Y.Z`) và base image trong `deploy/Dockerfile`. **Không** ecosystem nào của Dependabot đọc được các pin dưới đây, nên phải cập nhật tay.

| Thứ được pin | Phiên bản hiện tại | Nằm ở đâu | File checksum của release |
|---|---|---|---|
| gitleaks | 8.30.1 | `ci.yml` job `secrets`; `scheduled.yml` job `secrets-history` (`GITLEAKS_VERSION`, `GITLEAKS_SHA256`) | `gitleaks_<v>_checksums.txt`, dòng `gitleaks_<v>_linux_x64.tar.gz` |
| osv-scanner | 2.7.1 | `ci.yml` và `scheduled.yml`, job `deps` (`OSV_SCANNER_*`) | `osv-scanner_SHA256SUMS`, dòng `osv-scanner_linux_amd64` |
| hadolint | 2.15.1 | `ci.yml` job `container` (`HADOLINT_*`) | `checksums.sha256`, dòng `hadolint-linux-x86_64` |
| trivy | 0.76.2 | `ci.yml` và `scheduled.yml`, job `container` (`TRIVY_*`) | `trivy_<v>_checksums.txt`, dòng `trivy_<v>_Linux-64bit.tar.gz` |
| syft | 1.57.1 | `production.yml` job `publish` (`SYFT_*`) | `syft_<v>_checksums.txt`, dòng `syft_<v>_linux_amd64.tar.gz` |
| Image Playwright | `v1.57.0-noble@sha256:3bed…` | `staging.yml` job `e2e`; `_release.yml` (`PLAYWRIGHT_IMAGE`); lệnh trong README | digest của image |
| Image ZAP | `2.17.0@sha256:9624…` | `staging.yml` job `dast`; `scheduled.yml` job `dast-prod`; lệnh trong README | digest của image |
| Image actionlint, zizmor | `1.7.12@sha256:…`, `1.32.0@sha256:…` | lệnh trong README (mục "CI trên GitHub") | digest của image |

## Dấu hiệu

- Tool có bản mới sửa lỗi bảo mật, hoặc sửa một lỗi mà CI đang gặp.
- Định kỳ: mỗi quý xem lại cả bảng một lần.
- `@playwright/test` có bản mới: Dependabot sẽ không mở PR cho gói này (được `ignore` trong `dependabot.yml`, vì phải đi cùng image), nên cũng xem lại theo quý.

## Các bước

1. **Quy tắc 14 ngày**: chỉ dùng bản đã phát hành ít nhất 14 ngày.

   ```powershell
   gh release view v8.31.0 -R gitleaks/gitleaks --json publishedAt,assets --jq '.publishedAt, [.assets[].name]'
   ```

2. **Lấy checksum từ file checksum của release** (không tự tính từ file vừa tải, vì như vậy chỉ chứng minh file giống chính nó):

   ```powershell
   gh release download v8.31.0 -R gitleaks/gitleaks -p 'gitleaks_8.31.0_checksums.txt' -O - | Select-String linux_x64
   ```

   Rồi tải đúng file binary và đối chiếu: `curl -fsSLo f.tar.gz <url>; (Get-FileHash f.tar.gz -Algorithm SHA256).Hash.ToLower()` phải bằng giá trị trong file checksum. Trivy và syft còn có chữ ký Sigstore cho file checksum (`*.sigstore.json`) nếu muốn kiểm thêm bằng `cosign`.
3. **Digest image** (lấy digest của **index** đa kiến trúc, giống các pin hiện có):

   ```powershell
   docker buildx imagetools inspect ghcr.io/zaproxy/zaproxy:2.18.0 --format '{{json .Manifest.Digest}}'
   ```

   Pin dạng `image:tag@sha256:<digest>`: tag để người đọc biết phiên bản, digest để không ai đổi được nội dung.
4. **Sửa mọi nơi cùng lúc**: `git grep -n "8.30.1"` (và digest cũ) để không sót file nào, kể cả README. Comment cạnh checksum giữ nguyên dạng "sha256 of … from the release's …".
5. **Playwright** (phải đồng bộ):
   - `package.json`: `@playwright/test` đúng phiên bản mới (không có `^`), rồi `npm install` để cập nhật `package-lock.json`.
   - Image `mcr.microsoft.com/playwright:v<cùng phiên bản>-noble@sha256:<digest>` trong `staging.yml` và `_release.yml`, và trong lệnh README.
   - `ci.yml` không chạy E2E, nên chạy E2E trong Docker trên máy trước (lệnh trong README, mục "Kiểm thử") với image mới.
   - Một PR duy nhất cho cả ba chỗ. Sai lệch phiên bản làm job `e2e` của `staging.yml` và smoke của `_release.yml` đỏ.
6. **Action** cập nhật tay (khi không chờ Dependabot): lấy SHA của tag, nếu là annotated tag thì lấy commit mà nó trỏ tới:

   ```powershell
   gh api repos/actions/checkout/git/ref/tags/v7.0.2 --jq '.object.type + " " + .object.sha'
   gh api repos/actions/checkout/git/tags/<sha-cua-tag> --jq .object.sha   # chỉ khi type = tag
   ```

   Ghi `uses: owner/repo@<sha commit> # v7.0.2`; comment phải **kết thúc** bằng phiên bản để Dependabot cập nhật được về sau.
7. Chạy actionlint và zizmor (lệnh trong README), mở PR vào `staging`.

## Kiểm chứng

- Log CI có dòng `<file>: OK` của `sha256sum -c` ở bước "Install … (pinned, checksum verified)".
- PR: `ci-ok` xanh. Tool chỉ có trong `scheduled.yml`: sau khi vào `main`, Actions → `scheduled` → **Run workflow** (tick `weekly` nếu đổi gitleaks). Có thể chạy từ nhánh PR trước: lượt đó là chạy thử, không đụng issue.
- Playwright: `staging.yml` job `e2e` xanh sau khi merge.

## Hậu kiểm

- Đọc release notes của tool: đổi cờ dòng lệnh, đổi exit code, đổi định dạng báo cáo (`scripts/zap-gate.mjs` đọc JSON của ZAP).
- Cập nhật cột "Phiên bản hiện tại" trong bảng trên.
