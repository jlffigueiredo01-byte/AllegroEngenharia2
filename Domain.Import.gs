// Domain.Import.gs — Sprint 0: migração da planilha legada

// ── Nomes das abas ─────────────────────────────────────────────────────────
const IMPORT_FORMULARIO_RAW  = 'IMPORT_FORMULARIO_RAW';
const IMPORT_ORG_PROP_RAW    = 'IMPORT_ORGANIZACAO_PROPOSTAS_RAW';
const IMPORT_LOG_SHEET       = 'IMPORT_LOG';
const COMPANIES_SHEET        = 'COMPANIES';
const CONTACTS_SHEET         = 'CONTACTS';
const OPPORTUNITIES_SHEET    = 'OPPORTUNITIES';
const QUOTE_HEADERS_SHEET    = 'QUOTE_HEADERS';

// ── Colunas das abas de destino ────────────────────────────────────────────
const COMPANIES_COLS     = ['id','name','state','city','client_type','active','normalized_name','legacy_name','import_source','created_at'];
const CONTACTS_COLS      = ['id','company_id','name','phone','email','role','active','import_source','created_at'];
const OPPORTUNITIES_COLS = ['id','company_id','company_name','contact_id','representative','client_type','status','product','max_temp','qty_sensors_xt','qty_sensors_ht','qty_sensors_probe','installation_point','automation_detail','hydro_view','infra_distance','tech_notes','notes','form_date','legacy_quote_number','import_source','created_at'];
const QUOTE_HEADERS_COLS = ['id','legacy_quote_number','legacy_quote_number_final','year','company_id','company_name','opportunity_id','representative','client_type','total_value_brl','status','closing_date','state','notes','import_source','created_at'];
const IMPORT_LOG_COLS    = ['id','timestamp','source','total_rows','imported','skipped','errors','summary'];

// ── Posições de colunas: Formulário ───────────────────────────────────────
const FP = {
  TIMESTAMP: 0, QUOTE: 1, CLIENT: 2, STATE: 3, CITY: 4,
  CONTACT: 5, PHONE: 6, EMAIL: 7, FILLED_BY: 8, NOTES: 9,
  PRODUCT: 10, TEMP: 11, QTY_XT: 12, QTY_HT: 13, QTY_PROBE: 14,
  INSTALL: 15, AUTO_DETAIL: 16, HYDRO_VIEW: 17, INFRA: 18,
  TECH_NOTES: 19, ROLE: 20, CLIENT_TYPE: 21
};

// ── Posições de colunas: Organização de Propostas ─────────────────────────
const OP = {
  YEAR: 0, QUOTE: 1, QUOTE_FINAL: 2, CLIENT: 3, REP: 4,
  CLIENT_TYPE: 5, VALUE: 6, STATUS: 7, CLOSE_DATE: 8, STATE: 9, NOTES: 10
};

const STATUS_MAP = {
  'elaborando proposta': 'Elaborando proposta',
  'proposta enviada':    'Proposta enviada',
  'proposta fechada':    'Proposta fechada',
  'proposta recusada':   'Proposta recusada',
  'cancelada':           'Cancelada',
  'nao elaborada':       'Não elaborada',
  'nao elaborada':       'Não elaborada',
};

const UF_SET = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

// ── Funções auxiliares ─────────────────────────────────────────────────────

function _extractUF(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const up = s.toUpperCase().replace(/[^A-Z\s\-]/g, ' ');
  if (UF_SET.has(up.trim())) return up.trim();
  const m = up.match(/[-\s]([A-Z]{2})(\s*$|\s*[,)])/);
  if (m && UF_SET.has(m[1])) return m[1];
  const tokens = up.split(/\W+/);
  for (const t of tokens) { if (UF_SET.has(t)) return t; }
  return '';
}

function _parseBRL(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/R\$\s*/,'').replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? 0 : n;
}

