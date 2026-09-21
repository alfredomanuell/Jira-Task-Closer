const $ = (sel) => document.querySelector(sel);
const message = $("#message");

function show(text, kind) {
  message.hidden = false;
  message.className = `message ${kind}`;
  message.textContent = text;
}

function readForm() {
  return {
    baseUrl: $("#baseUrl").value.trim().replace(/\/+$/, ""),
    email: $("#email").value.trim(),
    token: $("#token").value.trim(),
    jql: $("#jql").value.trim(),
    autoClose: $("#autoClose").checked,
    autoCloseMinutes: Math.max(0, Number($("#autoCloseMinutes").value) || 5),
  };
}

async function connect(settings) {
  const origin = new URL(settings.baseUrl).origin + "/*";
  if (!(await chrome.permissions.request({ origins: [origin] }))) {
    throw new Error(`Permissão para ${origin} recusada.`);
  }
  const res = await chrome.runtime.sendMessage({ type: "testConnection", settings });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

async function test() {
  const settings = readForm();
  if (!settings.baseUrl || !settings.email || !settings.token) {
    return show("Preenche URL, e-mail e token primeiro.", "error");
  }
  show("A testar...", "info");
  try {
    const me = await connect(settings);
    show(`Ligado como ${me.displayName} (${me.email}).`, "ok");
  } catch (err) {
    show(err.message, "error");
  }
}

async function save(e) {
  e.preventDefault();
  const settings = readForm();
  show("A validar...", "info");
  try {
    const me = await connect(settings);
    settings.targetAccountId = me.accountId;
    settings.targetName = me.displayName;
    await chrome.storage.sync.set({ jira: settings });
    show(`Guardado. Conta: ${me.displayName}.`, "ok");
  } catch (err) {
    show(err.message, "error");
  }
}

async function load() {
  const { jira } = await chrome.storage.sync.get("jira");
  if (!jira) return;
  if (jira.baseUrl) $("#baseUrl").value = jira.baseUrl;
  if (jira.email) $("#email").value = jira.email;
  $("#token").value = jira.token || "";
  $("#jql").value = jira.jql || "";
  $("#autoClose").checked = Boolean(jira.autoClose);
  $("#autoCloseMinutes").value = jira.autoCloseMinutes ?? 5;
}

$("#test").addEventListener("click", test);
$("#form").addEventListener("submit", save);
load();
