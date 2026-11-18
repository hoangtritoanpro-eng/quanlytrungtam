const ENV_GAS_URL = import.meta.env.VITE_GAS_URL;
const DB_KEY = 'nangmai_local_db_v2';

export const fmtCurrency = (n) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  if (!y || !m || !day) return String(d);
  return `${day}/${m}/${y}`;
};

export const today = () => new Date().toISOString().slice(0, 10);

function getInitialDb() {
  return {
    users: [
      {
        Email: 'toanhoang@gmail.com',
        Name: 'Hoàng Trí Toàn (Admin)',
        Role: 'ADMIN',
        Pin: '1234',
        FirstLoginFlexPin: true,
        Active: 'TRUE',
      },
    ],
    classes: [],
    students: [],
    enrollments: [],
    teacherClasses: [],
    attendance: [],
    scores: [],
    payments: [],
  };
}

/** Thứ trong tuần theo cách đánh số của trang Lịch học: Thứ 2 = 2 ... Chủ nhật = 8. */
export function scheduleWeekday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 8 : d + 1;
}

export const thisMonth = () => today().slice(0, 7);

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users)) {
        // Tự động dọn sạch các tài khoản mẫu cũ nếu còn tồn tại
        const mockEmails = ['admin@example.com', 'vomanhcuong1612@gmail.com', 'quynhnhi@gmail.com'];
        const hasMock = parsed.users.some(u => mockEmails.includes(u.Email?.toLowerCase()));
        if (hasMock) {
          parsed.users = parsed.users.filter(u => !mockEmails.includes(u.Email?.toLowerCase()));
          if (parsed.users.length === 0) {
            parsed.users = getInitialDb().users;
          }
          if (Array.isArray(parsed.teacherClasses)) {
            parsed.teacherClasses = parsed.teacherClasses.filter(tc => !mockEmails.includes(tc.TeacherEmail?.toLowerCase()));
          }
          saveDb(parsed);
        }
        return parsed;
      }
    }
  } catch (e) {}

  // Tự động dọn dẹp và nâng cấp từ bản lưu cũ v1 nếu có
  try {
    const oldRaw = localStorage.getItem('nangmai_local_db_v1');
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      if (old && Array.isArray(old.users)) {
        const mockEmails = ['admin@example.com', 'vomanhcuong1612@gmail.com', 'quynhnhi@gmail.com'];
        const cleanUsers = old.users.filter(u => !mockEmails.includes(u.Email?.toLowerCase()));
        const cleanClasses = Array.isArray(old.classes)
          ? old.classes.filter(c => !['CLS001', 'CLS002', 'CLS003', 'CLS004', 'CLS005', 'CLS006'].includes(c.ClassID))
          : [];
        const cleanStudents = Array.isArray(old.students)
          ? old.students.filter(s => !['STU001', 'STU002', 'STU003'].includes(s.StudentID))
          : [];

        const migrated = {
          users: cleanUsers.length > 0 ? cleanUsers : getInitialDb().users,
          classes: cleanClasses,
          students: cleanStudents,
          enrollments: Array.isArray(old.enrollments) ? old.enrollments.filter(e => cleanStudents.some(s => s.StudentID === e.StudentID)) : [],
          teacherClasses: Array.isArray(old.teacherClasses) ? old.teacherClasses.filter(tc => cleanUsers.some(u => u.Email === tc.TeacherEmail)) : [],
          attendance: Array.isArray(old.attendance) ? old.attendance.filter(a => cleanStudents.some(s => s.StudentID === a.StudentID)) : [],
          scores: Array.isArray(old.scores) ? old.scores.filter(sc => cleanStudents.some(s => s.StudentID === sc.StudentID)) : [],
        };
        saveDb(migrated);
        return migrated;
      }
    }
  } catch (e) {}

  const initial = getInitialDb();
  saveDb(initial);
  return initial;
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {}
}

