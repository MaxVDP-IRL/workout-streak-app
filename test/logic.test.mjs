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
