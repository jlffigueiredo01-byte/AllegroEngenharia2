// ============================================================
// Domain.Proposals.Service.gs — ALLEGRO Business System
// Regras de negócio para propostas (Fase F2).
// NENHUM acesso direto a SpreadsheetApp aqui — usa apenas o
// Repository e helpers de Core.*.
// ============================================================

// -------------------------------------------------------
// Helpers internos
// -------------------------------------------------------

/**
 * Retorna o ID do usuário atual ou 'SYSTEM'.
 * @return {string}
 */
function _propCurrentUserId() {
  try {
    var u = getCurrentUser();
    return u ? u.id : 'SYSTEM';
  } catch (e) {
    return 'SYSTEM';
  }
}

/**
 * Calcula o nível de alçada comparando o total estimado com
 * ALCADA_SIMPLIFICADA no CONFIG (chave SETUP_CALC_ALCADA_SIMPLIFICADA).
 * Retorna 'SIMPLIFICADA' se valor < limiar, 'COMPLETA' caso contrário.
 * @param {number} totalEstimado
 * @return {string}
 */
function _calcAlcadaNivel(totalEstimado) {
  var limiar = 0;
  try {
    limiar = parseFloat(getConfigValue('SETUP_CALC_ALCADA_SIMPLIFICADA') || '0') || 0;
  } catch (e) { limiar = 0; }
  return (safeNumber(totalEstimado) < limiar) ? 'SIMPLIFICADA' : 'COMPLETA';
}

/**
 * Verifica se existe card de revisão financeira concluído para a proposta.
 * Usado na validação de alçada COMPLETA (EM_REVISAO → APROVADA_ENVIO).
 *
 * Alinhado com wfSvcValidarRevisaoFinanceira e _wfCriarCard:
 *   - campo de vínculo: `quote_id`  (não `entity_id`)
 *   - tipo do card:     'REVISAO_FINANCEIRO' (não 'REVISAO_PROPOSTA')
 *   - status concluído: 'CONCLUIDO'  (não 'FECHADO')
 *
 * Usa acGetAll() do ActionCards Repository — sem acesso direto à sheet.
 * @param {string} proposalId
 * @return {boolean}
 */
