// =============================================================================
// Domain.Tickets.Service.gs
// Allegro Business System — Fase F6
// Regras de negócio de Tickets. Sem acesso direto à planilha.
// =============================================================================

// -----------------------------------------------------------------------------
// Helpers internos
// -----------------------------------------------------------------------------

/**
 * Lê os SLAs em horas para uma prioridade a partir do CONFIG.
 * Chaves esperadas no CONFIG:
 *   SLA_RESPONSE_CRITICA_H, SLA_RESPONSE_ALTA_H, SLA_RESPONSE_NORMAL_H, SLA_RESPONSE_BAIXA_H
 *   SLA_RESOLUTION_CRITICA_H, SLA_RESOLUTION_ALTA_H, SLA_RESOLUTION_NORMAL_H, SLA_RESOLUTION_BAIXA_H
 *
 * @param {string} priority - Prioridade do ticket (CRITICA, ALTA, NORMAL, BAIXA).
 * @returns {{ responseH: number, resolutionH: number }}
 */
function _tktGetSla(priority) {
  var p = String(priority || 'NORMAL').toUpperCase();
  var responseH   = safeNumber(getConfigValue('SLA_RESPONSE_'   + p + '_H'),   _tktDefaultResponse(p));
  var resolutionH = safeNumber(getConfigValue('SLA_RESOLUTION_' + p + '_H'),   _tktDefaultResolution(p));
  return { responseH: responseH, resolutionH: resolutionH };
}

/** Valores default de resposta por prioridade (caso CONFIG não tenha a chave). */
function _tktDefaultResponse(p) {
  var defaults = { CRITICA: 1, ALTA: 4, NORMAL: 8, BAIXA: 24 };
  return defaults[p] !== undefined ? defaults[p] : 8;
}

/** Valores default de resolução por prioridade (caso CONFIG não tenha a chave). */
function _tktDefaultResolution(p) {
  var defaults = { CRITICA: 4, ALTA: 24, NORMAL: 72, BAIXA: 168 };
  return defaults[p] !== undefined ? defaults[p] : 72;
}

// -----------------------------------------------------------------------------
// Service público
// -----------------------------------------------------------------------------

/**
 * Abre um novo ticket no sistema.
 * Calcula SLAs a partir do CONFIG pela prioridade.
 * Gera ID sequencial TKT-NNNNN via getAndIncrementCounter.
 * Cria Action Card para o responsável atribuído.
 *
 * @param {Object} data                   - Dados do ticket.
 * @param {string} data.title             - Título do ticket (obrigatório).
 * @param {string} data.company_id        - ID da empresa (obrigatório).
 * @param {string} [data.description]     - Descrição detalhada.
 * @param {string} [data.priority]        - Prioridade: CRITICA, ALTA, NORMAL (default), BAIXA.
 * @param {string} [data.category]        - Categoria (ver TICKET_CATEGORIES).
 * @param {string} [data.serial_id]       - ID do registro na INSTALLED_BASE.
 * @param {string} [data.assigned_to]     - ID do usuário responsável.
 * @returns {Object} Registro completo do ticket criado.
 * @throws {Error} Se title ou company_id estiverem ausentes.
 */
