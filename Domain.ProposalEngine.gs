// ============================================================
// Domain.ProposalEngine.gs — ALLEGRO Business System
// Proposal Engine: create, manage, AI-review, and generate
// printable HTML proposals for Hydronix moisture sensors.
// ============================================================

var PROPOSALS_SHEET = 'PROPOSALS';
var PROPOSALS_HEADERS = [
  'id', 'number', 'date', 'type', 'client_id', 'client_name', 'location',
  'responsible', 'status', 'items_json', 'scope_text', 'startup_value',
  'total_value', 'payment_terms', 'delivery_days', 'validity_days',
  'observations', 'ai_review_notes', 'created_by', 'created_at', 'updated_at'
];

var PROPOSAL_STATUSES = [
  'RASCUNHO', 'REVISADO', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO'
];

var PROPOSAL_TYPES = ['ORGANICO', 'CONCRETO'];

// ------------------------------------------------------------
// initProposalsSheet
// Creates PROPOSALS sheet and ensures PROPOSAL_COUNTER exists
// in CONFIG.
// ------------------------------------------------------------
function initProposalsSheet() {
  getOrCreateSheet(PROPOSALS_SHEET, PROPOSALS_HEADERS);
  if (getConfigValue('PROPOSAL_COUNTER') === null) {
    var sheet = ss().getSheetByName('CONFIG');
    sheet.appendRow(['PROPOSAL_COUNTER', '0', 'Sequencial de propostas técnicas']);
  }
}

