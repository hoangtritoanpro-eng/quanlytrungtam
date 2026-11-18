// ============================================================
//  QUẢN LÝ TRUNG TÂM – code.gs
//  Google Apps Script Backend
//  Deploy: "Execute as: Me" | "Who has access: Anyone"
// ============================================================

// ── Tên các sheet ──────────────────────────────────────────
var SHEET = {
  USERS:        'Users',
  CLASSES:      'Classes',
  STUDENTS:     'Students',
  ENROLLMENTS:  'Enrollments',
  ATTENDANCE:   'Attendance',
  SCORES:       'Scores',
  TCH_CLASSES:  'TeacherClasses',
  SCH_SLOTS:    'ScheduleSlots',
  SCH_SITES:    'ScheduleSites',
  SCH_TEACHERS: 'ScheduleTeachers',
};

// ── Cột của từng sheet ─────────────────────────────────────
// Mọi thao tác đọc/ghi đều tra theo TÊN cột ở dòng tiêu đề, nên thứ tự cột
// trên sheet thật có thể khác ở đây. Cột nào còn thiếu sẽ tự được thêm vào cuối.
var COL = {
  USERS:        ['Email','Name','Role','Pin','Active'],
  CLASSES:      ['ClassID','ClassName','Subject','Grade','FeePerSession','StartDate','Status'],
  STUDENTS:     ['StudentID','FullName','SchoolClass','ParentName','ParentPhone','ParentEmail','Note','Status'],
  ENROLLMENTS:  ['StudentID','ClassID','EnrollDate','Status'],
  ATTENDANCE:   ['Date','ClassID','StudentID','Present','Note','By'],
  SCORES:       ['Date','ClassID','ExamName','MaxScore','StudentID','Score','Note','By'],
  TCH_CLASSES:  ['TeacherEmail','ClassID'],
  // Thời khóa biểu (trang Lịch học). Cột lạ do frontend gửi thêm sẽ tự được bổ sung.
  SCH_SLOTS:    ['id','day','weekday','startMin','endMin','time','session','className','subject','grade','teacher',
                 'siteId','siteName','modeKey','modeLabel','room','roomLocation','roomCapacity','capacity',
                 'startDate','endDate','contact','color','notes'],
  SCH_SITES:    ['id','name','address','phone','mapUrl','note'],
  SCH_TEACHERS: ['name','role','subjects','qualification','experience','photo','phone','email','bio'],
};

// Đánh dấu thời khóa biểu đã từng được lưu lên Sheet (để phân biệt "chưa có gì" với "đã xóa hết")
var SCHEDULE_INIT_PROP = 'SCHEDULE_INITIALIZED';

var ROLES = ['ADMIN', 'TEACHER', 'TA'];

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

var _sheetCache = {};

/** Lấy sheet theo tên; tạo mới nếu chưa có và bổ sung các cột còn thiếu. */
function getSheet(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  var sheet = ss().getSheetByName(name);
  if (!sheet) sheet = ss().insertSheet(name);

  var key  = Object.keys(SHEET).find(function(k){ return SHEET[k] === name; });
  var cols = COL[key] || [];
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h).trim(); })
    : [];
  var missing = cols.filter(function(c){ return headers.indexOf(c) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  _sheetCache[name] = sheet;
  return sheet;
}

/**
 * Chuẩn hóa giá trị ô về chuỗi. Google Sheets tự đổi '2026-01-31' thành Date
 * và 'TRUE' thành boolean, nên phải đổi ngược lại để so sánh chuỗi cho đúng.
 */
function cellStr(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  if (v === true)  return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v);
}

/**
 * Đọc toàn bộ sheet.
 * Trả về { sheet, headers, idx: {tênCột: chỉSố}, rows: [{...cột, _row: sốDòngTrênSheet}] }
 */
function readTable(name) {
  var sheet  = getSheet(name);
  var values = sheet.getDataRange().getValues();
  var headers = (values[0] || []).map(function(h){ return String(h).trim(); });
  var idx = {};
  headers.forEach(function(h, i){ if (h && idx[h] === undefined) idx[h] = i; });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = { _row: r + 1 };
    var empty = true;
    headers.forEach(function(h, i) {
      if (!h) return;
      obj[h] = cellStr(values[r][i]);
      if (obj[h] !== '') empty = false;
    });
    if (!empty) rows.push(obj);
  }
  return { sheet: sheet, headers: headers, idx: idx, rows: rows };
}

