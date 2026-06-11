// ============================================================
// Domain.Compliance.Service.gs — ALLEGRO Business System
// F18 — Compliance / HSE
// Lógica de negócio: documentação HSE dos técnicos e
// calibração de instrumentos de medição.
// ============================================================

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

/**
 * Retorna a data de hoje no formato YYYY-MM-DD (ISO 8601, sem hora).
 * Usado como base de comparação de validade.
 * @returns {string}
 */
function _complianceTodayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Retorna a data daqui a N dias no formato YYYY-MM-DD.
 * @param {number} dias
 * @returns {string}
 */
function _complianceFutureISO(dias) {
  var d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// ------------------------------------------------------------
// HSE — Serviço
// ------------------------------------------------------------

/**
 * Registra um novo documento HSE para um técnico.
 *
 * @param {Object} data
 * @param {string} data.user_id         ID do técnico (obrigatório).
 * @param {string} data.doc_type        Tipo do documento — deve ser um de HSE_DOC_TYPES (obrigatório).
 * @param {string} data.expiry_date     Data de vencimento no formato YYYY-MM-DD (obrigatório).
 * @param {string} [data.doc_description] Descrição livre do documento.
 * @param {string} [data.issue_date]    Data de emissão no formato YYYY-MM-DD.
 * @param {string} [data.file_id]       ID do arquivo no Google Drive.
 * @returns {Object} Registro criado.
 * @throws {Error} Se campos obrigatórios estiverem ausentes ou doc_type for inválido.
 */
function hseSvcCreate(data) {
  if (!data.user_id || !data.doc_type || !data.expiry_date) {
    throw new Error('user_id, doc_type e expiry_date são obrigatórios.');
  }
  if (HSE_DOC_TYPES.indexOf(data.doc_type) === -1) {
    throw new Error('doc_type inválido. Use um dos seguintes: ' + HSE_DOC_TYPES.join(', ') + '.');
  }

  var id    = 'HSE-' + getAndIncrementCounter('HSE_COUNTER');
  var hoje  = _complianceTodayISO();
  var valid = data.expiry_date >= hoje ? 'TRUE' : 'FALSE';

  var record = {
    id:              id,
    user_id:         data.user_id,
    doc_type:        data.doc_type,
    doc_description: data.doc_description || '',
    issue_date:      data.issue_date      || '',
    expiry_date:     data.expiry_date,
    file_id:         data.file_id         || '',
    valid:           valid,
    created_at:      nowISO(),
    updated_at:      nowISO()
  };

  hseRepoCreate(record);
  appendAuditLog(
    'HSE_CREATE',
    'HSE_DOCS',
    id,
    data.user_id + ': ' + data.doc_type + ' vence ' + data.expiry_date
  );
  return record;
}

/**
 * Verifica se um técnico está habilitado para mobilização em campo.
 *
 * Regras obrigatórias:
 *  - ASO válido e vigente.
 *  - Ao menos NR-10 ou NR-35 válido e vigente.
 *
 * Atualiza o campo `valid` dos documentos em tempo real antes de verificar.
 *
 * @param {string} userId ID do técnico.
 * @returns {{ habilitado: boolean, pendencias: string[] }}
 */
function hseSvcVerificarHabilitacao(userId) {
  var docs  = hseRepoGetByUser(userId);
  var hoje  = _complianceTodayISO();
  var pendencias = [];

  // Atualiza campo 'valid' em tempo real
  docs.forEach(function(d) {
    var calculado = d.expiry_date >= hoje ? 'TRUE' : 'FALSE';
    if (String(d.valid) !== calculado) {
      hseRepoUpdate(d.id, { valid: calculado, updated_at: nowISO() });
      d.valid = calculado;
    }
  });

  // ASO obrigatório
  var aso = docs.filter(function(d) {
    return d.doc_type === 'ASO' && d.valid === 'TRUE';
  });
  if (aso.length === 0) {
    pendencias.push('ASO vencido ou não cadastrado (obrigatório).');
  }

  // NR-10 ou NR-35 obrigatório (ao menos um)
  var nr10 = docs.filter(function(d) { return d.doc_type === 'NR10' && d.valid === 'TRUE'; });
  var nr35 = docs.filter(function(d) { return d.doc_type === 'NR35' && d.valid === 'TRUE'; });
  if (nr10.length === 0 && nr35.length === 0) {
    pendencias.push('NR-10 ou NR-35 vencido(a) ou não cadastrado(a) (obrigatório ao menos um).');
  }

  return { habilitado: pendencias.length === 0, pendencias: pendencias };
}

/**
 * Verifica a habilitação HSE de todos os técnicos de uma equipe.
 * Chamado ao criar kick-off de projeto ou ao avançar para EM_ANDAMENTO.
 *
 * @param {string[]} tecnicoIds Lista de IDs dos técnicos.
 * @returns {{ todos_habilitados: boolean, por_tecnico: Object }}
 */
function hseSvcVerificarEquipe(tecnicoIds) {
  var result = { todos_habilitados: true, por_tecnico: {} };
  tecnicoIds.forEach(function(id) {
    var hab = hseSvcVerificarHabilitacao(id);
    result.por_tecnico[id] = hab;
    if (!hab.habilitado) result.todos_habilitados = false;
  });
  return result;
}

// ------------------------------------------------------------
// Instrumentos de medição — Serviço
// ------------------------------------------------------------

/**
 * Registra um novo instrumento de medição com seu certificado de calibração.
 *
 * @param {Object} data
 * @param {string} data.code                    Código interno do instrumento (obrigatório).
 * @param {string} data.calibration_expiry      Data de vencimento da calibração YYYY-MM-DD (obrigatório).
 * @param {string} [data.description]           Descrição do instrumento.
 * @param {string} [data.model]                 Modelo.
 * @param {string} [data.serial_number]         Número de série.
 * @param {string} [data.calibration_lab]       Laboratório de calibração (Inmetro/RBC).
 * @param {string} [data.calibration_cert_number] Número do certificado de calibração.
 * @param {string} [data.calibration_date]      Data de calibração YYYY-MM-DD.
 * @param {string} [data.file_id]               ID do certificado PDF no Google Drive.
 * @returns {Object} Registro criado.
 * @throws {Error} Se campos obrigatórios estiverem ausentes.
 */
function instrSvcCreate(data) {
  if (!data.code || !data.calibration_expiry) {
    throw new Error('code e calibration_expiry são obrigatórios.');
  }

  var id    = 'INS-' + getAndIncrementCounter('INSTRUMENT_COUNTER');
  var hoje  = _complianceTodayISO();
  var valid = data.calibration_expiry >= hoje ? 'TRUE' : 'FALSE';

  var record = {
    id:                       id,
    code:                     data.code,
    description:              data.description              || '',
    model:                    data.model                    || '',
    serial_number:            data.serial_number            || '',
    calibration_lab:          data.calibration_lab          || '',
    calibration_cert_number:  data.calibration_cert_number  || '',
    calibration_date:         data.calibration_date         || '',
    calibration_expiry:       data.calibration_expiry,
    file_id:                  data.file_id                  || '',
    valid:                    valid,
    created_at:               nowISO(),
    updated_at:               nowISO()
  };

  instrRepoCreate(record);
  appendAuditLog(
    'INSTRUMENT_CREATE',
    'REFERENCE_INSTRUMENTS',
    id,
    data.code + ': calibração vence ' + data.calibration_expiry
  );
  return record;
}

/**
 * Verifica se um instrumento está com calibração vigente.
 * Lançado ao referenciar o instrumento em um laudo técnico.
 *
 * @param {string} instrumentId ID do instrumento.
 * @returns {boolean} true se a calibração for válida.
 * @throws {Error} Se o instrumento não for encontrado ou a calibração estiver vencida.
 */
function instrSvcVerificarCalibracaoValida(instrumentId) {
  var instr = instrRepoGetById(instrumentId);
  if (!instr) {
    throw new Error('Instrumento não encontrado: ' + instrumentId + '.');
  }

  var hoje = _complianceTodayISO();
  if (String(instr.calibration_expiry) < hoje) {
    throw new Error(
      'Instrumento ' + instr.code +
      ' com calibração vencida em ' + instr.calibration_expiry +
      '. Envie o instrumento para recalibração antes de utilizá-lo em laudos.'
    );
  }
  return true;
}

// ------------------------------------------------------------
// Verificação periódica de vencimentos (Scheduler)
// ------------------------------------------------------------

/**
 * Atualiza o campo `valid` de todos os documentos HSE e instrumentos,
 * e cria um Action Card para itens que vençam nos próximos 30 dias.
 *
 * Chamado pelo Scheduler toda segunda-feira às 05:00.
 *
 * @returns {{ hse: string[], instrumentos: string[] }}
 */
function complianceSvcCheckVencimentos() {
  var hoje       = _complianceTodayISO();
  var alertaISO  = _complianceFutureISO(30);
  var vencendoHSE   = [];
  var vencendoInstr = [];

  // — HSE —
  hseRepoGetAll().forEach(function(d) {
    var valid = d.expiry_date >= hoje ? 'TRUE' : 'FALSE';
    if (String(d.valid) !== valid) {
      hseRepoUpdate(d.id, { valid: valid, updated_at: nowISO() });
    }
    if (String(d.expiry_date) <= alertaISO) {
      vencendoHSE.push(d.doc_type + ' do técnico ' + d.user_id + ' vence em ' + d.expiry_date);
    }
  });

  // — Instrumentos —
  instrRepoGetAll().forEach(function(i) {
    var valid = i.calibration_expiry >= hoje ? 'TRUE' : 'FALSE';
    if (String(i.valid) !== valid) {
      instrRepoUpdate(i.id, { valid: valid, updated_at: nowISO() });
    }
    if (String(i.calibration_expiry) <= alertaISO) {
      vencendoInstr.push('Instrumento ' + i.code + ' — calibração vence em ' + i.calibration_expiry);
    }
  });

  var total = vencendoHSE.length + vencendoInstr.length;

  // Usa acCreate() do ActionCards Repository — sem acesso direto à sheet
  if (total > 0) {
    acCreate({
      title:       'Vencimentos HSE/Calibração nos próximos 30 dias (' + total + ' itens)',
      message:     vencendoHSE.concat(vencendoInstr).join('\n'),
      quote_id:    '',
      pos_venda_id: '',
      urgent:      false,
      assigned_to: '',
      created_by:  'SCHEDULER',
      tipo:        'COMPLIANCE_VENCIMENTO',
      source:      'SCHEDULER'
    });
  }

  appendAuditLog(
    'COMPLIANCE_CHECK',
    'HSE_DOCS',
    'SYSTEM',
    total + ' itens vencendo nos próximos 30 dias'
  );

  return { hse: vencendoHSE, instrumentos: vencendoInstr };
}
