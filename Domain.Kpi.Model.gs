// ============================================================
// Domain.Kpi.Model.gs — ALLEGRO Business System
// Modelo de domínio para KPIs do Painel de Direção (F9).
// Constantes, códigos e defaults de configuração.
// ============================================================

/** Nome da aba de snapshots KPI na planilha ALLEGRO_LOGS (ou ativa). */
var KPI_SNAPSHOT_SHEET = 'KPI_SNAPSHOT';

/** Cabeçalhos da aba de snapshots. */
var KPI_SNAPSHOT_HEADERS = [
  'id', 'snapshot_at', 'period', 'kpi_code', 'value', 'unit', 'context_json'
];

/**
 * Códigos dos 8 KPIs do Painel de Direção (§3.4).
 * Usado como chave primária nos snapshots e na API.
 */
var KPI_CODES = {
  PIPELINE_PONDERADO:   'PIPELINE_PONDERADO',
  WIN_RATE_12M:         'WIN_RATE_12M',
  TICKET_MEDIO_12M:     'TICKET_MEDIO_12M',
  MARGEM_REAL_MEDIA:    'MARGEM_REAL_MEDIA',
  CAIXA_PROJETADO_90D:  'CAIXA_PROJETADO_90D',
  BACKLOG_TOTAL:        'BACKLOG_TOTAL',
  PROJETOS_NO_PRAZO_PCT:'PROJETOS_NO_PRAZO_PCT',
  SLAS_ESTOURADOS:      'SLAS_ESTOURADOS'
};

/**
 * Probabilidade padrão por estágio do pipeline.
 * Sobrescritos pelas chaves PROB_<STAGE> na aba CONFIG.
 * Ex.: PROB_ENVIADA = 0.80 na CONFIG prevalece sobre o default abaixo.
 */
var PIPELINE_PROB_DEFAULTS = {
  DEMANDA:         0.10,
  LEVANTAMENTO:    0.20,
  PROPOSTA_GERADA: 0.30,
  EM_REVISAO:      0.50,
  APROVADA_ENVIO:  0.70,
  ENVIADA:         0.80
};