/** Bỏ trường nội bộ _row trước khi trả về cho client. */
function clean(rows) {
  return rows.map(function(r) {
    var o = {};
    Object.keys(r).forEach(function(k){ if (k !== '_row') o[k] = r[k]; });
    return o;
  });
}

/** Convert sheet data to array of objects (giữ lại cho tương thích). */
function sheetToObjects(sheet) {
  return clean(readTable(sheet.getName()).rows);
}

/** Thêm nhiều dòng (mảng object theo tên cột). Ghi dạng văn bản để giữ số 0 đầu, ngày, TRUE/FALSE. */
function appendObjects(t, objs) {
  if (!objs.length) return;
  var data = objs.map(function(o) {
    return t.headers.map(function(h) {
      return (h && o[h] !== undefined && o[h] !== null) ? String(o[h]) : '';
    });
  });
  var start = Math.max(t.sheet.getLastRow(), 1) + 1;
  t.sheet.getRange(start, 1, data.length, t.headers.length)
    .setNumberFormat('@')
    .setValues(data);
}

/** Cập nhật một số cột của một dòng theo tên cột. */
function updateRow(t, rowNumber, changes) {
  Object.keys(changes).forEach(function(k) {
    if (changes[k] === undefined || t.idx[k] === undefined) return;
    t.sheet.getRange(rowNumber, t.idx[k] + 1)
      .setNumberFormat('@')
      .setValue(String(changes[k]));
  });
}

/** Xóa các dòng thỏa điều kiện. Trả về số dòng đã xóa. */
function deleteRows(t, pred) {
  var targets = t.rows.filter(pred).map(function(r){ return r._row; });
  targets.sort(function(a, b){ return b - a; });   // xóa từ dưới lên để không lệch số dòng
  targets.forEach(function(n){ t.sheet.deleteRow(n); });
  return targets.length;
}

/** Sinh ID kiểu CLS001, STU012 dựa trên số lớn nhất hiện có (không trùng sau khi xóa). */
function nextId(prefix, t, key) {
  var max = 0;
  t.rows.forEach(function(r) {
    var n = parseInt(String(r[key] || '').replace(prefix, ''), 10);
    if (isFinite(n) && n > max) max = n;
  });
  var s = String(max + 1);
  while (s.length < 3) s = '0' + s;
  return prefix + s;
}

function sameEmail(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function ok(data)  { return ContentService.createTextOutput(JSON.stringify({ ok: true,  data: data  })).setMimeType(ContentService.MimeType.JSON); }
function err(msg)  { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg })).setMimeType(ContentService.MimeType.JSON); }

