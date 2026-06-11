// ============================================================
// Domain.Agenda.Repository.gs — ALLEGRO Business System
// Persistência dos eventos de agenda na aba CALENDAR_EVENTS.
// ECOSSISTEMA_V2 §4 + ADENDO_V2_1 §H
// ============================================================

/**
 * Persiste um novo registro de evento de agenda na planilha.
 * Usa LockService para evitar conflitos de escrita concorrente.
 *
 * @param {Object} event - Objeto com os campos de CALENDAR_EVENTS_HEADERS.
 */
function agendaRepoCreate(event) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(CALENDAR_EVENTS_SHEET, event, CALENDAR_EVENTS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os registros da aba CALENDAR_EVENTS como array de objetos.
 *
 * @return {Object[]} Lista de eventos.
 */
function agendaRepoGetAll() {
  return sheetToObjects(CALENDAR_EVENTS_SHEET);
}

/**
 * Retorna eventos vinculados a uma entidade específica do sistema.
 *
 * @param {string} entity   - Tipo da entidade: 'PROPOSAL', 'OPPORTUNITY', 'PROJECT', 'TICKET'.
 * @param {string} entityId - ID da entidade relacionada.
 * @return {Object[]} Eventos relacionados.
 */
function agendaRepoGetByEntity(entity, entityId) {
  return agendaRepoGetAll().filter(function(e) {
    return e.related_entity === entity && e.related_id === entityId;
  });
}

/**
 * Retorna eventos futuros dentro de uma janela de dias a partir de agora.
 * A filtragem por userId não é aplicada aqui (simplificação) — todos os
 * eventos do sistema dentro da janela são retornados.
 *
 * @param {string} userId      - ID do usuário solicitante (reservado para uso futuro).
 * @param {number} diasAfrente - Número de dias a considerar (padrão: 7).
 * @return {Object[]} Eventos dentro da janela.
 */
function agendaRepoGetUpcoming(userId, diasAfrente) {
  var agora = new Date();
  var limite = new Date();
  limite.setDate(limite.getDate() + (diasAfrente || 7));

  return agendaRepoGetAll().filter(function(e) {
    if (!e.start_at) return false;
    var start = new Date(e.start_at);
    return start >= agora && start <= limite;
  });
}
