import { remainingSeconds, formatDuration } from "./time.js";

const $ = (sel, root = document) => root.querySelector(sel);
const list = $("#issues");
const message = $("#message");
const template = $("#issue-row");

let baseUrl = "";
let autoClose = { enabled: false, minutes: 5 };

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error("Sem resposta do service worker."));
      res.ok ? resolve(res.data) : reject(new Error(res.error));
    });
  });
}

function show(text, kind = "info") {
  message.hidden = !text;
  message.className = `message ${kind}`;
  message.textContent = text;
}

function showSetupLink(text) {
  show(text + " ", "error");
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = "Abrir opções";
  link.onclick = (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  message.appendChild(link);
}

function row(issue) {
  const node = template.content.firstElementChild.cloneNode(true);
  const key = $(".key", node);
  const status = $(".status", node);
  const select = $(".transition", node);
  const button = $(".close", node);

  key.textContent = issue.key;
  key.href = `${baseUrl}/browse/${issue.key}`;
  status.textContent = issue.status || "";
  $(".summary", node).textContent = issue.summary || "";
  $(".summary", node).title = issue.summary || "";

  const left = remainingSeconds(issue);
  if (left !== null && issue.statusCategory === "indeterminate") {
    const el = $(".remaining", node);
    el.hidden = false;
    el.textContent = left >= 0 ? `faltam ${formatDuration(left)}` : `excedido ${formatDuration(left)}`;
    el.title = `Estimado ${formatDuration(issue.originalEstimate)}`;
    if (autoClose.enabled && left <= autoClose.minutes * 60) el.classList.add("soon");
  }

  select.addEventListener("focus", async () => {
    if (select.dataset.loaded) return;
    select.dataset.loaded = "1";
    try {
      for (const t of await send("getTransitions", { key: issue.key })) {
        select.add(new Option(`${t.name} → ${t.toStatus}`, t.id, false, t.isDone));
      }
    } catch (err) {
      show(err.message, "error");
    }
  });

  button.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    select.hidden = false;
    select.focus();
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "...";
    try {
      const transitionId = select.dataset.loaded ? select.value : undefined;
      const t = await send("closeIssue", { key: issue.key, transitionId });
      node.classList.add("done");
      status.textContent = t.toStatus;
      button.textContent = "Fechada";
      show(`${issue.key} → ${t.toStatus}`, "ok");
    } catch (err) {
      button.disabled = false;
      button.textContent = "Fechar";
      show(err.message, "error");
    }
  });

  return node;
}

let loadCount = 0;

async function loadIssues() {
  const current = ++loadCount;
  const refresh = $("#refresh");
  refresh.disabled = true;
  show("A carregar...");
  try {
    const issues = await send("listIssues");
    if (current !== loadCount) return;
    list.replaceChildren(...issues.map(row));
    show(issues.length ? "" : "Sem tarefas abertas.", "ok");
  } catch (err) {
    if (current !== loadCount) return;
    if (err.message.startsWith("Configura")) showSetupLink(err.message);
    else show(err.message, "error");
  } finally {
    if (current === loadCount) refresh.disabled = false;
  }
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !baseUrl || !tab.url.startsWith(baseUrl)) return;
  const match = tab.url.match(/(?:browse\/|selectedIssue=)([A-Z][A-Z0-9_]+-\d+)/);
  if (!match) return;
  try {
    const issue = await send("getIssue", { key: match[1] });
    if (issue.statusCategory === "done") return;
    $("#current-issue").appendChild(row(issue));
    $("#current").hidden = false;
  } catch {}
}

async function init() {
  const { jira } = await chrome.storage.sync.get("jira");
  baseUrl = (jira?.baseUrl || "").replace(/\/+$/, "");
  autoClose = { enabled: Boolean(jira?.autoClose), minutes: Number(jira?.autoCloseMinutes) || 5 };

  $("#account").textContent = jira?.targetName ? `Conta: ${jira.targetName}` : "";
  $("#autoclose").textContent = autoClose.enabled
    ? `Fecho automático ligado (${autoClose.minutes} min antes do fim do estimado)`
    : "Fecho automático desligado";

  $("#refresh").onclick = loadIssues;
  $("#open-options").onclick = () => chrome.runtime.openOptionsPage();

  await Promise.all([loadCurrentTab(), loadIssues()]);
}

init();
