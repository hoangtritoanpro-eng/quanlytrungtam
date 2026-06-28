import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('getDashboard', {}, user.email)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="loading-state">
      <div className="spinner" />
      <span>Đang tải...</span>
    </div>
  );

  const cards = [
    { icon: '👤', label: 'Học sinh', value: stats?.totalStudents ?? 0, color: '' },
    { icon: '🏫', label: 'Lớp học', value: stats?.totalClasses ?? 0 },
    { icon: '👨‍🏫', label: 'Giáo viên', value: stats?.totalTeachers ?? 0 },
    { icon: '🧑‍💼', label: 'Trợ giảng', value: stats?.totalTAs ?? 0 },
    { icon: '✅', label: 'Có mặt hôm nay', value: stats?.presentToday ?? 0 },
    { icon: '📋', label: 'Buổi hôm nay', value: stats?.totalAttToday ?? 0 },
  ];

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">📊 <span>Dashboard</span></h1>
        <p className="page-sub">Xin chào, <strong>{user.name}</strong>! Đây là tổng quan hôm nay.</p>
      </div>
      <div className="stats-grid">
        {cards.map(c => (
          <div key={c.label} className="stat-card">
            <span className="stat-icon">{c.icon}</span>
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">📅 Thống kê điểm danh hôm nay</div>
        <div className="card-body">
          {stats?.totalAttToday === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>Chưa có dữ liệu điểm danh hôm nay</h3>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--success)' }}>{stats?.presentToday ?? 0}</div>
                <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Có mặt</div>
              </div>
              <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--danger)' }}>{(stats?.totalAttToday ?? 0) - (stats?.presentToday ?? 0)}</div>
                <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Vắng mặt</div>
              </div>
              <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {stats?.totalAttToday ? Math.round(stats.presentToday / stats.totalAttToday * 100) : 0}%
                </div>
                <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Tỉ lệ có mặt</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
