// ============================================================
// Core.Backup.gs — ALLEGRO Business System
// Backup noturno automático da planilha principal para o Drive.
// Retenção: 30 diários + 12 mensais (1ª cópia de cada mês).
// ============================================================

/**
 * Ponto de entrada do trigger noturno.
 * Lê SPREADSHEET_ID e BACKUP_FOLDER_ID das Script Properties.
 * Cria a cópia, move para a pasta de backups e aplica a política
 * de retenção (30 diários / 12 mensais).
 */
function doBackup() {
  var props  = PropertiesService.getScriptProperties();
  var ssId   = props.getProperty('SPREADSHEET_ID');
  var folderId = props.getProperty('BACKUP_FOLDER_ID');

  if (!ssId) {
    Logger.log('[Backup] SPREADSHEET_ID não configurado. Backup abortado.');
    return;
  }

  var today    = new Date();
  var dateStr  = Utilities.formatDate(today, 'America/Sao_Paulo', 'yyyy-MM-dd');
  var fileName = 'ALLEGRO_CORE-' + dateStr;

  try {
    // Cria a cópia no Drive raiz do usuário
    var sourceFile = DriveApp.getFileById(ssId);
    var copy       = sourceFile.makeCopy(fileName);

    // Move para a pasta de backups (cria se não existir)
    var backupFolder = _getOrCreateBackupFolder(folderId);
    backupFolder.addFile(copy);
    DriveApp.getRootFolder().removeFile(copy);

    Logger.log('[Backup] Cópia criada: ' + fileName);
    appendAuditLog('BACKUP', 'SYSTEM', 'auto', 'Backup criado: ' + fileName);

    // Aplica política de retenção
    _applyRetentionPolicy(backupFolder, today);

  } catch (e) {
    Logger.log('[Backup] Erro ao criar backup: ' + e.message);
    appendAuditLog('BACKUP_ERROR', 'SYSTEM', 'auto', 'Erro: ' + e.message);
  }
}

/**
 * Retorna a pasta de backups a partir do BACKUP_FOLDER_ID armazenado.
 * Se o ID não estiver configurado, busca (ou cria) a pasta
 * "Allegro/Backups" no Drive do usuário e salva o ID nas properties.
 *
 * @param {string|null} folderId - ID da pasta (Script Property).
 * @returns {Folder}
 */
function _getOrCreateBackupFolder(folderId) {
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('[Backup] BACKUP_FOLDER_ID inválido (' + folderId + '). Criando nova pasta.');
    }
  }

  // Busca ou cria hierarquia Allegro > Backups
  var root       = DriveApp.getRootFolder();
  var allegroIt  = root.getFoldersByName('Allegro');
  var allegroDir = allegroIt.hasNext() ? allegroIt.next() : root.createFolder('Allegro');

  var backupsIt  = allegroDir.getFoldersByName('Backups');
  var backupsDir = backupsIt.hasNext() ? backupsIt.next() : allegroDir.createFolder('Backups');

  // Persiste o ID para uso futuro
  PropertiesService.getScriptProperties()
    .setProperty('BACKUP_FOLDER_ID', backupsDir.getId());

  return backupsDir;
}

/**
 * Aplica a política de retenção dentro da pasta de backups:
 *  - Mantém até 30 cópias diárias (por data corrida).
 *  - Mantém até 12 cópias mensais (1ª cópia de cada mês — nunca removida
 *    enquanto o limite de 12 meses não for atingido).
 *  - Remove excedentes mais antigos primeiro.
 *
 * @param {Folder} folder  - Pasta de backups.
 * @param {Date}   today   - Data de referência.
 */
function _applyRetentionPolicy(folder, today) {
  var MAX_DAILY   = 30;
  var MAX_MONTHLY = 12;

  var files   = [];
  var fileIt  = folder.getFiles();
  while (fileIt.hasNext()) {
    var f = fileIt.next();
    var name = f.getName();
    // Só processa arquivos com o padrão esperado
    if (/^ALLEGRO_CORE-\d{4}-\d{2}-\d{2}$/.test(name)) {
      files.push({ file: f, name: name, dateStr: name.replace('ALLEGRO_CORE-', '') });
    }
  }

  // Ordena decrescente (mais recente primeiro)
  files.sort(function(a, b) { return b.dateStr.localeCompare(a.dateStr); });

  // Identifica a 1ª cópia de cada mês (candidata a backup mensal)
  var seenMonths = {};
  files.forEach(function(item) {
    var month = item.dateStr.slice(0, 7); // yyyy-MM
    if (!seenMonths[month]) {
      seenMonths[month] = item.dateStr;
      item.isMonthly = true;
    } else {
      item.isMonthly = false;
    }
  });

  var dailyCount   = 0;
  var monthlyCount = 0;

  files.forEach(function(item) {
    if (item.isMonthly) {
      monthlyCount++;
      if (monthlyCount > MAX_MONTHLY) {
        Logger.log('[Backup] Removendo mensal expirado: ' + item.name);
        item.file.setTrashed(true);
      }
    } else {
      dailyCount++;
      if (dailyCount > MAX_DAILY) {
        Logger.log('[Backup] Removendo diário expirado: ' + item.name);
        item.file.setTrashed(true);
      }
    }
  });
}

// ------------------------------------------------------------
// Gerenciamento de trigger
// ------------------------------------------------------------

/**
 * Cria (ou recria) o trigger diário para doBackup às 2h da manhã.
 * Remove todos os triggers existentes de doBackup antes de criar o novo.
 * Deve ser chamado uma vez pelo initSetup() ou manualmente.
 */
function setupBackupTrigger() {
  // Remove triggers existentes desta função para evitar duplicatas
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'doBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('doBackup')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  Logger.log('[Backup] Trigger diário configurado para 02:00.');
}
