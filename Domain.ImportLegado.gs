// =============================================================================
// Domain.ImportLegado.gs — SGA
// Importação RUN-ONCE da base histórica (2022–2026) a partir das abas:
//   IMPORT_ORGANIZACAO_PROPOSTAS_RAW  (linha 1 = instrução; linha 2 = headers)
//   IMPORT_FORMULARIO_RAW             (idem)
//
// COMO USAR: no editor do Apps Script, selecione a função
// `importarBaseLegada` e clique em Executar. O relatório sai no Logger
// (Ctrl+Enter) e também é retornado.
//
// IDEMPOTENTE: rodar duas vezes não duplica nada — empresas deduplicam por
// nome normalizado e propostas pelo número legado. Linhas importadas levam
// import_source / import_origem = 'IMPORT_LEGADO'.
//
// LIMITAÇÕES ACEITAS (combinadas com João):
// - Propostas históricas não têm itens, pricing nem oportunidade vinculada.
// - 'Não Elaborada' vira CANCELADA com motivo legado (não polui o pipeline).
// - 'Elaborando Proposta' (2) vira PROPOSTA_GERADA (pipeline real).
// - Propostas legadas ENVIADA ficam imutáveis (trava padrão) — desejado.
// =============================================================================

var IMP_SHEET_ORG  = 'IMPORT_ORGANIZACAO_PROPOSTAS_RAW';
var IMP_SHEET_FORM = 'IMPORT_FORMULARIO_RAW';
var IMP_TAG        = 'IMPORT_LEGADO';

/** Ponto de entrada — executar no editor. */
function importarBaseLegada() {
  var rel = { empresas_criadas: 0, empresas_reusadas: 0, propostas_criadas: 0,
              propostas_puladas: 0, contatos_criados: 0, linhas_ignoradas: 0, avisos: [] };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var mapaEmpresas = _impCarregarEmpresasExistentes();
    _impImportarOrganizacao(mapaEmpresas, rel);
    _impImportarFormulario(mapaEmpresas, rel);
  } finally {
    _impFlushEmpresas();
    _impFlushEnriquecimento();
    _impFlushCounters();
    lock.releaseLock();
  }

  var resumo = 'IMPORTAÇÃO CONCLUÍDA\n' +
    '• Empresas criadas: ' + rel.empresas_criadas + ' (reusadas: ' + rel.empresas_reusadas + ')\n' +
    '• Propostas históricas criadas: ' + rel.propostas_criadas + ' (já existiam: ' + rel.propostas_puladas + ')\n' +
    '• Contatos criados: ' + rel.contatos_criados + '\n' +
    '• Linhas ignoradas (vazias/inválidas): ' + rel.linhas_ignoradas +
    (rel.avisos.length ? '\n• Avisos:\n  - ' + rel.avisos.join('\n  - ') : '');
  Logger.log(resumo);
  return rel;
}

/* ───────────────────────── helpers ───────────────────────── */

