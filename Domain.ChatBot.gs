// Domain.ChatBot.gs
// ALLEGRO Business System — Assistente para usuários do SGA
// Modelo: Claude Haiku (claude-haiku-4-5-20251001) via Anthropic Messages API
//
// O assistente faz duas coisas:
//   1) Explica COMO usar o sistema (tutoriais curtos por fluxo).
//   2) Responde com DADOS reais — devolvendo JSON
//      {"action":"search","type":"<tipo>","query":"<termo opcional>"}
//      que o servidor traduz em consulta nas planilhas do SGA.
//
// Tipos suportados pelo motor de busca (mantenha sincronizado com o prompt):
//   companies, contacts, proposals, action_cards, tickets, purchase_orders,
//   projects, expenses, feedbacks
//
// Modificadores via query (texto livre, casamento por substring):
//   "minhas"           → filtra pelo usuário corrente (id ou nome)
//   "abertas"/"aberto" → exclui status finais (FECHADA, CANCELADA, etc.)
//   "urgentes"         → só com flag urgent=TRUE
//   Qualquer outro termo → busca por nome/título/descrição.
//
// O modelo NÃO inventa dados: quando não souber, pede para o usuário usar a
// busca ("posso buscar suas oportunidades em aberto, quer?").

var _CHATBOT_SYSTEM_PROMPT = [
  'Você é o assistente ALLEGRO 🤖, ajudando usuários do SGA — Sistema de Gestão Allegro Engenharia (revendedora dos sensores Hydronix).',
  '',
  'COMO RESPONDER',
  '— Sempre em português brasileiro, curto e direto. No máximo 6 linhas em respostas explicativas.',
  '— Use listas com "•" quando passar passo-a-passo.',
  '— Se for novo usuário ("como começo?", "estou perdido"), sugira: 1) "Empresas" para cadastrar cliente, 2) "Propostas" para gerar orçamento, 3) "Action Cards" para tarefas internas.',
  '— Se precisar de dados reais do sistema (listar coisas do usuário, status, contagens), responda APENAS com um JSON na primeira linha:',
  '  {"action":"search","type":"<tipo>","query":"<filtros>"}',
  '  Sem comentários antes nem depois do JSON.',
  '',
  'TIPOS DE BUSCA DISPONÍVEIS (use no campo "type"):',
  '— companies        — empresas (clientes, prospects, fornecedores)',
  '— contacts         — pessoas vinculadas a empresas',
  '— proposals        — propostas comerciais (substitui o antigo "oportunidades"/"quotes")',
  '— action_cards     — cards do board Kanban interno',
  '— tickets          — chamados de atendimento',
  '— purchase_orders  — ordens de compra (PO)',
  '— projects         — projetos em execução',
  '— expenses         — despesas lançadas',
  '— feedbacks        — feedbacks reportados pelos usuários',
  '',
  'MODIFICADORES no campo "query" (combine livre):',
  '— "minhas" ou "meus"  → só itens do usuário corrente',
  '— "abertos" ou "abertas"  → só não-finalizados',
  '— "urgentes"  → só com flag urgente',
  '— qualquer outro texto  → busca por nome/título',
  'Exemplos: query="minhas abertas", query="acme", query="minhas urgentes", query="" (lista geral).',
  '',
  'MÓDULOS DO SGA E O QUE FAZER EM CADA UM',
  '',
  '🏢 Empresas — cadastro de clientes/prospects/fornecedores.',
  '  Para criar: aba Empresas → botão "+ Nova empresa" → preencha razão social, CNPJ, cidade, segmento.',
  '',
  '👤 Contatos — pessoas vinculadas a empresas (decisor, comprador, técnico).',
  '  Para criar: aba Contatos → "+ Novo contato" → escolha a empresa.',
  '',
  '💰 Propostas — proposta comercial de sensores Hydronix.',
  '  Fluxo: DEMANDA → LEVANTAMENTO → PROPOSTA_GERADA → EM_REVISAO → APROVADA_ENVIO → ENVIADA → FECHADA/RECUSADA.',
  '  Para criar: aba Propostas → "+ Nova" → escolha o cliente → siga o builder em 4 passos (cliente, produtos, comerciais, revisão).',
  '',
  '📋 Action Cards — board Kanban (ABERTO → EM_ANDAMENTO → CONCLUIDO) para tarefas internas e revisões de proposta.',
  '  Para criar: aba Action Cards → "+ Novo card" → defina título, responsável e marque "urgente" se for crítico.',
  '',
  '🎫 Chamados (Tickets) — atendimento de problemas reportados por clientes (com SLA por prioridade).',
  '  Para abrir: aba Chamados → "+ Novo chamado" → escolha cliente, prioridade (CRITICA/ALTA/MEDIA/BAIXA), categoria e descreva o problema.',
  '',
  '🛒 Compras (PO) — ordem de compra a fornecedor.',
  '  Fluxo: RASCUNHO → EMITIDA → RECEBIDA (com three-way match contra NF).',
  '  Para emitir: aba Compras → escolha PO em RASCUNHO → botão "Aprovar" → "Emitir + enviar" (manda email ao fornecedor).',
  '',
  '🏗️ Projetos & RDO — execução do que foi vendido, com Relatórios Diários de Obra (RDO), marcos e aceite técnico.',
  '  Para lançar RDO: aba Projetos → escolha projeto → "Lançar RDO" → escreva o que foi feito e anexe fotos/PDF.',
  '',
  '💵 Despesas — lançamento de cupom fiscal por foto (OCR por IA extrai itens automaticamente).',
  '  Para lançar: aba Despesas → "+ Nova despesa" → tire/anexe foto do cupom → confira itens extraídos → salve.',
  '',
  '📅 Agenda — eventos e marcos do time.',
  '👁️ Visão 360 — visão completa de um cliente (propostas, chamados, projetos, contatos).',
  '🚚 Frota · Estoque · Fornecedores · KPIs · Caixa · Engenharia · Compliance — módulos auxiliares.',
  '',
  '🐞 Feedback (botão 💬 no canto) — reportar erro, sugestão ou melhoria. Você anexa print e o time recebe.',
  '',
  'IMPORTANTE',
  '— NÃO INVENTE dados, valores, IDs ou nomes. Se o usuário perguntar "quantas propostas?", "meus action cards?", "tem ticket aberto?", devolva o JSON de busca.',
  '— Se a busca não encontrar nada, ofereça refinar ou tentar outro filtro.',
  '— Para "como faço X?" responda com o passo-a-passo direto, sem JSON.'
].join('\n');

