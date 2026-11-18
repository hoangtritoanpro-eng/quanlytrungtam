import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, hasRemoteBackend } from '../api';
import Modal from './Modal';
import SearchPalette from './SearchPalette';

const NAV = {
  ADMIN: [
    { icon: '📊', label: 'Dashboard', path: '/dashboard' },
    { icon: '📅', label: 'Lịch học', path: '/schedule' },
    { icon: '🏫', label: 'Lớp học', path: '/classes' },
    { icon: '👤', label: 'Học sinh', path: '/students' },
    { icon: '✅', label: 'Điểm danh', path: '/attendance' },
    { icon: '📝', label: 'Điểm số', path: '/grades' },
    { icon: '💰', label: 'Học phí', path: '/tuition' },
    { icon: '👥', label: 'Người dùng', path: '/users' },
  ],
  TEACHER: [
    { icon: '📅', label: 'Lịch học', path: '/schedule' },
    { icon: '🏫', label: 'Lớp của tôi', path: '/classes' },
    { icon: '✅', label: 'Điểm danh', path: '/attendance' },
    { icon: '📝', label: 'Điểm số', path: '/grades' },
    { icon: '💰', label: 'Học phí', path: '/tuition' },
  ],
  TA: [
    { icon: '📅', label: 'Lịch học', path: '/schedule' },
    { icon: '🏫', label: 'Lớp của tôi', path: '/classes' },
    { icon: '✅', label: 'Điểm danh', path: '/attendance' },
  ],
};

const ROLE_LABEL = { ADMIN: 'Quản trị viên', TEACHER: 'Giáo viên', TA: 'Trợ giảng' };

