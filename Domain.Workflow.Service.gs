// ============================================================
// Domain.Workflow.Service.gs — ALLEGRO Business System
// Motor de workflow para transições de propostas (Fase F3).
//
// Responsabilidades:
//   1. Criar Action Cards automaticamente em cada transição
//   2. Fechar automaticamente os cards da transição anterior (autocomplete §3.2)
//   3. Verificar alçadas antes de transições bloqueantes (§3.1)
//   4. Verificar SLAs estourados (job agendado)
//
// Invocado por: Domain.Proposals.Service (propSvcUpdateStatus)
//              Domain.Projetos.Service (futuro)
// ============================================================

// -------------------------------------------------------
// Ponto de entrada principal
// -------------------------------------------------------

/**
 * Processa uma transição de estado de proposta:
 *   1. Fecha cards de workflow abertos da transição anterior (autocomplete §3.2)
 *   2. Cria os cards definidos para a nova transição
 *
 * Chamado APÓS a persistência do novo status em propSvcUpdateStatus.
 * A função é tolerante a falhas — erros internos são registrados no log
 * mas NÃO propagados ao chamador para não bloquear a transição.
 *
 * @param {Object} proposal     - proposta completa (id, title, total_value, alcada_nivel)
 * @param {string} statusFrom   - estado anterior (ex: 'DEMANDA')
 * @param {string} statusTo     - novo estado (ex: 'LEVANTAMENTO')
 * @param {string} userId       - ID do usuário que executou a transição
 */
function wfSvcProcessarTransicao(proposal, statusFrom, statusTo, userId) {
  try {
    // 1. Encontra a definição da transição
    var transicao = _wfFindTransicao(statusFrom, statusTo);
    if (!transicao) {
      // Transição sem cards definidos (ex: CANCELADA, SUBSTITUIDA) — nada a fazer
      return;
    }

    // 2. Fecha cards de workflow abertos da transição anterior (autocomplete §3.2)
    _wfFecharCardsAnteriores(proposal.id, userId);

    // 3. Determina o nível de alçada da proposta
    var alcada = _wfGetAlcada(safeNumber(proposal.total_value || 0));

    // 4. Cria os novos cards conforme a definição da transição
    for (var i = 0; i < transicao.cards.length; i++) {
      var cardDef = transicao.cards[i];

      // Se o card requer alçada COMPLETA e a proposta é SIMPLIFICADA, pula
      if (cardDef.alcada_required && alcada === 'SIMPLIFICADA') {
        appendAuditLog(
          'WF_CARD_SKIP',
          'PROPOSALS',
          proposal.id,
          'Card ' + cardDef.tipo + ' não criado: alçada SIMPLIFICADA'
        );
        continue;
      }

      // Card bloqueante apenas quando alcada_required === true e alcada === 'COMPLETA'
      var bloqueante = !!(cardDef.alcada_required && alcada === 'COMPLETA');
      _wfCriarCard(proposal, cardDef, userId, bloqueante);
    }

    appendAuditLog(
      'WF_TRANSICAO',
      'PROPOSALS',
      proposal.id,
      statusFrom + ' → ' + statusTo + ' por ' + userId
    );

  } catch (e) {
    // Falhas no workflow são logadas mas não propagadas
    Logger.log('[Workflow] wfSvcProcessarTransicao falhou: ' + e.message);
    appendAuditLog(
      'WF_ERROR',
      'PROPOSALS',
      proposal.id,
      'Erro ao processar transição ' + statusFrom + ' → ' + statusTo + ': ' + e.message
    );
  }
}

// -------------------------------------------------------
// Validação de alçada (bloqueante)
// -------------------------------------------------------

/**
 * Verifica se uma proposta com alçada COMPLETA possui card de revisão
 * financeira (tipo REVISAO_FINANCEIRO) concluído.
 * Deve ser chamado em propSvcUpdateStatus antes de permitir
 * EM_REVISAO → APROVADA_ENVIO quando alcada_nivel === 'COMPLETA'.
 *
 * @param {string} proposalId  - ID da proposta
 * @param {string} alcadaNivel - 'SIMPLIFICADA' ou 'COMPLETA'
 * @return {boolean}           - true se a transição é permitida
 * @throws {Error}             - se bloqueado por alçada incompleta
 */
