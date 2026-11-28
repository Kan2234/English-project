# GitHub tắt schedule sau 60 ngày không hoạt động

Ở repo public, GitHub tự **tắt** các workflow chạy theo `schedule` khi repo không có hoạt động nào trong 60 ngày. Ở repo này có hai workflow như vậy: `scheduled.yml` (mỗi đêm) và `codeql.yml` (mỗi tuần). Khi bị tắt, các lượt quét đêm ngừng lặng lẽ: không có lượt đỏ, không có issue.

## Dấu hiệu

- Actions → `scheduled` (hoặc `codeql`): banner báo workflow đã bị tắt vì repo không có hoạt động; không có lượt chạy mới nhiều ngày.
- GitHub thường gửi email báo trước khi tắt.
- Kiểm tra nhanh:

  ```powershell
  gh workflow list --all -R Kan2234/English-project
  gh run list --workflow scheduled.yml -R Kan2234/English-project --limit 3
  ```

  Trạng thái `disabled_inactivity` nghĩa là đã bị tắt vì lý do này.

## Các bước

1. Bật lại: Actions → `scheduled` → **Enable workflow**, hoặc:

   ```powershell
   gh workflow enable scheduled.yml -R Kan2234/English-project
   gh workflow enable codeql.yml -R Kan2234/English-project
   ```

2. Bù khoảng thời gian bị bỏ lỡ: Actions → `scheduled` → **Run workflow** trên `main`, tick `weekly` (quét cả lịch sử bằng gitleaks). Actions → `codeql` → **Run workflow** trên `main`.
3. Xử lý các issue `scheduled` mà lượt chạy bù mở ra ([scheduled-job-do.md](scheduled-job-do.md)).

## Kiểm chứng

- `gh workflow list --all` báo `active` cho cả hai workflow.
- Sáng hôm sau có một lượt `scheduled` mới chạy lúc khoảng 02:17 giờ Việt Nam.

## Hậu kiểm

- Ghi chú trong một issue: bị tắt từ khi nào đến khi nào, lượt bù có phát hiện gì không.
- Schedule chỉ chạy từ nhánh mặc định `main`. Repo ít hoạt động thì đặt nhắc lịch mỗi tháng xem tab Actions một lần.
