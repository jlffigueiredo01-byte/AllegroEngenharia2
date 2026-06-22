// Domain.CompanyEnrich.js — Enriquecimento de dados de empresa via IA (FB-17/18)
// Usa Anthropic claude-haiku-4-5 + ferramenta web_search (server-side) para
// extrair dados estruturados a partir do website REAL informado. NUNCA persiste
// — apenas retorna preview editavel pro usuario revisar antes de salvar.
//
// IMPORTANTE: o modelo USA a ferramenta web_search da Anthropic — ele de fato
// pesquisa no Google e le o site. Sem isso o Haiku alucinava (FB confirmou:
// retornou "Allegro Engenharia e Consultoria Ltda" em vez da empresa real do
// dominio allegro.eng.br).

/**
 * Endpoint chamado pelo front (CompaniesUI.html).
 * Retorna { ok: true, data: {...campos...} } ou { ok: false, error: '...' }.
 */
function Api_enrichCompanyFromWebsite(website) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!website) throw new Error('Informe o website da empresa.');
    return { ok: true, data: _companyEnrichSvc(website) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _companyEnrichSvc(website) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurado em Script Properties.');

  var url = String(website).trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // Prompt pesado em pesquisa REAL. Instrucao explicita: usa web_search,
  // NUNCA inventa, em caso de duvida deixa campo vazio.
  var prompt =
    'Sua tarefa: extrair dados PUBLICOS da empresa cujo site eh: ' + url + '\n\n' +
    'PROCEDIMENTO OBRIGATORIO:\n' +
    '1. Use a ferramenta web_search para pesquisar o dominio (ex: "site:' +
       url.replace(/^https?:\/\//i, '').replace(/\/$/, '') + '" + nome empresa).\n' +
    '2. Faca buscas adicionais se precisar (CNPJ, endereco, contato comercial).\n' +
    '3. Confira que a empresa encontrada CORRESPONDE ao dominio fornecido. Se nao bater, retorne campos vazios.\n' +
    '4. NUNCA invente dados nem use conhecimento de treino. Se o web_search nao trouxer info confiavel, deixe vazio.\n\n' +
    'RETORNE EXCLUSIVAMENTE um JSON valido (sem markdown, sem texto antes/depois) no formato:\n' +
    '{\n' +
    '  "razao_social": "nome legal completo se encontrar na pesquisa",\n' +
    '  "nome_fantasia": "nome comercial usado no site/marca",\n' +
    '  "cnpj": "00.000.000/0000-00 formatado, ou vazio",\n' +
    '  "descricao_empresa": "1-2 frases descrevendo o que a empresa faz, PT-BR, baseado APENAS na pesquisa",\n' +
    '  "endereco": "endereco completo: rua, numero, bairro, cidade, UF, CEP",\n' +
    '  "telefone": "telefone formatado (XX)XXXX-XXXX ou vazio",\n' +
    '  "email": "email de contato comercial ou vazio",\n' +
    '  "setor": "setor/segmento em PT-BR",\n' +
    '  "fontes_consultadas": "lista as URLs/fontes que voce realmente abriu na pesquisa"\n' +
    '}\n\n' +
    'REGRA DE OURO: melhor vazio do que errado. Se nao tem certeza do CNPJ ou razao social, deixa vazio.';

  var requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096, // maior pq web_search adiciona conteudo nos blocks
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5  // limite de buscas pra controlar custo (5 buscas suficiente)
    }],
    messages: [{ role: 'user', content: prompt }]
  };

  var response;
  try {
    response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });
  } catch (e) {
    throw new Error('Falha de rede ao chamar Anthropic: ' + e.message);
  }

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Anthropic API erro ' + code + ': ' + body.substring(0, 400));
  }

  var parsed;
  try { parsed = JSON.parse(body); }
  catch (e) { throw new Error('Resposta da Anthropic nao e JSON: ' + body.substring(0, 200)); }

  if (!parsed.content || !parsed.content.length) {
    throw new Error('Resposta da Anthropic sem content.');
  }

  // Com web_search, content vem com varios blocos: server_tool_use, web_search_tool_result, text.
  // O resultado final fica no ULTIMO bloco de tipo "text".
  var finalText = '';
  var searchesCount = 0;
  for (var i = 0; i < parsed.content.length; i++) {
    var b = parsed.content[i];
    if (b.type === 'text' && b.text) finalText = b.text;
    if (b.type === 'server_tool_use' || b.type === 'web_search_tool_result') searchesCount++;
  }
  if (!finalText) {
    // Fallback: pega qualquer text encontrado
    for (var j = 0; j < parsed.content.length; j++) {
      if (parsed.content[j].text) { finalText = parsed.content[j].text; break; }
    }
  }
  if (!finalText) {
    throw new Error('Resposta da Anthropic sem bloco de texto final. Blocos retornados: ' +
      parsed.content.map(function (c) { return c.type; }).join(','));
  }

  // Parser tolerante: IA as vezes responde "Encontrei tudo! Aqui o JSON: ```json {...}```".
  // Estrategia: 1) remove cercas; 2) se nao parseia, extrai do PRIMEIRO `{` ao ULTIMO `}`.
  var raw = finalText.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  var extracted = null;
  try { extracted = JSON.parse(raw); } catch (e) { /* tentaremos fallback */ }
  if (!extracted) {
    // Fallback: pega o maior bloco {...} no texto
    var first = raw.indexOf('{');
    var last  = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      var candidate = raw.substring(first, last + 1);
      // Remove cercas internas eventualmente embedded
      candidate = candidate.replace(/```/g, '');
      try { extracted = JSON.parse(candidate); } catch (e2) { /* falha final abaixo */ }
    }
  }
  if (!extracted) {
    throw new Error('IA nao retornou JSON valido apos web_search. Resposta crua: ' + raw.substring(0, 500));
  }

  var tokensIn  = parsed.usage ? (parsed.usage.input_tokens || 0)  : 0;
  var tokensOut = parsed.usage ? (parsed.usage.output_tokens || 0) : 0;
  // Custo: tokens normais Haiku + custo de cada web_search (~$10/1k buscas)
  appendAuditLog('IA_ENRICH', 'COMPANIES', '',
    'website=' + url + ' campos=' + Object.keys(extracted).join(',') +
    ' searches=' + searchesCount + ' tokens=' + (tokensIn + tokensOut));

  return {
    website:            url,
    razao_social:       String(extracted.razao_social || ''),
    nome_fantasia:      String(extracted.nome_fantasia || ''),
    cnpj:               String(extracted.cnpj || ''),
    descricao_empresa:  String(extracted.descricao_empresa || ''),
    endereco:           String(extracted.endereco || ''),
    telefone:           String(extracted.telefone || ''),
    email:              String(extracted.email || ''),
    setor:              String(extracted.setor || ''),
    fontes_consultadas: String(extracted.fontes_consultadas || ''),
    tokens_usados:      tokensIn + tokensOut,
    web_searches:       searchesCount
  };
}
