# Diễn tập rollback (`drill.yml`)

Diễn tập chứng minh đường phát hành production tự rollback được, trên Worker riêng `english-project-drill` (`env.drill` trong `wrangler.jsonc`), dùng Environment `staging`. Không đụng production.

## Dấu hiệu (khi nào nó chạy)

- Tự động: push vào `staging` có đổi một trong các file `_release.yml`, `drill.yml`, `production.yml`, `rollback.yml`, `scripts/cf-versions.mjs`, `scripts/check-site.mjs`, `wrangler.jsonc`, `package-lock.json`. Vì có `package-lock.json`, **mỗi PR npm của Dependabot** sau khi merge cũng chạy một lần diễn tập.
- Bấm tay: Actions → `drill` → **Run workflow**, nhánh `staging`. Nên chạy trước một đợt phát hành lớn nếu lâu chưa diễn tập.

## Các bước

1. Mở lượt chạy `drill`. Thứ tự job: `baseline` (deploy bản A) → `broken` (deploy bản B, cố ý cho smoke lỗi, tự rollback về A, mở issue `incident` + `drill`) → `verdict` → `cleanup` (xóa Worker drill, luôn chạy).
2. Đọc **verdict**: trang Summary, bảng "Rollback drill". Mỗi dòng `pass` hoặc **`FAIL`**:
   - baseline released (A) / A is a version ID
   - broken run ended as a verified rollback
   - B was deployed and differs from A / B's rollback target was A
   - rolled_back = true / rollback_verified = true
   - incident issue labelled incident + drill
   
   Cuối bảng là **Drill passed.** hoặc **Drill FAILED: n check(s).**
3. **Đạt**: issue `Drill: Incident: …` được tự đóng kèm comment. Không cần làm gì.
4. **Không đạt**: issue drill được để mở. Đường rollback của production đang có vấn đề, nên **không phát hành** cho tới khi sửa xong.
   - Xem dòng `FAIL` đầu tiên, rồi log job tương ứng (`baseline / deploy`, `broken / deploy`), bước `Auto-rollback` và `Verify the site after the rollback`.
   - Sửa qua PR vào `staging` đụng tới một trong các file ở trên: diễn tập tự chạy lại.
5. **`cleanup` đỏ** (Worker `english-project-drill` còn lại): Worker này không có binding, không dùng chung gì với production, nên không gấp, nhưng phải dọn:
   - Mở lượt chạy → **Re-run failed jobs** (chạy lại `cleanup`). Script chỉ chịu xóa Worker có tên kết thúc bằng `-drill`, Worker đã không còn thì coi như xong.
   - Vẫn lỗi: dash.cloudflare.com → Workers & Pages → **`english-project-drill`** → Settings → Delete. Kiểm tra kỹ tên trước khi xóa; không bao giờ xóa `english-project` hay `english-project-staging`.
   - Lỗi 403: token staging thiếu quyền `Workers Scripts › Edit` (xem [xoay-token-90-ngay.md](xoay-token-90-ngay.md)).

## Kiểm chứng

- Verdict **Drill passed.**, job `cleanup` xanh.
- https://english-project-drill.leminhkhang2234.workers.dev không còn phục vụ site (Cloudflare trả lỗi).
- Issue drill của lượt đó đã đóng.

## Hậu kiểm

- Diễn tập đỏ: viết postmortem ngắn trong issue drill (check nào trượt, vì sao, PR sửa), rồi đóng tay sau khi một lượt diễn tập mới đã đạt.
- Một quy trình rollback chưa diễn tập thì coi như chưa có: nếu vài tháng không có lượt tự động nào, bấm tay một lần.