/**
 * API pública — recebe a mensagem do usuário e devolve a resposta.
 * @param {string} message  Texto do usuário.
 * @param {Object} [context] {section?: string, userName?: string}
 * @returns {{ok:true, reply:string}|{ok:false, error:string}}
 */
function Api_chatMessage(message, context) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return { ok: false, error: 'Mensagem não pode ser vazia.' };
    }

    var userMessage = message.trim();
    var sectionHint = '';
    if (context && context.section) {
      sectionHint = ' (usuário está na seção "' + context.section + '")';
    }
    var userPayload =
      'Usuário: ' + user.name + ' [' + user.role + ']' + sectionHint + '.\n' +
      'Pergunta: ' + userMessage;

    var rawReply = _callHaikuChat(_CHATBOT_SYSTEM_PROMPT, userPayload);

    // Detecta JSON de busca como PRIMEIRO conteúdo da resposta
    var actionObj = _extractSearchAction(rawReply);
    if (actionObj) {
      var searchReply = _chatSearchData(actionObj, user);
      return { ok: true, reply: searchReply };
    }

    return { ok: true, reply: rawReply };

  } catch (e) {
    return { ok: false, error: e.message || 'Erro desconhecido no assistente.' };
  }
}

/**
 * Tenta extrair um objeto JSON de busca do início da resposta do modelo.
 * Aceita JSON puro ou JSON com texto antes/depois (tolerante).
 * @param {string} reply
 * @returns {{action:'search', type:string, query?:string}|null}
 */
