// Kiểm thử code.gs với Google Sheets giả lập. Chạy: npm test
const assert = require('assert');
const { createGas, ymd } = require('./gas-mock.cjs');

// Dữ liệu "cũ" đã bị Sheets tự đổi kiểu (boolean, số, Date); Students có cột SchoolClass;
// sheet Attendance cố tình thiếu cột By, còn Scores/Payments chưa tồn tại.
const { sheets, call } = createGas({
  Users: [['Email', 'Name', 'Role', 'Pin', 'Active'], ['Admin@x.com', 'Admin', 'ADMIN', 1234, true], ['gv@x.com', 'GV', 'TEACHER', 1111, true]],
  Classes: [['ClassID', 'ClassName', 'Subject', 'Grade', 'FeePerSession', 'StartDate', 'Status'], ['CLS001', 'Toán 9A', 'Toán', 9, 150000, new Date('2026-09-01T00:00:00'), 'ACTIVE']],
  Students: [['StudentID', 'FullName', 'SchoolClass', 'ParentName', 'ParentPhone', 'ParentEmail', 'Note', 'Status'], ['STU001', 'An', '9/1', 'Bố An', 905000111, '', '', 'ACTIVE'], ['STU003', 'Bình', '9/2', '', '', '', '', 'ACTIVE']],
  Enrollments: [['StudentID', 'ClassID', 'EnrollDate', 'Status'], ['STU001', 'CLS001', new Date('2026-09-01T00:00:00'), 'ACTIVE']],
  Attendance: [['Date', 'ClassID', 'StudentID', 'Present', 'Note']],
  TeacherClasses: [['TeacherEmail', 'ClassID']],
});

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}\n`, e);
    process.exit(1);
  }
};
const okd = r => {
  assert.ok(r.ok, r.error);
  return r.data;
};
const A = 'admin@x.com';
const T = 'gv@x.com';
const daysAgo = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const TODAY = daysAgo(0);
const MONTH = TODAY.slice(0, 7);
const weekdayToday = (() => {
  const d = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
  return d === 0 ? 8 : d + 1;
})();

test('đăng nhập', () => {
  assert.deepStrictEqual(okd(call('login', { pin: '1234' }, A)), { email: 'Admin@x.com', name: 'Admin', role: 'ADMIN' });
  assert.strictEqual(call('login', { pin: '9999' }, A).ok, false);
  assert.strictEqual(call('login', { pin: '' }, 'la@x.com').ok, false, 'email lạ không được tự thành admin');
  assert.strictEqual(call('getUsers', {}, 'la@x.com').ok, false);
});

test('người dùng', () => {
  okd(call('addUser', { email: 'tg@x.com', name: 'Trợ giảng', role: 'TA', pin: '0123', active: 'TRUE' }, A));
  assert.strictEqual(call('addUser', { email: 'TG@x.com', name: 'x', role: 'TA', pin: '1' }, A).error, 'Email đã tồn tại');
  okd(call('login', { pin: '0123' }, 'tg@x.com')); // PIN có số 0 đầu vẫn đúng
  okd(call('editUser', { targetEmail: 'tg@x.com', name: 'TG2', role: 'TA', pin: '', active: 'TRUE' }, A));
  okd(call('login', { pin: '0123' }, 'tg@x.com')); // bỏ trống PIN = giữ PIN cũ
  assert.strictEqual(call('editUser', { targetEmail: 'Admin@x.com', role: 'TEACHER' }, A).ok, false); // admin cuối cùng
  assert.strictEqual(call('deleteUser', { targetEmail: 'admin@x.com' }, A).ok, false);
  assert.strictEqual(call('addUser', { email: 'z@x.com', name: 'z', role: 'TA' }, T).ok, false);
});

let sid;
let cid;
test('học sinh và lớp', () => {
  sid = okd(call('addStudent', { fullName: 'Chi', schoolClass: '8/3', parentName: 'Mẹ Chi', parentPhone: '0971120360', status: 'ACTIVE' }, A)).studentId;
  assert.strictEqual(sid, 'STU004');
  let stu = okd(call('getStudents', {}, A)).find(s => s.StudentID === sid);
  assert.deepStrictEqual([stu.SchoolClass, stu.ParentName, stu.ParentPhone], ['8/3', 'Mẹ Chi', '0971120360']);
  okd(call('editStudent', { studentId: sid, fullName: 'Chi B', schoolClass: '8/4', parentPhone: '0971120360', note: 'ok', status: 'ACTIVE' }, A));
  stu = okd(call('getStudents', {}, T)).find(s => s.StudentID === sid);
  assert.deepStrictEqual([stu.FullName, stu.SchoolClass, stu.Note], ['Chi B', '8/4', 'ok']);

  cid = okd(call('addClass', { className: 'Toán 8', subject: 'Toán', grade: '8', feePerSession: 120000, startDate: '2026-11-01', status: 'ACTIVE' }, A)).classId;
  assert.strictEqual(cid, 'CLS002');
  assert.strictEqual(okd(call('getClasses', {}, A)).find(c => c.ClassID === 'CLS001').StartDate, '2026-09-01');
  okd(call('enrollStudent', { studentId: sid, classId: cid }, A));
  okd(call('enrollStudent', { studentId: 'STU001', classId: cid }, A));
  okd(call('assignTeacher', { teacherEmail: 'gv@x.com', classId: cid }, A));
  assert.deepStrictEqual(okd(call('getClasses', {}, T)).map(c => c.ClassID), [cid]);
  assert.strictEqual(okd(call('getClassTeachers', { classId: cid }, A))[0].Pin, undefined);
  okd(call('removeEnrollment', { studentId: 'STU001', classId: cid }, A));
  okd(call('enrollStudent', { studentId: 'STU001', classId: cid }, A));
  assert.strictEqual(okd(call('getClassRoster', { classId: cid }, T)).length, 2);
  assert.strictEqual(sheets.Enrollments.d.length, 4); // kích hoạt lại, không thêm dòng trùng
});

test('điểm danh và điểm số', () => {
  const recs = p => [{ studentId: sid, present: p, note: '' }, { studentId: 'STU001', present: true, note: '' }];
  okd(call('markAttendance', { classId: cid, date: '2026-11-17', records: recs(true) }, T));
  okd(call('markAttendance', { classId: cid, date: '2026-11-17', records: recs(false) }, T)); // lưu lại, không trùng
  okd(call('markAttendance', { classId: cid, date: '2026-11-18', records: recs(true) }, T));
  const att = okd(call('getAttendance', { classId: cid, date: '2026-11-17' }, T));
  assert.strictEqual(att.length, 2);
  assert.deepStrictEqual(att.find(a => a.StudentID === sid), { Date: '2026-11-17', ClassID: cid, StudentID: sid, Present: 'FALSE', Note: '', By: 'gv@x.com' });

  okd(call('addScores', { classId: cid, examName: 'KT1', maxScore: 10, date: '2026-11-17', records: [{ studentId: sid, score: 8.5 }] }, T));
  okd(call('addScores', { classId: cid, examName: 'KT1', maxScore: 10, date: '2026-11-17', records: [{ studentId: sid, score: 9 }] }, T));
  const sc = okd(call('getScores', { classId: cid, examName: 'KT1' }, T));
  assert.deepStrictEqual([sc.length, sc[0].Score], [1, '9']);
  assert.strictEqual(call('addScores', { classId: cid, examName: 'KT1', records: [] }, 'tg@x.com').ok, false);
});

test('học phí cả khóa và báo cáo phụ huynh', () => {
  const me = okd(call('getTuition', { classId: cid }, T)).students.find(s => s.studentId === sid);
  assert.deepStrictEqual([me.sessionsTotal, me.sessionsAttended, me.sessionsAbsent, me.tuition, me.payment], [2, 1, 1, 120000, null]);
  const rep = okd(call('getStudentReport', { studentId: sid }));
  assert.deepStrictEqual([rep.student.FullName, rep.classes[0].tuition, rep.classes[0].scores.length, rep.classes[0].attendance[0].Date], ['Chi B', 120000, 1, '2026-11-18']);
});

test('học phí theo tháng và thu tiền', () => {
  okd(call('markAttendance', { classId: cid, date: '2026-10-05', records: [{ studentId: sid, present: true }] }, T));
  let oct = okd(call('getTuition', { classId: cid, month: '2026-10' }, A));
  let chi = oct.students.find(s => s.studentId === sid);
  assert.deepStrictEqual([oct.month, chi.sessionsAttended, chi.tuition, chi.parentPhone, chi.payment], ['2026-10', 1, 120000, '0971120360', null]);

  assert.strictEqual(call('markPaid', { classId: cid, studentId: sid, month: '2026-10', amount: 120000 }, T).ok, false, 'giáo viên không được thu tiền');
  assert.strictEqual(call('markPaid', { classId: cid, studentId: sid, month: 'abc', amount: 1 }, A).ok, false);
  assert.strictEqual(call('markPaid', { classId: cid, studentId: sid, month: '2026-10', amount: -5 }, A).ok, false);
  okd(call('markPaid', { classId: cid, studentId: sid, month: '2026-10', amount: 100000, paidDate: '2026-10-30', method: 'Chuyển khoản', note: 'giảm' }, A));
  okd(call('markPaid', { classId: cid, studentId: sid, month: '2026-10', amount: 110000, paidDate: '2026-10-31' }, A)); // sửa, không thêm dòng
  assert.strictEqual(sheets.Payments.d.length, 2);
  chi = okd(call('getTuition', { classId: cid, month: '2026-10' }, T)).students.find(s => s.studentId === sid);
  assert.deepStrictEqual([chi.payment.Amount, chi.payment.PaidDate, chi.payment.Month, chi.payment.By], ['110000', '2026-10-31', '2026-10', 'Admin@x.com']);
  // Tháng 11 chưa đóng
  assert.strictEqual(okd(call('getTuition', { classId: cid, month: '2026-11' }, A)).students.find(s => s.studentId === sid).payment, null);
  okd(call('unmarkPaid', { classId: cid, studentId: sid, month: '2026-10' }, A));
  assert.strictEqual(call('unmarkPaid', { classId: cid, studentId: sid, month: '2026-10' }, A).ok, false);
  oct = okd(call('getTuition', { classId: cid, month: '2026-10' }, A));
  assert.strictEqual(oct.students.find(s => s.studentId === sid).payment, null);
});

test('thời khóa biểu', () => {
  let sch = okd(call('getSchedule'));
  assert.deepStrictEqual(sch, { initialized: false, slots: [], sites: [], teacherProfiles: [] });
  const slotA = { id: 'SCH_1', classId: cid, day: weekdayToday, startMin: 1050, endMin: 1140, time: '17:30–19:00', className: 'TOÁN 8', contact: '0971120360', startDate: '2026-11-01', extraField: 'x' };
  const slotB = { id: 'SCH_2', day: weekdayToday, startMin: 450, endMin: 540, time: '07:30–09:00', className: 'Lớp chưa gắn' };
  assert.strictEqual(call('saveSchedule', { slots: [slotA] }).ok, false);
  assert.strictEqual(call('saveSchedule', { slots: [slotA] }, 'tg@x.com').ok, false);
  okd(call('saveSchedule', { slots: [slotA, slotB], sites: [{ id: '21703', name: 'Cơ sở 1', phone: '0971120360' }], teacherProfiles: { 'Thầy Ân': { name: 'Thầy Ân', phone: '0905000111' } } }, A));
  sch = okd(call('getSchedule'));
  assert.strictEqual(sch.initialized, true);
  assert.deepStrictEqual(sch.slots.map(s => [s.id, s.classId, s.startMin, s.contact, s.extraField]), [['SCH_1', cid, '1050', '0971120360', 'x'], ['SCH_2', '', '450', '', '']]);
  assert.deepStrictEqual([sch.sites[0].phone, sch.teacherProfiles[0].name], ['0971120360', 'Thầy Ân']);
});

test('dashboard hôm nay', () => {
  // Chi vắng 2 buổi gần nhất, An có mặt hôm nay
  okd(call('markAttendance', { classId: cid, date: daysAgo(1), records: [{ studentId: sid, present: false }, { studentId: 'STU001', present: true }] }, T));
  okd(call('markAttendance', { classId: cid, date: TODAY, records: [{ studentId: sid, present: false }, { studentId: 'STU001', present: true }] }, T));
  const d = okd(call('getDashboard', {}, A));
  assert.deepStrictEqual([d.today, d.month, d.presentToday, d.totalAttToday], [TODAY, MONTH, 1, 2]);
  assert.deepStrictEqual(
    d.todaySlots.map(s => [s.id, s.classId, s.marked, s.present, s.total, s.enrolled]),
    [['SCH_2', '', false, 0, 0, 0], ['SCH_1', cid, true, 1, 2, 2]] // xếp theo giờ bắt đầu
  );
  const alert = d.absenceAlerts.find(a => a.studentId === sid);
  assert.deepStrictEqual([alert.streak, alert.lastDate, alert.parentPhone, alert.className], [2, TODAY, '0971120360', 'Toán 8']);
  assert.ok(!d.absenceAlerts.some(a => a.studentId === 'STU001'));
  // Tháng này An có mặt ≥ 1 buổi (hôm nay) → phải thu, chưa đóng
  assert.ok(d.tuitionMonth.due >= 120000 && d.tuitionMonth.unpaidCount >= 1, JSON.stringify(d.tuitionMonth));
  okd(call('markPaid', { classId: cid, studentId: 'STU001', month: MONTH, amount: 50000 }, A));
  const d2 = okd(call('getDashboard', {}, A));
  assert.strictEqual(d2.tuitionMonth.paid, 50000);
  assert.strictEqual(d2.tuitionMonth.unpaidCount, d.tuitionMonth.unpaidCount - 1);
  assert.strictEqual(call('getDashboard', {}, T).ok, false);
});

test('thông tin hệ thống', () => {
  assert.strictEqual(okd(call('getSystemInfo', {}, A)).spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/MOCK/edit');
  assert.strictEqual(call('getSystemInfo', {}, T).ok, false);
});

test('xóa', () => {
  okd(call('deleteStudent', { studentId: 'STU001' }, A));
  assert.strictEqual(okd(call('getClassRoster', { classId: cid }, A)).length, 1);
  okd(call('deleteUser', { targetEmail: 'gv@x.com' }, A));
  assert.strictEqual(sheets.TeacherClasses.d.length, 1);
  assert.strictEqual(call('login', { pin: '1111' }, T).ok, false);
  okd(call('deleteClass', { classId: cid }, A));
  assert.deepStrictEqual(okd(call('getClasses', {}, A)).map(c => c.ClassID), ['CLS001']);
  assert.strictEqual(call('deleteClass', { classId: cid }, A).ok, false);
  okd(call('saveSchedule', { slots: [] }, A));
  const sch = okd(call('getSchedule'));
  assert.deepStrictEqual([sch.initialized, sch.slots.length], [true, 0]); // vẫn initialized: máy khác không đẩy bản cũ lên lại
});

console.log(`✓ ${passed} nhóm kiểm thử code.gs đều đạt`);