function tktSvcAbrir(data) {
  if (!data || !data.title || !String(data.title).trim()) {
    throw new Error('Título do ticket é obrigatório.');
  }
  if (!data.company_id) {
    throw new Error('company_id é obrigatório.');
  }

  var prioridade = (data.priority && TICKET_PRIORITY[data.priority])
    ? data.priority
    : TICKET_PRIORITY.NORMAL;

  var sla = _tktGetSla(prioridade);
  var user = requireAuth();
  var agora = new Date();
  var id = 'TKT-' + String(getAndIncrementCounter('TKT_COUNTER')).padStart(5, '0');
  // Guarda de unicidade: se o CONFIG sofreu leitura defasada (cache) e o id
  // já existe, avança o contador até achar um livre. (bug dos TKT duplicados)
  var _idsExistentes = {};
  var _rowsTk = sheetToObjects(TICKETS_SHEET);
  for (var _ix = 0; _ix < _rowsTk.length; _ix++) _idsExistentes[_rowsTk[_ix].id] = true;
  while (_idsExistentes[id]) {
    id = 'TKT-' + String(getAndIncrementCounter('TKT_COUNTER')).padStart(5, '0');
  }

  // TODO [INTEGRACAO_F6→F5]: Verificar se serial_id existe na base instalada antes de criar o ticket.
  // Usar biRepoGetById(data.serial_id) — se não encontrado, lançar erro informativo.
  // Descomentar quando Domain.BaseInstalada.Repository estiver disponível no deploy:
  // if (data.serial_id) {
  //   var equipamento = biRepoGetById(data.serial_id);
  //   if (!equipamento) throw new Error('Equipamento não encontrado na base instalada: ' + data.serial_id);
  // }

  var record = {
    id:                id,
    title:             String(data.title).trim(),
    description:       data.description    || '',
    status:            TICKET_STATUS.ABERTO,
    priority:          prioridade,
    category:          data.category       || 'OUTRO',
    company_id:        data.company_id,
    serial_id:         data.serial_id      || '',
    opened_by:         user.id,
    assigned_to:       data.assigned_to    || '',
    opened_at:         agora.toISOString(),
    first_response_at: '',
    resolved_at:       '',
    closed_at:         '',
    sla_response_h:    sla.responseH,
    sla_resolution_h:  sla.resolutionH,
    sla_response_ok:   '',
    sla_resolution_ok: '',
    resolution_notes:  '',
    root_cause:        '',
    drive_folder_id:   '',
    created_at:        agora.toISOString(),
    updated_at:        agora.toISOString()
  };

  tktRepoCreate(record);

  appendAuditLog(
    'TICKET_ABERTO',
    TICKETS_SHEET,
    id,
    'Prioridade: ' + prioridade + ' | Empresa: ' + data.company_id + ' | SLA resp: ' + sla.responseH + 'h'
  );

  // Criar Action Card para o responsável (ou notificação geral se não houver assigned_to)
  try {
    var cardTitle = '[' + prioridade + '] Ticket ' + id + ': ' + record.title;
    acSvcCreateCard({
      title:       cardTitle,
      message:     (data.description || '') + '\nEmpresa: ' + data.company_id,
      pos_venda_id: id,
      urgent:      prioridade === TICKET_PRIORITY.CRITICA,
      assigned_to: data.assigned_to || ''
    }, user);
  } catch (e) {
    Logger.log('[tktSvcAbrir] Aviso: não foi possível criar Action Card: ' + e.message);
  }

  return record;
}

/**
 * Registra a primeira resposta ao ticket.
 * Calcula se o SLA de resposta foi cumprido comparando com o tempo de abertura.
 * Idempotente: se já houver first_response_at, retorna o ticket sem alterar.
 *
 * @param {string} id     - ID do ticket.
 * @param {string} userId - ID do usuário que está respondendo.
 * @returns {Object} Registro atualizado do ticket.
 * @throws {Error} Se o ticket não for encontrado.
 */
function tktSvcRegistrarRespondido(id, userId) {
  var tkt = tktRepoGetById(id);
  if (!tkt) throw new Error('Ticket não encontrado: ' + id);

  // Idempotente — já respondido
  if (tkt.first_response_at) return tkt;

  var agora    = new Date();
  var abertura = new Date(tkt.opened_at);
  var diferencaHoras = (agora - abertura) / (1000 * 60 * 60);
  var slaOk = diferencaHoras <= safeNumber(tkt.sla_response_h, 999);

  tktRepoUpdate(id, {
    first_response_at: agora.toISOString(),
    sla_response_ok:   slaOk ? 'TRUE' : 'FALSE',
    status:            TICKET_STATUS.EM_ATENDIMENTO,
    assigned_to:       userId || tkt.assigned_to,
    updated_at:        nowISO()
  });

  appendAuditLog(
    'TICKET_RESPONDIDO',
    TICKETS_SHEET,
    id,
    'SLA resposta: ' + (slaOk ? 'OK' : 'EXPIRADO') + ' (' + diferencaHoras.toFixed(1) + 'h / ' + tkt.sla_response_h + 'h)'
  );

  return tktRepoGetById(id);
}

