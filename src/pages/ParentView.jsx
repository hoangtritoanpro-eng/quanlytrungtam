import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtCurrency, fmtDate } from '../api';

export default function ParentView() {
  const { studentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openClass, setOpenClass] = useState(null);

  useEffect(() => {
    api('getStudentReport', { studentId }, '')
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
      <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎓</div>
        <div>Đang tải thông tin...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '2rem', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: '3rem' }}>❌</div>
        <h2 style={{ color: '#dc2626', margin: '1rem 0' }}>Không tìm thấy</h2>
        <p style={{ color: 'var(--text-light)' }}>{error}</p>
      </div>
    </div>
  );

  const student = data?.student;
  const classes = data?.classes || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light-color) 100%)',
          borderRadius: 20,
          padding: '2rem',
          color: '#fff',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.5rem' }}>🎓 Trung tâm Giáo dục</div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{student?.FullName}</h1>
          <div style={{ marginTop: '0.75rem', opacity: 0.9, fontSize: '0.95rem' }}>
            <span style={{ marginRight: '1.5rem' }}>👨‍👩‍👧 {student?.ParentName}</span>
            <span>📞 {student?.ParentPhone}</span>
          </div>
          {student?.Note && (
            <div style={{ marginTop: '0.75rem', opacity: 0.8, fontSize: '0.85rem' }}>📝 {student.Note}</div>
          )}
        </div>

        {classes.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', textAlign: 'center', color: 'var(--text-light)' }}>
            Học sinh chưa được đăng ký lớp nào
          </div>
        )}

        {classes.map(cls => {
          const isOpen = openClass === cls.classId;
          const attPct = cls.sessionsTotal > 0 ? Math.round((cls.sessionsAttended / cls.sessionsTotal) * 100) : 0;

          return (
            <div key={cls.classId} style={{
              background: '#fff',
              borderRadius: 16,
              marginBottom: '1rem',
              boxShadow: '0 4px 20px rgba(13,148,136,0.1)',
              border: '2px solid var(--border)'
            }}>
              {/* Class header */}
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => setOpenClass(isOpen ? null : cls.classId)}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>{cls.className}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                    {cls.subject} · {cls.grade}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Học phí</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtCurrency(cls.tuition)}</div>
                  </div>
                  <span style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Stats bar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                borderTop: '1px solid var(--border)',
                borderBottom: isOpen ? '1px solid var(--border)' : 'none',
              }}>
                {[
                  ['📅', 'Đã học', `${cls.sessionsAttended}/${cls.sessionsTotal} buổi`],
                  ['✅', 'Chuyên cần', `${attPct}%`],
                  ['💰', 'Học phí/buổi', fmtCurrency(cls.feePerSession)],
                ].map(([icon, label, val]) => (
                  <div key={label} style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{icon} {label}</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Accordion body */}
              {isOpen && (
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  {/* Scores */}
                  {cls.scores?.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>📝 Điểm số</h4>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-light)' }}>
                              {['Ngày', 'Bài kiểm tra', 'Điểm', 'Tối đa', 'Ghi chú'].map(h => (
                                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cls.scores.map((s, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px' }}>{fmtDate(s.Date)}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.ExamName}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  <span style={{
                                    fontWeight: 700,
                                    color: Number(s.Score) / Number(s.MaxScore) >= 0.5 ? 'var(--success)' : '#dc2626',
                                    fontSize: '1rem'
                                  }}>{s.Score}</span>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-light)' }}>{s.MaxScore}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-light)', fontSize: '0.85rem' }}>{s.Note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Attendance */}
                  {cls.attendance?.length > 0 && (
                    <div>
                      <h4 style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>📋 Điểm danh gần đây</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                        {cls.attendance.slice(0, 20).map((a, i) => (
                          <div key={i} style={{
                            background: a.Present === 'TRUE' ? '#dcfce7' : '#fee2e2',
                            color: a.Present === 'TRUE' ? '#16a34a' : '#dc2626',
                            borderRadius: 10,
                            padding: '6px 10px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textAlign: 'center'
                          }}>
                            {a.Present === 'TRUE' ? '✓' : '✗'} {fmtDate(a.Date)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!cls.scores?.length && !cls.attendance?.length && (
                    <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>Chưa có dữ liệu</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-light)', fontSize: '0.8rem' }}>
          🔒 Trang dành riêng cho phụ huynh · Trung tâm Giáo dục
        </div>
      </div>
    </div>
  );
}