function nextId(prefix, list, key) {
  let max = 0;
  list.forEach(item => {
    const num = parseInt(String(item[key] || '').replace(prefix, ''), 10);
    if (isFinite(num) && num > max) max = num;
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function localApiHandler(action, body = {}, email = '') {
  const db = loadDb();
  if (!Array.isArray(db.payments)) db.payments = [];

  switch (action) {
    case 'login': {
      const rawEmail = String(body.email || email || '').trim();
      const inputEmail = rawEmail.toLowerCase();
      const inputPin = String(body.pin || '').trim();
      if (!inputEmail) throw new Error('Vui lòng nhập email');
      let u = db.users.find(
        x => x.Email.toLowerCase() === inputEmail && x.Active === 'TRUE'
      );
      if (u) {
        if (u.Pin === inputPin || u.FirstLoginFlexPin) {
          if (u.FirstLoginFlexPin && inputPin) {
            u.Pin = inputPin;
            delete u.FirstLoginFlexPin;
            saveDb(db);
          }
          return { email: u.Email, name: u.Name, role: u.Role };
        }
        throw new Error('Email hoặc PIN không đúng');
      }
      // Nếu đăng nhập bằng email quản trị mới trên máy local, tự động tạo tài khoản ADMIN
      const newUser = {
        Email: rawEmail,
        Name: rawEmail.split('@')[0],
        Role: 'ADMIN',
        Pin: inputPin || '1234',
        Active: 'TRUE',
      };
      db.users.push(newUser);
      saveDb(db);
      return { email: newUser.Email, name: newUser.Name, role: newUser.Role };
    }

    case 'getDashboard': {
      // Cùng cách tính với getDashboard trong code.gs
      const td = today();
      const month = td.slice(0, 7);
      const attToday = db.attendance.filter(a => a.Date === td);
      const presentToday = attToday.filter(a => a.Present === 'TRUE').length;
      const clsMap = Object.fromEntries(db.classes.map(c => [c.ClassID, c]));
      const stuMap = Object.fromEntries(db.students.map(s => [s.StudentID, s]));
      const enrolls = db.enrollments.filter(e => e.Status === 'ACTIVE');
      let slots = [];
      try {
        slots = JSON.parse(localStorage.getItem('toanx_schedule_slots_v2') || '[]');
      } catch {}

      const weekday = scheduleWeekday(td);
      const todaySlots = (Array.isArray(slots) ? slots : [])
        .filter(s => Number(s.day) === weekday)
        .map(s => {
          const cid = s.classId && clsMap[s.classId] ? s.classId : '';
          const recs = cid ? attToday.filter(a => a.ClassID === cid) : [];
          return {
            id: s.id,
            time: s.time,
            startMin: Number(s.startMin) || 0,
            endMin: Number(s.endMin) || 0,
            className: s.className,
            classId: cid,
            teacher: s.teacher,
            room: s.room,
            siteName: s.siteName,
            marked: recs.length > 0,
            present: recs.filter(a => a.Present === 'TRUE').length,
            total: recs.length,
            enrolled: cid ? enrolls.filter(e => e.ClassID === cid).length : 0,
          };
        })
        .sort((a, b) => a.startMin - b.startMin);

      const byPair = {};
      db.attendance.forEach(a => {
        (byPair[`${a.ClassID}|${a.StudentID}`] ||= []).push(a);
      });
      const absenceAlerts = [];
      enrolls.forEach(e => {
        const list = (byPair[`${e.ClassID}|${e.StudentID}`] || [])
          .slice()
          .sort((a, b) => b.Date.localeCompare(a.Date));
        let streak = 0;
        while (streak < list.length && list[streak].Present === 'FALSE') streak++;
        if (streak >= 2) {
          const st = stuMap[e.StudentID] || {};
          absenceAlerts.push({
            studentId: e.StudentID,
            fullName: st.FullName || e.StudentID,
            parentName: st.ParentName || '',
            parentPhone: st.ParentPhone || '',
            classId: e.ClassID,
            className: clsMap[e.ClassID]?.ClassName || e.ClassID,
            streak,
            lastDate: list[0].Date,
          });
        }
      });
      absenceAlerts.sort((a, b) => b.streak - a.streak || b.lastDate.localeCompare(a.lastDate));

      const monthPays = db.payments.filter(p => p.Month === month);
      const paidKey = new Set(monthPays.map(p => `${p.ClassID}|${p.StudentID}`));
      let due = 0;
      let unpaidAmount = 0;
      let unpaidCount = 0;
      enrolls.forEach(e => {
        const fee = parseFloat(clsMap[e.ClassID]?.FeePerSession) || 0;
        const attended = (byPair[`${e.ClassID}|${e.StudentID}`] || []).filter(
          a => a.Present === 'TRUE' && a.Date.slice(0, 7) === month
        ).length;
        due += attended * fee;
        if (attended * fee > 0 && !paidKey.has(`${e.ClassID}|${e.StudentID}`)) {
          unpaidAmount += attended * fee;
          unpaidCount++;
        }
      });

      return {
        totalStudents: db.students.filter(s => s.Status === 'ACTIVE').length,
        totalClasses: db.classes.filter(c => c.Status === 'ACTIVE').length,
        totalTeachers: db.users.filter(u => u.Role === 'TEACHER' && u.Active === 'TRUE').length,
        totalTAs: db.users.filter(u => u.Role === 'TA' && u.Active === 'TRUE').length,
        presentToday,
        totalAttToday: attToday.length,
        today: td,
        month,
        todaySlots,
        absenceAlerts: absenceAlerts.slice(0, 30),
        tuitionMonth: {
          due,
          paid: monthPays.reduce((s, p) => s + (parseFloat(p.Amount) || 0), 0),
          unpaidAmount,
          unpaidCount,
        },
      };
    }

    case 'markPaid': {
      const month = String(body.month || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month) || !body.classId || !body.studentId) {
        throw new Error('Thiếu tháng, lớp hoặc học sinh');
      }
      const amount = Number(body.amount);
      if (!isFinite(amount) || amount < 0) throw new Error('Số tiền không hợp lệ');
      const rec = {
        Month: month,
        ClassID: body.classId,
        StudentID: body.studentId,
        Amount: String(amount),
        PaidDate: body.paidDate || today(),
        Method: body.method || 'Tiền mặt',
        Note: body.note || '',
        By: email,
      };
      db.payments = db.payments.filter(
        p => !(p.Month === month && p.ClassID === body.classId && p.StudentID === body.studentId)
      );
      db.payments.push(rec);
      saveDb(db);
      return rec;
    }

    case 'unmarkPaid': {
      const month = String(body.month || '').slice(0, 7);
      const before = db.payments.length;
      db.payments = db.payments.filter(
        p => !(p.Month === month && p.ClassID === body.classId && p.StudentID === body.studentId)
      );
      if (db.payments.length === before) throw new Error('Không tìm thấy phiếu thu');
      saveDb(db);
      return 'removed';
    }

    case 'getSystemInfo': {
      return { spreadsheetUrl: '', spreadsheetName: '' };
    }

    case 'getClasses': {
      const u = db.users.find(x => x.Email.toLowerCase() === String(email).toLowerCase());
      if (u && (u.Role === 'TEACHER' || u.Role === 'TA')) {
        const assigned = db.teacherClasses
          .filter(tc => tc.TeacherEmail.toLowerCase() === u.Email.toLowerCase())
          .map(tc => tc.ClassID);
        return db.classes.filter(c => assigned.includes(c.ClassID));
      }
      return db.classes;
    }

    case 'addClass': {
      const id = nextId('CLS', db.classes, 'ClassID');
      db.classes.push({
        ClassID: id,
        ClassName: body.className || '',
        Subject: body.subject || '',
        Grade: body.grade || '',
        FeePerSession: String(body.feePerSession || 0),
        StartDate: body.startDate || today(),
        Status: body.status || 'ACTIVE',
      });
      saveDb(db);
      return { classId: id };
    }

    case 'editClass': {
      const cls = db.classes.find(c => c.ClassID === body.classId);
      if (!cls) throw new Error('Không tìm thấy lớp ' + body.classId);
      if (body.className !== undefined) cls.ClassName = body.className;
      if (body.subject !== undefined) cls.Subject = body.subject;
      if (body.grade !== undefined) cls.Grade = body.grade;
      if (body.feePerSession !== undefined) cls.FeePerSession = String(body.feePerSession);
      if (body.startDate !== undefined) cls.StartDate = body.startDate;
      if (body.status !== undefined) cls.Status = body.status;
      saveDb(db);
      return 'updated';
    }

    case 'deleteClass': {
      db.classes = db.classes.filter(c => c.ClassID !== body.classId);
      db.enrollments = db.enrollments.filter(e => e.ClassID !== body.classId);
      db.teacherClasses = db.teacherClasses.filter(tc => tc.ClassID !== body.classId);
      saveDb(db);
      return 'deleted';
    }

    case 'getStudents': {
      return db.students;
    }

    case 'addStudent': {
      const id = nextId('STU', db.students, 'StudentID');
      db.students.push({
        StudentID: id,
        FullName: body.fullName || '',
        SchoolClass: body.schoolClass || '',
        ParentName: body.parentName || '',
        ParentPhone: body.parentPhone || '',
        ParentEmail: body.parentEmail || '',
        Note: body.note || '',
        Status: 'ACTIVE',
      });
      saveDb(db);
      return { studentId: id };
    }

    case 'editStudent': {
      const stu = db.students.find(s => s.StudentID === body.studentId);
      if (!stu) throw new Error('Không tìm thấy học sinh ' + body.studentId);
      if (body.fullName !== undefined) stu.FullName = body.fullName;
      if (body.schoolClass !== undefined) stu.SchoolClass = body.schoolClass;
      if (body.parentName !== undefined) stu.ParentName = body.parentName;
      if (body.parentPhone !== undefined) stu.ParentPhone = body.parentPhone;
      if (body.parentEmail !== undefined) stu.ParentEmail = body.parentEmail;
      if (body.note !== undefined) stu.Note = body.note;
      if (body.status !== undefined) stu.Status = body.status;
      saveDb(db);
      return 'updated';
    }

    case 'deleteStudent': {
      db.students = db.students.filter(s => s.StudentID !== body.studentId);
      db.enrollments = db.enrollments.filter(e => e.StudentID !== body.studentId);
      saveDb(db);
      return 'deleted';
    }

    case 'getClassRoster': {
      const enrolls = db.enrollments.filter(
        e => e.ClassID === body.classId && e.Status === 'ACTIVE'
      );
      const stuMap = {};
      db.students.forEach(s => {
        stuMap[s.StudentID] = s;
      });
      return enrolls.map(
        e => stuMap[e.StudentID] || { StudentID: e.StudentID, FullName: '??' }
      );
    }

    case 'enrollStudent': {
      const existing = db.enrollments.find(
        e => e.StudentID === body.studentId && e.ClassID === body.classId
      );
      if (existing) {
        existing.Status = 'ACTIVE';
      } else {
        db.enrollments.push({
          StudentID: body.studentId,
          ClassID: body.classId,
          EnrollDate: today(),
          Status: 'ACTIVE',
        });
      }
      saveDb(db);
      return 'enrolled';
    }

    case 'removeEnrollment': {
      const existing = db.enrollments.find(
        e => e.StudentID === body.studentId && e.ClassID === body.classId
      );
      if (existing) existing.Status = 'REMOVED';
      saveDb(db);
      return 'removed';
    }

    case 'getTeachers': {
      return db.users.filter(u => u.Role === 'TEACHER' || u.Role === 'TA');
    }

    case 'getClassTeachers': {
      const tc = db.teacherClasses.filter(x => x.ClassID === body.classId);
      const uMap = {};
      db.users.forEach(u => {
        uMap[u.Email] = u;
      });
      return tc.map(
        x => uMap[x.TeacherEmail] || { Email: x.TeacherEmail, Name: '??', Role: 'TEACHER' }
      );
    }

    case 'assignTeacher': {
      const exists = db.teacherClasses.find(
        r => r.TeacherEmail === body.teacherEmail && r.ClassID === body.classId
      );
      if (exists) throw new Error('Đã phân công rồi');
      db.teacherClasses.push({ TeacherEmail: body.teacherEmail, ClassID: body.classId });
      saveDb(db);
      return 'assigned';
    }

    case 'removeTeacherFromClass': {
      db.teacherClasses = db.teacherClasses.filter(
        r => !(r.TeacherEmail === body.teacherEmail && r.ClassID === body.classId)
      );
      saveDb(db);
      return 'removed';
    }

    case 'markAttendance': {
      const d = body.date || today();
      (body.records || []).forEach(rec => {
        const existing = db.attendance.find(
          a => a.Date === d && a.ClassID === body.classId && a.StudentID === rec.studentId
        );
        if (existing) {
          existing.Present = rec.present ? 'TRUE' : 'FALSE';
          existing.Note = rec.note || '';
          existing.By = email;
        } else {
          db.attendance.push({
            Date: d,
            ClassID: body.classId,
            StudentID: rec.studentId,
            Present: rec.present ? 'TRUE' : 'FALSE',
            Note: rec.note || '',
            By: email,
          });
        }
      });
      saveDb(db);
      return 'saved';
    }

    case 'getAttendance': {
      return db.attendance.filter(r => {
        let match = r.ClassID === body.classId;
        if (body.date) match = match && r.Date === body.date;
        if (body.studentId) match = match && r.StudentID === body.studentId;
        return match;
      });
    }

    case 'addScores': {
      const d = body.date || today();
      (body.records || []).forEach(rec => {
        const existing = db.scores.find(
          s =>
            s.ClassID === body.classId &&
            s.ExamName === body.examName &&
            s.StudentID === rec.studentId
        );
        if (existing) {
          existing.Date = d;
          existing.MaxScore = String(body.maxScore || 10);
          existing.Score = String(rec.score);
          existing.Note = rec.note || '';
          existing.By = email;
        } else {
          db.scores.push({
            Date: d,
            ClassID: body.classId,
            ExamName: body.examName,
            MaxScore: String(body.maxScore || 10),
            StudentID: rec.studentId,
            Score: String(rec.score),
            Note: rec.note || '',
            By: email,
          });
        }
      });
      saveDb(db);
      return 'saved';
    }

    case 'getScores': {
      return db.scores.filter(r => {
        let match = r.ClassID === body.classId;
        if (body.examName) match = match && r.ExamName === body.examName;
        if (body.studentId) match = match && r.StudentID === body.studentId;
        return match;
      });
    }

    case 'getUsers': {
      return db.users;
    }

    case 'addUser': {
      if (db.users.find(u => u.Email.toLowerCase() === String(body.email).toLowerCase())) {
        throw new Error('Email đã tồn tại');
      }
      db.users.push({
        Email: body.email,
        Name: body.name,
        Role: body.role || 'TEACHER',
        Pin: String(body.pin || '1234'),
        Active: body.active || 'TRUE',
      });
      saveDb(db);
      return 'added';
    }

    case 'editUser': {
      const u = db.users.find(x => x.Email === body.targetEmail);
      if (!u) throw new Error('Không tìm thấy user ' + body.targetEmail);
      if (body.name !== undefined) u.Name = body.name;
      if (body.role !== undefined) u.Role = body.role;
      if (body.pin !== undefined) u.Pin = String(body.pin);
      if (body.active !== undefined) u.Active = body.active;
      saveDb(db);
      return 'updated';
    }

    case 'deleteUser': {
      const targetEmail = String(body.targetEmail || body.email || '').trim().toLowerCase();
      if (!targetEmail) throw new Error('Vui lòng cung cấp email tài khoản cần xóa');
      if (email && targetEmail === email.toLowerCase()) {
        throw new Error('Bạn không thể tự xóa tài khoản đang đăng nhập');
      }
      const initialCount = db.users.length;
      db.users = db.users.filter(x => x.Email.toLowerCase() !== targetEmail);
      if (db.users.length === initialCount) {
        throw new Error('Không tìm thấy tài khoản ' + (body.targetEmail || body.email));
      }
      saveDb(db);
      return 'deleted';
    }

    case 'resetDatabase': {
      const clean = getInitialDb();
      saveDb(clean);
      return clean;
    }

    case 'exportDatabase': {
      return {
        db,
        scheduleSlots: JSON.parse(localStorage.getItem('toanx_schedule_slots_v2') || localStorage.getItem('toanx_schedule_slots_v1') || '[]'),
        scheduleSites: JSON.parse(localStorage.getItem('toanx_schedule_sites_v2') || localStorage.getItem('toanx_schedule_sites_v1') || '[]'),
        scheduleTeachers: JSON.parse(localStorage.getItem('toanx_schedule_teachers_v2') || localStorage.getItem('toanx_schedule_teachers_v1') || '{}'),
      };
    }

    case 'importDatabase': {
      if (body.data && typeof body.data === 'object') {
        const { db: importedDb, scheduleSlots, scheduleSites, scheduleTeachers } = body.data;
        if (importedDb && typeof importedDb === 'object') {
          saveDb(importedDb);
        }
        if (Array.isArray(scheduleSlots)) {
          localStorage.setItem('toanx_schedule_slots_v2', JSON.stringify(scheduleSlots));
        }
        if (Array.isArray(scheduleSites)) {
          localStorage.setItem('toanx_schedule_sites_v2', JSON.stringify(scheduleSites));
        }
        if (scheduleTeachers && typeof scheduleTeachers === 'object') {
          localStorage.setItem('toanx_schedule_teachers_v2', JSON.stringify(scheduleTeachers));
        }
        return 'imported';
      }
      throw new Error('Dữ liệu nhập vào không hợp lệ');
    }

    case 'getSchedule': {
      const read = (key, fallback) => {
        try {
          const raw = localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      };
      const slots = read('toanx_schedule_slots_v2', null);
      return {
        initialized: slots !== null,
        slots: Array.isArray(slots) ? slots : [],
        sites: read('toanx_schedule_sites_v2', []),
        teacherProfiles: read('toanx_schedule_teachers_v2', {}),
      };
    }

    case 'saveSchedule': {
      // Chế độ chạy local: trang Lịch học đã tự ghi localStorage, không cần làm gì thêm
      return { saved: [] };
    }

    case 'getTuition': {
      const cls = db.classes.find(c => c.ClassID === body.classId);
      if (!cls) throw new Error('Không tìm thấy lớp');
      const fee = parseFloat(cls.FeePerSession) || 0;
      const enrolls = db.enrollments.filter(
        e => e.ClassID === body.classId && e.Status === 'ACTIVE'
      );
      const stuMap = {};
      db.students.forEach(s => {
        stuMap[s.StudentID] = s;
      });
      const month = /^\d{4}-\d{2}/.test(String(body.month || '')) ? String(body.month).slice(0, 7) : '';
      const att = db.attendance.filter(
        a => a.ClassID === body.classId && (!month || a.Date.slice(0, 7) === month)
      );
      const dates = {};
      att.forEach(a => {
        dates[a.Date] = true;
      });
      const sessionsTotal = Object.keys(dates).length;
      const payMap = {};
      if (month) {
        db.payments
          .filter(p => p.ClassID === body.classId && p.Month === month)
          .forEach(p => {
            payMap[p.StudentID] = p;
          });
      }

      const result = enrolls.map(enr => {
        const sid = enr.StudentID;
        const stuAtt = att.filter(a => a.StudentID === sid);
        const attended = stuAtt.filter(a => a.Present === 'TRUE').length;
        const absent = stuAtt.filter(a => a.Present === 'FALSE').length;
        return {
          studentId: sid,
          fullName: stuMap[sid] ? stuMap[sid].FullName : '??',
          sessionsTotal,
          sessionsAttended: attended,
          sessionsAbsent: absent,
          feePerSession: fee,
          tuition: attended * fee,
          parentName: stuMap[sid]?.ParentName || '',
          parentPhone: stuMap[sid]?.ParentPhone || '',
          payment: payMap[sid] || null,
        };
      });
      return { classInfo: cls, month, students: result };
    }

    case 'getStudentReport': {
      const student = db.students.find(s => s.StudentID === body.studentId);
      if (!student) throw new Error('Không tìm thấy học sinh');
      const enrolls = db.enrollments.filter(
        e => e.StudentID === body.studentId && e.Status === 'ACTIVE'
      );
      const clsMap = {};
      db.classes.forEach(c => {
        clsMap[c.ClassID] = c;
      });

      const classData = enrolls.map(enr => {
        const cid = enr.ClassID;
        const cls = clsMap[cid] || {};
        const fee = parseFloat(cls.FeePerSession) || 0;
        const stuAtt = db.attendance.filter(
          a => a.ClassID === cid && a.StudentID === body.studentId
        );
        const dates = {};
        db.attendance
          .filter(a => a.ClassID === cid)
          .forEach(a => {
            dates[a.Date] = true;
          });
        const sessionsTotal = Object.keys(dates).length;
        const sessionsAttended = stuAtt.filter(a => a.Present === 'TRUE').length;
        const scores = db.scores.filter(
          s => s.ClassID === cid && s.StudentID === body.studentId
        );
        return {
          classId: cid,
          className: cls.ClassName || cid,
          subject: cls.Subject || '',
          grade: cls.Grade || '',
          feePerSession: fee,
          sessionsTotal,
          sessionsAttended,
          tuition: sessionsAttended * fee,
          scores,
          attendance: stuAtt.slice().sort((a, b) => b.Date.localeCompare(a.Date)),
        };
      });
      return { student, classes: classData };
    }

    default:
      throw new Error('Action không hợp lệ: ' + action);
  }
}

function getBaseUrl() {
  let customGasUrl = '';
  try {
    if (typeof window !== 'undefined') {
      customGasUrl = localStorage.getItem('nangmai_gas_url') || '';
    }
  } catch {}
  return ENV_GAS_URL || customGasUrl;
}

/** true khi dữ liệu được lưu trên Google Sheet (đã cấu hình Apps Script), false khi chạy localStorage. */
export const hasRemoteBackend = () => Boolean(getBaseUrl());

// ── Bộ nhớ đệm phía trình duyệt ──────────────────────────────────
// Mỗi lần gọi Apps Script mất 1–3 giây. Các danh sách ít thay đổi được giữ lại một lúc để
// chuyển trang không phải chờ; mọi thao tác ghi (thêm/sửa/xóa/điểm danh...) xóa sạch bộ đệm.
const CACHEABLE = new Set(['getClasses', 'getStudents', 'getTeachers', 'getUsers', 'getClassRoster', 'getClassTeachers']);
const READ_ONLY = new Set([
  ...CACHEABLE,
  'getSchedule', 'getDashboard', 'getTuition', 'getAttendance', 'getScores', 'getStudentReport', 'getSystemInfo', 'login',
]);
const CACHE_TTL_MS = 60 * 1000;
const responseCache = new Map(); // key -> { at, promise }

export function clearApiCache() {
  responseCache.clear();
}

export async function api(action, data = {}, userEmail = '') {
  const baseUrl = getBaseUrl();

  const payload = { action, authEmail: userEmail, email: userEmail, ...data };

  if (!baseUrl) {
    // Chạy bằng LocalStorage DB khi chưa cấu hình VITE_GAS_URL
    return localApiHandler(action, payload, userEmail);
  }

  if (!READ_ONLY.has(action)) clearApiCache();
  if (!CACHEABLE.has(action)) return remoteCall(baseUrl, action, payload, userEmail);

  const key = `${userEmail}|${action}|${JSON.stringify(data)}`;
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  // Lưu cả promise đang chạy để các trang gọi cùng lúc dùng chung một yêu cầu
  const promise = remoteCall(baseUrl, action, payload, userEmail);
  responseCache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (responseCache.get(key)?.promise === promise) responseCache.delete(key);
  });
  return promise;
}

async function remoteCall(baseUrl, action, payload, userEmail) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.ok) {
    const message = json.error || 'Lỗi không xác định';
    // Phiên đăng nhập không còn hợp lệ (tài khoản bị xóa/khóa, hoặc phiên cũ từ chế độ
    // localStorage): báo cho AuthContext đăng xuất. Bỏ qua khi đang đăng nhập/trang công khai.
    if (action !== 'login' && userEmail && AUTH_ERRORS.includes(message)) {
      try {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      } catch {}
      throw new Error('Phiên đăng nhập không còn hợp lệ, vui lòng đăng nhập lại');
    }
    throw new Error(message);
  }
  return json.data;
}

// Các lỗi do code.gs (requireAuth) trả về khi email đăng nhập không còn hợp lệ
const AUTH_ERRORS = ['Chưa đăng nhập', 'Tài khoản không tồn tại hoặc đã bị khóa'];
export const AUTH_EXPIRED_EVENT = 'nangmai:auth-expired';
