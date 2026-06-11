/**
 * Domain.Pricing.Service.gs
 * Motor de Precificação do Allegro Business System — Fase F1.
 *
 * Orquestra os quatro blocos de custo:
 *   TOTAL = MATERIAIS + MO_INFRAESTRUTURA + STARTUP + DESLOCAMENTO
 *
 * Todos os parâmetros financeiros e de mão-de-obra são lidos exclusivamente
 * de prcRepoGetSetupCalcParams() e prcRepoGetLaborRates(). Nenhum valor fixo.
 * Exceção: prcSelfTest(), que usa valores documentados do Blueprint §2.2.
 *
 * @module Domain.Pricing.Service
 */

// ---------------------------------------------------------------------------
// Bloco 1 — Materiais
// ---------------------------------------------------------------------------

/**
 * Calcula custo e preço de venda de uma lista de itens de produto.
 * Se `table_price_usd` não vier no item, lê via prcRepoGetProductPrice(code).
 *
 * Fórmulas (Blueprint §2):
 *   custo_compra_usd   = table_price_usd × (1 − DESCONTO_COMPRA_PCT)
 *   custo_nacional_brl = custo_compra_usd × DOLAR_VENDA × FATOR_NACIONALIZACAO
 *   preco_venda_brl    = custo_compra_usd × MULTIPLICADOR_VENDA × DOLAR_VENDA
 *
 * @param {Array<{code:string, qty:number, table_price_usd?:number}>} items
 * @returns {{items:Array, subtotal_venda_brl:number, subtotal_custo_nacional_brl:number, margem:number}}
 */
function prcCalcMateriais(items) {
  var params = prcRepoGetSetupCalcParams();

  var descontoPct     = params.DESCONTO_COMPRA_PCT   || 0;
  var dolarVenda      = params.DOLAR_VENDA            || 1;
  var fatorNacional   = params.FATOR_NACIONALIZACAO   || 1;
  var multiplicador   = params.MULTIPLICADOR_VENDA    || 1;

  var calcItems = [];
  var subtotalVenda       = 0;
  var subtotalCustoNacional = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var qty  = item.qty || 1;

    var tablePrice = (item.table_price_usd != null && !isNaN(item.table_price_usd))
      ? Number(item.table_price_usd)
      : (prcRepoGetProductPrice(item.code) || 0);

    var custoCompraUsd   = tablePrice * (1 - descontoPct);
    var custoNacionalBrl = custoCompraUsd * dolarVenda * fatorNacional;
    var precoUnitBrl     = custoCompraUsd * multiplicador * dolarVenda;
    var precoUnitUsd     = custoCompraUsd * multiplicador;
    var precoTotalBrl    = precoUnitBrl * qty;

    subtotalVenda         += precoTotalBrl;
    subtotalCustoNacional += custoNacionalBrl * qty;

    calcItems.push({
      code:              item.code,
      qty:               qty,
      table_price_usd:   tablePrice,
      custo_compra_usd:  _round2(custoCompraUsd),
      custo_nacional_brl: _round2(custoNacionalBrl),
      preco_unit_brl:    _round2(precoUnitBrl),
      preco_total_brl:   _round2(precoTotalBrl),
      preco_unit_usd:    _round2(precoUnitUsd)
    });
  }

  var margem = subtotalVenda > 0
    ? (subtotalVenda - subtotalCustoNacional) / subtotalVenda
    : 0;

  return {
    items:                     calcItems,
    subtotal_venda_brl:        _round2(subtotalVenda),
    subtotal_custo_nacional_brl: _round2(subtotalCustoNacional),
    margem:                    _round4(margem)
  };
}

// ---------------------------------------------------------------------------
// Bloco 2 — Infraestrutura (MO + Material de Infra + Engenharia)
// ---------------------------------------------------------------------------

/**
 * Calcula MO de infraestrutura para uma lista de pontos.
 * Lê rates de prcRepoGetLaborRates() e params de prcRepoGetSetupCalcParams(),
 * depois delega para prcCalcInfraComParams (versão testável com DI).
 *
 * @param {Array<{descricao:string, comprimento_m:number, fd:number, produto_sugerido?:string}>} points
 * @returns {{pontos:Array, total_mo_brl:number, total_mat_brl:number, total_eng_brl:number, mobilizacao_brl:number, total_bruto_brl:number}}
 */
function prcCalcInfra(points) {
  var rates  = prcRepoGetLaborRates();
  var params = prcRepoGetSetupCalcParams();
  return prcCalcInfraComParams(points, rates, params);
}

