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
  'origem_erro',          // CLIENTE | HYDRONIX | ALLEGRO | NAO_IDENTIFICADO (endgate do fechamento)
  'cobranca_de',          // quem paga os custos: HYDRONIX | CLIENTE | ALLEGRO (absorvido)
  'cobranca_status',      // PENDENTE | COBRADO | ABSORVIDO
  'custo_total',          // soma dos lançamentos de custo (updates tipo CUSTO)
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


/** Aba de interações do chamado (comentários, anexos, mudanças de status). */
var TICKET_UPDATES_SHEET = 'TICKET_UPDATES';
var TICKET_UPDATES_HEADERS = [
  'id', 'ticket_id', 'timestamp', 'user_id', 'user_name',
  'tipo',        // COMENTARIO | STATUS | ANEXO | SISTEMA | CUSTO
  'texto',
  'anexo_url', 'anexo_name',
  'valor'        // R$ do lançamento quando tipo = CUSTO
];

function initTicketUpdatesSheet() {
  getOrCreateSheet(TICKET_UPDATES_SHEET, TICKET_UPDATES_HEADERS);
  _tktEnsureColumns();
}


/** Origens de erro (adaptação do PPI/MPI/SPI/CPI da indústria). */
var TICKET_ORIGEM_ERRO = {
  CLIENTE:          'CLIENTE',          // mau uso, infraestrutura, operação (≈ CPI)
  HYDRONIX:         'HYDRONIX',         // defeito de fabricação — garantia do fabricante (≈ SPI)
  ALLEGRO:          'ALLEGRO',          // erro nosso: especificação, instalação, configuração (≈ MPI)
  NAO_IDENTIFICADO: 'NAO_IDENTIFICADO'  // sem defeito confirmado / inconclusivo
};

/** Garante as colunas novas em abas pré-existentes. Idempotente. */
function _tktEnsureColumns() {
  try {
    var defs = [
      { sheet: TICKETS_SHEET, headers: TICKETS_HEADERS,
        need: ['origem_erro', 'cobranca_de', 'cobranca_status', 'custo_total'] },
      { sheet: TICKET_UPDATES_SHEET, headers: TICKET_UPDATES_HEADERS, need: ['valor'] }
    ];
    for (var d = 0; d < defs.length; d++) {
      var sh = getOrCreateSheet(defs[d].sheet, defs[d].headers);
      var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      for (var i = 0; i < defs[d].need.length; i++) {
        if (hs.indexOf(defs[d].need[i]) === -1) {
          sh.getRange(1, sh.getLastColumn() + 1).setValue(defs[d].need[i]);
        }
      }
    }
  } catch (e) {
    Logger.log('_tktEnsureColumns: ' + e.message);
  }
}
