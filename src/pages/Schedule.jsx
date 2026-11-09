import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import Modal from '../components/Modal';
import {
  DEFAULT_SITES,
  DEFAULT_TEACHER_PROFILES,
  DEFAULT_SCHEDULE_SLOTS,
} from '../data/scheduleDefaultData';
import '../schedule.css';

const STORAGE_KEYS = {
  SLOTS: 'toanx_schedule_slots_v2',
  SITES: 'toanx_schedule_sites_v2',
  TEACHERS: 'toanx_schedule_teachers_v2',
};

const WEEKDAYS = [
  { day: 2, short: 'T2', label: 'Thứ 2' },
  { day: 3, short: 'T3', label: 'Thứ 3' },
  { day: 4, short: 'T4', label: 'Thứ 4' },
  { day: 5, short: 'T5', label: 'Thứ 5' },
  { day: 6, short: 'T6', label: 'Thứ 6' },
  { day: 7, short: 'T7', label: 'Thứ 7' },
  { day: 8, short: 'CN', label: 'Chủ nhật' },
];

const SESSIONS = [
  { key: 'morning', label: 'Sáng', icon: '🌅', defaultRange: '07:30 – 11:30' },
  { key: 'afternoon', label: 'Chiều', icon: '☀️', defaultRange: '13:00 – 17:30' },
  { key: 'evening', label: 'Tối', icon: '🌙', defaultRange: '17:30 – 22:30' },
];

const COLOR_OPTIONS = [
  { key: 'navy', label: 'Xanh Nắng Mai', bg: '#f0fdfa', color: '#0d9488' },
  { key: 'teal', label: 'Ngọc Lục Bảo', bg: '#ccfbf1', color: '#0f766e' },
  { key: 'green', label: 'Xanh Lá', bg: '#f0fdf4', color: '#16a34a' },
  { key: 'blue', label: 'Xanh Dương', bg: '#f0f9ff', color: '#0284c7' },
  { key: 'purple', label: 'Tím', bg: '#f5f3ff', color: '#7c3aed' },
  { key: 'pink', label: 'Hồng', bg: '#fff1f2', color: '#e11d48' },
  { key: 'orange', label: 'Cam Nắng', bg: '#fff7ed', color: '#ea580c' },
  { key: 'yellow', label: 'Vàng Nắng Mai', bg: '#fffbeb', color: '#d97706' },
];

const MODE_OPTIONS = [
  { key: 'offline', label: 'Trực tiếp' },
  { key: 'online', label: 'Online' },
  { key: 'hybrid', label: 'Kết hợp' },
];

const FILTER_ORDER = ['site', 'grade', 'subject', 'class', 'teacher', 'mode'];

