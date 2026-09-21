export function remainingSeconds(issue, now = Date.now()) {
  if (!issue.originalEstimate) return null;
  let elapsed = issue.timeSpent;
  if (issue.statusCategory === "indeterminate" && issue.inProgressSince) {
    elapsed += Math.max(0, (now - Date.parse(issue.inProgressSince)) / 1000);
  }
  return issue.originalEstimate - elapsed;
}

export function formatDuration(seconds) {
  const abs = Math.abs(Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const text = h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return seconds < 0 ? `-${text}` : text;
}
