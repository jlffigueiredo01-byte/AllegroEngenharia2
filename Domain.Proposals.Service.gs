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
 * Bypass de alçada COMPLETA pela diretoria ("Eu reviso este card").
 * Fecha o card REVISAO_FINANCEIRO aberto (se houver) e registra auditoria
 * (quem/quando). Funciona com ou sem card — quando não há card, apenas
 * registra o bypass (o avanço de status usa force_revisao_bloqueante).
 *
 * Decisões (auditoria 2026-06-18): só DIRETOR; auto-aprovação permitida;
 * grava quem/quando sem exigir texto de motivo.
 *
 * @param {string} proposalId
 * @param {string} userId
 * @param {string} userRole
 */
function _fecharRevisaoFinanceiroBypass(proposalId, userId, userRole) {
  var agora = nowISO();
  var nota = 'Revisão financeira dispensada pela diretoria (bypass de alçada — FINANCEIRO_ADMIN indisponível).';
  try {
    var cards = acGetAll();
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (String(c.quote_id) === String(proposalId) &&
          c.tipo === 'REVISAO_FINANCEIRO' &&
          c.status !== AC_STATUS.CONCLUIDO &&
          c.status !== 'CANCELADO') {
        updateRowByIdSafe('ACTION_CARDS', c.id, {
          status:       AC_STATUS.CONCLUIDO,
          closed_by:    userId,
          closed_at:    agora,
          close_reason: nota,
          last_member:  userId,
          last_note:    nota,
          updated_at:   agora
        });
        break;
      }
    }
  } catch (e) { /* não bloqueia o avanço se o fechamento do card falhar */ }
  appendAuditLog('PROPOSAL_REVISAO_BYPASS', 'PROPOSALS', proposalId,
    'Bypass de alçada COMPLETA por ' + userId + ' (' + userRole + ')');
  appendTimelineEvent('Proposta', proposalId, 'REVISAO_BYPASS',
    'Revisão financeira dispensada pela diretoria (' + userId + ')');
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

  // Guarda de unicidade (Nível 2): o counter tem lock, mas o cache do CONFIG
  // pode defasar; garante que o id da proposta não colida com um já existente.
  var year     = new Date().getFullYear();
  var counter, id, number;
  var _propIds = {};
  try {
    var _pr = sheetToObjects(PROPOSALS_SHEET);
    for (var _pi = 0; _pi < _pr.length; _pi++) _propIds[String(_pr[_pi].id)] = true;
  } catch (e) {}
  var _guarda = 0;
  do {
    counter = getAndIncrementCounter('PROPOSAL_COUNTER');
    id      = 'PROP-' + year + '-' + String(counter).padStart(4, '0');
    number  = String(year) + String(counter).padStart(4, '0');
    _guarda++;
  } while (_propIds[id] && _guarda < 1000);
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
    // FB-19: snapshot do contato-responsavel selecionado em Contatos da empresa
    contact_id:     data.contact_id     || '',
    contact_phone:  data.contact_phone  || '',
    contact_email:  data.contact_email  || '',
    // FB-20/26/27 — Levantamento tecnico (migrado de Oportunidade)
    product:           data.product           || '',
    max_temp:          data.max_temp          || '',
    qty_sensors_xt:    data.qty_sensors_xt    || 0,
    qty_sensors_ht:    data.qty_sensors_ht    || 0,
    qty_sensors_probe: data.qty_sensors_probe || 0,
    installation_point:data.installation_point|| '',
    automation_detail: data.automation_detail || '',
    hydro_view:        data.hydro_view        || '',
    infra_distance:    data.infra_distance    || 0,
    tamanho_infra:     data.tamanho_infra     || 0,
    tech_notes:        data.tech_notes        || '',
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
    if (proposta.alcada_nivel === 'COMPLETA' && !_hasRevisaoAprovadaFinanceiro(id)) {
      if (opcoes.force_revisao_bloqueante) {
        // Bypass de diretoria: só DIRETOR_TECNICO/DIRETOR_COMERCIAL podem dispensar
        // a revisão da Maria (FINANCEIRO_ADMIN indisponível). Auto-aprovação permitida.
        if (userRole !== 'DIRETOR_TECNICO' && userRole !== 'DIRETOR_COMERCIAL') {
          throw new Error('Apenas a diretoria pode dispensar a revisão financeira (bypass de alçada COMPLETA).');
        }
        _fecharRevisaoFinanceiroBypass(id, userId, userRole);
      } else {
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

  // 4. motivo_perda é OPCIONAL em RECUSADA (decisão João, auditoria 2026-06-18).
  //    Se vier preenchido, é gravado abaixo; se não, a recusa segue sem motivo.

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

  // 10. FB-26/27: Sincroniza o funil da oportunidade (CONCEITO_FLUXO.md)
  //     CORRIGIDO: este bloco estava DEPOIS do return e nunca era executado.
  //     Agora sempre que a proposta avança status, a Oportunidade reflete:
  //       PROPOSTA_GERADA -> "Elaborando proposta"
  //       ENVIADA         -> "Proposta enviada"
  //       FECHADA         -> "Proposta fechada"
  //       RECUSADA        -> "Proposta recusada"
  try {
    var pSync = propRepoGetById(id);
    if (pSync && pSync.opportunity_id) {
      var mapa = {
        'PROPOSTA_GERADA': 'Elaborando proposta',
        'EM_REVISAO':      'Elaborando proposta',
        'APROVADA_ENVIO':  'Elaborando proposta',
        'ENVIADA':         'Proposta enviada',
        'FECHADA':         'Proposta fechada',
        'RECUSADA':        'Proposta recusada'
      };
      if (mapa[novoStatus]) _propSyncOppStatus(pSync.opportunity_id, mapa[novoStatus]);
    }
  } catch (eSync) { Logger.log('[propSvc] Sync opp falhou: ' + eSync.message); }

  return propRepoGetById(id);
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

/**
 * Converte uma imagem em data URI (base64), com cache de 6h.
 * Fallback: retorna a própria URL se a busca falhar (ex.: sem rede).
 */
function _propInlineImg(url) {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'IMG64_' + Utilities.base64EncodeWebSafe(url).slice(0, 80);
    var hit = cache.get(key);
    if (hit) return hit;
    var blob = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getBlob();
    var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (uri.length < 95000) cache.put(key, uri, 21600); // limite do CacheService
    return uri;
  } catch (e) {
    return url;
  }
}

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

    var MONITORING = 'Será disponibilizada uma tela de acesso via software Hydro-Com para acompanhamento dos sensores (leitura, gravação, calibração, registro, emissão de relatórios etc.). Os relatórios poderão ser exportados em formato *.csv e abertos no Excel, exibindo: tipo de produto, temperatura, umidade, data, hora, valores máximos e mínimos, entre outros.';

    var CALIBRATION = 'A calibração dos sensores será realizada pela [CLIENT], que deve dispor de equipamentos de medição de umidade de referência para essa correlação. Os sensores Hydronix possuem resposta linear, sendo possível realizar calibrações a partir de 2 pontos coletados. O manual de calibração contém informações detalhadas deste procedimento. O equipamento será dimensionado para receber até 24 calibrações diferentes.\n\nPara a calibração sugere-se utilizar o método de estufa ou por destilação. Caso seja adotado um método de medição indireta, a precisão do equipamento de referência irá impactar nos valores apresentados pelos sensores Hydronix.\n\nA equipe da Allegro Engenharia e Desenvolvimento dará suporte remoto em caso de dúvidas e fornecerá toda a documentação necessária para configuração dos equipamentos. Os manuais serão fornecidos em português via mídia digital. Está incluso suporte remoto para quaisquer dúvidas que venham a surgir durante a operação e utilização dos equipamentos.';

    var WARRANTY = 'Os produtos Hydronix possuem garantia de 24 (vinte e quatro) meses. Os serviços de desenvolvimento realizados pela Allegro Engenharia e Desenvolvimento contam com garantia de 12 (doze) meses, a partir do início da operação assistida. Nesse período, a empresa se responsabiliza por refazê-los, sem ônus ao Cliente, caso seja constatada alteração do desenvolvimento inicial.';

    var PRICE_NOTE = 'No preço total estabelecido nesta oferta estão incluídos os impostos e taxas previstos na legislação vigente, tais como ICMS, IPI, INSS, PIS, COFINS, ISS e quaisquer outros que possam vir a incidir, assim como aquisição de materiais e todas as outras despesas e/ou encargos perante autoridades administrativas, mão-de-obra, encargos sociais, seguros, perdas eventuais, transportes, equipamentos, ferramentas, combustíveis, despesas administrativas, assistência técnica, lucros, enfim, todos os custos necessários para a perfeita execução, bem como também eventuais riscos e indenizações a qualquer título.';

    INTRO       = INTRO.replace(/\[CLIENT\]/g, clientName);
    var INTRO_COMMIT = 'Mais do que atender a uma demanda técnica, esta proposta foi estruturada para agregar valor ao processo produtivo da ' + clientName + ', oferecendo confiabilidade, eficiência e resultados consistentes. A Allegro Engenharia e Desenvolvimento reafirma seu compromisso em apoiar a empresa na implementação desta solução, fortalecendo a parceria e contribuindo para a excelência de suas operações.';
    CALIBRATION = CALIBRATION.replace(/\[CLIENT\]/g, clientName);

    var companyCnpj = '';
    try {
      var cfgRows = sheetToObjects('CONFIG');
      for (var cf = 0; cf < cfgRows.length; cf++) {
        if (cfgRows[cf].key === 'COMPANY_CNPJ') { companyCnpj = cfgRows[cf].value || ''; break; }
      }
    } catch (eCfg) { /* CONFIG indisponível */ }

    var LOGO_ALLEGRO  = _propInlineImg('https://allegro.eng.br/wp-content/uploads/2024/08/logo_allegro.png');
    var LOGO_HYDRONIX = _propInlineImg('https://allegro.eng.br/wp-content/uploads/2024/08/LOGO-HYDRONIX-1.png');
    var MAPA_CLIENTES = 'https://allegro.eng.br/wp-content/uploads/2024/08/mapa-clientes-allegro-1007x1024.png';

    var css = [
      '@page { size: A4; margin: 16mm 14mm; }',
      // FB-22 sub-item 2: tabela de precos quebra MELHOR no PDF (cada linha mantida inteira em vez de tentar caber a tabela toda na pagina, o que truncava)
      '@media print { body { margin: 0; } .no-print { display: none; } .prod-card, .cond-grid, .flow, .cta, .exec .box, .badges, .contact-grid, .meta { page-break-inside: avoid; } .price-table tr { page-break-inside: avoid; } .price-table thead { display: table-header-group; } .sec { page-break-after: avoid; page-break-inside: avoid; } img { -webkit-print-color-adjust: exact; print-color-adjust: exact; } p { orphans: 3; widows: 3; } table, th, td { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }',
      '* { box-sizing: border-box; }',
      'body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1f2937; margin: 1.4cm; line-height: 1.55; }',
      // header
      '.hd { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 3px solid #1a56db; }',
      '.hd img.logo { height: 46px; }',
      '.hd .reseller { text-align: right; }',
      '.hd .reseller img { height: 30px; display: block; margin-left: auto; }',
      '.hd .reseller span { font-size: 8pt; color: #6b7280; letter-spacing: .5px; }',
      // título + meta
      '.title { margin: 22px 0 4px; font-size: 17pt; font-weight: 800; color: #14335f; letter-spacing: .3px; }',
      '.subtitle { color: #1a56db; font-weight: 600; font-size: 11pt; margin-bottom: 16px; }',
      '.meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 18px; background: #f3f7ff; border: 1px solid #dbe7ff; border-radius: 10px; padding: 12px 16px; margin-bottom: 6px; }',
      '.meta div { font-size: 9.5pt; }',
      '.meta b { display: block; color: #6b7280; font-size: 8pt; text-transform: uppercase; letter-spacing: .8px; font-weight: 700; }',
      '.meta span { font-size: 10.5pt; color: #111827; font-weight: 600; }',
      // seções
      '.sec { display: flex; align-items: center; gap: 10px; margin: 26px 0 10px; }',
      '.sec .n { background: #1a56db; color: #fff; font-weight: 800; font-size: 10pt; border-radius: 6px; min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }',
      '.sec h2 { margin: 0; font-size: 12.5pt; color: #14335f; letter-spacing: .5px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; flex: 1; padding-bottom: 4px; }',
      'p { text-align: justify; margin: 7px 0; }',
      // produto
      '.prod-card { border: 1px solid #e5e7eb; border-left: 4px solid #1a56db; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }',
      '.prod-head { display: flex; justify-content: space-between; gap: 14px; }',
      '.prod-head h3 { margin: 0 0 4px; font-size: 12.5pt; color: #1a56db; }',
      '.prod-head .lead { font-size: 10pt; color: #374151; font-style: italic; margin: 0; }',
      '.prod-img { width: 130px; min-width: 130px; text-align: center; }',
      '.prod-img img { max-width: 130px; max-height: 110px; object-fit: contain; border-radius: 8px; }',
      '.prod-body p { font-size: 9.8pt; }',
      '.prod-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 22px; margin-top: 8px; }',
      '.prod-cols h4 { margin: 6px 0 2px; font-size: 9pt; color: #14335f; text-transform: uppercase; letter-spacing: .8px; }',
      '.prod-cols ul { margin: 0 0 0 16px; padding: 0; }',
      '.prod-cols li { font-size: 9pt; line-height: 1.5; color: #374151; }',
      '.prod-foot { margin-top: 8px; font-size: 8.5pt; color: #6b7280; display: flex; gap: 16px; }',
      '.prod-foot a { color: #1a56db; }',
      // precos (FB-22 sub-item 2: bordas completas em todas as celulas, alinhamento monetario explicito)
      '.price-table { width: 100%; border-collapse: collapse; margin: 10px 0 6px; border: 1px solid #14335f; }',
      '.price-table th { background: #14335f; color: #fff; padding: 8px 10px; text-align: left; font-size: 9.5pt; letter-spacing: .4px; border: 1px solid #14335f; vertical-align: middle; }',
      '.price-table td { border: 1px solid #c9d3e0; padding: 7px 10px; font-size: 10pt; vertical-align: top; }',
      '.price-table td.num, .price-table th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.price-table td.cen, .price-table th.cen { text-align: center; }',
      '.price-table tbody tr:nth-child(even):not(.total) td { background: #f8fafc; }',
      '.price-table .srv td { font-style: italic; color: #374151; }',
      '.price-table tbody tr.total td { background: #1a56db !important; color: #fff; font-weight: 800; font-size: 11pt; border: 1px solid #14335f; }',
      '.price-table colgroup col.col-code { width: 78px; }',
      '.price-table colgroup col.col-ncm  { width: 70px; }',
      '.price-table colgroup col.col-qty  { width: 50px; }',
      '.price-table colgroup col.col-prc  { width: 110px; }',
      '.price-note { font-size: 8.5pt; color: #6b7280; text-align: justify; }',
      // condições
      '.cond-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 10px 0; }',
      '.cond { background: #f3f7ff; border: 1px solid #dbe7ff; border-radius: 10px; padding: 12px 14px; }',
      '.cond b { display: block; font-size: 8pt; color: #1a56db; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 4px; }',
      '.cond span { font-size: 10.5pt; font-weight: 600; color: #111827; }',
      // contatos / rodapé
      '.contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }',
      '.contact { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }',
      '.contact b { color: #14335f; font-size: 11pt; }',
      '.contact div { font-size: 9.5pt; color: #374151; }',
      '.foot { margin-top: 26px; padding-top: 10px; border-top: 2px solid #1a56db; font-size: 8.5pt; color: #6b7280; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }',
      // capa
      '.cover { min-height: 88vh; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }',
      '.cover .brand { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; }',
      '.cover .brand img.lg { height: 56px; }',
      '.cover .brand img.hx { height: 36px; }',
      '.cover .mid { text-align: left; margin-top: 90px; }',
      '.cover .kicker { color: #1a56db; font-weight: 700; letter-spacing: 2.5px; font-size: 10pt; text-transform: uppercase; }',
      '.cover h1 { font-size: 30pt; color: #14335f; margin: 8px 0 4px; line-height: 1.15; }',
      '.cover .for { font-size: 14pt; color: #374151; margin-top: 22px; }',
      '.cover .for b { color: #14335f; font-size: 17pt; display: block; }',
      '.cover .cv-meta { display: flex; gap: 28px; margin-top: 34px; }',
      '.cover .cv-meta div b { display:block; font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }',
      '.cover .cv-meta div span { font-size: 12pt; font-weight: 700; color: #111827; }',
      '.cover .cv-foot { border-top: 3px solid #1a56db; padding-top: 10px; font-size: 8.5pt; color: #6b7280; }',
      // sumário executivo
      '.exec { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0; }',
      '.exec .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }',
      '.exec .box.alert { background: #fff7ed; border-color: #fdba74; }',
      '.exec .box h4 { margin: 0 0 6px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .8px; color: #14335f; }',
      '.exec .box.alert h4 { color: #c2410c; }',
      '.exec .box p, .exec .box li { font-size: 9.8pt; margin: 4px 0; }',
      '.exec .box ul { margin: 2px 0 0 16px; padding: 0; }',
      '.badges { display: flex; gap: 10px; margin: 12px 0 4px; }',
      '.badge-i { flex: 1; background: #f3f7ff; border: 1px solid #dbe7ff; border-radius: 10px; padding: 10px 12px; text-align: center; font-size: 9pt; color: #14335f; font-weight: 600; }',
      '.badge-i span { display: block; font-size: 14pt; margin-bottom: 2px; }',
      // CTA / próximos passos
      '.cta { background: #14335f; color: #fff; border-radius: 12px; padding: 16px 20px; margin: 12px 0; }',
      '.cta h3 { margin: 0 0 8px; font-size: 12pt; letter-spacing: .5px; }',
      '.cta ol { margin: 4px 0 8px 18px; padding: 0; }',
      '.cta li { font-size: 10pt; line-height: 1.7; }',
      '.cta .accept { background: #1a56db; border-radius: 8px; padding: 8px 12px; font-size: 10pt; font-weight: 600; }',
      '.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 34px; }',
      '.sign div { border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 9pt; color: #374151; text-align: center; }',
      '.flow { display: flex; align-items: stretch; gap: 0; margin: 12px 0; page-break-inside: avoid; }',
      '.flow .fbox { flex: 1; border: 1.5px solid #1a56db; border-radius: 10px; padding: 10px 8px; text-align: center; background: #f3f7ff; }',
      '.flow .fbox b { display: block; font-size: 9.5pt; color: #14335f; }',
      '.flow .fbox span { font-size: 8pt; color: #6b7280; }',
      '.flow .farr { align-self: center; padding: 0 6px; color: #1a56db; font-weight: 800; font-size: 13pt; }'
    ].join('\n');

    // ── itens: separa equipamentos (com conteúdo) de linhas de serviço ──
    var _pdMap = _propBuildDescMap();
    var productRows = [];
    for (var i = 0; i < items.length; i++) {
      var item      = items[i];
      var qty       = safeNumber(item.qty || item.quantity);
      var unitPrice = safeNumber(item.unit_price || item.unitPrice || item.price);
      var content   = _propResolveProductContent(item, _pdMap);
      var isService = String(item.code || '').indexOf('SERV') === 0 ||
                      String(item.code || '').indexOf('MO-') === 0;
      productRows.push({
        content: content, isService: isService, code: item.code || '',
        name: content.name, ncm: item.ncm || '',
        qty: qty, unit_price: unitPrice, total: qty * unitPrice
      });
    }

    var nSensores = 0;
    var nomesEquip = [];
    for (var es = 0; es < productRows.length; es++) {
      if (!productRows[es].isService) {
        nSensores += productRows[es].qty;
        if (nomesEquip.indexOf(productRows[es].name) === -1) nomesEquip.push(productRows[es].name);
      }
    }
    var execSolution = 'Fornecimento e instalação de ' +
      (nSensores === 1 ? '1 equipamento Hydronix' : nSensores + ' equipamentos Hydronix') +
      (nomesEquip.length ? ' (' + nomesEquip.slice(0, 3).join(', ') + ')' : '') +
      ', integrados ao sistema de controle da planta, com comissionamento, calibração inicial e treinamento da equipe — entregues prontos para operar.';

    function _paras(text, cls) {
      return String(text || '').split('\n\n').map(function (par) {
        return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + _propEsc(par).replace(/\n/g, '<br>') + '</p>';
      }).join('');
    }

    function _bullets(arr, max) {
      var out = '';
      for (var b = 0; b < arr.length && b < (max || 99); b++) out += '<li>' + _propEsc(arr[b]) + '</li>';
      return out ? '<ul>' + out + '</ul>' : '';
    }

    // ── seção 2: cards dos equipamentos ──
    var productsListHtml = '';
    for (var j = 0; j < productRows.length; j++) {
      var pr = productRows[j];
      if (pr.isService) continue;
      var c = pr.content;
      productsListHtml +=
        '<div class="prod-card">' +
          '<div class="prod-head">' +
            '<div style="flex:1">' +
              '<h3>' + _propEsc(c.name) + (pr.qty > 1 ? ' <span style="color:#6b7280;font-size:10pt">× ' + pr.qty + '</span>' : '') + '</h3>' +
              (c.lead ? '<p class="lead">' + _propEsc(c.lead) + '</p>' : '') +
            '</div>' +
            (c.image_url ? '<div class="prod-img"><img src="' + _propEsc(c.image_url) + '" alt="' + _propEsc(c.name) + '"></div>' : '') +
          '</div>' +
          '<div class="prod-body">' + (c.fullDesc ? _paras(c.fullDesc) : '') + '</div>' +
          ((c.characteristics.length || c.applications.length) ?
            '<div class="prod-cols">' +
              (c.characteristics.length ? '<div><h4>Características</h4>' + _bullets(c.characteristics, 8) + '</div>' : '') +
              (c.applications.length    ? '<div><h4>Aplicações típicas</h4>' + _bullets(c.applications, 8) + '</div>' : '') +
            '</div>' : '') +
          '<div class="prod-foot">' +
            (pr.ncm ? '<span>NCM: ' + _propEsc(pr.ncm) + '</span>' : '') +
            (c.datasheet_url ? '<span>Folha de dados oficial: <a href="' + _propEsc(c.datasheet_url) + '">' + _propEsc(c.datasheet_url) + '</a></span>' : '') +
          '</div>' +
        '</div>';
    }
    if (!productsListHtml) productsListHtml = '<p>Nenhum produto adicionado.</p>';

    // ── seção 6: tabela de preços ──
    var priceRowsHtml = '';
    for (var k = 0; k < productRows.length; k++) {
      var pr2 = productRows[k];
      priceRowsHtml +=
        '<tr' + (pr2.isService ? ' class="srv"' : '') + '>' +
        '<td><code style="font-size:9pt">' + _propEsc(pr2.code || '') + '</code></td>' +
        '<td>' + _propEsc(pr2.name) + '</td>' +
        '<td>' + _propEsc(pr2.ncm) + '</td>' +
        '<td class="cen">' + pr2.qty + '</td>' +
        '<td class="num">' + _propFmtCurrency(pr2.unit_price) + '</td>' +
        '<td class="num">' + _propFmtCurrency(pr2.total) + '</td></tr>';
    }
    var startupValue = safeNumber(p.startup_value);
    var totalValue   = safeNumber(p.total_value);
    if (startupValue > 0) {
      priceRowsHtml += '<tr class="srv"><td colspan="5">Start-up — Comissionamento e Treinamento</td>' +
        '<td class="num">' + _propFmtCurrency(startupValue) + '</td></tr>';
    }
    var priceTableHtml =
      '<table class="price-table">' +
      '<colgroup>' +
        '<col class="col-code"><col><col class="col-ncm"><col class="col-qty">' +
        '<col class="col-prc"><col class="col-prc">' +
      '</colgroup>' +
      '<thead><tr>' +
      '<th>Código</th><th>Produto / Serviço</th><th>NCM</th><th class="cen">Qtd.</th>' +
      '<th class="num">Preço Unit.</th><th class="num">Total</th>' +
      '</tr></thead><tbody>' + priceRowsHtml +
      '<tr class="total"><td colspan="5">VALOR TOTAL DA PROPOSTA</td>' +
      '<td class="num">' + _propFmtCurrency(totalValue) + '</td></tr>' +
      '</tbody></table>';

    // Fluxograma da solução: editável (flow_json) com padrão automático
    var flowBoxes = null;
    if (p.flow_json) {
      try {
        var parsedFlow = JSON.parse(p.flow_json);
        if (parsedFlow && parsedFlow.length) flowBoxes = parsedFlow;
      } catch (eFlow) { /* inválido: cai no automático */ }
    }
    if (!flowBoxes) flowBoxes = _propBuildDefaultFlow(productRows);

    var farr = '<div class="farr">→</div>';
    var flowParts = [];
    for (var fb = 0; fb < flowBoxes.length; fb++) {
      flowParts.push('<div class="fbox"><b>' + _propEsc(flowBoxes[fb].title || '') + '</b>' +
        (flowBoxes[fb].sub ? '<span>' + _propEsc(flowBoxes[fb].sub) + '</span>' : '') + '</div>');
    }
    var flowHtml = flowParts.length ? '<div class="flow">' + flowParts.join(farr) + '</div>' : '';

    var scopeHtml = (p.scope_text ? _paras(p.scope_text) : '<p>—</p>') + flowHtml;
    var obsHtml   = p.observations ? '<p>' + _propEsc(p.observations).replace(/\n/g, '<br>') + '</p>' : '<p>—</p>';

    function sec(n, t) { return '<div class="sec"><div class="n">' + n + '</div><h2>' + t + '</h2></div>'; }

    var html =
      '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>Proposta ' + _propEsc(p.number) + ' — ' + _propEsc(clientName) + '</title>\n' +
      '<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
      '<div class="no-print" style="margin-bottom:16px">' +
      '<button onclick="window.print()" style="padding:9px 22px;background:#1a56db;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11pt;font-weight:600">🖨️ Imprimir / Salvar PDF</button>' +
      '</div>\n' +
      // ───────── CAPA (primazia: a primeira impressão é o cliente, não nós)
      '<div class="cover">' +
        '<div class="brand">' +
          '<img class="lg" src="' + LOGO_ALLEGRO + '" alt="Allegro Engenharia e Desenvolvimento">' +
          '<div style="text-align:right"><img class="hx" src="' + LOGO_HYDRONIX + '" alt="Hydronix"><div style="font-size:8pt;color:#6b7280;letter-spacing:.5px">Authorized Reseller — Brasil</div></div>' +
        '</div>' +
        '<div class="mid">' +
          '<div class="kicker">Proposta Técnica Comercial · ' + _propEsc(p.number) + '</div>' +
          '<h1>Controle de umidade em tempo real,<br>direto no fluxo do seu processo</h1>' +
          '<div class="for">Preparada para<b>' + _propEsc(clientName) + (p.location ? ' — ' + _propEsc(p.location) : '') + '</b></div>' +
          '<div class="cv-meta">' +
            '<div><b>Data</b><span>' + _propEsc(dateFormatted) + '</span></div>' +
            '<div><b>Segmento</b><span>' + _propEsc(p.type) + '</span></div>' +
            (p.validity_days ? '<div><b>Válida por</b><span>' + safeNumber(p.validity_days) + ' dias</span></div>' : '') +
            (p.responsible ? '<div><b>A/C</b><span>' + _propEsc(p.responsible) + '</span></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="cv-foot">Allegro Engenharia e Desenvolvimento · Distribuidor oficial Hydronix no Brasil · allegro.eng.br</div>' +
      '</div>\n' +
      '<div class="hd">' +
        '<img class="logo" src="' + LOGO_ALLEGRO + '" alt="Allegro Engenharia e Desenvolvimento">' +
        '<div class="reseller"><img src="' + LOGO_HYDRONIX + '" alt="Hydronix"><span>Authorized Reseller — Brasil</span></div>' +
      '</div>\n' +
      '<div class="meta">' +
        '<div><b>Orçamento</b><span>' + _propEsc(p.number) + '</span></div>' +
        '<div><b>Data</b><span>' + _propEsc(dateFormatted) + '</span></div>' +
        '<div><b>Segmento</b><span>' + _propEsc(p.type) + '</span></div>' +
        '<div><b>Cliente</b><span>' + _propEsc(clientName) + '</span></div>' +
        '<div><b>Local</b><span>' + _propEsc(p.location || '—') + '</span></div>' +
        '<div><b>A/C</b><span>' + _propEsc(p.responsible || '—') + '</span></div>' +
      '</div>\n' +
      sec(1, 'Sumário Executivo') +
      '<div class="exec">' +
        '<div class="box alert"><h4>O custo invisível da umidade</h4>' +
          '<p>Em grãos e rações, umidade fora do alvo cobra caro duas vezes: secar além do necessário consome energia e retira massa vendável; umidade alta gera risco de qualidade, reprocesso e penalidades comerciais. Sem medição contínua, esse custo não aparece em nenhuma fatura — fica diluído no rendimento e na conta de energia, todos os dias.</p></div>' +
        '<div class="box"><h4>A solução proposta</h4>' +
          '<p>' + _propEsc(execSolution) + '</p></div>' +
        '<div class="box"><h4>O que muda na operação</h4><ul>' +
          '<li>Desvio de umidade visível em tempo real (25 leituras/segundo) — correção no ato, não no laudo do dia seguinte;</li>' +
          '<li>Padronização entre lotes e turnos, com histórico e relatórios exportáveis;</li>' +
          '<li>Acesso remoto para leituras, calibração e suporte da Allegro sem mobilização.</li></ul></div>' +
        '<div class="box"><h4>Investimento</h4>' +
          '<p style="font-size:13pt;font-weight:800;color:#14335f;margin:2px 0">' + _propFmtCurrency(totalValue) + '</p>' +
          '<p>Fornecimento completo: equipamentos, infraestrutura, instalação, start-up e treinamento — detalhado na seção 6.' + (p.validity_days ? ' Condições válidas por ' + safeNumber(p.validity_days) + ' dias.' : '') + '</p></div>' +
      '</div>' +
      '<div class="badges">' +
        '<div class="badge-i"><span>🌍</span>Hydronix — referência mundial em medição de umidade por micro-ondas</div>' +
        '<div class="badge-i"><span>🇧🇷</span>Allegro — distribuidor oficial, com instalações em todo o Brasil</div>' +
        '<div class="badge-i"><span>🛡️</span>Garantia de 24 meses + suporte em português</div>' +
      '</div>' +
      _paras(INTRO_COMMIT) +
      sec(2, 'Descrição dos Produtos') + productsListHtml +
      sec(3, 'Escopo de Fornecimento') + scopeHtml +
      sec(4, 'Acompanhamento e Relatórios') + _paras(MONITORING) +
      sec(5, 'Calibração') + _paras(CALIBRATION) +
      sec(6, 'Investimento') + priceTableHtml + '<p class="price-note">' + _propEsc(PRICE_NOTE) + '</p>' +
      sec(7, 'Condições Comerciais') +
      '<div class="cond-grid">' +
        '<div class="cond"><b>Pagamento</b><span>' + _propEsc(p.payment_terms || '—') + '</span></div>' +
        '<div class="cond"><b>Prazo de entrega</b><span>' + (p.delivery_days ? safeNumber(p.delivery_days) + ' dias úteis após confirmação do pedido' : '—') + '</span></div>' +
        '<div class="cond"><b>Validade da proposta</b><span>' + (p.validity_days ? safeNumber(p.validity_days) + ' dias corridos a partir desta data' : '—') + '</span></div>' +
      '</div>' +
      sec(8, 'Observações') + obsHtml +
      sec(9, 'Garantia') + '<p>' + _propEsc(WARRANTY) + '</p>' +
      sec(10, 'Próximos Passos') +
      '<div class="cta">' +
        '<h3>Como avançamos a partir daqui</h3>' +
        '<ol>' +
          '<li><b>Aceite:</b> responda o e-mail desta proposta com "De acordo" (ou assine abaixo) — isso reserva equipamentos e agenda;</li>' +
          '<li><b>Kick-off técnico:</b> em até 5 dias úteis alinhamos cronograma, pontos de instalação e responsabilidades;</li>' +
          '<li><b>Instalação e start-up:</b> equipamentos entregues, instalados, calibrados e equipe treinada — operação assistida desde o primeiro dia.</li>' +
        '</ol>' +
        '<div class="accept">✔ Validade desta proposta: ' + (p.validity_days ? safeNumber(p.validity_days) + ' dias' : 'consultar') + ' — após o prazo, valores e prazos de entrega serão reconfirmados.</div>' +
      '</div>' +
      '<div class="contact-grid">' +
        '<div class="contact"><b>Gema Fontana</b><div>Departamento Comercial</div>' +
        '<div>contato@allegro.eng.br · (45) 99946-0898</div></div>' +
        '<div class="contact"><b>Jonatan Miranda</b><div>Analista de Projetos</div>' +
        '<div>jonatan.miranda@allegro.eng.br · (41) 99155-5456</div></div>' +
      '</div>' +
      '<div class="sign">' +
        '<div>Allegro Engenharia e Desenvolvimento' + (companyCnpj ? '<br>CNPJ ' + _propEsc(companyCnpj) : '<br>CNPJ / Responsável') + '</div>' +
        '<div>' + _propEsc(clientName) + '<br>De acordo — nome, cargo e data</div>' +
      '</div>' +
      '<div class="foot">' +
        '<span>Allegro Engenharia e Desenvolvimento' + (companyCnpj ? ' · CNPJ ' + _propEsc(companyCnpj) : '') + ' — Rua Mal. Cândido Rondon, 3171 · Cancelli · Cascavel/PR · CEP 85811-080</span>' +
        '<span>allegro.eng.br · (45) 3037-5900</span>' +
      '</div>\n' +
      '</body>\n</html>';

    return { ok: true, html: html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// propSvcRevisarEscopoPorIA — revisao de escopo via Anthropic (FB-22.1)
// -------------------------------------------------------

/**
 * FB-22.1 — Revisao real do escopo via Anthropic Sonnet (claude-sonnet-4-6).
 *
 * Substitui o stub Haiku anterior. Chama a Anthropic Messages API com prompt
 * calibrado para revisao de proposta tecnica Allegro (ortografia, gramatica,
 * clareza, logica tecnica, profissionalismo, completude).
 *
 * Shape de retorno (envelope preservado para a UI atual):
 *   { ok: true,  data: { strengths:[], suggestions:[], improvedText, improved, tokens_usados } }
 *   { ok: false, error: 'mensagem' }
 *
 * Observacao back-compat: a UI (_pbBuildAIReviewPanel) ainda le
 * `review.improved`, portanto o campo `improved` espelha `improvedText`.
 *
 * @param {string} proposalId — opcional; se passado, enriquece o prompt com contexto
 * @param {string} scopeText — texto bruto do escopo a revisar
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function propSvcRevisarEscopoPorIA(proposalId, scopeText, intensity) {
  try {
    scopeText = String(scopeText || '').trim();
    if (!scopeText) throw new Error('Escopo vazio — nada para revisar.');
    // FB-22 v3 — calibragem da revisao (Joao escolheu B no Test 4):
    //   'leve'   -> so corrige ortografia/gramatica, mantem estilo
    //   'medio'  -> default, organiza e melhora sem inventar (atual)
    //   'ousado' -> enriquece com itens da proposta, vira 200-500 palavras
    intensity = String(intensity || 'medio').toLowerCase();
    if (intensity !== 'leve' && intensity !== 'ousado') intensity = 'medio';

    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurado em Script Properties.');

    // Contexto opcional: se houver proposalId, busca dados da proposta para
    // dar ao modelo chance de detectar inconsistencias logicas (ex: escopo
    // fala em silo de cimento mas itens sao sensores para agregados).
    var contextoProposta = '';
    if (proposalId) {
      try {
        var p = propRepoGetById(proposalId);
        if (p) {
          var items = [];
          try { items = JSON.parse(p.items_json || '[]'); } catch (eItems) {}
          var itemsTxt = items.slice(0, 8).map(function (it) {
            return '- ' + (it.name || it.code || '') + ' (qty: ' + (it.qty || it.quantity || 1) + ')';
          }).join('\n');
          contextoProposta =
            '\n\nCONTEXTO DA PROPOSTA (para coerencia logica):\n' +
            '- Cliente: ' + (p.client_name || '') + '\n' +
            '- Tipo: ' + (p.type || '') + '\n' +
            '- Local: ' + (p.location || '') + '\n' +
            (itemsTxt ? '- Itens principais:\n' + itemsTxt + '\n' : '') +
            '- Valor total: R$ ' + (p.total_value || 0) + '\n';
        }
      } catch (eCtx) { /* sem contexto se falhar — segue sem bloquear a revisao */ }
    }

    // FB-22 v3 — 3 prompts calibrados por intensidade (decisao B do Joao no Test 4):
    var systemPrompt;
    if (intensity === 'leve') {
      systemPrompt =
        'Voce e um revisor de texto da Allegro Engenharia (sensores Hydronix, automacao industrial).\n\n' +
        'Missao: revisar o escopo tecnico apenas pra CORRIGIR erros — NAO reescreva, NAO reorganize, NAO enriqueca.\n\n' +
        'Foque APENAS em:\n' +
        '1. ORTOGRAFIA: typos, acentos errados.\n' +
        '2. GRAMATICA: concordancia, pontuacao.\n' +
        '3. CLAREZA pontual: trocar 1 ou 2 palavras ambiguas.\n\n' +
        'NAO mude estilo, NAO adicione informacao, NAO use contexto dos itens, NAO invente.\n' +
        'O improvedText deve ser quase identico ao original — so com correcoes.\n\n' +
        'Retorne EXCLUSIVAMENTE JSON valido: { "strengths": [...max 2], "suggestions": [...max 3, so correcoes mecanicas], "improvedText": "texto original com correcoes aplicadas, ~mesmo tamanho do original" }.';
    } else if (intensity === 'ousado') {
      systemPrompt =
        'Voce e um revisor especialista da Allegro Engenharia, empresa de Curitiba que fornece sensores de umidade Hydronix (Hydro-Mix, Hydro-Probe, Hydro-View) e solucoes completas de automacao industrial (cimento, mineracao, agribusiness, plasticos).\n\n' +
        'Missao: REESCREVER o escopo tecnico como uma versao COMERCIAL e ROBUSTA pronta pra cliente.\n\n' +
        'Pode e DEVE:\n' +
        '- Usar contexto da proposta (cliente, itens, valor, local) pra montar texto especifico.\n' +
        '- Citar modelos dos equipamentos (HMXT01, Hydro-Mix XT, etc) pelo nome.\n' +
        '- Explicar servicos (MO-Infra, MO-Startup, Kit Infra) com detalhe.\n' +
        '- Reorganizar em blocos: (1) Fornecimento; (2) Instalacao/Infra; (3) Comissionamento e treinamento; (4) Suporte pos-venda; (5) Condicoes gerais.\n' +
        '- Texto entre 250-500 palavras, formal-tecnico, digno de cliente.\n' +
        'NAO pode:\n' +
        '- Inventar dados (especs nao mencionadas, prazos, garantias diferentes de 24m, valores).\n' +
        '- Usar conhecimento generico nao presente no contexto.\n\n' +
        'Retorne EXCLUSIVAMENTE JSON valido: { "strengths": [...max 4], "suggestions": [...max 5], "improvedText": "texto reescrito em blocos, 250-500 palavras" }.';
    } else {
      // medio (default)
      systemPrompt =
        'Voce e um revisor da Allegro Engenharia (sensores Hydronix, automacao industrial).\n\n' +
        'Missao: revisar o escopo tecnico com EQUILIBRIO — corrige erros, organiza, melhora clareza, SEM enfeitar demais.\n\n' +
        'Foco:\n' +
        '1. ORTOGRAFIA e GRAMATICA: corrige tudo.\n' +
        '2. CLAREZA: troca frases ambiguas por objetivas.\n' +
        '3. LOGICA: detecta inconsistencias com itens da proposta.\n' +
        '4. ORGANIZACAO: se o texto for desorganizado, agrupa em paragrafos coerentes.\n' +
        '5. COMPLETUDE: se faltar info CRUCIAL (ex: prazo de garantia padrao), apenas sinaliza em "suggestions", nao adiciona no improvedText.\n\n' +
        'NAO reescreva do zero. NAO invente especs. NAO use jargao novo.\n' +
        'O improvedText deve ser ~mesma extensao do original (+/- 30%), mais limpo e organizado.\n\n' +
        'Retorne EXCLUSIVAMENTE JSON valido: { "strengths": [...max 3], "suggestions": [...max 4], "improvedText": "texto corrigido e organizado, mesma extensao geral" }.';
    }

    var userPrompt;
    if (intensity === 'leve') {
      userPrompt = 'Corrija apenas ortografia/gramatica do escopo abaixo. Sem reescrever.\n\n```\n' + scopeText + '\n```';
    } else if (intensity === 'ousado') {
      userPrompt = 'Reescreva o escopo abaixo como uma versao COMERCIAL ROBUSTA pra cliente, usando o contexto da proposta (cliente, itens, valor). Texto final 250-500 palavras, em blocos.\n\nESCOPO ATUAL:\n```\n' + scopeText + '\n```' + contextoProposta;
    } else {
      userPrompt = 'Revise o escopo abaixo: corrija erros, organize, melhore clareza. Mantenha extensao similar ao original. Use o contexto so pra detectar inconsistencias, nao pra enriquecer.\n\nESCOPO ATUAL:\n```\n' + scopeText + '\n```' + contextoProposta;
    }

    var requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };

    var response;
    try {
      response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
      });
    } catch (eNet) {
      throw new Error('Falha de rede ao chamar Anthropic: ' + eNet.message);
    }

    var code = response.getResponseCode();
    var body = response.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error('Anthropic API erro ' + code + ': ' + body.substring(0, 400));
    }

    var parsed;
    try { parsed = JSON.parse(body); }
    catch (eParse) { throw new Error('Resposta da Anthropic nao e JSON: ' + body.substring(0, 200)); }

    if (parsed.error) {
      throw new Error('Anthropic API erro: ' + (parsed.error.message || JSON.stringify(parsed.error)));
    }
    if (!parsed.content || !parsed.content[0] || !parsed.content[0].text) {
      throw new Error('Resposta da Anthropic sem content[0].text');
    }

    // Limpa cercas de codigo defensivo (modelo as vezes encapsula em ```json ... ```)
    var raw = String(parsed.content[0].text).trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    var review;
    try { review = JSON.parse(raw); }
    catch (eJson) { throw new Error('Sonnet nao retornou JSON valido. Resposta: ' + raw.substring(0, 300)); }

    // Saneamento defensivo + back-compat com a UI atual.
    var strengthsArr   = Array.isArray(review.strengths)   ? review.strengths.slice(0, 4)   : [];
    var suggestionsArr = Array.isArray(review.suggestions) ? review.suggestions.slice(0, 5) : [];
    var improvedTxt    = String(review.improvedText || scopeText);

    var out = {
      strengths:     strengthsArr,
      suggestions:   suggestionsArr,
      improvedText:  improvedTxt,
      improved:      improvedTxt, // alias p/ _pbBuildAIReviewPanel (le review.improved)
      tokens_usados: parsed.usage ? (parsed.usage.input_tokens + parsed.usage.output_tokens) : 0
    };

    // Persiste no historico da proposta + timeline, se houver proposalId.
    if (proposalId) {
      try {
        propRepoUpdate(proposalId, {
          ai_review_notes: JSON.stringify(out),
          updated_at:      nowISO()
        });
        appendTimelineEvent('Proposta', proposalId, 'AI_REVIEW',
          'Escopo revisado por IA (Sonnet, intensidade=' + intensity + ')');
      } catch (ePersist) { /* nao bloqueia a UX se persistencia falhar */ }
    }
    appendAuditLog('IA_REVIEW_PROPOSAL', 'PROPOSALS', proposalId || '(novo)',
      'model=claude-sonnet-4-6 intensity=' + intensity + ' tokens=' + out.tokens_usados +
      ' strengths=' + out.strengths.length + ' suggestions=' + out.suggestions.length);

    return { ok: true, data: out };
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

