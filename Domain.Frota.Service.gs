// =============================================================================
// Domain.Frota.Service.gs
// Allegro Business System — Fase F7
// Regras de negócio de Frota/Veículo. Sem acesso direto à planilha.
// =============================================================================

/**
 * Registra um abastecimento de veículo.
 * Calcula km/L e R$/km usando a diferença de odômetro com o registro anterior.
 * Para R$/km médio, usa a média dos últimos 3 abastecimentos.
 * Cria entrada espelhada na aba EXPENSES com categoria COMBUSTIVEL.
 *
 * @param {Object} data - Dados do abastecimento.
 * @param {string} data.date         - Data do abastecimento (YYYY-MM-DD, obrigatório).
 * @param {number} data.odometro     - Leitura atual do odômetro em km (obrigatório).
 * @param {number} data.litros       - Quantidade de litros abastecida (obrigatório).
 * @param {number} data.valor        - Valor total pago em R$ (obrigatório).
 * @param {string} [data.posto]          - Nome do posto.
 * @param {string} [data.condutor_id]    - ID do usuário condutor.
 * @param {string} [data.ref_ticket_id]  - ID do ticket de serviço relacionado.
 * @returns {Object} Registro completo do log criado.
 * @throws {Error} Se campos obrigatórios estiverem ausentes ou inválidos.
 */
function frotaSvcRegistrarAbastecimento(data) {
  // Validações
  if (!data.date) {
    throw new Error('Data do abastecimento é obrigatória.');
  }
  var odometro = safeNumber(data.odometro);
  var litros   = safeNumber(data.litros);
  var valor    = safeNumber(data.valor);

  if (odometro <= 0) throw new Error('Odômetro deve ser maior que zero.');
  if (litros   <= 0) throw new Error('Litros deve ser maior que zero.');
  if (valor    <= 0) throw new Error('Valor deve ser maior que zero.');

  // Calcular km/L usando o odômetro anterior
  var km_l = 0;
  var recentes = frotaRepoGetRecent(1);
  if (recentes.length > 0) {
    var odometroAnterior = safeNumber(recentes[0].odometro);
    if (odometroAnterior > 0 && odometro > odometroAnterior) {
      var kmPercorridos = odometro - odometroAnterior;
      km_l = kmPercorridos / litros;
    }
  }

  // Calcular R$/km médio dos últimos 3 abastecimentos
  var r_por_km = _frotaCalcRPorKmMedio();

  var id  = 'VL-' + String(getAndIncrementCounter('VEHICLE_LOG_COUNTER')).padStart(6, '0');
  var now = nowISO();

  var entry = {
    id:            id,
    date:          data.date,
    odometro:      odometro,
    litros:        litros,
    valor:         valor,
    posto:         data.posto         || '',
    condutor_id:   data.condutor_id   || '',
    ref_ticket_id: data.ref_ticket_id || '',
    km_l:          km_l > 0 ? Math.round(km_l * 100) / 100 : 0,
    r_por_km:      r_por_km,
    created_at:    now
  };

  frotaRepoCreate(entry);

  // Espelhar como despesa na aba EXPENSES (categoria: COMBUSTIVEL)
  _frotaCriarDespesaCombustivel(id, data.date, valor, data.posto || 'Posto de combustível');

  appendAuditLog(
    'FROTA_ABASTECIMENTO',
    'VEHICLE_LOG',
    id,
    data.date + ' | ' + litros + 'L | R$' + valor + (data.posto ? ' | ' + data.posto : '')
  );

  return entry;
}

/**
 * Retorna o resumo de eficiência da frota dos últimos 3 meses.
 * Inclui médias de km/L e R$/km.
 *
 * @returns {Object} { media_km_l, media_r_por_km, total_abastecimentos,
 *                     total_litros, total_gasto, periodo_de, periodo_ate }
 */