function today() {
  return Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

// ────────────────────────────────────────────────────────────
//  AUTH CHECK
// ────────────────────────────────────────────────────────────
function requireAuth(email) {
  if (!email) throw new Error('Chưa đăng nhập');
  var u = readTable(SHEET.USERS).rows.find(function(x) {
    return sameEmail(x.Email, email) && x.Active === 'TRUE';
  });
  if (!u) throw new Error('Tài khoản không tồn tại hoặc đã bị khóa');
  return u;
}

function requireRole(email, roles) {
  var u = requireAuth(email);
  if (roles.indexOf(u.Role) === -1) throw new Error('Không có quyền thực hiện thao tác này');
  return u;
}

// ────────────────────────────────────────────────────────────
//  ENTRY POINT
// ────────────────────────────────────────────────────────────
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);   // tránh hai người ghi cùng lúc làm trùng ID / lệch dòng
  } catch (lockEx) {
    return err('Hệ thống đang bận, vui lòng thử lại sau giây lát');
  }
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    // Frontend gửi email người đang đăng nhập ở authEmail. Trường `email` có thể bị
    // ghi đè bởi dữ liệu form (ví dụ email của tài khoản mới khi addUser).
    var email  = String(body.authEmail || body.email || '').trim();

    // Public actions (no auth needed)
    if (action === 'getStudentReport') return getStudentReport(body);
    if (action === 'getSchedule')      return getSchedule();

    switch (action) {
      // ── Auth ──────────────────────────────────
      case 'login':           return login(body, email);

      // ── Classes ───────────────────────────────
      case 'getClasses':      return getClasses(body, email);
      case 'addClass':        return addClass(body, email);
      case 'editClass':       return editClass(body, email);
      case 'deleteClass':     return deleteClass(body, email);

      // ── Students ──────────────────────────────
      case 'getStudents':     return getStudents(body, email);
      case 'addStudent':      return addStudent(body, email);
      case 'editStudent':     return editStudent(body, email);
      case 'deleteStudent':   return deleteStudent(body, email);

      // ── Enrollments ───────────────────────────
      case 'getClassRoster':  return getClassRoster(body, email);
      case 'enrollStudent':   return enrollStudent(body, email);
      case 'removeEnrollment':return removeEnrollment(body, email);

      // ── Teachers ──────────────────────────────
      case 'getClassTeachers':  return getClassTeachers(body, email);
      case 'assignTeacher':     return assignTeacher(body, email);
      case 'removeTeacherFromClass': return removeTeacherFromClass(body, email);
      case 'getTeachers':       return getTeachers(body, email);

      // ── Attendance ────────────────────────────
      case 'markAttendance':  return markAttendance(body, email);
      case 'getAttendance':   return getAttendance(body, email);

      // ── Scores ────────────────────────────────
      case 'addScores':       return addScores(body, email);
      case 'getScores':       return getScores(body, email);

      // ── Users ─────────────────────────────────
      case 'getUsers':        return getUsers(body, email);
      case 'addUser':         return addUser(body, email);
      case 'editUser':        return editUser(body, email);
      case 'deleteUser':      return deleteUser(body, email);

      // ── Dashboard / Tuition ───────────────────
      case 'getDashboard':    return getDashboard(body, email);
      case 'getTuition':      return getTuition(body, email);

      // ── Thời khóa biểu ────────────────────────
      case 'saveSchedule':    return saveSchedule(body, email);

      default: return err('Action không hợp lệ: ' + action);
    }
  } catch(ex) {
    return err(ex.message || String(ex));
  } finally {
    lock.releaseLock();
  }
}

// ────────────────────────────────────────────────────────────
//  LOGIN
// ────────────────────────────────────────────────────────────
function login(body, email) {
  var pin = String(body.pin === undefined || body.pin === null ? '' : body.pin).trim();
  if (!email || !pin) return err('Vui lòng nhập email và PIN');
  var u = readTable(SHEET.USERS).rows.find(function(x) {
    return sameEmail(x.Email, email) && x.Pin === pin && x.Active === 'TRUE';
  });
  if (!u) return err('Email hoặc PIN không đúng');
  return ok({ email: u.Email, name: u.Name, role: u.Role });
}

// ────────────────────────────────────────────────────────────
//  CLASSES
// ────────────────────────────────────────────────────────────
function getClasses(body, email) {
  var u   = requireAuth(email);
  var all = readTable(SHEET.CLASSES).rows;

  // Teachers/TAs only see assigned classes
  if (u.Role === 'TEACHER' || u.Role === 'TA') {
    var assigned = readTable(SHEET.TCH_CLASSES).rows
      .filter(function(x){ return sameEmail(x.TeacherEmail, u.Email); })
      .map(function(x){ return x.ClassID; });
    all = all.filter(function(c){ return assigned.indexOf(c.ClassID) !== -1; });
  }
  return ok(clean(all));
}

function addClass(body, email) {
  requireRole(email, ['ADMIN']);
  var t  = readTable(SHEET.CLASSES);
  var id = nextId('CLS', t, 'ClassID');
  appendObjects(t, [{
    ClassID:       id,
    ClassName:     body.className || '',
    Subject:       body.subject   || '',
    Grade:         body.grade     || '',
    FeePerSession: body.feePerSession || 0,
    StartDate:     body.startDate || today(),
    Status:        body.status    || 'ACTIVE',
  }]);
  return ok({ classId: id });
}

function editClass(body, email) {
  requireRole(email, ['ADMIN']);
  var t   = readTable(SHEET.CLASSES);
  var row = t.rows.find(function(c){ return c.ClassID === body.classId; });
  if (!row) return err('Không tìm thấy lớp ' + body.classId);
  updateRow(t, row._row, {
    ClassName:     body.className,
    Subject:       body.subject,
    Grade:         body.grade,
    FeePerSession: body.feePerSession,
    StartDate:     body.startDate,
    Status:        body.status || undefined,
  });
  return ok('updated');
}

