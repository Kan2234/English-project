import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useDataState } from '../lib/data';

export function DataGate({ children }: { children: ReactNode }) {
  const s = useDataState();
  if (s.status === 'loading') return <p className="loading">Đang tải đề thi…</p>;
  if (s.status === 'error')
    return (
      <div className="page page--narrow">
        <div className="empty">
          <strong>{s.message}</strong>
          <span>Kiểm tra file public/data/toeic.json. Chạy lại lệnh npm run dev để đồng bộ dữ liệu từ thư mục database.</span>
        </div>
      </div>
    );
  return <>{children}</>;
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Ôn TOEIC – trang chủ">
      <span className="brand__mark" aria-hidden="true" />
      Ôn TOEIC
    </Link>
  );
}

export function Layout() {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <Brand />
          <nav className="nav" aria-label="Chính">
            <NavLink to="/" end>
              Đề thi
            </NavLink>
            <NavLink to="/luyen-tap">Luyện theo phần</NavLink>
            <NavLink to="/tu-vung">Từ vựng</NavLink>
            <NavLink to="/ngu-phap">Ngữ pháp</NavLink>
            <NavLink to="/ky-thi">Về kỳ thi</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