/**
 * Versão testável de prcCalcInfra com injeção de dependência (usada por prcSelfTest).
 *
 * Fórmulas por ponto (Blueprint §2):
 *   MO_PONTO  = H_FIXO_PONTO × HH_TECNICO × fd
 *   MO_LANCE  = comprimento_m × (HPM_ELETRODUTO + HPM_CABO) × HH_TECNICO × fd
 *   MAT_INFRA = comprimento_m × CUSTO_M_INFRA
 *   ENG       = H_ENG_PONTO × HH_ENGENHARIA
 * Total = Σ(MO_PONTO + MO_LANCE + MAT_INFRA) + Σ(ENG) + MOBILIZACAO_MIN
 *
 * Seleção de cabo:
 *   comprimento_m ≤ 4       → CABO_CURTO ('0957A')
 *   comprimento_m ≤ 25      → CABO_LONGO ('0975A-25M')
 *   comprimento_m > CABO_MAX_M → alerta 'COMPRIMENTO_EXCEDE_LIMITE'
 *   comprimento_m > 25      → alerta 'EXTENSAO_NECESSARIA'
 *
 * @param {Array<{descricao:string, comprimento_m:number, fd:number}>} points
 * @param {{H_FIXO_PONTO:number, HPM_ELETRODUTO:number, HPM_CABO:number, CUSTO_M_INFRA:number, H_ENG_PONTO:number, MOBILIZACAO_MIN:number}} rates
 * @param {{HH_TECNICO:number, HH_ENGENHARIA:number, CABO_MAX_M?:number}} params
 * @returns {{pontos:Array, total_mo_brl:number, total_mat_brl:number, total_eng_brl:number, mobilizacao_brl:number, total_bruto_brl:number}}
 */
function prcCalcInfraComParams(points, rates, params) {
  var hFixoPonto    = rates.H_FIXO_PONTO    || 0;
  var hpmEletroduto = rates.HPM_ELETRODUTO  || 0;
  var hpmCabo       = rates.HPM_CABO        || 0;
  var custoMInfra   = rates.CUSTO_M_INFRA   || 0;
  var hEngPonto     = rates.H_ENG_PONTO     || 0;
  var mobilizacao   = rates.MOBILIZACAO_MIN || 0;

  var hhTecnico     = params.HH_TECNICO    || 0;
  var hhEngenharia  = params.HH_ENGENHARIA || 0;
  var caboMaxM      = params.CABO_MAX_M    || 100;

  var calcPontos = [];
  var totalMo  = 0;
  var totalMat = 0;
  var totalEng = 0;

  for (var i = 0; i < points.length; i++) {
    var pt  = points[i];
    var len = pt.comprimento_m || 0;
    var fd  = pt.fd != null ? pt.fd : 1.0;

    var moPonto = hFixoPonto * hhTecnico * fd;
    var moLance = len * (hpmEletroduto + hpmCabo) * hhTecnico * fd;
    var matInfra = len * custoMInfra;
    var eng      = hEngPonto * hhEngenharia;

    // Seleção de cabo e alertas
    var caboSugerido = CABO_CURTO; // default '0957A'
    var alerta       = '';

    if (len > caboMaxM) {
      alerta = 'COMPRIMENTO_EXCEDE_LIMITE';
      caboSugerido = CABO_LONGO;
    } else if (len > 25) {
      alerta = 'EXTENSAO_NECESSARIA';
      caboSugerido = CABO_LONGO;
    } else if (len > 4) {
      caboSugerido = CABO_LONGO; // '0975A-25M'
    }
    // len <= 4: CABO_CURTO '0957A', sem alerta

    totalMo  += moPonto + moLance;
    totalMat += matInfra;
    totalEng += eng;

    calcPontos.push({
      descricao:    pt.descricao || ('Ponto ' + (i + 1)),
      comprimento_m: len,
      fd:            fd,
      mo_ponto:     _round2(moPonto),
      mo_lance:     _round2(moLance),
      mat_infra:    _round2(matInfra),
      eng:          _round2(eng),
      cabo_sugerido: caboSugerido,
      alerta:        alerta
    });
  }

  var totalBruto = totalMo + totalMat + totalEng + mobilizacao;

  return {
    pontos:          calcPontos,
    total_mo_brl:    _round2(totalMo),
    total_mat_brl:   _round2(totalMat),
    total_eng_brl:   _round2(totalEng),
    mobilizacao_brl: _round2(mobilizacao),
    total_bruto_brl: _round2(totalBruto)
  };
}

