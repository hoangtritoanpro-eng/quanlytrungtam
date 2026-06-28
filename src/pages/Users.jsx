import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const ROLES = ['ADMIN', 'TEACHER', 'TA'];

const emptyForm = { email: '', name: '', role: 'TEACHER', pin: '1234', active: 'TRUE' };

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const loadUsers = async () => {
    try {
      const data = await api('getUsers', {}, user.email);
      setUsers(data || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ email: u.Email, name: u.Name, role: u.Role, pin: u.Pin || '', active: u.Active });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.email.trim() || !form.name.trim() || !form.pin.trim()) {
      toast('Vui lòng điền đầy đủ thông tin', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api('editUser', { targetEmail: editing.Email, name: form.name, role: form.role, pin: form.pin, active: form.active }, user.email);
        toast('Đã cập nhật người dùng', 'success');
      } else {
        await api('addUser', form, user.email);
        toast('Đã thêm người dùng', 'success');
      }
      setModal(false);
      loadUsers();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const roleBadge = (role) => {
    const map = { ADMIN: ['#dc2626', '👑'], TEACHER: ['var(--primary)', '👨‍🏫'], TA: ['#7c3aed', '🙋'] };
    const [color, icon] = map[role] || ['#6b7280', '👤'];
    return (
      <span style={{ background: color + '20', color, padding: '3px 10px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem' }}>
        {icon} {role}
      </span>
    );
  };

  const filtered = users.filter(u =>
    u.Name?.toLowerCase().includes(search.toLowerCase()) ||
    u.Email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h1><span>👥</span> Quản lý Người dùng</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Thêm người dùng</button>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: '0.5rem' }}>
          <input
            className="form-control"
            style={{ maxWidth: 320 }}
            placeholder="🔍 Tìm kiếm tên, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tên</th>
                <th>Vai trò</th>
                <th style={{ textAlign: 'center' }}>Trạng thái</th>
                <th style={{ textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>Không có người dùng</td></tr>
              ) : filtered.map(u => (
                <tr key={u.Email}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{u.Email}</td>
                  <td><strong>{u.Name}</strong></td>
                  <td>{roleBadge(u.Role)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      background: u.Active === 'TRUE' ? '#dcfce7' : '#fee2e2',
                      color: u.Active === 'TRUE' ? '#16a34a' : '#dc2626',
                      padding: '3px 10px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.8rem'
                    }}>
                      {u.Active === 'TRUE' ? '✓ Hoạt động' : '✗ Khóa'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>✏️ Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? '✏️ Sửa người dùng' : '➕ Thêm người dùng'}>
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input
            className="form-control"
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            disabled={!!editing}
            placeholder="user@example.com"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Họ tên *</label>
          <input
            className="form-control"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Vai trò</label>
            <select className="form-control" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">PIN *</label>
            <input
              className="form-control"
              type="password"
              value={form.pin}
              onChange={e => setForm(p => ({ ...p, pin: e.target.value }))}
              placeholder="4–6 chữ số"
              maxLength={6}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Trạng thái</label>
          <select className="form-control" value={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.value }))}>
            <option value="TRUE">Hoạt động</option>
            <option value="FALSE">Khóa</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={() => setModal(false)}>Hủy</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : '💾 Lưu'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
