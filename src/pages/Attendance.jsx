import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate, today, scheduleWeekday } from '../api';
import { absenceMessage, copyText, downloadCsv, fmtMonth, smsLink, telLink, zaloLink } from '../helpers';

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(params.get('classId') || '');
  const [date, setDate] = useState(params.get('date') || today());
  const [roster, setRoster] = useState([]);
  const [records, setRecords] = useState({}); // { studentId: { present: bool, note: '' } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [savedAbsent, setSavedAbsent] = useState(null); // học sinh vắng của lần lưu gần nhất
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      api('getClasses', {}, user.email),
      api('getSchedule', {}, '').catch(() => ({ slots: [] })),
    ])
      .then(([cls, sch]) => {
        setClasses(cls || []);
        setScheduleSlots(Array.isArray(sch?.slots) ? sch.slots : []);
        if (!selectedClass && cls?.length === 1) setSelectedClass(cls[0].ClassID);
      })
      .catch(e => toast(e.message, 'error'));
  }, []);

  // Ca học của ngày đang chọn, chỉ những ca đã gắn với lớp mà người dùng được xem
  const daySlots = useMemo(() => {
    const allowed = new Set(classes.map(c => c.ClassID));
    const wd = scheduleWeekday(date);
    return scheduleSlots
      .filter(s => Number(s.day) === wd && s.classId && allowed.has(s.classId))
      .sort((a, b) => Number(a.startMin) - Number(b.startMin));
  }, [scheduleSlots, classes, date]);

  // Mở trang hôm nay mà chưa chọn lớp: tự chọn ca đang diễn ra hoặc ca sắp tới gần nhất
  useEffect(() => {
    if (selectedClass || daySlots.length === 0 || date !== today()) return;
    const now = nowMinutes();
    const current =
      daySlots.find(s => Number(s.startMin) - 30 <= now && now <= Number(s.endMin) + 60) ||
      daySlots.find(s => Number(s.startMin) > now) ||
      daySlots[daySlots.length - 1];
    if (current) setSelectedClass(current.classId);
  }, [daySlots]);

  useEffect(() => {
    const next = {};
    if (selectedClass) next.classId = selectedClass;
    if (date && date !== today()) next.date = date;
    setParams(next, { replace: true });
    setSavedAbsent(null);
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
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function setPresent(studentId, present) {
    setSavedAbsent(null);
    setRecords(prev => ({ ...prev, [studentId]: { ...prev[studentId], present } }));
  }

  function toggleAll(val) {
    setSavedAbsent(null);
    setRecords(prev => {
      const next = { ...prev };
      roster.forEach(s => {
        next[s.StudentID] = { ...next[s.StudentID], present: val };
      });
      return next;
    });
  }

  async function save() {
    if (!selectedClass) {
      toast('Chọn lớp trước', 'warning');
      return;
    }
    setSaving(true);
    try {
      const recordsArr = roster.map(s => ({
        studentId: s.StudentID,
        present: records[s.StudentID]?.present ?? true,
        note: records[s.StudentID]?.note || '',
      }));
      await api('markAttendance', { classId: selectedClass, date, records: recordsArr }, user.email);
      toast(`Đã lưu điểm danh ${recordsArr.filter(r => r.present).length}/${roster.length} học sinh`);
      setSavedAbsent(roster.filter(s => !(records[s.StudentID]?.present ?? true)));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportMonth() {
    setExporting(true);
    try {
      const month = date.slice(0, 7);
      const [r, att] = await Promise.all([
        api('getClassRoster', { classId: selectedClass }, user.email),
        api('getAttendance', { classId: selectedClass }, user.email),
      ]);
      const monthAtt = (att || []).filter(a => String(a.Date).slice(0, 7) === month);
      const dates = [...new Set(monthAtt.map(a => a.Date))].sort();
      if (dates.length === 0) {
        toast(`Tháng ${fmtMonth(month)} chưa có buổi điểm danh nào`, 'warning');
        return;
      }
      const mark = {};
      monthAtt.forEach(a => {
        mark[`${a.StudentID}|${a.Date}`] = a.Present === 'TRUE' ? 'x' : 'v';
      });
      const header = ['STT', 'Học sinh', ...dates.map(d => fmtDate(d).slice(0, 5)), 'Có mặt', 'Vắng'];
      const body = (r || []).map((s, i) => {
        const cells = dates.map(d => mark[`${s.StudentID}|${d}`] || '');
        return [i + 1, s.FullName, ...cells, cells.filter(c => c === 'x').length, cells.filter(c => c === 'v').length];
      });
      downloadCsv(`diem-danh_${cls?.ClassName || selectedClass}_${month}`, [
        header,
        ...body,
        [],
        ['Ký hiệu: x = có mặt, v = vắng'],
      ]);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function copyAbsence(s) {
    const text = absenceMessage({ studentName: s.FullName, className: cls?.ClassName || '', date });
    if (await copyText(text)) toast(`Đã chép tin báo vắng của ${s.FullName}`);
    else toast('Không chép được, hãy thử lại', 'error');
  }

  const presentCount = roster.filter(s => records[s.StudentID]?.present).length;
  const cls = classes.find(c => c.ClassID === selectedClass);

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">
          ✅ <span>Điểm danh</span>
        </h1>
        <p className="page-sub">Chạm vào tên học sinh để đổi Có mặt / Vắng</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Lớp học</label>
              <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">-- Chọn lớp --</option>
                {classes.map(c => (
                  <option key={c.ClassID} value={c.ClassID}>
                    {c.ClassName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ngày điểm danh</label>
              <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          {daySlots.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>
                Ca học {date === today() ? 'hôm nay' : `ngày ${fmtDate(date)}`}:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {daySlots.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn btn-sm ${s.classId === selectedClass ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedClass(s.classId)}
                  >
                    🕒 {s.time} · {s.className}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải danh sách...</span>
        </div>
      )}

      {rosterLoaded && !loading && (
        <div className="card">
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          >
            <span>
              📋 {cls?.ClassName} — {fmtDate(date)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {presentCount}/{roster.length} có mặt
              </span>
              <button className="btn btn-secondary btn-sm" onClick={exportMonth} disabled={exporting}>
                {exporting ? 'Đang xuất...' : `📥 Excel tháng ${fmtMonth(date.slice(0, 7))}`}
              </button>
            </span>
          </div>
          <div className="card-body">
            {roster.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>Lớp này chưa có học sinh</h3>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>
                    ✅ Tất cả có mặt
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>
                    ❌ Tất cả vắng
                  </button>
                </div>
                <div className="att-list">
                  <div className="att-row header">
                    <div className="att-cell">Học sinh</div>
                    <div className="att-cell" style={{ textAlign: 'center' }}>
                      Có mặt
                    </div>
                    <div className="att-cell">Ghi chú</div>
                  </div>
                  {roster.map(s => {
                    const present = records[s.StudentID]?.present ?? true;
                    return (
                      <div
                        key={s.StudentID}
                        className="att-row"
                        style={{ background: present ? 'rgba(22,163,74,0.04)' : 'rgba(220,38,38,0.07)' }}
                      >
                        <button
                          type="button"
                          className="att-cell att-name-toggle"
                          onClick={() => setPresent(s.StudentID, !present)}
                          aria-pressed={!present}
                          title="Chạm để đổi Có mặt / Vắng"
                        >
                          <strong style={{ fontSize: '0.9rem' }}>{s.FullName}</strong>
                          {!present && <span className="att-absent-tag">Vắng</span>}
                        </button>
                        <div className="att-cell att-check">
                          <input
                            type="checkbox"
                            style={{ width: 22, height: 22, accentColor: 'var(--primary)', cursor: 'pointer' }}
                            checked={present}
                            onChange={e => setPresent(s.StudentID, e.target.checked)}
                          />
                        </div>
                        <div className="att-cell">
                          <input
                            className="form-control"
                            style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                            placeholder="Ghi chú..."
                            value={records[s.StudentID]?.note || ''}
                            onChange={e =>
                              setRecords(prev => ({
                                ...prev,
                                [s.StudentID]: { ...prev[s.StudentID], note: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
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
      )}

      {savedAbsent && savedAbsent.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">📣 Báo vắng cho phụ huynh ({savedAbsent.length} học sinh)</div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Bấm 📋 để chép tin nhắn, rồi bấm 💬 để mở Zalo của phụ huynh và dán vào.
            </p>
            {savedAbsent.map(s => {
              const msg = absenceMessage({ studentName: s.FullName, className: cls?.ClassName || '', date });
              return (
                <div
                  key={s.StudentID}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <strong>{s.FullName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {s.ParentName || 'Phụ huynh'} · {s.ParentPhone || 'chưa có số điện thoại'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyAbsence(s)}>
                      📋 Chép tin
                    </button>
                    {zaloLink(s.ParentPhone) && (
                      <a className="btn btn-secondary btn-sm" href={zaloLink(s.ParentPhone)} target="_blank" rel="noreferrer">
                        💬 Zalo
                      </a>
                    )}
                    {smsLink(s.ParentPhone, msg) && (
                      <a className="btn btn-ghost btn-sm" href={smsLink(s.ParentPhone, msg)}>
                        ✉️ SMS
                      </a>
                    )}
                    {telLink(s.ParentPhone) && (
                      <a className="btn btn-ghost btn-sm" href={telLink(s.ParentPhone)}>
                        📞 Gọi
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
