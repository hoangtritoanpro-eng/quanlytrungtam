import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = {
  ADMIN:   [
    { icon: '📊', label: 'Dashboard',    path: '/dashboard' },
    { icon: '🏫', label: 'Lớp học',      path: '/classes' },
    { icon: '👤', label: 'Học sinh',     path: '/students' },
    { icon: '✅', label: 'Điểm danh',    path: '/attendance' },
    { icon: '📝', label: 'Điểm số',      path: '/grades' },
    { icon: '💰', label: 'Học phí',      path: '/tuition' },
    { icon: '👥', label: 'Người dùng',   path: '/users' },
  ],
  TEACHER: [
    { icon: '🏫', label: 'Lớp của tôi',  path: '/classes' },
    { icon: '✅', label: 'Điểm danh',    path: '/attendance' },
    { icon: '📝', label: 'Điểm số',      path: '/grades' },
    { icon: '💰', label: 'Học phí',      path: '/tuition' },
  ],
  TA:      [
    { icon: '🏫', label: 'Lớp của tôi',  path: '/classes' },
    { icon: '✅', label: 'Điểm danh',    path: '/attendance' },
  ],
};

const ROLE_LABEL = { ADMIN: 'Quản trị viên', TEACHER: 'Giáo viên', TA: 'Trợ giảng' };

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  const items = NAV[user.role] || [];

  const Sidebar = () => (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h2>🎓 Quản lý Trung tâm</h2>
        <p>Hệ thống quản lý học tập</p>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section">Menu chính</div>
        {items.map(item => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => { navigate(item.path); setOpen(false); }}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{(user.name || 'U')[0].toUpperCase()}</div>
          <div className="user-card-info">
            <div className="user-card-name">{user.name}</div>
            <div className="user-card-role">{ROLE_LABEL[user.role] || user.role}</div>
          </div>
        </div>
        <button className="btn-logout" onClick={() => { logout(); navigate('/login'); }}>
          Đăng xuất
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-layout">
      <Sidebar />
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <main className="main-content">
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setOpen(true)}>☰</button>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'white' }}>🎓 Trung tâm</span>
          <div />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
