// Giả lập tối thiểu Google Sheets / Apps Script để chạy code.gs trong Node (kiểm thử và chạy thử trên máy).
// Không cần tài khoản Google; dữ liệu nằm trong bộ nhớ.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Giống Sheets thật: ô KHÔNG ở định dạng văn bản sẽ tự đổi kiểu (TRUE -> boolean, ngày -> Date, số -> number)
function coerce(v, fmt) {
  if (fmt === '@' || typeof v !== 'string') return v;
  if (v === 'TRUE') return true;
  if (v === 'FALSE') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

class Sheet {
  constructor(name, rows) {
    this.name = name;
    this.d = rows.map(r => r.slice());
    this.f = {};
  }
  getName() { return this.name; }
  // Dòng cuối cùng CÓ dữ liệu (bỏ qua dòng đã xóa trắng), như Sheets thật
  getLastRow() {
    let n = this.d.length;
    while (n > 0 && this.d[n - 1].every(v => v === '' || v == null)) n--;
    return n;
  }
  getLastColumn() { return this.d.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.d.length, 1), Math.max(this.getLastColumn(), 1)); }
  deleteRow(n) { this.d.splice(n - 1, 1); }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    const range = {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) row.push((s.d[r - 1 + i] || [])[c - 1 + j] ?? '');
          out.push(row);
        }
        return out;
      },
      setNumberFormat(fmt) {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.f[`${r + i}:${c + j}`] = fmt;
        return range;
      },
      setValues(vals) {
        for (let i = 0; i < nr; i++) {
          while (s.d.length < r + i) s.d.push([]);
          for (let j = 0; j < nc; j++) s.d[r - 1 + i][c - 1 + j] = coerce(vals[i][j], s.f[`${r + i}:${c + j}`]);
        }
        return range;
      },
      setValue(v) { return range.setValues([[v]]); },
      clearContent() {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.d[r - 1 + i]) s.d[r - 1 + i][c - 1 + j] = '';
        return range;
      },
    };
    return range;
  }
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Nạp code.gs vào một môi trường Apps Script giả.
 * initialSheets: { TênSheet: [[tiêu đề...], [dòng...], ...] }
 * Trả về { ctx, sheets, call(action, data, userEmail) } — call gửi payload giống hệt frontend.
 */
function createGas(initialSheets = {}, codePath = path.join(__dirname, '..', 'code.gs')) {
  const sheets = {};
  Object.keys(initialSheets).forEach(n => (sheets[n] = new Sheet(n, initialSheets[n])));
  const props = {};
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = new Sheet(n, [])),
        getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
        getUrl: () => 'https://docs.google.com/spreadsheets/d/MOCK/edit',
        getName: () => 'Sheet giả lập',
      }),
      getUi: () => { throw new Error('no ui'); },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => s }) },
    Utilities: { formatDate: d => ymd(d) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    Logger: { log() {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: 'code.gs' });

  const call = (action, data = {}, user = '') =>
    JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, authEmail: user, email: user, ...data }) } }));

  return { ctx, sheets, call };
}

module.exports = { createGas, ymd };