function norm(s) {
  let value = String(s == null ? '' : s).trim().toLowerCase();
  if (value.normalize) {
    value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return value.replace(/đ/g, 'd').replace(/\s+/g, ' ');
}

function timeLabel(minute) {
  const mClamp = Math.max(0, Math.min(1439, Math.round(minute)));
  const h = Math.floor(mClamp / 60);
  const m = mClamp % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeToMin(timeStr) {
  if (!timeStr) return 450;
  const [h, m] = timeStr.split(':').map(Number);
  return (isFinite(h) ? h : 7) * 60 + (isFinite(m) ? m : 30);
}

function inferSession(startMin) {
  if (startMin < 720) return 'morning'; // Trước 12:00
  if (startMin < 1020) return 'afternoon'; // 12:00 - 16:59
  return 'evening'; // Từ 17:00 trở đi
}

function getWeekdayLabel(day) {
  return WEEKDAYS.find(w => w.day === Number(day))?.label || `Thứ ${day}`;
}

function getWeekdayShort(day) {
  return WEEKDAYS.find(w => w.day === Number(day))?.short || `T${day}`;
}

function getShortSiteLabel(siteName, siteId) {
  const raw = String(siteName || '').trim();
  if (/co\s*so\s*1/i.test(norm(raw)) || siteId === '21702') return 'CS1';
  if (/co\s*so\s*2/i.test(norm(raw)) || siteId === '21703') return 'CS2';
  if (/co\s*so\s*3/i.test(norm(raw))) return 'CS3';
  if (raw.length > 10) return raw.slice(0, 10);
  return raw || 'CS';
}

const EMPTY_SLOT_FORM = {
  id: '',
  className: '',
  subject: 'Toán',
  grade: 'Khối 8',
  teacher: '',
  siteId: '21703',
  modeKey: 'offline',
  days: [2],
  startTime: '07:30',
  endTime: '09:00',
  color: 'navy',
  room: 'Phòng 1',
  roomLocation: '',
  roomCapacity: '16',
  capacity: '20',
  startDate: '',
  endDate: '',
  contact: '0971120360',
  notes: '',
};

const EMPTY_SITE_FORM = {
  id: '',
  name: '',
  address: '',
  phone: '',
  mapUrl: '',
  note: '',
};

const EMPTY_TEACHER_FORM = {
  name: '',
  role: 'Giáo viên Toán',
  subjects: 'Toán THCS - THPT',
  qualification: 'Cử nhân Sư phạm Toán',
  experience: '',
  photo: '',
  phone: '',
  email: '',
  bio: '',
};

export default function Schedule({ isPublicPage = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'ADMIN';

  const rootRef = useRef(null);
  const [listCols, setListCols] = useState(3);

  // Highlight today's weekday column (JS getDay(): 0=Sun->8, 1=Mon->2, ..., 6=Sat->7)
  const todayWeekday = useMemo(() => {
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 8 : jsDay + 1;
  }, []);

  // Data state (initialized from localStorage or clean state)
  const [slots, setSlots] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SLOTS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      const v1 = localStorage.getItem('toanx_schedule_slots_v1');
      if (v1 !== null) {
        const parsed = JSON.parse(v1);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    // Mặc định để trống sạch sẽ, không tải 45 ca học mẫu của toanx khi triển khai mới
    return [];
  });

  const [sites, setSites] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SITES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasOld = parsed.some(
            s =>
              s.address?.includes('Phú lộc') ||
              s.phone === '0905304796' ||
              s.phone === '0783700833'
          );
          if (!hasOld) return parsed;
        }
      }
    } catch (e) {}
    return DEFAULT_SITES;
  });

  const [teacherProfiles, setTeacherProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {}
    // Mặc định để trống sạch sẽ, không hiển thị giáo viên mẫu cũ
    return {};
  });

  const [systemClasses, setSystemClasses] = useState([]);

  // Persist changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SLOTS, JSON.stringify(slots));
    } catch (e) {}
  }, [slots]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SITES, JSON.stringify(sites));
    } catch (e) {}
  }, [sites]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teacherProfiles));
    } catch (e) {}
  }, [teacherProfiles]);

  // Optionally load classes from backend if logged in
  useEffect(() => {
    if (user?.email) {
      api('getClasses', {}, user.email)
        .then(cls => {
          if (Array.isArray(cls)) setSystemClasses(cls);
        })
        .catch(() => {});
    }
  }, [user]);

  // View state
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 900 ? 'list' : 'table'
  );
  const [viewTouched, setViewTouched] = useState(false);
  const [compactConcurrent, setCompactConcurrent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Filters state
  const [filters, setFilters] = useState({
    site: '',
    grade: '',
    subject: '',
    class: '',
    teacher: '',
    mode: '',
  });

  // Modal state (Class detail, Concurrent classes, Teacher profile panel)
  const [activeSlot, setActiveSlot] = useState(null);
  const [concurrentGroup, setConcurrentGroup] = useState(null);
  const [fromConcurrent, setFromConcurrent] = useState(false);
  const [activeTeacherProfile, setActiveTeacherProfile] = useState(null);

  // Admin CRUD Modals
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM);

  const [showSitesModal, setShowSitesModal] = useState(false);
  const [siteForm, setSiteForm] = useState(EMPTY_SITE_FORM);
  const [editingSiteId, setEditingSiteId] = useState(null);

  const [showTeachersModal, setShowTeachersModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState(EMPTY_TEACHER_FORM);

  // Responsive listener
  useEffect(() => {
    function handleResize() {
      if (rootRef.current) {
        const w = rootRef.current.getBoundingClientRect().width || window.innerWidth;
        const gap = 12;
        const preferredCardWidth = 220;
        const cols = Math.max(2, Math.min(6, Math.floor((w + gap) / (preferredCardWidth + gap))));
        setListCols(cols);
      }
      if (!viewTouched) {
        setViewMode(window.innerWidth <= 900 ? 'list' : 'table');
      }
      if (window.innerWidth > 640) {
        setMobileFilterOpen(false);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewTouched]);

  // Fullscreen & Escape key listeners
  useEffect(() => {
    function onFullscreenChange() {
      const nativeActive =
        document.fullscreenElement === rootRef.current ||
        document.webkitFullscreenElement === rootRef.current;
      setIsFullscreen(nativeActive);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (activeTeacherProfile) {
          setActiveTeacherProfile(null);
        } else if (activeSlot || concurrentGroup) {
          setActiveSlot(null);
          setConcurrentGroup(null);
          setFromConcurrent(false);
        } else if (isPseudoFullscreen) {
          setIsPseudoFullscreen(false);
          document.body.classList.remove('txt-fullscreen-open');
        }
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeTeacherProfile, activeSlot, concurrentGroup, isPseudoFullscreen]);

  // Site lookup map
  const siteMap = useMemo(() => {
    const map = {};
    sites.forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [sites]);

  // Build schedule summary per className across all slots (e.g. "T2, T4, T6 · 07:30–09:00")
  const classScheduleMap = useMemo(() => {
    const byClass = {};
    slots.forEach(s => {
      if (!byClass[s.className]) byClass[s.className] = [];
      byClass[s.className].push(s);
    });
    const result = {};
    Object.keys(byClass).forEach(clsName => {
      const clsSlots = byClass[clsName]
        .slice()
        .sort((a, b) => a.day - b.day || a.startMin - b.startMin);
      const byTime = [];
      clsSlots.forEach(s => {
        const timeStr = s.time || `${timeLabel(s.startMin)}–${timeLabel(s.endMin)}`;
        let existing = byTime.find(x => x.time === timeStr);
        if (!existing) {
          existing = { time: timeStr, days: [] };
          byTime.push(existing);
        }
        const shortDay = getWeekdayShort(s.day);
        if (!existing.days.includes(shortDay)) existing.days.push(shortDay);
      });
      result[clsName] = {
        lines: byTime.map(g => ({ daysLabel: g.days.join(', '), time: g.time })),
        summaryText: byTime.map(g => `${g.days.join(', ')} · ${g.time}`).join(' ; '),
      };
    });
    return result;
  }, [slots]);

  // All unique grades sorted naturally (Khối 6 -> Khối 12 -> Khối phụ đạo)
  const allGradesSorted = useMemo(() => {
    const set = new Set();
    slots.forEach(s => {
      if (s.grade) set.add(s.grade);
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      if (isFinite(numA) && isFinite(numB)) return numA - numB;
      if (isFinite(numA)) return -1;
      if (isFinite(numB)) return 1;
      return a.localeCompare(b, 'vi');
    });
  }, [slots]);

  // Cascading filter options (Cơ sở -> Khối -> Môn học -> Lớp -> Giáo viên -> Hình thức)
  const filterOptions = useMemo(() => {
    const matchesUpstream = (slot, stopIndex, currentFilters) => {
      for (let i = 0; i < stopIndex; i++) {
        const key = FILTER_ORDER[i];
        const selected = currentFilters[key];
        if (!selected) continue;
        const slotVal =
          key === 'site'
            ? slot.siteId
            : key === 'grade'
            ? slot.grade
            : key === 'subject'
            ? slot.subject
            : key === 'class'
            ? slot.className
            : key === 'teacher'
            ? slot.teacher
            : slot.modeKey;
        if (norm(slotVal) !== norm(selected)) return false;
      }
      return true;
    };

    const collectAllowed = (stopIndex, extractor) => {
      const set = new Set();
      slots.forEach(s => {
        if (matchesUpstream(s, stopIndex, filters)) {
          const val = extractor(s);
          if (val) set.add(val);
        }
      });
      return Array.from(set);
    };

    const siteIds = collectAllowed(0, s => s.siteId);
    const grades = collectAllowed(1, s => s.grade);
    const subjects = collectAllowed(2, s => s.subject);
    const classes = collectAllowed(3, s => s.className);
    const teachers = collectAllowed(4, s => s.teacher);
    const modes = collectAllowed(5, s => s.modeKey);

    return {
      site: sites.filter(st => siteIds.includes(st.id) || sites.length > 0),
      grade: grades,
      subject: subjects,
      class: classes,
      teacher: teachers,
      mode: MODE_OPTIONS.filter(m => modes.includes(m.key)),
    };
  }, [slots, sites, filters]);

  function handleFilterChange(changedKey, value) {
    setFilters(prev => {
      const next = { ...prev, [changedKey]: value };
      const changedIdx = FILTER_ORDER.indexOf(changedKey);
      for (let i = changedIdx + 1; i < FILTER_ORDER.length; i++) {
        const key = FILTER_ORDER[i];
        if (!next[key]) continue;
        const stillValid = slots.some(s => {
          for (let j = 0; j <= i; j++) {
            const k = FILTER_ORDER[j];
            const sel = next[k];
            if (!sel) continue;
            const v =
              k === 'site'
                ? s.siteId
                : k === 'grade'
                ? s.grade
                : k === 'subject'
                ? s.subject
                : k === 'class'
                ? s.className
                : k === 'teacher'
                ? s.teacher
                : s.modeKey;
            if (norm(v) !== norm(sel)) return false;
          }
          return true;
        });
        if (!stillValid) next[key] = '';
      }
      return next;
    });
  }

  function resetFilters() {
    setFilters({ site: '', grade: '', subject: '', class: '', teacher: '', mode: '' });
  }

  // Filtered slots
  const visibleSlots = useMemo(() => {
    return slots.filter(s => {
      if (filters.site && norm(s.siteId) !== norm(filters.site)) return false;
      if (filters.grade && norm(s.grade) !== norm(filters.grade)) return false;
      if (filters.subject && norm(s.subject) !== norm(filters.subject)) return false;
      if (filters.class && norm(s.className) !== norm(filters.class)) return false;
      if (filters.teacher && norm(s.teacher) !== norm(filters.teacher)) return false;
      if (filters.mode && norm(s.modeKey) !== norm(filters.mode)) return false;
      return true;
    });
  }, [slots, filters]);

  const activeFilterLabels = useMemo(() => {
    const labels = [];
    if (filters.site) {
      const st = siteMap[filters.site];
      labels.push(st ? st.name : filters.site);
    }
    if (filters.grade) labels.push(filters.grade);
    if (filters.subject) labels.push(filters.subject);
    if (filters.class) labels.push(filters.class);
    if (filters.teacher) labels.push(filters.teacher);
    if (filters.mode) {
      const m = MODE_OPTIONS.find(x => x.key === filters.mode);
      labels.push(m ? m.label : filters.mode);
    }
    return labels;
  }, [filters, siteMap]);

  const hasActiveFilters = activeFilterLabels.length > 0;

  // Count of slots per weekday for column headers
  const daySlotCounts = useMemo(() => {
    const counts = {};
    WEEKDAYS.forEach(w => {
      counts[w.day] = 0;
    });
    visibleSlots.forEach(s => {
      const d = Number(s.day);
      if (counts[d] !== undefined) counts[d] += 1;
    });
    return counts;
  }, [visibleSlots]);

  // Scientific Table View Layout: Chronological Flex Stack per (Session × Weekday) — Zero Overlap!
  const sessionTableLayouts = useMemo(() => {
    const layouts = {};
    SESSIONS.forEach(({ key: sessionKey, defaultRange }) => {
      const sessionSlots = visibleSlots.filter(s => s.session === sessionKey);
      if (sessionSlots.length === 0) {
        layouts[sessionKey] = { hidden: true, count: 0 };
        return;
      }

      const dayGroups = {};
      let earliest = 1440;
      let latest = 0;

      WEEKDAYS.forEach(({ day }) => {
        const daySlots = sessionSlots
          .filter(s => Number(s.day) === day)
          .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

        const groupsMap = new Map();
        daySlots.forEach(slot => {
          const gKey = `${slot.startMin}-${slot.endMin}`;
          if (!groupsMap.has(gKey)) {
            groupsMap.set(gKey, {
              key: gKey,
              day,
              startMin: slot.startMin,
              endMin: slot.endMin,
              timeLabel: slot.time || `${timeLabel(slot.startMin)}–${timeLabel(slot.endMin)}`,
              cards: [],
            });
          }
          groupsMap.get(gKey).cards.push(slot);
          earliest = Math.min(earliest, slot.startMin);
          latest = Math.max(latest, slot.endMin);
        });
        dayGroups[day] = Array.from(groupsMap.values());
      });

      const timeRangeLabel =
        earliest < latest ? `${timeLabel(earliest)} – ${timeLabel(latest)}` : defaultRange;

      layouts[sessionKey] = {
        hidden: false,
        count: sessionSlots.length,
        timeRangeLabel,
        dayGroups,
      };
    });
    return layouts;
  }, [visibleSlots]);

  // Compute List View sections per session
  const sessionListSections = useMemo(() => {
    return SESSIONS.map(({ key: sessionKey, label }) => {
      const sessionSlots = visibleSlots.filter(s => s.session === sessionKey);
      const seenClasses = new Set();
      const uniqueCards = [];
      sessionSlots.forEach(slot => {
        const uKey = `${norm(slot.className)}|${norm(slot.siteId)}|${norm(slot.teacher)}`;
        if (!seenClasses.has(uKey)) {
          seenClasses.add(uKey);
          uniqueCards.push(slot);
        }
      });
      return {
        key: sessionKey,
        label,
        cards: uniqueCards,
      };
    });
  }, [visibleSlots]);

  const totalVisibleClasses = useMemo(() => {
    const seen = new Set();
    visibleSlots.forEach(slot => {
      seen.add(`${norm(slot.className)}|${norm(slot.siteId)}`);
    });
    return seen.size;
  }, [visibleSlots]);

  // Visible sites in footer
  const visibleSites = useMemo(() => {
    return sites.filter(st => !filters.site || norm(st.id) === norm(filters.site));
  }, [sites, filters.site]);

  // Fullscreen & Print handlers
  function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    const nativeActive =
      document.fullscreenElement === el || document.webkitFullscreenElement === el;
    if (nativeActive) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      document.body.classList.remove('txt-fullscreen-open');
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      try {
        const res = req.call(el);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            setIsPseudoFullscreen(true);
            document.body.classList.add('txt-fullscreen-open');
          });
        }
      } catch (e) {
        setIsPseudoFullscreen(true);
        document.body.classList.add('txt-fullscreen-open');
      }
    } else {
      setIsPseudoFullscreen(true);
      document.body.classList.add('txt-fullscreen-open');
    }
  }

  function handlePrint() {
    setActiveSlot(null);
    setConcurrentGroup(null);
    setActiveTeacherProfile(null);
    const el = rootRef.current;
    if (!el) return;
    el.classList.add('is-print-target');
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      ancestor.classList.add('txt-print-ancestor');
      ancestor = ancestor.parentElement;
    }
    document.body.classList.add('txt-printing');

    const cleanup = () => {
      el.classList.remove('is-print-target');
      document
        .querySelectorAll('.txt-print-ancestor')
        .forEach(node => node.classList.remove('txt-print-ancestor'));
      document.body.classList.remove('txt-printing');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      window.print();
    }, 100);
  }

  // Modal helpers
  function openSlotDetail(slot, isFromConcurrent = false) {
    setActiveTeacherProfile(null);
    setFromConcurrent(isFromConcurrent);
    if (!isFromConcurrent) setConcurrentGroup(null);
    setActiveSlot(slot);
  }

  function openConcurrentModal(group) {
    setActiveTeacherProfile(null);
    setActiveSlot(null);
    setFromConcurrent(false);
    setConcurrentGroup(group);
  }

  function closeAllDetailModals() {
    setActiveTeacherProfile(null);
    setActiveSlot(null);
    setConcurrentGroup(null);
    setFromConcurrent(false);
  }

  // Admin CRUD: Add / Edit Slot
  function openAddSlotModal() {
    setEditingSlotId(null);
    setSlotForm({
      ...EMPTY_SLOT_FORM,
      siteId: sites[0]?.id || '21703',
      teacher: Object.keys(teacherProfiles)[0] || '',
    });
    setShowSlotModal(true);
  }

  function openEditSlotModal(slot) {
    closeAllDetailModals();
    setEditingSlotId(slot.id);
    setSlotForm({
      id: slot.id,
      className: slot.className || '',
      subject: slot.subject || 'Toán',
      grade: slot.grade || '',
      teacher: slot.teacher || '',
      siteId: slot.siteId || sites[0]?.id || '',
      modeKey: slot.modeKey || 'offline',
      days: [Number(slot.day) || 2],
      startTime: timeLabel(slot.startMin),
      endTime: timeLabel(slot.endMin),
      color: slot.color || 'navy',
      room: slot.room || '',
      roomLocation: slot.roomLocation || '',
      roomCapacity: slot.roomCapacity || '',
      capacity: slot.capacity || '',
      startDate: slot.startDate || '',
      endDate: slot.endDate || '',
      contact: slot.contact || '',
      notes: slot.notes || '',
    });
    setShowSlotModal(true);
  }

  function handleSaveSlot() {
    if (!slotForm.className.trim()) {
      toast('Vui lòng nhập tên lớp học', 'warning');
      return;
    }
    const startMin = parseTimeToMin(slotForm.startTime);
    const endMin = parseTimeToMin(slotForm.endTime);
    if (endMin <= startMin) {
      toast('Giờ kết thúc phải lớn hơn giờ bắt đầu', 'warning');
      return;
    }
    if (!slotForm.days || slotForm.days.length === 0) {
      toast('Vui lòng chọn ít nhất 1 ngày trong tuần', 'warning');
      return;
    }

    const session = inferSession(startMin);
    const timeStr = `${timeLabel(startMin)}–${timeLabel(endMin)}`;
    const siteObj = siteMap[slotForm.siteId] || sites[0] || {};
    const modeObj = MODE_OPTIONS.find(m => m.key === slotForm.modeKey) || MODE_OPTIONS[0];

    if (editingSlotId) {
      const [firstDay, ...extraDays] = slotForm.days;
      setSlots(prev => {
        const updated = prev.map(s =>
          s.id === editingSlotId
            ? {
                ...s,
                session,
                day: Number(firstDay),
                startMin,
                endMin,
                time: timeStr,
                weekday: getWeekdayLabel(firstDay),
                color: slotForm.color,
                siteId: slotForm.siteId,
                siteName: siteObj.name || '',
                modeKey: slotForm.modeKey,
                modeLabel: modeObj.label,
                className: slotForm.className.trim(),
                subject: slotForm.subject.trim() || 'Toán',
                grade: slotForm.grade.trim(),
                teacher: slotForm.teacher.trim(),
                room: slotForm.room.trim(),
                roomLocation: slotForm.roomLocation.trim(),
                roomCapacity: slotForm.roomCapacity,
                capacity: slotForm.capacity,
                startDate: slotForm.startDate,
                endDate: slotForm.endDate,
                contact: slotForm.contact,
                notes: slotForm.notes,
              }
            : s
        );
        extraDays.forEach((d, idx) => {
          updated.push({
            id: `SCH_${Date.now()}_${idx}`,
            session,
            day: Number(d),
            startMin,
            endMin,
            time: timeStr,
            weekday: getWeekdayLabel(d),
            color: slotForm.color,
            siteId: slotForm.siteId,
            siteName: siteObj.name || '',
            modeKey: slotForm.modeKey,
            modeLabel: modeObj.label,
            className: slotForm.className.trim(),
            subject: slotForm.subject.trim() || 'Toán',
            grade: slotForm.grade.trim(),
            teacher: slotForm.teacher.trim(),
            room: slotForm.room.trim(),
            roomLocation: slotForm.roomLocation.trim(),
            roomCapacity: slotForm.roomCapacity,
            capacity: slotForm.capacity,
            startDate: slotForm.startDate,
            endDate: slotForm.endDate,
            contact: slotForm.contact,
            notes: slotForm.notes,
          });
        });
        return updated;
      });
      toast('Đã cập nhật ca học');
    } else {
      const newEntries = slotForm.days.map((d, idx) => ({
        id: `SCH_${Date.now()}_${idx}`,
        session,
        day: Number(d),
        startMin,
        endMin,
        time: timeStr,
        weekday: getWeekdayLabel(d),
        color: slotForm.color,
        siteId: slotForm.siteId,
        siteName: siteObj.name || '',
        modeKey: slotForm.modeKey,
        modeLabel: modeObj.label,
        className: slotForm.className.trim(),
        subject: slotForm.subject.trim() || 'Toán',
        grade: slotForm.grade.trim(),
        teacher: slotForm.teacher.trim(),
        room: slotForm.room.trim(),
        roomLocation: slotForm.roomLocation.trim(),
        roomCapacity: slotForm.roomCapacity,
        capacity: slotForm.capacity,
        startDate: slotForm.startDate,
        endDate: slotForm.endDate,
        contact: slotForm.contact,
        notes: slotForm.notes,
      }));
      setSlots(prev => [...prev, ...newEntries]);
      toast(`Đã thêm ${newEntries.length} buổi học cho lớp ${slotForm.className}`);
    }
    setShowSlotModal(false);
  }

  function handleDeleteSlot(slot) {
    if (!confirm(`Xóa buổi học ${slot.className} (${slot.weekday} · ${slot.time})?`)) return;
    setSlots(prev => prev.filter(s => s.id !== slot.id));
    closeAllDetailModals();
    toast('Đã xóa buổi học');
  }

  function handleDeleteAllClassSlots(className) {
    if (!confirm(`Xóa toàn bộ các buổi học trong tuần của lớp "${className}"?`)) return;
    setSlots(prev => prev.filter(s => s.className !== className));
    closeAllDetailModals();
    toast(`Đã xóa toàn bộ lịch của lớp ${className}`);
  }

  function handleDeleteAllSlots() {
    if (slots.length === 0) {
      toast('Thời khóa biểu hiện đã trống', 'warning');
      return;
    }
    if (
      !confirm(
        `Bạn có chắc chắn muốn XÓA TẤT CẢ các lớp (${slots.length} ca học) trong thời khóa biểu không?`
      )
    ) {
      return;
    }
    setSlots([]);
    resetFilters();
    closeAllDetailModals();
    toast('Đã xóa tất cả các lớp trong thời khóa biểu');
  }

  function handleResetDefaultData() {
    if (!confirm('Khôi phục dữ liệu thời khóa biểu mặc định của Trung tâm Nắng Mai?')) return;
    setSlots(DEFAULT_SCHEDULE_SLOTS);
    setSites(DEFAULT_SITES);
    setTeacherProfiles(DEFAULT_TEACHER_PROFILES);
    resetFilters();
    toast('Đã khôi phục dữ liệu thời khóa biểu mẫu');
  }

  // Site CRUD
  function handleSaveSite() {
    if (!siteForm.name.trim()) {
      toast('Vui lòng nhập tên cơ sở', 'warning');
      return;
    }
    if (editingSiteId) {
      setSites(prev =>
        prev.map(st => (st.id === editingSiteId ? { ...siteForm, id: editingSiteId } : st))
      );
      toast('Đã cập nhật cơ sở');
    } else {
      const newId = String(Date.now()).slice(-5);
      setSites(prev => [...prev, { ...siteForm, id: newId }]);
      toast('Đã thêm cơ sở mới');
    }
    setEditingSiteId(null);
    setSiteForm(EMPTY_SITE_FORM);
  }

  function handleDeleteSite(id) {
    if (!confirm('Xóa cơ sở này?')) return;
    setSites(prev => prev.filter(st => st.id !== id));
    toast('Đã xóa cơ sở');
  }

  // Teacher Profile CRUD
  function handleSaveTeacherProfile() {
    if (!teacherForm.name.trim()) {
      toast('Vui lòng nhập tên giáo viên', 'warning');
      return;
    }
    setTeacherProfiles(prev => ({
      ...prev,
      [teacherForm.name.trim()]: { ...teacherForm, name: teacherForm.name.trim() },
    }));
    setTeacherForm(EMPTY_TEACHER_FORM);
    toast('Đã lưu hồ sơ giáo viên');
  }

  const fullscreenActive = isFullscreen || isPseudoFullscreen;

  const morningCount = sessionTableLayouts.morning?.count || 0;
  const afternoonCount = sessionTableLayouts.afternoon?.count || 0;
  const eveningCount = sessionTableLayouts.evening?.count || 0;

  const timetableContent = (
    <>
      {isAdmin && (
        <div className="txt-admin-bar">
          <div className="txt-admin-bar-title">
            <span>☀️ Quản trị Thời khóa biểu Nắng Mai</span>
            <span className="badge badge-info">{slots.length} ca học</span>
          </div>
          <div className="txt-admin-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={openAddSlotModal}>
              + Thêm lịch học
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEditingSiteId(null);
                setSiteForm(EMPTY_SITE_FORM);
                setShowSitesModal(true);
              }}
            >
              🏢 Quản lý cơ sở ({sites.length})
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setTeacherForm(EMPTY_TEACHER_FORM);
                setShowTeachersModal(true);
              }}
            >
              👨‍🏫 Hồ sơ giáo viên ({Object.keys(teacherProfiles).length})
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const url = `${window.location.origin}/lich-hoc`;
                navigator.clipboard?.writeText(url);
                toast('Đã sao chép link Lịch học công khai (/lich-hoc)!');
              }}
            >
              🔗 Copy link công khai
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleResetDefaultData}>
              🔄 Khôi phục mẫu
            </button>
            {slots.length > 0 && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleDeleteAllSlots}
              >
                🗑️ Xóa tất cả các lớp
              </button>
            )}
          </div>
        </div>
      )}

      <section
        ref={rootRef}
        className={[
          'txt-timetable',
          viewMode === 'table' ? 'is-view-table' : 'is-view-list',
          fullscreenActive ? 'is-fullscreen-active' : '',
          isPseudoFullscreen ? 'is-pseudo-fullscreen' : '',
          mobileFilterOpen ? 'is-filter-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-modal="1"
        data-font-mode="site"
        style={{
          '--txt-font-family': '"Plus Jakarta Sans", "Quicksand", -apple-system, sans-serif',
          ...(fullscreenActive
            ? {
                overflowY: 'auto',
                overflowX: 'hidden',
                height: '100vh',
                maxHeight: '100vh',
              }
            : {}),
        }}
      >
        {/* Header — Thương hiệu Trung tâm Nắng Mai */}
        <div className="txt-head">
          <div className="txt-brand">
            <div className="txt-brand-sun">☀️</div>
            <div className="txt-brand-text">
              <span className="txt-wordmark">
                Nắng <b>Mai</b>
              </span>
              <span className="txt-brand-sub">Trung tâm Giáo dục & Bồi dưỡng</span>
            </div>
          </div>
          <h2>THỜI KHÓA BIỂU</h2>
          <div className="txt-contact">
            <div>
              <strong>Cơ sở:</strong> Xem thông tin từng cơ sở Nắng Mai phía dưới
            </div>
          </div>
        </div>

        {/* Display Controls, Quick Stats & Actions */}
        <div className="txt-display-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="txt-view-switch" role="group" aria-label="Chọn cách hiển thị">
              <span className="txt-view-switch-label">Hiển thị</span>
              <button
                type="button"
                className={`txt-view-btn ${viewMode === 'table' ? 'is-active' : ''}`}
                aria-pressed={viewMode === 'table'}
                title="Xem dạng bảng khoa học"
                onClick={() => {
                  setViewTouched(true);
                  setViewMode('table');
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 5h16v14H4zM4 10h16M9 5v14" />
                </svg>
                <span>Bảng</span>
              </button>
              <button
                type="button"
                className={`txt-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                aria-pressed={viewMode === 'list'}
                title="Xem dạng danh sách theo buổi"
                onClick={() => {
                  setViewTouched(true);
                  setViewMode('list');
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                </svg>
                <span>Danh sách</span>
              </button>
            </div>

            {/* Scientific Quick Stats */}
            <div className="txt-quick-stats" aria-label="Thống kê nhanh">
              <span className="txt-stat-pill">
                🏫 <b>{totalVisibleClasses}</b> lớp · <b>{visibleSlots.length}</b> ca/tuần
              </span>
              <span className="txt-stat-pill">
                🌅 Sáng: <b>{morningCount}</b>
              </span>
              <span className="txt-stat-pill">
                ☀️ Chiều: <b>{afternoonCount}</b>
              </span>
              <span className="txt-stat-pill">
                🌙 Tối: <b>{eveningCount}</b>
              </span>
            </div>
          </div>

          <div className="txt-view-actions" aria-label="Tùy chọn thời khóa biểu">
            {viewMode === 'table' && (
              <button
                type="button"
                className={`txt-action-btn ${compactConcurrent ? 'is-active' : ''}`}
                onClick={() => setCompactConcurrent(v => !v)}
                title="Gộp hoặc tách các lớp học diễn ra cùng khung giờ"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
                <span>{compactConcurrent ? 'Đang gộp ca trùng giờ' : 'Gộp ca trùng giờ'}</span>
              </button>
            )}
            <button
              type="button"
              className={`txt-action-btn txt-fullscreen-btn ${fullscreenActive ? 'is-active' : ''}`}
              aria-pressed={fullscreenActive}
              title={fullscreenActive ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
              onClick={toggleFullscreen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" />
              </svg>
              <span>{fullscreenActive ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</span>
            </button>
            <button
              type="button"
              className="txt-action-btn txt-print-btn"
              title="In thời khóa biểu"
              onClick={handlePrint}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z" />
              </svg>
              <span>In thời khóa biểu</span>
            </button>
            {slots.length > 0 ? (
              <button
                type="button"
                className="txt-action-btn txt-delete-all-btn"
                title="Xóa tất cả các lớp trong thời khóa biểu"
                onClick={handleDeleteAllSlots}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                </svg>
                <span>Xóa tất cả các lớp</span>
              </button>
            ) : (
              <button
                type="button"
                className="txt-action-btn"
                title="Khôi phục dữ liệu thời khóa biểu mẫu"
                onClick={handleResetDefaultData}
              >
                <span>🔄 Khôi phục mẫu</span>
              </button>
            )}
          </div>
        </div>

        {/* 1-Click Quick Filter Pills (Cơ sở & Khối) */}
        <div className="txt-quick-pills-bar" aria-label="Chọn nhanh Cơ sở và Khối">
          <div className="txt-pill-group">
            <span className="txt-pill-group-label">📍 Cơ sở:</span>
            <button
              type="button"
              className={`txt-quick-pill ${!filters.site ? 'is-active' : ''}`}
              onClick={() => handleFilterChange('site', '')}
            >
              Tất cả
            </button>
            {sites.map(st => (
              <button
                key={st.id}
                type="button"
                className={`txt-quick-pill ${filters.site === st.id ? 'is-active' : ''}`}
                onClick={() =>
                  handleFilterChange('site', filters.site === st.id ? '' : st.id)
                }
              >
                {st.name}
              </button>
            ))}
          </div>

          <span className="txt-pill-divider" aria-hidden="true" />

          <div className="txt-pill-group">
            <span className="txt-pill-group-label">🎓 Khối:</span>
            <button
              type="button"
              className={`txt-quick-pill ${!filters.grade ? 'is-active' : ''}`}
              onClick={() => handleFilterChange('grade', '')}
            >
              Tất cả
            </button>
            {allGradesSorted.map(g => (
              <button
                key={g}
                type="button"
                className={`txt-quick-pill ${filters.grade === g ? 'is-active' : ''}`}
                onClick={() => handleFilterChange('grade', filters.grade === g ? '' : g)}
              >
                {g.replace(/^Khối\s+/i, 'K')}
              </button>
            ))}
          </div>
        </div>

        {/* Print summary */}
        <div className="txt-print-filter-summary" aria-hidden="true">
          {hasActiveFilters
            ? `Bộ lọc đang áp dụng: ${activeFilterLabels.join(' · ')}`
            : 'Hiển thị toàn bộ thời khóa biểu Trung tâm Nắng Mai.'}
        </div>

        {/* Mobile filter bar */}
        <div className="txt-filter-mobile-bar">
          <button
            type="button"
            className="txt-mobile-filter-toggle"
            aria-expanded={mobileFilterOpen}
            onClick={() => setMobileFilterOpen(o => !o)}
          >
            <span className="txt-mobile-filter-toggle-main">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span>Bộ lọc chi tiết</span>
              {hasActiveFilters && (
                <span className="txt-mobile-filter-count">{activeFilterLabels.length}</span>
              )}
            </span>
            <span className="txt-mobile-filter-summary">
              {!hasActiveFilters
                ? 'Tất cả'
                : activeFilterLabels.length <= 2
                ? activeFilterLabels.join(' · ')
                : `${activeFilterLabels.slice(0, 2).join(' · ')} +${
                    activeFilterLabels.length - 2
                  }`}
            </span>
            <svg
              className="txt-mobile-filter-chevron"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m8 10 4 4 4-4" />
            </svg>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="txt-toolbar" aria-label="Bộ lọc thời khóa biểu">
          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
              <span>Cơ sở</span>
            </span>
            <select
              value={filters.site}
              onChange={e => handleFilterChange('site', e.target.value)}
            >
              <option value="">Tất cả cơ sở</option>
              {sites.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>

          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16v12H4zM8 6v12M4 10h4" />
              </svg>
              <span>Khối</span>
            </span>
            <select
              value={filters.grade}
              onChange={e => handleFilterChange('grade', e.target.value)}
            >
              <option value="">Tất cả khối</option>
              {filterOptions.grade.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
              </svg>
              <span>Môn học</span>
            </span>
            <select
              value={filters.subject}
              onChange={e => handleFilterChange('subject', e.target.value)}
            >
              <option value="">Tất cả môn</option>
              {filterOptions.subject.map(sub => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </label>

          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h14v12H5zM8 4h8v3M9 11h6M9 15h4" />
              </svg>
              <span>Lớp</span>
            </span>
            <select
              value={filters.class}
              onChange={e => handleFilterChange('class', e.target.value)}
            >
              <option value="">Tất cả lớp</option>
              {filterOptions.class.map(cls => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </label>

          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3" />
                <path d="M5.5 20a6.5 6.5 0 0 1 13 0M18 5.5l2 2" />
              </svg>
              <span>Giáo viên</span>
            </span>
            <select
              value={filters.teacher}
              onChange={e => handleFilterChange('teacher', e.target.value)}
            >
              <option value="">Tất cả giáo viên</option>
              {filterOptions.teacher.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="txt-filter">
            <span className="txt-filter-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M8 9h8M8 13h5M8 17h3" />
              </svg>
              <span>Hình thức</span>
            </span>
            <select
              value={filters.mode}
              onChange={e => handleFilterChange('mode', e.target.value)}
            >
              <option value="">Tất cả</option>
              {filterOptions.mode.map(m => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="txt-filter-actions-row">
            {hasActiveFilters && (
              <button type="button" className="txt-reset" onClick={resetFilters}>
                ✕ Đặt lại bộ lọc
              </button>
            )}
            <button
              type="button"
              className="txt-filter-done"
              onClick={() => setMobileFilterOpen(false)}
            >
              Xong
            </button>
          </div>
        </div>

        {/* SCIENTIFIC TABLE VIEW — Chronological Stack (Zero Overlapping Cards) */}
        <div className="txt-view-panel txt-table-view" data-view-panel="table">
          <div className="txt-table-scroll-hint" aria-hidden="true">
            ← Vuốt ngang để xem đầy đủ từ Thứ 2 đến Chủ nhật →
          </div>
          <div className="txt-table-wrap">
            <table className="txt-table">
              <thead>
                <tr>
                  <th className="txt-session-head">Buổi / Ca học</th>
                  {WEEKDAYS.map(w => {
                    const isToday = w.day === todayWeekday;
                    const count = daySlotCounts[w.day] || 0;
                    return (
                      <th key={w.day} className={isToday ? 'is-today' : ''}>
                        <div className="txt-th-day-wrap">
                          <span className="txt-th-day-name">
                            {w.label}
                            {isToday && <span className="txt-today-badge">Hôm nay</span>}
                          </span>
                          <span className="txt-th-day-count">
                            {count > 0 ? `${count} ca học` : 'Trống'}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SESSIONS.map(({ key: sessionKey, label: sessionLabel, icon }) => {
                  const layout = sessionTableLayouts[sessionKey];
                  if (!layout || layout.hidden) return null;

                  return (
                    <tr
                      key={sessionKey}
                      className="txt-session-row"
                      data-session={sessionKey}
                    >
                      <th className="txt-session">
                        <div className="txt-session-box">
                          <div className="txt-session-icon" aria-hidden="true">
                            {icon}
                          </div>
                          <div className="txt-session-title">Buổi {sessionLabel}</div>
                          <div className="txt-session-range">{layout.timeRangeLabel}</div>
                          <span className="txt-session-count">{layout.count} ca/tuần</span>
                        </div>
                      </th>

                      {WEEKDAYS.map(({ day }) => {
                        const groups = layout.dayGroups[day] || [];
                        const isToday = day === todayWeekday;

                        return (
                          <td
                            key={day}
                            data-day={day}
                            className={`txt-day-cell ${isToday ? 'is-today-col' : ''}`}
                          >
                            {groups.length === 0 ? (
                              <div className="txt-day-empty" aria-hidden="true">
                                —
                              </div>
                            ) : (
                              <div className="txt-day-stack">
                                {groups.map(group => {
                                  const isConcurrent = group.cards.length > 1;
                                  const maxNames = 2;

                                  return (
                                    <div
                                      key={group.key}
                                      className={[
                                        'txt-slot-group',
                                        isConcurrent ? 'is-concurrent-group' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      {isConcurrent && !compactConcurrent && (
                                        <div
                                          className="txt-concurrent-divider"
                                          onClick={() => openConcurrentModal(group)}
                                          style={{ cursor: 'pointer' }}
                                          title="Nhấn để mở danh sách so sánh các lớp cùng giờ"
                                        >
                                          ⚡ {group.cards.length} lớp cùng ca {group.timeLabel}
                                        </div>
                                      )}

                                      {compactConcurrent && isConcurrent ? (
                                        <button
                                          type="button"
                                          className="txt-concurrent-summary"
                                          onClick={() => openConcurrentModal(group)}
                                          aria-label={`Xem ${group.cards.length} lớp học cùng giờ`}
                                        >
                                          <span className="txt-concurrent-head">
                                            <strong>
                                              ⚡ {group.cards.length} lớp cùng giờ
                                            </strong>
                                            <span className="txt-concurrent-hint">
                                              Chi tiết
                                            </span>
                                          </span>
                                          <span className="txt-concurrent-time">
                                            🕒 {group.timeLabel}
                                          </span>
                                          <span className="txt-concurrent-preview">
                                            {group.cards.slice(0, maxNames).map(c => (
                                              <span
                                                key={c.id}
                                                className="txt-concurrent-chip"
                                                title={`${c.subject} · ${c.grade} · ${c.className}`}
                                              >
                                                {c.className}
                                              </span>
                                            ))}
                                            {group.cards.length > maxNames && (
                                              <span className="txt-concurrent-chip is-more">
                                                +{group.cards.length - maxNames}
                                              </span>
                                            )}
                                          </span>
                                        </button>
                                      ) : (
                                        group.cards.map(card => {
                                          const st = siteMap[card.siteId];
                                          const shortSite = getShortSiteLabel(
                                            st?.name || card.siteName,
                                            card.siteId
                                          );
                                          const isOnline =
                                            card.modeKey && card.modeKey !== 'offline';

                                          return (
                                            <button
                                              key={card.id}
                                              type="button"
                                              className={`txt-class-card txt-color-${
                                                card.color || 'navy'
                                              }`}
                                              onClick={() => openSlotDetail(card, false)}
                                              aria-label={`Xem chi tiết ${card.className}`}
                                            >
                                              {/* Row 1: Time Badge + Branch/Mode Pill */}
                                              <span className="txt-card-time-row">
                                                <span className="txt-card-time-pill">
                                                  <svg
                                                    viewBox="0 0 24 24"
                                                    aria-hidden="true"
                                                    focusable="false"
                                                  >
                                                    <circle cx="12" cy="12" r="8.5" />
                                                    <path d="M12 7.5v5l3.2 2" />
                                                  </svg>
                                                  <span>{group.timeLabel}</span>
                                                </span>

                                                {isOnline ? (
                                                  <span className="txt-card-site-pill is-online">
                                                    🌐 {card.modeLabel || 'Online'}
                                                  </span>
                                                ) : (
                                                  <span
                                                    className="txt-card-site-pill"
                                                    title={st?.name || card.siteName}
                                                  >
                                                    {shortSite}
                                                  </span>
                                                )}
                                              </span>

                                              {/* Row 2: Class Name + Grade Badge */}
                                              <span className="txt-card-main-row">
                                                <strong className="txt-class-name">
                                                  {card.className}
                                                </strong>
                                                <span className="txt-card-topline">
                                                  {card.grade && (
                                                    <span className="txt-grade-badge">
                                                      {card.grade.replace(/^Khối\s+/i, 'K')}
                                                    </span>
                                                  )}
                                                </span>
                                              </span>

                                              {/* Row 3: Teacher & Subject/Room Footer */}
                                              <span className="txt-card-footer">
                                                <span
                                                  className="txt-card-teacher"
                                                  title={card.teacher}
                                                >
                                                  👨‍🏫 {card.teacher || card.subject || 'Toán'}
                                                </span>
                                                {card.room && (
                                                  <span className="txt-card-room">
                                                    {card.room}
                                                  </span>
                                                )}
                                              </span>
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* LIST VIEW */}
        <div className="txt-view-panel txt-list-view" data-view-panel="list">
          {sessionListSections.map(section => {
            if (section.cards.length === 0) return null;
            return (
              <section
                key={section.key}
                className="txt-list-session"
                data-list-session={section.key}
              >
                <div className="txt-list-session-head">
                  <h3>Buổi {section.label}</h3>
                  <span>{section.cards.length} lớp</span>
                </div>
                <div
                  className="txt-list-grid"
                  style={{ '--txt-list-cols': String(listCols) }}
                >
                  {section.cards.map(card => {
                    const sched = classScheduleMap[card.className];
                    const st = siteMap[card.siteId];
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`txt-class-card txt-list-class-card txt-color-${
                          card.color || 'navy'
                        }`}
                        onClick={() => openSlotDetail(card, false)}
                        aria-label={`Xem chi tiết ${card.className}`}
                      >
                        <span className="txt-card-topline">
                          {card.subject && (
                            <span className="txt-subject-badge">{card.subject}</span>
                          )}
                          {card.grade && (
                            <span className="txt-grade-badge">{card.grade}</span>
                          )}
                        </span>
                        <strong className="txt-class-name">{card.className}</strong>
                        {card.teacher && (
                          <span className="txt-list-teacher">👨‍🏫 {card.teacher}</span>
                        )}
                        {(st?.name || card.siteName) && (
                          <span className="txt-list-site">
                            📍 {st?.name || card.siteName}
                          </span>
                        )}
                        {sched && sched.lines.length > 0 && (
                          <span className="txt-list-schedule">
                            {sched.lines.map((line, i) => (
                              <span key={i} className="txt-list-schedule-line">
                                <b>{line.daysLabel}</b>
                                <span>{line.time}</span>
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="txt-list-mode">
                          {card.modeLabel || 'Trực tiếp'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Empty State */}
        {visibleSlots.length === 0 && (
          <div className="txt-empty-state">
            {slots.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div>Thời khóa biểu hiện đang trống (đã xóa tất cả các lớp).</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openAddSlotModal}>
                    + Thêm lịch học mới
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetDefaultData}>
                    🔄 Khôi phục dữ liệu mẫu
                  </button>
                </div>
              </div>
            ) : (
              'Không có lịch phù hợp với bộ lọc.'
            )}
          </div>
        )}

        {/* Sites / Branches Section */}
        {visibleSites.length > 0 && (
          <section className="txt-sites" aria-label="Thông tin các cơ sở">
            <div className="txt-sites-heading">
              <h3>🏫 Thông tin các cơ sở Trung tâm Nắng Mai</h3>
              <span>Chọn cơ sở ở thanh chọn nhanh phía trên để xem lịch riêng từng địa điểm</span>
            </div>
            <div className="txt-sites-list">
              {visibleSites.map(st => (
                <div key={st.id} className="txt-site-row" data-site-info={st.id}>
                  <strong className="txt-site-name">{st.name}</strong>
                  <span className="txt-site-address">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    {st.address}
                  </span>
                  {st.phone && (
                    <span className="txt-site-phone">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6.6 3h3l1.5 4-1.7 1.5a14 14 0 0 0 6.2 6.2l1.5-1.7 4 1.5v3a2.5 2.5 0 0 1-2.8 2.5A17.5 17.5 0 0 1 3.9 5.8 2.5 2.5 0 0 1 6.6 3Z" />
                      </svg>
                      <a href={`tel:${st.phone.replace(/[^+0-9]/g, '')}`}>{st.phone}</a>
                    </span>
                  )}
                  {st.mapUrl && (
                    <span className="txt-site-map">
                      <a href={st.mapUrl} target="_blank" rel="noopener noreferrer">
                        Xem bản đồ <span aria-hidden="true">↗</span>
                      </a>
                    </span>
                  )}
                  {st.note && <div className="txt-site-note">{st.note}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Class Detail & Concurrent Popup Modal */}
        <div
          className={[
            'txt-modal',
            activeSlot || concurrentGroup ? 'is-open' : '',
            concurrentGroup && !activeSlot ? 'is-concurrent-modal' : '',
            fromConcurrent && activeSlot ? 'has-back' : '',
            activeTeacherProfile ? 'is-teacher-open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!(activeSlot || concurrentGroup)}
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết lớp học"
        >
          <div className="txt-modal-backdrop" onClick={closeAllDetailModals} />
          <div className="txt-modal-dialog" role="document">
            {fromConcurrent && activeSlot && concurrentGroup && (
              <button
                type="button"
                className="txt-modal-back"
                aria-label="Quay lại danh sách lớp"
                onClick={() => {
                  setActiveTeacherProfile(null);
                  setActiveSlot(null);
                  setFromConcurrent(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className="txt-modal-close"
              aria-label="Đóng"
              onClick={closeAllDetailModals}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div className="txt-modal-content">
              {/* Concurrent Classes View */}
              {concurrentGroup && !activeSlot && (
                <>
                  <h3>
                    {concurrentGroup.cards.length} lớp cùng giờ ·{' '}
                    {concurrentGroup.timeLabel}
                  </h3>
                  <p className="txt-concurrent-modal-intro">
                    Các lớp dưới đây diễn ra đồng thời. Chọn một lớp để xem giáo viên,
                    phòng học, ngày học và thông tin chi tiết.
                  </p>
                  <div className="txt-concurrent-modal-list">
                    {concurrentGroup.cards.map(c => {
                      const st = siteMap[c.siteId];
                      const meta = [
                        st?.name || c.siteName,
                        c.subject,
                        c.grade,
                        c.time || concurrentGroup.timeLabel,
                        c.teacher,
                        c.room,
                      ].filter(Boolean);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`txt-concurrent-modal-item txt-color-${
                            c.color || 'navy'
                          }`}
                          onClick={() => openSlotDetail(c, true)}
                        >
                          <span className="txt-concurrent-modal-main">
                            <strong>{c.className}</strong>
                            <small>{meta.join(' · ')}</small>
                          </span>
                          <span
                            className="txt-concurrent-modal-arrow"
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Single Class Detail View */}
              {activeSlot && (() => {
                const st = siteMap[activeSlot.siteId];
                const tProfile = teacherProfiles[activeSlot.teacher];
                const schedSummary =
                  classScheduleMap[activeSlot.className]?.summaryText ||
                  `${activeSlot.weekday} · ${activeSlot.time}`;
                const roomDisplay = [activeSlot.room, activeSlot.roomLocation]
                  .filter(Boolean)
                  .join(' · ');

                const rows = [
                  ['Lớp học', activeSlot.className],
                  ['Môn học', activeSlot.subject],
                  ['Khối', activeSlot.grade],
                  ['Cơ sở', st?.name || activeSlot.siteName],
                  ['Địa chỉ cơ sở', st?.address],
                  ['Điện thoại cơ sở', st?.phone],
                  ['Giáo viên', activeSlot.teacher],
                  ['Ca đang chọn', `${activeSlot.weekday} · ${activeSlot.time}`],
                  ['Lịch học cả tuần', schedSummary],
                  ['Hình thức', activeSlot.modeLabel || 'Trực tiếp'],
                  ['Phòng / địa điểm', roomDisplay],
                  ['Sức chứa phòng', activeSlot.roomCapacity],
                  ['Ngày bắt đầu', activeSlot.startDate],
                  ['Ngày kết thúc', activeSlot.endDate],
                  ['Sĩ số tối đa', activeSlot.capacity],
                  ['Liên hệ', activeSlot.contact || st?.phone],
                ].filter(r => r[1]);

                return (
                  <>
                    <h3>
                      {activeSlot.subject ? `${activeSlot.subject} · ` : ''}
                      {activeSlot.className}
                    </h3>
                    <dl className="txt-detail-grid">
                      {rows.map(([label, val]) => (
                        <div key={label} style={{ display: 'contents' }}>
                          <dt>{label}</dt>
                          <dd>
                            {label === 'Giáo viên' && tProfile ? (
                              <button
                                type="button"
                                className="txt-teacher-profile-trigger"
                                onClick={() => setActiveTeacherProfile(tProfile)}
                                aria-label={`Xem hồ sơ giáo viên ${val}`}
                              >
                                {val} <span aria-hidden="true">↗</span>
                              </button>
                            ) : (
                              val
                            )}
                          </dd>
                        </div>
                      ))}
                      {st?.mapUrl && (
                        <>
                          <dt>Google Maps</dt>
                          <dd>
                            <a
                              className="txt-class-map-link"
                              href={st.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Xem đường đi đến cơ sở ↗
                            </a>
                          </dd>
                        </>
                      )}
                    </dl>
                    {activeSlot.notes && (
                      <div className="txt-notes">
                        <strong>Ghi chú</strong>
                        <br />
                        {activeSlot.notes}
                      </div>
                    )}

                    {isAdmin && (
                      <div className="txt-modal-admin-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditSlotModal(activeSlot)}
                        >
                          ✏️ Sửa ca học
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteSlot(activeSlot)}
                        >
                          🗑️ Xóa buổi này
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDeleteAllClassSlots(activeSlot.className)}
                        >
                          🗑️ Xóa cả lớp
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Teacher Profile Slide-out Panel */}
            <aside
              className="txt-teacher-panel"
              aria-label="Hồ sơ giáo viên"
              aria-hidden={!activeTeacherProfile}
            >
              <button
                type="button"
                className="txt-teacher-panel-close"
                onClick={() => setActiveTeacherProfile(null)}
                aria-label="Quay lại chi tiết lớp"
              >
                ← <span>Quay về lớp</span>
              </button>
              {activeTeacherProfile && (
                <div className="txt-teacher-panel-content">
                  <div className="txt-teacher-profile-hero">
                    {activeTeacherProfile.photo ? (
                      <img
                        className="txt-teacher-profile-photo"
                        src={activeTeacherProfile.photo}
                        alt={`Ảnh ${activeTeacherProfile.name}`}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="txt-teacher-profile-placeholder"
                        aria-hidden="true"
                      >
                        {(activeTeacherProfile.name || 'G').trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <h3>{activeTeacherProfile.name}</h3>
                    {activeTeacherProfile.role && <p>{activeTeacherProfile.role}</p>}
                  </div>
                  <dl className="txt-teacher-profile-facts">
                    {activeTeacherProfile.role && (
                      <>
                        <dt>Chức danh</dt>
                        <dd>{activeTeacherProfile.role}</dd>
                      </>
                    )}
                    {activeTeacherProfile.subjects && (
                      <>
                        <dt>Môn giảng dạy</dt>
                        <dd>{activeTeacherProfile.subjects}</dd>
                      </>
                    )}
                    {activeTeacherProfile.qualification && (
                      <>
                        <dt>Trình độ chuyên môn</dt>
                        <dd>{activeTeacherProfile.qualification}</dd>
                      </>
                    )}
                    {activeTeacherProfile.experience && (
                      <>
                        <dt>Kinh nghiệm</dt>
                        <dd>{activeTeacherProfile.experience}</dd>
                      </>
                    )}
                  </dl>
                  {activeTeacherProfile.bio && (
                    <div className="txt-teacher-bio">
                      <strong>Giới thiệu</strong>
                      <p>{activeTeacherProfile.bio}</p>
                    </div>
                  )}
                  {activeTeacherProfile.phone && (
                    <a
                      className="txt-teacher-contact"
                      href={`tel:${activeTeacherProfile.phone.replace(/[^+0-9]/g, '')}`}
                    >
                      ☎ {activeTeacherProfile.phone}
                    </a>
                  )}
                  {activeTeacherProfile.email && (
                    <a
                      className="txt-teacher-contact"
                      href={`mailto:${activeTeacherProfile.email}`}
                    >
                      ✉ {activeTeacherProfile.email}
                    </a>
                  )}
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>

      {/* ═══ ADMIN MODAL: ADD / EDIT SCHEDULE SLOT ═══ */}
      <Modal
        open={showSlotModal}
        onClose={() => setShowSlotModal(false)}
        title={editingSlotId ? '✏️ Chỉnh sửa lịch học' : '+ Thêm lịch học mới'}
        size="modal-lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowSlotModal(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={handleSaveSlot}>
              💾 Lưu lịch học
            </button>
          </>
        }
      >
        {systemClasses.length > 0 && !editingSlotId && (
          <div className="form-group">
            <label className="form-label">Chọn nhanh từ lớp học trong hệ thống (tùy chọn)</label>
            <select
              className="form-select"
              value=""
              onChange={e => {
                const cls = systemClasses.find(c => c.ClassID === e.target.value);
                if (cls) {
                  setSlotForm(f => ({
                    ...f,
                    className: cls.ClassName || f.className,
                    subject: cls.Subject || f.subject,
                    grade: cls.Grade
                      ? cls.Grade.toString().startsWith('Khối')
                        ? cls.Grade
                        : `Khối ${cls.Grade}`
                      : f.grade,
                  }));
                }
              }}
            >
              <option value="">-- Chọn lớp để tự động điền --</option>
              {systemClasses.map(c => (
                <option key={c.ClassID} value={c.ClassID}>
                  {c.ClassName} ({c.Subject} - Khối {c.Grade})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Tên lớp *</label>
            <input
              className="form-control"
              placeholder="VD: 8A_CS2, 11A 26.27"
              value={slotForm.className}
              onChange={e => setSlotForm(f => ({ ...f, className: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Môn học</label>
            <input
              className="form-control"
              placeholder="VD: Toán, Lý, Hóa, Anh..."
              value={slotForm.subject}
              onChange={e => setSlotForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Khối</label>
            <input
              className="form-control"
              placeholder="VD: Khối 8"
              value={slotForm.grade}
              onChange={e => setSlotForm(f => ({ ...f, grade: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Cơ sở</label>
            <select
              className="form-select"
              value={slotForm.siteId}
              onChange={e => setSlotForm(f => ({ ...f, siteId: e.target.value }))}
            >
              {sites.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Giáo viên</label>
            <input
              className="form-control"
              list="teacher-profile-list"
              placeholder="Nhập hoặc chọn giáo viên"
              value={slotForm.teacher}
              onChange={e => setSlotForm(f => ({ ...f, teacher: e.target.value }))}
            />
            <datalist id="teacher-profile-list">
              {Object.keys(teacherProfiles).map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Hình thức học</label>
            <select
              className="form-select"
              value={slotForm.modeKey}
              onChange={e => setSlotForm(f => ({ ...f, modeKey: e.target.value }))}
            >
              {MODE_OPTIONS.map(m => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            Thứ trong tuần * {editingSlotId ? '(Có thể tích thêm ngày để nhân bản ca học)' : '(Chọn 1 hoặc nhiều ngày)'}
          </label>
          <div className="txt-days-checkboxes">
            {WEEKDAYS.map(w => {
              const checked = slotForm.days.includes(w.day);
              return (
                <label
                  key={w.day}
                  className={`txt-day-check ${checked ? 'checked' : ''}`}
                  onClick={() => {
                    setSlotForm(f => {
                      const exists = f.days.includes(w.day);
                      const nextDays = exists
                        ? f.days.filter(d => d !== w.day)
                        : [...f.days, w.day].sort((a, b) => a - b);
                      return { ...f, days: nextDays };
                    });
                  }}
                >
                  <input type="checkbox" checked={checked} readOnly style={{ display: 'none' }} />
                  {w.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Giờ bắt đầu *</label>
            <input
              type="time"
              className="form-control"
              value={slotForm.startTime}
              onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Giờ kết thúc *</label>
            <input
              type="time"
              className="form-control"
              value={slotForm.endTime}
              onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phòng học</label>
            <input
              className="form-control"
              placeholder="VD: Phòng 1"
              value={slotForm.room}
              onChange={e => setSlotForm(f => ({ ...f, room: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Màu sắc thẻ lớp</label>
          <div className="txt-color-picker">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.key}
                type="button"
                className={`txt-color-swatch ${slotForm.color === c.key ? 'active' : ''}`}
                style={{ background: c.bg, color: c.color, borderColor: c.color }}
                title={c.label}
                onClick={() => setSlotForm(f => ({ ...f, color: c.key }))}
              >
                {slotForm.color === c.key ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Sĩ số tối đa</label>
            <input
              className="form-control"
              placeholder="VD: 20"
              value={slotForm.capacity}
              onChange={e => setSlotForm(f => ({ ...f, capacity: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">SĐT Liên hệ</label>
            <input
              className="form-control"
              placeholder="VD: 0971120360"
              value={slotForm.contact}
              onChange={e => setSlotForm(f => ({ ...f, contact: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Ngày khai giảng / bắt đầu</label>
            <input
              className="form-control"
              placeholder="VD: 01/06/2026"
              value={slotForm.startDate}
              onChange={e => setSlotForm(f => ({ ...f, startDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Ghi chú</label>
          <textarea
            className="form-control"
            rows={2}
            placeholder="Ghi chú thêm về lớp học..."
            value={slotForm.notes}
            onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ═══ ADMIN MODAL: MANAGE SITES ═══ */}
      <Modal
        open={showSitesModal}
        onClose={() => setShowSitesModal(false)}
        title="🏢 Quản lý danh sách Cơ sở Nắng Mai"
        size="modal-lg"
      >
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Tên cơ sở</th>
                <th>Địa chỉ</th>
                <th>Điện thoại</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(st => (
                <tr key={st.id}>
                  <td>
                    <strong>{st.name}</strong>
                  </td>
                  <td>{st.address}</td>
                  <td>{st.phone}</td>
                  <td className="actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditingSiteId(st.id);
                        setSiteForm(st);
                      }}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteSite(st.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 style={{ marginBottom: 10, color: 'var(--primary)' }}>
          {editingSiteId ? '✏️ Cập nhật cơ sở' : '+ Thêm cơ sở mới'}
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên cơ sở *</label>
            <input
              className="form-control"
              placeholder="VD: Cơ sở 1"
              value={siteForm.name}
              onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Số điện thoại</label>
            <input
              className="form-control"
              placeholder="VD: 0971120360"
              value={siteForm.phone}
              onChange={e => setSiteForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Địa chỉ</label>
            <input
              className="form-control"
              placeholder="Địa chỉ cơ sở..."
              value={siteForm.address}
              onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Link Google Maps</label>
            <input
              className="form-control"
              placeholder="https://maps.app.goo.gl/..."
              value={siteForm.mapUrl}
              onChange={e => setSiteForm(f => ({ ...f, mapUrl: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {editingSiteId && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditingSiteId(null);
                setSiteForm(EMPTY_SITE_FORM);
              }}
            >
              Hủy sửa
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSaveSite}>
            {editingSiteId ? 'Cập nhật cơ sở' : '+ Lưu cơ sở'}
          </button>
        </div>
      </Modal>

      {/* ═══ ADMIN MODAL: MANAGE TEACHER PROFILES ═══ */}
      <Modal
        open={showTeachersModal}
        onClose={() => setShowTeachersModal(false)}
        title="👨‍🏫 Quản lý Hồ sơ Giáo viên Nắng Mai"
        size="modal-lg"
      >
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Giáo viên</th>
                <th>Chức danh</th>
                <th>Kinh nghiệm</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.values(teacherProfiles).map(tp => (
                <tr key={tp.name}>
                  <td>
                    <strong>{tp.name}</strong>
                  </td>
                  <td>{tp.role}</td>
                  <td>{tp.experience}</td>
                  <td className="actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setTeacherForm(tp)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (!confirm(`Xóa hồ sơ của ${tp.name}?`)) return;
                        setTeacherProfiles(prev => {
                          const copy = { ...prev };
                          delete copy[tp.name];
                          return copy;
                        });
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 style={{ marginBottom: 10, color: 'var(--primary)' }}>
          Thêm / Cập nhật Hồ sơ Giáo viên
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Họ tên giáo viên *</label>
            <input
              className="form-control"
              placeholder="VD: Thầy Võ Mạnh Cường"
              value={teacherForm.name}
              onChange={e => setTeacherForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Chức danh</label>
            <input
              className="form-control"
              placeholder="VD: Giáo viên Toán"
              value={teacherForm.role}
              onChange={e => setTeacherForm(f => ({ ...f, role: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Môn giảng dạy</label>
            <input
              className="form-control"
              placeholder="VD: Toán THCS - THPT"
              value={teacherForm.subjects}
              onChange={e => setTeacherForm(f => ({ ...f, subjects: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Trình độ chuyên môn</label>
            <input
              className="form-control"
              placeholder="VD: Cử nhân Sư phạm Toán"
              value={teacherForm.qualification}
              onChange={e => setTeacherForm(f => ({ ...f, qualification: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Kinh nghiệm</label>
            <input
              className="form-control"
              placeholder="VD: Trên 15 năm"
              value={teacherForm.experience}
              onChange={e => setTeacherForm(f => ({ ...f, experience: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Link ảnh đại diện (URL)</label>
            <input
              className="form-control"
              placeholder="https://..."
              value={teacherForm.photo}
              onChange={e => setTeacherForm(f => ({ ...f, photo: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Số điện thoại</label>
            <input
              className="form-control"
              placeholder="0971120360"
              value={teacherForm.phone}
              onChange={e => setTeacherForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-control"
              placeholder="email@gmail.com"
              value={teacherForm.email}
              onChange={e => setTeacherForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Giới thiệu chi tiết</label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Tiểu sử / giới thiệu giáo viên..."
            value={teacherForm.bio}
            onChange={e => setTeacherForm(f => ({ ...f, bio: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={handleSaveTeacherProfile}>
            💾 Lưu hồ sơ giáo viên
          </button>
        </div>
      </Modal>
    </>
  );

  if (isPublicPage || location.pathname === '/lich-hoc') {
    return (
      <div className="txt-public-wrapper fade-up">
        <div className="txt-public-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.8rem' }}>☀️</span>
            <div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--primary-dark)' }}>
                Trung tâm Nắng Mai — Lịch học & Thời khóa biểu
              </strong>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Tra cứu lịch học các khối, cơ sở và thông tin giáo viên
              </div>
            </div>
          </div>
          <div>
            {user ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/schedule')}
              >
                ← Về trang Quản lý
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/login')}
              >
                🔐 Đăng nhập Quản lý
              </button>
            )}
          </div>
        </div>
        {timetableContent}
      </div>
    );
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">
          📅 <span>Lịch học</span>
        </h1>
        <p className="page-sub">
          Thời khóa biểu các lớp học tại Trung tâm Nắng Mai ({slots.length} ca học)
        </p>
      </div>
      {timetableContent}
    </div>
  );
}
