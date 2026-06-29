const BASE_URL = import.meta.env.VITE_GAS_URL;

export async function api(action, data = {}, userEmail = '') {
  if (!BASE_URL) throw new Error('VITE_GAS_URL chưa được cấu hình trong file .env');
  const response = await fetch(BASE_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, authEmail: userEmail, email: userEmail, ...data }),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error || 'Lỗi không xác định');
  return json.data;
}

export const fmtCurrency = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export const today = () => new Date().toISOString().slice(0, 10);
