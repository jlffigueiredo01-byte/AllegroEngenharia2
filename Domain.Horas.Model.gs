// =============================================================================
// Domain.Horas.Model.gs
// Allegro Business System — Fase F8 (Timesheet)
// Constantes, cabeçalhos e inicialização da aba TIME_ENTRIES.
// REGRA CRÍTICA: Horas de PROJETO nascem SÓ do RDO (automático).
//   A grade semanal cobre apenas categorias não-projeto.
// =============================================================================

/** Nome da aba de lançamentos de horas (fica em ALLEGRO_LOGS). */
var TIME_ENTRIES_SHEET = 'TIME_ENTRIES';

/** Cabeçalhos canônicos da aba TIME_ENTRIES. */
var TIME_ENTRIES_HEADERS = [
  'id',
  'user_id',
  'date',
  'category',
  'hours',
  'description',
  'project_id',   // preenchido apenas quando category = 'PROJETO' (vindo do RDO)
  'rdo_id',       // referência ao RDO quando origin = 'RDO'
  'origin',       // 'MANUAL' | 'RDO'
  'week_start',   // AAAA-MM-DD da segunda-feira da semana
  'created_at',
  'updated_at'
];

/**
 * Categorias disponíveis para lançamento MANUAL (grade semanal).
 * Não inclui PROJETO — horas de projeto são criadas automaticamente via RDO.
 */
var HORAS_CATEGORIES_MANUAL = [
  'PROSPECCAO',
  'REUNIAO_INTERNA',
  'REUNIAO_CLIENTE',
  'TREINAMENTO',
  'ADMINISTRATIVO',
  'VIAGEM',
  'FERIAS',
  'FERIADO',
  'OUTROS'
];

/** Categoria exclusiva para horas vindas do RDO. Bloqueada para lançamento manual. */
var HORAS_CATEGORY_PROJETO = 'PROJETO';

/** Origens possíveis de um lançamento de horas. */
var HORAS_ORIGIN = {
  MANUAL: 'MANUAL',
  RDO:    'RDO'
};

/**
 * Inicializa a aba TIME_ENTRIES com os cabeçalhos canônicos.
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initTimeEntriesSheet() {
  getOrCreateSheet(TIME_ENTRIES_SHEET, TIME_ENTRIES_HEADERS);
}