function frotaSvcGetResumo() {
  var agora     = new Date();
  var tresMeses = new Date(agora.getFullYear(), agora.getMonth() - 3, agora.getDate());
  var dateFrom  = Utilities.formatDate(tresMeses, 'America/Sao_Paulo', 'yyyy-MM-dd');
  var dateTo    = Utilities.formatDate(agora,     'America/Sao_Paulo', 'yyyy-MM-dd');

  var registros = frotaRepoGetByPeriod(dateFrom, dateTo);

  if (!registros.length) {
    return {
      media_km_l:            0,
      media_r_por_km:        0,
      total_abastecimentos:  0,
      total_litros:          0,
      total_gasto:           0,
      periodo_de:            dateFrom,
      periodo_ate:           dateTo
    };
  }

  var somaKmL    = 0;
  var somaRPorKm = 0;
  var contKmL    = 0;
  var totalLitros = 0;
  var totalGasto  = 0;

  registros.forEach(function(r) {
    totalLitros += safeNumber(r.litros);
    totalGasto  += safeNumber(r.valor);
    var kmL = safeNumber(r.km_l);
    if (kmL > 0) { somaKmL += kmL; contKmL++; }
    var rKm = safeNumber(r.r_por_km);
    if (rKm > 0) somaRPorKm += rKm;
  });

  var media_km_l    = contKmL > 0        ? Math.round((somaKmL    / contKmL)        * 100) / 100 : 0;
  var media_r_por_km = registros.length > 0 ? Math.round((somaRPorKm / registros.length) * 100) / 100 : 0;

  return {
    media_km_l:           media_km_l,
    media_r_por_km:       media_r_por_km,
    total_abastecimentos: registros.length,
    total_litros:         Math.round(totalLitros * 100) / 100,
    total_gasto:          Math.round(totalGasto  * 100) / 100,
    periodo_de:           dateFrom,
    periodo_ate:          dateTo
  };
}

// =============================================================================
// Helpers privados
// =============================================================================

/**
 * Calcula o R$/km médio dos últimos 3 abastecimentos com odômetro anterior válido.
 * @returns {number} Média de R$/km arredondada a 4 casas, ou 0 se sem histórico.
 * @private
 */
function _frotaCalcRPorKmMedio() {
  var recentes = frotaRepoGetRecent(4); // pega 4 para ter até 3 intervalos
  if (recentes.length < 2) return 0;

  var rPorKmValues = [];
  for (var i = 0; i < recentes.length - 1 && rPorKmValues.length < 3; i++) {
    var atual    = recentes[i];
    var anterior = recentes[i + 1];
    var kmPerc   = safeNumber(atual.odometro) - safeNumber(anterior.odometro);
    if (kmPerc > 0 && safeNumber(atual.valor) > 0) {
      rPorKmValues.push(safeNumber(atual.valor) / kmPerc);
    }
  }

  if (!rPorKmValues.length) return 0;
  var soma = rPorKmValues.reduce(function(acc, v) { return acc + v; }, 0);
  return Math.round((soma / rPorKmValues.length) * 10000) / 10000;
}

/**
 * Cria uma entrada espelhada na aba EXPENSES para o abastecimento.
 * Categoria padronizada: COMBUSTIVEL.
 * @param {string} vehicleLogId - ID do registro em VEHICLE_LOG.
 * @param {string} date         - Data do abastecimento.
 * @param {number} valor        - Valor pago.
 * @param {string} posto        - Nome do estabelecimento/posto.
 * @private
 */
function _frotaCriarDespesaCombustivel(vehicleLogId, date, valor, posto) {
  // Usa _expenseSvcCreate() de Domain.Expenses — sem acesso direto à sheet
  try {
    var user = getCurrentUser();
    _expenseSvcCreate(
      user ? user.id : 'SYSTEM',
      date,
      posto,
      'COMBUSTIVEL',
      valor,
      'Abastecimento — ref: ' + vehicleLogId
    );
  } catch (e) {
    // Falha no espelho não deve impedir o registro do abastecimento
    Logger.log('[Frota] Aviso: não foi possível criar despesa espelhada: ' + e.message);
  }
}
