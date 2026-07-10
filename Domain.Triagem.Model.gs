// =============================================================================
// Domain.Triagem.Model.gs — SGA
// Camada de constantes + máquina de estados do ciclo de triagem colaborativa.
//
// O domínio TRIAGEM representa o ciclo de vida da análise/decisão sobre cada
// FB-xxxxx reportado pelos usuários. O Sonnet (juiz headless) grava a análise
// inicial via clasp run → Api_triagemAnalysisUpsert; o João lê, comenta,
// aprova ou recusa pelo SGA; o Opus (executor, fase 2+) lê e implementa.
//
// Referências:
//   - docs/ARQUITETURA-CICLO-FEEDBACK.md (seções 2, 5, 8.3, 9)
//   - docs/POLITICA_AUTONOMIA_AGENTES.md (camadas VERDE/AMARELO/VERMELHO)
//   - Domain.Feedback.js (FEEDBACKS — fonte do FB original)
//
// Estado vivo de cada FB no ciclo fica na aba TRIAGENS (1 linha por FB).
// Auditoria fina de cada transição/comentário/evento fica na aba TRIAGEM_LOG.
// =============================================================================

var TRIAGEM_SHEET = 'TRIAGENS';
var TRIAGEM_LOG_SHEET = 'TRIAGEM_LOG';

// Cabeçalhos da aba TRIAGENS — ordem importa (linhas são gravadas em ordem).
var TRIAGEM_HEADERS = [
  'id',                  // TRG-00001 — id próprio da triagem (1:1 com FB)
  'fb_id',               // FB-xxxxx — chave do FEEDBACKS de origem
  'estado',              // ver TRIAGEM_ESTADOS
  'camada',              // VERDE | AMARELO | VERMELHO
  'tipo_confirmado',     // ERRO | SUGESTAO | MELHORIA (após Sonnet)
  'severidade',          // CRITICA | ALTA | MEDIA | BAIXA
  'esforco',             // P | M | G
  'titulo',              // espelho do FB original (cacheado para listagem)
  'autor_fb',            // espelho (criado_por_nome do FB)
  'tela',                // espelho (tela do FB)
  'analise_md',          // markdown da análise estruturada do Sonnet
  'arquivos_tocados',    // CSV/JSON dos arquivos que o Opus mexeu (fase 2+)
  'diff_resumo',         // texto curto resumindo as mudanças (fase 2+)
  'snapshot_path',       // pasta do snapshot pré-push (fase 2+)
  'erro_msg',            // mensagem de erro quando estado=FALHOU
  'nota_joao',           // comentário acumulado do João (texto livre)
  'versao_apps_script',  // versão do Apps Script após push (fase 2+)
  'hist_estados_json',   // histórico [{de,para,ts,ator,nota}] das transições
  'criado_em',
  'atualizado_em'
];

// Auditoria fina — cada ação relevante é uma linha aqui.
var TRIAGEM_LOG_HEADERS = ['id', 'triagem_id', 'fb_id', 'ts', 'ator', 'evento', 'payload_json'];

// Estados do ciclo (máquina de estados — §2 da arquitetura)
var TRIAGEM_ESTADOS = {
  NOVO: 'NOVO',                              // FB recém-criado, Sonnet ainda não pegou
  EM_TRIAGEM: 'EM_TRIAGEM',                  // Sonnet processando (transiente — pode não persistir)
  TRIADO: 'TRIADO',                          // Sonnet terminou — análise visível, aguarda João
  APROVADO: 'APROVADO',                      // João aprovou (verde/amarelo apenas) — fase 2
  RECUSADO: 'RECUSADO',                      // João recusou com nota
  EM_IMPLEMENTACAO: 'EM_IMPLEMENTACAO',      // Opus mexendo no código — fase 2
  IMPLEMENTADO: 'IMPLEMENTADO',              // Opus terminou + push em /dev — fase 2
  FALHOU: 'FALHOU',                          // Opus errou — volta pra fila — fase 2
  PUBLICADO: 'PUBLICADO',                    // João clicou Implantar no Apps Script — fase 2
  FECHADO: 'FECHADO',                        // Caso encerrado, em produção
  FECHADO_SEM_CODIGO: 'FECHADO_SEM_CODIGO'   // Vermelho aprovado vira proposta (sem código auto)
};

// Camadas de risco (alinhado com POLITICA_AUTONOMIA_AGENTES.md)
var TRIAGEM_CAMADAS = {
  VERDE: 'VERDE',
  AMARELO: 'AMARELO',
  VERMELHO: 'VERMELHO'
};

// Severidade — escala usada na análise do Sonnet
var TRIAGEM_SEVERIDADES = {
  CRITICA: 'CRITICA',
  ALTA: 'ALTA',
  MEDIA: 'MEDIA',
  BAIXA: 'BAIXA'
};

// Esforço estimado — escala curta (P=pequeno, M=médio, G=grande)
var TRIAGEM_ESFORCOS = {
  P: 'P',
  M: 'M',
  G: 'G'
};

