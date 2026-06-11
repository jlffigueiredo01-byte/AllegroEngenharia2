// =============================================================================
// Domain.Caixa.Api.gs
// Fase F16 — Endpoints públicos do módulo Caixa
// Acesso restrito a DIRETOR_TECNICO e FINANCEIRO_ADMIN.
// =============================================================================

/**
 * Lança um movimento no livro caixa.
 *
 * @param {Object} data - { date, description, amount, direction, category?,
 *                          reference_type?, reference_id? }
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_caixaLancar(data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    data = data || {};
    if (!data.created_by) data.created_by = user.id;
    return { ok: true, data: caixaSvcLancar(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os movimentos de um período, com totais calculados.
 *
 * @param {string} [period] - Período 'AAAA-MM'. Padrão: mês atual.
 * @returns {{ok:boolean, data:{period, movimentos, totais}}|{ok:boolean, error:string}}
 */
function Api_caixaGetPeriodo(period) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var p = period || new Date().toISOString().slice(0, 7);
    var movs = cashRepoGetByPeriod(p);

    var totais = { entradas: 0, saidas: 0, saldo: 0 };
    movs.forEach(function(m) {
      if (m.direction === 'ENTRADA') totais.entradas += parseFloat(m.amount || 0);
      else                           totais.saidas   += parseFloat(m.amount || 0);
    });
    totais.saldo = totais.entradas - totais.saidas;

    return {
      ok:   true,
      data: { period: p, movimentos: movs, totais: totais }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Abre (ou retorna existente) a reconciliação de um período.
 *
 * @param {string} [period] - Período 'AAAA-MM'. Padrão: mês atual.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_caixaAbrirReconciliacao(period) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var p = period || new Date().toISOString().slice(0, 7);
    return { ok: true, data: caixaSvcAbrirReconciliacao(p) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fecha a reconciliação de um período.
 * Exclusivo para FINANCEIRO_ADMIN.
 *
 * @param {string}   period       - Período 'AAAA-MM'.
 * @param {number}   saldoExtrato - Saldo informado pelo banco (manual).
 * @param {Object[]} [ajustes]    - Ajustes justificados (opcional).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_caixaFecharReconciliacao(period, saldoExtrato, ajustes) {
  try {
    var user = requireRole(['FINANCEIRO_ADMIN']);
    return {
      ok:   true,
      data: caixaSvcFecharReconciliacao(period, saldoExtrato, ajustes || [], user.id)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna projeção de caixa para os próximos N dias.
 *
 * @param {number} [dias=90] - Horizonte de projeção em dias.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_caixaProjecao(dias) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: caixaSvcProjecao(dias || 90) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todas as reconciliações cadastradas.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_caixaListarReconciliacoes() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: reconRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
