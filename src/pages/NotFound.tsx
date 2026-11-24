import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page page--narrow">
      <div className="empty">
        <strong>Không có trang này.</strong>
        <span>Đường dẫn có thể đã sai hoặc đề thi đã bị đổi tên.</span>
        <Link className="btn btn--small" to="/">
          Về danh sách đề
        </Link>
      </div>
    </div>
  );
}
