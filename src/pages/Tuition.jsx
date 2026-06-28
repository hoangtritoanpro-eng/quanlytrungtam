import { useState, useEffect } from 'react';
import { api, fmtCurrency } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Tuition() {
  const { user } = useAuth();
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [tuitionData, setTuitionData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('getClasses', {}, user.email).then(setClasses).catch(e => toast(e.message, 'error'));
  }, []);

  const handleClassChange = async (e) => {
    const classId = e.target.value;
    setSelectedClass(classId);
    setTuitionData(null);
    if (!classId) return;
    setLoading(true);
    try {
      const data = await api('getTuition', { classId }, user.email);
      setTuitionData(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = tuitionData?.students?.reduce((s, r) => s + Number(r.tuition || 0), 0) || 0;
  const totalAttended = tuitionData?.students?.reduce((s, r) => s + Number(r.sessionsAttended || 0), 0) || 0;

  return (
    <div>
      <div className="page-header">
        <h1><span>💰</span> Học Phí</h1>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ maxWidth: 320 }}>
            <label className="form-label">Chọn lớp học</label>
            <select className="form-control" value={selectedClass} onChange={handleClassChange}>
              <option value="">-- Chọn lớp --</option>
              {classes.map(c => (
                <option key={c.ClassID} value={c.ClassID}>
                  {c.ClassName} — {fmtCurrency(c.FeePerSession)}/buổi
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary)' }}>Đang tải...</div>}

      {tuitionData && !loading && (
        <>
          {/* Summary cards */}
          <div className="stats-grid" style={{ marginTop: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-icon">🏫</div>
              <div className="stat-info">
                <div className="stat-value">{tuitionData.students?.length || 0}</div>
                <div className="stat-label">Học sinh</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📅</div>
              <div className="stat-info">
                <div className="stat-value">{totalAttended}</div>
                <div className="stat-label">Buổi đã học (tổng)</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💵</div>
              <div className="stat-info">
                <div className="stat-value">{fmtCurrency(tuitionData.classInfo?.FeePerSession)}</div>
                <div className="stat-label">Học phí / buổi</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <div className="stat-value">{fmtCurrency(totalRevenue)}</div>
                <div className="stat-label">Tổng học phí lớp</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              💰 Chi tiết học phí — {tuitionData.classInfo?.ClassName}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Họ và tên</th>
                    <th style={{ textAlign: 'center' }}>Tổng buổi</th>
                    <th style={{ textAlign: 'center' }}>Đã học</th>
                    <th style={{ textAlign: 'center' }}>Vắng</th>
                    <th style={{ textAlign: 'right' }}>Học phí/buổi</th>
                    <th style={{ textAlign: 'right' }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {tuitionData.students?.map((s, i) => (
                    <tr key={s.studentId}>
                      <td>{i + 1}</td>
                      <td><strong>{s.fullName}</strong></td>
                      <td style={{ textAlign: 'center' }}>{s.sessionsTotal}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          background: 'var(--success-light)',
                          color: 'var(--success)',
                          padding: '2px 10px',
                          borderRadius: 8,
                          fontWeight: 600
                        }}>{s.sessionsAttended}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {Number(s.sessionsAbsent) > 0 ? (
                          <span style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            padding: '2px 10px',
                            borderRadius: 8,
                            fontWeight: 600
                          }}>{s.sessionsAbsent}</span>
                        ) : <span style={{ color: 'var(--text-light)' }}>0</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(s.feePerSession)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                        {fmtCurrency(s.tuition)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-light)', fontWeight: 700 }}>
                    <td colSpan={6} style={{ textAlign: 'right', padding: '1rem' }}>Tổng cộng:</td>
                    <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--primary)', fontSize: '1.1rem' }}>
                      {fmtCurrency(totalRevenue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedClass && !loading && !tuitionData && (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <div className="empty-icon">📭</div>
          <p>Không có dữ liệu học phí cho lớp này</p>
        </div>
      )}
    </div>
  );
}
