import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// Bỏ dấu tiếng Việt để gõ "nguyen van an" vẫn tìm ra "Nguyễn Văn An"
const fold = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/**
 * Ô tìm nhanh (Ctrl+K): trang, lớp học, học sinh.
 * pages: [{ icon, label, path }] — menu của vai trò hiện tại.
 */
export default function SearchPalette({ open, onClose, user, pages }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    api('getClasses', {}, user.email).then(d => setClasses(d || [])).catch(() => {});
    if (user.role === 'ADMIN' || user.role === 'TEACHER') {
      api('getStudents', {}, user.email).then(d => setStudents(d || [])).catch(() => {});
    }
  }, [open]);

  const items = useMemo(() => {
    const all = [
      ...pages.map(p => ({ key: `p${p.path}`, icon: p.icon, title: p.label, sub: 'Trang', to: p.path })),
      ...classes.map(c => ({
        key: `c${c.ClassID}`,
        icon: '🏫',
        title: c.ClassName,
        sub: `Lớp ${[c.Subject, c.Grade && `khối ${c.Grade}`].filter(Boolean).join(' · ')} — mở điểm danh`,
        to: `/attendance?classId=${encodeURIComponent(c.ClassID)}`,
        extra: c.ClassID,
      })),
      ...students.map(s => ({
        key: `s${s.StudentID}`,
        icon: '👤',
        title: s.FullName,
        sub: `Học sinh ${s.SchoolClass ? `lớp ${s.SchoolClass} · ` : ''}${s.ParentPhone || ''} — xem báo cáo`,
        to: `/parent/${encodeURIComponent(s.StudentID)}`,
        extra: `${s.StudentID} ${s.ParentName || ''} ${s.ParentPhone || ''}`,
      })),
    ];
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return all.slice(0, 12);
    return all
      .filter(it => {
        const hay = fold(`${it.title} ${it.extra || ''}`);
        return words.every(w => hay.includes(w));
      })
      .slice(0, 20);
  }, [q, pages, classes, students]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const go = it => {
    if (!it) return;
    onClose();
    navigate(it.to);
  };

  const onKey = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') go(items[active]);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-palette" role="dialog" aria-label="Tìm nhanh">
        <input
          ref={inputRef}
          className="search-palette-input"
          placeholder="Tìm học sinh, lớp học, trang... (không cần gõ dấu)"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="search-palette-list">
          {items.length === 0 && <div className="search-palette-empty">Không tìm thấy kết quả nào</div>}
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              className={`search-palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it)}
            >
              <span className="search-palette-icon">{it.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span className="search-palette-title">{it.title}</span>
                <span className="search-palette-sub">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="search-palette-hint">↑↓ để chọn · Enter để mở · Esc để đóng</div>
      </div>
    </div>
  );
}
