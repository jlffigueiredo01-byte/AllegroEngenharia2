function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
}

function generateId(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prefix ? `${prefix}-${ts}${rand}` : `${ts}${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function safeNumber(value, fallback) {
  if (fallback === undefined) fallback = 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? fallback : n;
}
