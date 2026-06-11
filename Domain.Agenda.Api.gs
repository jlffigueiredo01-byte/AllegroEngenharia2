// ============================================================
// Domain.Agenda.Api.gs — ALLEGRO Business System
// Ponto de entrada público (chamado pelo frontend / doPost) para
// as operações do módulo de Agenda/Calendário.
// ECOSSISTEMA_V2 §4 + ADENDO_V2_1 §H
// ============================================================

/**
 * Cria um evento de agenda no Google Calendar e registra no sistema.
 *
 * Roles permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {Object} data - Ver assinatura de agendaSvcCriarEvento().
 * @return {{ok: boolean, data?: Object, error?: string}}
 */
function Api_agendaCriarEvento(data) {
  try {
    var user = requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);
    return { ok: true, data: agendaSvcCriarEvento(data, user.id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os eventos dos próximos N dias para o usuário autenticado.
 *
 * Roles permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {number} [diasAfrente=7] - Janela em dias.
 * @return {{ok: boolean, data?: Object[], error?: string}}
 */
function Api_agendaGetProximos(diasAfrente) {
  try {
    var user = requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);
    return { ok: true, data: agendaSvcGetProximos(user.id, diasAfrente || 7) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os eventos vinculados a uma entidade específica.
 *
 * Roles permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {string} entity   - Tipo da entidade: 'PROPOSAL', 'OPPORTUNITY', 'PROJECT', 'TICKET'.
 * @param {string} entityId - ID da entidade.
 * @return {{ok: boolean, data?: Object[], error?: string}}
 */
function Api_agendaGetByEntity(entity, entityId) {
  try {
    requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);
    return { ok: true, data: agendaRepoGetByEntity(entity, entityId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna a lista de tipos de evento disponíveis no sistema.
 *
 * Roles permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @return {{ok: boolean, data?: string[], error?: string}}
 */
function Api_agendaGetEventTypes() {
  try {
    requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);
    return { ok: true, data: AGENDA_EVENT_TYPES };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
