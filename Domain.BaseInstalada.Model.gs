// =============================================================================
// Domain.BaseInstalada.Model.gs
// Allegro Business System — Fase F6
// Constantes e inicialização da aba INSTALLED_BASE
// =============================================================================

/** Nome da aba de base instalada na planilha. */
var BASE_INSTALADA_SHEET = 'INSTALLED_BASE';

/** Cabeçalhos da aba INSTALLED_BASE (ordem canônica). */
var BASE_INSTALADA_HEADERS = [
  'id',
  'serial',
  'product_code',
  'product_name',
  'company_id',
  'project_id',
  'proposal_id',
  'install_date',
  'startup_date',
  // Garantias (VALIDACAO_V3 §2.3)
  'warranty_hw_end',       // startup_date + 24m; ou nf_remessa_date + 24m se sem startup
  'warranty_svc_end',      // aceite_tecnico_date + 12m; ou nf_remessa_date + 12m se sem aceite
  'warranty_started_from', // 'startup' | 'nf_remessa'
  // Campos operacionais
  'status',            // ATIVO | GARANTIA | FORA_GARANTIA | INATIVO
  'location_detail',   // detalhe de localização dentro da planta
  'calibration_date',  // última calibração
  'notes',
  'nf_remessa_id',     // ID da NF de remessa dos equipamentos
  'created_at',
  'updated_at'
];

/**
 * Status possíveis para um serial da base instalada.
 * - ATIVO: equipamento em operação, fora do período de garantia ainda válido
 * - GARANTIA: equipamento dentro do prazo de garantia (HW ou serviço)
 * - FORA_GARANTIA: garantia expirada, equipamento em operação
 * - INATIVO: equipamento desativado/baixado
 */
var SERIAL_STATUS = {
  ATIVO:          'ATIVO',
  GARANTIA:       'GARANTIA',
  FORA_GARANTIA:  'FORA_GARANTIA',
  INATIVO:        'INATIVO'
};

/**
 * Inicializa a aba INSTALLED_BASE com os cabeçalhos canônicos.
 * Chamado pelo initCoreSheets() em Core.Setup.gs.
 */
function initBaseInstaladaSheet() {
  getOrCreateSheet(BASE_INSTALADA_SHEET, BASE_INSTALADA_HEADERS);
}
