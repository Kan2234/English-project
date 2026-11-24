import { Component, type ReactNode } from 'react';
import { clearAllLocalData } from '../lib/storage';

// Last line of defence: an uncaught render error would otherwise unmount the
// whole app and leave a blank page on every visit (e.g. if saved data is bad).
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[On-TA] render error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page page--narrow">
        <div className="empty" role="alert">
          <strong>Trang gặp lỗi khi hiển thị.</strong>
          <span>Hãy tải lại trang. Nếu vẫn lỗi, xóa dữ liệu ôn thi lưu trên trình duyệt này (lịch sử bài làm, bài dở, từ đã thuộc) rồi tải lại.</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="btn btn--small" onClick={() => location.reload()}>
              Tải lại
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                clearAllLocalData();
                location.hash = '#/';
                location.reload();
              }}
            >
              Xóa dữ liệu và tải lại
            </button>
          </span>
        </div>
      </div>
    );
  }
}