function _extractSearchAction(reply) {
  if (!reply) return null;
  var trimmed = reply.trim();
  var firstBrace = trimmed.indexOf('{');
  if (firstBrace === -1) return null;
  // Casa parênteses para extrair o JSON-raiz
  var depth = 0;
  var jsonClose = -1;
  for (var i = firstBrace; i < trimmed.length; i++) {
    if (trimmed[i] === '{') depth++;
    else if (trimmed[i] === '}') {
      depth--;
      if (depth === 0) { jsonClose = i; break; }
    }
  }
  if (jsonClose === -1) return null;
  try {
    var obj = JSON.parse(trimmed.substring(firstBrace, jsonClose + 1));
    if (obj && obj.action === 'search' && obj.type) return obj;
  } catch (e) { /* ignora */ }
  return null;
}

/* ─────────────────────────── Motor de busca ─────────────────────────── */

/**
 * Executa a busca no SGA com base no objeto retornado pelo modelo.
 * @param {{type:string, query?:string}} actionObj
 * @param {{id:string, name:string, role:string}} user  Usuário corrente.
 * @returns {string} Texto formatado em PT-BR.
 */
function _chatSearchData(actionObj, user) {
  var type  = String(actionObj.type || '').toLowerCase();
  var query = String(actionObj.query || '').toLowerCase().trim();

  // Parse de modificadores
  var mods = {
    minhas:   /\bmin(ha|has|eu|eus)\b/.test(query),
    abertos:  /\baberto(s|as|a)?\b/.test(query),
    urgentes: /\burgent(e|es)\b/.test(query)
  };
  // Remove os modificadores para sobrar o termo de busca por nome
  var nameQuery = query
    .replace(/\bmin(ha|has|eu|eus)\b/g, '')
    .replace(/\baberto(s|as|a)?\b/g, '')
    .replace(/\burgent(e|es)\b/g, '')
    .trim();

  var handlers = {
    companies:        _searchCompanies,
    contacts:         _searchContacts,
    proposals:        _searchProposals,
    opportunities:    _searchProposals,   // alias retrocompat
    quotes:           _searchProposals,   // alias retrocompat
    action_cards:     _searchActionCards,
    cards:            _searchActionCards, // alias
    tickets:          _searchTickets,
    chamados:         _searchTickets,     // alias PT
    purchase_orders:  _searchPOs,
    pos:              _searchPOs,         // alias
    compras:          _searchPOs,         // alias PT
    projects:         _searchProjects,
    projetos:         _searchProjects,    // alias PT
    expenses:         _searchExpenses,
    despesas:         _searchExpenses,    // alias PT
    feedbacks:        _searchFeedbacks
  };
  var fn = handlers[type];
  if (!fn) return 'Não sei buscar por "' + actionObj.type + '". Tente: empresas, propostas, chamados, action cards, compras, projetos, despesas.';

  try {
    return fn(user, mods, nameQuery);
  } catch (e) {
    return 'Não consegui buscar agora: ' + (e.message || 'erro inesperado') + '.';
  }
}

function _searchCompanies(user, mods, q) {
  var rows = sheetToObjects('COMPANIES');
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['name', 'normalized_name', 'razao_social'], q); });
  return _formatList(rows, 'empresa', 'empresas', function(r) {
    var nome = r.name || r.razao_social || '(sem nome)';
    var loc  = [r.city, r.state].filter(Boolean).join(', ');
    return '• ' + nome + (loc ? ' — ' + loc : '');
  });
}

