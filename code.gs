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
};

// ── Cột của từng sheet (theo thứ tự, 0-indexed) ────────────
var COL = {
  USERS:        ['Email','Name','Role','Pin','Active'],
  CLASSES:      ['ClassID','ClassName','Subject','Grade','FeePerSession','StartDate','Status'],
  STUDENTS:     ['StudentID','FullName','ParentName','ParentPhone','ParentEmail','Note','Status'],
  ENROLLMENTS:  ['StudentID','ClassID','EnrollDate','Status'],
  ATTENDANCE:   ['Date','ClassID','StudentID','Present','Note','By'],
  SCORES:       ['Date','ClassID','ExamName','MaxScore','StudentID','Score','Note','By'],
  TCH_CLASSES:  ['TeacherEmail','ClassID'],
};

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) {
    sheet = ss().insertSheet(name);
    var cols = COL[Object.keys(SHEET).find(k => SHEET[k] === name)];
    if (cols) sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  return sheet;
}

/** Convert sheet data to array of objects */
function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = (row[i] === null || row[i] === undefined) ? '' : String(row[i]);
    });
    return obj;
  });
}

function ok(data)  { return ContentService.createTextOutput(JSON.stringify({ ok: true,  data: data  })).setMimeType(ContentService.MimeType.JSON); }
function err(msg)  { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg })).setMimeType(ContentService.MimeType.JSON); }

/** Generate ID like CLS001, STU012 */
function generateId(prefix, sheet) {
  var rows = sheet.getLastRow() - 1;
  var n = rows < 0 ? 0 : rows;
  return prefix + String(n + 1).padStart(3, '0');
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ────────────────────────────────────────────────────────────
//  AUTH CHECK
// ────────────────────────────────────────────────────────────
function requireAuth(email) {
  if (!email) throw new Error('Chưa đăng nhập');
  var users = sheetToObjects(getSheet(SHEET.USERS));
  var u = users.find(function(x){ return x.Email === email && x.Active === 'TRUE'; });
  if (!u) throw new Error('Tài khoản không tồn tại hoặc đã bị khóa');
  return u;
}

function requireRole(email, roles) {
  var u = requireAuth(email);
  if (!roles.includes(u.Role)) throw new Error('Không có quyền thực hiện thao tác này');
  return u;
}

// ────────────────────────────────────────────────────────────
//  ENTRY POINT
// ────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var email  = body.email || '';

    // Public actions (no auth needed)
    if (action === 'getStudentReport') return getStudentReport(body);

    // Auth required
    switch (action) {
      // ── Auth ──────────────────────────────────
      case 'login':           return login(body);

      // ── Classes ───────────────────────────────
      case 'getClasses':      return getClasses(body, email);
      case 'addClass':        return addClass(body, email);
      case 'editClass':       return editClass(body, email);

      // ── Students ──────────────────────────────
      case 'getStudents':     return getStudents(body, email);
      case 'addStudent':      return addStudent(body, email);
      case 'editStudent':     return editStudent(body, email);

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

      // ── Dashboard / Tuition ───────────────────
      case 'getDashboard':    return getDashboard(body, email);
      case 'getTuition':      return getTuition(body, email);

      default: return err('Action không hợp lệ: ' + action);
    }
  } catch(ex) {
    return err(ex.message || String(ex));
  }
}

// ────────────────────────────────────────────────────────────
//  LOGIN
// ────────────────────────────────────────────────────────────
function login(body) {
  var users = sheetToObjects(getSheet(SHEET.USERS));
  var u = users.find(function(x){
    return x.Email === body.email && x.Pin === String(body.pin) && x.Active === 'TRUE';
  });
  if (!u) return err('Email hoặc PIN không đúng');
  return ok({ email: u.Email, name: u.Name, role: u.Role });
}

// ────────────────────────────────────────────────────────────
//  CLASSES
// ────────────────────────────────────────────────────────────
function getClasses(body, email) {
  requireAuth(email);
  var u = requireAuth(email);
  var all = sheetToObjects(getSheet(SHEET.CLASSES));

  // Teachers/TAs only see assigned classes
  if (u.Role === 'TEACHER' || u.Role === 'TA') {
    var assigned = sheetToObjects(getSheet(SHEET.TCH_CLASSES))
      .filter(function(x){ return x.TeacherEmail === email; })
      .map(function(x){ return x.ClassID; });
    all = all.filter(function(c){ return assigned.includes(c.ClassID); });
  }
  return ok(all);
}

