import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate, today } from '../api';

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(today());
  const [roster, setRoster] = useState([]);
  const [records, setRecords] = useState({}); // { studentId: { present: bool, note: '' } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  useEffect(() => {
    api('getClasses', {}, user.email)
      .then(d => { setClasses(d || []); if (d?.length === 1) setSelectedClass(d[0].ClassID); })
      .catch(e => toast(e.message, 'error'));
  }, []);

  useEffect(() => {
    if (selectedClass && date) loadRosterAndAttendance();
  }, [selectedClass, date]);

  async function loadRosterAndAttendance() {
    setLoading(true);
    setRosterLoaded(false);
    try {
      const [r, att] = await Promise.all([
        api('getClassRoster', { classId: selectedClass }, user.email),
        api('getAttendance', { classId: selectedClass, date }, user.email),
      ]);
      const studentList = r || [];
      setRoster(studentList);

      // Build records map
      const map = {};
      studentList.forEach(s => {
        const existing = (att || []).find(a => a.StudentID === s.StudentID);
        map[s.StudentID] = {
          present: existing ? existing.Present === 'TRUE' : true,
          note: existing?.Note || '',
        };
      });
      setRecords(map);
      setRosterLoaded(true);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  function toggleAll(val) {
    setRecords(prev => {
      const next = { ...prev };
      roster.forEach(s => { next[s.StudentID] = { ...next[s.StudentID], present: val }; });
      return next;
    });
  }

  async function save() {
    if (!selectedClass) { toast('Chọn lớp trước', 'warning'); return; }
    setSaving(true);
    try {
      const recordsArr = roster.map(s => ({
        studentId: s.StudentID,
        present: records[s.StudentID]?.present ?? true,
        note: records[s.StudentID]?.note || '',
      }));
      await api('markAttendance', { classId: selectedClass, date, records: recordsArr }, user.email);
      toast(`Đã lưu điểm danh ${recordsArr.filter(r => r.present).length}/${roster.length} học sinh`);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  const presentCount = roster.filter(s => records[s.StudentID]?.present).length;
  const cls = classes.find(c => c.ClassID === selectedClass);

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">✅ <span>Điểm danh</span></h1>
        <p className="page-sub">Chọn lớp và ngày để điểm danh</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Lớp học</label>
              <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">-- Chọn lớp --</option>
                {classes.map(c => <option key={c.ClassID} value={c.ClassID}>{c.ClassName}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ngày điểm danh</label>
              <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><span>Đang tải danh sách...</span></div>}

      {rosterLoaded && !loading && (
        <>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 {cls?.ClassName} — {fmtDate(date)}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{presentCount}/{roster.length} có mặt</span>
            </div>
            <div className="card-body">
              {roster.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <h3>Lớp này chưa có học sinh</h3>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>✅ Tất cả có mặt</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>❌ Tất cả vắng</button>
                  </div>
                  <div className="att-list">
                    <div className="att-row header">
                      <div className="att-cell">Học sinh</div>
                      <div className="att-cell" style={{ textAlign: 'center' }}>Có mặt</div>
                      <div className="att-cell">Ghi chú</div>
                    </div>
                    {roster.map(s => (
                      <div key={s.StudentID} className="att-row" style={{ background: records[s.StudentID]?.present ? 'rgba(22,163,74,0.04)' : 'rgba(220,38,38,0.04)' }}>
                        <div className="att-cell">
                          <strong style={{ fontSize: '0.875rem' }}>{s.FullName}</strong>
                        </div>
                        <div className="att-cell att-check">
                          <input
                            type="checkbox"
                            style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                            checked={records[s.StudentID]?.present ?? true}
                            onChange={e => setRecords(prev => ({
                              ...prev,
                              [s.StudentID]: { ...prev[s.StudentID], present: e.target.checked }
                            }))}
                          />
                        </div>
                        <div className="att-cell">
                          <input
                            className="form-control"
                            style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                            placeholder="Ghi chú..."
                            value={records[s.StudentID]?.note || ''}
                            onChange={e => setRecords(prev => ({
                              ...prev,
                              [s.StudentID]: { ...prev[s.StudentID], note: e.target.value }
                            }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                      {saving ? 'Đang lưu...' : '💾 Lưu điểm danh'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">✅</div>
          <h3>Chọn lớp để bắt đầu điểm danh</h3>
        </div>
      )}
    </div>
  );
}
