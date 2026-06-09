// Domain.ChatBot.gs
// ALLEGRO Business System — ChatBot domain
// Uses Claude Haiku via Anthropic Messages API

var _CHATBOT_SYSTEM_PROMPT = 'Você é o assistente ALLEGRO, um assistente inteligente para o sistema CRM Allegro Engenharia, revendedora dos sensores Hydronix.\n\n' +
  'Você pode:\n' +
  '1. Explicar como usar qualquer módulo do sistema\n' +
  '2. Responder perguntas sobre processos comerciais\n' +
  '3. Quando solicitado a buscar dados, responda com JSON: {"action":"search","type":"companies|contacts|opportunities|quotes","query":"termo"}\n\n' +
  'Módulos disponíveis:\n' +
  '- Empresas: cadastro e gestão de clientes/prospects\n' +
  '- Contatos: pessoas vinculadas a empresas\n' +
  '- Oportunidades: pipeline de vendas (Lead → Elaborando → Enviada → Fechada)\n' +
  '- Propostas: propostas comerciais de sensores Hydronix\n' +
  '- Despesas: lançamento via foto de cupom fiscal com OCR por IA\n' +
  '- Action Cards: board Kanban estilo Jira para tarefas internas\n' +
  '- Configurações: gestão de usuários e parâmetros do sistema\n\n' +
  'Responda sempre em português brasileiro, de forma concisa e útil.';

/**
 * Public API — receives a chat message and returns a reply.
 * @param {string} message  The user's text input.
 * @param {Object} [context]  Optional context: {section: string, userName: string}
 * @returns {{ok: boolean, reply: string}|{ok: boolean, error: string}}
 */
function Api_chatMessage(message, context) {
  try {
    requireAuth();

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return { ok: false, error: 'Mensagem não pode ser vazia.' };
    }

    var userMessage = message.trim();

    if (context && context.section) {
      userMessage = 'Usuário está na seção: ' + context.section + '. Pergunta: ' + userMessage;
    }

    var rawReply = _callHaikuChat(_CHATBOT_SYSTEM_PROMPT, userMessage);

    // Detect if the model returned a search action JSON
    var trimmed = rawReply.trim();
    if (trimmed.indexOf('{"action":"search"') === 0 || trimmed.indexOf('{ "action": "search"') === 0) {
      try {
        // Extract the JSON block — model may append extra text after the JSON
        var jsonEnd = trimmed.indexOf('}');
        // Find the closing brace of the root object properly
        var depth = 0;
        var jsonClose = -1;
        for (var i = 0; i < trimmed.length; i++) {
          if (trimmed[i] === '{') depth++;
          if (trimmed[i] === '}') {
            depth--;
            if (depth === 0) { jsonClose = i; break; }
          }
        }
        var jsonStr = jsonClose >= 0 ? trimmed.substring(0, jsonClose + 1) : trimmed;
        var actionObj = JSON.parse(jsonStr);
        if (actionObj.action === 'search') {
          var searchReply = _chatSearchData(actionObj);
          return { ok: true, reply: searchReply };
        }
      } catch (parseErr) {
        // Fall through — return raw reply as plain text
      }
    }

    return { ok: true, reply: rawReply };

  } catch (e) {
    return { ok: false, error: e.message || 'Erro desconhecido no assistente.' };
  }
}

/**
 * Searches sheet data based on an action object returned by the model.
 * @param {{type: string, query: string}} actionObj
 * @returns {string}  Human-readable result in Brazilian Portuguese.
 */
function _chatSearchData(actionObj) {
  var type  = actionObj.type  || '';
  var query = (actionObj.query || '').toLowerCase().trim();

  var sheetMap = {
    companies:     'Empresas',
    contacts:      'Contatos',
    opportunities: 'Oportunidades',
    quotes:        'Propostas'
  };

  var sheetName = sheetMap[type];
  if (!sheetName) {
    return 'Tipo de busca não reconhecido: "' + type + '".';
  }

  var rows;
  try {
    rows = sheetToObjects(sheetName);
  } catch (e) {
    return 'Não foi possível acessar a planilha "' + sheetName + '": ' + e.message;
  }

  if (!rows || rows.length === 0) {
    return 'Nenhum registro encontrado em ' + sheetName + '.';
  }

  // Filter rows by searching common name fields
  var nameFields = ['name', 'company_name', 'title', 'nome', 'empresa', 'titulo'];

  var matched = rows.filter(function(row) {
    for (var i = 0; i < nameFields.length; i++) {
      var val = row[nameFields[i]];
      if (val && String(val).toLowerCase().indexOf(query) !== -1) {
        return true;
      }
    }
    return false;
  });

  if (matched.length === 0) {
    return 'Nenhum resultado encontrado em ' + sheetName + ' para "' + actionObj.query + '".';
  }

  var limited = matched.slice(0, 5);
  var typeLabels = {
    companies:     { singular: 'empresa', plural: 'empresas' },
    contacts:      { singular: 'contato', plural: 'contatos' },
    opportunities: { singular: 'oportunidade', plural: 'oportunidades' },
    quotes:        { singular: 'proposta', plural: 'propostas' }
  };
  var label = typeLabels[type] || { singular: 'registro', plural: 'registros' };
  var countLabel = limited.length === 1
    ? 'Encontrei 1 ' + label.singular + ':'
    : 'Encontrei ' + limited.length + ' ' + label.plural + ':';

  var lines = [countLabel];
  limited.forEach(function(row) {
    var displayName = row.name || row.company_name || row.title ||
                      row.nome || row.empresa || row.titulo || '(sem nome)';

    var extra = '';
    if (type === 'companies') {
      var parts = [];
      if (row.city  || row.cidade) parts.push(row.city  || row.cidade);
      if (row.state || row.estado) parts.push(row.state || row.estado);
      if (parts.length) extra = ' (' + parts.join(', ') + ')';
    } else if (type === 'contacts') {
      if (row.company_name || row.empresa) {
        extra = ' — ' + (row.company_name || row.empresa);
      }
    } else if (type === 'opportunities') {
      if (row.status || row.stage || row.estagio) {
        extra = ' [' + (row.status || row.stage || row.estagio) + ']';
      }
    } else if (type === 'quotes') {
      if (row.value || row.valor) {
        extra = ' — R$ ' + (row.value || row.valor);
      }
    }

    lines.push('• ' + displayName + extra);
  });

  if (matched.length > 5) {
    lines.push('... e mais ' + (matched.length - 5) + ' resultado(s). Refine sua busca para ver menos resultados.');
  }

  return lines.join('\n');
}

/**
 * Sends a single-turn message to Claude Haiku and returns the text response.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {string}
 */
function _callHaikuChat(systemPrompt, userMessage) {
  var url = 'https://api.anthropic.com/v1/messages';
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');

  if (!key) {
    throw new Error('ANTHROPIC_API_KEY não configurada nas propriedades do script.');
  }

  var payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: payload,
    muteHttpExceptions: true
  });

  var json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error(json.error.message);
  }

  if (!json.content || !json.content[0] || !json.content[0].text) {
    throw new Error('Resposta inesperada da API Anthropic.');
  }

  return json.content[0].text;
}
