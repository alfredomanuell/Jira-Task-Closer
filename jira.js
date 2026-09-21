const FIELDS = [
  "summary",
  "status",
  "assignee",
  "timeoriginalestimate",
  "timespent",
  "statuscategorychangedate",
].join(",");

export async function loadSettings() {
  const { jira } = await chrome.storage.sync.get("jira");
  if (!jira?.baseUrl || !jira.email || !jira.token) {
    throw new Error("Configura o URL do Jira, e-mail e API token nas opções.");
  }
  return jira;
}

async function api(settings, path, options = {}) {
  const res = await fetch(settings.baseUrl.replace(/\/+$/, "") + path, {
    ...options,
    headers: {
      Authorization: "Basic " + btoa(`${settings.email}:${settings.token}`),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (res.ok) return res.status === 204 ? null : res.json();

  let detail = "";
  try {
    const body = await res.json();
    detail = [...(body.errorMessages || []), ...Object.values(body.errors || {})].join("; ");
  } catch {}
  if (res.status === 401) detail ||= "Credenciais inválidas.";
  if (res.status === 403) detail ||= "Sem permissão.";
  throw new Error(`Jira ${res.status}${detail ? ": " + detail : ""}`);
}

function toIssue(raw) {
  const f = raw.fields || {};
  return {
    key: raw.key,
    summary: f.summary,
    status: f.status?.name,
    statusCategory: f.status?.statusCategory?.key,
    assignee: f.assignee?.displayName,
    assigneeId: f.assignee?.accountId,
    originalEstimate: f.timeoriginalestimate || 0,
    timeSpent: f.timespent || 0,
    inProgressSince: f.statuscategorychangedate || null,
  };
}

export function whoAmI(settings) {
  return api(settings, "/rest/api/3/myself");
}

export async function openIssues(settings) {
  const assignee = settings.targetAccountId
    ? `assignee = "${settings.targetAccountId}"`
    : "assignee = currentUser()";

  let extra = (settings.jql || "").trim();
  let order = "ORDER BY updated DESC";
  const orderMatch = extra.match(/\bORDER\s+BY\b.*$/i);
  if (orderMatch) {
    order = orderMatch[0];
    extra = extra.slice(0, orderMatch.index).trim();
  }

  const where = [assignee, "statusCategory != Done"];
  if (extra) where.push(`(${extra})`);

  const params = new URLSearchParams({
    jql: `${where.join(" AND ")} ${order}`,
    fields: FIELDS,
    maxResults: "50",
  });
  const data = await api(settings, `/rest/api/3/search/jql?${params}`);
  return (data.issues || []).map(toIssue);
}

export async function ownIssue(settings, key) {
  const issue = toIssue(await api(settings, `/rest/api/3/issue/${key}?fields=${FIELDS}`));
  const owner = settings.targetAccountId || (await whoAmI(settings)).accountId;
  if (issue.assigneeId !== owner) {
    throw new Error(`${key} está atribuída a ${issue.assignee || "ninguém"}, não a ti.`);
  }
  return issue;
}

export async function transitions(settings, key) {
  const data = await api(settings, `/rest/api/3/issue/${key}/transitions`);
  return (data.transitions || []).map((t) => ({
    id: t.id,
    name: t.name,
    toStatus: t.to?.name,
    isDone: t.to?.statusCategory?.key === "done",
  }));
}

const DONE_WORDS = ["done", "concluído", "concluido", "close", "fechar", "fechado", "resolve"];

function pickDone(list) {
  const done = list.filter((t) => t.isDone);
  for (const word of DONE_WORDS) {
    const hit = done.find((t) => t.name.toLowerCase().includes(word));
    if (hit) return hit;
  }
  return done[0];
}

export async function closeIssue(settings, key, transitionId) {
  await ownIssue(settings, key);
  const list = await transitions(settings, key);
  const target = (transitionId && list.find((t) => t.id === transitionId)) || pickDone(list);
  if (!target) throw new Error(`Nenhuma transição para "Concluído" disponível em ${key}.`);

  await api(settings, `/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: target.id } }),
  });
  return target;
}
