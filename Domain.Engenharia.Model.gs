// =============================================================================
// Domain.Engenharia.Model.gs
// Allegro Business System — Fase F20 (EDM — Cofre de Documentos de Engenharia)
// Constantes, tipos e inicialização das abas do domínio de engenharia.
// =============================================================================

/** @const {string} Nome da aba de documentos de engenharia */
var ENG_DOCS_SHEET = 'ENG_DOCS';

/** @const {string} Nome da aba de revisões de documentos de engenharia */
var ENG_DOC_REVISIONS_SHEET = 'ENG_DOC_REVISIONS';

/** @const {Array<string>} Colunas da aba ENG_DOCS */
var ENG_DOCS_HEADERS = [
  'id', 'doc_number', 'title', 'description', 'tags',
  'type', 'discipline', 'current_revision', 'status',
  'owner', 'proposal_id', 'project_id', 'company_id', 'product_code', 'serial',
  'created_at', 'updated_at'
];

/** @const {Array<string>} Colunas da aba ENG_DOC_REVISIONS */
var ENG_DOC_REVISIONS_HEADERS = [
  'id', 'doc_number', 'revision', 'file_id_nativo', 'file_id_pdf',
  'date', 'author', 'change_description', 'status',
  'approved_by', 'approved_at'
];

/**
 * Tipos de documento suportados pelo EDM.
 * @const {Array<string>}
 */
var ENG_DOC_TYPES = [
  'DESENHO', 'DIAGRAMA', 'MEMORIAL', 'MANUAL',
  'PROCEDIMENTO', 'DATASHEET', 'LAUDO', 'TEMPLATE'
];

/**
 * Disciplinas de engenharia suportadas.
 * @const {Array<string>}
 */
var ENG_DISCIPLINES = ['ELETRICA', 'MECANICA', 'AUTOMACAO', 'CIVIL', 'GERAL'];

/**
 * Status possíveis de um documento.
 * @const {Array<string>}
 */
var ENG_DOC_STATUS = ['EM_ELABORACAO', 'APROVADO', 'SUPERSEDED', 'OBSOLETO'];

/**
 * Status possíveis de uma revisão.
 * @const {Array<string>}
 */
var ENG_REV_STATUS = ['EM_ELABORACAO', 'APROVADO', 'SUPERSEDED', 'OBSOLETO'];

/**
 * Mapa de abreviações por tipo de documento para composição do número.
 * Exemplo: DESENHO → DE, DIAGRAMA → DG
 * @const {Object.<string, string>}
 */
var DOC_TYPE_ABBREV = {
  DESENHO:      'DE',
  DIAGRAMA:     'DG',
  MEMORIAL:     'ME',
  MANUAL:       'MA',
  PROCEDIMENTO: 'PR',
  DATASHEET:    'DS',
  LAUDO:        'LA',
  TEMPLATE:     'TP'
};

/**
 * Mapa de abreviações por disciplina para composição do número.
 * Exemplo: ELETRICA → ELE, MECANICA → MEC
 * @const {Object.<string, string>}
 */
var DISCIPLINE_ABBREV = {
  ELETRICA:  'ELE',
  MECANICA:  'MEC',
  AUTOMACAO: 'AUT',
  CIVIL:     'CIV',
  GERAL:     'GER'
};

// ---------------------------------------------------------------------------
// Inicialização de Abas
// ---------------------------------------------------------------------------

/**
 * Cria as abas ENG_DOCS e ENG_DOC_REVISIONS caso ainda não existam.
 * Idempotente: não destrói dados existentes.
 * Chamada em Core.Setup.gs > initCoreSheets().
 */
function initEngDocsSheet() {
  getOrCreateSheet(ENG_DOCS_SHEET, ENG_DOCS_HEADERS);
  getOrCreateSheet(ENG_DOC_REVISIONS_SHEET, ENG_DOC_REVISIONS_HEADERS);
}

// ---------------------------------------------------------------------------
// Numeração de Documentos
// ---------------------------------------------------------------------------

/**
 * Gera o próximo número de documento no formato ALG-<TIPO>-<DISC>-NNNN.
 *
 * Exemplos:
 *   ALG-DE-ELE-0012  (Desenho Elétrico, décimo segundo)
 *   ALG-PR-AUT-0001  (Procedimento de Automação, primeiro)
 *
 * O contador é global por combinação tipo+disciplina e incrementado com
 * LockService (delegado a getAndIncrementCounter).
 *
 * @param {string} type       - Tipo do documento (ex: 'DESENHO').
 * @param {string} discipline - Disciplina (ex: 'ELETRICA').
 * @returns {string} Número de documento formatado.
 */
function engGenerateDocNumber(type, discipline) {
  var t = DOC_TYPE_ABBREV[type] || 'XX';
  var d = DISCIPLINE_ABBREV[discipline] || 'GER';
  var counter = getAndIncrementCounter('ENG_DOC_COUNTER_' + t + '_' + d);
  return 'ALG-' + t + '-' + d + '-' + String(counter).padStart(4, '0');
}
