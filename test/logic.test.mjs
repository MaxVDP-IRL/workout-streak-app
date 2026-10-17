import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../logic.js';

test('module loads', () => {
  assert.equal(logic.DAY_BOUNDARY_HOUR, 3);
});

test('effectiveDate: normal daytime is the calendar date', () => {
  assert.equal(logic.effectiveDate(new Date(2026, 7, 22, 9, 30)), '2026-08-22');
});

test('effectiveDate: 00:30 belongs to the previous day', () => {
  assert.equal(logic.effectiveDate(new Date(2026, 7, 22, 0, 30)), '2026-08-21');
});

test('effectiveDate: 03:00 exactly is the new day', () => {
  assert.equal(logic.effectiveDate(new Date(2026, 7, 22, 3, 0)), '2026-08-22');
});

test('addDays: adds and subtracts across month boundaries', () => {
  assert.equal(logic.addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(logic.addDays('2026-03-01', -1), '2026-02-28');
});

const S = (...dates) => dates.map(date => ({ date, sets: [{ kg: 60, reps: 8 }] }));

test('streak: empty history', () => {
  assert.deepEqual(logic.computeStreakState([], '2026-08-22'),
    { streak: 0, bestStreak: 0, shields: 0, shieldProgress: 0, todayDone: false });
});

test('streak: 3 consecutive days ending today', () => {
  const st = logic.computeStreakState(S('2026-08-20', '2026-08-21', '2026-08-22'), '2026-08-22');
  assert.equal(st.streak, 3);
  assert.equal(st.todayDone, true);
  assert.equal(st.shieldProgress, 3);
  assert.equal(st.shields, 0);
});

test('streak: today not yet done is not a penalty', () => {
  const st = logic.computeStreakState(S('2026-08-20', '2026-08-21'), '2026-08-22');
  assert.equal(st.streak, 2);
  assert.equal(st.todayDone, false);
});

test('shields: earned after 7 consecutive days, progress resets', () => {
  const days = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'];
  const st = logic.computeStreakState(S(...days), '2026-08-16');
  assert.equal(st.shields, 1);
  assert.equal(st.shieldProgress, 0);
  assert.equal(st.streak, 7);
});

test('shields: bank cap is 2, progress still resets at cap', () => {
  const days = [];
  for (let i = 0; i < 21; i++) days.push(logic.addDays('2026-08-01', i)); // 21 straight days
  const st = logic.computeStreakState(S(...days), '2026-08-21');
  assert.equal(st.shields, 2);        // third earn hits the cap
  assert.equal(st.shieldProgress, 0); // but progress still resets
  assert.equal(st.streak, 21);
});

test('shields: a miss burns a shield, streak survives, progress resets', () => {
  const days = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16',
                /* 17th missed */ '2026-08-18'];
  const st = logic.computeStreakState(S(...days), '2026-08-18');
  assert.equal(st.shields, 0);       // earned on the 16th, burned on the 17th
  assert.equal(st.streak, 8);        // 7 + the 18th; the covered 17th does not increment
  assert.equal(st.shieldProgress, 1); // only the 18th counts toward the next shield
});

test('streak: a miss with no shields resets to 0, best streak is kept', () => {
  const days = ['2026-08-10','2026-08-11','2026-08-12', /* 13th missed */ '2026-08-14'];
  const st = logic.computeStreakState(S(...days), '2026-08-14');
  assert.equal(st.streak, 1);
  assert.equal(st.bestStreak, 3);
});

test('streak: two consecutive misses with one shield resets (shield covers only one)', () => {
  const days = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16',
                /* 17th, 18th missed */ '2026-08-19'];
  const st = logic.computeStreakState(S(...days), '2026-08-19');
  assert.equal(st.shields, 0);
  assert.equal(st.streak, 1);   // shield covered the 17th; the 18th killed the streak
  assert.equal(st.bestStreak, 7);
});

