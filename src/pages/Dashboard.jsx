import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, fmtCurrency, fmtDate } from '../api';
import { fmtMonth, telLink, zaloLink } from '../helpers';

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function slotStatus(slot, nowMin) {
  if (!slot.classId) return { tone: 'muted', text: 'Chưa gắn lớp' };
  if (slot.marked) return { tone: 'ok', text: `Đã điểm danh ${slot.present}/${slot.total}` };
  if (nowMin > slot.endMin) return { tone: 'bad', text: 'Quá giờ, chưa điểm danh' };
  if (nowMin >= slot.startMin - 15) return { tone: 'warn', text: 'Đang diễn ra' };
  return { tone: 'muted', text: 'Sắp tới' };
}

const TONES = {
  ok: { background: '#dcfce7', color: '#15803d' },
  warn: { background: '#fef3c7', color: '#b45309' },
  bad: { background: '#fee2e2', color: '#dc2626' },
  muted: { background: 'var(--bg-light)', color: 'var(--text-muted)' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  useEffect(() => {
    api('getDashboard', {}, user.email)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    // Cập nhật trạng thái "đang diễn ra / quá giờ" mỗi phút
    const t = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => clearInterval(t);
  }, []);

  if (loading)
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );

  if (error)
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Không tải được Dashboard</h3>
        <p>{error}</p>
      </div>
    );

  const slots = stats?.todaySlots || [];
  const alerts = stats?.absenceAlerts || [];
  const tm = stats?.tuitionMonth || { due: 0, paid: 0, unpaidAmount: 0, unpaidCount: 0 };
  const unlinked = slots.filter(s => !s.classId).length;
  const overdue = slots.filter(s => slotStatus(s, nowMin).tone === 'bad').length;
  const todayLabel = stats?.today
    ? `${WEEKDAY_NAMES[new Date(`${stats.today}T00:00:00`).getDay()]}, ${fmtDate(stats.today)}`
    : '';
  const paidPct = tm.due > 0 ? Math.min(100, Math.round((tm.paid / tm.due) * 100)) : 0;

  const cards = [
    { icon: '👤', label: 'Học sinh', value: stats?.totalStudents ?? 0, to: '/students' },
    { icon: '🏫', label: 'Lớp học', value: stats?.totalClasses ?? 0, to: '/classes' },
    { icon: '👨‍🏫', label: 'Giáo viên / Trợ giảng', value: `${stats?.totalTeachers ?? 0} / ${stats?.totalTAs ?? 0}`, to: '/users' },
    {
      icon: '✅',
      label: 'Có mặt hôm nay',
      value: stats?.totalAttToday ? `${stats.presentToday}/${stats.totalAttToday}` : '0',
      to: '/attendance',
    },
    { icon: '💵', label: `Đã thu T${fmtMonth(stats?.month).slice(0, 2)}`, value: fmtCurrency(tm.paid), to: '/tuition' },
    { icon: '⏳', label: `Còn nợ (${tm.unpaidCount} lượt)`, value: fmtCurrency(tm.unpaidAmount), to: '/tuition' },
  ];

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">
          📊 <span>Dashboard</span>
        </h1>
        <p className="page-sub">
          Xin chào, <strong>{user.name}</strong>! Hôm nay là {todayLabel}.
        </p>
      </div>

      <div className="stats-grid">
        {cards.map(c => (
          <button key={c.label} type="button" className="stat-card stat-card-link" onClick={() => navigate(c.to)}>
            <span className="stat-icon">{c.icon}</span>
            <div className={`stat-value ${String(c.value).length > 7 ? 'stat-value-sm' : ''}`}>{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>📅 Ca học hôm nay ({slots.length})</span>
            {overdue > 0 && <span style={{ fontSize: '0.82rem' }}>⚠️ {overdue} ca quá giờ chưa điểm danh</span>}
          </div>
          <div className="card-body">
            {slots.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 10px' }}>
                <div className="empty-icon">🌤️</div>
                <h3>Hôm nay không có ca học nào</h3>
                <p>
                  Thời khóa biểu lấy từ trang{' '}
                  <a href="/schedule" onClick={e => (e.preventDefault(), navigate('/schedule'))}>
                    Lịch học
                  </a>
                  .
                </p>
              </div>
            ) : (
              <>
                {slots.map(s => {
                  const st = slotStatus(s, nowMin);
                  return (
                    <div key={s.id} className="dash-row">
                      <div style={{ minWidth: 92, fontWeight: 700, color: 'var(--primary)' }}>{s.time}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{s.className}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {[s.teacher, s.room, s.siteName].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className="dash-pill" style={TONES[st.tone]}>
                        {st.text}
                      </span>
                      {s.classId && (
                        <button
                          className={`btn btn-sm ${s.marked ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => navigate(`/attendance?classId=${encodeURIComponent(s.classId)}`)}
                        >
                          {s.marked ? 'Xem' : 'Điểm danh'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {unlinked > 0 && (
                  <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    💡 {unlinked} ca chưa gắn với lớp trong hệ thống. Vào{' '}
                    <a href="/schedule" onClick={e => (e.preventDefault(), navigate('/schedule'))}>
                      Lịch học
                    </a>{' '}
                    → sửa ca → chọn "Gắn với lớp trong hệ thống" để theo dõi điểm danh.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">💰 Học phí tháng {fmtMonth(stats?.month)}</div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 6 }}>
                <span>
                  Đã thu <strong>{fmtCurrency(tm.paid)}</strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>/ phải thu {fmtCurrency(tm.due)}</span>
              </div>
              <div className="dash-progress">
                <div style={{ width: `${paidPct}%` }} />
              </div>
              <div style={{ marginTop: 10, fontSize: '0.85rem', color: tm.unpaidCount ? '#b45309' : 'var(--text-muted)' }}>
                {tm.unpaidCount
                  ? `Còn ${tm.unpaidCount} lượt học sinh chưa đóng: ${fmtCurrency(tm.unpaidAmount)}`
                  : 'Không có khoản nợ nào trong tháng.'}
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/tuition')}>
                Mở trang Học phí →
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">⚠️ Học sinh vắng liên tiếp ({alerts.length})</div>
            <div className="card-body">
              {alerts.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Không có học sinh nào vắng từ 2 buổi liên tiếp trở lên. 👍
                </p>
              ) : (
                alerts.map(a => (
                  <div key={`${a.classId}|${a.studentId}`} className="dash-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{a.fullName}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {a.className} · vắng <b style={{ color: '#dc2626' }}>{a.streak} buổi</b> liên tiếp · gần nhất {fmtDate(a.lastDate)}
                      </div>
                    </div>
                    {zaloLink(a.parentPhone) && (
                      <a className="btn btn-ghost btn-sm" href={zaloLink(a.parentPhone)} target="_blank" rel="noreferrer" title="Zalo phụ huynh">
                        💬
                      </a>
                    )}
                    {telLink(a.parentPhone) && (
                      <a className="btn btn-ghost btn-sm" href={telLink(a.parentPhone)} title={`Gọi ${a.parentPhone}`}>
                        📞
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