// Tipos confirmados (após Sonnet — pode divergir do tipo sugerido pelo usuário)
var TRIAGEM_TIPOS = {
  ERRO: 'ERRO',
  SUGESTAO: 'SUGESTAO',
  MELHORIA: 'MELHORIA'
};

/**
 * Mapa de transições válidas: estado_de → [estados_para_permitidos].
 * Reflete a máquina de estados da §2 da arquitetura.
 * Qualquer transição fora deste mapa é rejeitada por _triagemValidarEstado.
 */
var TRIAGEM_TRANSICOES_VALIDAS = {
  // Inicial — Sonnet começa (ou João recusa um NOVO óbvio antes da análise)
  'NOVO':                ['EM_TRIAGEM', 'TRIADO', 'RECUSADO'],
  // Sonnet processando — pode terminar normal ou ser cancelado
  'EM_TRIAGEM':          ['TRIADO', 'FALHOU'],
  // João decide
  'TRIADO':              ['APROVADO', 'RECUSADO', 'EM_TRIAGEM', 'FECHADO_SEM_CODIGO'],
  // Aprovado pode ir para implementação (verde/amarelo) ou ficar como proposta (vermelho).
  // T3 (revisão geral): também direto a IMPLEMENTADO/FALHOU — implementação
  // manual ou por agente sem passar por EM_IMPLEMENTACAO.
  'APROVADO':            ['EM_IMPLEMENTACAO', 'IMPLEMENTADO', 'FALHOU', 'FECHADO_SEM_CODIGO'],
  // Recusado pode ser reaberto (reanalise) — caso João mude de ideia
  'RECUSADO':            ['EM_TRIAGEM', 'FECHADO'],
  // Opus implementando
  'EM_IMPLEMENTACAO':    ['IMPLEMENTADO', 'FALHOU'],
  // Implementado em /dev — aguarda João clicar Implantar
  'IMPLEMENTADO':        ['PUBLICADO', 'FALHOU', 'TRIADO'],
  // Falhou — volta pra TRIADO pra Sonnet repensar (com nota do erro)
  'FALHOU':              ['TRIADO', 'FECHADO'],
  // Publicado — vai pra produção, encerra ciclo
  'PUBLICADO':           ['FECHADO'],
  // Estados terminais — nenhuma transição saindo
  'FECHADO':             [],
  'FECHADO_SEM_CODIGO':  []
};

/**
 * Cria as abas TRIAGENS e TRIAGEM_LOG (idempotente).
 * Chamado por setupAll() (Core.Setup.js).
 */
function initTriagemSheets() {
  getOrCreateSheet(TRIAGEM_SHEET, TRIAGEM_HEADERS);
  getOrCreateSheet(TRIAGEM_LOG_SHEET, TRIAGEM_LOG_HEADERS);
  Logger.log('[Triagem] Abas TRIAGENS e TRIAGEM_LOG prontas.');
}

/* ───────────────────────── Validações ───────────────────────── */

/**
 * Verifica se a transição de estado é válida pela máquina de estados.
 * Lança erro se a transição não estiver no mapa TRIAGEM_TRANSICOES_VALIDAS.
 * Aceita transição "nula" (de === para) — útil para reaplicação idempotente.
 */
function _triagemValidarEstado(de, para) {
  if (!para) throw new Error('Estado destino é obrigatório.');
  if (!TRIAGEM_ESTADOS[para]) throw new Error('Estado destino inválido: ' + para);
  // Triagem nova — de vazio para qualquer estado inicial
  if (!de) {
    if (para === 'NOVO' || para === 'EM_TRIAGEM' || para === 'TRIADO') return true;
    throw new Error('Triagem nova só pode começar em NOVO, EM_TRIAGEM ou TRIADO. Recebido: ' + para);
  }
  if (de === para) return true; // idempotente
  var permitidos = TRIAGEM_TRANSICOES_VALIDAS[de] || [];
  if (permitidos.indexOf(para) === -1) {
    throw new Error('Transição inválida: ' + de + ' → ' + para + '. Permitidos: ' + (permitidos.join(',') || '(nenhum — estado terminal)'));
  }
  return true;
}

function _triagemValidarCamada(c) {
  if (!c) throw new Error('Camada é obrigatória.');
  if (!TRIAGEM_CAMADAS[c]) throw new Error('Camada inválida: ' + c + '. Use VERDE, AMARELO ou VERMELHO.');
  return true;
}

function _triagemValidarSeveridade(s) {
  if (!s) throw new Error('Severidade é obrigatória.');
  if (!TRIAGEM_SEVERIDADES[s]) throw new Error('Severidade inválida: ' + s + '. Use CRITICA, ALTA, MEDIA ou BAIXA.');
  return true;
}

function _triagemValidarEsforco(e) {
  if (!e) throw new Error('Esforço é obrigatório.');
  if (!TRIAGEM_ESFORCOS[e]) throw new Error('Esforço inválido: ' + e + '. Use P, M ou G.');
  return true;
}

function _triagemValidarTipo(t) {
  if (!t) throw new Error('Tipo é obrigatório.');
  if (!TRIAGEM_TIPOS[t]) throw new Error('Tipo inválido: ' + t + '. Use ERRO, SUGESTAO ou MELHORIA.');
  return true;
}
