// ============================================================
// Domain.Projetos.Model.gs — ALLEGRO Business System
// Constantes e inicialização de abas para F19-lite (Projetos + RDO).
// ============================================================

var PROJECTS_SHEET = 'PROJECTS';
var PROJECTS_HEADERS = [
  'id', 'proposal_id', 'company_id', 'title',
  'status',                // PLANEJAMENTO | EM_ANDAMENTO | PAUSADO | ENTREGUE | ENCERRADO
  'kick_off_date', 'expected_end_date', 'actual_end_date',
  'aceite_tecnico_at', 'aceite_tecnico_by', 'aceite_tecnico_file_id',
  'drive_folder_id',
  'total_hh_previsto', 'total_hh_realizado',  // EVM simplificado
  'n_tecnicos', 'alcada_nivel',
  'created_by', 'created_at', 'updated_at'
];

var PROJECT_MILESTONES_SHEET = 'PROJECT_MILESTONES';
var PROJECT_MILESTONES_HEADERS = [
  'id', 'project_id', 'title', 'description', 'due_date', 'completed_at',
  'status',              // PENDENTE | CONCLUIDO | ATRASADO
  'created_at', 'updated_at'
];

// RDO fica em ALLEGRO_LOGS (aba dedicada) — imutável por design
var PROJECT_RDO_SHEET = 'PROJECT_RDO';
var PROJECT_RDO_HEADERS = [
  'id', 'project_id', 'date', 'tecnico_id', 'tecnico_nome',
  'clima', 'efetivo_campo',
  'atividades_json',   // array de { descricao, horas, materiais_usados }
  'ocorrencias_json',  // array de string (incidentes, dificuldades)
  'fotos_json',        // array de { file_id, caption }
  'horas_lancadas',    // total de horas do dia (lançado em Domain.Horas via horasSvcLancarRdo)
  'created_at'         // imutável — sem updated_at
];

/** Enum de status de projetos. */
var PROJECT_STATUS = {
  PLANEJAMENTO:  'PLANEJAMENTO',
  EM_ANDAMENTO:  'EM_ANDAMENTO',
  PAUSADO:       'PAUSADO',
  ENTREGUE:      'ENTREGUE',
  ENCERRADO:     'ENCERRADO'
};

/** Opções de clima para o RDO. */
var CLIMA_OPTIONS = ['ENSOLARADO', 'NUBLADO', 'CHUVOSO', 'MUITO_CALOR', 'FRIO_INTENSO'];

/**
 * Cria as abas PROJECTS, PROJECT_MILESTONES e PROJECT_RDO caso não existam.
 * Idempotente — usa getOrCreateSheet().
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initProjectsSheet() {
  getOrCreateSheet(PROJECTS_SHEET,          PROJECTS_HEADERS);
  getOrCreateSheet(PROJECT_MILESTONES_SHEET, PROJECT_MILESTONES_HEADERS);
  getOrCreateSheet(PROJECT_RDO_SHEET,        PROJECT_RDO_HEADERS);
}
