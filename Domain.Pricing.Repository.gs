/**
 * Domain.Pricing.Repository.gs
 * Único ponto de acesso às sheets SETUP_CALC, LABOR_RATES e PRODUCTS
 * para o domínio Pricing.
 *
 * Regras:
 *  - Sem autenticação/autorização aqui (responsabilidade de Service e Api)
 *  - Sem valores hardcoded: todos os parâmetros vêm das sheets
 *  - Outras camadas NÃO devem ler essas sheets diretamente
 */

// ---------------------------------------------------------------------------
// Parâmetros Financeiros (SETUP_CALC)
// ---------------------------------------------------------------------------

/**
 * Lê todos os parâmetros financeiros da aba SETUP_CALC e retorna um objeto
 * chave→valor com valores numéricos sempre que possível.
 *
 * Exemplo de retorno:
 * ```
 * {
 *   DOLAR_VENDA: 5.18,
 *   MULTIPLICADOR_VENDA: 3.87,
 *   BDI: 0.25,
 *   ...
 * }
 * ```
 *
 * @returns {Object.<string, number|string>} Mapa de parâmetros financeiros.
 */
function prcRepoGetSetupCalcParams() {
  var rows = sheetToObjects('SETUP_CALC');
  var params = {};
  for (var i = 0; i < rows.length; i++) {
    var parsed = parseFloat(rows[i].value);
    params[rows[i].key] = isNaN(parsed) ? rows[i].value : parsed;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Taxas de Mão-de-Obra (LABOR_RATES)
// ---------------------------------------------------------------------------

/**
 * Lê todos os parâmetros de mão-de-obra e infraestrutura da aba LABOR_RATES
 * e retorna um objeto chave→valor com valores numéricos sempre que possível.
 *
 * Exemplo de retorno:
 * ```
 * {
 *   H_FIXO_PONTO: 8,
 *   HPM_ELETRODUTO: 0.35,
 *   HPM_CABO: 0.10,
 *   CUSTO_M_INFRA: 48,
 *   H_ENG_PONTO: 4,
 *   MOBILIZACAO_MIN: 1500
 * }
 * ```
 *
 * @returns {Object.<string, number|string>} Mapa de taxas de mão-de-obra.
 */
function prcRepoGetLaborRates() {
  var rows = sheetToObjects(LABOR_RATES_SHEET);
  var rates = {};
  for (var i = 0; i < rows.length; i++) {
    var parsed = parseFloat(rows[i].value);
    rates[rows[i].key] = isNaN(parsed) ? rows[i].value : parsed;
  }
  return rates;
}

// ---------------------------------------------------------------------------
// Preços de Produtos (PRODUCTS)
// ---------------------------------------------------------------------------

/**
 * Lê o preço de tabela em USD de um produto específico a partir da aba PRODUCTS.
 * Retorna null se o produto não for encontrado ou não tiver preço definido.
 *
 * @param {string} productCode - Código do produto (coluna `code` na aba PRODUCTS).
 * @returns {number|null} Preço de tabela em USD, ou null se não encontrado.
 */
function prcRepoGetProductPrice(productCode) {
  var rows = sheetToObjects('PRODUCTS');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].code === productCode) {
      var price = parseFloat(rows[i].table_price_usd);
      return isNaN(price) ? null : price;
    }
  }
  return null;
}

/**
 * Lê todos os produtos da aba PRODUCTS e retorna como array de objetos.
 * Útil para montar listas de seleção no builder de propostas.
 *
 * @returns {Array<Object>} Lista de produtos com todos os campos da aba.
 */
function prcRepoGetAllProducts() {
  return sheetToObjects('PRODUCTS');
}
