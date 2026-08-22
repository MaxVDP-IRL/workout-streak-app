// Pure functions only. No DOM, no localStorage, no Date.now() except as default args.
export const DAY_BOUNDARY_HOUR = 3;

export function effectiveDate(now = new Date()) {
  const shifted = new Date(now.getTime() - DAY_BOUNDARY_HOUR * 3600 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
