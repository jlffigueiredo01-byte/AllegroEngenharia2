// ============================================================
// Domain.Compliance.Model.gs — ALLEGRO Business System
// F18 — Compliance / HSE (Saúde, Segurança e Meio Ambiente)
// Modelos de dados e constantes de domínio.
// ============================================================

// ------------------------------------------------------------
// HSE_DOCS — Documentos de habilitação dos técnicos
// ------------------------------------------------------------

/** @const {string} Nome da aba HSE_DOCS na planilha. */
var HSE_DOCS_SHEET = 'HSE_DOCS';

/**
 * Cabeçalhos da aba HSE_DOCS.
 * @const {string[]}
 */
var HSE_DOCS_HEADERS = [
  'id',
  'user_id',
  'doc_type',
  'doc_description',
  'issue_date',
  'expiry_date',
  'file_id',
  'valid',        // Calculado: TRUE se expiry_date >= hoje
  'created_at',
  'updated_at'
];

/**
 * Tipos de documento HSE aceitos pelo sistema.
 * @const {string[]}
 */
var HSE_DOC_TYPES = [
  'ASO',          // Atestado de Saúde Ocupacional (exame médico)
  'NR10',         // Segurança em Instalações Elétricas
  'NR35',         // Trabalho em Altura
  'NR33',         // Trabalho em Espaço Confinado
  'CA_EPI',       // Certificado de Aprovação de EPI
  'CIPA',         // Comissão Interna de Prevenção de Acidentes
  'BRIGADA',      // Brigada de Emergência
  'OUTRO_HSE'
];

// ------------------------------------------------------------
// REFERENCE_INSTRUMENTS — Instrumentos de medição/calibração
// ------------------------------------------------------------

/** @const {string} Nome da aba REFERENCE_INSTRUMENTS na planilha. */
var REFERENCE_INSTRUMENTS_SHEET = 'REFERENCE_INSTRUMENTS';

/**
 * Cabeçalhos da aba REFERENCE_INSTRUMENTS.
 * @const {string[]}
 */
var REFERENCE_INSTRUMENTS_HEADERS = [
  'id',
  'code',
  'description',
  'model',
  'serial_number',
  'calibration_lab',
  'calibration_cert_number',
  'calibration_date',
  'calibration_expiry',
  'file_id',      // Certificado PDF no Google Drive
  'valid',        // TRUE se calibration_expiry >= hoje
  'created_at',
  'updated_at'
];

// ------------------------------------------------------------
// Inicialização de abas
// ------------------------------------------------------------

/**
 * Cria as abas HSE_DOCS e REFERENCE_INSTRUMENTS caso ainda não existam.
 * Idempotente — usa getOrCreateSheet().
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initComplianceSheets() {
  getOrCreateSheet(HSE_DOCS_SHEET, HSE_DOCS_HEADERS);
  getOrCreateSheet(REFERENCE_INSTRUMENTS_SHEET, REFERENCE_INSTRUMENTS_HEADERS);
}