function deleteClass(body, email) {
  requireRole(email, ['ADMIN']);
  var n = deleteRows(readTable(SHEET.CLASSES), function(c){ return c.ClassID === body.classId; });
  if (!n) return err('Không tìm thấy lớp ' + body.classId);
  deleteRows(readTable(SHEET.ENROLLMENTS), function(e){ return e.ClassID === body.classId; });
  deleteRows(readTable(SHEET.TCH_CLASSES), function(x){ return x.ClassID === body.classId; });
  return ok('deleted');
}

// ────────────────────────────────────────────────────────────
//  STUDENTS
// ────────────────────────────────────────────────────────────
function getStudents(body, email) {
  // Giáo viên cũng cần danh sách này để ghi danh học sinh vào lớp của mình
  requireRole(email, ['ADMIN', 'TEACHER']);
  return ok(clean(readTable(SHEET.STUDENTS).rows));
}

function addStudent(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var t  = readTable(SHEET.STUDENTS);
  var id = nextId('STU', t, 'StudentID');
  appendObjects(t, [{
    StudentID:   id,
    FullName:    body.fullName    || '',
    SchoolClass: body.schoolClass || '',
    ParentName:  body.parentName  || '',
    ParentPhone: body.parentPhone || '',
    ParentEmail: body.parentEmail || '',
    Note:        body.note        || '',
    Status:      body.status      || 'ACTIVE',
  }]);
  return ok({ studentId: id });
}

function editStudent(body, email) {
  requireRole(email, ['ADMIN']);
  var t   = readTable(SHEET.STUDENTS);
  var row = t.rows.find(function(s){ return s.StudentID === body.studentId; });
  if (!row) return err('Không tìm thấy học sinh ' + body.studentId);
  updateRow(t, row._row, {
    FullName:    body.fullName,
    SchoolClass: body.schoolClass,
    ParentName:  body.parentName,
    ParentPhone: body.parentPhone,
    ParentEmail: body.parentEmail,
    Note:        body.note,
    Status:      body.status || undefined,
  });
  return ok('updated');
}

function deleteStudent(body, email) {
  requireRole(email, ['ADMIN']);
  var n = deleteRows(readTable(SHEET.STUDENTS), function(s){ return s.StudentID === body.studentId; });
  if (!n) return err('Không tìm thấy học sinh ' + body.studentId);
  deleteRows(readTable(SHEET.ENROLLMENTS), function(e){ return e.StudentID === body.studentId; });
  // Điểm danh và điểm số cũ được giữ lại để không mất lịch sử học phí.
  return ok('deleted');
}

// ────────────────────────────────────────────────────────────
//  ENROLLMENTS
// ────────────────────────────────────────────────────────────
function getClassRoster(body, email) {
  requireAuth(email);
  var enrolls = readTable(SHEET.ENROLLMENTS).rows
    .filter(function(e){ return e.ClassID === body.classId && e.Status === 'ACTIVE'; });
  var stuMap = {};
  clean(readTable(SHEET.STUDENTS).rows).forEach(function(s){ stuMap[s.StudentID] = s; });
  return ok(enrolls.map(function(e){ return stuMap[e.StudentID] || { StudentID: e.StudentID, FullName: '??' }; }));
}

function enrollStudent(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  if (!body.studentId || !body.classId) return err('Thiếu học sinh hoặc lớp');
  var t = readTable(SHEET.ENROLLMENTS);
  var existing = t.rows.find(function(e){ return e.StudentID === body.studentId && e.ClassID === body.classId; });
  if (existing) {
    updateRow(t, existing._row, { Status: 'ACTIVE' });   // Reactivate if removed
    return ok('reactivated');
  }
  appendObjects(t, [{ StudentID: body.studentId, ClassID: body.classId, EnrollDate: today(), Status: 'ACTIVE' }]);
  return ok('enrolled');
}

function removeEnrollment(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var t = readTable(SHEET.ENROLLMENTS);
  var existing = t.rows.find(function(e){ return e.StudentID === body.studentId && e.ClassID === body.classId; });
  if (!existing) return err('Không tìm thấy enrollment');
  updateRow(t, existing._row, { Status: 'REMOVED' });
  return ok('removed');
}