test('sessionVolume: sum of kg*reps over sets', () => {
  const s = { date: '2026-08-22', sets: [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }, { kg: 50, reps: 10 }] };
  assert.equal(logic.sessionVolume(s), 60 * 8 + 60 * 8 + 50 * 10);
});

test('computeTonnage: sum over all sessions, 0 when empty', () => {
  const sessions = [
    { date: '2026-08-21', sets: [{ kg: 60, reps: 8 }] },
    { date: '2026-08-22', sets: [{ kg: 60, reps: 10 }] },
  ];
  assert.equal(logic.computeTonnage(sessions), 480 + 600);
  assert.equal(logic.computeTonnage([]), 0);
});

test('computePRs: heaviest weight and biggest session volume', () => {
  const sessions = [
    { date: '2026-08-20', sets: [{ kg: 60, reps: 8 }, { kg: 65, reps: 5 }] }, // vol 805
    { date: '2026-08-21', sets: [{ kg: 62, reps: 8 }, { kg: 62, reps: 8 }] }, // vol 992
  ];
  assert.deepEqual(logic.computePRs(sessions), { maxWeight: 65, maxSessionVolume: 992 });
  assert.deepEqual(logic.computePRs([]), { maxWeight: 0, maxSessionVolume: 0 });
});

test('rankFor: thresholds and next rank', () => {
  assert.equal(logic.rankFor(0).name, 'Novice');
  assert.equal(logic.rankFor(4999).name, 'Novice');
  assert.equal(logic.rankFor(5000).name, 'Apprentice');
  assert.equal(logic.rankFor(5000).next.name, 'Iron Worker');
  assert.equal(logic.rankFor(9999999).name, 'Titan');
  assert.equal(logic.rankFor(9999999).next, null);
});

test('equivalencesFor: returns only unlocked, in ascending order', () => {
  const eq = logic.equivalencesFor(13000);
  assert.equal(eq.length, 4); // small car, SUV, elephant, city bus
  assert.equal(eq[eq.length - 1].label, 'a city bus');
  assert.deepEqual(logic.equivalencesFor(0), []);
});

test('weeklyVolumes: buckets Monday-start weeks, newest last', () => {
  // 2026-08-22 is a Saturday; that week's Monday is 2026-08-17.
  const sessions = [
    { date: '2026-08-18', sets: [{ kg: 50, reps: 10 }] }, // this week: 500
    { date: '2026-08-13', sets: [{ kg: 60, reps: 10 }] }, // last week: 600
  ];
  const weeks = logic.weeklyVolumes(sessions, '2026-08-22', 3);
  assert.equal(weeks.length, 3);
  assert.deepEqual(weeks[2], { weekStart: '2026-08-17', volume: 500 });
  assert.deepEqual(weeks[1], { weekStart: '2026-08-10', volume: 600 });
  assert.deepEqual(weeks[0], { weekStart: '2026-08-03', volume: 0 });
});

test('heatmapData: one entry per day ending today, done flags set', () => {
  const sessions = [{ date: '2026-08-21', sets: [{ kg: 50, reps: 10 }] }];
  const map = logic.heatmapData(sessions, '2026-08-22', 7);
  assert.equal(map.length, 7);
  assert.deepEqual(map[6], { date: '2026-08-22', done: false });
  assert.deepEqual(map[5], { date: '2026-08-21', done: true });
  assert.equal(map[0].date, '2026-08-16');
});

test('validateBackup: accepts a well-formed backup', () => {
  const ok = logic.validateBackup({
    sessions: [{ date: '2026-08-22', sets: [{ kg: 60, reps: 8 }] }],
    settings: { sets: 3, kg: 60, reps: 8 },
  });
  assert.deepEqual(ok, { ok: true });
});

test('validateBackup: rejects garbage', () => {
  assert.equal(logic.validateBackup(null).ok, false);
  assert.equal(logic.validateBackup({}).ok, false);
  assert.equal(logic.validateBackup({ sessions: 'nope' }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [{ date: 'someday', sets: [{ kg: 60, reps: 8 }] }] }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [{ date: '2026-08-22', sets: [] }] }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [{ date: '2026-08-22', sets: [{ kg: '60', reps: 8 }] }] }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [{ date: '2026-08-22', sets: [{ kg: 60, reps: 0 }] }] }).ok, false);
});

