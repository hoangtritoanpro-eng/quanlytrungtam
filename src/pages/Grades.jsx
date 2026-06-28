import { useState, useEffect, useCallback } from 'react';
import { api, today } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Grades() {
  const { user } = useAuth();
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [roster, setRoster] = useState([]);
  const [pastExams, setPastExams] = useState([]);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(today());
  const [maxScore, setMaxScore] = useState('10');
  const [scoreMap, setScoreMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('getClasses', {}, user.email).then(setClasses).catch(e => toast(e.message, 'error'));
  }, []);

  const loadClass = useCallback(async (classId) => {
    if (!classId) return;
    setLoading(true);
    try {
      const [rosterData, scoresData] = await Promise.all([
        api('getClassRoster', { classId }, user.email),
        api('getScores', { classId }, user.email),
      ]);
      setRoster(rosterData || []);
      // Group scores by exam name for dropdown
      const exams = {};
      (scoresData || []).forEach(s => {
        if (!exams[s.ExamName]) exams[s.ExamName] = s.MaxScore;
      });
      setPastExams(Object.entries(exams).map(([name, max]) => ({ name, max })));
      setScoreMap({});
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [user.email]);

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
    setExamName('');
    loadClass(e.target.value);
  };

  const handleExamSelect = async (name) => {
    setExamName(name);
    const exam = pastExams.find(e => e.name === name);
    if (exam) setMaxScore(exam.max);
    // load existing scores for this exam
    if (!selectedClass) return;
    try {
      const scoresData = await api('getScores', { classId: selectedClass, examName: name }, user.email);
      const map = {};
      (scoresData || []).forEach(s => { map[s.StudentID] = s.Score; });
      setScoreMap(map);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleSave = async () => {
    if (!selectedClass || !examName.trim()) {
      toast('Vui lòng chọn lớp và nhập tên bài kiểm tra', 'warning');
      return;
    }
    const records = roster
      .filter(s => scoreMap[s.StudentID] !== undefined && scoreMap[s.StudentID] !== '')
      .map(s => ({ studentId: s.StudentID, score: parseFloat(scoreMap[s.StudentID]) }));
    if (!records.length) {
      toast('Chưa nhập điểm cho học sinh nào', 'warning');
      return;
    }
    setSaving(true);
    try {
      await api('addScores', {
        classId: selectedClass,
        examName: examName.trim(),
        maxScore: parseFloat(maxScore) || 10,
        date: examDate,
        records,
      }, user.email);
      toast(`Đã lưu điểm ${records.length} học sinh`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedCls = classes.find(c => c.ClassID === selectedClass);

  return (
    <div>
      <div className="page-header">
        <h1><span>📝</span> Nhập Điểm</h1>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Lớp học</label>
              <select className="form-control" value={selectedClass} onChange={handleClassChange}>
                <option value="">-- Chọn lớp --</option>
                {classes.map(c => (
                  <option key={c.ClassID} value={c.ClassID}>{c.ClassName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tên bài kiểm tra</label>
              <input
                className="form-control"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="VD: Kiểm tra 15 phút"
                list="exam-list"
              />
              <datalist id="exam-list">
                {pastExams.map(e => <option key={e.name} value={e.name} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Điểm tối đa</label>
              <input
                className="form-control"
                type="number"
                value={maxScore}
                onChange={e => setMaxScore(e.target.value)}
                min="1" max="100"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Ngày kiểm tra</label>
              <input
                className="form-control"
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
              />
            </div>
          </div>

          {pastExams.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Bài kiểm tra đã có:</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {pastExams.map(e => (
                  <button
                    key={e.name}
                    className={`btn btn-sm ${examName === e.name ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => handleExamSelect(e.name)}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary)' }}>Đang tải...</div>}

      {!loading && selectedClass && roster.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📋 Danh sách học sinh — {selectedCls?.ClassName}</span>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : '💾 Lưu điểm'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Họ và tên</th>
                  <th style={{ width: 150 }}>Điểm (/{maxScore})</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s, i) => (
                  <tr key={s.StudentID}>
                    <td>{i + 1}</td>
                    <td>{s.FullName}</td>
                    <td>
                      <input
                        type="number"
                        className="form-control"
                        style={{ padding: '0.4rem 0.75rem', width: 100 }}
                        min="0"
                        max={maxScore}
                        step="0.5"
                        value={scoreMap[s.StudentID] ?? ''}
                        onChange={e => setScoreMap(prev => ({ ...prev, [s.StudentID]: e.target.value }))}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '1rem', textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : '💾 Lưu điểm'}
            </button>
          </div>
        </div>
      )}

      {!loading && selectedClass && roster.length === 0 && (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <div className="empty-icon">📭</div>
          <p>Lớp này chưa có học sinh nào</p>
        </div>
      )}
    </div>
  );
}