// ────────────────────────────────────────────────────────────
//  TEACHER–CLASS ASSIGNMENTS
// ────────────────────────────────────────────────────────────
function getTeachers(body, email) {
  requireRole(email, ['ADMIN']);
  var users = clean(readTable(SHEET.USERS).rows);
  return ok(users.filter(function(u){ return u.Role === 'TEACHER' || u.Role === 'TA'; }));
}

function getClassTeachers(body, email) {
  requireAuth(email);
  var tc = readTable(SHEET.TCH_CLASSES).rows
    .filter(function(x){ return x.ClassID === body.classId; });
  var users = clean(readTable(SHEET.USERS).rows);
  return ok(tc.map(function(x) {
    var u = users.find(function(u){ return sameEmail(u.Email, x.TeacherEmail); });
    // Không trả PIN ra ngoài ở danh sách này
    return u
      ? { Email: u.Email, Name: u.Name, Role: u.Role, Active: u.Active }
      : { Email: x.TeacherEmail, Name: '??', Role: 'TEACHER' };
  }));
}

function assignTeacher(body, email) {
  requireRole(email, ['ADMIN']);
  if (!body.teacherEmail || !body.classId) return err('Thiếu giáo viên hoặc lớp');
  var t = readTable(SHEET.TCH_CLASSES);
  var exists = t.rows.find(function(r){ return sameEmail(r.TeacherEmail, body.teacherEmail) && r.ClassID === body.classId; });
  if (exists) return err('Đã phân công rồi');
  appendObjects(t, [{ TeacherEmail: body.teacherEmail, ClassID: body.classId }]);
  return ok('assigned');
}

function removeTeacherFromClass(body, email) {
  requireRole(email, ['ADMIN']);
  var n = deleteRows(readTable(SHEET.TCH_CLASSES), function(r) {
    return sameEmail(r.TeacherEmail, body.teacherEmail) && r.ClassID === body.classId;
  });
  if (!n) return err('Không tìm thấy phân công');
  return ok('removed');
}

// ────────────────────────────────────────────────────────────
//  ATTENDANCE
// ────────────────────────────────────────────────────────────
function markAttendance(body, email) {
  var u = requireAuth(email);
  // body.records = [{ studentId, present, note }]
  var t    = readTable(SHEET.ATTENDANCE);
  var date = body.date || today();
  var toAdd = [];

  (body.records || []).forEach(function(rec) {
    var present  = rec.present ? 'TRUE' : 'FALSE';
    var existing = t.rows.find(function(r) {
      return r.Date === date && r.ClassID === body.classId && r.StudentID === rec.studentId;
    });
    if (existing) {
      updateRow(t, existing._row, { Present: present, Note: rec.note || '', By: u.Email });
    } else {
      toAdd.push({ Date: date, ClassID: body.classId, StudentID: rec.studentId, Present: present, Note: rec.note || '', By: u.Email });
    }
  });
  appendObjects(t, toAdd);
  return ok('saved');
}

function getAttendance(body, email) {
  requireAuth(email);
  var result = readTable(SHEET.ATTENDANCE).rows.filter(function(r) {
    var match = r.ClassID === body.classId;
    if (body.date)      match = match && r.Date === body.date;
    if (body.studentId) match = match && r.StudentID === body.studentId;
    return match;
  });
  return ok(clean(result));
}

// ────────────────────────────────────────────────────────────
//  SCORES
// ────────────────────────────────────────────────────────────
function addScores(body, email) {
  var u = requireRole(email, ['ADMIN', 'TEACHER']);
  var t        = readTable(SHEET.SCORES);
  var date     = body.date || today();
  var maxScore = body.maxScore || 10;
  var toAdd    = [];

  (body.records || []).forEach(function(rec) {
    var existing = t.rows.find(function(r) {
      return r.ClassID === body.classId && r.ExamName === body.examName && r.StudentID === rec.studentId;
    });
    if (existing) {
      updateRow(t, existing._row, { Date: date, MaxScore: maxScore, Score: rec.score, Note: rec.note || '', By: u.Email });
    } else {
      toAdd.push({ Date: date, ClassID: body.classId, ExamName: body.examName, MaxScore: maxScore, StudentID: rec.studentId, Score: rec.score, Note: rec.note || '', By: u.Email });
    }
  });
  appendObjects(t, toAdd);
  return ok('saved');
}

