import * as jira from "./jira.js";
import { remainingSeconds } from "./time.js";

const ALARM = "auto-close";

const handlers = {
  async testConnection({ settings }) {
    const me = await jira.whoAmI(settings);
    return { accountId: me.accountId, displayName: me.displayName, email: me.emailAddress };
  },
  async listIssues() {
    return jira.openIssues(await jira.loadSettings());
  },
  async getIssue({ key }) {
    return jira.ownIssue(await jira.loadSettings(), key);
  },
  async getTransitions({ key }) {
    const settings = await jira.loadSettings();
    await jira.ownIssue(settings, key);
    return jira.transitions(settings, key);
  },
  async closeIssue({ key, transitionId }) {
    return jira.closeIssue(await jira.loadSettings(), key, transitionId);
  },
  runAutoClose,
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    reply({ ok: false, error: `Mensagem desconhecida: ${msg?.type}` });
    return false;
  }
  handler(msg)
    .then((data) => reply({ ok: true, data }))
    .catch((err) => reply({ ok: false, error: err.message }));
  return true;
});

async function scheduleAlarm() {
  if (!(await chrome.alarms.get(ALARM))) {
    chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(scheduleAlarm);
chrome.runtime.onStartup.addListener(scheduleAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runAutoClose().catch((err) => console.warn(err.message));
});

async function runAutoClose() {
  const { jira: settings } = await chrome.storage.sync.get("jira");
  if (!settings?.autoClose || !settings.baseUrl || !settings.token) return [];

  const limit = (Number(settings.autoCloseMinutes) || 5) * 60;
  const now = Date.now();
  const due = (await jira.openIssues(settings)).filter((issue) => {
    const left = remainingSeconds(issue, now);
    return issue.statusCategory === "indeterminate" && left !== null && left <= limit;
  });

  const results = [];
  for (const issue of due) {
    const entry = { key: issue.key, summary: issue.summary, at: new Date().toISOString() };
    try {
      entry.toStatus = (await jira.closeIssue(settings, issue.key)).toStatus;
      notify(`${issue.key} → ${entry.toStatus}`, issue.summary);
    } catch (err) {
      entry.error = err.message;
      notify(`Falhou fechar ${issue.key}`, err.message);
    }
    results.push(entry);
  }

  if (results.length) {
    const { autoCloseLog = [] } = await chrome.storage.local.get("autoCloseLog");
    await chrome.storage.local.set({ autoCloseLog: [...results, ...autoCloseLog].slice(0, 50) });
  }
  return results;
}

function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message });
}
