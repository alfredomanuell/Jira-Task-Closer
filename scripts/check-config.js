import { parseConfig, redact, resolveStatePath } from "../src/config.js";

let failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", message);
  }
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    failed += 1;
    console.error("FAIL", message, "expected", expected, "got", actual);
  }
}

function throws(fn, message) {
  try {
    fn();
    failed += 1;
    console.error("FAIL", message, "did not throw");
    return "";
  } catch (err) {
    return String(err.message || "");
  }
}

const token = "A".repeat(24);
const env = {
  JIRA_BASE_URL: "https://example.atlassian.net/jira/",
  JIRA_EMAIL: "conta@example.com",
  JIRA_API_TOKEN: token,
  JIRA_JQL: "project = APP",
  SCRUM_MASTER_EMAIL: "sm@example.com",
  AUTO_CLOSE: "false",
  STATE_PATH: "data/state.json",
};

const cfg = parseConfig(env, process.cwd());
eq(cfg.baseUrl, "https://example.atlassian.net/jira", "base url keeps the path and drops the trailing slash");
eq(cfg.email, "conta@example.com", "email");
eq(cfg.autoClose, false, "auto close off");
eq(cfg.jql, "project = APP", "jql");
eq(cfg.scrumMasterEmail, "sm@example.com", "scrum master");
assert(cfg.statePath.endsWith("state.json"), "state path");
assert(!cfg.statePath.includes(token), "state path has no token");

const secret = "TOKENTOKENTOKEN1234";
const httpError = throws(() =>
  parseConfig({ JIRA_BASE_URL: "http://evil.example", JIRA_EMAIL: "a@b.co", JIRA_API_TOKEN: secret }, process.cwd()),
);
assert(httpError.includes("https"), "http rejected");
assert(!httpError.includes(secret), "token stays out of the url error");

const userInfo = throws(() =>
  parseConfig(
    { JIRA_BASE_URL: "https://user:secret@example.atlassian.net", JIRA_EMAIL: "a@b.co", JIRA_API_TOKEN: token },
    process.cwd(),
  ),
);
assert(userInfo.includes("credenciais"), "userinfo rejected");
assert(!userInfo.includes("secret"), "userinfo is not echoed");

assert(throws(() => parseConfig({ ...env, JIRA_API_TOKEN: "short" }, process.cwd())).includes("JIRA_API_TOKEN"), "short token");
assert(throws(() => parseConfig({ ...env, JIRA_JQL: "a\nb" }, process.cwd())).includes("JIRA_JQL"), "jql control char");
assert(throws(() => parseConfig({ ...env, STATE_PATH: "../state.json" }, process.cwd())).includes("data/"), "path escape");
assert(throws(() => resolveStatePath("data/../state.json", process.cwd())).includes("data/"), "path escape inside data");
eq(redact(`falhou ${token} aqui`, [token]), "falhou [redigido] aqui", "redact");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("config ok");