function getScores(body, email) {
  requireAuth(email);
  var result = readTable(SHEET.SCORES).rows.filter(function(r) {
    var match = r.ClassID === body.classId;
    if (body.examName)  match = match && r.ExamName === body.examName;
    if (body.studentId) match = match && r.StudentID === body.studentId;
    return match;
  });
  return ok(clean(result));
}

// ────────────────────────────────────────────────────────────
//  USERS
// ────────────────────────────────────────────────────────────
function getUsers(body, email) {
  requireRole(email, ['ADMIN']);
  return ok(clean(readTable(SHEET.USERS).rows));
}

function addUser(body, email) {
  requireRole(email, ['ADMIN']);
  // Ở action này body.email là email của tài khoản MỚI (người gọi nằm ở authEmail)
  var newEmail = String(body.email || '').trim();
  if (!newEmail) return err('Vui lòng nhập email');
  var role = body.role || 'TEACHER';
  if (ROLES.indexOf(role) === -1) return err('Vai trò không hợp lệ: ' + role);
  var t = readTable(SHEET.USERS);
  if (t.rows.find(function(u){ return sameEmail(u.Email, newEmail); })) return err('Email đã tồn tại');
  appendObjects(t, [{
    Email:  newEmail,
    Name:   body.name || newEmail.split('@')[0],
    Role:   role,
    Pin:    String(body.pin || '1234').trim(),
    Active: body.active || 'TRUE',
  }]);
  return ok('added');
}

/** Còn ít nhất một ADMIN đang hoạt động ngoài tài khoản `exceptEmail`? */
function hasOtherActiveAdmin(t, exceptEmail) {
  return t.rows.some(function(u) {
    return u.Role === 'ADMIN' && u.Active === 'TRUE' && !sameEmail(u.Email, exceptEmail);
  });
}

function editUser(body, email) {
  requireRole(email, ['ADMIN']);
  var t   = readTable(SHEET.USERS);
  var row = t.rows.find(function(u){ return sameEmail(u.Email, body.targetEmail); });
  if (!row) return err('Không tìm thấy user ' + body.targetEmail);
  if (body.role !== undefined && ROLES.indexOf(body.role) === -1) return err('Vai trò không hợp lệ: ' + body.role);

  var losesAdmin = row.Role === 'ADMIN' && row.Active === 'TRUE' &&
    ((body.role !== undefined && body.role !== 'ADMIN') || (body.active !== undefined && body.active !== 'TRUE'));
  if (losesAdmin && !hasOtherActiveAdmin(t, row.Email)) {
    return err('Phải còn ít nhất một quản trị viên đang hoạt động');
  }

  updateRow(t, row._row, {
    Name:   body.name,
    Role:   body.role,
    // Bỏ trống PIN khi sửa nghĩa là giữ PIN cũ
    Pin:    (body.pin !== undefined && String(body.pin).trim() !== '') ? String(body.pin).trim() : undefined,
    Active: body.active,
  });
  return ok('updated');
}

function deleteUser(body, email) {
  requireRole(email, ['ADMIN']);
  var target = String(body.targetEmail || '').trim();
  if (!target) return err('Vui lòng cung cấp email tài khoản cần xóa');
  if (sameEmail(target, email)) return err('Bạn không thể tự xóa tài khoản đang đăng nhập');
  var t = readTable(SHEET.USERS);
  var n = deleteRows(t, function(u){ return sameEmail(u.Email, target); });
  if (!n) return err('Không tìm thấy tài khoản ' + target);
  deleteRows(readTable(SHEET.TCH_CLASSES), function(x){ return sameEmail(x.TeacherEmail, target); });
  return ok('deleted');
}

