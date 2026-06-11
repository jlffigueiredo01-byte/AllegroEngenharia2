// =============================================================================
// Domain.Horas.Service.gs
// Allegro Business System — Fase F8 (Timesheet)
// Regras de negócio do módulo de horas.
//
// REGRA CRÍTICA (VALIDACAO_V3 §3.5):
//   Horas de PROJETO nascem SÓ do RDO (automático).
//   A grade semanal cobre apenas categorias não-projeto.
//   O lembrete de sexta ignora dias já cobertos por RDO.
//   Uma hora, um lançamento, um lugar.
// =============================================================================

/**
 * Calcula o início da semana (segunda-feira) para uma data ISO.
 * @param {string} dateISO - Data no formato AAAA-MM-DD.
 * @returns {string} Data da segunda-feira da semana, formato AAAA-MM-DD.
 */
function horasSvcGetWeekStart(dateISO) {
  var d = new Date(dateISO + 'T12:00:00'); // meio-dia evita problema de fuso
  var day = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
  var diff = (day === 0) ? -6 : (1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

/**
 * Lança horas manualmente (categorias não-projeto).
 * Valida que a categoria não é PROJETO (que só vem do RDO).
 * Valida que a data não é futura (tolerância de +1 dia).
 *
 * @param {string} userId      - ID do usuário.
 * @param {string} date        - Data ISO (AAAA-MM-DD).
 * @param {string} category    - Categoria do lançamento (use HORAS_CATEGORIES_MANUAL).
 * @param {number} hours       - Horas lançadas (0.5 a 24).
 * @param {string} description - Descrição opcional.
 * @returns {Object} Entrada criada.
 * @throws {Error} Se a categoria for PROJETO, inválida, ou as horas forem inválidas.
 */
function horasSvcLancar(userId, date, category, hours, description) {
  // Categoria PROJETO é bloqueada para lançamento manual
  if (category === HORAS_CATEGORY_PROJETO) {
    throw new Error(
      'Horas de projeto são lançadas automaticamente pelo RDO. ' +
      'Use as categorias: ' + HORAS_CATEGORIES_MANUAL.join(', ')
    );
  }

  // Valida que a categoria está na lista permitida
  if (HORAS_CATEGORIES_MANUAL.indexOf(category) === -1) {
    throw new Error(
      'Categoria inválida: ' + category + '. Use: ' + HORAS_CATEGORIES_MANUAL.join(', ')
    );
  }

  // Valida faixa de horas
  var h = parseFloat(hours);
  if (isNaN(h) || h < 0.5 || h > 24) {
    throw new Error('Horas devem ser entre 0.5 e 24.');
  }

  // Valida que a data não é futura (tolerância de +1 dia)
  var dataLancamento = new Date(date + 'T12:00:00');
  var amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(23, 59, 59, 999);
  if (dataLancamento > amanha) {
    throw new Error('Não é permitido lançar horas para datas futuras (tolerância de 1 dia).');
  }

  var weekStart = horasSvcGetWeekStart(date);
  var entry = {
    id:          'HE-' + getAndIncrementCounter('HORAS_COUNTER'),
    user_id:     userId,
    date:        date,
    category:    category,
    hours:       h,
    description: description || '',
    project_id:  '',
    rdo_id:      '',
    origin:      HORAS_ORIGIN.MANUAL,
    week_start:  weekStart,
    created_at:  nowISO(),
    updated_at:  nowISO()
  };

  horasRepoCreate(entry);
  appendAuditLog(
    'HORAS_LANCAR',
    TIME_ENTRIES_SHEET,
    entry.id,
    userId + ': ' + h + 'h ' + category + ' em ' + date
  );

  return entry;
}

/**
 * Lança horas de projeto automaticamente via RDO.
 * Chamado INTERNAMENTE por Domain.Projetos (F19).
 * Não deve ser chamado diretamente pelo usuário.
 *
 * @param {string} userId    - ID do usuário (técnico responsável pelo RDO).
 * @param {string} projectId - ID do projeto.
 * @param {string} rdoId     - ID do RDO de origem.
 * @param {string} date      - Data ISO (AAAA-MM-DD) do RDO.
 * @param {number} hours     - Horas registradas no RDO.
 * @returns {Object} Entrada criada.
 */
function horasSvcLancarRdo(userId, projectId, rdoId, date, hours) {
  var h = parseFloat(hours);
  if (isNaN(h) || h <= 0) {
    throw new Error('Horas do RDO devem ser maiores que zero.');
  }

  var weekStart = horasSvcGetWeekStart(date);
  var entry = {
    id:          'HE-' + getAndIncrementCounter('HORAS_COUNTER'),
    user_id:     userId,
    date:        date,
    category:    HORAS_CATEGORY_PROJETO,
    hours:       h,
    description: 'RDO: ' + rdoId,
    project_id:  projectId,
    rdo_id:      rdoId,
    origin:      HORAS_ORIGIN.RDO,
    week_start:  weekStart,
    created_at:  nowISO(),
    updated_at:  nowISO()
  };

  horasRepoCreate(entry);
  appendAuditLog(
    'HORAS_RDO',
    TIME_ENTRIES_SHEET,
    entry.id,
    userId + ': ' + h + 'h PROJETO ' + projectId + ' em ' + date
  );

  return entry;
}

/**
 * Retorna o resumo semanal de um usuário.
 * Inclui total geral, total por categoria e dias úteis sem lançamento.
 *
 * @param {string} userId    - ID do usuário.
 * @param {string} weekStart - Data ISO (AAAA-MM-DD) da segunda-feira.
 * @returns {Object} Resumo com campos:
 *   - week_start {string}
 *   - user_id {string}
 *   - total_horas {number}
 *   - por_categoria {Object} chave: categoria, valor: total de horas
 *   - dias_sem_lancamento {string[]} datas ISO dos dias úteis sem registro
 *   - entries {Object[]} lançamentos do período
 */
function horasSvcGetResumoSemana(userId, weekStart) {
  var entries = horasRepoGetByUserWeek(userId, weekStart);

  var totalPorCategoria = {};
  var diasComRegistro = {};

  entries.forEach(function(e) {
    var cat = e.category;
    var hrs = parseFloat(e.hours) || 0;
    totalPorCategoria[cat] = (totalPorCategoria[cat] || 0) + hrs;
    diasComRegistro[String(e.date).trim()] = true;
  });

  // Mapeia os 5 dias úteis da semana (seg a sex) sem lançamento
  var diasSemLancamento = [];
  var d = new Date(weekStart + 'T12:00:00');
  for (var i = 0; i < 5; i++) {
    var iso = d.toISOString().split('T')[0];
    if (!diasComRegistro[iso]) {
      diasSemLancamento.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }

  var totalHoras = entries.reduce(function(sum, e) {
    return sum + (parseFloat(e.hours) || 0);
  }, 0);

  return {
    week_start:            weekStart,
    user_id:               userId,
    total_horas:           totalHoras,
    por_categoria:         totalPorCategoria,
    dias_sem_lancamento:   diasSemLancamento,
    entries:               entries
  };
}
