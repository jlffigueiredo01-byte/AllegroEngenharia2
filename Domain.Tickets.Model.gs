// =============================================================================
// Domain.Tickets.Model.gs
// Allegro Business System — Fase F6
// Constantes e inicialização da aba TICKETS
// =============================================================================

/** Nome da aba de tickets na planilha. */
var TICKETS_SHEET = 'TICKETS';

/** Cabeçalhos da aba TICKETS (ordem canônica). */
var TICKETS_HEADERS = [
  'id',
  'title',
  'description',
  'status',
  'priority',
  'category',
  'company_id',
  'serial_id',            // id do registro em INSTALLED_BASE
  'opened_by',
  'assigned_to',
  'opened_at',
  'first_response_at',
  'resolved_at',
  'closed_at',
  'sla_response_h',       // valor do SLA de resposta em horas (lido do CONFIG)
  'sla_resolution_h',     // valor do SLA de resolução em horas (lido do CONFIG)
  'sla_response_ok',      // boolean: SLA de resposta cumprido
  'sla_resolution_ok',    // boolean: SLA de resolução cumprido
  'resolution_notes',
  'root_cause',
  'drive_folder_id',      // pasta no Drive para anexos (criada preguiçosamente)
  'created_at',
  'updated_at'
];

/**
 * Status possíveis de um ticket de atendimento.
 * Fluxo típico: ABERTO → EM_ATENDIMENTO → RESOLVIDO → FECHADO
 * AGUARDANDO_CLIENTE pode ocorrer entre EM_ATENDIMENTO e RESOLVIDO.
 */
var TICKET_STATUS = {
  ABERTO:              'ABERTO',
  EM_ATENDIMENTO:      'EM_ATENDIMENTO',
  AGUARDANDO_CLIENTE:  'AGUARDANDO_CLIENTE',
  RESOLVIDO:           'RESOLVIDO',
  FECHADO:             'FECHADO'
};

/**
 * Prioridades de ticket.
 * Determina os SLAs de resposta e resolução lidos do CONFIG.
 */
var TICKET_PRIORITY = {
  CRITICA: 'CRITICA',
  ALTA:    'ALTA',
  NORMAL:  'NORMAL',
  BAIXA:   'BAIXA'
};

/**
 * Categorias de ticket disponíveis.
 */
var TICKET_CATEGORIES = [
  'FALHA_HARDWARE',
  'FALHA_SOFTWARE',
  'MANUTENCAO_PREVENTIVA',
  'TREINAMENTO',
  'CALIBRACAO',
  'GARANTIA',
  'COMERCIAL',
  'OUTRO'
];

/**
 * Inicializa a aba TICKETS com os cabeçalhos canônicos.
 * Chamado pelo initCoreSheets() em Core.Setup.gs.
 */
function initTicketsSheet() {
  getOrCreateSheet(TICKETS_SHEET, TICKETS_HEADERS);
}
