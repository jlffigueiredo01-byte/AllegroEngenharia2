// ============================================================
// Domain.Agenda.Service.gs — ALLEGRO Business System
// Lógica de negócio do módulo de Agenda/Calendário.
// ECOSSISTEMA_V2 §4 + ADENDO_V2_1 §H
// ============================================================

/**
 * Cria um evento no Google Calendar e registra na aba CALENDAR_EVENTS.
 *
 * Observação sobre Google Meet: o CalendarApp nativo do GAS não expõe
 * a API de conferenceData para criar links Meet programaticamente.
 * Quando add_meet=true, o campo meet_link é preenchido com uma instrução
 * orientando o usuário a adicionar o Meet via edição do evento no Calendar.
 * Uma solução avançada requer a Calendar REST API (UrlFetchApp + OAuth).
 *
 * @param {Object} data - Dados do evento:
 *   {string}   data.event_type      - Tipo (ver AGENDA_EVENT_TYPES).
 *   {string}   data.title           - Título do evento (obrigatório).
 *   {string}   [data.description]   - Descrição.
 *   {string}   data.start_at        - ISO 8601 ou data legível (obrigatório).
 *   {string}   [data.end_at]        - ISO 8601; se omitido, +1h a partir do início.
 *   {boolean}  [data.all_day]       - Evento de dia inteiro.
 *   {string[]} [data.attendees]     - Array de e-mails dos participantes.
 *   {boolean}  [data.add_meet]      - Solicita criação de link Meet.
 *   {string}   [data.related_entity] - Entidade relacionada.
 *   {string}   [data.related_id]    - ID da entidade relacionada.
 * @param {string} createdBy - ID do usuário criador.
 * @return {Object} Registro do evento conforme CALENDAR_EVENTS_HEADERS.
 * @throws {Error} Se o título, a data de início ou o tipo de evento forem inválidos.
 */
function agendaSvcCriarEvento(data, createdBy) {
  if (!data.title) {
    throw new Error('Título do evento é obrigatório.');
  }
  if (!data.start_at) {
    throw new Error('Data/hora de início é obrigatória.');
  }
  if (AGENDA_EVENT_TYPES.indexOf(data.event_type) === -1) {
    throw new Error(
      'Tipo de evento inválido. Use: ' + AGENDA_EVENT_TYPES.join(', ')
    );
  }

  // Resolve calendário: usa CALENDAR_ID do CONFIG ou o padrão da conta
  var calendarId = _agendaGetCalendarId();
  var cal = calendarId
    ? CalendarApp.getCalendarById(calendarId)
    : CalendarApp.getDefaultCalendar();
  if (!cal) {
    throw new Error(
      'Calendário não encontrado. Configure CALENDAR_ID em CONFIG.'
    );
  }

  var startDate = new Date(data.start_at);
  // Se end_at não informado, define término em +1 hora
  var endDate = data.end_at
    ? new Date(data.end_at)
    : new Date(startDate.getTime() + 3600000);

  var eventOptions = {
    description: data.description || '',
    guests: (data.attendees || []).join(','),
    sendInvites: true
  };

  // Cria o evento no Google Calendar
  var calEvent = cal.createEvent(data.title, startDate, endDate, eventOptions);

  // Meet: CalendarApp não expõe criação direta de conferenceData
  var meetLink = '';
  if (data.add_meet) {
    meetLink = '(Meet: adicionar via edição do evento no Google Calendar)';
  }

  var eventRecord = {
    id:              'EVT-' + getAndIncrementCounter('CALENDAR_EVENT_COUNTER'),
    event_type:      data.event_type,
    title:           data.title,
    description:     data.description || '',
    start_at:        startDate.toISOString(),
    end_at:          endDate.toISOString(),
    all_day:         data.all_day ? 'TRUE' : 'FALSE',
    attendees_json:  JSON.stringify(data.attendees || []),
    google_event_id: calEvent.getId(),
    meet_link:       meetLink,
    related_entity:  data.related_entity || '',
    related_id:      data.related_id || '',
    created_by:      createdBy,
    created_at:      nowISO(),
    updated_at:      nowISO()
  };

  agendaRepoCreate(eventRecord);

  appendAuditLog(
    'AGENDA_CREATE',
    'CALENDAR_EVENTS',
    eventRecord.id,
    data.event_type + ': ' + data.title + ' em ' + data.start_at
  );

  return eventRecord;
}

/**
 * Conveniência: cria um evento de kick-off vinculado a um projeto.
 * Destinado a ser chamado por Domain.Projetos ao aprovar/iniciar um projeto.
 *
 * @param {string}   projectId    - ID do projeto.
 * @param {string}   projectTitle - Título do projeto (usado no nome do evento).
 * @param {string}   startAt      - ISO 8601 da data/hora de início do kick-off.
 * @param {string[]} attendees    - Array de e-mails dos participantes.
 * @param {string}   createdBy    - ID do usuário criador.
 * @return {Object} Registro do evento criado.
 */
function agendaSvcCriarKickoff(projectId, projectTitle, startAt, attendees, createdBy) {
  return agendaSvcCriarEvento({
    event_type:      'KICKOFF',
    title:           'Kick-off: ' + projectTitle,
    start_at:        startAt,
    attendees:       attendees || [],
    related_entity:  'PROJECT',
    related_id:      projectId,
    add_meet:        true
  }, createdBy);
}

/**
 * Retorna os eventos dos próximos N dias registrados no sistema.
 *
 * @param {string} userId      - ID do usuário (reservado; atualmente retorna todos os eventos).
 * @param {number} diasAfrente - Janela em dias (padrão: 7).
 * @return {Object[]} Lista de eventos próximos.
 */
function agendaSvcGetProximos(userId, diasAfrente) {
  return agendaRepoGetUpcoming(userId, diasAfrente || 7);
}

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

/**
 * Lê o valor de CALENDAR_ID a partir da aba CONFIG.
 * Retorna string vazia se a chave não estiver configurada.
 *
 * @return {string} ID do calendário ou ''.
 * @private
 */
function _agendaGetCalendarId() {
  // Usa getConfigValue() de Core.Config — sem acesso direto à sheet
  return getConfigValue('CALENDAR_ID') || '';
}
