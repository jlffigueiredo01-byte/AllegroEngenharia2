// =============================================================================
// Domain.BaseInstalada.Service.gs
// Allegro Business System — Fase F6
// Regras de negócio da Base Instalada. Sem acesso direto à planilha.
// =============================================================================

/**
 * Calcula as datas de garantia conforme VALIDACAO_V3 §2.3.
 *
 * Regras:
 *   - Se startup_date fornecido:
 *       warranty_hw_end     = startup_date + 24 meses
 *       warranty_svc_end    = aceite_tecnico_date + 12m (se fornecido) ou startup_date + 12m
 *       warranty_started_from = 'startup'
 *   - Caso contrário (usa nf_remessa_date):
 *       warranty_hw_end     = nf_remessa_date + 24 meses
 *       warranty_svc_end    = nf_remessa_date + 12 meses
 *       warranty_started_from = 'nf_remessa'
 *
 * @param {string|null} startupDate       - Data de startup do equipamento (ISO ou 'YYYY-MM-DD').
 * @param {string|null} nfRemessaDate     - Data da NF de remessa (ISO ou 'YYYY-MM-DD').
 * @param {string|null} aceiteTecnicoDate - Data do aceite técnico (opcional).
 * @returns {{ warranty_hw_end: string, warranty_svc_end: string, warranty_started_from: string }}
 * @throws {Error} Se nem startup_date nem nf_remessa_date forem fornecidos.
 */
function biSvcCalcGarantia(startupDate, nfRemessaDate, aceiteTecnicoDate) {
  var baseHW  = startupDate  || nfRemessaDate;
  var baseSvc = aceiteTecnicoDate || startupDate || nfRemessaDate;
  if (!baseHW) {
    throw new Error('startup_date ou nf_remessa_date é obrigatório para calcular garantia.');
  }

  function addMonths(dateStr, months) {
    var d = new Date(String(dateStr).split('T')[0]);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }

  return {
    warranty_hw_end:      addMonths(baseHW,  24),
    warranty_svc_end:     addMonths(baseSvc, 12),
    warranty_started_from: startupDate ? 'startup' : 'nf_remessa'
  };
}

/**
 * Registra um equipamento na base instalada.
 * Calcula as datas de garantia conforme VALIDACAO_V3 §2.3.
 * Gera ID sequencial com prefixo BI-.
 *
 * @param {Object}  data                        - Dados do equipamento.
 * @param {string}  data.serial                 - Número de série (obrigatório).
 * @param {string}  data.product_code           - Código do produto (obrigatório).
 * @param {string}  data.product_name           - Nome do produto.
 * @param {string}  data.company_id             - ID da empresa (obrigatório).
 * @param {string}  [data.project_id]           - ID do projeto vinculado.
 * @param {string}  [data.proposal_id]          - ID da proposta vinculada.
 * @param {string}  [data.install_date]         - Data de instalação (ISO).
 * @param {string}  [data.startup_date]         - Data de startup (ISO).
 * @param {string}  [data.nf_remessa_date]      - Data da NF de remessa (para cálculo de garantia).
 * @param {string}  [data.nf_remessa_id]        - ID da NF de remessa.
 * @param {string}  [data.aceite_tecnico_date]  - Data do aceite técnico.
 * @param {string}  [data.location_detail]      - Localização na planta.
 * @param {string}  [data.calibration_date]     - Data da última calibração.
 * @param {string}  [data.notes]                - Observações.
 * @returns {Object} Registro completo criado.
 * @throws {Error} Se serial, product_code ou company_id estiverem ausentes.
 */
function biSvcCreate(data) {
  if (!data.serial)       throw new Error('serial é obrigatório.');
  if (!data.product_code) throw new Error('product_code é obrigatório.');
  if (!data.company_id)   throw new Error('company_id é obrigatório.');

  // Verificar duplicidade de serial
  var existente = biRepoGetBySerial(data.serial);
  if (existente) {
    throw new Error('Serial já cadastrado na base instalada: ' + data.serial + ' (ID: ' + existente.id + ').');
  }

  var garantia = biSvcCalcGarantia(
    data.startup_date       || null,
    data.nf_remessa_date    || null,
    data.aceite_tecnico_date|| null
  );

  var hoje = new Date().toISOString().split('T')[0];
  var emGarantia = (garantia.warranty_hw_end >= hoje || garantia.warranty_svc_end >= hoje);
  var status = emGarantia ? SERIAL_STATUS.GARANTIA : SERIAL_STATUS.ATIVO;

  var id  = 'BI-' + String(getAndIncrementCounter('BI_COUNTER')).padStart(5, '0');
  var now = nowISO();

  var record = {
    id:                   id,
    serial:               data.serial,
    product_code:         data.product_code,
    product_name:         data.product_name         || '',
    company_id:           data.company_id,
    project_id:           data.project_id            || '',
    proposal_id:          data.proposal_id           || '',
    install_date:         data.install_date          || '',
    startup_date:         data.startup_date          || '',
    warranty_hw_end:      garantia.warranty_hw_end,
    warranty_svc_end:     garantia.warranty_svc_end,
    warranty_started_from: garantia.warranty_started_from,
    status:               status,
    location_detail:      data.location_detail       || '',
    calibration_date:     data.calibration_date      || '',
    notes:                data.notes                 || '',
    nf_remessa_id:        data.nf_remessa_id         || '',
    created_at:           now,
    updated_at:           now
  };

  biRepoCreate(record);

  appendAuditLog(
    'BI_CREATE',
    BASE_INSTALADA_SHEET,
    id,
    'Serial: ' + data.serial + ' | Produto: ' + data.product_code + ' | Empresa: ' + data.company_id
  );

  return record;
}

