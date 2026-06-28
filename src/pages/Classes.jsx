import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtCurrency, fmtDate } from '../api';
import Modal from '../components/Modal';

const EMPTY_FORM = { className: '', subject: '', grade: '', feePerSession: '', startDate: '', status: 'ACTIVE' };

export default function Classes() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('roster');
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [assignedTeachers, setAssignedTeachers] = useState([]);

  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [q, setQ] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [cls, stu, tch] = await Promise.all([
        api('getClasses', {}, user.email),
        (isAdmin || user.role === 'TEACHER') ? api('getStudents', {}, user.email) : Promise.resolve([]),
        isAdmin ? api('getTeachers', {}, user.email) : Promise.resolve([]),
      ]);
      setClasses(cls || []);
      setStudents(stu || []);
      setTeachers(tch || []);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function openDetail(cls) {
    setDetail(cls);
    setDetailTab('roster');
    setRosterLoading(true);
    try {
      const r = await api('getClassRoster', { classId: cls.ClassID }, user.email);
      setRoster(r || []);
      if (isAdmin) {
        const tc = await api('getClassTeachers', { classId: cls.ClassID }, user.email);
        setAssignedTeachers(tc || []);
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setRosterLoading(false); }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(cls, e) {
    e.stopPropagation();
    setEditing(cls);
    setForm({
      className: cls.ClassName,
      subject: cls.Subject,
      grade: cls.Grade,
      feePerSession: cls.FeePerSession,
      startDate: cls.StartDate,
      status: cls.Status,
    });
    setShowForm(true);
  }

  async function saveClass() {
    if (!form.className.trim()) { toast('Vui lòng nhập tên lớp', 'warning'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api('editClass', { classId: editing.ClassID, ...form }, user.email);
        toast('Đã cập nhật lớp học');
      } else {
        await api('addClass', form, user.email);
        toast('Đã tạo lớp học mới');
      }
      setShowForm(false);
      loadAll();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function enrollStudent() {
    if (!enrollStudentId) { toast('Chọn học sinh cần thêm', 'warning'); return; }
    setEnrolling(true);
    try {
      await api('enrollStudent', { studentId: enrollStudentId, classId: detail.ClassID }, user.email);
      toast('Đã thêm học sinh vào lớp');
      setEnrollStudentId('');
      const r = await api('getClassRoster', { classId: detail.ClassID }, user.email);
      setRoster(r || []);
    } catch (e) { toast(e.message, 'error'); }
    finally { setEnrolling(false); }
  }

  async function removeStudent(studentId) {
    if (!confirm('Xóa học sinh khỏi lớp?')) return;
    try {
      await api('removeEnrollment', { studentId, classId: detail.ClassID }, user.email);
      toast('Đã xóa học sinh khỏi lớp');
      setRoster(r => r.filter(s => s.StudentID !== studentId));
    } catch (e) { toast(e.message, 'error'); }
  }

  async function assignTeacher() {
    if (!assignTeacherId) { toast('Chọn giáo viên/trợ giảng', 'warning'); return; }
    setAssigning(true);
    try {
      await api('assignTeacher', { teacherEmail: assignTeacherId, classId: detail.ClassID }, user.email);
      toast('Đã phân công giáo viên');
      setAssignTeacherId('');
      const tc = await api('getClassTeachers', { classId: detail.ClassID }, user.email);
      setAssignedTeachers(tc || []);
    } catch (e) { toast(e.message, 'error'); }
    finally { setAssigning(false); }
  }

  async function removeTeacher(teacherEmail) {
    if (!confirm('Hủy phân công giáo viên?')) return;
    try {
      await api('removeTeacherFromClass', { teacherEmail, classId: detail.ClassID }, user.email);
      toast('Đã hủy phân công');
      setAssignedTeachers(t => t.filter(x => x.Email !== teacherEmail));
    } catch (e) { toast(e.message, 'error'); }
  }

  const filtered = classes.filter(c =>
    c.ClassName?.toLowerCase().includes(q.toLowerCase()) ||
    c.Subject?.toLowerCase().includes(q.toLowerCase())
  );

  const unenrolledStudents = students.filter(s => !roster.find(r => r.StudentID === s.StudentID));
  const unassignedTeachers = teachers.filter(t => !assignedTeachers.find(a => a.Email === t.Email));

  if (loading) return <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>;

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">🏫 <span>Lớp học</span></h1>
        <p className="page-sub">
          {isAdmin ? `Quản lý ${classes.length} lớp học` : `${classes.length} lớp được phân công`}
        </p>
      </div>

      <div className="filter-bar">
        <input className="search-box" placeholder="Tìm lớp học..." value={q} onChange={e => setQ(e.target.value)} />
        {isAdmin && <button className="btn btn-primary" onClick={openAdd}>+ Tạo lớp mới</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="card-body">
          <div className="empty-state">
            <div className="empty-icon">🏫</div>
            <h3>Chưa có lớp học nào</h3>
            <p>{isAdmin ? 'Nhấn "Tạo lớp mới" để bắt đầu' : 'Chưa có lớp nào được phân công cho bạn'}</p>
          </div>
        </div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map(cls => (
            <div key={cls.ClassID} className="card" style={{ cursor: 'pointer' }} onClick={() => openDetail(cls)}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{cls.ClassName}</span>
                <span className={`badge ${cls.Status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}
                  style={{ fontSize: '0.7rem' }}>{cls.Status === 'ACTIVE' ? 'Đang học' : 'Dừng'}</span>
              </div>
              <div className="card-body" style={{ fontSize: '0.875rem' }}>
                <div style={{ marginBottom: 6 }}>
                  {cls.Subject && <span className="badge badge-info" style={{ marginRight: 6 }}>{cls.Subject}</span>}
                  {cls.Grade && <span className="badge badge-warning">Khối {cls.Grade}</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>📅 {cls.StartDate ? fmtDate(cls.StartDate) : 'Chưa rõ ngày'}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 700 }}>💵 {fmtCurrency(cls.FeePerSession)}/buổi</div>
                {isAdmin && (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={e => openEdit(cls, e)}>✏️ Sửa</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Class Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? '✏️ Sửa lớp học' : '+ Tạo lớp mới'}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Hủy</button>
          <button className="btn btn-primary" onClick={saveClass} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </>}
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên lớp *</label>
            <input className="form-control" value={form.className} onChange={e => setForm(f => ({...f, className: e.target.value}))} placeholder="VD: Toán 8A" />
          </div>
          <div className="form-group">
            <label className="form-label">Môn học</label>
            <input className="form-control" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="VD: Toán, Văn, Anh..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Khối lớp</label>
            <input className="form-control" value={form.grade} onChange={e => setForm(f => ({...f, grade: e.target.value}))} placeholder="VD: 8" />
          </div>
          <div className="form-group">
            <label className="form-label">Học phí / buổi (VND)</label>
            <input className="form-control" type="number" value={form.feePerSession} onChange={e => setForm(f => ({...f, feePerSession: e.target.value}))} placeholder="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ngày bắt đầu</label>
            <input className="form-control" type="date" value={form.startDate} onChange={e => setForm(f => ({...f, startDate: e.target.value}))} />
          </div>
          {editing && (
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="ACTIVE">Đang học</option>
                <option value="INACTIVE">Dừng</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Class Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`🏫 ${detail?.ClassName || ''}`}
        size="modal-lg"
      >
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
              {detail.Subject && <span>📚 {detail.Subject}</span>}
              {detail.Grade && <span>🏷️ Khối {detail.Grade}</span>}
              <span>💵 {fmtCurrency(detail.FeePerSession)}/buổi</span>
              {detail.StartDate && <span>📅 {fmtDate(detail.StartDate)}</span>}
            </div>

            <div className="tabs">
              <button className={`tab ${detailTab === 'roster' ? 'active' : ''}`} onClick={() => setDetailTab('roster')}>👥 Danh sách ({roster.length})</button>
              {isAdmin && <button className={`tab ${detailTab === 'teachers' ? 'active' : ''}`} onClick={() => setDetailTab('teachers')}>👨‍🏫 Giáo viên ({assignedTeachers.length})</button>}
            </div>

            {rosterLoading ? (
              <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>
            ) : detailTab === 'roster' ? (
              <>
                {(isAdmin || user.role === 'TEACHER') && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <select className="form-select" style={{ flex: 1 }} value={enrollStudentId} onChange={e => setEnrollStudentId(e.target.value)}>
                      <option value="">-- Chọn học sinh để thêm vào lớp --</option>
                      {unenrolledStudents.map(s => (
                        <option key={s.StudentID} value={s.StudentID}>{s.FullName} ({s.StudentID})</option>
                      ))}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={enrollStudent} disabled={enrolling}>
                      {enrolling ? '...' : '+ Thêm'}
                    </button>
                  </div>
                )}
                {roster.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">👤</div><h3>Chưa có học sinh</h3></div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Học sinh</th><th>SĐT phụ huynh</th><th>Link phụ huynh</th>{(isAdmin || user.role === 'TEACHER') && <th></th>}</tr></thead>
                      <tbody>
                        {roster.map(s => (
                          <tr key={s.StudentID}>
                            <td><strong>{s.FullName}</strong><br/><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.StudentID}</span></td>
                            <td>{s.ParentPhone || '—'}</td>
                            <td>
                              <button className="btn btn-ghost btn-sm" onClick={() => {
                                const url = `${window.location.origin}/parent/${s.StudentID}`;
                                navigator.clipboard?.writeText(url);
                                toast('Đã sao chép link phụ huynh!');
                              }}>📋 Copy link</button>
                            </td>
                            {(isAdmin || user.role === 'TEACHER') && (
                              <td><button className="btn btn-danger btn-sm" onClick={() => removeStudent(s.StudentID)}>Xóa</button></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              /* Teacher assignment tab */
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <select className="form-select" style={{ flex: 1 }} value={assignTeacherId} onChange={e => setAssignTeacherId(e.target.value)}>
                    <option value="">-- Chọn giáo viên / trợ giảng --</option>
                    {unassignedTeachers.map(t => (
                      <option key={t.Email} value={t.Email}>{t.Name} ({t.Role === 'TEACHER' ? 'GV' : 'TG'}) - {t.Email}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={assignTeacher} disabled={assigning}>
                    {assigning ? '...' : '+ Phân công'}
                  </button>
                </div>
                {assignedTeachers.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">👨‍🏫</div><h3>Chưa phân công giáo viên</h3></div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Giáo viên</th><th>Vai trò</th><th>Email</th><th></th></tr></thead>
                      <tbody>
                        {assignedTeachers.map(t => (
                          <tr key={t.Email}>
                            <td><strong>{t.Name}</strong></td>
                            <td><span className={`badge ${t.Role === 'TEACHER' ? 'badge-teacher' : 'badge-warning'}`}>{t.Role === 'TEACHER' ? 'Giáo viên' : 'Trợ giảng'}</span></td>
                            <td style={{ fontSize: '0.83rem' }}>{t.Email}</td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => removeTeacher(t.Email)}>Hủy</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