test('validateBackup: accepts a v1 backup with no planks key', () => {
  const ok = logic.validateBackup({
    sessions: [{ date: '2026-08-22', sets: [{ kg: 60, reps: 8 }] }],
    settings: { sets: 3, kg: 60, reps: 8 },
  });
  assert.deepEqual(ok, { ok: true });
});

test('validateBackup: accepts a well-formed planks array', () => {
  const ok = logic.validateBackup({
    sessions: [],
    planks: [{ date: '2026-08-22', seconds: 60 }],
  });
  assert.deepEqual(ok, { ok: true });
});

test('validateBackup: rejects malformed planks', () => {
  assert.equal(logic.validateBackup({ sessions: [], planks: {} }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [], planks: [{ date: 'nope', seconds: 60 }] }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [], planks: [{ date: '2026-08-22', seconds: 0 }] }).ok, false);
  assert.equal(logic.validateBackup({ sessions: [], planks: [{ date: '2026-08-22', seconds: 'abc' }] }).ok, false);
});

// ---------- Plank ----------

test('plankRequired: false with no cutover date set — protects all historical days', () => {
  assert.equal(logic.plankRequired('2026-09-17', undefined), false);
  assert.equal(logic.plankRequired('2026-09-17', null), false);
  assert.equal(logic.plankRequired('2026-09-17', ''), false);
});

test('plankRequired: true on and after the cutover date, false before', () => {
  assert.equal(logic.plankRequired('2026-09-16', '2026-09-17'), false);
  assert.equal(logic.plankRequired('2026-09-17', '2026-09-17'), true);
  assert.equal(logic.plankRequired('2026-09-18', '2026-09-17'), true);
});

test('plankedOn: requires a qualifying entry on that exact date', () => {
  assert.equal(logic.plankedOn([], '2026-09-17'), false);
  assert.equal(logic.plankedOn([{ date: '2026-09-17', seconds: 3 }], '2026-09-17'), false);
  assert.equal(logic.plankedOn([{ date: '2026-09-17', seconds: 30 }], '2026-09-17'), true);
  assert.equal(logic.plankedOn([{ date: '2026-09-16', seconds: 30 }], '2026-09-17'), false);
});

test('plankSecondsOn: sums multiple entries on the same date', () => {
  const planks = [
    { date: '2026-09-17', seconds: 30 },
    { date: '2026-09-17', seconds: 45 },
    { date: '2026-09-16', seconds: 60 },
  ];
  assert.equal(logic.plankSecondsOn(planks, '2026-09-17'), 75);
});

test('plankTotals: empty log is all zeros', () => {
  assert.deepEqual(logic.plankTotals([]), { totalSeconds: 0, longest: 0, count: 0, dayCount: 0 });
});

test('plankTotals: longest is the max single run, dayCount dedupes', () => {
  const planks = [
    { date: '2026-09-16', seconds: 40 },
    { date: '2026-09-17', seconds: 90 },
    { date: '2026-09-17', seconds: 30 },
  ];
  const t = logic.plankTotals(planks);
  assert.equal(t.totalSeconds, 160);
  assert.equal(t.longest, 90);
  assert.equal(t.count, 3);
  assert.equal(t.dayCount, 2);
});