function _impNorm(nome) {
  return String(nome || '').toUpperCase()
    .replace(/[ÁÀÂÃ]/g, 'A').replace(/[ÉÈÊ]/g, 'E').replace(/[ÍÌÎ]/g, 'I')
    .replace(/[ÓÒÔÕ]/g, 'O').replace(/[ÚÙÛ]/g, 'U').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function _impCarregarEmpresasExistentes() {
  var mapa = {};
  var rows = sheetToObjects(COMPANIES_SHEET);
  for (var i = 0; i < rows.length; i++) {
    var key = rows[i].normalized_name ? String(rows[i].normalized_name) : _impNorm(rows[i].name);
    if (key) mapa[key] = rows[i].id;
  }
  return mapa;
}

var _impCounters = null;

/** Contadores em memória durante a importação; persistidos uma vez no fim. */
function _impNextId(counterKey, prefix) {
  if (!_impCounters) _impCounters = {};
  if (_impCounters[counterKey] === undefined) {
    _impCounters[counterKey] = parseInt(getConfigValue(counterKey) || '0', 10);
  }
  _impCounters[counterKey]++;
  return prefix + ('00000' + _impCounters[counterKey]).slice(-5);
}

function _impFlushCounters() {
  if (!_impCounters) return;
  for (var k in _impCounters) setConfigValue(k, String(_impCounters[k]));
  _impCounters = null;
}

/** Cria empresa (ou devolve a existente). UF inválida fica vazia. */
var _impEmpresaBuffer = [];
var _impEmpresaHeaders = null;
var _impEmpresaNovas = {}; // id -> índice no buffer (p/ enriquecer em memória)

function _impEmpresa(mapa, nome, uf, cidade, clientType, rel) {
  var key = _impNorm(nome);
  if (!key) return null;
  if (mapa[key]) { rel.empresas_reusadas++; return mapa[key]; }

  var UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO PY';
  var ufLimpa = String(uf || '').trim().toUpperCase();
  if (UFS.indexOf(ufLimpa) === -1 || ufLimpa.length !== 2) ufLimpa = '';

  if (!_impEmpresaHeaders) {
    var sh = getOrCreateSheet(COMPANIES_SHEET, COMPANIES_HEADERS);
    _impEmpresaHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  var id = _impNextId('COMPANY_COUNTER', 'EMP-');
  var vals = {
    id: id, name: String(nome).trim(), state: ufLimpa, city: String(cidade || '').trim(),
    client_type: clientType || '', active: 'TRUE', normalized_name: key,
    legacy_name: String(nome).trim(), import_source: IMP_TAG, created_at: nowISO()
  };
  var row = [];
  for (var h = 0; h < _impEmpresaHeaders.length; h++) row.push(vals[_impEmpresaHeaders[h]] !== undefined ? vals[_impEmpresaHeaders[h]] : '');
  _impEmpresaNovas[id] = _impEmpresaBuffer.length;
  _impEmpresaBuffer.push(row);
  mapa[key] = id;
  rel.empresas_criadas++;
  return id;
}

function _impFlushEmpresas() {
  if (!_impEmpresaBuffer.length) return;
  var sh = getOrCreateSheet(COMPANIES_SHEET, COMPANIES_HEADERS);
  sh.getRange(sh.getLastRow() + 1, 1, _impEmpresaBuffer.length, _impEmpresaHeaders.length)
    .setValues(_impEmpresaBuffer);
  _impEmpresaBuffer = [];
  _impEmpresaNovas = {};
}

/**
 * Valor monetário em qualquer formato que o Sheets entregue:
 * - número JS (célula convertida): usa direto — NUNCA reprocessar;
 * - "R$ 302.995,50" (string pt-BR): limpa milhar '.' e troca ',' por '.';
 * - "302995.5" (string en): parseFloat direto.
 */
function _impParseBRL(txt) {
  if (typeof txt === 'number') return isNaN(txt) ? 0 : txt;
  var s = String(txt || '').trim();
  if (!s) return 0;
  var limpo = s.replace(/[^0-9.,-]/g, '');
  var n;
  if (limpo.indexOf(',') !== -1) {
    n = parseFloat(limpo.replace(/\./g, '').replace(',', '.')); // pt-BR
  } else {
    n = parseFloat(limpo); // en ou inteiro puro
  }
  return isNaN(n) ? 0 : n;
}

/** "dd/mm/yyyy" → "yyyy-mm-dd" ('' se inválida) */
function _impParseDMY(txt) {
  var m = String(txt || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/** Número legado ddmmyyS… → "20yy-mm-dd" (fallback: ano-06-30) */
function _impDataDoNumero(numero, ano) {
  var s = String(numero || '').trim();
  var m = s.match(/^(\d{2})(\d{2})(\d{2})\d/);
  if (m) {
    var dd = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return '20' + m[3] + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
    }
  }
  return (String(ano || '').trim() || '2024') + '-06-30';
}

/* ─────────────── 1) ORGANIZAÇÃO → empresas + propostas ─────────────── */

var _IMP_STATUS_MAP = {
  'Proposta Fechada':    'FECHADA',
  'Proposta Recusada':   'RECUSADA',
  'Proposta Enviada':    'ENVIADA',
  'Cancelada':           'CANCELADA',
  'Não Elaborada':       'CANCELADA',
  'Elaborando Proposta': 'PROPOSTA_GERADA'
};

function _impImportarOrganizacao(mapaEmpresas, rel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(IMP_SHEET_ORG);
  if (!sh) { rel.avisos.push('Aba ' + IMP_SHEET_ORG + ' não encontrada — etapa pulada.'); return; }

  var values = sh.getDataRange().getValues();
  if (values.length < 3) { rel.avisos.push(IMP_SHEET_ORG + ' sem dados.'); return; }
  // linha 0 = instrução; linha 1 = headers: ano, numero, fechada, cliente, mercado, valor, status, data fechamento, uf

  // dedupe por número legado
  var existentes = {};
  var props = sheetToObjects(PROPOSALS_SHEET);
  for (var e = 0; e < props.length; e++) existentes[String(props[e].number).trim()] = true;

  var shProp = getOrCreateSheet(PROPOSALS_SHEET, PROPOSALS_LEGACY_HEADERS);
  var headers = shProp.getRange(1, 1, 1, shProp.getLastColumn()).getValues()[0];
  var buffer = [];

  for (var r = 2; r < values.length; r++) {
    var v = values[r];
    var cliente = String(v[3] || '').trim();
    var numero  = String(v[1] || '').trim();
    if (!cliente && !numero) { rel.linhas_ignoradas++; continue; }
    if (!cliente) { rel.linhas_ignoradas++; continue; }

    var statusLegado = String(v[6] || '').trim();
    var status = _IMP_STATUS_MAP[statusLegado] || 'CANCELADA';
    var mercado = String(v[4] || '');
    var tipo = /inorg|concret/i.test(mercado) ? 'CONCRETO' : 'ORGANICO';
    var uf = String(v[8] || '').trim().toUpperCase();

    var companyId = _impEmpresa(mapaEmpresas, cliente, uf, '', tipo, rel);
    if (!companyId) { rel.linhas_ignoradas++; continue; }
    if (!numero) { rel.linhas_ignoradas++; rel.avisos.push('Linha ' + (r + 1) + ' (' + cliente + ') sem número — pulada.'); continue; }
    if (existentes[numero]) { rel.propostas_puladas++; continue; }

    var createdAt = _impDataDoNumero(numero, v[0]);
    var closedAt  = _impParseDMY(v[7]);
    if (!closedAt && (status === 'FECHADA' || status === 'RECUSADA')) closedAt = createdAt;

    var vals = {
      id: _impNextId('PROPOSAL_COUNTER', 'PROP-'),
      number: numero,
      date: createdAt,
      type: tipo,
      client_id: companyId,
      client_name: cliente,
      status: status,
      total_value: _impParseBRL(v[5]),
      revision_num: 'R0',
      motivo_perda: statusLegado === 'Não Elaborada' ? 'Não elaborada (registro legado)' : '',
      sent_at: (status === 'ENVIADA' || status === 'FECHADA' || status === 'RECUSADA') ? createdAt : '',
      closed_at: (status === 'FECHADA' || status === 'RECUSADA' || status === 'CANCELADA') ? (closedAt || '') : '',
      import_origem: IMP_TAG,
      created_by: 'IMPORT',
      created_at: createdAt,
      updated_at: closedAt || createdAt
    };
    var row = [];
    for (var h = 0; h < headers.length; h++) row.push(vals[headers[h]] !== undefined ? vals[headers[h]] : '');
    buffer.push(row);
    existentes[numero] = true;
    rel.propostas_criadas++;
  }

  if (buffer.length) {
    shProp.getRange(shProp.getLastRow() + 1, 1, buffer.length, headers.length).setValues(buffer);
  }
}

/* ─────────────── 2) FORMULÁRIO → empresas + contatos ─────────────── */

function _impImportarFormulario(mapaEmpresas, rel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(IMP_SHEET_FORM);
  if (!sh) { rel.avisos.push('Aba ' + IMP_SHEET_FORM + ' não encontrada — etapa pulada.'); return; }

  var values = sh.getDataRange().getValues();
  if (values.length < 3) { rel.avisos.push(IMP_SHEET_FORM + ' sem dados.'); return; }
  // headers (linha 1): Carimbo, Nº, Cliente, Estado, Cidade, Responsável, Telefone, E-mail, …

  // dedupe de contatos por (company_id + nome)
  var contatosExistentes = {};
  var cts = sheetToObjects(CONTACTS_SHEET);
  for (var c = 0; c < cts.length; c++) {
    contatosExistentes[String(cts[c].company_id) + '|' + _impNorm(cts[c].name)] = true;
  }

  var shCt = getOrCreateSheet(CONTACTS_SHEET, CONTACTS_HEADERS);
  var buffer = [];

  for (var r = 2; r < values.length; r++) {
    var v = values[r];
    var cliente = String(v[2] || '').trim();
    if (!cliente) { rel.linhas_ignoradas++; continue; }

    // "Minas Gerais - MG" → MG; lixo ('Outro…', 'CANCELADO') → vazio
    var estadoRaw = String(v[3] || '').trim();
    var uf = '';
    var mUf = estadoRaw.match(/-\s*([A-Z]{2})\s*$/);
    if (mUf) uf = mUf[1];

    var cidade = String(v[4] || '').trim();
    var companyId = _impEmpresa(mapaEmpresas, cliente, uf, cidade, '', rel);
    if (!companyId) { rel.linhas_ignoradas++; continue; }

    // cidade/UF podem enriquecer empresa criada antes pela ORGANIZACAO (sem cidade)
    _impEnriquecerEmpresa(companyId, uf, cidade);

    var nomeResp = String(v[5] || '').trim();
    if (!nomeResp) continue;
    var key = companyId + '|' + _impNorm(nomeResp);
    if (contatosExistentes[key]) continue;

    buffer.push([
      _impNextId('CONTACT_COUNTER', 'CTT-'),
      companyId,
      nomeResp,
      String(v[6] || '').trim(),  // telefone (cru, pode ter 2 números)
      String(v[7] || '').trim(),  // e-mail (cru)
      '',                         // role
      'TRUE',
      IMP_TAG,
      nowISO()
    ]);
    contatosExistentes[key] = true;
    rel.contatos_criados++;
  }

  if (buffer.length) {
    shCt.getRange(shCt.getLastRow() + 1, 1, buffer.length, CONTACTS_HEADERS.length).setValues(buffer);
  }
}

var _impCompanySheetCache = null; // { values, idCol, stCol, ciCol, dirty: [] }

/** Preenche state/city apenas se vazios — em memória; escrita em lote no fim. */
function _impEnriquecerEmpresa(companyId, uf, cidade) {
  if (!uf && !cidade) return;
  // empresa criada NESTA importação: edita o buffer, sem tocar a planilha
  if (_impEmpresaNovas[companyId] !== undefined && _impEmpresaHeaders) {
    var row = _impEmpresaBuffer[_impEmpresaNovas[companyId]];
    var st = _impEmpresaHeaders.indexOf('state'), ci = _impEmpresaHeaders.indexOf('city');
    if (uf && st > -1 && !String(row[st] || '').trim()) row[st] = uf;
    if (cidade && ci > -1 && !String(row[ci] || '').trim()) row[ci] = cidade;
    return;
  }
  // empresa pré-existente: cache único da aba + marcação de células sujas
  try {
    if (!_impCompanySheetCache) {
      var sh = getOrCreateSheet(COMPANIES_SHEET, COMPANIES_HEADERS);
      var values = sh.getDataRange().getValues();
      var headers = values[0];
      _impCompanySheetCache = {
        sh: sh, values: values,
        idCol: headers.indexOf('id'), stCol: headers.indexOf('state'), ciCol: headers.indexOf('city'),
        rowById: {}, dirty: []
      };
      for (var r = 1; r < values.length; r++) {
        _impCompanySheetCache.rowById[String(values[r][_impCompanySheetCache.idCol])] = r;
      }
    }
    var c = _impCompanySheetCache;
    var ri = c.rowById[String(companyId)];
    if (ri === undefined) return;
    if (uf && c.stCol > -1 && !String(c.values[ri][c.stCol] || '').trim()) {
      c.values[ri][c.stCol] = uf;
      c.dirty.push({ r: ri + 1, col: c.stCol + 1, v: uf });
    }
    if (cidade && c.ciCol > -1 && !String(c.values[ri][c.ciCol] || '').trim()) {
      c.values[ri][c.ciCol] = cidade;
      c.dirty.push({ r: ri + 1, col: c.ciCol + 1, v: cidade });
    }
  } catch (e) { /* best-effort */ }
}

function _impFlushEnriquecimento() {
  if (!_impCompanySheetCache || !_impCompanySheetCache.dirty.length) return;
  var c = _impCompanySheetCache;
  for (var i = 0; i < c.dirty.length; i++) {
    c.sh.getRange(c.dirty[i].r, c.dirty[i].col).setValue(c.dirty[i].v);
  }
  _impCompanySheetCache = null;
}


/**
 * REPARO da primeira importação (rodar UMA vez após o setupAll):
 * 1. Garante a coluna import_origem (initProposalsAddColumns);
 * 2. Relê a aba ORGANIZACAO e recalcula o valor CORRETO de cada proposta
 *    importada (corrige a inflação 10× causada por células numéricas);
 * 3. Marca import_origem = IMPORT_LEGADO em todas (tira o histórico do
 *    alerta de follow-up do dashboard).
 * Escreve as duas colunas em LOTE (rápido). Idempotente.
 */
function corrigirImportacao() {
  if (typeof initProposalsAddColumns === 'function') initProposalsAddColumns();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shRaw = ss.getSheetByName(IMP_SHEET_ORG);
  if (!shRaw) throw new Error('Aba ' + IMP_SHEET_ORG + ' não encontrada.');
  var raw = shRaw.getDataRange().getValues();

  // número legado -> valor correto
  var valorPorNumero = {};
  for (var r = 2; r < raw.length; r++) {
    var numero = String(raw[r][1] || '').trim();
    if (numero) valorPorNumero[numero] = _impParseBRL(raw[r][5]);
  }

  var sh = getOrCreateSheet(PROPOSALS_SHEET, PROPOSALS_LEGACY_HEADERS);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var numCol = headers.indexOf('number');
  var valCol = headers.indexOf('total_value');
  var origCol = headers.indexOf('import_origem');
  var byCol = headers.indexOf('created_by');
  if (origCol === -1) throw new Error('Coluna import_origem ausente — rode setupAll primeiro.');

  var corrigidas = 0, marcadas = 0;
  for (var i = 1; i < values.length; i++) {
    var numero2 = String(values[i][numCol] || '').trim();
    var ehImport = valorPorNumero[numero2] !== undefined &&
                   (String(values[i][byCol]) === 'IMPORT' || String(values[i][origCol]) === IMP_TAG);
    if (!ehImport) continue;
    var certo = valorPorNumero[numero2];
    if (Number(values[i][valCol]) !== certo) { values[i][valCol] = certo; corrigidas++; }
    if (String(values[i][origCol]) !== IMP_TAG) { values[i][origCol] = IMP_TAG; marcadas++; }
  }

  // escrita em lote: só as duas colunas, coluna inteira de uma vez
  var n = values.length - 1;
  if (n > 0) {
    var colVal = [], colOrig = [];
    for (var k = 1; k < values.length; k++) {
      colVal.push([values[k][valCol]]);
      colOrig.push([values[k][origCol]]);
    }
    sh.getRange(2, valCol + 1, n, 1).setValues(colVal);
    sh.getRange(2, origCol + 1, n, 1).setValues(colOrig);
  }

  var msg = 'REPARO CONCLUÍDO • valores corrigidos: ' + corrigidas + ' • import_origem marcadas: ' + marcadas;
  Logger.log(msg);
  return { corrigidas: corrigidas, marcadas: marcadas };
}