/**
 * Mapa code -> {long_description, datasheet_url} lido UMA vez da aba PRODUCTS.
 */
function _propBuildDescMap() {
  var map = {};
  try {
    var rows = sheetToObjects(PRODUCTS_SHEET);
    for (var i = 0; i < rows.length; i++) {
      map[String(rows[i].code).trim().toUpperCase()] = {
        long_description: rows[i].long_description || '',
        datasheet_url:    rows[i].datasheet_url || '',
        image_url:        rows[i].image_url || ''
      };
    }
  } catch (e) { /* aba indisponível: cai no dicionário */ }
  return map;
}

/**
 * Resolve o conteúdo completo de um item da proposta.
 * Ordem: dicionário rico (HydronixContent) > fallback (ProductsContent) >
 * description do próprio item. A coluna long_description da planilha, quando
 * editada pelo time, substitui o parágrafo de abertura. Imagem e datasheet
 * vêm da planilha (seed automático).
 * @return {{name, lead, fullDesc, characteristics, applications, image_url, datasheet_url}}
 */
function _propResolveProductContent(item, pdMap) {
  var code = String(item.code || '').trim().toUpperCase();
  var out = {
    name: item.name || item.product_name || item.description || item.code || '',
    lead: '', fullDesc: '', characteristics: [], applications: [],
    image_url: '', datasheet_url: ''
  };
  var sheet = (pdMap && pdMap[code]) ? pdMap[code] : null;
  if (sheet) {
    out.image_url     = sheet.image_url || '';
    out.datasheet_url = sheet.datasheet_url || '';
  }

  var rico = (typeof HYDRONIX_PRODUCTS_CONTENT !== 'undefined') ? HYDRONIX_PRODUCTS_CONTENT[code] : null;
  if (rico && typeof rico === 'object') {
    out.name = rico.name || out.name;
    out.lead = rico.shortDesc || '';
    out.fullDesc = rico.fullDesc || '';
    out.characteristics = rico.characteristics || [];
    out.applications = rico.applications || [];
  } else if (typeof ALLEGRO_PRODUCT_DESCRIPTIONS !== 'undefined' && ALLEGRO_PRODUCT_DESCRIPTIONS[code]) {
    out.lead = ALLEGRO_PRODUCT_DESCRIPTIONS[code];
  } else {
    out.lead = item.description || item.desc || '';
  }

  // Edição do time na planilha tem a palavra final sobre o parágrafo de abertura
  if (sheet && sheet.long_description) {
    var sld = String(sheet.long_description).trim();
    var corrompida = sld.indexOf('{shortDesc=') === 0 || sld.indexOf('[object') !== -1 || sld.indexOf('[Ljava') !== -1;
    if (sld && !corrompida) out.lead = sld;
  }
  return out;
}

