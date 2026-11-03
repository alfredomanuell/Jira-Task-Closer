import {
  anomalyText,
  billableSeconds,
  classifyClose,
  idleWorkingSeconds,
  mergeManaged,
  noticeText,
  openedOutsideHours,
  shouldAutoClose,
  startDecision,
} from "../src/schedule.js";
import {
  isWithinWorkingHours,
  outsideSeconds,
  remainingSeconds,
  startOfWorkday,
  workPhase,
  workingSecondsBetween,
  workingSecondsRemainingToday,
  workingSlice,
} from "../src/time.js";

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

const DAY = 8 * 3600;
const winterStart = Date.parse("2026-11-03T07:30:00Z");
const winterEnd = Date.parse("2026-11-03T17:00:00Z");
const summerStart = Date.parse("2026-07-15T06:30:00Z");
const summerEnd = Date.parse("2026-07-15T16:00:00Z");

eq(workingSecondsBetween(winterStart, winterEnd), DAY, "winter day is 8h");
eq(workingSecondsBetween(summerStart, summerEnd), DAY, "summer day is 8h");
eq(workingSecondsBetween(Date.parse("2026-11-03T12:30:00Z"), Date.parse("2026-11-03T14:00:00Z")), 0, "lunch does not count");
eq(workingSecondsBetween(Date.parse("2026-11-07T07:30:00Z"), Date.parse("2026-11-07T17:00:00Z")), 0, "weekend does not count");
eq(startOfWorkday(winterStart), winterStart, "winter start");
eq(startOfWorkday(summerStart), summerStart, "summer start");

eq(isWithinWorkingHours(Date.parse("2026-11-03T07:30:00Z")), true, "07:30 inside");
eq(isWithinWorkingHours(Date.parse("2026-11-03T16:59:30Z")), true, "16:59 inside");
eq(isWithinWorkingHours(Date.parse("2026-11-03T17:00:00Z")), false, "17:00 outside");
eq(isWithinWorkingHours(Date.parse("2026-11-03T12:30:00Z")), false, "12:30 outside");
eq(isWithinWorkingHours(Date.parse("2026-11-03T13:00:00Z")), false, "lunch outside");
eq(isWithinWorkingHours(Date.parse("2026-07-15T15:59:00Z")), true, "summer 16:59 inside");
eq(isWithinWorkingHours(Date.parse("2026-07-15T16:00:00Z")), false, "summer 17:00 outside");
eq(workPhase(Date.parse("2026-11-03T16:59:30Z")), "afternoon", "16:59 phase");
eq(workPhase(Date.parse("2026-11-03T17:00:00Z")), "after", "17:00 phase");
eq(workPhase(Date.parse("2026-11-07T10:00:00Z")), "weekend", "saturday");
eq(workingSecondsRemainingToday(winterStart), DAY, "full day remaining at 07:30");
eq(workingSecondsRemainingToday(Date.parse("2026-11-03T12:30:00Z")), 3 * 3600, "afternoon remaining at lunch");
eq(workingSecondsRemainingToday(Date.parse("2026-11-03T16:59:00Z")), 60, "last minute");

const fourHours = {
  originalEstimate: 4 * 3600,
  timeSpent: 0,
  statusCategory: "indeterminate",
  inProgressSince: "2026-11-03T07:30:00.000Z",
};
eq(remainingSeconds(fourHours, Date.parse("2026-11-03T11:30:00Z")), 0, "4h task ends at 11:30");
eq(remainingSeconds(fourHours, Date.parse("2026-11-03T11:00:00Z")), 30 * 60, "4h task has 30m left at 11:00");

eq(shouldAutoClose({ remaining: 0, phase: "morning", remainingWorkday: 10000 }), true, "close when estimate ends");
eq(shouldAutoClose({ remaining: 30, phase: "morning", remainingWorkday: 10000 }), false, "do not close early");
eq(shouldAutoClose({ remaining: 30, phase: "afternoon", remainingWorkday: 90 }), false, "finish if it still fits");
eq(shouldAutoClose({ remaining: 300, phase: "afternoon", remainingWorkday: 40 }), false, "keep the partial task for the next day");
eq(shouldAutoClose({ remaining: 300, phase: "after", remainingWorkday: 0 }), false, "do not close after 16:59 while estimate remains");
eq(shouldAutoClose({ remaining: 300, phase: "lunch", remainingWorkday: 3 * 3600 }), false, "keep running through lunch");
eq(shouldAutoClose({ remaining: null, phase: "morning", remainingWorkday: 1000 }), false, "no estimate is not a timed close");

const onTime = classifyClose({ remaining: -30, phase: "morning", outsideSeconds: 0, manual: false });
eq(onTime.anomalies.length, 0, "30s lag is on time");