test('breakdownDuration: boundary values', () => {
  assert.deepEqual(logic.breakdownDuration(0), { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 });
  assert.deepEqual(logic.breakdownDuration(59), { days: 0, hours: 0, minutes: 0, seconds: 59, totalSeconds: 59 });
  assert.deepEqual(logic.breakdownDuration(60), { days: 0, hours: 0, minutes: 1, seconds: 0, totalSeconds: 60 });
  assert.deepEqual(logic.breakdownDuration(3599), { days: 0, hours: 0, minutes: 59, seconds: 59, totalSeconds: 3599 });
  assert.deepEqual(logic.breakdownDuration(3600), { days: 0, hours: 1, minutes: 0, seconds: 0, totalSeconds: 3600 });
  assert.deepEqual(logic.breakdownDuration(86399), { days: 0, hours: 23, minutes: 59, seconds: 59, totalSeconds: 86399 });
  assert.deepEqual(logic.breakdownDuration(86400), { days: 1, hours: 0, minutes: 0, seconds: 0, totalSeconds: 86400 });
  assert.deepEqual(logic.breakdownDuration(90061), { days: 1, hours: 1, minutes: 1, seconds: 1, totalSeconds: 90061 });
});

test('formatClock: m:ss under an hour, h:mm:ss past it', () => {
  assert.equal(logic.formatClock(0), '0:00');
  assert.equal(logic.formatClock(9), '0:09');
  assert.equal(logic.formatClock(65), '1:05');
  assert.equal(logic.formatClock(3600), '1:00:00');
  assert.equal(logic.formatClock(90061), '25:01:01');
});

test('formatDurationLong: drops leading zero units', () => {
  assert.equal(logic.formatDurationLong(9), '09s');
  assert.equal(logic.formatDurationLong(65), '1m 05s');
  assert.equal(logic.formatDurationLong(3661), '1h 1m 01s');
  assert.equal(logic.formatDurationLong(90061), '1d 1h 1m 01s');
});

// ---------- Backfill ----------

const bench = (date, sets = [{ kg: 60, reps: 8 }]) => ({ date, sets, completedAt: `at-${date}` });

test('canLogDate: today and the past are loggable, the future is not', () => {
  assert.equal(logic.canLogDate('2026-08-22', '2026-08-22'), true);
  assert.equal(logic.canLogDate('2026-08-21', '2026-08-22'), true);
  assert.equal(logic.canLogDate('2026-08-23', '2026-08-22'), false);
  assert.equal(logic.canLogDate('2026-8-22', '2026-08-22'), false);
  assert.equal(logic.canLogDate('2026-08-22', 'tomorrow'), false);
});

test('backfill: a missed day later filled in counts as done and restores the streak', () => {
  const today = '2026-08-14';
  const logged = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-14']; // 13th missing
  const before = logic.computeStreakState(S(...logged), today);
  assert.equal(before.streak, 1);
  assert.equal(before.bestStreak, 3);

  const filled = logic.applyBackfill(S(...logged), today, bench('2026-08-13'));
  assert.equal(filled.ok, true);
  assert.equal(filled.created, true);
  const after = logic.computeStreakState(filled.sessions, today);
  assert.equal(after.streak, 5);
  assert.equal(after.bestStreak, 5);
  assert.equal(after.todayDone, true);
  assert.deepEqual(filled.sessions.map(s => s.date), [...logged, '2026-08-13']);
});

test('backfill: filling the day a shield covered gives the shield back', () => {
  const today = '2026-08-18';
  const logged = [];
  for (let i = 0; i < 7; i++) logged.push(logic.addDays('2026-08-10', i)); // 10th–16th, shield earned
  const before = logic.computeStreakState(S(...logged), today);
  assert.equal(before.shields, 0); // burned covering the 17th
  assert.equal(before.streak, 7);
  assert.equal(before.todayDone, false);

  const filled = logic.applyBackfill(S(...logged), today, bench('2026-08-17'));
  const after = logic.computeStreakState(filled.sessions, today);
  assert.equal(after.shields, 1);
  assert.equal(after.shieldProgress, 1); // only the 17th; the earn on the 16th reset progress
  assert.equal(after.streak, 8);
  assert.equal(after.todayDone, false);
});

