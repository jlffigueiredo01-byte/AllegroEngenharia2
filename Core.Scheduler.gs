// ============================================================
// Core.Scheduler.gs — ALLEGRO Business System
// Scheduler central: UM único trigger horário despacha todos
// os jobs registrados. Evita proliferação de triggers (limite GAS).
// ============================================================

/**
 * Registro de jobs agendados.
 * Campos:
 *  - name       {string}  Identificador legível
 *  - fn         {string}  Nome da função GAS a executar
 *  - hour       {number}  Hora (0-23) em que o job deve rodar
 *  - dayOfWeek  {number}  (opcional) 0=Dom, 1=Seg … 6=Sáb;
 *                         se omitido, roda todos os dias
 */
var SCHEDULER_JOBS = [
  { name: 'kpi-snapshot', fn: 'kpiSvcCalcularPainel',          hour: 1 },  // F9 — Painel de 8 (01:00 diário)
  { name: 'backup',       fn: 'doBackup',                      hour: 2 },
  { name: 'integrity',    fn: 'runIntegrityCheck',              hour: 3, dayOfWeek: 0 },
  // F6 — Pós-Venda: atualização de garantias e verificação de SLAs
  { name: 'garantias',    fn: 'biSvcAtualizarStatusGarantias',  hour: 4 },
  // F19 — Projetos: verifica marcos atrasados
  { name: 'marcos-check', fn: 'projSvcCheckMarcosAtrasados',   hour: 5 },
  { name: 'followup',     fn: 'emailSvcCheckFollowUps',         hour: 6 },
  { name: 'wf-sla',       fn: 'wfCheckSlaEstourados',           hour: 7 },
  { name: 'sla-check',         fn: 'tktSvcCheckSlas',                hour: 8 },
  // F18 — Compliance/HSE: verifica vencimentos toda segunda-feira às 05:00
  { name: 'compliance-check', fn: 'complianceSvcCheckVencimentos',  hour: 5, dayOfWeek: 1 }
];

// ------------------------------------------------------------
// Tick principal — chamado a cada hora pelo trigger horário
// ------------------------------------------------------------

/**
 * Verifica a hora atual e o dia da semana e despacha os jobs
 * cujo horário bate com o momento presente.
 * Registra cada execução no AUDIT_LOG.
 */
function schedulerTick() {
  var now        = new Date();
  var tz         = 'America/Sao_Paulo';
  var currentHour = parseInt(Utilities.formatDate(now, tz, 'H'), 10);
  var currentDow  = parseInt(Utilities.formatDate(now, tz, 'u'), 10) % 7; // 0=Dom

  SCHEDULER_JOBS.forEach(function(job) {
    if (job.hour !== currentHour) return;

    // Se o job tem restrição de dia da semana, verifica
    if (job.dayOfWeek !== undefined && job.dayOfWeek !== currentDow) return;

    Logger.log('[Scheduler] Despachando job: ' + job.name + ' (' + job.fn + ')');

    try {
      var fn = this[job.fn];
      if (typeof fn === 'function') {
        fn();
        appendAuditLog(
          'SCHEDULER_JOB',
          'SYSTEM',
          'auto',
          'Job executado com sucesso: ' + job.name
        );
      } else {
        Logger.log('[Scheduler] Função não encontrada: ' + job.fn);
        appendAuditLog(
          'SCHEDULER_ERROR',
          'SYSTEM',
          'auto',
          'Função não encontrada: ' + job.fn
        );
      }
    } catch (e) {
      Logger.log('[Scheduler] Erro no job "' + job.name + '": ' + e.message);
      appendAuditLog(
        'SCHEDULER_ERROR',
        'SYSTEM',
        'auto',
        'Erro no job "' + job.name + '": ' + e.message
      );
    }
  });
}

// ------------------------------------------------------------
// Gerenciamento de trigger
// ------------------------------------------------------------

/**
 * Cria (ou recria) o trigger horário para schedulerTick.
 * Remove triggers existentes de schedulerTick antes de criar o novo.
 * Deve ser chamado uma vez pelo initSetup() ou manualmente.
 */
function setupScheduler() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'schedulerTick') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('schedulerTick')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('[Scheduler] Trigger horário configurado para schedulerTick.');
}

// ------------------------------------------------------------
// Diagnóstico
// ------------------------------------------------------------

/**
 * Lista os jobs registrados e seu próximo horário de execução.
 * Útil para depuração no editor do Apps Script.
 */
function listSchedulerJobs() {
  var lines = SCHEDULER_JOBS.map(function(job) {
    var days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var when = job.dayOfWeek !== undefined
      ? days[job.dayOfWeek] + ' às ' + job.hour + 'h'
      : 'Diário às ' + job.hour + 'h';
    return '  • ' + job.name + ' → ' + job.fn + ' [' + when + ']';
  }).join('\n');
  Logger.log('[Scheduler] Jobs registrados:\n' + lines);
}
