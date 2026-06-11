var EXPENSES_SHEET = 'EXPENSES';
var EXPENSE_CATEGORIES = ['Alimentação','Transporte','Material de Escritório','Serviços','Equipamentos','Marketing','Outros'];
var EXPENSES_COLS = ['id','data','estabelecimento','categoria','total','descricao','itens_json','status','criado_por','criado_em','atualizado_em','foto_file_id'];

function initExpensesSheet() {
  getOrCreateSheet(EXPENSES_SHEET, EXPENSES_COLS);
  _expEnsureFotoColumn();
}

/**
 * Garante a coluna foto_file_id em planilhas criadas antes desta versao.
 * Idempotente.
 */
function _expEnsureFotoColumn() {
  try {
    var sh = getOrCreateSheet(EXPENSES_SHEET, EXPENSES_COLS);
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.indexOf('foto_file_id') === -1) {
      sh.getRange(1, lastCol + 1).setValue('foto_file_id');
    }
  } catch (e) {
    Logger.log('_expEnsureFotoColumn: ' + e.message);
  }
}

/**
 * Pasta de comprovantes de despesa no Drive (criada uma unica vez,
 * id persistido em Script Properties: EXPENSES_FOLDER_ID).
 * @return {Folder}
 */
function _expGetFotosFolder() {
  // Preferência: taxonomia oficial do Drive (Core.Drive.gs)
  try {
    var oficial = drvGetYearFolder('FIN_COMPROVANTES', new Date().getFullYear());
    if (oficial) return oficial;
  } catch (e) { /* sem ROOT_FOLDER_ID configurado: fallback abaixo */ }

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('EXPENSES_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e2) { /* recria abaixo */ }
  }
  var folder = DriveApp.createFolder('SGA - Despesas (comprovantes)');
  props.setProperty('EXPENSES_FOLDER_ID', folder.getId());
  return folder;
}

// ---------------------------------------------------------------------------
// _expenseSvcCreate — helper interno para criação de despesa sem envelopamento Api
// Usado por Domain.Frota.Service e outros domínios que precisam espelhar despesas.
// ---------------------------------------------------------------------------

/**
 * Cria uma entrada de despesa diretamente (sem envelope Api).
 * Centraliza o acesso à sheet EXPENSES para uso interno entre domínios.
 *
 * @param {string} createdBy     - ID do usuário ou 'SYSTEM'.
 * @param {string} date          - Data (YYYY-MM-DD).
 * @param {string} estabelecimento - Nome do estabelecimento.
 * @param {string} categoria     - Categoria da despesa.
 * @param {number} total         - Valor total em R$.
 * @param {string} [descricao]   - Descrição opcional.
 * @returns {string} ID da despesa criada.
 */
function _expenseSvcCreate(createdBy, date, estabelecimento, categoria, total, descricao) {
  var id  = 'EXP-' + getAndIncrementCounter('EXPENSE_COUNTER');
  var now = nowISO();
  appendRowToSheet(EXPENSES_SHEET, {
    id:              id,
    data:            date || '',
    estabelecimento: estabelecimento || '',
    categoria:       categoria || 'Outros',
    total:           safeNumber(total),
    descricao:       descricao || '',
    itens_json:      '[]',
    status:          'ATIVO',
    criado_por:      createdBy || 'SYSTEM',
    criado_em:       now,
    atualizado_em:   now
  }, EXPENSES_COLS);
  appendAuditLog('CREATE', 'EXPENSE', id, estabelecimento + ' R$' + total);
  return id;
}

/* ── Chamada Claude Haiku (imagem comprimida no cliente) ── */
function _callClaudeOCR(imageBase64, mimeType) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada. Adicione em Projeto > Configurações > Propriedades do script.');

  var prompt = 'Extraia deste cupom fiscal: data (YYYY-MM-DD), nome do estabelecimento, valor total em reais (número decimal), e até 5 itens principais. Responda APENAS com JSON válido, sem markdown, sem explicações: {"data":"YYYY-MM-DD","estabelecimento":"","total":0.00,"itens":[{"nome":"","valor":0.00}]}';

  var body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 }
        },
        { type: 'text', text: prompt }
      ]
    }]
  });

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: body,
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var parsed = JSON.parse(resp.getContentText());

  if (code !== 200) {
    var msg = parsed.error ? parsed.error.message : resp.getContentText();
    throw new Error('Anthropic API erro ' + code + ': ' + msg);
  }

  var text = parsed.content[0].text.trim();
  var match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Resposta inesperada do modelo: ' + text.substring(0, 200));

  return JSON.parse(match[0]);
}

/* ── APIs públicas (chamadas do cliente) ── */

function Api_ocrReceipt(imageBase64, mimeType) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!imageBase64) throw new Error('Imagem não fornecida.');
    var data = _callClaudeOCR(imageBase64, mimeType || 'image/jpeg');
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_saveExpense(data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!data || !data.estabelecimento) throw new Error('Estabelecimento obrigatório.');
    if (!data.total || isNaN(data.total)) throw new Error('Valor total obrigatório.');

    var id = 'EXP-' + getAndIncrementCounter('EXPENSE_COUNTER');
    var now = nowISO();

    // Arquiva o comprovante no Drive (se a UI enviou a imagem do cupom)
    var fotoFileId = '';
    if (data.imageBase64) {
      try {
        _expEnsureFotoColumn();
        var mime = data.imageMime || 'image/jpeg';
        var ext  = (mime.indexOf('png') > -1) ? 'png' : 'jpg';
        var blob = Utilities.newBlob(
          Utilities.base64Decode(data.imageBase64), mime, id + '.' + ext);
        fotoFileId = _expGetFotosFolder().createFile(blob).getId();
      } catch (fe) {
        Logger.log('Falha ao arquivar comprovante de ' + id + ': ' + fe.message);
      }
    }

    appendRowToSheet(EXPENSES_SHEET, {
      id: id,
      data: data.data || '',
      estabelecimento: data.estabelecimento,
      categoria: data.categoria || 'Outros',
      total: safeNumber(data.total),
      descricao: data.descricao || '',
      itens_json: data.itens ? JSON.stringify(data.itens) : '[]',
      status: 'ATIVO',
      criado_por: user.id,
      criado_em: now,
      atualizado_em: now,
      foto_file_id: fotoFileId
    }, EXPENSES_COLS);

    appendAuditLog('CREATE', 'EXPENSE', id, data.estabelecimento + ' R$' + data.total);
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_getExpenses() {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var allRows = sheetToObjects(EXPENSES_SHEET).filter(function(r) { return r.status !== 'DELETED'; });
    // TECNICO vê somente as próprias despesas
    var rows = (user.role === 'TECNICO')
      ? allRows.filter(function(r) { return r.criado_por === user.id; })
      : allRows;
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_getExpenseCategories() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: EXPENSE_CATEGORIES };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
