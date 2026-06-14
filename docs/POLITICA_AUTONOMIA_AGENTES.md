# POLÍTICA DE AUTONOMIA DOS AGENTES — SGA
**Decidido com o João em 2026-06-12 · vinculante**

> Define **o que um agente pode corrigir e publicar sozinho** e **o que exige a
> aprovação do João**. A regra existe porque "nível de acesso" é, na prática,
> "que classe de erro eu aceito que vá ao ar sem eu olhar". Leia junto com
> `docs/ESTADO_ATUAL_SGA.md` e `PROMPT_TRIAGEM.md`.

---

## 0. Configuração atual (fase de início)
- **Autonomia liberada:** até a **Camada Amarela** — o agente CORRIGE e TESTA,
  mas **quem publica para os usuários é o João**.
- **Quem classifica a camada:** o **próprio agente**, pela matriz abaixo.
- **Trava de publicação por URL (obrigatória):**
  - `/exec` = PRODUÇÃO. Só os usuários (Gema, Maria, Jonatan) usam.
  - `/dev`  = última versão salva. Agentes e João testam aqui.
  - **Nenhuma correção chega ao usuário até o João clicar em "Implantar".**
    Salvar/editar no Apps Script muda só a `/dev`. Publicar é o gesto do João.

---

## 1. A matriz de risco

### 🟢 VERDE — agente prepara e deixa pronto para publicar (1 clique do João)
Só entra aqui o que **não pode causar dano**. Critério OBJETIVO (todos verdadeiros):
- mexe **apenas em `.html` de apresentação** (texto, CSS, rótulo, máscara, cor,
  alinhamento, `escapeHtml` faltando);
- **não toca em nenhuma aba do Google Sheets** (estrutura nem dados);
- **não altera nenhuma `Api_*`**, regra de cálculo, preço, alçada ou RBAC;
- **passa nas validações** (`node --check` nos `<script>`, zero funções
  duplicadas entre HTMLs).

Ação do agente: corrige → valida → testa na `/dev` → escreve no log (§3) →
avisa o João "pronto para publicar (verde)". Risco: ~nulo (pior caso, um texto
a ajustar depois).

### 🟡 AMARELO — agente corrige, testa na /dev, João aprova a publicação
A maior parte das correções reais: bug de lógica numa função, filtro errado,
campo que não salva, ordenação, paginação, comportamento de tela.
- pode tocar `Api_*` e Service, **desde que NÃO** mude estrutura/dados do Sheets,
  regra financeira, RBAC, nem os fluxos críticos (§ vermelho).

Ação do agente: corrige → valida → **deixa funcionando na `/dev`** → entrega ao
João um resumo curto: (1) o que era / o que fez; (2) arquivos tocados; (3)
**checklist da Interligação Total** — o que pode ter afetado (Visão 360,
dashboard, timeline, vínculos); (4) link da `/dev` para conferir. João aprova →
publica.

### 🔴 VERMELHO — exige o João desde o desenho (não só na publicação)
O agente **propõe e PARA**. Entra aqui qualquer coisa que toque:
- **estrutura do Sheets** (nova coluna, nova aba, migração, renomear campo);
- **regra financeira** (preço, markup, margem, GST, alçada, total de proposta);
- **permissões / RBAC**;
- **exclusão de dados** ou qualquer operação destrutiva/irreversível;
- **fluxos críticos**: proposta imutável/revisões, endgate de chamado
  (origem/custo/cobrança), importação da base legada, geração de PDF que vai ao
  cliente.

Ação do agente: segue `PROMPT_TRIAGEM.md` e escreve a proposta no `PLANO-*.md`.
Nada é implementado sem o "pode fazer" explícito do João.

---

## 2. Regra de ouro (a que mais protege)
**Na dúvida entre duas camadas, suba — nunca desça.** Incerto se é verde ou
amarelo → trata como amarelo. Incerto se amarelo ou vermelho → trata como
vermelho. O custo de pedir aprovação à toa é o tempo do João; o custo de
publicar sozinho algo que devia ser olhado é um cliente vendo dado errado. Erre
sempre para o lado seguro.

Gatilhos que **forçam subir de camada**, mesmo que o resto pareça simples:
qualquer menção a dinheiro, cliente, permissão, exclusão, ou a palavra "todos/
todas" (mudança que afeta vários registros).

---

## 3. Reversibilidade e auditoria (obrigatório em TODA ação autônoma)
- **Antes** de qualquer correção verde/amarela: registrar o estado anterior
  (commit/snapshot do arquivo) para reverter em 1 passo se necessário.
- **Toda** ação autônoma gera uma linha de log: data, agente, relato `FB-xxxxx`,
  camada, arquivos tocados, resultado das validações. Autonomia sem trilha de
  auditoria é inaceitável.
- Toda correção cita o `FB-xxxxx` que a originou.

---

## 4. Fechamento do ciclo com o usuário (status na aba FEEDBACKS)
O usuário vê o status em "Meus reportes". A camada define a mensagem:
- 🟢 Verde publicado → `IMPLEMENTADO`, nota: "corrigido — atualize com
  Ctrl+Shift+R". (gratificação imediata)
- 🟡 Amarelo testado, aguardando João → `EM_ANALISE` → após publicar,
  `IMPLEMENTADO`.
- 🔴 Vermelho → `EM_ANALISE` (no plano) → `APROVADO`/`RECUSADO` conforme decisão.
A `resolucao_nota` é curta e escrita para o usuário, não para o dev.

---

## 5. O que NÃO muda
- O João pode, a qualquer momento, estreitar ou alargar estas faixas.
- Usuários **nunca** trabalham na `/dev`.
- A planilha (Sheets) é território vermelho por padrão — estrutura e dados só
  mudam com o João no circuito.
