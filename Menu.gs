function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Allegro')
    .addItem('Abrir sistema', 'showSidebar')
    .addSeparator()
    .addItem('Configurar abas', 'setupSheets')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Importar dados legados')
      .addItem('Importação completa (Formulário + Propostas)', 'menuRunFullImport')
      .addItem('Somente Formulário', 'menuImportFormulario')
      .addItem('Somente Organização de Propostas', 'menuImportOrgProp'))
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Allegro Business System')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Allegro Business System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupSheets() {
  initCoreSheets();
  try { SpreadsheetApp.getUi().alert('Abas criadas com sucesso!'); } catch(e) { Logger.log('setupSheets ok'); }
}

function menuRunFullImport() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert('Importação completa', 'Isso importará Formulário + Organização de Propostas para as abas do sistema.\n\nCertifique-se de que colou os dados nas abas RAW antes de continuar.\n\nDeseja prosseguir?', ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  try {
    const r = runFullImport();
    ui.alert('Importação concluída', r.message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro na importação', e.message, ui.ButtonSet.OK);
  }
}

function menuImportFormulario() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = importFormulario();
    ui.alert('Formulário importado', r.summary, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro', e.message, ui.ButtonSet.OK);
  }
}

function menuImportOrgProp() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = importOrganizacaoPropostas();
    ui.alert('Propostas importadas', r.summary, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Erro', e.message, ui.ButtonSet.OK);
  }
}
