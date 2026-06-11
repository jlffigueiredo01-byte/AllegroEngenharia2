/**
 * Domain.Pricing.Api.gs
 * API pública do Motor de Precificação — Allegro Business System
 *
 * RBAC (ECOSSISTEMA_V2 §1):
 *   - Calcular / preview: todos os 4 papéis
 *   - Ver parâmetros financeiros: DIRETOR_TECNICO + FINANCEIRO_ADMIN
 *   - Self-test: DIRETOR_TECNICO
 */

/**
 * Calcula o pricing completo de uma proposta.
 * @param {Object} input - { items, points, n_sensores, distancia_km, dias_campo, n_pessoas, n_viagens }
 * @returns {{ok:boolean, data:Object}}
 */
function Api_prcCalcProposta(input) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!input || !input.items) throw new Error('items é obrigatório.');
    var result = prcCalcProposta(input);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os parâmetros financeiros atuais (SETUP_CALC + LABOR_RATES).
 * Visível apenas para perfis que gerenciam configuração financeira.
 * @returns {{ok:boolean, data:{setupCalc:Object, laborRates:Object}}}
 */
function Api_prcGetParams() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return {
      ok: true,
      data: {
        setupCalc: prcRepoGetSetupCalcParams(),
        laborRates: prcRepoGetLaborRates()
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Executa o self-test do motor de precificação.
 * Valida que o cálculo reproduz o exemplo do Blueprint §2.2 (R$ 9.756,00).
 * @returns {{ok:boolean, data:{passed:boolean, expected:number}}}
 */
function Api_prcSelfTest() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var passed = prcSelfTest();
    appendAuditLog('PRICING_SELF_TEST', 'SYSTEM', 'auto', 'prcSelfTest: ' + (passed ? 'PASSED' : 'FAILED'));
    return { ok: true, data: { passed: passed, expected: 9756 } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Calcula apenas o bloco de infraestrutura para preview na UI.
 * @param {Array} points - Array de pontos com metadados de cabeamento/eletroduto
 * @returns {{ok:boolean, data:Object}}
 */
function Api_prcCalcInfraPreview(points) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!points || !points.length) throw new Error('points é obrigatório.');
    return { ok: true, data: prcCalcInfra(points) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function testPricing() {
  var r = prcSelfTest();
  Logger.log('prcSelfTest resultado: ' + r);
}

function clearMySession() {
  PropertiesService.getUserProperties().deleteAllProperties();
  Logger.log('Sessão limpa.');
}