function wfSvcValidarRevisaoFinanceira(proposalId, alcadaNivel) {
  if (alcadaNivel === 'SIMPLIFICADA') {
    // Proposta abaixo da alçada: Maria revisa assíncrono em 24 h — não bloqueia
    return true;
  }

  // Usa acGetAll() do ActionCards Repository — sem acesso direto à sheet
  var rows = acGetAll();
  var cardAprovado = null;
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    if (
      String(c.quote_id) === String(proposalId) &&
      c.tipo             === 'REVISAO_FINANCEIRO' &&
      c.status           === 'CONCLUIDO'
    ) {
      cardAprovado = c;
      break;
    }
  }

  if (!cardAprovado) {
    throw new Error(
      'Proposta acima da alçada requer revisão financeira (card REVISAO_FINANCEIRO) ' +
      'concluída pelo FINANCEIRO_ADMIN antes de aprovar envio.'
    );
  }

  return true;
}

// -------------------------------------------------------
// SLA check (job agendado)
// -------------------------------------------------------

/**
 * Verifica todos os cards de workflow com status ABERTO cujo due_at
 * já passou e os marca como SLA_ESTOURADO.
 * Registrado no SCHEDULER_JOBS como 'wf-sla' às 7h diariamente.
 *
 * @return {number} quantidade de cards atualizados
 */
function wfCheckSlaEstourados() {
  var agora = new Date();
  // Usa acGetAll() do ActionCards Repository — sem acesso direto à sheet
  var rows  = acGetAll();
  var count = 0;

  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    if (c.status !== 'ABERTO' || !c.due_at) continue;
    if (new Date(c.due_at) < agora) {
      // Usa acUpdateStatus() do ActionCards Repository — sem acesso direto à sheet
      acUpdateStatus(c.id, 'SLA_ESTOURADO', 'SYSTEM', 'SLA estourado via verificação automática');
      count++;
    }
  }

  appendAuditLog(
    'WF_SLA_CHECK',
    'ACTION_CARDS',
    'SYSTEM',
    count + ' card(s) com SLA estourado marcados'
  );

  return count;
}

// -------------------------------------------------------
// Funções internas
// -------------------------------------------------------

/**
 * Fecha todos os cards de workflow (source === 'WORKFLOW') abertos
 * vinculados a uma proposta. Cards manuais (source !== 'WORKFLOW') não
 * são tocados — VALIDACAO_V3 §3.2: "Cards manuais continuam manuais."
 *
 * @param {string} proposalId  - ID da proposta
 * @param {string} fechadoPor  - ID do usuário responsável pela transição
 */
function _wfFecharCardsAnteriores(proposalId, fechadoPor) {
  var rows = acGetAll();

  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    if (
      String(c.quote_id) === String(proposalId) &&
      c.source            === 'WORKFLOW'         &&
      c.status            !== AC_STATUS.CONCLUIDO &&
      c.status            !== AC_STATUS.CANCELADO &&
      c.status            !== AC_STATUS.SLA_ESTOURADO
    ) {
      acCloseCard(c.id, fechadoPor, 'AUTOCOMPLETE_TRANSICAO', fechadoPor, 'Autocomplete: estado avançou');
    }
  }
}

/**
 * Determina o nível de alçada comparando o valor total da proposta
 * com a chave ALCADA_SIMPLIFICADA na aba SETUP_CALC.
 * Default conservador: 'COMPLETA' se a chave não existir.
 *
 * @param {number} totalProposta - valor total em BRL
 * @return {string}              - 'SIMPLIFICADA' ou 'COMPLETA'
 */
function _wfGetAlcada(totalProposta) {
  // Usa getConfigValue() de Core.Config — sem acesso direto à sheet
  var limiar = safeNumber(getConfigValue('ALCADA_SIMPLIFICADA'), 0);
  if (limiar === 0) return 'COMPLETA'; // default conservador
  return (safeNumber(totalProposta) < limiar) ? 'SIMPLIFICADA' : 'COMPLETA';
}

