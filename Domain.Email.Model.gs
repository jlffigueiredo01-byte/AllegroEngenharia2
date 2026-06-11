// ============================================================
// Domain.Email.Model.gs — ALLEGRO Business System
// Constantes, headers e seed de templates de e-mail.
// ECOSSISTEMA_V2 §6.3 + ADENDO_V2_1 §G
// ============================================================

var EMAIL_TEMPLATES_SHEET = 'EMAIL_TEMPLATES';
var EMAIL_TEMPLATES_HEADERS = [
  'id', 'code', 'subject_template', 'body_template', 'active', 'created_at', 'updated_at'
];

/**
 * Templates built-in (seed inicial).
 * Variáveis suportadas: {{nome_cliente}}, {{titulo_proposta}},
 * {{valor_total}}, {{link_pdf}}, {{nome_empresa}}, {{nome_contato}},
 * {{data_envio}}, {{ticket_id}}, {{titulo_ticket}}, {{sla_h}}, {{resolucao}}.
 */
var EMAIL_TEMPLATE_SEEDS = [
  {
    code: 'PROPOSTA_ENVIADA',
    subject_template: 'Proposta {{titulo_proposta}} — Allegro Engenharia',
    body_template: 'Prezado(a) {{nome_contato}},\n\nConforme alinhado, segue nossa proposta {{titulo_proposta}}.\n\n{{link_pdf}}\n\nFicamos à disposição para qualquer esclarecimento.\n\nAtenciosamente,\nEquipe Allegro Engenharia',
    active: 'TRUE'
  },
  {
    code: 'FOLLOWUP_PROPOSTA',
    subject_template: 'Acompanhamento — {{titulo_proposta}}',
    body_template: 'Prezado(a) {{nome_contato}},\n\nGostaríamos de acompanhar o status da proposta {{titulo_proposta}} que enviamos em {{data_envio}}.\n\nEstamos disponíveis para ajustar conforme suas necessidades.\n\nAtenciosamente,\nEquipe Allegro Engenharia',
    active: 'TRUE'
  },
  {
    code: 'PROPOSTA_APROVADA',
    subject_template: 'Proposta aprovada — próximos passos: {{titulo_proposta}}',
    body_template: 'Prezado(a) {{nome_contato}},\n\nExcelente notícia! Confirmamos o recebimento da aprovação da proposta {{titulo_proposta}}.\n\nNosso time entrará em contato em breve para alinhar o kick-off.\n\nAtenciosamente,\nEquipe Allegro Engenharia',
    active: 'TRUE'
  },
  {
    code: 'TICKET_ABERTO',
    subject_template: 'Ticket {{ticket_id}} aberto — {{titulo_ticket}}',
    body_template: 'Prezado(a) {{nome_contato}},\n\nRecebemos seu chamado {{ticket_id}} referente a: {{titulo_ticket}}.\n\nNosso SLA de resposta é de {{sla_h}} horas.\n\nAtenciosamente,\nEquipe Allegro Engenharia',
    active: 'TRUE'
  },
  {
    code: 'TICKET_RESOLVIDO',
    subject_template: 'Ticket {{ticket_id}} resolvido',
    body_template: 'Prezado(a) {{nome_contato}},\n\nInformamos que o ticket {{ticket_id}} foi resolvido.\n\nSolução aplicada: {{resolucao}}\n\nCaso o problema persista, responda este e-mail.\n\nAtenciosamente,\nEquipe Allegro Engenharia',
    active: 'TRUE'
  }
];

/**
 * Inicializa a aba EMAIL_TEMPLATES com cabeçalhos e seed de templates.
 * Idempotente: se a aba já existir com dados, não reprocessa.
 */
function initEmailTemplatesSheet() {
  var sheet = ss().getSheetByName(EMAIL_TEMPLATES_SHEET);
  if (sheet && sheet.getLastRow() > 1) return;
  sheet = getOrCreateSheet(EMAIL_TEMPLATES_SHEET, EMAIL_TEMPLATES_HEADERS);
  var agora = nowISO();
  EMAIL_TEMPLATE_SEEDS.forEach(function(t, i) {
    sheet.appendRow([
      'TMPL-' + String(i + 1).padStart(3, '0'),
      t.code,
      t.subject_template,
      t.body_template,
      t.active,
      agora,
      agora
    ]);
  });
  sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_HEADERS.length)
    .setBackground('#1a56db')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 500);
}