// ---------------------------------------------------------------------------
// Bloco 3 — Startup
// ---------------------------------------------------------------------------

/**
 * Calcula o custo bruto de startup (comissionamento + treinamento).
 *
 * Fórmulas (Blueprint §2):
 *   dias_startup  = STARTUP_DIARIAS + max(0, ceil((nSensores - SENSORES_BASE) / 2))
 *   STARTUP_BRUTO = dias_startup x STARTUP_DIARIA_VALOR
 *
 * @param {number} nSensores
 * @returns {{n_sensores:number, dias_startup:number, total_bruto_brl:number}}
 */
function prcCalcStartup(nSensores) {
  var params = prcRepoGetSetupCalcParams();

  var startupDiasBase  = params.STARTUP_DIARIAS     || 5;
  var startupDiaria    = params.STARTUP_DIARIA_VALOR || 0;
  var sensoresBase     = params.SENSORES_BASE        || 4;

  var n = nSensores || 0;
  var diasExtra = Math.max(0, Math.ceil((n - sensoresBase) / 2));
  var dias      = startupDiasBase + diasExtra;
  var total     = dias * startupDiaria;

  return {
    n_sensores:     n,
    dias_startup:   dias,
    total_bruto_brl: _round2(total)
  };
}

// ---------------------------------------------------------------------------
// Bloco 4 — Deslocamento
// ---------------------------------------------------------------------------

/**
 * Calcula o custo de deslocamento (transporte + hospedagem + alimentação).
 *
 * Transporte (Blueprint §2):
 *   km <= LIMITE_RODOVIARIO → km x 2 x KM_REEMBOLSO x nViagens
 *   km >  LIMITE_RODOVIARIO → PASSAGEM_AEREA_MEDIA x nPessoas x nViagens
 * Hospedagem: diasCampo x nPessoas x (DIARIA_ALIMENTACAO + DIARIA_HOSPEDAGEM)
 *
 * @param {number} distanciaKm
 * @param {number} diasCampo
 * @param {number} nPessoas
 * @param {number} nViagens
 * @returns {{distancia_km:number, dias_campo:number, n_pessoas:number, transporte_brl:number, hospedagem_brl:number, total_brl:number}}
 */
function prcCalcDeslocamento(distanciaKm, diasCampo, nPessoas, nViagens) {
  var params = prcRepoGetSetupCalcParams();

  var limiteRodoviario  = params.LIMITE_RODOVIARIO   || 300;
  var kmReembolso       = params.KM_REEMBOLSO        || 0;
  var passagemAerea     = params.PASSAGEM_AEREA_MEDIA || 0;
  var diariaAlimentacao = params.DIARIA_ALIMENTACAO  || 0;
  var diariaHospedagem  = params.DIARIA_HOSPEDAGEM   || 0;

  var km      = distanciaKm || 0;
  var dias    = diasCampo   || 0;
  var pessoas = nPessoas    || 2;
  var viagens = nViagens    || 1;

  var transporte;
  if (km <= limiteRodoviario) {
    transporte = km * 2 * kmReembolso * viagens;
  } else {
    transporte = passagemAerea * pessoas * viagens;
  }

  var hospedagem = dias * pessoas * (diariaAlimentacao + diariaHospedagem);
  var total      = transporte + hospedagem;

  return {
    distancia_km:  km,
    dias_campo:    dias,
    n_pessoas:     pessoas,
    transporte_brl: _round2(transporte),
    hospedagem_brl: _round2(hospedagem),
    total_brl:     _round2(total)
  };
}

// ---------------------------------------------------------------------------
// Gross-up de Serviços
// ---------------------------------------------------------------------------

/**
 * Aplica gross-up fiscal e margem sobre custo bruto de serviço.
 *
 * Fórmula: preco = custo x (1 + MARGEM_SERVICO) / (1 - ALIQUOTA_ISS - ALIQUOTA_PIS_COFINS)
 *
 * @param {number} custo_bruto
 * @returns {{custo_bruto:number, margem_aplicada:number, aliquota_total:number, preco_brl:number}}
 */