function _propGetProductDescription(item, pdMap) {
  var name = item.code || item.name || item.product_name || '';
  var key0 = String(name).trim().toUpperCase();
  // 1ª fonte: coluna long_description da aba PRODUCTS (editável pelo time)
  if (pdMap && pdMap[key0] && pdMap[key0].long_description) {
    return pdMap[key0].long_description;
  }
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


/**
 * Fluxograma padrão da solução, derivado dos itens da proposta.
 * @param {Array} productRows  [{code, isService, ...}]
 * @return {Array<{title:string, sub:string}>}
 */
function _propBuildDefaultFlow(productRows) {
  var temDisplay = false, temInterface = false;
  for (var i = 0; i < productRows.length; i++) {
    var c = String(productRows[i].code || '');
    if (c.indexOf('HV') === 0 || c.indexOf('HH') === 0 || c.indexOf('PH') === 0) temDisplay = true;
    if (c.indexOf('SIM') === 0 || c.indexOf('095') === 0 || c.indexOf('097') === 0) temInterface = true;
  }
  var boxes = [{ title: 'Sensor(es) Hydronix', sub: 'medição em fluxo, no processo' }];
  if (temInterface) boxes.push({ title: 'Cabeamento / Interface', sub: 'sinal digital blindado' });
  if (temDisplay)   boxes.push({ title: 'Hydro-View / Hydro-Hub', sub: 'visualização e calibração' });
  boxes.push({ title: 'CLP / Supervisório do cliente', sub: 'integração 4–20 mA · RS485 · fieldbus' });
  boxes.push({ title: 'Relatórios e acesso remoto', sub: 'Hydro-Com · histórico · suporte Allegro' });
  return boxes;
}

/**
 * Fluxograma padrão de uma proposta (para o editor da UI).
 * @param {string} proposalId
 * @return {Array<{title, sub}>}
 */
function propSvcDefaultFlow(proposalId) {
  var p = propRepoGetById(proposalId);
  if (!p) throw new Error('Proposta não encontrada: ' + proposalId);
  var items = [];
  try { items = JSON.parse(p.items_json || '[]') || []; } catch (e) {}
  var rows = [];
  for (var i = 0; i < items.length; i++) rows.push({ code: items[i].code || '' });
  return _propBuildDefaultFlow(rows);
}

/**
 * FB-23: Envia a proposta por e-mail com o PDF em anexo.
 * Pré-condições:
 *   - Proposta deve estar em status APROVADA_ENVIO ou superior (ENVIADA já validada).
 *   - PDF deve ter sido gerado (pdf_file_id preenchido).
 * Pós-condições:
 *   - Email enviado via MailApp ao destinatário.
 *   - Entrada em AUDIT_LOG e TIMELINE.
 *   - Status da proposta avança para ENVIADA (se ainda não estava).
 *
 * @param {string} proposalId
 * @param {Object} opts { to: string (obrigatorio), cc?: string, subject?: string, body?: string (HTML), replyTo?: string }
 * @return {{ok:true,data:{messageId,sentTo}}|{ok:false,error:string}}
 */
function propSvcEnviarPorEmail(proposalId, opts) {
  opts = opts || {};
  if (!proposalId) throw new Error('proposalId obrigatorio.');
  if (!opts.to || !/@/.test(opts.to)) throw new Error('Destinatario invalido em opts.to.');

  var p = propRepoGetById(proposalId);
  if (!p) throw new Error('Proposta nao encontrada: ' + proposalId);

  // Validacao de status: so envia se APROVADA_ENVIO ou ENVIADA
  var statusOk = (p.status === 'APROVADA_ENVIO' || p.status === 'ENVIADA');
  if (!statusOk) throw new Error('Proposta ' + proposalId + ' nao esta APROVADA_ENVIO (status atual: ' + p.status + '). Avance o status antes de enviar.');

  // PDF anexo: se nao tiver pdf_file_id, tenta gerar agora (best effort)
  var pdfBlob = null;
  if (p.pdf_file_id) {
    try {
      var file = DriveApp.getFileById(p.pdf_file_id);
      pdfBlob = file.getAs(MimeType.PDF);
      pdfBlob.setName('Proposta_' + (p.number || proposalId) + '.pdf');
    } catch (eDrv) {
      Logger.log('[propSvcEnviar] pdf_file_id invalido: ' + eDrv.message);
    }
  }
  // Se nao conseguiu blob, segue sem anexo (mas avisa no log)
  if (!pdfBlob) Logger.log('[propSvcEnviar] AVISO: enviando proposta ' + proposalId + ' SEM PDF anexo.');

  // Subject e body padroes (sobrescreviveis)
  var clientName = p.client_name || '';
  var defaultSubject = 'Proposta Comercial Allegro Engenharia — ' + (p.number || proposalId);
  var defaultBody =
    '<p>Prezado(a),</p>' +
    '<p>Segue em anexo a proposta comercial <b>' + escapeForHtml(p.number || proposalId) + '</b> referente ao projeto solicitado.</p>' +
    '<p>Estamos a disposicao para esclarecer qualquer duvida ou ajustar o escopo conforme necessario.</p>' +
    '<p>Atenciosamente,<br><b>Equipe Comercial Allegro Engenharia</b></p>';

  var subject = opts.subject || defaultSubject;
  var bodyHtml = opts.body || defaultBody;

  var mailOpts = {
    to: opts.to,
    subject: subject,
    htmlBody: bodyHtml,
    name: 'Allegro Engenharia'
  };
  if (opts.cc) mailOpts.cc = opts.cc;
  if (opts.replyTo) mailOpts.replyTo = opts.replyTo;
  if (pdfBlob) mailOpts.attachments = [pdfBlob];

  try {
    MailApp.sendEmail(mailOpts);
  } catch (eMail) {
    throw new Error('Falha ao enviar e-mail: ' + eMail.message);
  }

  // Avancar status para ENVIADA se ainda estava em APROVADA_ENVIO
  if (p.status === 'APROVADA_ENVIO') {
    try {
      propSvcUpdateStatus(proposalId, 'ENVIADA', requireAuth().id, requireAuth().role, { nota: 'Enviada para ' + opts.to });
    } catch (eSt) {
      Logger.log('[propSvcEnviar] avancar status ENVIADA falhou: ' + eSt.message);
    }
  }

  appendAuditLog('PROPOSAL_EMAIL_SENT', 'PROPOSALS', proposalId,
    'to=' + opts.to + (opts.cc ? ' cc=' + opts.cc : '') + (pdfBlob ? ' [pdf]' : ' [sem pdf]'));
  appendTimelineEvent('Proposta', proposalId, 'EMAIL_SENT',
    'Proposta enviada por e-mail para ' + opts.to + (pdfBlob ? ' (PDF anexo)' : ' (sem PDF)'));

  return {
    ok: true,
    messageId: '(MailApp nao retorna messageId)',
    sentTo: opts.to,
    cc: opts.cc || '',
    pdfAnexo: !!pdfBlob,
    newStatus: 'ENVIADA'
  };
}

// helper escape se nao existir global
function escapeForHtml(s) {
  s = String(s == null ? '' : s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
