/**
 * Domain.Pricing.Model.gs
 * Constantes, configurações e inicialização da aba LABOR_RATES.
 * Parte do Motor de Precificação (Fase F1) do Allegro Business System.
 */

// ---------------------------------------------------------------------------
// Constantes de Sheet
// ---------------------------------------------------------------------------

/** @const {string} Nome da aba de taxas de mão-de-obra */
var LABOR_RATES_SHEET = 'LABOR_RATES';

/** @const {Array<string>} Colunas da aba LABOR_RATES */
var LABOR_RATES_HEADERS = ['key', 'description', 'value', 'unit', 'category'];

// ---------------------------------------------------------------------------
// Seed de valores (Blueprint §2.2)
// Valores marcados com "[AJUSTAR - valor exemplo]" devem ser calibrados
// por João antes de usar em propostas reais.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LaborRateSeedEntry
 * @property {string} key       - Identificador único do parâmetro
 * @property {string} description - Descrição legível (com aviso de calibração se exemplo)
 * @property {number} value     - Valor numérico padrão
 * @property {string} unit      - Unidade de medida (h, h/m, R$/m, R$)
 * @property {string} category  - Categoria: MO | MATERIAL | ENG | MOBILIZACAO
 */

/** @type {Array<LaborRateSeedEntry>} */
var LABOR_RATES_SEED = [
  {
    key: 'H_FIXO_PONTO',
    description: 'Horas fixas por ponto (fixação mecânica, caixa de passagem, terminações, teste) [AJUSTAR - valor exemplo]',
    value: 8,
    unit: 'h',
    category: 'MO'
  },
  {
    key: 'HPM_ELETRODUTO',
    description: 'Horas por metro de eletroduto galvanizado instalado [AJUSTAR - valor exemplo]',
    value: 0.35,
    unit: 'h/m',
    category: 'MO'
  },
  {
    key: 'HPM_CABO',
    description: 'Horas por metro de lançamento de cabo blindado [AJUSTAR - valor exemplo]',
    value: 0.10,
    unit: 'h/m',
    category: 'MO'
  },
  {
    key: 'CUSTO_M_INFRA',
    description: 'Custo de material por metro (eletroduto, curvas, abraçadeiras) [AJUSTAR - valor exemplo]',
    value: 48,
    unit: 'R$/m',
    category: 'MATERIAL'
  },
  {
    key: 'H_ENG_PONTO',
    description: 'Horas de engenharia por ponto (diagrama, lista de materiais, as-built) [AJUSTAR - valor exemplo]',
    value: 4,
    unit: 'h',
    category: 'ENG'
  },
  {
    key: 'MOBILIZACAO_MIN',
    description: 'Mobilização mínima por obra (ferramental, EPI, ART) [AJUSTAR - valor exemplo]',
    value: 1500,
    unit: 'R$',
    category: 'MOBILIZACAO'
  }
];

// ---------------------------------------------------------------------------
// Fator de Dificuldade (FD)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FdEntry
 * @property {string} label - Descrição do cenário de instalação
 * @property {number} fd    - Fator multiplicador sobre horas de MO
 */

/**
 * Tabela de Fatores de Dificuldade.
 * Multiplica as horas de mão-de-obra conforme as condições de instalação.
 * @type {Object.<string, FdEntry>}
 */
var FD_TABLE = {
  NIVEL_PISO:        { label: 'Instalação ao nível do piso, área limpa',                          fd: 1.0 },
  ALTURA_3M:         { label: 'Trabalho em altura > 3m (andaime/plataforma)',                      fd: 1.3 },
  AREA_CLASSIFICADA: { label: 'Área classificada / ATEX, ou alta temperatura (HT)',                fd: 1.5 },
  NOTURNO:           { label: 'Parada de produção restrita (noturno/fim de semana)',                fd: 1.8 }
};

// ---------------------------------------------------------------------------
// Códigos de cabo Hydronix
// ---------------------------------------------------------------------------

/** @const {string} Código do cabo curto Hydronix (até 4 m) */
var CABO_CURTO = '0957A';

/** @const {string} Código do cabo longo Hydronix (até 25 m) */
var CABO_LONGO = '0975A-25M';

// ---------------------------------------------------------------------------
// Inicialização da aba LABOR_RATES
// ---------------------------------------------------------------------------

/**
 * Cria e preenche a aba LABOR_RATES com os valores do seed, caso ainda não
 * exista ou esteja vazia. Idempotente: não sobrescreve dados existentes.
 *
 * Deve ser chamada em Core.Setup.gs (função setupAllegro ou equivalente).
 */
function initLaborRatesSheet() {
  var sheet = ss().getSheetByName(LABOR_RATES_SHEET);
  if (sheet && sheet.getLastRow() > 1) return; // já inicializado

  sheet = getOrCreateSheet(LABOR_RATES_SHEET, LABOR_RATES_HEADERS);

  // Formata cabeçalho com identidade visual do sistema
  sheet.getRange(1, 1, 1, LABOR_RATES_HEADERS.length)
    .setBackground('#1a56db')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  // Insere os valores do seed linha a linha
  for (var i = 0; i < LABOR_RATES_SEED.length; i++) {
    var r = LABOR_RATES_SEED[i];
    sheet.appendRow([r.key, r.description, r.value, r.unit, r.category]);
  }

  // Ajustes de layout
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);  // key
  sheet.setColumnWidth(2, 380);  // description
  sheet.setColumnWidth(3, 100);  // value
  sheet.setColumnWidth(4, 80);   // unit
  sheet.setColumnWidth(5, 120);  // category
}
