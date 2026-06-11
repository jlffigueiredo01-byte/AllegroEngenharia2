// ============================================================
// Domain.Agenda.Model.gs — ALLEGRO Business System
// Constantes, headers e tipos do módulo de Agenda/Calendário.
// ECOSSISTEMA_V2 §4 + ADENDO_V2_1 §H
// ============================================================

/** Nome da aba de registro de eventos no ALLEGRO_LOGS (ou planilha corrente). */
var CALENDAR_EVENTS_SHEET = 'CALENDAR_EVENTS';

/**
 * Cabeçalhos da aba CALENDAR_EVENTS.
 * Ordem dos campos reflete a sequência de colunas na planilha.
 */
var CALENDAR_EVENTS_HEADERS = [
  'id',
  'event_type',
  'title',
  'description',
  'start_at',
  'end_at',
  'all_day',
  'attendees_json',   // JSON array de e-mails dos participantes
  'google_event_id',
  'meet_link',
  'related_entity',   // 'PROPOSAL' | 'OPPORTUNITY' | 'PROJECT' | 'TICKET'
  'related_id',
  'created_by',
  'created_at',
  'updated_at'
];

/**
 * Tipos de evento permitidos no sistema.
 * Usar sempre estas constantes ao criar eventos.
 */
var AGENDA_EVENT_TYPES = [
  'VISITA_COMERCIAL',
  'REUNIAO_TECNICA',
  'KICKOFF',
  'FOLLOW_UP',
  'CALIBRACAO',
  'MANUTENCAO_PREVENTIVA',
  'TREINAMENTO',
  'OUTRO'
];

// Observação de configuração:
// CALENDAR_ID — chave em CONFIG com o ID do calendário Google do sistema.
//               Se vazio ou ausente, usa o calendário padrão da conta.
// CALENDAR_EVENT_COUNTER — contador sequencial de eventos (valor inicial: 0).
//   Ambas devem ser inseridas via initCoreSheets() nos CONFIG_DEFAULTS.