function prcGrossUpServico(custo_bruto) {
  var params = prcRepoGetSetupCalcParams();

  var margemServico  = params.MARGEM_SERVICO       || 0;
  var aliquotaIss    = params.ALIQUOTA_ISS          || 0;
  var aliquotaPisCof = params.ALIQUOTA_PIS_COFINS   || 0;

  var aliquotaTotal  = aliquotaIss + aliquotaPisCof;
  var divisor        = 1 - aliquotaTotal;
  if (divisor <= 0) {
    throw new Error('prcGrossUpServico: aliquota_total >= 1, divisor inválido (' + aliquotaTotal + ')');
  }

  var preco = custo_bruto * (1 + margemServico) / divisor;

  return {
    custo_bruto:     _round2(custo_bruto),
    margem_aplicada: _round4(margemServico),
    aliquota_total:  _round4(aliquotaTotal),
    preco_brl:       _round2(preco)
  };
}

// ---------------------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------------------

/**
 * Orquestra o cálculo completo da proposta.
 *
 * Fluxo: materiais → infra → startup → deslocamento → gross-up serviços
 * → margem global → alertas.
 *
 * dias_campo: usa input.dias_campo ou calcula ceil(horas_mo / 8 / n_tecnicos).
 * n_sensores: usa input.n_sensores ou items.length.
 *
 * @param {{items?:Array, points?:Array, n_sensores?:number, distancia_km?:number,
 *   dias_campo?:number, n_pessoas?:number, n_viagens?:number, n_tecnicos?:number}} input
 * @returns {{versao:string, calculado_em:string, dolar_venda:number, params_usados:Object,
 *   materiais:Object, infra:Object, startup:Object, deslocamento:Object,
 *   servicos_gross_up:Object, total_materiais_brl:number, total_servicos_brl:number,
 *   total_proposta_brl:number, margem_global:number, alertas:string[]}}
 */
function prcCalcProposta(input) {
  var params = prcRepoGetSetupCalcParams();
  var rates  = prcRepoGetLaborRates();

  var alertas = [];

  // --- Entradas com defaults
  var items    = input.items    || [];
  var points   = input.points   || [];
  var nPessoas = input.n_pessoas != null ? input.n_pessoas : 2;
  var nViagens = input.n_viagens != null ? input.n_viagens : 1;
  var nTecnicos = input.n_tecnicos != null ? input.n_tecnicos : 1;
  var distanciaKm = input.distancia_km || 0;

  // n_sensores: usa input ou conta items
  var nSensores = (input.n_sensores != null)
    ? input.n_sensores
    : items.length;

  // --- 1. Materiais
  var materiais = prcCalcMateriais(items);

  // --- 2. Infra
  var infra = prcCalcInfra(points);

  // Coletar alertas de infra
  for (var i = 0; i < infra.pontos.length; i++) {
    if (infra.pontos[i].alerta) {
      alertas.push(infra.pontos[i].alerta + ' no ponto ' + (i + 1) + ' (' + infra.pontos[i].descricao + ')');
    }
  }

  // --- 3. Startup
  var startup = prcCalcStartup(nSensores);

  // --- 4. Deslocamento
  // dias_campo: input ou calculado = ceil(total_horas_mo / 8 / n_tecnicos)
  var diasCampo;
  if (input.dias_campo != null) {
    diasCampo = input.dias_campo;
  } else {
    var totalHorasMo = infra.total_mo_brl > 0 && (params.HH_TECNICO || 0) > 0
      ? infra.total_mo_brl / (params.HH_TECNICO || 1)
      : 0;
    diasCampo = Math.ceil(totalHorasMo / 8 / nTecnicos) || 1;
  }

  var deslocamento = prcCalcDeslocamento(distanciaKm, diasCampo, nPessoas, nViagens);

  // --- 5. Gross-up de serviços
  var custoServicoBruto = infra.total_bruto_brl + startup.total_bruto_brl + deslocamento.total_brl;
  var grossUp           = prcGrossUpServico(custoServicoBruto);

  // --- 6. Totais
  var totalMateriais   = materiais.subtotal_venda_brl;
  var totalServicos    = grossUp.preco_brl;
  var totalProposta    = totalMateriais + totalServicos;

  // Custo total para cálculo de margem global
  var custoMateriais   = materiais.subtotal_custo_nacional_brl;
  var custoTotal       = custoMateriais + custoServicoBruto;
  var margemGlobal     = totalProposta > 0
    ? (totalProposta - custoTotal) / totalProposta
    : 0;

  // --- 7. Validação de margem mínima
  var margemMinima = params.MARGEM_MINIMA_GLOBAL || 0;
  if (margemMinima > 0 && margemGlobal < margemMinima) {
    alertas.push('MARGEM_ABAIXO_MINIMO');
  }

  // --- Snapshot de parâmetros usados
  var paramsUsados = {};
  var keysCalc = ['DOLAR_VENDA', 'DESCONTO_COMPRA_PCT', 'MULTIPLICADOR_VENDA',
    'FATOR_NACIONALIZACAO', 'HH_TECNICO', 'HH_ENGENHARIA', 'STARTUP_DIARIAS',
    'STARTUP_DIARIA_VALOR', 'SENSORES_BASE', 'LIMITE_RODOVIARIO', 'KM_REEMBOLSO',
    'PASSAGEM_AEREA_MEDIA', 'DIARIA_ALIMENTACAO', 'DIARIA_HOSPEDAGEM',
    'ALIQUOTA_ISS', 'ALIQUOTA_PIS_COFINS', 'MARGEM_SERVICO', 'MARGEM_MINIMA_GLOBAL'];
  for (var k = 0; k < keysCalc.length; k++) {
    paramsUsados[keysCalc[k]] = params[keysCalc[k]];
  }
  var keysRates = ['H_FIXO_PONTO', 'HPM_ELETRODUTO', 'HPM_CABO', 'CUSTO_M_INFRA',
    'H_ENG_PONTO', 'MOBILIZACAO_MIN'];
  for (var r = 0; r < keysRates.length; r++) {
    paramsUsados[keysRates[r]] = rates[keysRates[r]];
  }

  return {
    versao:             '1.0',
    calculado_em:       new Date().toISOString(),
    dolar_venda:        params.DOLAR_VENDA || 0,
    params_usados:      paramsUsados,
    materiais:          materiais,
    infra:              infra,
    startup:            startup,
    deslocamento:       deslocamento,
    servicos_gross_up:  grossUp,
    total_materiais_brl: _round2(totalMateriais),
    total_servicos_brl:  _round2(totalServicos),
    total_proposta_brl:  _round2(totalProposta),
    margem_global:       _round4(margemGlobal),
    alertas:             alertas
  };
}