// ────────────────────────────────────────────────────────────
//  DASHBOARD
// ────────────────────────────────────────────────────────────
function getDashboard(body, email) {
  requireRole(email, ['ADMIN']);
  var users    = readTable(SHEET.USERS).rows;
  var classes  = readTable(SHEET.CLASSES).rows;
  var students = readTable(SHEET.STUDENTS).rows;
  var att      = readTable(SHEET.ATTENDANCE).rows;
  var todayStr = today();

  var attToday     = att.filter(function(a){ return a.Date === todayStr; });
  var presentToday = attToday.filter(function(a){ return a.Present === 'TRUE'; }).length;

  return ok({
    totalStudents:  students.filter(function(s){ return s.Status === 'ACTIVE'; }).length,
    totalClasses:   classes.filter(function(c){ return c.Status === 'ACTIVE'; }).length,
    totalTeachers:  users.filter(function(u){ return u.Role === 'TEACHER' && u.Active === 'TRUE'; }).length,
    totalTAs:       users.filter(function(u){ return u.Role === 'TA'      && u.Active === 'TRUE'; }).length,
    presentToday:   presentToday,
    totalAttToday:  attToday.length,
  });
}

// ────────────────────────────────────────────────────────────
//  TUITION
// ────────────────────────────────────────────────────────────
function getTuition(body, email) {
  requireAuth(email);
  var classId = body.classId;

  var cls = clean(readTable(SHEET.CLASSES).rows).find(function(c){ return c.ClassID === classId; });
  if (!cls) return err('Không tìm thấy lớp');

  var fee     = parseFloat(cls.FeePerSession) || 0;
  var enrolls = readTable(SHEET.ENROLLMENTS).rows
    .filter(function(e){ return e.ClassID === classId && e.Status === 'ACTIVE'; });
  var stuMap  = {};
  readTable(SHEET.STUDENTS).rows.forEach(function(s){ stuMap[s.StudentID] = s; });

  var att = readTable(SHEET.ATTENDANCE).rows
    .filter(function(a){ return a.ClassID === classId; });

  // Count distinct dates for sessionsTotal
  var dates = {};
  att.forEach(function(a){ dates[a.Date] = true; });
  var sessionsTotal = Object.keys(dates).length;

  var result = enrolls.map(function(enr) {
    var sid      = enr.StudentID;
    var stuAtt   = att.filter(function(a){ return a.StudentID === sid; });
    var attended = stuAtt.filter(function(a){ return a.Present === 'TRUE'; }).length;
    var absent   = stuAtt.filter(function(a){ return a.Present === 'FALSE'; }).length;
    return {
      studentId:        sid,
      fullName:         stuMap[sid] ? stuMap[sid].FullName : '??',
      sessionsTotal:    sessionsTotal,
      sessionsAttended: attended,
      sessionsAbsent:   absent,
      feePerSession:    fee,
      tuition:          attended * fee,
    };
  });

  return ok({ classInfo: cls, students: result });
}

// ────────────────────────────────────────────────────────────
//  PARENT REPORT (PUBLIC — no auth)
// ────────────────────────────────────────────────────────────
function getStudentReport(body) {
  var studentId = body.studentId;
  var student   = clean(readTable(SHEET.STUDENTS).rows).find(function(s){ return s.StudentID === studentId; });
  if (!student) return err('Không tìm thấy học sinh');

  var enrolls = readTable(SHEET.ENROLLMENTS).rows
    .filter(function(e){ return e.StudentID === studentId && e.Status === 'ACTIVE'; });
  var clsMap  = {};
  readTable(SHEET.CLASSES).rows.forEach(function(c){ clsMap[c.ClassID] = c; });

  var allAtt    = clean(readTable(SHEET.ATTENDANCE).rows);
  var allScores = clean(readTable(SHEET.SCORES).rows);

  var classData = enrolls.map(function(enr) {
    var cid = enr.ClassID;
    var cls = clsMap[cid] || {};
    var fee = parseFloat(cls.FeePerSession) || 0;

    var stuAtt = allAtt.filter(function(a){ return a.ClassID === cid && a.StudentID === studentId; });
    // Total sessions = distinct dates in attendance for this class
    var dates  = {};
    allAtt.filter(function(a){ return a.ClassID === cid; }).forEach(function(a){ dates[a.Date] = true; });
    var sessionsTotal    = Object.keys(dates).length;
    var sessionsAttended = stuAtt.filter(function(a){ return a.Present === 'TRUE'; }).length;

    var scores = allScores.filter(function(s){ return s.ClassID === cid && s.StudentID === studentId; });

    return {
      classId:          cid,
      className:        cls.ClassName || cid,
      subject:          cls.Subject   || '',
      grade:            cls.Grade     || '',
      feePerSession:    fee,
      sessionsTotal:    sessionsTotal,
      sessionsAttended: sessionsAttended,
      tuition:          sessionsAttended * fee,
      scores:           scores,
      attendance:       stuAtt.sort(function(a,b){ return b.Date.localeCompare(a.Date); }),
    };
  });

  return ok({ student: student, classes: classData });
}

