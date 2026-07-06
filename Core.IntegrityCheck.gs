// ============================================================
// Core.IntegrityCheck.gs — ALLEGRO Business System
// Verificação semanal de integridade dos dados.
// Gera Action Card para FINANCEIRO_ADMIN se encontrar problemas.
// ============================================================

/**
 * Ponto de entrada do trigger semanal.
 * Executa todas as verificações de integridade e cria um Action Card
 * de sistema caso haja problemas encontrados.
 */
function runIntegrityCheck() {
  Logger.log('[IntegrityCheck] Iniciando verificação...');
  var issues = [];

  try {
    _checkOrphanProposals(issues);
    _checkOrphanActionCards(issues);
    _checkDuplicateCompanyNames(issues);
    _checkProposalsWithoutPricing(issues);

    var total = issues.length;
    Logger.log('[IntegrityCheck] Total de problemas encontrados: ' + total);

    // FB-00036: cards "[SISTEMA] Integridade: N problema(s)" poluíam o board.
    // Mantemos audit log + email opcional para DIRETOR_TECNICO via ALERT_EMAIL.
    if (total > 0) {
      _emailIntegrityReport(issues);
    }

    appendAuditLog(
      'INTEGRITY_CHECK',
      'SYSTEM',
      'auto',
      total + ' problema(s) encontrado(s) na verificação de integridade'
    );
  } catch (e) {
    Logger.log('[IntegrityCheck] Erro durante verificação: ' + e.message);
    appendAuditLog('INTEGRITY_CHECK_ERROR', 'SYSTEM', 'auto', 'Erro: ' + e.message);
  }
}

// ------------------------------------------------------------
// Verificações individuais
// ------------------------------------------------------------

/**
 * Verifica proposals (OPPORTUNITIES) que referenciam um client_id
 * inexistente na aba COMPANIES.
 *
 * @param {string[]} issues - Array de strings de problemas (mutável).
 */
function _checkOrphanProposals(issues) {
  try {
    var companies = sheetToObjects('COMPANIES');
    var companyIds = {};
    companies.forEach(function(c) { companyIds[String(c.id)] = true; });

    var proposals = sheetToObjects('PROPOSALS');
    proposals.forEach(function(p) {
      var cid = String(p.client_id || '').trim();
      if (cid && !companyIds[cid]) {
        issues.push(
          'Proposta ' + p.id + ' referencia client_id "' + cid +
          '" inexistente em COMPANIES'
        );
      }
    });
  } catch (e) {
    Logger.log('[IntegrityCheck] _checkOrphanProposals: ' + e.message);
  }
}

/**
 * Verifica Action Cards que referenciam um quote_id inexistente
 * na aba PROPOSALS.
 *
 * @param {string[]} issues - Array de strings de problemas (mutável).
 */
function _checkOrphanActionCards(issues) {
  try {
    var proposals = sheetToObjects('PROPOSALS');
    var proposalIds = {};
    proposals.forEach(function(p) { proposalIds[String(p.id)] = true; });

    var cards = sheetToObjects('ACTION_CARDS');
    cards.forEach(function(c) {
      var qid = String(c.quote_id || '').trim();
      if (qid && !proposalIds[qid]) {
        issues.push(
          'Action Card ' + c.id + ' referencia quote_id "' + qid +
          '" inexistente em PROPOSALS'
        );
      }
    });
  } catch (e) {
    Logger.log('[IntegrityCheck] _checkOrphanActionCards: ' + e.message);
  }
}

/**
 * Verifica empresas com nome normalizado duplicado em COMPANIES.
 * (Futuramente será substituído por verificação de CNPJ quando o campo for adicionado.)
 *
 * @param {string[]} issues - Array de strings de problemas (mutável).
 */
function _checkDuplicateCompanyNames(issues) {
  try {
    var companies = sheetToObjects('COMPANIES');
    var seen = {};
    companies.forEach(function(c) {
      var norm = String(c.normalized_name || c.name || '').trim().toUpperCase();
      if (!norm) return;
      if (seen[norm]) {
        issues.push(
          'Empresa duplicada pelo nome normalizado "' + norm +
          '": IDs ' + seen[norm] + ' e ' + c.id
        );
      } else {
        seen[norm] = c.id;
      }
    });
  } catch (e) {
    Logger.log('[IntegrityCheck] _checkDuplicateCompanyNames: ' + e.message);
  }
}

/**
 * Verifica proposals sem pricing_json preenchido.
 *
 * @param {string[]} issues - Array de strings de problemas (mutável).
 */
function _checkProposalsWithoutPricing(issues) {
  try {
    var proposals = sheetToObjects('PROPOSALS');
    proposals.forEach(function(p) {
      var pricing = String(p.pricing_json || '').trim();
      if (!pricing || pricing === '{}' || pricing === '[]') {
        issues.push(
          'Proposta ' + p.id + ' (' + (p.title || 'sem título') +
          ') não possui pricing_json definido'
        );
      }
    });
  } catch (e) {
    Logger.log('[IntegrityCheck] _checkProposalsWithoutPricing: ' + e.message);
  }
}

// ------------------------------------------------------------
// Criação do Action Card de sistema
// ------------------------------------------------------------

/**
 * Envia o relatório de integridade por email (se ALERT_EMAIL configurado).
 * Substitui a criação de Action Card (FB-00036) — board não deve ser usado
 * para alertas automáticos do sistema.
 *
 * @param {string[]} issues - Lista de problemas a reportar.
 */
function _emailIntegrityReport(issues) {
  try {
    var recipient = getConfigValue('ALERT_EMAIL') ||
                    PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
    if (!recipient) {
      Logger.log('[IntegrityCheck] ALERT_EMAIL não configurado — relatório só em log.');
      return;
    }
    var dataHora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    var subject  = '[SGA] Integridade: ' + issues.length + ' problema(s) encontrado(s)';
    var body =
      'Verificação automática de integridade (' + dataHora + '):\n\n' +
      issues.map(function(iss, i) { return (i + 1) + '. ' + iss; }).join('\n') +
      '\n\n--\nSGA — Allegro Business System';
    GmailApp.sendEmail(recipient, subject, body);
    Logger.log('[IntegrityCheck] Email enviado para ' + recipient);
  } catch (e) {
    Logger.log('[IntegrityCheck] Falha ao enviar email: ' + e.message);
  }
}

// ------------------------------------------------------------
// Gerenciamento de trigger
// ------------------------------------------------------------

/**
 * Cria (ou recria) o trigger semanal para runIntegrityCheck,
 * todo domingo às 3h. Remove triggers existentes antes de criar.
 */
function setupIntegrityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runIntegrityCheck') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('runIntegrityCheck')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();

  Logger.log('[IntegrityCheck] Trigger semanal configurado para domingo às 03:00.');
}