function addClass(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.CLASSES);
  var id = generateId('CLS', sheet);
  sheet.appendRow([
    id,
    body.className || '',
    body.subject   || '',
    body.grade     || '',
    body.feePerSession || 0,
    body.startDate || today(),
    body.status    || 'ACTIVE',
  ]);
  return ok({ classId: id });
}

function editClass(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.CLASSES);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === body.classId) {
      sheet.getRange(i+1, 2).setValue(body.className    || data[i][1]);
      sheet.getRange(i+1, 3).setValue(body.subject      || data[i][2]);
      sheet.getRange(i+1, 4).setValue(body.grade        || data[i][3]);
      sheet.getRange(i+1, 5).setValue(body.feePerSession !== undefined ? body.feePerSession : data[i][4]);
      sheet.getRange(i+1, 6).setValue(body.startDate    || data[i][5]);
      sheet.getRange(i+1, 7).setValue(body.status       || data[i][6]);
      return ok('updated');
    }
  }
  return err('Không tìm thấy lớp ' + body.classId);
}

// ────────────────────────────────────────────────────────────
//  STUDENTS
// ────────────────────────────────────────────────────────────
function getStudents(body, email) {
  requireRole(email, ['ADMIN']);
  return ok(sheetToObjects(getSheet(SHEET.STUDENTS)));
}

function addStudent(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var sheet = getSheet(SHEET.STUDENTS);
  var id = generateId('STU', sheet);
  sheet.appendRow([
    id,
    body.fullName    || '',
    body.parentName  || '',
    body.parentPhone || '',
    body.parentEmail || '',
    body.note        || '',
    'ACTIVE',
  ]);
  return ok({ studentId: id });
}

function editStudent(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.STUDENTS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === body.studentId) {
      sheet.getRange(i+1, 2).setValue(body.fullName    !== undefined ? body.fullName    : data[i][1]);
      sheet.getRange(i+1, 3).setValue(body.parentName  !== undefined ? body.parentName  : data[i][2]);
      sheet.getRange(i+1, 4).setValue(body.parentPhone !== undefined ? body.parentPhone : data[i][3]);
      sheet.getRange(i+1, 5).setValue(body.parentEmail !== undefined ? body.parentEmail : data[i][4]);
      sheet.getRange(i+1, 6).setValue(body.note        !== undefined ? body.note        : data[i][5]);
      sheet.getRange(i+1, 7).setValue(body.status      || data[i][6]);
      return ok('updated');
    }
  }
  return err('Không tìm thấy học sinh ' + body.studentId);
}

// ────────────────────────────────────────────────────────────
//  ENROLLMENTS
// ────────────────────────────────────────────────────────────
function getClassRoster(body, email) {
  requireAuth(email);
  var enrolls  = sheetToObjects(getSheet(SHEET.ENROLLMENTS))
    .filter(function(e){ return e.ClassID === body.classId && e.Status === 'ACTIVE'; });
  var students = sheetToObjects(getSheet(SHEET.STUDENTS));
  var stuMap   = {};
  students.forEach(function(s){ stuMap[s.StudentID] = s; });
  return ok(enrolls.map(function(e){ return stuMap[e.StudentID] || { StudentID: e.StudentID, FullName: '??' }; }));
}

function enrollStudent(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var sheet   = getSheet(SHEET.ENROLLMENTS);
  var enrolls = sheetToObjects(sheet);
  var exists  = enrolls.find(function(e){ return e.StudentID === body.studentId && e.ClassID === body.classId; });
  if (exists) {
    // Reactivate if removed
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === body.studentId && String(data[i][1]) === body.classId) {
        sheet.getRange(i+1, 4).setValue('ACTIVE');
        return ok('reactivated');
      }
    }
  }
  sheet.appendRow([ body.studentId, body.classId, today(), 'ACTIVE' ]);
  return ok('enrolled');
}

function removeEnrollment(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var sheet = getSheet(SHEET.ENROLLMENTS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === body.studentId && String(data[i][1]) === body.classId) {
      sheet.getRange(i+1, 4).setValue('REMOVED');
      return ok('removed');
    }
  }
  return err('Không tìm thấy enrollment');
}

