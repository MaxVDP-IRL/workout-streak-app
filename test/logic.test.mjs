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
