// =============================================================================
// Domain.AgentWebhook.gs — SGA
// Endpoint POST (Web App) para agentes Sonnet/Opus escreverem na aba TRIAGENS
// sem depender da API Executable do Apps Script (que exige setup de GCP).
//
// Como funciona:
//   1. O SGA ja esta deployado como Web App publico (acesso ANYONE).
//   2. Agentes fazem POST com JSON contendo { secret, action, ...params }.
//   3. doPost autentica via secret compartilhado (Script Property AGENT_WEBHOOK_SECRET).
//   4. Roteia para a Api_* correta e retorna o envelope {ok,data}/{ok,error}.
//
// Setup unico (Joao faz):
//   - No editor Apps Script: Project Settings -> Script Properties -> "+ Add Property"
//     Nome:  AGENT_WEBHOOK_SECRET
//     Valor: qualquer string aleatoria (ex: 'sga-sonnet-2026-x9k2pq4')
//   - Salvar na .clasp.json ou em variavel de ambiente da maquina do agente.
//
// Exemplo de chamada (Sonnet via curl):
//   curl -s -X POST -H "Content-Type: application/json" \
//     -d '{"secret":"...","action":"triagemAnalysisUpsert","fb_id":"FB-00014","payload":{...}}' \
//     "https://script.google.com/macros/s/.../exec"
// =============================================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _agentResponse({ ok: false, error: 'no payload' });
    }
    var payload = null;
    try { payload = JSON.parse(e.postData.contents); }
    catch (err) { return _agentResponse({ ok: false, error: 'invalid JSON: ' + err.message }); }

    var secret = PropertiesService.getScriptProperties().getProperty('AGENT_WEBHOOK_SECRET');
    if (!secret) {
      return _agentResponse({ ok: false, error: 'AGENT_WEBHOOK_SECRET nao configurado nas Script Properties' });
    }
    if (!payload.secret || payload.secret !== secret) {
      return _agentResponse({ ok: false, error: 'unauthorized' });
    }

    var action = String(payload.action || '').trim();
    var result;
    switch (action) {
      // Sonnet (juiz):
      case 'triagemAnalysisUpsert':
        result = Api_triagemAnalysisUpsert(payload.fb_id, payload.payload);
        break;
      case 'triagemList':
        result = Api_triagemList(payload.filtros || {});
        break;
      case 'triagemGet':
        result = Api_triagemGet(payload.fb_id);
        break;
      case 'triagemKpis':
        result = Api_triagemKpis();
        break;
      // Opus (executor, fase 2):
      case 'triagemMarcarImplementado':
        result = Api_triagemMarcarImplementado(payload.fb_id, payload.payload);
        break;
      case 'triagemMarcarFalha':
        result = Api_triagemMarcarFalha(payload.fb_id, payload.erro_msg);
        break;
      // Diagnostico:
      case 'ping':
        result = { ok: true, data: { pong: true, ts: nowISO() } };
        break;
      default:
        result = { ok: false, error: 'unknown action: ' + action };
    }
    return _agentResponse(result);
  } catch (err) {
    Logger.log('[AgentWebhook] erro: ' + err.message);
    return _agentResponse({ ok: false, error: err.message });
  }
}

function _agentResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper one-time para INSERIR manualmente o FB-00014 na aba TRIAGENS,
 * pegando a analise do PLANO-2026-06-17.md (extracao manual abaixo).
 * Roda uma vez no editor Apps Script: selecionar funcao -> Executar.
 * Apos primeira corrida via Sonnet pelo webhook, este helper fica obsoleto.
 */
function _helperInserirFB00014() {
  var analise = ''
    + '## Causa raiz\n'
    + 'Mesma causa do FB-00013: modo escuro (body.theme-dark em Styles.html) nao cobre '
    + 'cores hardcoded em inline style="" gerados via JS, nem classes CSS injetadas dinamicamente.\n\n'
    + '## Telas afetadas alem do Dashboard\n'
    + '- ChamadosUI.html:199,314,321 — labels do endgate invisiveis (fluxo critico)\n'
    + '- Visao360UI.html:133-161,347 — cards de KPI e timeline ilegiveis\n'
    + '- ProposalBuilderUI.html:35,39,41,45,51 — valor total + painel IA ilegiveis\n\n'
    + '## Recomendacao\n'
    + 'CORRIGIR JA. Ordem sugerida: ProposalBuilderUI (CSS only) -> ChamadosUI (CSS+JS) -> Visao360UI.\n\n'
    + '## Referencia\n'
    + 'PLANO completo em 00-Sistema/Feedback/PLANO-2026-06-17.md\n'
    + 'Cross-ref FB-00013 (PLANO-2026-06-16): dashboard, VERDE.';
  var r = Api_triagemAnalysisUpsert('FB-00014', {
    camada: 'AMARELO',
    tipo_confirmado: 'ERRO',
    severidade: 'MEDIA',
    esforco: 'M',
    analise_md: analise
  });
  Logger.log('Resultado: ' + JSON.stringify(r));
  return r;
}