// ------------------------------------------------------------
// Api_getProposals
// Returns all proposals sorted by created_at descending.
// items_json is parsed to an array on each record.
// ------------------------------------------------------------
function Api_getProposals() {
  try {
    requireAuth();
    var rows = sheetToObjects(PROPOSALS_SHEET);
    rows.sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    rows = rows.map(function(r) {
      return _parseProposalItems(r);
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_getProposal(id)
// Returns a single proposal with items_json parsed.
// ------------------------------------------------------------
function Api_getProposal(id) {
  try {
    requireAuth();
    if (!id) throw new Error('id is required');
    var rows = sheetToObjects(PROPOSALS_SHEET);
    var proposal = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { proposal = rows[i]; break; }
    }
    if (!proposal) throw new Error('Proposal not found: ' + id);
    return { ok: true, data: _parseProposalItems(proposal) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_createProposal(data)
// Required data fields: type, client_id, client_name, location,
//   responsible, items (array), scope_text, startup_value,
//   payment_terms, delivery_days, validity_days, observations
// ------------------------------------------------------------
function Api_createProposal(data) {
  try {
    requireAuth();
    if (!data) throw new Error('data is required');
    if (!data.client_id) throw new Error('client_id is required');
    if (!data.client_name) throw new Error('client_name is required');

    var type = data.type || 'ORGANICO';
    if (PROPOSAL_TYPES.indexOf(type) === -1) {
      throw new Error('Invalid type: ' + type + '. Expected: ' + PROPOSAL_TYPES.join(', '));
    }

    var counter = getAndIncrementCounter('PROPOSAL_COUNTER');
    var id = 'PROP-' + String(counter).padStart(6, '0');
    var year = new Date().getFullYear();
    var number = String(year) + String(counter).padStart(4, '0');
    var now = nowISO();

    var items = Array.isArray(data.items) ? data.items : [];
    var startupValue = safeNumber(data.startup_value);
    var totalValue = _calcTotal(items, startupValue);

    var proposal = {
      id: id,
      number: number,
      date: now,
      type: type,
      client_id: data.client_id,
      client_name: data.client_name,
      location: data.location || '',
      responsible: data.responsible || '',
      status: 'RASCUNHO',
      items_json: JSON.stringify(items),
      scope_text: data.scope_text || '',
      startup_value: startupValue,
      total_value: totalValue,
      payment_terms: data.payment_terms || '',
      delivery_days: safeNumber(data.delivery_days),
      validity_days: safeNumber(data.validity_days),
      observations: data.observations || '',
      ai_review_notes: '',
      created_by: _currentUserId(),
      created_at: now,
      updated_at: now
    };

    appendRowToSheet(PROPOSALS_SHEET, proposal, PROPOSALS_HEADERS);
    appendAuditLog('CREATE', 'Proposal', id, {
      client: proposal.client_name,
      type: proposal.type,
      total_value: proposal.total_value
    });
    appendTimelineEvent('Proposal', id, 'CREATED',
      'Proposta ' + number + ' criada para ' + proposal.client_name);

    return { ok: true, id: id, number: number };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_updateProposal(id, data)
// Updatable fields: scope_text, items_json, startup_value,
//   payment_terms, delivery_days, validity_days, observations,
//   status.
// Recalculates total_value if items or startup_value changed.
// ------------------------------------------------------------
function Api_updateProposal(id, data) {
  try {
    requireAuth();
    if (!id) throw new Error('id is required');
    if (!data) throw new Error('data is required');

    // Validate status if being updated
    if (data.status !== undefined && PROPOSAL_STATUSES.indexOf(data.status) === -1) {
      throw new Error('Invalid status: ' + data.status + '. Expected: ' + PROPOSAL_STATUSES.join(', '));
    }

    // Build allowed updates
    var updates = {};
    var ALLOWED = [
      'scope_text', 'items_json', 'startup_value',
      'payment_terms', 'delivery_days', 'validity_days',
      'observations', 'status'
    ];
    ALLOWED.forEach(function(field) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    });

    // Numeric coercion
    if (updates.startup_value !== undefined) {
      updates.startup_value = safeNumber(updates.startup_value);
    }
    if (updates.delivery_days !== undefined) {
      updates.delivery_days = safeNumber(updates.delivery_days);
    }
    if (updates.validity_days !== undefined) {
      updates.validity_days = safeNumber(updates.validity_days);
    }

    // Recalculate total_value if items or startup changed
    var needsRecalc = (updates.items_json !== undefined || updates.startup_value !== undefined);
    if (needsRecalc) {
      // Fetch current record to fill in whichever half wasn't supplied
      var rows = sheetToObjects(PROPOSALS_SHEET);
      var current = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) { current = rows[i]; break; }
      }
      if (!current) throw new Error('Proposal not found: ' + id);

      var itemsJson = (updates.items_json !== undefined)
        ? updates.items_json
        : current.items_json;
      var items;
      try { items = JSON.parse(itemsJson || '[]'); } catch (e) { items = []; }
      if (!Array.isArray(items)) items = [];

      var startupValue = (updates.startup_value !== undefined)
        ? updates.startup_value
        : safeNumber(current.startup_value);

      updates.total_value = _calcTotal(items, startupValue);
    }

    updates.updated_at = nowISO();
    updateRowById(PROPOSALS_SHEET, id, updates);

    appendAuditLog('UPDATE', 'Proposal', id, updates);
    if (data.status) {
      appendTimelineEvent('Proposal', id, 'STATUS_CHANGE',
        'Status alterado para ' + data.status);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_reviewProposalScope(proposalId, scopeText)
// Calls Claude Haiku to review the technical scope text.
// Saves AI notes back to the proposal record.
// Returns { ok, data: { pontos_fortes, sugestoes, versao_melhorada } }
// ------------------------------------------------------------
function Api_reviewProposalScope(proposalId, scopeText) {
  requireAuth();
  try {
    var systemPrompt = 'Você é um revisor técnico especializado em propostas comerciais de sensores de umidade Hydronix para a Allegro Engenharia. Revise o texto do escopo técnico e forneça:\n1. Pontos fortes\n2. Sugestões de melhoria\n3. Informações técnicas que podem estar faltando\n4. Uma versão melhorada do texto (mantendo o tom profissional)\n\nFormato da resposta: JSON com campos {pontos_fortes, sugestoes, versao_melhorada}';

    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    var payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Revise este escopo técnico:\n\n' + scopeText }]
    });
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: payload,
      muteHttpExceptions: true
    });
    var json = JSON.parse(response.getContentText());
    if (json.error) return { ok: false, error: json.error.message };
    var text = json.content[0].text;
    var review;
    try { review = JSON.parse(text); } catch (e) { review = { versao_melhorada: text }; }

    // Save review notes to proposal
    if (proposalId) {
      updateRowById(PROPOSALS_SHEET, proposalId, {
        ai_review_notes: JSON.stringify(review),
        updated_at: nowISO()
      });
      appendAuditLog('AI_REVIEW', 'Proposal', proposalId, { model: 'claude-haiku-4-5-20251001' });
      appendTimelineEvent('Proposal', proposalId, 'AI_REVIEW',
        'Escopo revisado por IA (Claude Haiku)');
    }
    return { ok: true, data: review };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_generateProposalHTML(proposalId)
// Generates a complete, print-ready HTML proposal document.
// Returns { ok: true, html: '<!DOCTYPE html>...' }
// ------------------------------------------------------------
function Api_generateProposalHTML(proposalId) {
  try {
    requireAuth();
    if (!proposalId) throw new Error('proposalId is required');

    var result = Api_getProposal(proposalId);
    if (!result.ok) throw new Error(result.error);
    var p = result.data;

    var items = Array.isArray(p.items) ? p.items : [];
    var clientName = p.client_name || '';
    var dateFormatted = _formatDateDMY(p.date || p.created_at);

    // ------- STANDARD TEXTS ------- //
    var INTRO = 'Com o objetivo de oferecer soluções inovadoras e alinhadas às necessidades específicas do cliente, esta proposta técnica comercial apresenta o fornecimento do Sistema de Medição de Umidade em Fluxo. O documento foi elaborado com base no conhecimento técnico especializado da Allegro Engenharia e Desenvolvimento, aliado às informações fornecidas pela contratante e enriquecido pela ampla experiência da empresa no setor.\n\nOs materiais e tecnologias indicados para este escopo representam os mais recentes avanços disponíveis, em conformidade com as normas e especificações aplicáveis. Eventuais ajustes nos padrões estabelecidos ou nas especificações aqui descritas serão previamente submetidos à aprovação da contratante, assegurando pleno alinhamento com suas necessidades e expectativas.\n\nMais do que atender a uma demanda técnica, esta proposta foi estruturada para agregar valor ao processo produtivo da [CLIENT], oferecendo confiabilidade, eficiência e resultados consistentes. A Allegro Engenharia e Desenvolvimento reafirma seu compromisso em apoiar a empresa na implementação desta solução, fortalecendo a parceria e contribuindo para a excelência de suas operações.';

    var MONITORING = 'Será disponibilizado uma tela de acesso via software Hydro-Com para fazer acompanhamento dos sensores (leitura, gravação, calibração, registro, emissão de relatórios etc.). Os relatórios poderão ser exibidos em *.csv e exibidos em excel. As informações exibidas no relatório exibirão: Tipo de Produto, Temperatura, Umidade, Data, hora, valores máximos, valores mínimos entre outros.';

    var CALIBRATION = 'A calibração dos sensores será realizada pela [CLIENT], que deve ter equipamentos de medição de umidade de referência para essa relação. Os sensores Hydronix possuem resposta lineares, sendo possível realizar calibrações a partir de 2 pontos coletados. O manual de calibração contém informações detalhadas deste procedimento. O equipamento será dimensionado para receber até 24 calibrações diferentes.\n\nPara a calibração sugere-se utilizar o método de estufa ou por destilação. Caso seja adotado um método de medição indireta, a precisão do equipamento de referência irá impactar nos valores apresentados pelos sensores Hydro-Mix.\n\nA equipe da Allegro Engenharia e Desenvolvimento dará o suporte remoto em caso de dúvidas, e fornecerá toda a documentação necessária para configuração dos equipamentos. Os manuais serão fornecidos em português via mídia digital. Está incluso suporte remoto para quaisquer dúvidas que venham a surgir durante a operação e utilização dos equipamentos.';

    var WARRANTY = 'Os produtos Hydronix possuem garantia de 24 (vinte e quatro) meses. Os serviços de desenvolvimento realizados pela Allegro Engenharia e Desenvolvimento contam com garantia de 12 (doze) meses, a partir do início da operação assistida. Nesse período, a empresa se responsabiliza por refazê-los, sem ônus ao Cliente, caso seja constatada alteração do desenvolvimento inicial.';

    var PRICE_NOTE = 'No preço total estabelecido nesta oferta estão incluídos os impostos e taxas previstos na legislação vigente, tais como ICMS, IPI, INSS, PIS, COFINS, ISS e quaisquer outros que possam vir a incidir, assim como aquisição de materiais e todas as outras despesas e/ou encargos perante autoridades administrativas, mão-de-obra, encargos sociais, seguros, perdas eventuais, transportes, equipamentos, ferramentas, combustíveis, despesas administrativas, assistência técnica, lucros, enfim, todos os custos necessários para a perfeita execução, bem como também eventuais riscos e indenizações a qualquer título.';

    // Replace [CLIENT] placeholder
    INTRO = INTRO.replace(/\[CLIENT\]/g, clientName);
    CALIBRATION = CALIBRATION.replace(/\[CLIENT\]/g, clientName);

    // ------- CSS ------- //
    var css = [
      '@media print { body { margin: 0; } .no-print { display: none; } }',
      'body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a2e; margin: 2cm; }',
      '.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a56db; padding-bottom: 12px; margin-bottom: 20px; }',
      '.logo-allegro { font-size: 18pt; font-weight: 900; color: #1a56db; letter-spacing: 2px; }',
      '.logo-sub { font-size: 9pt; color: #555; letter-spacing: 1px; margin-top: 2px; }',
      '.logo-hydronix { font-size: 11pt; font-weight: bold; color: #1a56db; text-align: right; }',
      '.section-title { background: #1a56db; color: white; text-align: center; padding: 6px 12px; font-weight: bold; font-size: 10pt; margin: 20px 0 10px; letter-spacing: 1px; }',
      '.prices-table { width: 100%; border-collapse: collapse; margin: 10px 0; }',
      '.prices-table th { background: #1a56db; color: white; padding: 6px 8px; text-align: left; font-size: 10pt; }',
      '.prices-table td { border: 1px solid #ddd; padding: 5px 8px; font-size: 10pt; }',
      '.prices-table .total-row td { font-weight: bold; background: #f0f0f0; }',
      '.metadata { margin-bottom: 20px; line-height: 2; }',
      '.metadata strong { display: inline-block; min-width: 120px; }',
      '.proposal-title { text-align: center; font-size: 16pt; font-weight: bold; margin: 30px 0; text-transform: uppercase; }',
      'p { text-align: justify; line-height: 1.6; margin: 8px 0; }',
      '.contacts { margin-top: 10px; }',
      '.contact-name { font-weight: bold; margin-top: 12px; }',
      '.product-item { margin-bottom: 14px; }',
      '.product-item strong { display: block; margin-bottom: 2px; }',
      '.product-ncm { color: #555; font-size: 9.5pt; }',
      '.startup-row td { font-style: italic; }',
      'ul { margin: 6px 0 6px 20px; padding: 0; }',
      'li { line-height: 1.7; }'
    ].join('\n');

    // ------- PRODUCT DESCRIPTIONS ------- //
    var productRows = items.map(function(item) {
      var desc = _getProductDescription(item);
      var qty = safeNumber(item.qty || item.quantity);
      var unitPrice = safeNumber(item.unit_price || item.unitPrice || item.price);
      var lineTotal = qty * unitPrice;
      var ncm = item.ncm || '';
      return {
        name: item.name || item.product_name || '',
        desc: desc,
        ncm: ncm,
        qty: qty,
        unit_price: unitPrice,
        total: lineTotal
      };
    });

    // ------- PRODUCTS LIST HTML ------- //
    var productsListHtml = '';
    if (productRows.length > 0) {
      productsListHtml = productRows.map(function(pr, idx) {
        return '<div class="product-item">' +
          '<strong>' + _esc(pr.name) + '</strong>' +
          (pr.desc ? '<p>' + _esc(pr.desc) + '</p>' : '') +
          (pr.ncm ? '<span class="product-ncm">NCM: ' + _esc(pr.ncm) + '</span>' : '') +
          '</div>';
      }).join('');
    } else {
      productsListHtml = '<p>Nenhum produto adicionado.</p>';
    }

    // ------- PRICES TABLE HTML ------- //
    var startupValue = safeNumber(p.startup_value);
    var totalValue = safeNumber(p.total_value);

    var priceRowsHtml = productRows.map(function(pr) {
      return '<tr>' +
        '<td>' + _esc(pr.name) + '</td>' +
        '<td>' + _esc(pr.ncm) + '</td>' +
        '<td style="text-align:center">' + pr.qty + '</td>' +
        '<td style="text-align:right">' + _fmtCurrency(pr.unit_price) + '</td>' +
        '<td style="text-align:right">' + _fmtCurrency(pr.total) + '</td>' +
        '</tr>';
    }).join('');

    var startupRowHtml = '';
    if (startupValue > 0) {
      startupRowHtml = '<tr class="startup-row">' +
        '<td colspan="4">Startup / Comissionamento</td>' +
        '<td style="text-align:right">' + _fmtCurrency(startupValue) + '</td>' +
        '</tr>';
    }

    var totalRowHtml = '<tr class="total-row">' +
      '<td colspan="4">TOTAL</td>' +
      '<td style="text-align:right">' + _fmtCurrency(totalValue) + '</td>' +
      '</tr>';

    var priceTableHtml =
      '<table class="prices-table">' +
      '<thead><tr>' +
      '<th>Produto / Descrição</th>' +
      '<th>NCM</th>' +
      '<th style="text-align:center">Qtd.</th>' +
      '<th style="text-align:right">Preço Unit.</th>' +
      '<th style="text-align:right">Total</th>' +
      '</tr></thead>' +
      '<tbody>' +
      priceRowsHtml +
      startupRowHtml +
      totalRowHtml +
      '</tbody>' +
      '</table>';

    // ------- CONTACTS HTML ------- //
    var contactsHtml =
      '<div class="contacts">' +
      '<div class="contact-name">GEMA FONTANA</div>' +
      '<div>Departamento Comercial</div>' +
      '<div>E-mail: contato@allegro.eng.br &nbsp;|&nbsp; Cel.: (45) 99946-0898</div>' +
      '<div class="contact-name" style="margin-top:14px">JONATAN MIRANDA</div>' +
      '<div>Analista de Projetos</div>' +
      '<div>E-mail: jonatan.miranda@allegro.eng.br &nbsp;|&nbsp; Cel.: (41) 99155-5456</div>' +
      '</div>';

    // ------- INTRO PARAGRAPHS ------- //
    var introHtml = INTRO.split('\n\n').map(function(par) {
      return '<p>' + _esc(par).replace(/\n/g, '<br>') + '</p>';
    }).join('');

    // ------- MONITORING PARAGRAPHS ------- //
    var monitoringHtml = MONITORING.split('\n\n').map(function(par) {
      return '<p>' + _esc(par).replace(/\n/g, '<br>') + '</p>';
    }).join('');

    // ------- CALIBRATION PARAGRAPHS ------- //
    var calibrationHtml = CALIBRATION.split('\n\n').map(function(par) {
      return '<p>' + _esc(par).replace(/\n/g, '<br>') + '</p>';
    }).join('');

    // ------- SCOPE TEXT ------- //
    var scopeHtml = p.scope_text
      ? p.scope_text.split('\n\n').map(function(par) {
          return '<p>' + _esc(par).replace(/\n/g, '<br>') + '</p>';
        }).join('')
      : '<p>—</p>';

    // ------- OBSERVATIONS ------- //
    var obsHtml = p.observations
      ? '<p>' + _esc(p.observations).replace(/\n/g, '<br>') + '</p>'
      : '<p>—</p>';

    // ------- PRICE NOTE ------- //
    var priceNoteHtml = '<p style="font-size:9.5pt;color:#444">' + _esc(PRICE_NOTE) + '</p>';

    // ------- FULL HTML ------- //
    var html = '<!DOCTYPE html>\n' +
      '<html lang="pt-BR">\n' +
      '<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>Proposta ' + _esc(p.number) + ' — ' + _esc(clientName) + '</title>\n' +
      '<style>\n' + css + '\n</style>\n' +
      '</head>\n' +
      '<body>\n' +

      // Print button (no-print)
      '<div class="no-print" style="margin-bottom:16px">' +
      '<button onclick="window.print()" style="padding:8px 20px;background:#1a56db;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11pt">Imprimir / Salvar PDF</button>' +
      '</div>\n' +

      // Header
      '<div class="header">\n' +
      '<div>\n' +
      '<div class="logo-allegro">&#x2B21; ALLEGRO | ENGENHARIA E DESENVOLVIMENTO</div>\n' +
      '<div class="logo-sub">Soluções em Automação e Instrumentação Industrial</div>\n' +
      '</div>\n' +
      '<div class="logo-hydronix">Hydronix&#174;<br><span style="font-size:9pt;font-weight:normal;color:#555">Authorized Reseller</span></div>\n' +
      '</div>\n' +

      // Proposal title
      '<div class="proposal-title">PROPOSTA TÉCNICA COMERCIAL — SENSORES DE UMIDADE</div>\n' +

      // Metadata
      '<div class="metadata">\n' +
      '<div><strong>Orçamento:</strong> ' + _esc(p.number) + '</div>\n' +
      '<div><strong>Data:</strong> ' + _esc(dateFormatted) + '</div>\n' +
      '<div><strong>Tipo:</strong> ' + _esc(p.type) + '</div>\n' +
      '<div><strong>Cliente:</strong> ' + _esc(clientName) + '</div>\n' +
      '<div><strong>Local:</strong> ' + _esc(p.location) + '</div>\n' +
      '<div><strong>Responsável:</strong> ' + _esc(p.responsible) + '</div>\n' +
      '</div>\n' +

      // 1. Introdução
      '<div class="section-title">1. INTRODUÇÃO</div>\n' +
      introHtml + '\n' +

      // 2. Descrição dos Produtos
      '<div class="section-title">2. DESCRIÇÃO DOS PRODUTOS</div>\n' +
      productsListHtml + '\n' +

      // 3. Escopo de Fornecimento
      '<div class="section-title">3. ESCOPO DE FORNECIMENTO</div>\n' +
      scopeHtml + '\n' +

      // 4. Acompanhamento e Relatórios
      '<div class="section-title">4. ACOMPANHAMENTO E RELATÓRIOS</div>\n' +
      monitoringHtml + '\n' +

      // 5. Calibração
      '<div class="section-title">5. CALIBRAÇÃO</div>\n' +
      calibrationHtml + '\n' +

      // 6. Preços
      '<div class="section-title">6. PREÇOS</div>\n' +
      priceTableHtml + '\n' +
      priceNoteHtml + '\n' +

      // 7. Condições de Pagamento
      '<div class="section-title">7. CONDIÇÕES DE PAGAMENTO</div>\n' +
      '<p>' + _esc(p.payment_terms || '—') + '</p>\n' +

      // 8. Prazos de Entrega
      '<div class="section-title">8. PRAZOS DE ENTREGA</div>\n' +
      '<p>' + (p.delivery_days ? safeNumber(p.delivery_days) + ' dias úteis após confirmação do pedido.' : '—') + '</p>\n' +

      // 9. Validade do Orçamento
      '<div class="section-title">9. VALIDADE DO ORÇAMENTO</div>\n' +
      '<p>' + (p.validity_days ? safeNumber(p.validity_days) + ' dias corridos a partir da data desta proposta.' : '—') + '</p>\n' +

      // 10. Observações
      '<div class="section-title">10. OBSERVAÇÕES</div>\n' +
      obsHtml + '\n' +

      // 11. Garantia
      '<div class="section-title">11. GARANTIA</div>\n' +
      '<p>' + _esc(WARRANTY) + '</p>\n' +

      // 12. Contatos
      '<div class="section-title">12. CONTATOS</div>\n' +
      contactsHtml + '\n' +

      '</body>\n</html>';

    return { ok: true, html: html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// Private helpers
// ============================================================

/**
 * Parses items_json string to an array on a proposal record.
 * Mutates a copy of the record; safe to call on raw sheet objects.
 */
function _parseProposalItems(proposal) {
  var copy = {};
  var keys = Object.keys(proposal);
  for (var k = 0; k < keys.length; k++) {
    copy[keys[k]] = proposal[keys[k]];
  }
  if (typeof copy.items_json === 'string' && copy.items_json) {
    try { copy.items = JSON.parse(copy.items_json); } catch (e) { copy.items = []; }
  } else {
    copy.items = [];
  }
  return copy;
}

/**
 * Calculates total_value = sum(item.qty * item.unit_price) + startupValue.
 */
function _calcTotal(items, startupValue) {
  var total = safeNumber(startupValue);
  if (Array.isArray(items)) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty = safeNumber(item.qty || item.quantity);
      var price = safeNumber(item.unit_price || item.unitPrice || item.price);
      total += qty * price;
    }
  }
  return total;
}

/**
 * Returns a product description. Attempts HYDRONIX_PRODUCTS_CONTENT
 * global first (Domain.HydronixContent.gs), then falls back to the
 * item's own description field.
 */
function _getProductDescription(item) {
  var name = item.code || item.name || item.product_name || '';
  // Try HYDRONIX_PRODUCTS_CONTENT if it exists in the global scope
  try {
    if (typeof HYDRONIX_PRODUCTS_CONTENT !== 'undefined' && HYDRONIX_PRODUCTS_CONTENT) {
      var key = name.trim().toUpperCase();
      if (HYDRONIX_PRODUCTS_CONTENT[key]) return HYDRONIX_PRODUCTS_CONTENT[key];
      // Partial match
      var contentKeys = Object.keys(HYDRONIX_PRODUCTS_CONTENT);
      for (var i = 0; i < contentKeys.length; i++) {
        if (key.indexOf(contentKeys[i]) !== -1 || contentKeys[i].indexOf(key) !== -1) {
          return HYDRONIX_PRODUCTS_CONTENT[contentKeys[i]];
        }
      }
    }
  } catch (e) { /* HYDRONIX_PRODUCTS_CONTENT not available */ }
  // Fallback: item's own description field
  return item.description || item.desc || '';
}

/**
 * Formats an ISO date string or Date to DD/MM/YYYY.
 */
function _formatDateDMY(value) {
  if (!value) return '';
  try {
    var d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    return day + '/' + month + '/' + year;
  } catch (e) {
    return String(value);
  }
}

/**
 * Formats a number as BRL currency string (R$ 1.234,56).
 */
function _fmtCurrency(value) {
  var n = safeNumber(value);
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * HTML-escapes a string to prevent XSS in generated HTML.
 */
function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns the current user's id (or 'SYSTEM' if unavailable).
 */
function _currentUserId() {
  try {
    var user = getCurrentUser();
    return user ? user.id : 'SYSTEM';
  } catch (e) {
    return 'SYSTEM';
  }
}

// ------------------------------------------------------------
// Api_getProposalStats
// Returns aggregate stats for the dashboard / list header.
// ------------------------------------------------------------
function Api_getProposalStats() {
  try {
    requireAuth();
    var rows = sheetToObjects(PROPOSALS_SHEET);
    var total = rows.length;
    var totalValue = 0;
    var byStatus = {};
    for (var i = 0; i < PROPOSAL_STATUSES.length; i++) {
      byStatus[PROPOSAL_STATUSES[i]] = 0;
    }
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      totalValue += safeNumber(r.total_value);
      var st = r.status || '';
      if (byStatus.hasOwnProperty(st)) {
        byStatus[st]++;
      } else {
        byStatus[st] = (byStatus[st] || 0) + 1;
      }
    }
    return {
      ok: true,
      data: {
        total: total,
        totalValue: totalValue,
        byStatus: byStatus,
        drafts: byStatus['RASCUNHO'] || 0,
        sent: (byStatus['ENVIADO'] || 0) + (byStatus['REVISADO'] || 0),
        approved: byStatus['APROVADO'] || 0
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