// ────────────────────────────────────────────────────────────
//  THỜI KHÓA BIỂU (trang Lịch học)
//  Đọc công khai (trang /lich-hoc không cần đăng nhập); chỉ ADMIN được lưu.
//  Mỗi lần lưu ghi đè toàn bộ một bảng (ca học / cơ sở / giáo viên).
// ────────────────────────────────────────────────────────────
function getSchedule() {
  var initialized = PropertiesService.getScriptProperties().getProperty(SCHEDULE_INIT_PROP) === 'TRUE';
  return ok({
    initialized:     initialized,
    slots:           clean(readTable(SHEET.SCH_SLOTS).rows),
    sites:           clean(readTable(SHEET.SCH_SITES).rows),
    teacherProfiles: clean(readTable(SHEET.SCH_TEACHERS).rows),
  });
}

/** Ghi đè toàn bộ dữ liệu một sheet bằng mảng object; thêm cột nếu object có trường mới. */
function replaceTable(name, objs) {
  var t = readTable(name);
  var headers = t.headers.slice();
  objs.forEach(function(o) {
    Object.keys(o).forEach(function(k) {
      if (k && k !== '_row' && headers.indexOf(k) === -1) headers.push(k);
    });
  });
  if (headers.length > t.headers.length) {
    t.sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  var lastRow = t.sheet.getLastRow();
  if (lastRow > 1) {
    t.sheet.getRange(2, 1, lastRow - 1, Math.max(t.sheet.getLastColumn(), headers.length)).clearContent();
  }
  if (!objs.length) return;
  var data = objs.map(function(o) {
    return headers.map(function(h) {
      var v = h ? o[h] : '';
      if (v === undefined || v === null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  });
  t.sheet.getRange(2, 1, data.length, headers.length).setNumberFormat('@').setValues(data);
}

function saveSchedule(body, email) {
  requireRole(email, ['ADMIN']);
  var saved = [];
  if (Array.isArray(body.slots)) {
    replaceTable(SHEET.SCH_SLOTS, body.slots);
    saved.push('slots');
  }
  if (Array.isArray(body.sites)) {
    replaceTable(SHEET.SCH_SITES, body.sites);
    saved.push('sites');
  }
  if (body.teacherProfiles && typeof body.teacherProfiles === 'object') {
    var list = Array.isArray(body.teacherProfiles)
      ? body.teacherProfiles
      : Object.keys(body.teacherProfiles).map(function(k) {
          var p = body.teacherProfiles[k] || {};
          var o = {};
          Object.keys(p).forEach(function(f){ o[f] = p[f]; });
          o.name = p.name || k;
          return o;
        });
    replaceTable(SHEET.SCH_TEACHERS, list);
    saved.push('teacherProfiles');
  }
  if (!saved.length) return err('Không có dữ liệu thời khóa biểu để lưu');
  PropertiesService.getScriptProperties().setProperty(SCHEDULE_INIT_PROP, 'TRUE');
  return ok({ saved: saved });
}

// ────────────────────────────────────────────────────────────
//  SETUP HELPER – chạy 1 lần để tạo sheet / bổ sung cột còn thiếu
// ────────────────────────────────────────────────────────────
function setupSheets() {
  Object.keys(SHEET).forEach(function(k) {
    getSheet(SHEET[k]); // creates sheet + header row, adds missing columns
  });
  // Seed admin account (chỉ khi sheet Users còn trống)
  var t = readTable(SHEET.USERS);
  var msg = '✅ Đã kiểm tra và tạo đủ sheet/cột.';
  if (t.rows.length === 0) {
    appendObjects(t, [{ Email: 'admin@example.com', Name: 'Admin', Role: 'ADMIN', Pin: '1234', Active: 'TRUE' }]);
    msg += '\n\nTài khoản mặc định:\nEmail: admin@example.com\nPIN: 1234\n\nHãy đổi PIN ngay sau khi đăng nhập!';
  }
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}
