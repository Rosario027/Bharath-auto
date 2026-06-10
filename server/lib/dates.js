// Local-date helpers shared by attendance/staff modules so the same
// "today" is used everywhere (server-local time, yyyy-mm-dd).
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
}

export default localDate;