/**
 * Resolve o ticket. Registra notas de resolução e causa raiz.
 * Calcula se o SLA de resolução foi cumprido.
 * Atualiza status para RESOLVIDO.
 *
 * @param {string} id              - ID do ticket.
 * @param {string} resolutionNotes - Notas da resolução (obrigatório).
 * @param {string} [rootCause]     - Causa raiz identificada.
 * @returns {Object} Registro atualizado do ticket.
 * @throws {Error} Se o ticket não for encontrado ou resolutionNotes estiver ausente.
 */
function tktSvcResolver(id, resolutionNotes, rootCause) {
  var tkt = tktRepoGetById(id);
  if (!tkt) throw new Error('Ticket não encontrado: ' + id);
  if (!resolutionNotes || !String(resolutionNotes).trim()) {
    throw new Error('Notas de resolução são obrigatórias.');
  }

  var agora    = new Date();
  var abertura = new Date(tkt.opened_at);
  var diferencaHoras = (agora - abertura) / (1000 * 60 * 60);
  var slaOk = diferencaHoras <= safeNumber(tkt.sla_resolution_h, 999);

  tktRepoUpdate(id, {
    status:            TICKET_STATUS.RESOLVIDO,
    resolved_at:       agora.toISOString(),
    resolution_notes:  String(resolutionNotes).trim(),
    root_cause:        rootCause ? String(rootCause).trim() : '',
    sla_resolution_ok: slaOk ? 'TRUE' : 'FALSE',
    updated_at:        nowISO()
  });

  appendAuditLog(
    'TICKET_RESOLVIDO',
    TICKETS_SHEET,
    id,
    'SLA resolução: ' + (slaOk ? 'OK' : 'EXPIRADO') + ' (' + diferencaHoras.toFixed(1) + 'h / ' + tkt.sla_resolution_h + 'h)'
  );

  return tktRepoGetById(id);
}

/**
 * Fecha o ticket (confirmação do cliente ou diretoria técnica).
 * Atualiza status para FECHADO e registra closed_at.
 * Se category = CALIBRACAO e serial_id preenchido, atualiza calibration_date na base instalada.
 *
 * @param {string} id - ID do ticket.
 * @returns {Object} Registro atualizado do ticket.
 * @throws {Error} Se o ticket não for encontrado ou não estiver RESOLVIDO.
 */
function tktSvcFechar(id) {
  var tkt = tktRepoGetById(id);
  if (!tkt) throw new Error('Ticket não encontrado: ' + id);
  if (tkt.status !== TICKET_STATUS.RESOLVIDO) {
    throw new Error('Apenas tickets RESOLVIDOS podem ser fechados. Status atual: ' + tkt.status);
  }

  var agora = new Date().toISOString();

  tktRepoUpdate(id, {
    status:     TICKET_STATUS.FECHADO,
    closed_at:  agora,
    updated_at: agora
  });

  // Atualiza data de calibração na base instalada se for ticket de calibração
  if (tkt.category === 'CALIBRACAO' && tkt.serial_id) {
    try {
      biRepoUpdate(tkt.serial_id, {
        calibration_date: new Date().toISOString().split('T')[0],
        updated_at:       agora
      });
    } catch (e) {
      Logger.log('[tktSvcFechar] Aviso: não foi possível atualizar calibration_date: ' + e.message);
    }
  }

  appendAuditLog(
    'TICKET_FECHADO',
    TICKETS_SHEET,
    id,
    'Ticket fechado. Categoria: ' + tkt.category
  );

  return tktRepoGetById(id);
}

/**
 * Atualiza o status de um ticket com nota obrigatória.
 * Utilizado para transições manuais (ex: ABERTO → AGUARDANDO_CLIENTE).
 *
 * @param {string} id        - ID do ticket.
 * @param {string} novoStatus - Novo status (ver TICKET_STATUS).
 * @param {string} [notes]   - Nota sobre a mudança.
 * @returns {Object} Registro atualizado.
 * @throws {Error} Se o ticket não for encontrado ou status inválido.
 */
