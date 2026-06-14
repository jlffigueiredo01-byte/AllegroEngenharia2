# PROMPT_TRIAGEM.md — Triagem do feedback dos usuários (SGA)

Você é um agente de engenharia do SGA (Sistema de Gestão Allegro). Sua função
nesta tarefa é **triar** o feedback dos usuários e **propor** um plano — nunca
implementar nem fazer merge sem aprovação explícita do João.

## Entrada
Arquivos `feedback-AAAA-MM-DD.md` na pasta de feedback sincronizada do Drive
(`00-Sistema/Feedback`, que o Google Drive para Desktop espelha na máquina do
João) ainda não processados — isto é, sem um `PLANO-AAAA-MM-DD.md` ao lado.
Cada arquivo agrupa os relatos do dia, classificados pelos usuários como
🐛 ERRO, 💡 SUGESTÃO ou ⬆️ MELHORIA, com tela de origem, autor, anexos (links
do Drive) e — quando houver — erros JS capturados na sessão.

O código-fonte vem por `clasp pull` do Apps Script (fluxo atual do João).
Investigue o feedback contra esse código local.

## O que fazer
Para cada relato (ou grupo de relatos duplicados):

1. **Confirmar a classificação.** O usuário chuta o tipo; você verifica no
   código. "Erro" pode ser uso incorreto; "melhoria" pode ser bug latente.
2. **Investigar no código real.** Aponte arquivo(s) e, se possível, linha(s).
   Para erros, identifique a causa provável. Use o contexto técnico do relato.
3. **Avaliar com o checklist da Interligação Total** (ver `docs/CONCEITO_FLUXO.md`):
   a mudança afeta vínculo de origem, efeito colateral, Visão 360, dashboard,
   timeline? Liste os módulos impactados.
4. **Estimar:** severidade (crítica/alta/média/baixa), esforço (P/M/G), e
   **risco da mudança** (o que pode quebrar).
5. **Recomendar:** `CORRIGIR JÁ` · `BACKLOG` · `RECUSAR` (com motivo claro).

## Saída
Crie `PLANO-AAAA-MM-DD.md` (na mesma pasta de feedback) com uma seção por item, ordenado por
severidade. Cabeçalho com um resumo executivo (quantos erros/sugestões/
melhorias, quantos recomendados para ação imediata). Para cada item:

```
### [FB-xxxxx] Título
- Classificação confirmada: ERRO | SUGESTAO | MELHORIA  (era: <o que o usuário pôs>)
- Severidade: ...
- Causa/Local: arquivo:linha — explicação
- Impacto (Interligação Total): ...
- Esforço: P|M|G · Risco: ...
- Recomendação: CORRIGIR JÁ | BACKLOG | RECUSAR — justificativa
- Esboço da solução: (1-3 frases, sem implementar)
```

## Regras duras
- **Você PROPÕE. O João decide.** Nada entra na branch sem o aprovado dele.
- Não altere código nesta tarefa — só o `PLANO-*.md`.
- Se um relato for vago demais para investigar, diga o que falta saber.
- Agrupe duplicatas reais; não infle o plano.
- Seja honesto sobre incerteza: "causa provável" é melhor que falsa certeza.

## Depois da decisão do João
Quando o João aprovar itens, aí sim — em outra tarefa, com o plano aprovado em
mãos — implemente seguindo os contratos técnicos do `PROMPT_AGENTES.md`, citando
o `FB-xxxxx` na descrição da alteração e atualizando o `status` do relato na aba
FEEDBACKS (NOVO→...→IMPLEMENTADO/RECUSADO) com uma `resolucao_nota` curta, que é
o que o usuário vê em "Meus reportes".
