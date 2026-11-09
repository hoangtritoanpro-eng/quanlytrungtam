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
  };
}

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
      const td = today();
      const attToday = db.attendance.filter(a => a.Date === td);
      const presentToday = attToday.filter(a => a.Present === 'TRUE').length;
      return {
        totalStudents: db.students.filter(s => s.Status === 'ACTIVE').length,
        totalClasses: db.classes.filter(c => c.Status === 'ACTIVE').length,
        totalTeachers: db.users.filter(u => u.Role === 'TEACHER' && u.Active === 'TRUE').length,
        totalTAs: db.users.filter(u => u.Role === 'TA' && u.Active === 'TRUE').length,
        presentToday,
        totalAttToday: attToday.length,
      };
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
      const att = db.attendance.filter(a => a.ClassID === body.classId);
      const dates = {};
      att.forEach(a => {
        dates[a.Date] = true;
      });
      const sessionsTotal = Object.keys(dates).length;

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
        };
      });
      return { classInfo: cls, students: result };
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

export async function api(action, data = {}, userEmail = '') {
  const customGasUrl =
    typeof window !== 'undefined' ? localStorage.getItem('nangmai_gas_url') : '';
  const baseUrl = ENV_GAS_URL || customGasUrl;

  const payload = { action, authEmail: userEmail, email: userEmail, ...data };

  if (!baseUrl) {
    // Chạy bằng LocalStorage DB khi chưa cấu hình VITE_GAS_URL
    return localApiHandler(action, payload, userEmail);
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error || 'Lỗi không xác định');
  return json.data;
}
