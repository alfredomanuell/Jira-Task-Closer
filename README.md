# Jira Task Closer

Extensão Chrome que lista as minhas tarefas abertas no Jira e as fecha, à mão ou automaticamente quando o tempo estimado está quase a acabar.

## Instalar

1. `chrome://extensions` > Modo de programador > Carregar sem compactação > pasta `src/`
2. Ícone da extensão > Opções > colar o API token (criado em id.atlassian.com > Security > API tokens)
3. Testar ligação > Guardar

O token fica só no `chrome.storage`, nunca no código.

## Como funciona

- Lista tarefas com `assignee = eu AND statusCategory != Done`, mais o filtro JQL extra das opções.
- **Fechar** aplica a transição para um estado da categoria Done (Concluído). Clique direito no botão para escolher outra transição.
- Numa página `/browse/ABC-123` a tarefa dessa página aparece no topo.
- Só toca em tarefas atribuídas à conta do token; qualquer outra é recusada.

## Fecho automático

O dia útil são 8h, em Europe/Lisbon: 7:30–12:30 e 14:00–17:00 (pausa 12:30–14:00). Noite, fim de semana e pausa não contam.

Com a opção ligada, a cada minuto (Chrome aberto) verifica as tarefas em Em Progresso com Tempo Estimado:

```
estimado - (tempo registado + tempo útil desde que entrou em Em Progresso) <= N minutos
```

Quando isso acontece, passa a tarefa para Concluído. Se depois dela ainda houver uma tarefa por fazer e nenhuma estiver em progresso, essa seguinte passa a Em Progresso, para não ficar um buraco no horário. A ordem é a da lista (o JQL). O mesmo encadeamento acontece ao fechar uma tarefa à mão, mas só dentro do horário útil.

As últimas 50 ações ficam em `chrome.storage.local.autoCloseLog`. Não corre com o PC suspenso ou hibernado; ao acordar fecha o que já tiver passado do tempo e, se for horário útil, arranca a seguinte.

## Ficheiros

```
src/
  manifest.json
  background.js   service worker: mensagens do popup e alarme do fecho automático
  jira.js         chamadas à API
  time.js         cálculo do tempo restante
  popup.*         lista de tarefas
  options.*       configuração
scripts/
  make-icons.js   gera os PNG
  zip.js          empacota src/ em dist/
```

## Scripts

```
npm run check   valida sintaxe
npm run icons   regenera os ícones
npm run build   ícones + zip em dist/
```

Sem dependências. Node 22 ou superior.
