# Migração dos agentes para o novo projeto (domínio Allegro)

> O SGA foi migrado da conta pessoal para o domínio @allegro.eng.br.
> O código agora vive num projeto Apps Script NOVO. Os agentes precisam
> apontar para esse novo projeto, senão continuam mexendo na planilha velha.

## O que mudou
- **Antes:** projeto Apps Script na conta pessoal (jlffigueiredo01).
- **Agora:** projeto Apps Script na conta Allegro (container-bound na planilha
  copiada "Allegro Business System").
- O **Script ID** mudou. É só isso que os agentes precisam atualizar.

## Passo a passo (na máquina dos agentes)

### 1. Logar o clasp na conta Allegro
O clasp estava logado na conta pessoal. Troque para a conta dona do novo projeto:
```
clasp logout
clasp login
```
(Escolha a conta @allegro.eng.br no navegador que abrir.)

### 2. Atualizar o Script ID
No arquivo `.clasp.json` da pasta de trabalho dos agentes, troque o `scriptId`
pelo novo (anote o seu aqui, NÃO comite este valor no GitHub):

```
NOVO_SCRIPT_ID = ____________________________________________
```

O `.clasp.json` deve ficar assim:
```json
{
  "scriptId": "COLE_AQUI_O_NOVO_SCRIPT_ID",
  "rootDir": "."
}
```

> Alternativa limpa: rode `clasp clone <NOVO_SCRIPT_ID>` numa pasta nova e use
> essa pasta como base, em vez de editar o .clasp.json à mão.

### 3. Testar a conexão
```
clasp pull
```
Se baixar os arquivos .gs/.html sem erro, está conectado ao projeto certo.
(Lembre: clasp NÃO traz os .md — a documentação vem do GitHub, como sempre.)

### 4. Confirmar a branch do GitHub
A fonte da verdade do código continua sendo o GitHub. Confirme que os agentes
estão na branch correta antes de qualquer alteração.

## Checklist rápido
- [ ] clasp logout + login na conta Allegro
- [ ] scriptId novo no .clasp.json
- [ ] clasp pull funcionando (baixa .gs/.html)
- [ ] branch do GitHub correta
- [ ] um teste pequeno: editar um comentário, clasp push, ver no editor novo

## Atenção
- O projeto ANTIGO (conta pessoal) continua existindo, intacto. NÃO mexa nele —
  ele é só backup. Todo trabalho novo vai para o projeto Allegro.
- Se um clasp push for para o projeto errado, é porque o scriptId não foi
  trocado. Confira o .clasp.json.