// ---------------------------------------------------------------------------
// Self Test (Blueprint §2.2)
// ---------------------------------------------------------------------------

/**
 * Reproduz o exemplo do Blueprint §2.2 com valores fixos (não usa SETUP_CALC real).
 * Verifica o cálculo de MO_INFRA_BRUTA esperado = R$ 9.756,00.
 *
 * Esperado:
 *   MO_PONTO:     2 × 8h × 120  = R$  1.920,00
 *   MO_LANCE P1: 18 × 0.45 × 120 = R$    972,00
 *   MO_LANCE P2: 30 × 0.45 × 120 = R$  1.620,00
 *   MAT_INFRA:  (18+30) × 48    = R$  2.304,00
 *   ENG:         2 × 4h × 180   = R$  1.440,00
 *   MOBILIZAÇÃO:                  R$  1.500,00
 *   TOTAL:                        R$  9.756,00
 *
 * @returns {boolean} true se o cálculo bater com o esperado; lança erro caso contrário.
 * @throws {Error} Quando o valor calculado difere do esperado em mais de R$ 0,01.
 */
function prcSelfTest() {
  var points = [
    { descricao: 'Sensor 1', comprimento_m: 18, fd: 1.0 },
    { descricao: 'Sensor 2', comprimento_m: 30, fd: 1.0 }
  ];

  // Valores fixos do Blueprint §2.2 — não dependem de SETUP_CALC
  var testRates = {
    H_FIXO_PONTO:    8,
    HPM_ELETRODUTO:  0.35,
    HPM_CABO:        0.10,
    CUSTO_M_INFRA:   48,
    H_ENG_PONTO:     4,
    MOBILIZACAO_MIN: 1500
  };
  var testParams = {
    HH_TECNICO:    120,
    HH_ENGENHARIA: 180,
    CABO_MAX_M:    100
  };

  var result = prcCalcInfraComParams(points, testRates, testParams);
  var total    = result.total_bruto_brl;
  var expected = 9756;

  if (Math.abs(total - expected) > 0.01) {
    throw new Error(
      'prcSelfTest FALHOU: esperado R$' + expected +
      ', calculado R$' + total +
      '\nDetalhe: ' + JSON.stringify(result, null, 2)
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Utilitários Privados
// ---------------------------------------------------------------------------

/**
 * Arredonda um número para 2 casas decimais.
 * @param {number} n
 * @returns {number}
 */
function _round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * Arredonda um número para 4 casas decimais (usado em percentuais/margens).
 * @param {number} n
 * @returns {number}
 */
function _round4(n) {
  return Math.round((n || 0) * 10000) / 10000;
}