function tktSvcUpdateStatus(id, novoStatus, notes) {
  var tkt = tktRepoGetById(id);
  if (!tkt) throw new Error('Ticket não encontrado: ' + id);
  if (!TICKET_STATUS[novoStatus]) {
    throw new Error('Status inválido: ' + novoStatus + '. Use: ' + Object.keys(TICKET_STATUS).join(', '));
  }

  tktRepoUpdate(id, {
    status:     novoStatus,
    updated_at: nowISO()
  });

  appendAuditLog(
    'TICKET_STATUS',
    TICKETS_SHEET,
    id,
    'Status: ' + tkt.status + ' → ' + novoStatus + (notes ? ' | ' + notes : '')
  );

  return tktRepoGetById(id);
}

/**
 * Verifica SLAs de todos os tickets abertos (chamado pelo Scheduler, diário 8h).
 * Cria Action Card de tipo 'SLA_ESTOURADO' para DIRETOR_TECNICO quando houver violações.
 *
 * @returns {Object[]} Array de tickets com SLA de resolução estourado.
 */
function tktSvcCheckSlas() {
  var agora   = new Date();
  var abertos = tktRepoGetOpen();
  var slaEstourados = [];

  abertos.forEach(function(t) {
    if (t.resolved_at) return; // já resolvido
    var abertura = new Date(t.opened_at);
    var horas    = (agora - abertura) / (1000 * 60 * 60);
    var slaH     = safeNumber(t.sla_resolution_h, 999);
    if (horas > slaH) {
      slaEstourados.push(t);
    }
  });

  if (slaEstourados.length > 0) {
    try {
      var ids = slaEstourados.map(function(t) { return t.id; }).join(', ');
      acSvcCreateCard({
        title:   'SLA Estourado: ' + slaEstourados.length + ' ticket(s)',
        message: 'Tickets com SLA de resolução ultrapassado: ' + ids,
        urgent:  true
      }, { id: 'SYSTEM', name: 'Sistema' });
    } catch (e) {
      Logger.log('[tktSvcCheckSlas] Aviso: não foi possível criar Action Card: ' + e.message);
    }

    appendAuditLog(
      'TICKET_SLA_CHECK',
      TICKETS_SHEET,
      'SYSTEM',
      slaEstourados.length + ' ticket(s) com SLA estourado: ' + slaEstourados.map(function(t) { return t.id; }).join(', ')
    );
  }

  Logger.log('[tktSvcCheckSlas] SLAs estourados: ' + slaEstourados.length);
  return slaEstourados;
}

/**
 * Lista tickets com SLA de resolução em risco (≥ 80% do tempo já decorrido ou já estourado).
 * Útil para o painel do diretor técnico.
 *
 * @returns {Object[]} Array de tickets em risco de SLA, com campos extras 'horas_decorridas' e 'pct_sla'.
 */
function tktSvcGetEmRiscoSla() {
  var agora   = new Date();
  var abertos = tktRepoGetOpen();

  return abertos.filter(function(t) {
    if (t.resolved_at) return false;
    var abertura = new Date(t.opened_at);
    var horas    = (agora - abertura) / (1000 * 60 * 60);
    var slaH     = safeNumber(t.sla_resolution_h, 999);
    return slaH > 0 && (horas / slaH) >= 0.8;
  }).map(function(t) {
    var abertura = new Date(t.opened_at);
    var horas    = (agora - abertura) / (1000 * 60 * 60);
    var slaH     = safeNumber(t.sla_resolution_h, 1);
    return {
      id:               t.id,
      title:            t.title,
      status:           t.status,
      priority:         t.priority,
      company_id:       t.company_id,
      serial_id:        t.serial_id,
      assigned_to:      t.assigned_to,
      opened_at:        t.opened_at,
      sla_resolution_h: t.sla_resolution_h,
      horas_decorridas: Math.round(horas * 10) / 10,
      pct_sla:          Math.round((horas / slaH) * 100)
    };
  }).sort(function(a, b) { return b.pct_sla - a.pct_sla; });
}


/* ───────────────── Interações do chamado (8D-lite) ───────────────── */

