// Máy chủ Apps Script giả lập để chạy web trên máy mà không đụng tới Google Sheet thật.
//   npm run mock-gas                 (cửa sổ 1)
//   VITE_GAS_URL=http://localhost:4300 npm run dev   (cửa sổ 2)
// Đăng nhập: admin@example.com / PIN 1234 (hoặc giaovien@example.com / 1111). Dữ liệu mất khi tắt máy chủ.
const http = require('http');
const { createGas, ymd } = require('./gas-mock.cjs');

const PORT = Number(process.env.PORT) || 4300;
const today = new Date();
const daysAgo = n => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const weekday = (() => {
  const d = today.getDay();
  return d === 0 ? 8 : d + 1;
})();

const { ctx, sheets } = createGas({
  Users: [
    ['Email', 'Name', 'Role', 'Pin', 'Active'],
    ['admin@example.com', 'Quản trị', 'ADMIN', '1234', 'TRUE'],
    ['giaovien@example.com', 'Cô Lan', 'TEACHER', '1111', 'TRUE'],
  ],
  Classes: [
    ['ClassID', 'ClassName', 'Subject', 'Grade', 'FeePerSession', 'StartDate', 'Status'],
    ['CLS001', 'Toán 9A', 'Toán', '9', '150000', '2026-09-01', 'ACTIVE'],
    ['CLS002', 'Toán 8B', 'Toán', '8', '120000', '2026-09-01', 'ACTIVE'],
  ],
  Students: [
    ['StudentID', 'FullName', 'SchoolClass', 'ParentName', 'ParentPhone', 'ParentEmail', 'Note', 'Status'],
    ['STU001', 'Nguyễn Văn An', '9/1', 'Nguyễn Văn Bình', '0905000111', '', '', 'ACTIVE'],
    ['STU002', 'Trần Thị Chi', '9/2', 'Trần Văn Dũng', '0905000222', '', '', 'ACTIVE'],
    ['STU003', 'Lê Minh Đức', '8/1', 'Lê Thị Hoa', '0905000333', '', '', 'ACTIVE'],
  ],
  Enrollments: [
    ['StudentID', 'ClassID', 'EnrollDate', 'Status'],
    ['STU001', 'CLS001', '2026-09-01', 'ACTIVE'],
    ['STU002', 'CLS001', '2026-09-01', 'ACTIVE'],
    ['STU003', 'CLS002', '2026-09-01', 'ACTIVE'],
  ],
  TeacherClasses: [['TeacherEmail', 'ClassID'], ['giaovien@example.com', 'CLS001']],
  Attendance: [
    ['Date', 'ClassID', 'StudentID', 'Present', 'Note', 'By'],
    [daysAgo(7), 'CLS001', 'STU001', 'TRUE', '', 'admin@example.com'],
    [daysAgo(7), 'CLS001', 'STU002', 'FALSE', '', 'admin@example.com'],
    [daysAgo(3), 'CLS001', 'STU001', 'TRUE', '', 'admin@example.com'],
    [daysAgo(3), 'CLS001', 'STU002', 'FALSE', '', 'admin@example.com'],
  ],
  ScheduleSlots: [
    ['id', 'classId', 'day', 'weekday', 'startMin', 'endMin', 'time', 'session', 'className', 'subject', 'grade', 'teacher', 'siteId', 'siteName', 'modeKey', 'modeLabel', 'room', 'color'],
    ['SCH_A', 'CLS001', String(weekday), '', '450', '540', '07:30–09:00', 'morning', 'Toán 9A', 'Toán', 'Khối 9', 'Cô Lan', '21703', 'Cơ sở 1', 'offline', 'Trực tiếp', 'Phòng 1', 'navy'],
    ['SCH_B', 'CLS002', String(weekday), '', '1050', '1140', '17:30–19:00', 'evening', 'Toán 8B', 'Toán', 'Khối 8', 'Thầy Ân', '21703', 'Cơ sở 1', 'offline', 'Trực tiếp', 'Phòng 2', 'green'],
  ],
  ScheduleSites: [['id', 'name', 'address', 'phone', 'mapUrl', 'note'], ['21703', 'Cơ sở 1', '28 Nguyễn Hữu Thọ, Tp. Đà Nẵng', '0971120360', '', '']],
});
ctx.PropertiesService.getScriptProperties().setProperty('SCHEDULE_INITIALIZED', 'TRUE');

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    if (req.url === '/dump') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, s]) => [k, s.d]))));
    }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (!body) return res.end('Máy chủ Apps Script giả lập đang chạy');
      const out = ctx.doPost({ postData: { contents: body } });
      let action = '?';
      try {
        action = JSON.parse(body).action;
      } catch {}
      console.log(`${action} -> ${out.slice(0, 100)}`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(out);
    });
  })
  .listen(PORT, () => console.log(`Apps Script giả lập: http://localhost:${PORT}`));