function _hasRevisaoAprovadaFinanceiro(proposalId) {
  try {
    var cards = acGetAll();
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (
        String(c.quote_id) === String(proposalId) &&
        c.tipo   === 'REVISAO_FINANCEIRO' &&
        c.status === AC_STATUS.CONCLUIDO
      ) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Fecha automaticamente o card de ação vinculado à etapa anterior
 * quando o estado avança (autocomplete de cards — VALIDACAO_V3 §3.2).
 * Usa acGetAll() e acUpdateStatus() do ActionCards Repository — sem acesso direto à sheet.
 * @param {string} proposalId
 * @param {string} estadoAnterior
 */
function _autocompleteCard(proposalId, estadoAnterior) {
  try {
    var cards = acGetAll();
    var userId = _propCurrentUserId();
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (
        c.entity_id === proposalId &&
        c.related_status === estadoAnterior &&
        c.status !== 'FECHADO' &&
        c.status !== 'CANCELADO'
      ) {
        acUpdateStatus(c.id, 'FECHADO', userId, 'Autocomplete: estado avançou para ' + estadoAnterior);
      }
    }
  } catch (e) {
    // Autocomplete é melhor-esforço; não deve bloquear a transição de estado.
    Logger.log('[propSvc] autocompleteCard falhou: ' + e.message);
  }
}

// -------------------------------------------------------
// propSvcCreate
// -------------------------------------------------------

/**
 * Cria uma nova proposta com status inicial DEMANDA.
 * Campos obrigatórios: title (ou client_name), company_id (ou client_id).
 *
 * @param {Object} data
 * @param {string}  data.title           — título da proposta (obrigatório se client_name ausente)
 * @param {string}  data.company_id      — ID da empresa (aceita também client_id)
 * @param {string} [data.client_name]    — nome do cliente
 * @param {string} [data.type]           — 'ORGANICO' ou 'CONCRETO'
 * @param {number} [data.total_estimado] — valor estimado para cálculo de alçada
 * @param {*}       ...outros campos     — repassados sem transformação
 * @return {Object}  a proposta criada (com id, number, revision_num…)
 */
function propSvcCreate(data) {
  if (!data) throw new Error('data é obrigatório.');

  // Aceita company_id ou client_id como campo de empresa
  var companyId = data.company_id || data.client_id;
  if (!companyId) throw new Error('company_id (ou client_id) é obrigatório.');

  var title = data.title || data.client_name;
  if (!title) throw new Error('title (ou client_name) é obrigatório.');

  var type = data.type || 'ORGANICO';
  var VALID_TYPES = ['ORGANICO', 'CONCRETO'];
  if (VALID_TYPES.indexOf(type) === -1) {
    throw new Error('type inválido: ' + type + '. Esperado: ' + VALID_TYPES.join(', '));
  }

  var counter  = getAndIncrementCounter('PROPOSAL_COUNTER');
  var year     = new Date().getFullYear();
  var id       = 'PROP-' + year + '-' + String(counter).padStart(4, '0');
  var number   = String(year) + String(counter).padStart(4, '0');
  var now      = nowISO();

  var items       = Array.isArray(data.items) ? data.items : [];
  var startupVal  = safeNumber(data.startup_value);
  var totalValue  = _propCalcTotal(items, startupVal);
  var totalEst    = safeNumber(data.total_estimado || totalValue);

  var proposal = {
    id:             id,
    number:         number,
    date:           now,
    type:           type,
    client_id:      companyId,
    client_name:    data.client_name || title,
    location:       data.location       || '',
    responsible:    data.responsible    || '',
    status:         PROPOSAL_STATUS.DEMANDA,
    items_json:     JSON.stringify(items),
    scope_text:     data.scope_text     || '',
    startup_value:  startupVal,
    total_value:    totalValue,
    payment_terms:  data.payment_terms  || '',
    delivery_days:  safeNumber(data.delivery_days),
    validity_days:  safeNumber(data.validity_days),
    observations:   data.observations   || '',
    ai_review_notes:'',
    created_by:     _propCurrentUserId(),
    created_at:     now,
    updated_at:     now,
    // Campos F2
    revision_num:   data.revision_num   || 'R0',
    parent_id:      data.parent_id      || '',
    pricing_json:   data.pricing_json ? JSON.stringify(data.pricing_json) : '',
    opportunity_id: data.opportunity_id || '',
    pdf_file_id:    data.pdf_file_id    || '',
    sent_at:        '',
    closed_at:      '',
    motivo_perda:   '',
    alcada_nivel:   _calcAlcadaNivel(totalEst)
  };

  propRepoCreate(proposal);
  appendAuditLog('PROPOSAL_CREATE', 'PROPOSALS', id,
    'cliente: ' + proposal.client_name + ' | tipo: ' + proposal.type +
    ' | total: ' + proposal.total_value + ' | alcada: ' + proposal.alcada_nivel
  );
  appendTimelineEvent('Proposta', id,
    'CRIADA', 'Proposta ' + number + ' criada para ' + proposal.client_name);
  if (proposal.opportunity_id) {
    _propSyncOppStatus(proposal.opportunity_id, 'Elaborando proposta');
  }

  return proposal;
}

// -------------------------------------------------------
// propSvcUpdateStatus
// -------------------------------------------------------

/**
 * Avança (ou regride) o estado de uma proposta, validando transições,
 * papéis de usuário, regras de alçada e preenchendo timestamps.
 *
 * @param {string} id          — ID da proposta
 * @param {string} novoStatus  — destino (deve estar em PROPOSAL_STATUS)
 * @param {string} userId      — ID do usuário acionando a transição
 * @param {string} userRole    — papel do usuário
 * @param {Object} [opcoes]    — { motivo_perda, force_revisao_bloqueante }
 * @return {Object}  proposta atualizada
 */
function propSvcUpdateStatus(id, novoStatus, userId, userRole, opcoes) {
  opcoes = opcoes || {};

  var proposta = propRepoGetById(id);
  if (!proposta) throw new Error('Proposta não encontrada: ' + id);

  var statusAtual = proposta.status;

  // 1. Valida que a transição é permitida pelo grafo
  var transicao = PROPOSAL_TRANSITIONS[statusAtual];
  if (!transicao) {
    throw new Error('Estado atual inválido: ' + statusAtual);
  }
  if (transicao.next.indexOf(novoStatus) === -1) {
    throw new Error(
      'Transição inválida: ' + statusAtual + ' → ' + novoStatus +
      '. Permitidas: ' + transicao.next.join(', ')
    );
  }

  // 2. Valida papel do usuário para esta transição
  if (transicao.roles.indexOf(userRole) === -1) {
    throw new Error(
      'Papel "' + userRole + '" não tem permissão para transição ' +
      statusAtual + ' → ' + novoStatus +
      '. Permitidos: ' + transicao.roles.join(', ')
    );
  }

  // 3. Regra de alçada: EM_REVISAO → APROVADA_ENVIO
  if (statusAtual === 'EM_REVISAO' && novoStatus === 'APROVADA_ENVIO') {
    if (proposta.alcada_nivel === 'COMPLETA' && !opcoes.force_revisao_bloqueante) {
      if (!_hasRevisaoAprovadaFinanceiro(id)) {
        throw new Error(
          'Proposta com alçada COMPLETA requer card de revisão fechado por FINANCEIRO_ADMIN antes de aprovar envio.'
        );
      }
    }
    // SIMPLIFICADA: Maria revisa assíncrono — apenas log
    appendAuditLog('PROPOSAL_ALCADA_CHECK', 'PROPOSALS', id,
      'alcada_nivel: ' + proposta.alcada_nivel + ' | resultado: APROVADO'
    );
  }

  // 4. motivo_perda obrigatório em RECUSADA
  if (novoStatus === 'RECUSADA') {
    if (!opcoes.motivo_perda) {
      throw new Error('motivo_perda é obrigatório ao marcar proposta como RECUSADA.');
    }
  }

  // 5. Monta os campos a atualizar
  var now = nowISO();
  var updates = {
    status:     novoStatus,
    updated_at: now
  };

  if (novoStatus === 'ENVIADA') {
    updates.sent_at = now;
  }
  if (novoStatus === 'FECHADA' || novoStatus === 'RECUSADA') {
    updates.closed_at = now;
  }
  if (novoStatus === 'RECUSADA') {
    updates.motivo_perda = opcoes.motivo_perda;
  }

  // 6. Autocomplete de card vinculado ao estado anterior
  _autocompleteCard(id, statusAtual);

  // 7. Persiste
  propRepoUpdate(id, updates);

  // 8. F19: cria projeto automaticamente ao fechar a proposta
  if (novoStatus === 'FECHADA') {
    try {
      projSvcCriarDeProposta(id, userId);
    } catch (e) {
      // Não bloqueia o fechamento — registra para auditoria
      Logger.log('[propSvc] F19: erro ao criar projeto de proposta ' + id + ': ' + e.message);
      appendAuditLog('PROJECT_CREATE_ERROR', 'PROPOSALS', id,
        'Falha ao criar projeto automaticamente: ' + e.message);
    }
  }

  appendAuditLog('PROPOSAL_STATUS_CHANGE', 'PROPOSALS', id,
    'de: ' + statusAtual + ' | para: ' + novoStatus +
    ' | userId: ' + userId + ' | userRole: ' + userRole
  );
  appendTimelineEvent('Proposta', id,
    'STATUS_CHANGE', 'Status alterado: ' + statusAtual + ' → ' + novoStatus);

  // 9. F3: processa transição no motor de workflow (cria/fecha Action Cards)
  try {
    wfSvcProcessarTransicao(propRepoGetById(id), statusAtual, novoStatus, userId);
  } catch (e) {
    // Workflow é melhor-esforço — não bloqueia a transição de status
    Logger.log('[propSvc] wfSvcProcessarTransicao falhou: ' + e.message);
  }

  return propRepoGetById(id);

  // Sincroniza o funil da oportunidade (CONCEITO_FLUXO.md) — nunca bloqueia a transição
  try {
    var pSync = propRepoGetById(id);
    if (pSync && pSync.opportunity_id) {
      var mapa = { 'ENVIADA': 'Proposta enviada', 'FECHADA': 'Proposta fechada', 'RECUSADA': 'Proposta recusada' };
      if (mapa[novoStatus]) _propSyncOppStatus(pSync.opportunity_id, mapa[novoStatus]);
    }
  } catch (eSync) { Logger.log('Sync opp falhou: ' + eSync.message); }
}

// -------------------------------------------------------
// propSvcCriarRevisao
// -------------------------------------------------------

/**
 * Cria uma revisão de uma proposta ENVIADA.
 * A nova proposta recebe revision_num incremental (R1, R2…),
 * parent_id = ID raiz, pricing_json copiado, status = PROPOSTA_GERADA.
 *
 * @param {string} proposalId  — ID da proposta a revisar (deve estar ENVIADA)
 * @param {string} [autorId]   — ID do usuário autor da revisão
 * @return {Object}  nova proposta criada
 */
function propSvcCriarRevisao(proposalId, autorId) {
  var original = propRepoGetById(proposalId);
  if (!original) throw new Error('Proposta não encontrada: ' + proposalId);
  if (original.status !== PROPOSAL_STATUS.ENVIADA) {
    throw new Error(
      'Só é possível criar revisão de proposta ENVIADA. Status atual: ' + original.status
    );
  }

  // ID raiz: se já for revisão, sobe ao pai original
  var rootId = original.parent_id || proposalId;

  // Determina próximo número de revisão
  var revisoes = propRepoGetRevisions(rootId);
  var nextRevNum = 'R' + revisoes.length; // R0 já existe → R1, R2…

  // Clona os dados da original para a nova revisão
  var novaData = {};
  var keys = Object.keys(original);
  for (var k = 0; k < keys.length; k++) {
    novaData[keys[k]] = original[keys[k]];
  }
  // Campos sobrepostos
  delete novaData.id;       // propSvcCreate gera novo ID
  delete novaData.number;   // idem
  novaData.revision_num  = nextRevNum;
  novaData.parent_id     = rootId;
  novaData.status        = PROPOSAL_STATUS.PROPOSTA_GERADA; // sobrescrito por propSvcCreate internamente
  novaData.sent_at       = '';
  novaData.closed_at     = '';
  novaData.motivo_perda  = '';
  novaData.created_by    = autorId || _propCurrentUserId();
  // Força o status correto antes de chamar Create (que seta DEMANDA)
  // — Create ignora campo status, então ajustamos após criação:
  var criada = propSvcCreate(novaData);

  // Ajusta status para PROPOSTA_GERADA (propSvcCreate seta DEMANDA por padrão)
  propRepoUpdate(criada.id, {
    status:     PROPOSAL_STATUS.PROPOSTA_GERADA,
    updated_at: nowISO()
  });
  criada.status = PROPOSAL_STATUS.PROPOSTA_GERADA;

  // Marca a proposta original como SUBSTITUIDA (VALIDACAO_V3 §2.1: ENVIADA → SUBSTITUIDA ao criar Rn+1)
  propRepoUpdate(proposalId, {
    status:     PROPOSAL_STATUS.SUBSTITUIDA,
    updated_at: nowISO()
  });
  appendAuditLog('PROPOSAL_SUBSTITUIDA', 'PROPOSALS', proposalId,
    'Substituída pela revisão ' + nextRevNum + ' (' + criada.id + ')');

  appendAuditLog('PROPOSAL_REVISION_CREATE', 'PROPOSALS', criada.id,
    'Revisão ' + nextRevNum + ' criada a partir de ' + proposalId);
  appendTimelineEvent('Proposta', criada.id,
    'REVISAO_CRIADA', 'Revisão ' + nextRevNum + ' criada a partir de ' + proposalId);

  return criada;
}

// -------------------------------------------------------
// propSvcSubstituirAnterior
// -------------------------------------------------------

/**
 * Ao aprovar revisão Rn+1 (mover para APROVADA_ENVIO), marca todas as
 * versões anteriores ainda em APROVADA_ENVIO como SUBSTITUIDA.
 * Chamado pelo Service/Api no momento da aprovação de uma revisão.
 *
 * @param {string} novaProposalId  — ID da revisão recém-aprovada
 * @return {void}
 */
function propSvcSubstituirAnterior(novaProposalId) {
  var nova = propRepoGetById(novaProposalId);
  if (!nova || !nova.parent_id) return;

  var revisoes = propRepoGetRevisions(nova.parent_id);
  var now = nowISO();
  revisoes.forEach(function(r) {
    if (r.id !== novaProposalId && r.status === PROPOSAL_STATUS.APROVADA_ENVIO) {
      propRepoUpdate(r.id, {
        status:     PROPOSAL_STATUS.SUBSTITUIDA,
        updated_at: now
      });
      appendAuditLog('PROPOSAL_SUBSTITUIDA', 'PROPOSALS', r.id,
        'Substituída pela revisão ' + nova.revision_num + ' (' + novaProposalId + ')');
    }
  });
}

// -------------------------------------------------------
// Helper interno (duplicado local para evitar dependência)
// -------------------------------------------------------

// -------------------------------------------------------
// propSvcGerarHTML — gera HTML imprimível da proposta
// -------------------------------------------------------

/**
 * Gera o HTML completo da proposta técnica comercial.
 * Movido de Domain.ProposalEngine.gs (FIX 1 — HOTFIX-01).
 *
 * @param {string} proposalId
 * @return {{ok:boolean, html?:string, error?:string}}
 */
function propSvcGerarHTML(proposalId) {
  try {
    if (!proposalId) throw new Error('proposalId é obrigatório.');
    var result = propRepoGetById(proposalId);
    if (!result) throw new Error('Proposta não encontrada: ' + proposalId);
    var p = result;

    var items = [];
    if (p.items_json) {
      try { items = JSON.parse(p.items_json); } catch (e) { items = []; }
    }
    if (!Array.isArray(items)) items = [];

    var clientName    = p.client_name || '';
    var dateFormatted = _propFormatDateDMY(p.date || p.created_at);

    var INTRO = 'Com o objetivo de oferecer soluções inovadoras e alinhadas às necessidades específicas do cliente, esta proposta técnica comercial apresenta o fornecimento do Sistema de Medição de Umidade em Fluxo. O documento foi elaborado com base no conhecimento técnico especializado da Allegro Engenharia e Desenvolvimento, aliado às informações fornecidas pela contratante e enriquecido pela ampla experiência da empresa no setor.\n\nOs materiais e tecnologias indicados para este escopo representam os mais recentes avanços disponíveis, em conformidade com as normas e especificações aplicáveis. Eventuais ajustes nos padrões estabelecidos ou nas especificações aqui descritas serão previamente submetidos à aprovação da contratante, assegurando pleno alinhamento com suas necessidades e expectativas.\n\nMais do que atender a uma demanda técnica, esta proposta foi estruturada para agregar valor ao processo produtivo da [CLIENT], oferecendo confiabilidade, eficiência e resultados consistentes. A Allegro Engenharia e Desenvolvimento reafirma seu compromisso em apoiar a empresa na implementação desta solução, fortalecendo a parceria e contribuindo para a excelência de suas operações.';

    var MONITORING = 'Será disponibilizado uma tela de acesso via software Hydro-Com para fazer acompanhamento dos sensores (leitura, gravação, calibração, registro, emissão de relatórios etc.). Os relatórios poderão ser exibidos em *.csv e exibidos em excel. As informações exibidas no relatório exibirão: Tipo de Produto, Temperatura, Umidade, Data, hora, valores máximos, valores mínimos entre outros.';

    var CALIBRATION = 'A calibração dos sensores será realizada pela [CLIENT], que deve ter equipamentos de medição de umidade de referência para essa relação. Os sensores Hydronix possuem resposta lineares, sendo possível realizar calibrações a partir de 2 pontos coletados. O manual de calibração contém informações detalhadas deste procedimento. O equipamento será dimensionado para receber até 24 calibrações diferentes.\n\nPara a calibração sugere-se utilizar o método de estufa ou por destilação. Caso seja adotado um método de medição indireta, a precisão do equipamento de referência irá impactar nos valores apresentados pelos sensores Hydro-Mix.\n\nA equipe da Allegro Engenharia e Desenvolvimento dará o suporte remoto em caso de dúvidas, e fornecerá toda a documentação necessária para configuração dos equipamentos. Os manuais serão fornecidos em português via mídia digital. Está incluso suporte remoto para quaisquer dúvidas que venham a surgir durante a operação e utilização dos equipamentos.';

    var WARRANTY = 'Os produtos Hydronix possuem garantia de 24 (vinte e quatro) meses. Os serviços de desenvolvimento realizados pela Allegro Engenharia e Desenvolvimento contam com garantia de 12 (doze) meses, a partir do início da operação assistida. Nesse período, a empresa se responsabiliza por refazê-los, sem ônus ao Cliente, caso seja constatada alteração do desenvolvimento inicial.';

    var PRICE_NOTE = 'No preço total estabelecido nesta oferta estão incluídos os impostos e taxas previstos na legislação vigente, tais como ICMS, IPI, INSS, PIS, COFINS, ISS e quaisquer outros que possam vir a incidir, assim como aquisição de materiais e todas as outras despesas e/ou encargos perante autoridades administrativas, mão-de-obra, encargos sociais, seguros, perdas eventuais, transportes, equipamentos, ferramentas, combustíveis, despesas administrativas, assistência técnica, lucros, enfim, todos os custos necessários para a perfeita execução, bem como também eventuais riscos e indenizações a qualquer título.';

    INTRO       = INTRO.replace(/\[CLIENT\]/g, clientName);
    CALIBRATION = CALIBRATION.replace(/\[CLIENT\]/g, clientName);

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

    var productRows = [];
    for (var i = 0; i < items.length; i++) {
      var item      = items[i];
      var desc      = _propGetProductDescription(item);
      var qty       = safeNumber(item.qty || item.quantity);
      var unitPrice = safeNumber(item.unit_price || item.unitPrice || item.price);
      productRows.push({
        name:       item.name || item.product_name || '',
        desc:       desc,
        ncm:        item.ncm || '',
        qty:        qty,
        unit_price: unitPrice,
        total:      qty * unitPrice
      });
    }

    var productsListHtml = '';
    if (productRows.length > 0) {
      for (var j = 0; j < productRows.length; j++) {
        var pr = productRows[j];
        productsListHtml +=
          '<div class="product-item">' +
          '<strong>' + _propEsc(pr.name) + '</strong>' +
          (pr.desc ? '<p>' + _propEsc(pr.desc) + '</p>' : '') +
          (pr.ncm ? '<span class="product-ncm">NCM: ' + _propEsc(pr.ncm) + '</span>' : '') +
          '</div>';
      }
    } else {
      productsListHtml = '<p>Nenhum produto adicionado.</p>';
    }

    var startupValue  = safeNumber(p.startup_value);
    var totalValue    = safeNumber(p.total_value);

    var priceRowsHtml = '';
    for (var k = 0; k < productRows.length; k++) {
      var pr2 = productRows[k];
      priceRowsHtml +=
        '<tr><td>' + _propEsc(pr2.name) + '</td>' +
        '<td>' + _propEsc(pr2.ncm) + '</td>' +
        '<td style="text-align:center">' + pr2.qty + '</td>' +
        '<td style="text-align:right">' + _propFmtCurrency(pr2.unit_price) + '</td>' +
        '<td style="text-align:right">' + _propFmtCurrency(pr2.total) + '</td></tr>';
    }

    var startupRowHtml = '';
    if (startupValue > 0) {
      startupRowHtml =
        '<tr class="startup-row"><td colspan="4">Startup / Comissionamento</td>' +
        '<td style="text-align:right">' + _propFmtCurrency(startupValue) + '</td></tr>';
    }

    var totalRowHtml =
      '<tr class="total-row"><td colspan="4">TOTAL</td>' +
      '<td style="text-align:right">' + _propFmtCurrency(totalValue) + '</td></tr>';

    var priceTableHtml =
      '<table class="prices-table"><thead><tr>' +
      '<th>Produto / Descrição</th><th>NCM</th>' +
      '<th style="text-align:center">Qtd.</th>' +
      '<th style="text-align:right">Preço Unit.</th>' +
      '<th style="text-align:right">Total</th>' +
      '</tr></thead><tbody>' + priceRowsHtml + startupRowHtml + totalRowHtml +
      '</tbody></table>';

    var contactsHtml =
      '<div class="contacts">' +
      '<div class="contact-name">GEMA FONTANA</div>' +
      '<div>Departamento Comercial</div>' +
      '<div>E-mail: contato@allegro.eng.br &nbsp;|&nbsp; Cel.: (45) 99946-0898</div>' +
      '<div class="contact-name" style="margin-top:14px">JONATAN MIRANDA</div>' +
      '<div>Analista de Projetos</div>' +
      '<div>E-mail: jonatan.miranda@allegro.eng.br &nbsp;|&nbsp; Cel.: (41) 99155-5456</div>' +
      '</div>';

    function _paras(text) {
      return text.split('\n\n').map(function(par) {
        return '<p>' + _propEsc(par).replace(/\n/g, '<br>') + '</p>';
      }).join('');
    }

    var scopeHtml  = p.scope_text ? _paras(p.scope_text) : '<p>—</p>';
    var obsHtml    = p.observations ? '<p>' + _propEsc(p.observations).replace(/\n/g, '<br>') + '</p>' : '<p>—</p>';
    var priceNoteHtml = '<p style="font-size:9.5pt;color:#444">' + _propEsc(PRICE_NOTE) + '</p>';

    var html =
      '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>Proposta ' + _propEsc(p.number) + ' — ' + _propEsc(clientName) + '</title>\n' +
      '<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
      '<div class="no-print" style="margin-bottom:16px">' +
      '<button onclick="window.print()" style="padding:8px 20px;background:#1a56db;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11pt">Imprimir / Salvar PDF</button>' +
      '</div>\n' +
      '<div class="header">\n' +
      '<div><div class="logo-allegro">&#x2B21; ALLEGRO | ENGENHARIA E DESENVOLVIMENTO</div>' +
      '<div class="logo-sub">Soluções em Automação e Instrumentação Industrial</div></div>\n' +
      '<div class="logo-hydronix">Hydronix&#174;<br><span style="font-size:9pt;font-weight:normal;color:#555">Authorized Reseller</span></div>\n' +
      '</div>\n' +
      '<div class="proposal-title">PROPOSTA TÉCNICA COMERCIAL — SENSORES DE UMIDADE</div>\n' +
      '<div class="metadata">\n' +
      '<div><strong>Orçamento:</strong> ' + _propEsc(p.number) + '</div>\n' +
      '<div><strong>Data:</strong> ' + _propEsc(dateFormatted) + '</div>\n' +
      '<div><strong>Tipo:</strong> ' + _propEsc(p.type) + '</div>\n' +
      '<div><strong>Cliente:</strong> ' + _propEsc(clientName) + '</div>\n' +
      '<div><strong>Local:</strong> ' + _propEsc(p.location) + '</div>\n' +
      '<div><strong>Responsável:</strong> ' + _propEsc(p.responsible) + '</div>\n' +
      '</div>\n' +
      '<div class="section-title">1. INTRODUÇÃO</div>\n' + _paras(INTRO) + '\n' +
      '<div class="section-title">2. DESCRIÇÃO DOS PRODUTOS</div>\n' + productsListHtml + '\n' +
      '<div class="section-title">3. ESCOPO DE FORNECIMENTO</div>\n' + scopeHtml + '\n' +
      '<div class="section-title">4. ACOMPANHAMENTO E RELATÓRIOS</div>\n' + _paras(MONITORING) + '\n' +
      '<div class="section-title">5. CALIBRAÇÃO</div>\n' + _paras(CALIBRATION) + '\n' +
      '<div class="section-title">6. PREÇOS</div>\n' + priceTableHtml + '\n' + priceNoteHtml + '\n' +
      '<div class="section-title">7. CONDIÇÕES DE PAGAMENTO</div>\n' +
      '<p>' + _propEsc(p.payment_terms || '—') + '</p>\n' +
      '<div class="section-title">8. PRAZOS DE ENTREGA</div>\n' +
      '<p>' + (p.delivery_days ? safeNumber(p.delivery_days) + ' dias úteis após confirmação do pedido.' : '—') + '</p>\n' +
      '<div class="section-title">9. VALIDADE DO ORÇAMENTO</div>\n' +
      '<p>' + (p.validity_days ? safeNumber(p.validity_days) + ' dias corridos a partir da data desta proposta.' : '—') + '</p>\n' +
      '<div class="section-title">10. OBSERVAÇÕES</div>\n' + obsHtml + '\n' +
      '<div class="section-title">11. GARANTIA</div>\n' +
      '<p>' + _propEsc(WARRANTY) + '</p>\n' +
      '<div class="section-title">12. CONTATOS</div>\n' + contactsHtml + '\n' +
      '</body>\n</html>';

    return { ok: true, html: html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// propSvcRevisarEscopoPorIA — revisão de escopo via Claude
// -------------------------------------------------------

/**
 * Chama Claude Haiku para revisar o escopo técnico da proposta.
 * Salva o retorno da IA em ai_review_notes na proposta.
 * Movido de Domain.ProposalEngine.gs (FIX 1 — HOTFIX-01).
 *
 * @param {string} proposalId
 * @param {string} scopeText
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function propSvcRevisarEscopoPorIA(proposalId, scopeText) {
  try {
    var systemPrompt =
      'Você é um revisor técnico especializado em propostas comerciais de sensores de umidade ' +
      'Hydronix para a Allegro Engenharia. Revise o texto do escopo técnico e forneça:\n' +
      '1. Pontos fortes\n2. Sugestões de melhoria\n' +
      '3. Informações técnicas que podem estar faltando\n' +
      '4. Uma versão melhorada do texto (mantendo o tom profissional)\n\n' +
      'Formato da resposta: JSON com campos {pontos_fortes, sugestoes, versao_melhorada}';

    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    var payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Revise este escopo técnico:\n\n' + scopeText }]
    });
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:          'post',
      contentType:     'application/json',
      headers:         { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload:         payload,
      muteHttpExceptions: true
    });
    var json = JSON.parse(response.getContentText());
    if (json.error) return { ok: false, error: json.error.message };
    var text   = json.content[0].text;
    var review;
    try { review = JSON.parse(text); } catch (e) { review = { versao_melhorada: text }; }

    if (proposalId) {
      propRepoUpdate(proposalId, {
        ai_review_notes: JSON.stringify(review),
        updated_at:      nowISO()
      });
      appendAuditLog('AI_REVIEW', 'PROPOSALS', proposalId,
        'Escopo revisado pelo modelo claude-haiku-4-5-20251001');
      appendTimelineEvent('Proposta', proposalId, 'AI_REVIEW',
        'Escopo revisado por IA (Claude Haiku)');
    }
    return { ok: true, data: review };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// Helpers privados do Service (ex-ProposalEngine)
// -------------------------------------------------------

function _propEsc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _propFmtCurrency(value) {
  var n = safeNumber(value);
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _propFormatDateDMY(value) {
  if (!value) return '';
  try {
    var d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' +
           d.getFullYear();
  } catch (e) {
    return String(value);
  }
}

function _propGetProductDescription(item) {
  var name = item.code || item.name || item.product_name || '';
  try {
    if (typeof HYDRONIX_PRODUCTS_CONTENT !== 'undefined' && HYDRONIX_PRODUCTS_CONTENT) {
      var key = name.trim().toUpperCase();
      if (HYDRONIX_PRODUCTS_CONTENT[key]) return HYDRONIX_PRODUCTS_CONTENT[key];
      var contentKeys = Object.keys(HYDRONIX_PRODUCTS_CONTENT);
      for (var i = 0; i < contentKeys.length; i++) {
        if (key.indexOf(contentKeys[i]) !== -1 || contentKeys[i].indexOf(key) !== -1) {
          return HYDRONIX_PRODUCTS_CONTENT[contentKeys[i]];
        }
      }
    }
  } catch (e) { /* HYDRONIX_PRODUCTS_CONTENT não disponível */ }
  return item.description || item.desc || '';
}

// -------------------------------------------------------
// Helper interno (duplicado local para evitar dependência)
// -------------------------------------------------------

/**
 * Calcula total_value = soma(qty * unit_price) + startup.
 * Cópia local de _calcTotal do ProposalEngine original.
 * @param {Object[]} items
 * @param {number}   startupValue
 * @return {number}
 */
function _propCalcTotal(items, startupValue) {
  var total = safeNumber(startupValue);
  if (Array.isArray(items)) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty   = safeNumber(item.qty || item.quantity);
      var price = safeNumber(item.unit_price || item.unitPrice || item.price);
      total += qty * price;
    }
  }
  return total;
}


/**
 * Atualiza o status da oportunidade a partir de eventos da proposta.
 * Escrita direta e mínima na aba OPPORTUNITIES (read-model do funil).
 * @param {string} oppId
 * @param {string} novoStatus  rótulo do vocabulário existente da oportunidade
 */
function _propSyncOppStatus(oppId, novoStatus) {
  try {
    var sh = getOrCreateSheet(OPPORTUNITIES_SHEET, OPPORTUNITIES_HEADERS);
    var values = sh.getDataRange().getValues();
    var headers = values[0];
    var idCol = headers.indexOf('id');
    var stCol = headers.indexOf('status');
    var upCol = headers.indexOf('updated_at');
    if (idCol === -1 || stCol === -1) return;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(oppId)) {
        if (String(values[r][stCol]) === novoStatus) return;
        sh.getRange(r + 1, stCol + 1).setValue(novoStatus);
        if (upCol > -1) sh.getRange(r + 1, upCol + 1).setValue(nowISO());
        appendTimelineEvent('OPPORTUNITY', oppId, 'STATUS_SYNC', 'Funil sincronizado pela proposta: ' + novoStatus);
        return;
      }
    }
  } catch (e) {
    Logger.log('_propSyncOppStatus: ' + e.message);
  }
}
