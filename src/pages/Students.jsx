import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import Modal from '../components/Modal';

const EMPTY = { fullName: '', parentName: '', parentPhone: '', parentEmail: '', note: '', status: 'ACTIVE' };

export default function Students() {
  const { user } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('getStudents', {}, user.email).then(d => setStudents(d || [])).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, []);

  function openAdd() { setEditing(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(s) {
    setEditing(s);
    setForm({ fullName: s.FullName, parentName: s.ParentName, parentPhone: s.ParentPhone, parentEmail: s.ParentEmail, note: s.Note, status: s.Status });
    setShowModal(true);
  }

  async function save() {
    if (!form.fullName.trim()) { toast('Vui lòng nhập tên học sinh', 'warning'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api('editStudent', { studentId: editing.StudentID, ...form }, user.email);
        toast('Đã cập nhật học sinh');
        setStudents(prev => prev.map(s => s.StudentID === editing.StudentID ? { ...s, FullName: form.fullName, ParentName: form.parentName, ParentPhone: form.parentPhone, ParentEmail: form.parentEmail, Note: form.note, Status: form.status } : s));
      } else {
        const newS = await api('addStudent', form, user.email);
        toast('Đã thêm học sinh mới');
        setStudents(prev => [...prev, newS]);
      }
      setShowModal(false);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  const filtered = students.filter(s =>
    s.FullName?.toLowerCase().includes(q.toLowerCase()) ||
    s.ParentPhone?.includes(q) ||
    s.StudentID?.includes(q)
  );

  const parentLink = (sid) => `${window.location.origin}/parent/${sid}`;

  if (loading) return <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>;

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">👤 <span>Học sinh</span></h1>
        <p className="page-sub">{students.length} học sinh đã đăng ký</p>
      </div>

      <div className="filter-bar">
        <input className="search-box" placeholder="Tìm theo tên, SĐT, mã..." value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Thêm học sinh</button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <h3>{q ? 'Không tìm thấy' : 'Chưa có học sinh'}</h3>
              <p>{!q && 'Nhấn "+ Thêm học sinh" để bắt đầu'}</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mã</th><th>Họ tên</th><th>Phụ huynh</th><th>SĐT</th><th>Trạng thái</th><th>Link PH</th><th>Thao tác</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.StudentID}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{s.StudentID}</span></td>
                    <td><strong>{s.FullName}</strong>{s.Note && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.Note}</div>}</td>
                    <td>{s.ParentName || '—'}</td>
                    <td>{s.ParentPhone || '—'}</td>
                    <td><span className={`badge ${s.Status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>{s.Status === 'ACTIVE' ? 'Đang học' : 'Nghỉ'}</span></td>
                    <td>
                      <div className="link-box" style={{ maxWidth: 180 }}>
                        <span>{parentLink(s.StudentID)}</span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px' }} title="Copy link" onClick={() => { navigator.clipboard?.writeText(parentLink(s.StudentID)); toast('Đã copy link!'); }}>📋</button>
                      </div>
                    </td>
                    <td className="actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>✏️ Sửa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '✏️ Sửa thông tin học sinh' : '+ Thêm học sinh mới'}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Họ tên học sinh *</label>
          <input className="form-control" value={form.fullName} onChange={e => setForm(f => ({...f, fullName: e.target.value}))} placeholder="Nguyễn Văn A" autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên phụ huynh</label>
            <input className="form-control" value={form.parentName} onChange={e => setForm(f => ({...f, parentName: e.target.value}))} placeholder="Nguyễn Văn B" />
          </div>
          <div className="form-group">
            <label className="form-label">SĐT phụ huynh</label>
            <input className="form-control" type="tel" value={form.parentPhone} onChange={e => setForm(f => ({...f, parentPhone: e.target.value}))} placeholder="0901..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email phụ huynh</label>
            <input className="form-control" type="email" value={form.parentEmail} onChange={e => setForm(f => ({...f, parentEmail: e.target.value}))} placeholder="email@gmail.com" />
          </div>
          {editing && (
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="ACTIVE">Đang học</option>
                <option value="INACTIVE">Nghỉ học</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Ghi chú</label>
          <input className="form-control" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="Ghi chú thêm..." />
        </div>
      </Modal>
    </div>
  );
}