function _parseBRDate(v) {
  if (!v) return '';
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function _normalizeStatus(s) {
  const k = String(s||'').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'');
  return STATUS_MAP[k] || 'Não elaborada';
}

function _normalizeRep(r) {
  const u = String(r||'').trim().toUpperCase();
  if (!u || u==='INVALIDO' || u==='INVÁLIDO') return '';
  if (u==='ALLEGRO' || u==='ERICK/ALLEGRO') return 'Allegro';
  if (u==='INSIDER') return 'Insider';
  if (u==='GEMA' || u==='GEMA ') return 'Gema';
  if (u==='JONATAN') return 'Jonatan';
  if (u==='JOAO' || u==='JOÃO') return 'João';
  if (u.startsWith('DOMIRO')) return 'Domiro';
  if (u==='ANDERSON') return 'Anderson';
  if (u==='EDVALDO' || u==='EDIVALDO') return 'Edvaldo';
  if (u==='VLADIMIR') return 'Vladimir';
  if (u==='ARAGRICOLA') return 'Aragricola';
  if (u.startsWith('ANTONIO') || u.startsWith('ANTÔNIO') || u.startsWith('REPRESENTANTE ANTONIO')) return 'Antônio';
  return String(r).trim();
}

function _normCompany(name) {
  return String(name||'').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toUpperCase().replace(/[^A-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function _cleanPhone(p) {
  const d = String(p||'').replace(/\D/g,'');
  return (d.length < 6 || /^0+$/.test(d)) ? '' : String(p).trim();
}

function _cleanEmail(e) {
  const s = String(e||'').trim().toLowerCase();
  if (!s || s==='...' || s.startsWith('0000') || !s.includes('@')) return '';
  return s;
}

function _getRawRows(sheetName) {
  const sheet = ss().getSheetByName(sheetName);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  return data.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
}

function _logImport(source, total, imported, skipped, errors, summary) {
  getOrCreateSheet(IMPORT_LOG_SHEET, IMPORT_LOG_COLS)
    .appendRow([generateId('IMP'), nowISO(), source, total, imported, skipped, errors, summary]);
}

function initImportSheets() {
  getOrCreateSheet(COMPANIES_SHEET,     COMPANIES_COLS);
  getOrCreateSheet(CONTACTS_SHEET,      CONTACTS_COLS);
  getOrCreateSheet(OPPORTUNITIES_SHEET, OPPORTUNITIES_COLS);
  getOrCreateSheet(QUOTE_HEADERS_SHEET, QUOTE_HEADERS_COLS);
  getOrCreateSheet(IMPORT_LOG_SHEET,    IMPORT_LOG_COLS);
  getOrCreateSheet(IMPORT_FORMULARIO_RAW, ['(cole os dados do Formulário aqui a partir da linha 2)']);
  getOrCreateSheet(IMPORT_ORG_PROP_RAW,   ['(cole os dados de Organização de Propostas aqui a partir da linha 2)']);
}

// ── Importar Formulário ────────────────────────────────────────────────────

function importFormulario() {
  const rows = _getRawRows(IMPORT_FORMULARIO_RAW);
  if (!rows) throw new Error('Aba ' + IMPORT_FORMULARIO_RAW + ' não encontrada. Execute "Configurar abas" primeiro.');
  if (!rows.length) throw new Error('Aba ' + IMPORT_FORMULARIO_RAW + ' está vazia.');

  getOrCreateSheet(COMPANIES_SHEET,     COMPANIES_COLS);
  getOrCreateSheet(CONTACTS_SHEET,      CONTACTS_COLS);
  getOrCreateSheet(OPPORTUNITIES_SHEET, OPPORTUNITIES_COLS);

  const companyIndex = {};
  sheetToObjects(COMPANIES_SHEET).forEach(c => { companyIndex[c.normalized_name] = c.id; });

  const quoteOppIndex = {};
  let imported = 0, skipped = 0, errors = 0;
  const errList = [];
  const now = nowISO();

  const compSheet = ss().getSheetByName(COMPANIES_SHEET);
  const cntSheet  = ss().getSheetByName(CONTACTS_SHEET);
  const oppSheet  = ss().getSheetByName(OPPORTUNITIES_SHEET);

  rows.forEach(function(row, idx) {
    try {
      const clientName = String(row[FP.CLIENT] || '').trim();
      const quoteNum   = String(row[FP.QUOTE]  || '').trim();
      if (!clientName || clientName.toUpperCase() === 'CANCELADO') { skipped++; return; }

      // Empresa
      const normName   = _normCompany(clientName);
      const state      = _extractUF(String(row[FP.STATE] || ''));
      const city       = String(row[FP.CITY]  || '').trim();
      const clientType = String(row[FP.CLIENT_TYPE] || '').trim();

      let companyId = companyIndex[normName];
      if (!companyId) {
        companyId = generateId('EMP');
        compSheet.appendRow([companyId, clientName, state, city, clientType, 'TRUE', normName, clientName, IMPORT_FORMULARIO_RAW, now]);
        companyIndex[normName] = companyId;
      }

      // Contato
      const contactName = String(row[FP.CONTACT] || '').trim();
      const phone       = _cleanPhone(row[FP.PHONE]);
      const email       = _cleanEmail(row[FP.EMAIL]);
      const role        = String(row[FP.ROLE] || '').trim();
      let contactId = '';
      if (contactName && contactName !== '-') {
        contactId = generateId('CNT');
        cntSheet.appendRow([contactId, companyId, contactName, phone, email, role, 'TRUE', IMPORT_FORMULARIO_RAW, now]);
      }

      // Oportunidade
      const oppId = generateId('OPP');
      const rep   = _normalizeRep(row[FP.FILLED_BY]);
      oppSheet.appendRow([
        oppId, companyId, clientName, contactId, rep, clientType,
        'Lead',
        String(row[FP.PRODUCT]     || '').trim(),
        String(row[FP.TEMP]        || '').trim(),
        String(row[FP.QTY_XT]      || ''),
        String(row[FP.QTY_HT]      || ''),
        String(row[FP.QTY_PROBE]   || ''),
        String(row[FP.INSTALL]     || '').trim(),
        String(row[FP.AUTO_DETAIL] || '').trim(),
        String(row[FP.HYDRO_VIEW]  || '').trim(),
        String(row[FP.INFRA]       || '').trim(),
        String(row[FP.TECH_NOTES]  || '').trim(),
        String(row[FP.NOTES]       || '').trim(),
        String(row[FP.TIMESTAMP]   || ''),
        quoteNum,
        IMPORT_FORMULARIO_RAW,
        now
      ]);

      if (quoteNum) quoteOppIndex[quoteNum] = oppId;
      imported++;
    } catch (e) {
      errors++;
      errList.push('L' + (idx + 2) + ': ' + e.message);
    }
  });

  const summary = 'Formulário: ' + imported + ' importados, ' + skipped + ' ignorados, ' + errors + ' erros.' + (errList.length ? ' Ex: ' + errList[0] : '');
  _logImport(IMPORT_FORMULARIO_RAW, rows.length, imported, skipped, errors, summary);
  appendAuditLog('IMPORT', 'FORMULARIO', IMPORT_FORMULARIO_RAW, summary);
  return { imported: imported, skipped: skipped, errors: errors, summary: summary, quoteOppIndex: quoteOppIndex };
}

// ── Importar Organização de Propostas ─────────────────────────────────────

function importOrganizacaoPropostas(quoteOppIndex) {
  quoteOppIndex = quoteOppIndex || {};
  const rows = _getRawRows(IMPORT_ORG_PROP_RAW);
  if (!rows) throw new Error('Aba ' + IMPORT_ORG_PROP_RAW + ' não encontrada. Execute "Configurar abas" primeiro.');
  if (!rows.length) throw new Error('Aba ' + IMPORT_ORG_PROP_RAW + ' está vazia.');

  getOrCreateSheet(QUOTE_HEADERS_SHEET, QUOTE_HEADERS_COLS);

  const companyIndex = {};
  sheetToObjects(COMPANIES_SHEET).forEach(c => { companyIndex[c.normalized_name] = c.id; });

  const compSheet  = ss().getSheetByName(COMPANIES_SHEET);
  const quotSheet  = ss().getSheetByName(QUOTE_HEADERS_SHEET);

  let imported = 0, skipped = 0, errors = 0;
  const errList = [];
  const now = nowISO();

  rows.forEach(function(row, idx) {
    try {
      const clientName = String(row[OP.CLIENT] || '').trim();
      const quoteNum   = String(row[OP.QUOTE]  || '').trim();
      const status     = _normalizeStatus(row[OP.STATUS]);

      if (!clientName && !quoteNum) { skipped++; return; }
      const normClient = clientName.replace(/^\s|\s$/g,'').toUpperCase();
      if (normClient === 'INVALIDO' || normClient === 'INVÁLIDO') { skipped++; return; }

      const normName  = _normCompany(clientName);
      let companyId   = companyIndex[normName] || '';

      if (!companyId && clientName) {
        companyId = generateId('EMP');
        const state = _extractUF(String(row[OP.STATE] || ''));
        const ctype = String(row[OP.CLIENT_TYPE] || '').trim();
        compSheet.appendRow([companyId, clientName, state, '', ctype, 'TRUE', normName, clientName, IMPORT_ORG_PROP_RAW, now]);
        companyIndex[normName] = companyId;
      }

      const oppId = quoteOppIndex[quoteNum] || '';
      quotSheet.appendRow([
        generateId('QUO'),
        quoteNum,
        String(row[OP.QUOTE_FINAL] || '').trim(),
        String(row[OP.YEAR]        || ''),
        companyId,
        clientName,
        oppId,
        _normalizeRep(row[OP.REP]),
        String(row[OP.CLIENT_TYPE] || '').trim(),
        _parseBRL(row[OP.VALUE]),
        status,
        _parseBRDate(row[OP.CLOSE_DATE]),
        _extractUF(String(row[OP.STATE] || '')),
        String(row[OP.NOTES] || '').trim(),
        IMPORT_ORG_PROP_RAW,
        now
      ]);
      imported++;
    } catch (e) {
      errors++;
      errList.push('L' + (idx + 2) + ': ' + e.message);
    }
  });

  const summary = 'Propostas: ' + imported + ' importadas, ' + skipped + ' ignoradas, ' + errors + ' erros.' + (errList.length ? ' Ex: ' + errList[0] : '');
  _logImport(IMPORT_ORG_PROP_RAW, rows.length, imported, skipped, errors, summary);
  appendAuditLog('IMPORT', 'QUOTE_HEADERS', IMPORT_ORG_PROP_RAW, summary);
  return { imported: imported, skipped: skipped, errors: errors, summary: summary };
}

// ── Importação completa (ambas as fontes) ──────────────────────────────────

function runFullImport() {
  const r1 = importFormulario();
  const r2 = importOrganizacaoPropostas(r1.quoteOppIndex);
  const msg = r1.summary + '\n' + r2.summary;
  appendAuditLog('IMPORT_COMPLETE', 'ALL', 'FULL_IMPORT', msg);
  return { formulario: r1, organizacaoPropostas: r2, message: msg };
}

// ── APIs (chamadas pelo frontend) ──────────────────────────────────────────

function Api_runFullImport() {
  requireRole(['GERAL']);
  return runFullImport();
}

function Api_importFormulario() {
  requireRole(['GERAL']);
  return importFormulario();
}

function Api_importOrganizacaoPropostas() {
  requireRole(['GERAL']);
  return importOrganizacaoPropostas();
}