test('backfill: repairing one of two misses keeps the shield burn on the day still empty', () => {
  const today = '2026-08-19';
  const logged = [];
  for (let i = 0; i < 7; i++) logged.push(logic.addDays('2026-08-10', i)); // 10th–16th
  logged.push('2026-08-19');
  const before = logic.computeStreakState(S(...logged), today);
  assert.equal(before.streak, 1);
  assert.equal(before.bestStreak, 7);
  assert.equal(before.shields, 0);

  const filled = logic.applyBackfill(S(...logged), today, bench('2026-08-18'));
  const after = logic.computeStreakState(filled.sessions, today);
  // Shield still covers the empty 17th and is spent. 18th and 19th extend the streak.
  assert.equal(after.shields, 0);
  assert.equal(after.streak, 9);
  assert.equal(after.bestStreak, 9);
  assert.equal(after.shieldProgress, 2);
});

test('backfill: a gap inside a two-shield run earns both shields once the gap is filled', () => {
  const today = '2026-08-14';
  const logged = [];
  for (let i = 0; i < 14; i++) {
    const date = logic.addDays('2026-08-01', i);
    if (date !== '2026-08-07') logged.push(date);
  }
  const before = logic.computeStreakState(S(...logged), today);
  assert.equal(before.shields, 1);
  assert.equal(before.streak, 7);

  const filled = logic.applyBackfill(S(...logged), today, bench('2026-08-07'));
  const after = logic.computeStreakState(filled.sessions, today);
  assert.equal(after.shields, 2);
  assert.equal(after.shieldProgress, 0);
  assert.equal(after.streak, 14);
  assert.equal(after.bestStreak, 14);
});

test('backfill: updating a logged day replaces its sets once and leaves the rest of the log', () => {
  const kept = { date: '2026-08-20', sets: [{ kg: 40, reps: 8 }], completedAt: 'keep', note: 'original' };
  const target = { date: '2026-08-21', sets: [{ kg: 50, reps: 8 }], completedAt: 'original-time', extra: true };
  const duplicate = { date: '2026-08-21', sets: [{ kg: 30, reps: 5 }], completedAt: 'second' };
  const sessions = [kept, target, duplicate];

  const updated = logic.applyBackfill(sessions, '2026-08-22', {
    date: '2026-08-21',
    sets: [{ kg: 70, reps: 5 }, { kg: 70, reps: 5 }],
    completedAt: 'should-not-replace',
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.created, false);
  assert.equal(updated.sessions.length, 3);
  assert.equal(updated.sessions[0], kept);
  assert.notEqual(updated.sessions[1], target);
  assert.equal(updated.sessions[1].completedAt, 'original-time');
  assert.equal(updated.sessions[1].extra, true);
  assert.deepEqual(updated.sessions[1].sets, [{ kg: 70, reps: 5 }, { kg: 70, reps: 5 }]);
  assert.equal(updated.sessions[2], duplicate);
  assert.deepEqual(target.sets, [{ kg: 50, reps: 8 }]);

  assert.equal(logic.computeTonnage(updated.sessions), 40 * 8 + 70 * 5 + 70 * 5 + 30 * 5);
  const streak = logic.computeStreakState(updated.sessions, '2026-08-22');
  assert.equal(streak.streak, 2);
  assert.equal(streak.todayDone, false);

  const again = logic.applyBackfill(updated.sessions, '2026-08-22', bench('2026-08-21'));
  assert.equal(again.created, false);
  assert.equal(again.sessions.length, 3);
});

test('backfill: a future day is rejected and the log is left untouched', () => {
  const sessions = S('2026-08-22');
  const rejected = logic.applyBackfill(sessions, '2026-08-22', bench('2026-08-23'));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.sessions, sessions);
  assert.equal(logic.computeStreakState(rejected.sessions, '2026-08-22').streak, 1);
  assert.deepEqual(logic.applyBackfill(sessions, '2026-08-22', { date: '2026-08-21', sets: [] }), {
    ok: false,
    error: 'Need at least one set',
    sessions,
  });
  assert.equal(logic.applyBackfill(sessions, '2026-08-22', {
    date: '2026-08-21',
    sets: [{ kg: 60, reps: 0 }],
  }).ok, false);
});

