var EXPENSES_SHEET = 'EXPENSES';
var EXPENSE_CATEGORIES = ['Alimentação','Transporte','Material de Escritório','Serviços','Equipamentos','Marketing','Outros'];
var EXPENSES_COLS = ['id','data','estabelecimento','categoria','total','descricao','itens_json','status','criado_por','criado_em','atualizado_em'];

function initExpensesSheet() {
  getOrCreateSheet(EXPENSES_SHEET, EXPENSES_COLS);
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
    requireAuth();
    if (!imageBase64) throw new Error('Imagem não fornecida.');
    var data = _callClaudeOCR(imageBase64, mimeType || 'image/jpeg');
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_saveExpense(data) {
  try {
    var user = requireAuth();
    if (!data || !data.estabelecimento) throw new Error('Estabelecimento obrigatório.');
    if (!data.total || isNaN(data.total)) throw new Error('Valor total obrigatório.');

    var id = 'EXP-' + getAndIncrementCounter('EXPENSE_COUNTER');
    var now = nowISO();

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
      atualizado_em: now
    }, EXPENSES_COLS);

    appendAuditLog('CREATE', 'EXPENSE', id, data.estabelecimento + ' R$' + data.total);
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_getExpenses() {
  try {
    requireAuth();
    var rows = sheetToObjects(EXPENSES_SHEET).filter(function(r) { return r.status !== 'DELETED'; });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_getExpenseCategories() {
  return { ok: true, data: EXPENSE_CATEGORIES };
}