function _searchContacts(user, mods, q) {
  var rows = sheetToObjects('CONTACTS');
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['name', 'email', 'company_name'], q); });
  return _formatList(rows, 'contato', 'contatos', function(r) {
    var nome  = r.name || '(sem nome)';
    var empr  = r.company_name ? ' (' + r.company_name + ')' : '';
    return '• ' + nome + empr;
  });
}

function _searchProposals(user, mods, q) {
  var rows = sheetToObjects(PROPOSALS_SHEET);
  var finais = { 'FECHADA':1, 'RECUSADA':1, 'CANCELADA':1, 'SUBSTITUIDA':1 };
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['created_by', 'owner_id', 'responsavel_id']); });
  if (mods.abertos) rows = rows.filter(function(r) { return !finais[String(r.status || '').toUpperCase()]; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'title', 'titulo', 'client_name', 'company_name'], q); });
  return _formatList(rows, 'proposta', 'propostas', function(r) {
    var id    = r.id || '?';
    var tit   = r.title || r.titulo || '(sem título)';
    var stat  = r.status ? ' [' + r.status + ']' : '';
    return '• ' + id + ' — ' + tit + stat;
  });
}

function _searchActionCards(user, mods, q) {
  var rows = acGetAll();
  var abertos = { 'ABERTO':1, 'EM_ANDAMENTO':1, 'SLA_ESTOURADO':1 };
  if (mods.minhas) rows = rows.filter(function(r) {
    var a = String(r.assigned_to || '');
    return a === user.id || a === user.role || a === user.name;
  });
  if (mods.abertos) rows = rows.filter(function(r) { return abertos[String(r.status || '').toUpperCase()]; });
  if (mods.urgentes) rows = rows.filter(function(r) { return String(r.urgent).toUpperCase() === 'TRUE'; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'title', 'message'], q); });
  return _formatList(rows, 'card', 'cards', function(r) {
    var tag = String(r.urgent).toUpperCase() === 'TRUE' ? '🔴 ' : '';
    return '• ' + tag + r.id + ' — ' + (r.title || '(sem título)') + ' [' + (r.status || '?') + ']';
  });
}

function _searchTickets(user, mods, q) {
  var rows = sheetToObjects(TICKETS_SHEET);
  var abertos = { 'ABERTO':1, 'EM_ATENDIMENTO':1, 'AGUARDANDO_CLIENTE':1 };
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['opened_by', 'assigned_to']); });
  if (mods.abertos) rows = rows.filter(function(r) { return abertos[String(r.status || '').toUpperCase()]; });
  if (mods.urgentes) rows = rows.filter(function(r) { return String(r.priority || '').toUpperCase() === 'CRITICA'; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'title', 'description'], q); });
  return _formatList(rows, 'chamado', 'chamados', function(r) {
    var prio = r.priority ? ' [' + r.priority + ']' : '';
    var stat = r.status ? ' (' + r.status + ')' : '';
    return '• ' + r.id + ' — ' + (r.title || '(sem título)') + prio + stat;
  });
}

function _searchPOs(user, mods, q) {
  var rows = sheetToObjects(PURCHASE_ORDERS_SHEET);
  var finais = { 'RECEBIDA':1, 'CANCELADA':1 };
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['created_by']); });
  if (mods.abertos) rows = rows.filter(function(r) { return !finais[String(r.status || '').toUpperCase()]; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'po_number', 'supplier_id', 'proposal_id'], q); });
  return _formatList(rows, 'ordem de compra', 'ordens de compra', function(r) {
    var num = r.po_number || r.id;
    var tot = (r.total_amount != null && r.total_amount !== '') ? ' — ' + (r.currency || 'BRL') + ' ' + r.total_amount : '';
    return '• ' + num + tot + ' [' + (r.status || '?') + ']';
  });
}

