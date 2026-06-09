function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
}

function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyUSD(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function normalizeString(str) {
  return String(str ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function validateCNPJ(cnpj) {
  const digits = String(cnpj).replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (d, n) => {
    let sum = 0, pos = n - 7;
    for (let i = n; i >= 1; i--) {
      sum += Number(d.charAt(n - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(digits, 12) === Number(digits[12]) && calc(digits, 13) === Number(digits[13]);
}

function formatCNPJ(cnpj) {
  const d = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
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

function slugify(str) {
  return normalizeString(str).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