export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetInfo, setSheetInfo] = useState(null);
  const remote = hasRemoteBackend();

  // Ctrl+K (hoặc Cmd+K trên Mac) để mở ô tìm nhanh từ bất kỳ trang nào
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (showSyncModal && remote && user?.role === 'ADMIN' && !sheetInfo) {
      api('getSystemInfo', {}, user.email)
        .then(setSheetInfo)
        .catch(() => setSheetInfo({ spreadsheetUrl: '' }));
    }
  }, [showSyncModal]);

  if (!user) {
    if (location.pathname === '/schedule') {
      return <Navigate to="/lich-hoc" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  const items = NAV[user.role] || [];

  const handleExport = () => {
    try {
      const data = {
        db: JSON.parse(
          localStorage.getItem('nangmai_local_db_v2') ||
            localStorage.getItem('nangmai_local_db_v1') ||
            '{}'
        ),
        scheduleSlots: JSON.parse(
          localStorage.getItem('toanx_schedule_slots_v2') ||
            localStorage.getItem('toanx_schedule_slots_v1') ||
            '[]'
        ),
        scheduleSites: JSON.parse(
          localStorage.getItem('toanx_schedule_sites_v2') ||
            localStorage.getItem('toanx_schedule_sites_v1') ||
            '[]'
        ),
        scheduleTeachers: JSON.parse(
          localStorage.getItem('toanx_schedule_teachers_v2') ||
            localStorage.getItem('toanx_schedule_teachers_v1') ||
            '{}'
        ),
        exportedAt: new Date().toISOString(),
      };
      const str = JSON.stringify(data, null, 2);
      navigator.clipboard?.writeText(str);
      toast('Đã sao chép toàn bộ dữ liệu vào bộ nhớ tạm (Clipboard)!');
    } catch (e) {
      toast('Lỗi khi xuất dữ liệu: ' + e.message, 'error');
    }
  };

  const handleDownloadBackup = () => {
    try {
      const data = {
        db: JSON.parse(
          localStorage.getItem('nangmai_local_db_v2') ||
            localStorage.getItem('nangmai_local_db_v1') ||
            '{}'
        ),
        scheduleSlots: JSON.parse(
          localStorage.getItem('toanx_schedule_slots_v2') ||
            localStorage.getItem('toanx_schedule_slots_v1') ||
            '[]'
        ),
        scheduleSites: JSON.parse(
          localStorage.getItem('toanx_schedule_sites_v2') ||
            localStorage.getItem('toanx_schedule_sites_v1') ||
            '[]'
        ),
        scheduleTeachers: JSON.parse(
          localStorage.getItem('toanx_schedule_teachers_v2') ||
            localStorage.getItem('toanx_schedule_teachers_v1') ||
            '{}'
        ),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nangmai_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Đã tải xuống tệp sao lưu dữ liệu!');
    } catch (e) {
      toast('Lỗi khi tải tệp sao lưu: ' + e.message, 'error');
    }
  };

  const handleImport = () => {
    if (!importJson.trim()) {
      toast('Vui lòng dán dữ liệu JSON vào ô bên dưới', 'warning');
      return;
    }
    try {
      const parsed = JSON.parse(importJson.trim());
      if (parsed.db && typeof parsed.db === 'object') {
        localStorage.setItem('nangmai_local_db_v2', JSON.stringify(parsed.db));
      }
      if (Array.isArray(parsed.scheduleSlots)) {
        localStorage.setItem('toanx_schedule_slots_v2', JSON.stringify(parsed.scheduleSlots));
      }
      if (Array.isArray(parsed.scheduleSites)) {
        localStorage.setItem('toanx_schedule_sites_v2', JSON.stringify(parsed.scheduleSites));
      }
      if (parsed.scheduleTeachers && typeof parsed.scheduleTeachers === 'object') {
        localStorage.setItem(
          'toanx_schedule_teachers_v2',
          JSON.stringify(parsed.scheduleTeachers)
        );
      }
      toast('Đã nạp dữ liệu thành công! Đang làm mới trang...');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (e) {
      toast('Dữ liệu JSON không hợp lệ: ' + e.message, 'error');
    }
  };

  const handleResetClean = () => {
    if (
      !confirm(
        'Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu mẫu cũ (lớp, học sinh, ca học cũ) và đưa hệ thống về trạng thái ban đầu?'
      )
    ) {
      return;
    }
    localStorage.removeItem('nangmai_local_db_v1');
    localStorage.removeItem('nangmai_local_db_v2');
    localStorage.removeItem('toanx_schedule_slots_v1');
    localStorage.removeItem('toanx_schedule_slots_v2');
    localStorage.removeItem('toanx_schedule_teachers_v1');
    localStorage.removeItem('toanx_schedule_teachers_v2');
    toast('Đã làm sạch dữ liệu thành công! Đang tải lại trang...');
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  const Sidebar = () => (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h2>🎓 Quản lý Trung tâm</h2>
        <p>Hệ thống quản lý học tập</p>
      </div>
      <button
        type="button"
        className="sidebar-search"
        onClick={() => {
          setOpen(false);
          setSearchOpen(true);
        }}
      >
        <span>🔍 Tìm nhanh...</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="sidebar-nav">
        <div className="nav-section">Menu chính</div>
        {items.map(item => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => {
              navigate(item.path);
              setOpen(false);
            }}
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
        {user.role === 'ADMIN' && (
          <button
            className="btn-logout"
            style={{
              background: '#f0fdfa',
              color: '#0d9488',
              border: '1px solid #99f6e4',
              marginBottom: '8px',
            }}
            onClick={() => setShowSyncModal(true)}
          >
            💾 {remote ? 'Dữ liệu & Sao lưu' : 'Đồng bộ / Sao lưu'}
          </button>
        )}
        <button
          className="btn-logout"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
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
          <button className="menu-btn" onClick={() => setOpen(true)}>
            ☰
          </button>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'white' }}>🎓 Trung tâm</span>
          <button className="menu-btn" onClick={() => setSearchOpen(true)} aria-label="Tìm nhanh">
            🔍
          </button>
        </div>
        <Outlet />
      </main>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} user={user} pages={items} />

      {/* Modal Đồng bộ & Sao lưu Dữ liệu */}
      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="💾 Quản lý & Đồng bộ Dữ liệu"
        size="modal-lg"
      >
        {remote ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                padding: '12px 16px',
                background: '#f0fdfa',
                borderRadius: '8px',
                border: '1px solid #99f6e4',
                fontSize: '0.9rem',
                color: '#0f766e',
              }}
            >
              <strong>☁️ Dữ liệu đang lưu trên Google Sheet.</strong> Mọi máy tính và điện thoại đăng nhập
              đều dùng chung một dữ liệu, không cần sao chép qua lại nữa.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sheetInfo === null ? (
                <span style={{ color: 'var(--text-muted)' }}>Đang lấy link Google Sheet...</span>
              ) : sheetInfo.spreadsheetUrl ? (
                <a className="btn btn-primary" href={sheetInfo.spreadsheetUrl} target="_blank" rel="noreferrer">
                  📊 Mở Google Sheet{sheetInfo.spreadsheetName ? ` "${sheetInfo.spreadsheetName}"` : ''}
                </a>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>
                  Không lấy được link. Hãy cập nhật Apps Script lên phiên bản mới nhất.
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)' }}>
              <strong>Sao lưu định kỳ:</strong> trong Google Sheet chọn <em>Tệp → Tạo bản sao</em> (lưu thêm
              một bản), hoặc <em>Tệp → Tải xuống → Microsoft Excel</em> để lưu về máy. Google Sheet cũng tự giữ
              lịch sử phiên bản tại <em>Tệp → Nhật ký phiên bản</em>.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowSyncModal(false)}>
                Đóng
              </button>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '12px 16px',
              background: '#f0fdfa',
              borderRadius: '8px',
              border: '1px solid #99f6e4',
              fontSize: '0.9rem',
              color: '#0f766e',
            }}
          >
            <strong>💡 Cách đồng bộ giữa Localhost và Vercel:</strong>
            <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>
                Trên trang máy cá nhân (Localhost): Bấm <strong>Sao chép dữ liệu</strong>.
              </li>
              <li>
                Mở trang web trên Vercel: Mở hộp thoại này, dán vào ô bên dưới rồi bấm{' '}
                <strong>Nạp dữ liệu vào web</strong>.
              </li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleExport}>
              📋 Sao chép dữ liệu (Copy)
            </button>
            <button className="btn btn-secondary" onClick={handleDownloadBackup}>
              📥 Tải file sao lưu (.json)
            </button>
            <button
              className="btn btn-danger"
              style={{ marginLeft: 'auto' }}
              onClick={handleResetClean}
            >
              🗑️ Xóa sạch dữ liệu mẫu cũ
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Dán mã sao lưu JSON vào đây để nạp dữ liệu sang Vercel / máy khác:
            </label>
            <textarea
              className="form-control"
              rows={4}
              placeholder='Dán nội dung JSON vào đây (VD: { "db": { ... } })...'
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => setShowSyncModal(false)}>
              Đóng
            </button>
            <button className="btn btn-primary" onClick={handleImport}>
              ⚡ Nạp dữ liệu vào web
            </button>
          </div>
        </div>
        )}
      </Modal>
    </div>
  );
}
