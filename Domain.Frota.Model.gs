// =============================================================================
// Domain.Frota.Model.gs
// Allegro Business System — Fase F7
// Constantes e inicialização da aba VEHICLE_LOG
// =============================================================================

/** Nome da aba de log de veículo na planilha. */
var VEHICLE_LOG_SHEET = 'VEHICLE_LOG';

/**
 * Cabeçalhos da aba VEHICLE_LOG (ordem canônica).
 * - km_l     : quilômetros por litro calculado neste abastecimento
 * - r_por_km : custo em R$ por km calculado neste abastecimento
 */
var VEHICLE_LOG_HEADERS = [
  'id',
  'date',
  'odometro',
  'litros',
  'valor',
  'posto',
  'condutor_id',
  'ref_ticket_id',
  'km_l',
  'r_por_km',
  'created_at'
];

/**
 * Inicializa a aba VEHICLE_LOG com os cabeçalhos canônicos.
 * Chamado pelo initCoreSheets() em Core.Setup.gs.
 */
function initVehicleLogSheet() {
  getOrCreateSheet(VEHICLE_LOG_SHEET, VEHICLE_LOG_HEADERS);
}
