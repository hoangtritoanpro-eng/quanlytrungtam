// Các hàm dùng chung cho nhiều trang: thông tin trung tâm, xuất Excel, liên hệ phụ huynh.
import { fmtCurrency, fmtDate } from './api';

export const CENTER = {
  name: 'Trung tâm Nắng Mai',
  address: '28 Nguyễn Hữu Thọ, Tp. Đà Nẵng',
  phone: '0971120360',
};

/** 'yyyy-MM' -> 'MM/yyyy' */
export const fmtMonth = m => {
  const [y, mo] = String(m || '').split('-');
  return y && mo ? `${mo}/${y}` : String(m || '');
};

/**
 * Tải bảng dữ liệu về dạng .csv mở được bằng Excel (có BOM để Excel đọc đúng tiếng Việt).
 * rows: mảng các mảng giá trị, dòng đầu là tiêu đề.
 */
export function downloadCsv(filename, rows) {
  const escape = v => {
    const s = v === null || v === undefined ? '' : String(v);
    // Số bắt đầu bằng 0 (số điện thoại) → ghi dạng ="0905..." để Excel không bỏ số 0 đầu
    if (/^0\d+$/.test(s)) return `"=""${s}"""`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map(r => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Chuẩn hóa số điện thoại Việt Nam chỉ còn chữ số (0905 123 456 -> 0905123456). */
export const cleanPhone = p => String(p || '').replace(/[^\d+]/g, '');

export const zaloLink = p => (cleanPhone(p) ? `https://zalo.me/${cleanPhone(p).replace(/^\+84/, '0')}` : '');
export const telLink = p => (cleanPhone(p) ? `tel:${cleanPhone(p)}` : '');
export const smsLink = (p, body) =>
  cleanPhone(p) ? `sms:${cleanPhone(p)}?body=${encodeURIComponent(body || '')}` : '';

export function absenceMessage({ studentName, className, date }) {
  return (
    `${CENTER.name} xin thông báo: em ${studentName} vắng buổi học lớp ${className} ` +
    `ngày ${fmtDate(date)}. Phụ huynh vui lòng phản hồi giúp trung tâm lý do vắng. ` +
    `Liên hệ: ${CENTER.phone}. Xin cảm ơn!`
  );
}

export function tuitionReminder({ studentName, className, month, amount, sessions }) {
  return (
    `${CENTER.name} xin thông báo học phí tháng ${fmtMonth(month)} của em ${studentName} ` +
    `(lớp ${className}): ${sessions} buổi, tổng ${fmtCurrency(amount)}. ` +
    `Phụ huynh vui lòng hoàn tất học phí giúp trung tâm. Liên hệ: ${CENTER.phone}. Xin cảm ơn!`
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Trình duyệt cũ / không cho phép clipboard: dùng cách dự phòng
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

/** Mở cửa sổ in phiếu thu học phí. */
export function printReceipt({ studentName, className, month, sessions, feePerSession, amount, paidDate, method, note, by }) {
  const w = window.open('', '_blank', 'width=720,height=800');
  if (!w) return false;
  const esc = s =>
    String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const row = (k, v) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`;
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu thu học phí</title>
<style>
  body{font-family:Arial,sans-serif;color:#111;margin:32px}
  .head{display:flex;justify-content:space-between;border-bottom:2px solid #0d9488;padding-bottom:12px}
  h1{font-size:22px;text-align:center;margin:24px 0 4px;color:#0f766e}
  .sub{text-align:center;color:#555;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  td{padding:8px 4px;border-bottom:1px dashed #ccc}
  td:first-child{color:#555;width:40%}
  .total td{font-size:18px;border-bottom:none;padding-top:14px}
  .sign{display:flex;justify-content:space-around;margin-top:48px;text-align:center}
  .sign div{width:40%} .sign small{color:#777}
  @media print{body{margin:16px}}
</style></head><body>
<div class="head"><div><b>${esc(CENTER.name)}</b><br>${esc(CENTER.address)}<br>ĐT: ${esc(CENTER.phone)}</div>
<div style="text-align:right">Ngày thu: <b>${esc(fmtDate(paidDate))}</b></div></div>
<h1>PHIẾU THU HỌC PHÍ</h1><div class="sub">Tháng ${esc(fmtMonth(month))}</div>
<table>
${row('Học sinh', studentName)}
${row('Lớp', className)}
${row('Số buổi đã học', sessions)}
${row('Học phí / buổi', fmtCurrency(feePerSession))}
${row('Hình thức', method || 'Tiền mặt')}
${note ? row('Ghi chú', note) : ''}
<tr class="total"><td>Số tiền đã thu</td><td><b>${esc(fmtCurrency(amount))}</b></td></tr>
</table>
<div class="sign"><div>Người nộp tiền<br><small>(Ký, ghi rõ họ tên)</small></div>
<div>Người thu tiền<br><small>(Ký, ghi rõ họ tên)</small><br><br><br>${esc(by || '')}</div></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
  return true;
}
