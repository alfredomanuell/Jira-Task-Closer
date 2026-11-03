# Jira Task Closer

Serviço Node que corre numa VPS. Gere as tarefas da jornada no Jira dentro do horário de trabalho: abre a seguinte quando uma termina e fecha cada uma ao fim do tempo estimado.

Não é uma extensão do navegador. Não abre portas. A verificação corre a cada minuto enquanto o processo estiver ligado, de noite e ao fim de semana incluídos, sem depender de um Chrome aberto.

## Configurar

1. Node 22 ou superior.
2. `cp .env.example .env` e preencher o URL, o e-mail e o API token (criado em id.atlassian.com > Security > API tokens).
3. `chmod 600 .env`
4. `node src/cli.js test`

O token fica só no `.env` ou no ambiente do processo, nunca no código nem no registo.

```
JIRA_BASE_URL        origem https do Jira
JIRA_EMAIL           conta Atlassian do token
JIRA_API_TOKEN       token de API
JIRA_JQL             filtro extra, opcional
SCRUM_MASTER_EMAIL   mencionado quando a jornada não pode continuar
AUTO_CLOSE           true para o serviço gerir as tarefas
STATE_PATH           data/state.json
```

Uma alteração ao `.env` só passa a valer depois de reiniciar o processo.

## Correr

```
npm start                 processo contínuo
node src/cli.js test      testa a conta e o Scrum Master
node src/cli.js list      tarefas da jornada
node src/cli.js close ABC-123
node src/cli.js once      um ciclo, sem esperar pelo minuto
node src/cli.js log       ocorrências de hoje
npm test                  regras de horário, configuração e estado
```

Na VPS, o unit em `deploy/jira-task-closer.service` assume o código em `/opt/jira-task-closer`, o utilizador `jira-closer` e o `node` em `/usr/bin/node`. Ajusta estes caminhos se forem diferentes. O serviço escreve só em `data/` e sai com o código 78 se a configuração for inválida, sem ficar a reiniciar.

```
sudo useradd --system --home-dir /opt/jira-task-closer --shell /usr/sbin/nologin jira-closer
sudo mkdir -p /opt/jira-task-closer/data
sudo cp -a src package.json /opt/jira-task-closer/
sudo cp .env /opt/jira-task-closer/.env
sudo chown -R jira-closer:jira-closer /opt/jira-task-closer
sudo chmod 600 /opt/jira-task-closer/.env
sudo cp deploy/jira-task-closer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jira-task-closer
```

## Como funciona

- Lista tarefas com `assignee = a conta do token AND statusCategory != Done AND duedate = hoje` (calendário de Europe/Lisbon), mais o filtro JQL. Uma tarefa que não acabou no dia continua na jornada até ser concluída.
- **Fechar** aplica a transição para um estado da categoria Done (Concluído). Na linha de comandos, `close CHAVE id` escolhe outra transição.
- Só toca em tarefas atribuídas à conta do token. Qualquer outra é recusada.

O dia útil são 8h, em Europe/Lisbon: 07:30–12:30 e 14:00–16:59 (pausa 12:30–14:00). O último minuto de trabalho é 16:59. Noite, fim de semana e pausa não contam.

Com `AUTO_CLOSE=true`, a cada minuto:

- Encerra a tarefa em progresso quando o tempo estimado chega a zero. Não fecha minutos antes, nem às 16:59 se ainda houver estimativa.
- Se o conjunto do dia passar das 8 horas, reparte o tempo. Duas tarefas de 6 horas: a primeira corre 6 horas e a segunda usa as 2 horas que faltam. Essa segunda mantém-se em progresso, com o tempo já feito registado no Jira, e retoma no próximo dia útil até acabar.
- Abre a seguinte só quando a anterior termina, para não haver sobreposição. A jornada não passa das 8 horas.
- Se não houver tarefa para continuar, ou a tarefa não tiver estimativa, menciona o Scrum Master num comentário. Sem e-mail configurado, a ocorrência fica no registo e no journal.

Aberturas ou fechos fora de 07:30–16:59, antecipados ou atrasados (para além da margem de 2 minutos) ficam no registo como ocorrência, com a justificação. Fechar pela linha de comandos encerra de imediato e, se for antes do estimado ou fora do horário, também fica registado. A tarefa seguinte só abre dentro do horário.

As últimas 80 ações, a jornada em curso e o cursor do tempo registado ficam em `data/state.json`.

## Ficheiros

```
src/
  index.js      processo: um ciclo por minuto
  cli.js        testar, listar, fechar e ver o registo
  runtime.js    configuração, identidade e estado
  engine.js     abertura, fecho, worklog e ocorrências
  jira.js       chamadas à API
  time.js       horário de Lisboa e tempo restante
  schedule.js   regras de abertura, fecho e ocorrências
  config.js     .env e validação
  store.js      data/state.json
deploy/jira-task-closer.service
```

Sem dependências.
