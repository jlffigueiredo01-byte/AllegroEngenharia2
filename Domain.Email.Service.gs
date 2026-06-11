// ============================================================
// Domain.Email.Service.gs — ALLEGRO Business System
// Lógica de negócio para envio de e-mails com templates.
// Usa MailApp (sem OAuth extra). Limite consumer: ~100/dia.
// ECOSSISTEMA_V2 §6.3 + ADENDO_V2_1 §G
// ============================================================

/**
 * Substitui variáveis {{nome_variavel}} no texto do template.
 * @param {string} template - Texto com marcadores {{chave}}.
 * @param {Object} vars - Mapa chave→valor para substituição.
 * @returns {string} Texto com variáveis substituídas.
 */
function emailSvcInterpolate(template, vars) {
  var result = template;
  for (var key in vars) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      var re = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
      result = result.replace(re, vars[key] || '');
    }
  }
  return result;
}

/**
 * Envia e-mail usando um template cadastrado na aba EMAIL_TEMPLATES.
 * Verifica cota diária antes de enviar. Registra no AUDIT_LOG.
 * @param {string} templateCode - Código do template (ex: 'PROPOSTA_ENVIADA').
 * @param {string} toEmail - Endereço do destinatário.
 * @param {Object} vars - Variáveis de substituição para subject e body.
 * @param {Object} [opts] - Opções extras: { cc, bcc, attachments }.
 * @returns {{to: string, subject: string, quota_left: number}}
 * @throws {Error} Se template não encontrado ou cota esgotada.
 */
function emailSvcEnviar(templateCode, toEmail, vars, opts) {
  opts = opts || {};
  var tmpl = emailRepoGetTemplate(templateCode);
  if (!tmpl) throw new Error('Template de e-mail não encontrado: ' + templateCode);

  var subject = emailSvcInterpolate(tmpl.subject_template, vars);
  var body    = emailSvcInterpolate(tmpl.body_template,    vars) +
                '\n\n--\nEnviado pelo SGA — Sistema de Gestão Allegro';

  // Verifica cota restante (GAS consumer: 100/dia)
  var quotaLeft = MailApp.getRemainingDailyQuota();
  if (quotaLeft < 1) throw new Error('Cota diária de e-mail esgotada (' + quotaLeft + ' restantes).');

  var mailOptions = { name: 'Allegro Engenharia' };
  if (opts.cc)          mailOptions.cc          = opts.cc;
  if (opts.bcc)         mailOptions.bcc         = opts.bcc;
  if (opts.attachments) mailOptions.attachments = opts.attachments;

  // Envia com corpo HTML simples (quebras de linha convertidas) e plain-text fallback
  mailOptions.htmlBody = body.replace(/\n/g, '<br>');

  MailApp.sendEmail(toEmail, subject, body, mailOptions);

  appendAuditLog(
    'EMAIL_ENVIADO',
    'EMAIL_TEMPLATES',
    templateCode,
    'Para: ' + toEmail + ' | Assunto: ' + subject
  );

  return { to: toEmail, subject: subject, quota_left: quotaLeft - 1 };
}

/**
 * Envia a proposta por e-mail para o contato principal da empresa vinculada.
 * Conveniência chamada pelo workflow APROVADA_ENVIO → ENVIADA.
 * @param {string} proposalId - ID da proposta (ex: 'PROP-001').
 * @param {string} [pdfFileId] - ID do arquivo PDF no Google Drive (opcional).
 * @returns {{to: string, subject: string, quota_left: number}}
 * @throws {Error} Se proposta, empresa ou contato principal não encontrados.
 */
function emailSvcEnviarProposta(proposalId, pdfFileId) {
  // Carrega proposta via Repository — sem acesso direto à sheet
  var proposal = propRepoGetById(proposalId);
  if (!proposal) throw new Error('Proposta não encontrada: ' + proposalId);

  // Carrega empresa vinculada via helper do Domain.Companies — sem acesso direto à sheet
  var companies = _getCompaniesRows();
  var company   = null;
  for (var j = 0; j < companies.length; j++) {
    if (companies[j].id === proposal.company_id) { company = companies[j]; break; }
  }
  if (!company) throw new Error('Empresa não encontrada para a proposta: ' + proposalId);

  // Busca contato principal com e-mail via helper do Domain.Contacts — sem acesso direto à sheet
  var contacts     = _getAllContacts_();
  var contactEmail = '';
  var contactName  = company.name;
  for (var k = 0; k < contacts.length; k++) {
    if (contacts[k].company_id === company.id && contacts[k].main === 'TRUE') {
      contactEmail = contacts[k].email;
      contactName  = contacts[k].name;
      break;
    }
  }
  if (!contactEmail) throw new Error('Empresa sem contato principal com e-mail cadastrado: ' + company.id);

  // Monta link do PDF se disponível
  var linkPdf = pdfFileId
    ? 'https://drive.google.com/file/d/' + pdfFileId + '/view'
    : '(PDF em preparação)';

  var valorFormatado = '';
  if (proposal.total_estimado) {
    valorFormatado = 'R$ ' + parseFloat(proposal.total_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  var vars = {
    nome_contato:     contactName,
    titulo_proposta:  proposal.title || proposalId,
    valor_total:      valorFormatado,
    link_pdf:         linkPdf,
    nome_empresa:     company.name
  };

  return emailSvcEnviar('PROPOSTA_ENVIADA', contactEmail, vars);
}

/**
 * Verifica propostas no status ENVIADA há mais de FOLLOWUP_DIAS dias sem retorno.
 * Gera Action Cards de follow-up para cada proposta pendente.
 * Chamado pelo Scheduler diariamente às 06:00 (job 'followup').
 * @returns {number} Quantidade de follow-ups gerados.
 */
function emailSvcCheckFollowUps() {
  // Lê configuração de dias para follow-up via getConfigValue — sem acesso direto à sheet
  var followupDias = parseInt(getConfigValue('FOLLOWUP_DIAS') || '5') || 5;

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - followupDias);

  // Carrega propostas via Repository — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var pendentes = proposals.filter(function(p) {
    return p.status === 'ENVIADA' && p.sent_at && new Date(p.sent_at) < cutoff;
  });

  pendentes.forEach(function(p) {
    // Cria Action Card de follow-up via acCreate() — sem acesso direto à sheet
    acCreate({
      title:       'Follow-up: ' + (p.title || p.id),
      message:     'Proposta enviada há mais de ' + followupDias + ' dias sem retorno.',
      quote_id:    p.id,
      pos_venda_id: '',
      urgent:      false,
      assigned_to: '',
      created_by:  'SCHEDULER',
      // Campos extras de workflow gravados após criação pelo chamador se necessário
      tipo:        'FOLLOWUP',
      source:      'SCHEDULER'
    });
  });

  appendAuditLog(
    'EMAIL_FOLLOWUP_CHECK',
    'PROPOSALS',
    'SYSTEM',
    pendentes.length + ' follow-up(s) gerado(s)'
  );

  return pendentes.length;
}
