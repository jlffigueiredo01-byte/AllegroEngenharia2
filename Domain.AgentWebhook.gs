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

    // T4 (revisão geral): rotear para os SERVICES, não para as Api_*.
    // As Api_* exigem sessão de PIN (requireAuth) — o webhook autentica
    // pelo secret, então chama os services direto e audita como
    // 'agent-webhook'. NÃO afrouxar o requireAuth global.
    var action = String(payload.action || '').trim();
    var result;
    try {
      switch (action) {
        // Sonnet (juiz):
        case 'triagemAnalysisUpsert':
          result = { ok: true, data: triagemSvcUpsertAnalysis(payload.fb_id, payload.payload), actor: 'agent-webhook' };
          break;
        case 'triagemList':
          result = { ok: true, data: triagemSvcList(payload.filtros || {}), actor: 'agent-webhook' };
          break;
        case 'triagemGet':
          result = { ok: true, data: triagemSvcGetByFbId(payload.fb_id), actor: 'agent-webhook' };
          break;
        case 'triagemKpis':
          result = { ok: true, data: triagemSvcKpis(), actor: 'agent-webhook' };
          break;
        // Opus (executor, fase 2):
        case 'triagemMarcarImplementado':
          result = { ok: true, data: triagemSvcMarcarImplementado(payload.fb_id, payload.payload), actor: 'agent-webhook' };
          break;
        case 'triagemMarcarFalha':
          result = { ok: true, data: triagemSvcMarcarFalha(payload.fb_id, payload.erro_msg), actor: 'agent-webhook' };
          break;
        // Diagnostico:
        case 'ping':
          result = { ok: true, data: { pong: true, ts: nowISO() } };
          break;
        default:
          result = { ok: false, error: 'unknown action: ' + action };
      }
    } catch (errSvc) {
      result = { ok: false, error: errSvc.message || String(errSvc) };
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