/** Registra uma interação no chamado. Retorna o registro criado. */
function _tktAddUpdate(ticketId, tipo, texto, anexoUrl, anexoName, valor) {
  var sh = getOrCreateSheet(TICKET_UPDATES_SHEET, TICKET_UPDATES_HEADERS);
  var user = requireAuth();
  var rec = {
    id:         'TKU-' + String(getAndIncrementCounter('TKT_UPDATE_COUNTER')).padStart(6, '0'),
    ticket_id:  ticketId,
    timestamp:  new Date().toISOString(),
    user_id:    user.id,
    user_name:  user.name || user.id,
    tipo:       tipo,
    texto:      texto || '',
    anexo_url:  anexoUrl || '',
    anexo_name: anexoName || '',
    valor:      valor || ''
  };
  var row = [];
  for (var i = 0; i < TICKET_UPDATES_HEADERS.length; i++) row.push(rec[TICKET_UPDATES_HEADERS[i]]);
  sh.appendRow(row);
  // toca o updated_at do ticket
  try { updateRowByIdSafe(TICKETS_SHEET, ticketId, { updated_at: rec.timestamp }); } catch (e) {}
  return rec;
}

/** Comentário do time: alimenta o chamado e marca a 1ª resposta (SLA). */
function tktSvcComentar(ticketId, texto) {
  if (!texto || !String(texto).trim()) throw new Error('Comentário vazio.');
  var t = tktRepoGetById ? tktRepoGetById(ticketId) : null;
  if (!t) {
    var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
    t = rows[0];
  }
  if (!t) throw new Error('Chamado não encontrado: ' + ticketId);
  var rec = _tktAddUpdate(ticketId, 'COMENTARIO', String(texto).trim());
  if (!t.first_response_at) {
    try { tktSvcRegistrarRespondido(ticketId); } catch (e) { /* SLA é best-effort */ }
  }
  return rec;
}

/** Anexa um arquivo (base64) na pasta do chamado no Drive (06-PosVenda/Tickets/TKT-xxxxx). */
function tktSvcAnexar(ticketId, base64Data, mimeType, fileName) {
  if (!base64Data) throw new Error('Arquivo vazio.');
  var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
  var t = rows[0];
  if (!t) throw new Error('Chamado não encontrado: ' + ticketId);

  var folderId = t.drive_folder_id;
  if (!folderId) {
    var base = drvGetFolder('POSVENDA_TICKETS');
    if (!base) throw new Error('Drive não configurado (ROOT_FOLDER_ID) — rode setupAll e configure a pasta raiz.');
    var it = base.getFoldersByName(ticketId);
    var folder = it.hasNext() ? it.next() : base.createFolder(ticketId);
    folderId = folder.getId();
    updateRowByIdSafe(TICKETS_SHEET, ticketId, { drive_folder_id: folderId });
  }
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data), mimeType || 'application/octet-stream',
    fileName || ('anexo-' + new Date().getTime()));
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return _tktAddUpdate(ticketId, 'ANEXO', 'Anexo adicionado: ' + (fileName || file.getName()),
    file.getUrl(), fileName || file.getName());
}

/** Detalhe completo: ticket + interações + nome da empresa. */
function tktSvcGetDetail(ticketId) {
  var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
  var t = rows[0];
  if (!t) throw new Error('Chamado não encontrado: ' + ticketId);
  var updates = sheetToObjects(TICKET_UPDATES_SHEET).filter(function (u) {
    return String(u.ticket_id) === String(ticketId);
  });
  updates.sort(function (a, b) { return String(a.timestamp).localeCompare(String(b.timestamp)); });
  var company = null;
  var comps = sheetToObjects(COMPANIES_SHEET).filter(function (c) { return String(c.id) === String(t.company_id); });
  if (comps.length) company = { id: comps[0].id, name: comps[0].name, city: comps[0].city, state: comps[0].state };
  return { ticket: t, updates: updates, company: company };
}


/* ───────────────── Custos e classificação de origem ───────────────── */