test('backfill: logging today marks today done and is allowed', () => {
  const filled = logic.applyBackfill([], '2026-08-22', bench('2026-08-22'));
  assert.equal(filled.ok, true);
  assert.equal(filled.created, true);
  const streak = logic.computeStreakState(filled.sessions, '2026-08-22');
  assert.equal(streak.todayDone, true);
  assert.equal(streak.streak, 1);
  assert.equal(filled.sessions[0].completedAt, 'at-2026-08-22');
});

test('backfill: stats derived from the log include the filled-in day', () => {
  const today = '2026-08-22'; // Saturday; this Monday is 2026-08-17
  const existing = [{ date: '2026-08-20', sets: [{ kg: 40, reps: 10 }] }]; // Thursday, 400
  const filled = logic.applyBackfill(existing, today, {
    date: '2026-08-21',
    sets: [{ kg: 55, reps: 8 }],
    completedAt: 'later',
  });
  assert.equal(logic.computeTonnage(filled.sessions), 400 + 440);
  assert.deepEqual(logic.computePRs(filled.sessions), { maxWeight: 55, maxSessionVolume: 440 });

  const weeks = logic.weeklyVolumes(filled.sessions, today, 1);
  assert.deepEqual(weeks[0], { weekStart: '2026-08-17', volume: 840 });

  const heat = logic.heatmapData(filled.sessions, today, 3);
  assert.deepEqual(heat, [
    { date: '2026-08-20', done: true },
    { date: '2026-08-21', done: true },
    { date: '2026-08-22', done: false },
  ]);
});

test('dayRequirementsMet: bench alone completes a day before the plank cutover', () => {
  assert.equal(logic.dayRequirementsMet('2026-09-16', true, [], '2026-09-17'), true);
  assert.equal(logic.dayRequirementsMet('2026-09-16', false, [], '2026-09-17'), false);
  assert.equal(logic.dayRequirementsMet('2026-09-16', true, [], undefined), true);
});

test('dayRequirementsMet: on and after the cutover a plank is required before the day counts', () => {
  const date = '2026-09-17';
  const from = '2026-09-17';
  assert.equal(logic.dayRequirementsMet(date, true, [], from), false);
  assert.equal(logic.dayRequirementsMet(date, true, [{ date, seconds: 3 }], from), false);

  const added = logic.appendPlank([], '2026-09-18', { date, seconds: 45, completedAt: 'p' });
  assert.equal(added.ok, true);
  assert.equal(logic.dayRequirementsMet(date, true, added.planks, from), true);
  assert.equal(logic.dayRequirementsMet(date, false, added.planks, from), false);

  const sessions = logic.applyBackfill([], '2026-09-18', bench(date));
  const streak = logic.computeStreakState(sessions.sessions, '2026-09-18');
  assert.equal(streak.streak, 1);
  assert.equal(streak.todayDone, false);
  assert.equal(streak.shields, 0);
});

test('appendPlank: past and today append, future and short planks do not change the log', () => {
  const existing = [{ date: '2026-09-16', seconds: 30, completedAt: 'old' }];
  const added = logic.appendPlank(existing, '2026-09-18', {
    date: '2026-09-17',
    seconds: 50,
    completedAt: 'new',
  });
  assert.equal(added.ok, true);
  assert.equal(added.planks.length, 2);
  assert.equal(added.planks[0], existing[0]);
  assert.deepEqual(added.planks[1], { date: '2026-09-17', seconds: 50, completedAt: 'new' });
  assert.equal(existing.length, 1);

  const future = logic.appendPlank(existing, '2026-09-18', { date: '2026-09-19', seconds: 50 });
  assert.equal(future.ok, false);
  assert.equal(future.planks, existing);
  const tooShort = logic.appendPlank(existing, '2026-09-18', { date: '2026-09-17', seconds: 4 });
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.planks, existing);
  assert.equal(logic.plankSecondsOn(existing, '2026-09-16'), 30);
});
