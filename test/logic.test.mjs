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
