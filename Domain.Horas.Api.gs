// =============================================================================
// Domain.Horas.Api.gs
// Allegro Business System — Fase F8 (Timesheet)
// Funções de API chamadas pelo frontend via google.script.run.
// Todas retornam { ok: boolean, data? } ou { ok: false, error: string }.
// =============================================================================

/**
 * Lança horas manuais para o usuário autenticado.
 * Categorias válidas: HORAS_CATEGORIES_MANUAL (não inclui PROJETO).
 *
 * @param {string} date        - Data ISO (AAAA-MM-DD).
 * @param {string} category    - Categoria (ex: 'PROSPECCAO', 'REUNIAO_INTERNA').
 * @param {number} hours       - Horas (0.5 a 24).
 * @param {string} description - Descrição opcional.
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_horasLancar(date, category, hours, description) {
  try {
    var user = requireRole([
      ROLES.DIRETOR_TECNICO,
      ROLES.DIRETOR_COMERCIAL,
      ROLES.FINANCEIRO_ADMIN,
      ROLES.TECNICO
    ]);
    var entry = horasSvcLancar(user.id, date, category, parseFloat(hours), description);
    return { ok: true, data: entry };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o resumo semanal do usuário autenticado.
 * Se weekStart for omitido, usa a semana corrente.
 *
 * @param {string} [weekStart] - Data ISO da segunda-feira (AAAA-MM-DD). Opcional.
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_horasGetSemana(weekStart) {
  try {
    var user = requireRole([
      ROLES.DIRETOR_TECNICO,
      ROLES.DIRETOR_COMERCIAL,
      ROLES.FINANCEIRO_ADMIN,
      ROLES.TECNICO
    ]);
    var semana = weekStart ||
      horasSvcGetWeekStart(new Date().toISOString().split('T')[0]);
    return { ok: true, data: horasSvcGetResumoSemana(user.id, semana) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o resumo semanal de um usuário específico.
 * Restrito a DIRETOR_TECNICO e FINANCEIRO_ADMIN.
 *
 * @param {string} userId    - ID do usuário a consultar.
 * @param {string} weekStart - Data ISO da segunda-feira (AAAA-MM-DD).
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_horasGetSemanaUsuario(userId, weekStart) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.FINANCEIRO_ADMIN]);
    if (!userId) throw new Error('userId é obrigatório.');
    if (!weekStart) throw new Error('weekStart é obrigatório.');
    return { ok: true, data: horasSvcGetResumoSemana(userId, weekStart) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna as categorias disponíveis para lançamento manual.
 * Não inclui PROJETO (criado automaticamente pelo RDO).
 *
 * @returns {{ ok: boolean, data?: string[], error?: string }}
 */
function Api_horasGetCategorias() {
  try {
    requireRole([
      ROLES.DIRETOR_TECNICO,
      ROLES.DIRETOR_COMERCIAL,
      ROLES.FINANCEIRO_ADMIN,
      ROLES.TECNICO
    ]);
    return { ok: true, data: HORAS_CATEGORIES_MANUAL };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o início da semana (segunda-feira) para uma data informada.
 * Útil para o frontend calcular o weekStart antes de chamar Api_horasGetSemana.
 *
 * @param {string} dateISO - Data ISO (AAAA-MM-DD).
 * @returns {{ ok: boolean, data?: string, error?: string }}
 */
function Api_horasGetWeekStart(dateISO) {
  try {
    requireRole([
      ROLES.DIRETOR_TECNICO,
      ROLES.DIRETOR_COMERCIAL,
      ROLES.FINANCEIRO_ADMIN,
      ROLES.TECNICO
    ]);
    if (!dateISO) throw new Error('dateISO é obrigatório.');
    return { ok: true, data: horasSvcGetWeekStart(dateISO) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