function _searchProjects(user, mods, q) {
  var rows = sheetToObjects(PROJECTS_SHEET);
  var finais = { 'CONCLUIDO':1, 'CANCELADO':1, 'ARQUIVADO':1 };
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['created_by', 'responsavel_id', 'gerente_id']); });
  if (mods.abertos) rows = rows.filter(function(r) { return !finais[String(r.status || '').toUpperCase()]; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'name', 'client_name', 'titulo'], q); });
  return _formatList(rows, 'projeto', 'projetos', function(r) {
    var nome = r.name || r.titulo || r.id;
    var cli  = r.client_name ? ' — ' + r.client_name : '';
    return '• ' + nome + cli + ' [' + (r.status || '?') + ']';
  });
}

function _searchExpenses(user, mods, q) {
  var rows = sheetToObjects(EXPENSES_SHEET);
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['criado_por']); });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'estabelecimento', 'categoria', 'descricao'], q); });
  // Despesas: ordena por data desc (mais recentes primeiro)
  rows.sort(function(a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
  return _formatList(rows, 'despesa', 'despesas', function(r) {
    var est = r.estabelecimento || '(sem local)';
    var tot = (r.total != null && r.total !== '') ? ' — R$ ' + r.total : '';
    var dt  = r.data ? ' · ' + r.data : '';
    return '• ' + est + tot + dt;
  });
}

function _searchFeedbacks(user, mods, q) {
  var rows = sheetToObjects(FEEDBACK_SHEET);
  var abertos = { 'NOVO':1, 'COMPILADO':1, 'EM_ANALISE':1, 'APROVADO':1 };
  if (mods.minhas) rows = rows.filter(function(r) { return _isMine(r, user, ['criado_por']); });
  if (mods.abertos) rows = rows.filter(function(r) { return abertos[String(r.status || '').toUpperCase()]; });
  if (q) rows = rows.filter(function(r) { return _matchAny(r, ['id', 'titulo', 'descricao', 'tela'], q); });
  rows.sort(function(a, b) { return String(b.criado_em || '').localeCompare(String(a.criado_em || '')); });
  return _formatList(rows, 'feedback', 'feedbacks', function(r) {
    return '• ' + r.id + ' — ' + (r.titulo || '(sem título)') + ' [' + (r.status || '?') + ']';
  });
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function _isMine(row, user, fields) {
  if (!user) return false;
  for (var i = 0; i < fields.length; i++) {
    var v = String(row[fields[i]] || '').toLowerCase();
    if (!v) continue;
    if (v === String(user.id || '').toLowerCase()) return true;
    if (v === String(user.name || '').toLowerCase()) return true;
    if (v === String(user.email || '').toLowerCase()) return true;
  }
  return false;
}

function _matchAny(row, fields, q) {
  if (!q) return true;
  for (var i = 0; i < fields.length; i++) {
    var v = row[fields[i]];
    if (v && String(v).toLowerCase().indexOf(q) !== -1) return true;
  }
  return false;
}

function _formatList(rows, singular, plural, renderLine) {
  if (!rows || rows.length === 0) {
    return 'Nenhum(a) ' + singular + ' encontrado(a) com esse filtro.';
  }
  var max  = 8;
  var head = rows.length === 1
    ? 'Encontrei 1 ' + singular + ':'
    : 'Encontrei ' + rows.length + ' ' + plural + (rows.length > max ? ' (mostrando ' + max + '):' : ':');
  var lines = [head];
  rows.slice(0, max).forEach(function(r) { lines.push(renderLine(r)); });
  if (rows.length > max) {
    lines.push('... e mais ' + (rows.length - max) + '. Refine o filtro para diminuir.');
  }
  return lines.join('\n');
}

/* ─────────────────────────── Chamada à API Anthropic ─────────────────────────── */

function _callHaikuChat(systemPrompt, userMessage) {
  var url = 'https://api.anthropic.com/v1/messages';
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada nas propriedades do script.');

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
  if (json.error) throw new Error(json.error.message);
  if (!json.content || !json.content[0] || !json.content[0].text) {
    throw new Error('Resposta inesperada da API Anthropic.');
  }
  return json.content[0].text;
}