// ────────────────────────────────────────────────────────────
//  TEACHER–CLASS ASSIGNMENTS
// ────────────────────────────────────────────────────────────
function getTeachers(body, email) {
  requireRole(email, ['ADMIN']);
  var users = sheetToObjects(getSheet(SHEET.USERS));
  return ok(users.filter(function(u){ return u.Role === 'TEACHER' || u.Role === 'TA'; }));
}

function getClassTeachers(body, email) {
  requireAuth(email);
  var tc    = sheetToObjects(getSheet(SHEET.TCH_CLASSES))
    .filter(function(x){ return x.ClassID === body.classId; });
  var users = sheetToObjects(getSheet(SHEET.USERS));
  var uMap  = {};
  users.forEach(function(u){ uMap[u.Email] = u; });
  return ok(tc.map(function(x){ return uMap[x.TeacherEmail] || { Email: x.TeacherEmail, Name: '??', Role: '??' }; }));
}

function assignTeacher(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.TCH_CLASSES);
  var rows  = sheetToObjects(sheet);
  var exists = rows.find(function(r){ return r.TeacherEmail === body.teacherEmail && r.ClassID === body.classId; });
  if (exists) return err('Đã phân công rồi');
  sheet.appendRow([ body.teacherEmail, body.classId ]);
  return ok('assigned');
}

function removeTeacherFromClass(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.TCH_CLASSES);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === body.teacherEmail && String(data[i][1]) === body.classId) {
      sheet.deleteRow(i + 1);
      return ok('removed');
    }
  }
  return err('Không tìm thấy phân công');
}

// ────────────────────────────────────────────────────────────
//  ATTENDANCE
// ────────────────────────────────────────────────────────────
function markAttendance(body, email) {
  requireAuth(email);
  // body.records = [{ studentId, present, note }]
  var sheet = getSheet(SHEET.ATTENDANCE);
  var data  = sheet.getDataRange().getValues();
  var date  = body.date || today();

  body.records.forEach(function(rec) {
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === date &&
          String(data[i][1]) === body.classId &&
          String(data[i][2]) === rec.studentId) {
        sheet.getRange(i+1, 4).setValue(rec.present ? 'TRUE' : 'FALSE');
        sheet.getRange(i+1, 5).setValue(rec.note || '');
        sheet.getRange(i+1, 6).setValue(email);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([ date, body.classId, rec.studentId, rec.present ? 'TRUE' : 'FALSE', rec.note || '', email ]);
      data.push([ date, body.classId, rec.studentId, rec.present ? 'TRUE' : 'FALSE', rec.note || '', email ]);
    }
  });
  return ok('saved');
}

function getAttendance(body, email) {
  requireAuth(email);
  var all = sheetToObjects(getSheet(SHEET.ATTENDANCE));
  var result = all.filter(function(r){
    var match = r.ClassID === body.classId;
    if (body.date)      match = match && r.Date === body.date;
    if (body.studentId) match = match && r.StudentID === body.studentId;
    return match;
  });
  return ok(result);
}

// ────────────────────────────────────────────────────────────
//  SCORES
// ────────────────────────────────────────────────────────────
function addScores(body, email) {
  requireRole(email, ['ADMIN', 'TEACHER']);
  var sheet = getSheet(SHEET.SCORES);
  var data  = sheet.getDataRange().getValues();
  var date  = body.date || today();

  (body.records || []).forEach(function(rec) {
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === body.classId &&
          String(data[i][2]) === body.examName &&
          String(data[i][4]) === rec.studentId) {
        sheet.getRange(i+1, 1).setValue(date);
        sheet.getRange(i+1, 4).setValue(body.maxScore);
        sheet.getRange(i+1, 6).setValue(rec.score);
        sheet.getRange(i+1, 7).setValue(rec.note || '');
        sheet.getRange(i+1, 8).setValue(email);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([ date, body.classId, body.examName, body.maxScore, rec.studentId, rec.score, rec.note || '', email ]);
      data.push([ date, body.classId, body.examName, body.maxScore, rec.studentId, rec.score, rec.note || '', email ]);
    }
  });
  return ok('saved');
}

function getScores(body, email) {
  requireAuth(email);
  var all = sheetToObjects(getSheet(SHEET.SCORES));
  var result = all.filter(function(r){
    var match = r.ClassID === body.classId;
    if (body.examName)  match = match && r.ExamName === body.examName;
    if (body.studentId) match = match && r.StudentID === body.studentId;
    return match;
  });
  return ok(result);
}

