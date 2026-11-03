import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bindCarry, loadCarryKeys } from "../src/jira.js";
import { openStore } from "../src/store.js";

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

const file = join(process.cwd(), "data", "check-store.json");
const bad = join(process.cwd(), "data", "check-bad.json");
await rm(file, { force: true });
await rm(bad, { force: true });

try {
  let escaped = false;
  try {
    await openStore(join(process.cwd(), "state.json"));
  } catch (err) {
    escaped = String(err.message).includes("data/");
  }
  assert(escaped, "state file outside data/ is rejected");

  const store = await openStore(file);
  const secret = "SUPERSECRETVALUE123";
  await store.logEntries([
    { action: "close", key: "ABC-1", summary: "ok", token: secret, at: "2026-11-03T10:00:00.000Z" },
  ]);
  const raw = await readFile(file, "utf8");
  assert(!raw.includes(secret), "token field is not stored");
  assert(!raw.includes("token"), "token key is not stored");

  await store.logEntries(
    Array.from({ length: 85 }, (_, i) => ({
      action: "close",
      key: "ABC-1",
      summary: String(i),
      at: "2026-11-03T10:00:00.000Z",
    })),
  );
  await store.logEntries([{ action: "close", key: "ABC-1", summary: "novo", at: "2026-11-03T10:01:00.000Z" }]);
  const limited = await store.get();
  eq(limited.autoCloseLog.length, 80, "log keeps 80 entries");
  eq(limited.autoCloseLog[0].summary, "novo", "newest entry stays first");

  await store.logAnomalyOnce({ key: "ABC-2", action: "anomaly", anomalies: ["sem-estimado"], summary: "x" });
  await store.logAnomalyOnce({ key: "ABC-2", action: "anomaly", anomalies: ["sem-estimado"], summary: "x" });
  eq((await store.get()).autoCloseLog.filter((entry) => entry.key === "ABC-2").length, 1, "anomaly once per day");

  await store.saveCarry(["ABC-12", "not-a-key", "ABC-12"]);
  bindCarry({
    load: () => store.loadCarry(),
    save: (keys) => store.saveCarry(keys),
  });
  eq((await loadCarryKeys()).join(","), "ABC-12", "carry keeps issue keys");

  await store.rememberTime("ABC-12", 1_700_000_000_000, 120);
  eq((await store.loadTimeState())["ABC-12"].accounted, 120, "cursor accounted");
  await store.clearTime("ABC-12");
  assert(!(await store.loadTimeState())["ABC-12"], "cursor cleared");

  await store.recordNotice({ action: "notice", key: "ABC-12", summary: "oi", delivered: false, error: "x" }, "stamp-1");
  eq((await store.get()).scheduleNotice.stamp, "stamp-1", "notice stamp");

  await writeFile(bad, "{", "utf8");
  if (process.platform !== "win32") await chmod(bad, 0o600);
  const broken = await openStore(bad);
  let corrupt = false;
  try {
    await broken.get();
  } catch (err) {
    corrupt = String(err.message).includes("corrompido");
  }
  assert(corrupt, "corrupt state is rejected");
} finally {
  await rm(file, { force: true });
  await rm(bad, { force: true });
  await rm(`${file}.${process.pid}.tmp`, { force: true });
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("store ok");