/** Lança um custo no chamado e atualiza o total. */
function tktSvcLancarCusto(ticketId, descricao, valor) {
  var v = Number(valor);
  if (!descricao || !String(descricao).trim()) throw new Error('Descrição do custo é obrigatória.');
  if (isNaN(v) || v <= 0) throw new Error('Valor inválido.');
  var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
  if (!rows.length) throw new Error('Chamado não encontrado: ' + ticketId);

  var rec = _tktAddUpdate(ticketId, 'CUSTO', String(descricao).trim(), '', '', v);

  // total = soma de todos os updates CUSTO (fonte única, recomputada)
  var updates = sheetToObjects(TICKET_UPDATES_SHEET);
  var total = 0;
  for (var i = 0; i < updates.length; i++) {
    if (String(updates[i].ticket_id) === String(ticketId) && updates[i].tipo === 'CUSTO') {
      total += Number(updates[i].valor || 0);
    }
  }
  updateRowByIdSafe(TICKETS_SHEET, ticketId, { custo_total: Math.round(total * 100) / 100, updated_at: nowISO() });
  rec.custo_total = total;
  return rec;
}

/**
 * Endgate do chamado: classifica a origem do erro, define quem paga os
 * custos e fecha. Origem é OBRIGATÓRIA — chamado não fecha sem saber
 * de onde o problema veio (disciplina 8D).
 * @param {string} ticketId
 * @param {string} origemErro   CLIENTE | HYDRONIX | ALLEGRO | NAO_IDENTIFICADO
 * @param {string} cobrancaDe   HYDRONIX | CLIENTE | ALLEGRO
 * @param {string} [licao]      lição aprendida (vira update 📚)
 */
function tktSvcClassificarEFechar(ticketId, origemErro, cobrancaDe, licao) {
  if (!TICKET_ORIGEM_ERRO[origemErro]) {
    throw new Error('Origem do erro inválida. Use: CLIENTE, HYDRONIX, ALLEGRO ou NAO_IDENTIFICADO.');
  }
  var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
  var t = rows[0];
  if (!t) throw new Error('Chamado não encontrado: ' + ticketId);

  var custo = Number(t.custo_total || 0);
  var cobranca = cobrancaDe || 'ALLEGRO';
  if (['HYDRONIX', 'CLIENTE', 'ALLEGRO'].indexOf(cobranca) === -1) cobranca = 'ALLEGRO';
  var cobrancaStatus = custo > 0
    ? (cobranca === 'ALLEGRO' ? 'ABSORVIDO' : 'PENDENTE')
    : 'ABSORVIDO';

  updateRowByIdSafe(TICKETS_SHEET, ticketId, {
    origem_erro:     origemErro,
    cobranca_de:     cobranca,
    cobranca_status: cobrancaStatus,
    updated_at:      nowISO()
  });

  var labels = { CLIENTE: 'Cliente', HYDRONIX: 'Hydronix (fabricante)', ALLEGRO: 'Allegro (interno)', NAO_IDENTIFICADO: 'Não identificado' };
  _tktAddUpdate(ticketId, 'SISTEMA',
    '🏁 Classificação: origem = ' + labels[origemErro] +
    (custo > 0 ? ' · custos R$ ' + custo.toFixed(2) + ' → ' +
      (cobranca === 'ALLEGRO' ? 'absorvidos pela Allegro' : 'a cobrar de ' + labels[cobranca]) : ' · sem custos lançados'));
  if (licao && String(licao).trim()) {
    _tktAddUpdate(ticketId, 'COMENTARIO', '📚 Lição aprendida: ' + String(licao).trim());
  }
  return tktSvcFechar(ticketId);
}

/** Marca a cobrança do chamado como realizada (Financeiro). */
function tktSvcMarcarCobrado(ticketId) {
  var rows = sheetToObjects(TICKETS_SHEET).filter(function (r) { return r.id === ticketId; });
  var t = rows[0];
  if (!t) throw new Error('Chamado não encontrado: ' + ticketId);
  if (t.cobranca_status !== 'PENDENTE') throw new Error('Este chamado não tem cobrança pendente.');
  updateRowByIdSafe(TICKETS_SHEET, ticketId, { cobranca_status: 'COBRADO', updated_at: nowISO() });
  _tktAddUpdate(ticketId, 'SISTEMA', '💸 Cobrança de R$ ' + Number(t.custo_total || 0).toFixed(2) +
    ' (' + t.cobranca_de + ') marcada como realizada.');
  return { id: ticketId, cobranca_status: 'COBRADO' };
}
