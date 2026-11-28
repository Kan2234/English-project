# Job hằng đêm đỏ

`.github/workflows/scheduled.yml` chạy mỗi đêm lúc 02:17 giờ Việt Nam (19:17 UTC), từ nhánh `main`. Job `report` mở **một** issue cho mỗi job đỏ, tiêu đề `Scheduled: <job> failing`, nhãn `scheduled`.

## Dấu hiệu

- Issue mới nhãn `scheduled`, hoặc comment mới `Still failing on …` trong issue đang mở.
- Tab Actions → `scheduled`: lượt chạy đỏ.

## Các bước

### 1. Đọc issue

Bảng trong issue có: **Job**, **Checks** (job đó kiểm tra gì), **Result**, **Date**, **Run**. Mỗi đêm job còn đỏ thì có thêm một comment; số comment cho biết lỗi kéo dài bao lâu.

- `failure`: kiểm tra trượt thật, hoặc tải công cụ lỗi (xem log).
- `cancelled`: job vượt `timeout-minutes` hoặc runner gặp sự cố. Thường chạy lại là hết.

### 2. Mở lượt chạy và xử lý theo job

| Job | Xem ở đâu | Xử lý |
|---|---|---|
| `site-prod` | Summary "check-site: production", các dòng `FAIL` | Site production hỏng thật: [production-loi-sau-deploy.md](production-loi-sau-deploy.md). Lỗi mạng thoáng qua: chạy lại |
| `site-staging` | Summary "check-site: staging" | Xem lượt `staging` gần nhất; sửa qua PR vào `staging` |
| `deps` | Log bước `osv-scanner`, `npm audit` | [cve-dependency-base-image.md](cve-dependency-base-image.md) |
| `container` | Log bước `Trivy image scan` | [cve-dependency-base-image.md](cve-dependency-base-image.md), mục base image |
| `dast-prod` | Summary "ZAP baseline", dòng `BLOCKING`; artifact `zap-report-production` | Thiếu header: sửa cả ba nơi `worker/index.js`, `public/_headers`, `deploy/security-headers.conf`. Cảnh báo chấp nhận được: hạ mức trong `.zap/rules.tsv`, một dòng lý do |
| `secrets-history` (Chủ nhật) | Log bước `gitleaks (full history)`: rule, file, commit, fingerprint (giá trị đã che) | Secret thật: [lo-token-cloudflare.md](lo-token-cloudflare.md). Báo nhầm: thêm fingerprint vào `.gitleaksignore` kèm comment lý do |
| `plan` | Log job `plan` | Lỗi hạ tầng; chạy lại |

Sửa code luôn qua PR vào `staging`, rồi Release PR vào `main`.

### 3. Chạy lại

- Chạy lại cả lượt: Actions → `scheduled` → **Run workflow**, nhánh `main` (tick `weekly` nếu cần job `secrets-history`). Lượt này cũng mở, comment hay đóng issue như lượt đêm.
- Chạy từ nhánh khác `main` là **chạy thử**: job `report` chỉ in ra những gì nó sẽ làm, không đụng issue.

## Kiểm chứng

- Job `report` tự **comment và đóng** issue ở lượt đầu tiên job đó xanh. Không cần đóng tay.
- Job hằng đêm quét code của `main`: lỗi trong code (lockfile, Dockerfile, header) chỉ hết sau khi bản sửa đã vào `main`. Lỗi trên site production chỉ hết sau khi đã phát hành (tag).

## Hậu kiểm

- Trước hoặc sau khi issue tự đóng, comment nguyên nhân và cách sửa (PR nào, ngoại lệ đến ngày nào).
- Không đổi tiêu đề, không gỡ nhãn `scheduled` của issue đang mở: `report` tìm issue theo đúng nhãn và tiêu đề, đổi đi thì đêm sau sẽ có issue trùng.
- Đóng tay khi job vẫn đỏ thì đêm sau một issue mới được mở.