const early = classifyClose({ remaining: 600, phase: "morning", outsideSeconds: 0, manual: true });
assert(early.anomalies.includes("antecipado"), "manual early close is an occurrence");
eq(early.justification, "Fecho manual pelo utilizador.", "manual justification");

const endOfDay = classifyClose({ remaining: 600, phase: "afternoon", outsideSeconds: 0, manual: false });
assert(endOfDay.anomalies.includes("antecipado"), "end of day before estimate is early");
assert(endOfDay.justification.includes("16:59"), "end of day justification");

const lateWake = classifyClose({ remaining: -3600, phase: "after", outsideSeconds: 3600, manual: false });
assert(lateWake.anomalies.includes("fora-do-horario") && lateWake.anomalies.includes("atrasado"), "late wake is outside and late");

const pollLag = classifyClose({ remaining: -20, phase: "after", outsideSeconds: 30, manual: false });
eq(pollLag.anomalies.length, 0, "close just after 17:00 stays within grace");

const partial = startDecision({
  estimateSeconds: 6 * 3600,
  remainingWorkday: 2 * 3600,
  phase: "afternoon",
  idleWorkingSeconds: 0,
  hasNext: true,
});
eq(partial.start, true, "second 6h task starts with the 2h left");
eq(partial.partial, true, "the rest continues next day");
eq(partial.notify, false, "there is still a task, so the scrum master is not called");
eq(startDecision({
  estimateSeconds: 6 * 3600,
  remainingWorkday: 60,
  phase: "afternoon",
  idleWorkingSeconds: 0,
  hasNext: true,
}).start, false, "do not open a new task in the last minute");

const empty = startDecision({
  estimateSeconds: 0,
  remainingWorkday: DAY,
  phase: "morning",
  idleWorkingSeconds: 0,
  hasNext: false,
});
eq(empty.code, "no-tasks", "empty queue");
eq(noticeText(empty.code), "Não existem tarefas pendentes para dar continuidade ao trabalho.", "notice wording");

const lateStart = startDecision({
  estimateSeconds: 3600,
  remainingWorkday: 7 * 3600,
  phase: "morning",
  idleWorkingSeconds: 600,
  hasNext: true,
});
eq(lateStart.start, true, "late but fitting task still starts");
assert(lateStart.anomalies.includes("atrasado") && lateStart.anomalies.includes("inactividade"), "idle is recorded");

eq(startDecision({
  estimateSeconds: 3600,
  remainingWorkday: 0,
  phase: "lunch",
  idleWorkingSeconds: 0,
  hasNext: true,
}).notify, false, "no notice during lunch");

eq(idleWorkingSeconds(null, Date.parse("2026-11-03T07:32:00Z")), 120, "idle from 07:30");
eq(idleWorkingSeconds(Date.parse("2026-11-02T16:00:00Z"), Date.parse("2026-11-03T07:31:00Z")), 60, "yesterday close does not count overnight");
eq(openedOutsideHours("2026-11-03T12:45:00.000Z"), true, "opened at lunch");
eq(openedOutsideHours("2026-11-03T10:00:00.000Z"), false, "opened in the morning");

const resumed = {
  originalEstimate: 6 * 3600,
  timeSpent: 0,
  statusCategory: "indeterminate",
  inProgressSince: "2026-11-03T15:00:00.000Z",
};
const cursor = Date.parse("2026-11-03T17:00:00Z");
const nextMorning = Date.parse("2026-11-04T07:30:00Z");
eq(remainingSeconds(resumed, nextMorning, cursor, 2 * 3600), 4 * 3600, "next morning resumes with 4h");
eq(remainingSeconds(resumed, Date.parse("2026-11-04T11:30:00Z"), cursor, 2 * 3600), 0, "the 6h task finishes at 11:30");
eq(workingSlice(Date.parse("2026-11-03T15:00:00Z"), Date.parse("2026-11-03T17:30:00Z")).seconds, 2 * 3600, "two hours before 17:00");
eq(billableSeconds(2 * 3600), 2 * 3600, "bill 2h");
eq(billableSeconds(20), 0, "ignore seconds under half a minute");

const ordered = mergeManaged(
  ["B-2"],
  [{ key: "B-2", statusCategory: "indeterminate" }],
  [{ key: "A-1", statusCategory: "new" }, { key: "B-2", statusCategory: "indeterminate" }],
);
eq(ordered.map((issue) => issue.key).join(","), "B-2,A-1", "in progress stays ahead of the queue");

for (const code of ["no-tasks", "no-estimate", "no-estimate-active"]) {
  const text = noticeText(code);
  assert(text && text.length < 300 && !text.includes("<") && !/token|password/i.test(text), code);
}
eq(noticeText("other"), null, "unknown notice rejected");
eq(anomalyText(["fora-do-horario", "atrasado"]), "fora do horário, atrasado", "labels");
eq(outsideSeconds(Date.parse("2026-11-03T10:00:00Z")), 0, "inside distance");

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("schedule ok");
