// =============================================================================
// Domain.NotasFiscais.Model.gs
// Allegro Business System — Fase F7
// Constantes e inicialização da aba INVOICES_DB
// =============================================================================

/** Nome da aba de notas fiscais na planilha. */
var INVOICES_SHEET = 'INVOICES_DB';

/** Cabeçalhos da aba INVOICES_DB (ordem canônica). */
var INVOICES_HEADERS = [
  'id',
  'nf_key',
  'number',
  'direction',
  'cnpj',
  'partner_name',
  'issue_date',
  'total',
  'proposal_id',
  'file_id',
  'status_pagamento',
  'due_date',
  'parcelas_json',
  'created_at',
  'updated_at'
];

/**
 * Direção da nota fiscal:
 * - EMITIDA: NF emitida pela Allegro (venda de serviço/produto → A_RECEBER)
 * - RECEBIDA: NF recebida de fornecedor (compra → A_PAGAR)
 */
var NF_DIRECTION = {
  EMITIDA:  'EMITIDA',
  RECEBIDA: 'RECEBIDA'
};

/**
 * Status de pagamento da nota fiscal.
 * EMITIDA → A_RECEBER → RECEBIDA
 * RECEBIDA → A_PAGAR  → PAGA
 */
var NF_STATUS_PAG = {
  A_RECEBER: 'A_RECEBER',
  RECEBIDA:  'RECEBIDA',
  A_PAGAR:   'A_PAGAR',
  PAGA:      'PAGA'
};

/**
 * Inicializa a aba INVOICES_DB com os cabeçalhos canônicos.
 * Chamado pelo initCoreSheets() em Core.Setup.gs.
 */
function initInvoicesSheet() {
  getOrCreateSheet(INVOICES_SHEET, INVOICES_HEADERS);
}
