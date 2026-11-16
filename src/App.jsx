import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Grades from './pages/Grades';
import Tuition from './pages/Tuition';
import Users from './pages/Users';
import ParentView from './pages/ParentView';
import Schedule from './pages/Schedule';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Đã xảy ra lỗi hiển thị' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '28px 24px',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(13,148,136,0.2)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>☀️</div>
            <h2 style={{ color: '#0f766e', marginBottom: '8px', fontSize: '1.25rem' }}>
              Trung tâm Nắng Mai
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '18px' }}>
              {this.state.errorMessage}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="/lich-hoc"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                📅 Xem Lịch học
              </a>
              <a
                href="/login"
                className="btn btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                🔐 Trang Đăng nhập
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Require({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/classes" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/lich-hoc" element={<Schedule isPublicPage={true} />} />
      <Route path="/parent/:studentId" element={<ParentView />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Require roles={['ADMIN']}><Dashboard /></Require>} />
        <Route path="/schedule" element={<Require><Schedule /></Require>} />
        <Route path="/classes" element={<Require><Classes /></Require>} />
        <Route path="/students" element={<Require roles={['ADMIN']}><Students /></Require>} />
        <Route path="/attendance" element={<Require><Attendance /></Require>} />
        <Route path="/grades" element={<Require roles={['ADMIN', 'TEACHER']}><Grades /></Require>} />
        <Route path="/tuition" element={<Require><Tuition /></Require>} />
        <Route path="/users" element={<Require roles={['ADMIN']}><Users /></Require>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