/**
 * Atualiza a data de startup de um equipamento e recalcula as datas de garantia.
 * Aceite técnico pode ser fornecido opcionalmente para refinamento da garantia de serviço.
 *
 * @param {string}      id                     - ID do registro na base instalada.
 * @param {string}      startupDate            - Data de startup (ISO 'YYYY-MM-DD').
 * @param {string|null} [aceiteTecnicoDate]    - Data do aceite técnico (opcional).
 * @returns {Object} Registro atualizado.
 * @throws {Error} Se o registro não for encontrado.
 */
function biSvcUpdateStartup(id, startupDate, aceiteTecnicoDate) {
  var registro = biRepoGetById(id);
  if (!registro) throw new Error('Registro não encontrado na base instalada: ' + id);
  if (!startupDate) throw new Error('startup_date é obrigatório.');

  var garantia = biSvcCalcGarantia(
    startupDate,
    registro.nf_remessa_id ? (registro.nf_remessa_date || null) : null,
    aceiteTecnicoDate || null
  );

  var hoje = new Date().toISOString().split('T')[0];
  var emGarantia = (garantia.warranty_hw_end >= hoje || garantia.warranty_svc_end >= hoje);
  var novoStatus = emGarantia ? SERIAL_STATUS.GARANTIA : registro.status;

  var updates = {
    startup_date:          startupDate,
    warranty_hw_end:       garantia.warranty_hw_end,
    warranty_svc_end:      garantia.warranty_svc_end,
    warranty_started_from: garantia.warranty_started_from,
    status:                novoStatus,
    updated_at:            nowISO()
  };

  biRepoUpdate(id, updates);

  appendAuditLog(
    'BI_STARTUP_UPDATE',
    BASE_INSTALADA_SHEET,
    id,
    'Startup: ' + startupDate + ' | warranty_hw_end: ' + garantia.warranty_hw_end
  );

  return biRepoGetById(id);
}

/**
 * Atualiza o status de garantia de todos os seriais (chamado pelo Scheduler, diário 4h).
 * Lógica:
 *  - INATIVO: ignorado
 *  - Dentro da garantia (hw ou svc) → status = GARANTIA
 *  - Fora da garantia, status atual era GARANTIA → status = FORA_GARANTIA
 *  - Caso contrário, mantém o status atual
 *
 * @returns {number} Quantidade de registros atualizados.
 */
function biSvcAtualizarStatusGarantias() {
  var hoje = new Date().toISOString().split('T')[0];
  var seriais = biRepoGetAll();
  var atualizados = 0;

  seriais.forEach(function(s) {
    if (s.status === SERIAL_STATUS.INATIVO) return;

    var emGarantia = (
      (s.warranty_hw_end  && String(s.warranty_hw_end)  >= hoje) ||
      (s.warranty_svc_end && String(s.warranty_svc_end) >= hoje)
    );

    var novoStatus;
    if (emGarantia) {
      novoStatus = SERIAL_STATUS.GARANTIA;
    } else if (s.status === SERIAL_STATUS.GARANTIA) {
      novoStatus = SERIAL_STATUS.FORA_GARANTIA;
    } else {
      novoStatus = s.status; // ATIVO ou FORA_GARANTIA — mantém
    }

    if (novoStatus !== s.status) {
      biRepoUpdate(s.id, { status: novoStatus, updated_at: nowISO() });
      atualizados++;
    }
  });

  Logger.log('[biSvcAtualizarStatusGarantias] Registros atualizados: ' + atualizados);
  return atualizados;
}

/**
 * Retorna seriais com garantia (HW ou serviço) expirando nos próximos N dias.
 * Utilizado pela Api_biGetVencimentosGarantia e pelo painel técnico.
 *
 * @param {number} [dias=30] - Janela de dias a verificar (default: 30).
 * @returns {Object[]} Array de registros com vencimento próximo, com campo extra 'dias_hw' e 'dias_svc'.
 */
function biSvcGetVencimentos(dias) {
  var janela = typeof dias === 'number' ? dias : 30;
  var hoje   = new Date();
  var limite = new Date(hoje.getTime() + janela * 24 * 60 * 60 * 1000);
  var hojeStr  = hoje.toISOString().split('T')[0];
  var limiteStr = limite.toISOString().split('T')[0];

  return biRepoGetAll().filter(function(s) {
    if (s.status === SERIAL_STATUS.INATIVO) return false;
    var hwVenc  = String(s.warranty_hw_end  || '');
    var svcVenc = String(s.warranty_svc_end || '');
    // Vence dentro da janela (ainda não expirou mas expira em até N dias)
    return (hwVenc  >= hojeStr && hwVenc  <= limiteStr) ||
           (svcVenc >= hojeStr && svcVenc <= limiteStr);
  }).map(function(s) {
    function diffDias(dataStr) {
      if (!dataStr) return null;
      var diff = (new Date(dataStr) - hoje) / (1000 * 60 * 60 * 24);
      return Math.ceil(diff);
    }
    return {
      id:                   s.id,
      serial:               s.serial,
      product_code:         s.product_code,
      product_name:         s.product_name,
      company_id:           s.company_id,
      status:               s.status,
      warranty_hw_end:      s.warranty_hw_end,
      warranty_svc_end:     s.warranty_svc_end,
      warranty_started_from: s.warranty_started_from,
      dias_hw:              diffDias(s.warranty_hw_end),
      dias_svc:             diffDias(s.warranty_svc_end)
    };
  }).sort(function(a, b) {
    var menorA = Math.min(a.dias_hw !== null ? a.dias_hw : 9999, a.dias_svc !== null ? a.dias_svc : 9999);
    var menorB = Math.min(b.dias_hw !== null ? b.dias_hw : 9999, b.dias_svc !== null ? b.dias_svc : 9999);
    return menorA - menorB;
  });
}