// ────────────────────────────────────────────────────────────
//  USERS
// ────────────────────────────────────────────────────────────
function getUsers(body, email) {
  requireRole(email, ['ADMIN']);
  return ok(sheetToObjects(getSheet(SHEET.USERS)));
}

function addUser(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.USERS);
  var users = sheetToObjects(sheet);
  if (users.find(function(u){ return u.Email === body.email; }))
    return err('Email đã tồn tại');
  sheet.appendRow([ body.email, body.name, body.role, body.pin || '1234', body.active || 'TRUE' ]);
  return ok('added');
}

function editUser(body, email) {
  requireRole(email, ['ADMIN']);
  var sheet = getSheet(SHEET.USERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === body.targetEmail) {
      sheet.getRange(i+1, 2).setValue(body.name   !== undefined ? body.name   : data[i][1]);
      sheet.getRange(i+1, 3).setValue(body.role   !== undefined ? body.role   : data[i][2]);
      sheet.getRange(i+1, 4).setValue(body.pin    !== undefined ? body.pin    : data[i][3]);
      sheet.getRange(i+1, 5).setValue(body.active !== undefined ? body.active : data[i][4]);
      return ok('updated');
    }
  }
  return err('Không tìm thấy user ' + body.targetEmail);
}

// ────────────────────────────────────────────────────────────
//  DASHBOARD
// ────────────────────────────────────────────────────────────
function getDashboard(body, email) {
  requireRole(email, ['ADMIN']);
  var users    = sheetToObjects(getSheet(SHEET.USERS));
  var classes  = sheetToObjects(getSheet(SHEET.CLASSES));
  var students = sheetToObjects(getSheet(SHEET.STUDENTS));
  var att      = sheetToObjects(getSheet(SHEET.ATTENDANCE));
  var todayStr = today();

  var attToday  = att.filter(function(a){ return a.Date === todayStr; });
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

  var classes  = sheetToObjects(getSheet(SHEET.CLASSES));
  var cls      = classes.find(function(c){ return c.ClassID === classId; });
  if (!cls) return err('Không tìm thấy lớp');

  var fee      = parseFloat(cls.FeePerSession) || 0;
  var enrolls  = sheetToObjects(getSheet(SHEET.ENROLLMENTS))
    .filter(function(e){ return e.ClassID === classId && e.Status === 'ACTIVE'; });
  var students = sheetToObjects(getSheet(SHEET.STUDENTS));
  var stuMap   = {};
  students.forEach(function(s){ stuMap[s.StudentID] = s; });

  var att = sheetToObjects(getSheet(SHEET.ATTENDANCE))
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
  var students  = sheetToObjects(getSheet(SHEET.STUDENTS));
  var student   = students.find(function(s){ return s.StudentID === studentId; });
  if (!student) return err('Không tìm thấy học sinh');

  var enrolls = sheetToObjects(getSheet(SHEET.ENROLLMENTS))
    .filter(function(e){ return e.StudentID === studentId && e.Status === 'ACTIVE'; });
  var classes  = sheetToObjects(getSheet(SHEET.CLASSES));
  var clsMap   = {};
  classes.forEach(function(c){ clsMap[c.ClassID] = c; });

  var allAtt    = sheetToObjects(getSheet(SHEET.ATTENDANCE));
  var allScores = sheetToObjects(getSheet(SHEET.SCORES));

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
//  SETUP HELPER – chạy 1 lần để tạo sheet mẫu
// ────────────────────────────────────────────────────────────
function setupSheets() {
  Object.values(SHEET).forEach(function(name) {
    getSheet(name); // creates sheet + header row if missing
  });
  // Seed admin account
  var userSheet = getSheet(SHEET.USERS);
  var data = userSheet.getDataRange().getValues();
  if (data.length < 2) {
    userSheet.appendRow(['admin@example.com', 'Admin', 'ADMIN', '1234', 'TRUE']);
  }
  SpreadsheetApp.getUi().alert('✅ Tạo sheet xong!\n\nTài khoản mặc định:\nEmail: admin@example.com\nPIN: 1234\n\nHãy đổi PIN ngay sau khi đăng nhập!');
}
