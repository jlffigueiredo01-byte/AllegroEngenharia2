// =============================================================================
// Domain.Caixa.Model.gs
// Fase F16 — Livro Caixa + Reconciliação Mensal
// ADENDO_V2_1 §C | VALIDACAO_V3 §9 | ECOSSISTEMA_V2 §6
// =============================================================================

var CASH_LEDGER_SHEET    = 'CASH_LEDGER';
var RECONCILIATIONS_SHEET = 'RECONCILIATIONS';

var CASH_LEDGER_HEADERS = [
  'id', 'date', 'description', 'amount', 'direction',
  'category', 'reference_type', 'reference_id',
  'reconciled', 'reconciliation_id',
  'created_by', 'created_at', 'updated_at'
];

var RECONCILIATIONS_HEADERS = [
  'id', 'period',
  'saldo_inicial', 'total_entradas', 'total_saidas', 'saldo_final',
  'saldo_extrato',
  'diferenca',
  'ajustes_json',
  'status',
  'fechado_por', 'fechado_at',
  'created_at', 'updated_at'
];

/**
 * Categorias válidas por direção de movimento.
 * ENTRADA: recebimentos de clientes e similares.
 * SAIDA: despesas operacionais da empresa.
 */
var CASH_CATEGORIES = {
  ENTRADA: [
    'RECEBIMENTO_PROPOSTA',
    'ADIANTAMENTO',
    'PARCELA_ENTREGA',
    'ACEITE_TECNICO',
    'OUTROS_ENTRADA'
  ],
  SAIDA: [
    'COMPRA_EQUIPAMENTO',
    'MO_SUBCONTRATADA',
    'COMBUSTIVEL',
    'DESPESA_VIAGEM',
    'IMPOSTO',
    'DESPESA_OPERACIONAL',
    'OUTROS_SAIDA'
  ]
};

/**
 * Tipos de referência permitidos no campo reference_type.
 */
var CASH_REFERENCE_TYPES = ['NF', 'PO', 'MANUAL'];

/**
 * Cria as abas CASH_LEDGER e RECONCILIATIONS se ainda não existirem.
 * Idempotente — seguro para rodar em produção.
 */
function initCashLedgerSheet() {
  getOrCreateSheet(CASH_LEDGER_SHEET,    CASH_LEDGER_HEADERS);
  getOrCreateSheet(RECONCILIATIONS_SHEET, RECONCILIATIONS_HEADERS);
}
