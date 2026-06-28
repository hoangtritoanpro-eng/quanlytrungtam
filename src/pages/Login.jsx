import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate(user.role === 'ADMIN' ? '/dashboard' : '/classes', { replace: true });
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !pin) { setErr('Vui lòng nhập đầy đủ email và PIN'); return; }
    setErr(''); setLoading(true);
    try {
      const u = await login(email.trim(), pin.trim());
      navigate(u.role === 'ADMIN' ? '/dashboard' : '/classes', { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="icon">🎓</span>
          <h1>Quản lý Trung tâm</h1>
          <p>Đăng nhập để tiếp tục</p>
        </div>
        {err && <div className="login-error">⚠ {err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-control"
              type="email"
              placeholder="giao_vien@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">PIN</label>
            <input
              className="form-control"
              type="password"
              placeholder="Nhập PIN của bạn"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={10}
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '6px', padding: '11px' }}
          >
            {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Đang đăng nhập...</> : '🔐 Đăng nhập'}
          </button>
        </form>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '18px' }}>
          Liên hệ quản trị viên nếu quên PIN
        </p>
      </div>
    </div>
  );
}