/**
 * Localiza a definição de transição no mapa WORKFLOW_TRANSITIONS
 * para o par (from, to) informado.
 *
 * @param {string} from - estado de origem
 * @param {string} to   - estado de destino
 * @return {Object|null} - objeto de transição ou null se não encontrado
 */
function _wfFindTransicao(from, to) {
  var keys = Object.keys(WORKFLOW_TRANSITIONS);
  for (var k = 0; k < keys.length; k++) {
    var t = WORKFLOW_TRANSITIONS[keys[k]];
    if (t.from === from && t.to === to) return t;
  }
  return null;
}

/**
 * Cria um Action Card de workflow na aba ACTION_CARDS.
 *
 * @param {Object}  proposal   - proposta (id, title)
 * @param {Object}  cardDef    - definição do card (assignee_role, title_prefix, tipo, sla_key)
 * @param {string}  criadoPor  - ID do usuário que disparou a transição
 * @param {boolean} bloqueante - se true, prioridade ALTA e impede avanço sem fechamento
 */
function _wfCriarCard(proposal, cardDef, criadoPor, bloqueante) {
  var slaH       = _wfGetSla(cardDef.sla_key);
  var assigneeId = _wfGetUserByRole(cardDef.assignee_role);
  var titulo     = cardDef.title_prefix + (proposal.title || proposal.id || '');

  var cardData = {
    title:        titulo,
    message:      '',
    quote_id:     proposal.id,
    pos_venda_id: '',
    urgent:       bloqueante ? 'TRUE' : 'FALSE',
    status:       AC_STATUS.ABERTO,
    assigned_to:  assigneeId,
    created_by:   criadoPor,
    created_at:   nowISO(),
    updated_at:   nowISO(),
    last_member:  criadoPor,
    last_note:    'Card criado automaticamente pelo workflow',
    tipo:         cardDef.tipo,
    source:       'WORKFLOW',
    bloqueante:   bloqueante ? 'TRUE' : 'FALSE',
    sla_h:        slaH,
    due_at:       _wfAddHoras(slaH),
    closed_by:    '',
    closed_at:    '',
    close_reason: ''
  };

  var cardId = acCreate(cardData);

  appendAuditLog(
    'WF_CARD_CREATE',
    'ACTION_CARDS',
    cardId,
    'Card ' + cardDef.tipo + ' criado para proposta ' + proposal.id +
    (bloqueante ? ' [BLOQUEANTE]' : '')
  );
}

/**
 * Lê o valor de SLA em horas do CONFIG para a chave informada.
 * Retorna 24 como fallback se a chave não existir.
 *
 * @param {string} slaKey - chave no CONFIG (ex: 'SLA_LEVANTAMENTO_H')
 * @return {number}       - prazo em horas
 */
function _wfGetSla(slaKey) {
  if (!slaKey) return 24;
  var val = getConfigValue(slaKey);
  if (val !== null && val !== '') {
    var n = parseFloat(val);
    if (!isNaN(n) && n > 0) return n;
  }
  return 24; // fallback
}

/**
 * Retorna o ID do primeiro usuário ativo com o papel informado.
 * Retorna string vazia se nenhum usuário encontrado (card fica sem assigned_to).
 *
 * @param {string} role - papel (ex: 'TECNICO', 'DIRETOR_COMERCIAL')
 * @return {string}     - user.id ou ''
 */
function _wfGetUserByRole(role) {
  // Usa getUsersByRole() de Core.Auth ou Domain.Users — sem acesso direto à sheet
  try {
    var found = getUsersByRole(role);
    if (found && found.length > 0) return found[0].id;
  } catch (e) {
    Logger.log('[Workflow] Papel não encontrado: ' + role + ' — ' + e.message);
  }
  return '';
}

/**
 * Retorna um ISO timestamp futuro correspondente a agora + horas.
 *
 * @param {number} horas - número de horas a somar
 * @return {string}      - ISO 8601
 */
function _wfAddHoras(horas) {
  var d = new Date();
  d.setTime(d.getTime() + safeNumber(horas, 24) * 3600000);
  return d.toISOString();
}
