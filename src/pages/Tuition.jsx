import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, fmtCurrency, fmtDate, today, thisMonth } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import {
  downloadCsv,
  fmtMonth,
  printReceipt,
  tuitionReminder,
  copyText,
  zaloLink,
} from '../helpers';

const METHODS = ['Tiền mặt', 'Chuyển khoản'];

export default function Tuition() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [params, setParams] = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(params.get('classId') || '');
  const [month, setMonth] = useState(params.get('month') || thisMonth());
  const [filter, setFilter] = useState('all'); // all | unpaid | paid
  const [tuitionData, setTuitionData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [payFor, setPayFor] = useState(null); // dòng học sinh đang thu tiền
  const [payForm, setPayForm] = useState({ amount: '', paidDate: today(), method: METHODS[0], note: '', print: true });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api('getClasses', {}, user.email)
      .then(d => {
        setClasses(d || []);
        if (!selectedClass && d?.length === 1) setSelectedClass(d[0].ClassID);
      })
      .catch(e => toast(e.message, 'error'));
  }, []);

  useEffect(() => {
    // Giữ lớp/tháng trên thanh địa chỉ để tải lại trang hoặc gửi link vẫn đúng chỗ
    const next = {};
    if (selectedClass) next.classId = selectedClass;
    if (month) next.month = month;
    setParams(next, { replace: true });
    if (selectedClass && month) load();
    else setTuitionData(null);
  }, [selectedClass, month]);

  async function load() {
    setLoading(true);
    try {
      setTuitionData(await api('getTuition', { classId: selectedClass, month }, user.email));
    } catch (err) {
      toast(err.message, 'error');
      setTuitionData(null);
    } finally {
      setLoading(false);
    }
  }

  const rows = tuitionData?.students || [];
  const className = tuitionData?.classInfo?.ClassName || '';
  const statusOf = r => (r.payment ? 'paid' : Number(r.tuition) > 0 ? 'unpaid' : 'none');

  const summary = useMemo(() => {
    const due = rows.reduce((s, r) => s + Number(r.tuition || 0), 0);
    const paid = rows.reduce((s, r) => s + Number(r.payment?.Amount || 0), 0);
    const unpaidRows = rows.filter(r => statusOf(r) === 'unpaid');
    return {
      due,
      paid,
      owed: unpaidRows.reduce((s, r) => s + Number(r.tuition || 0), 0),
      unpaidCount: unpaidRows.length,
      paidCount: rows.filter(r => r.payment).length,
    };
  }, [rows]);

  const visible = rows.filter(r => filter === 'all' || statusOf(r) === filter);

  function openPay(r) {
    setPayFor(r);
    setPayForm({ amount: String(r.tuition || 0), paidDate: today(), method: METHODS[0], note: '', print: true });
  }

  async function savePayment() {
    const amount = Number(payForm.amount);
    if (!isFinite(amount) || amount < 0) {
      toast('Số tiền không hợp lệ', 'warning');
      return;
    }
    setPaying(true);
    try {
      const rec = await api(
        'markPaid',
        {
          classId: selectedClass,
          studentId: payFor.studentId,
          month,
          amount,
          paidDate: payForm.paidDate,
          method: payForm.method,
          note: payForm.note,
        },
        user.email
      );
      setTuitionData(d => ({
        ...d,
        students: d.students.map(s => (s.studentId === payFor.studentId ? { ...s, payment: rec } : s)),
      }));
      toast(`Đã thu học phí của ${payFor.fullName}`);
      if (payForm.print) receipt({ ...payFor, payment: rec });
      setPayFor(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPaying(false);
    }
  }

  async function cancelPayment(r) {
    if (!confirm(`Hủy phiếu thu tháng ${fmtMonth(month)} của ${r.fullName}?`)) return;
    try {
      await api('unmarkPaid', { classId: selectedClass, studentId: r.studentId, month }, user.email);
      setTuitionData(d => ({
        ...d,
        students: d.students.map(s => (s.studentId === r.studentId ? { ...s, payment: null } : s)),
      }));
      toast('Đã hủy phiếu thu');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function receipt(r) {
    const ok = printReceipt({
      studentName: r.fullName,
      className,
      month,
      sessions: r.sessionsAttended,
      feePerSession: r.feePerSession,
      amount: r.payment?.Amount ?? r.tuition,
      paidDate: r.payment?.PaidDate || today(),
      method: r.payment?.Method,
      note: r.payment?.Note,
      by: user.name,
    });
    if (!ok) toast('Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên (pop-up).', 'warning');
  }

  async function remind(r) {
    const text = tuitionReminder({
      studentName: r.fullName,
      className,
      month,
      amount: r.tuition,
      sessions: r.sessionsAttended,
    });
    if (await copyText(text)) toast('Đã chép tin nhắc học phí. Dán vào Zalo/SMS để gửi phụ huynh.');
    else toast('Không chép được, hãy thử lại', 'error');
  }

  function exportExcel() {
    const header = ['STT', 'Học sinh', 'Phụ huynh', 'SĐT', 'Buổi học', 'Vắng', 'Học phí/buổi', 'Thành tiền', 'Trạng thái', 'Đã thu', 'Ngày thu', 'Hình thức', 'Ghi chú'];
    const body = rows.map((r, i) => [
      i + 1,
      r.fullName,
      r.parentName,
      r.parentPhone,
      r.sessionsAttended,
      r.sessionsAbsent,
      r.feePerSession,
      r.tuition,
      { paid: 'Đã đóng', unpaid: 'Chưa đóng', none: 'Không phát sinh' }[statusOf(r)],
      r.payment?.Amount || '',
      r.payment ? fmtDate(r.payment.PaidDate) : '',
      r.payment?.Method || '',
      r.payment?.Note || '',
    ]);
    downloadCsv(`hoc-phi_${className}_${month}`, [header, ...body]);
  }

  const badge = (bg, color, text) => (
    <span style={{ background: bg, color, padding: '2px 10px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">
          💰 <span>Học phí</span>
        </h1>
        <p className="page-sub">Học phí theo tháng = số buổi có mặt × học phí mỗi buổi</p>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="form-row-3">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Lớp học</label>
              <select className="form-select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">-- Chọn lớp --</option>
                {classes.map(c => (
                  <option key={c.ClassID} value={c.ClassID}>
                    {c.ClassName} — {fmtCurrency(c.FeePerSession)}/buổi
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tháng</label>
              <input className="form-control" type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hiển thị</label>
              <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">Tất cả học sinh</option>
                <option value="unpaid">Chưa đóng</option>
                <option value="paid">Đã đóng</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải...</span>
        </div>
      )}

      {tuitionData && !loading && (
        <>
          <div className="stats-grid" style={{ marginTop: '1.5rem' }}>
            <div className="stat-card">
              <span className="stat-icon">🧾</span>
              <div className="stat-value stat-value-sm">{fmtCurrency(summary.due)}</div>
              <div className="stat-label">Phải thu tháng {fmtMonth(month)}</div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">✅</span>
              <div className="stat-value stat-value-sm">{fmtCurrency(summary.paid)}</div>
              <div className="stat-label">Đã thu ({summary.paidCount} HS)</div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⏳</span>
              <div className="stat-value stat-value-sm">{fmtCurrency(summary.owed)}</div>
              <div className="stat-label">Còn nợ ({summary.unpaidCount} HS)</div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">💵</span>
              <div className="stat-value stat-value-sm">{fmtCurrency(tuitionData.classInfo?.FeePerSession)}</div>
              <div className="stat-label">Học phí / buổi</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                💰 {className} — tháng {fmtMonth(month)}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={exportExcel} disabled={rows.length === 0}>
                📥 Xuất Excel
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Học sinh</th>
                    <th style={{ textAlign: 'center' }}>Buổi học</th>
                    <th style={{ textAlign: 'center' }}>Vắng</th>
                    <th style={{ textAlign: 'right' }}>Thành tiền</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                        {rows.length === 0 ? 'Lớp chưa có học sinh' : 'Không có học sinh nào khớp bộ lọc'}
                      </td>
                    </tr>
                  )}
                  {visible.map((r, i) => {
                    const st = statusOf(r);
                    return (
                      <tr key={r.studentId}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{r.fullName}</strong>
                          {r.parentPhone && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {r.parentName ? `${r.parentName} · ` : ''}
                              {r.parentPhone}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>{r.sessionsAttended}</td>
                        <td style={{ textAlign: 'center' }}>
                          {Number(r.sessionsAbsent) > 0 ? badge('#fee2e2', '#dc2626', r.sessionsAbsent) : '0'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{fmtCurrency(r.tuition)}</td>
                        <td>
                          {st === 'paid' && (
                            <div>
                              {badge('#dcfce7', '#15803d', `Đã đóng ${fmtDate(r.payment.PaidDate)}`)}
                              {Number(r.payment.Amount) !== Number(r.tuition) && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  Thu {fmtCurrency(r.payment.Amount)}
                                </div>
                              )}
                            </div>
                          )}
                          {st === 'unpaid' && badge('#fef3c7', '#b45309', 'Chưa đóng')}
                          {st === 'none' && <span style={{ color: 'var(--text-light)' }}>Không phát sinh</span>}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {st === 'paid' && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => receipt(r)} title="In phiếu thu">
                                🖨️
                              </button>
                              {isAdmin && (
                                <button className="btn btn-ghost btn-sm" onClick={() => cancelPayment(r)} title="Hủy phiếu thu">
                                  ↩️
                                </button>
                              )}
                            </>
                          )}
                          {st === 'unpaid' && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => remind(r)} title="Chép tin nhắc học phí">
                                📋
                              </button>
                              {zaloLink(r.parentPhone) && (
                                <a className="btn btn-ghost btn-sm" href={zaloLink(r.parentPhone)} target="_blank" rel="noreferrer" title="Mở Zalo phụ huynh">
                                  💬
                                </a>
                              )}
                              {isAdmin && (
                                <button className="btn btn-primary btn-sm" onClick={() => openPay(r)}>
                                  Thu tiền
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-light)', fontWeight: 700 }}>
                    <td colSpan={4} style={{ textAlign: 'right', padding: '1rem' }}>
                      Tổng phải thu:
                    </td>
                    <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--primary)', fontSize: '1.05rem' }}>
                      {fmtCurrency(summary.due)}
                    </td>
                    <td colSpan={2} style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                      Đã thu {fmtCurrency(summary.paid)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">💰</div>
          <h3>Chọn lớp và tháng để xem học phí</h3>
        </div>
      )}

      <Modal
        open={!!payFor}
        onClose={() => !paying && setPayFor(null)}
        title={`💵 Thu học phí — ${payFor?.fullName || ''}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPayFor(null)} disabled={paying}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={savePayment} disabled={paying}>
              {paying ? 'Đang lưu...' : '💾 Xác nhận đã thu'}
            </button>
          </>
        }
      >
        {payFor && (
          <>
            <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
              {className} · tháng {fmtMonth(month)} · {payFor.sessionsAttended} buổi × {fmtCurrency(payFor.feePerSession)} ={' '}
              <strong style={{ color: 'var(--primary)' }}>{fmtCurrency(payFor.tuition)}</strong>
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Số tiền thu (đ)</label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  step="1000"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày thu</label>
                <input
                  className="form-control"
                  type="date"
                  value={payForm.paidDate}
                  onChange={e => setPayForm(f => ({ ...f, paidDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Hình thức</label>
                <select className="form-select" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                  {METHODS.map(m => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <input
                  className="form-control"
                  placeholder="VD: giảm 10% anh em ruột"
                  value={payForm.note}
                  onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={payForm.print} onChange={e => setPayForm(f => ({ ...f, print: e.target.checked }))} />
              In phiếu thu sau khi lưu
            </label>
          </>
        )}
      </Modal>
    </div>
  );
}
