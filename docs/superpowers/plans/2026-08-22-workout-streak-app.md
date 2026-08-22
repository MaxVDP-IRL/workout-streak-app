# Workout Streak App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-only, no-login, static web app that makes a daily 5–10 minute bench press habit addictive via streaks with earned shields and ever-climbing numbers.

**Architecture:** Vanilla ES-module SPA, no build step. All persistent state is `sessions` + `settings` in `localStorage`; every derived value (streak, shields, tonnage, PRs, rank) is recomputed from sessions on load by pure functions in `logic.js` (tested with `node --test`). `app.js` does UI wiring only. Note: the spec mentions a `shieldLedger`; this plan derives shields purely from session dates instead — same behavior, no extra stored state, and a day when the app is never opened still burns a shield correctly.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), hand-rolled SVG charts, Node built-in test runner (`node --test`), GitHub Pages, web manifest + service worker.

**Spec:** `docs/superpowers/specs/2026-08-22-workout-streak-app-design.md`

**File structure (final):**

```
index.html            — single page, 3 views (Today/Stats/Settings) + celebration overlay
style.css             — dark theme, one column, iPhone 13 mini (375pt) first
logic.js              — pure functions, no DOM, no localStorage (unit tested)
storage.js            — localStorage wrappers + backup export/import plumbing
app.js                — state, rendering, event wiring
sw.js                 — cache-first service worker
manifest.webmanifest  — home-screen install
icon.svg              — app icon (manifest)
tools/make-icon.html  — one-off page to generate apple-touch-icon.png in-browser
test/logic.test.mjs   — all logic tests
```

Target device: iPhone 13 mini Safari. Everything must work offline after first load. A normal day's logging must be ≤ ~4 taps.

---

### Task 1: Project scaffold

**Files:**
- Create: `index.html`, `style.css`, `logic.js`, `app.js`, `storage.js`, `test/logic.test.mjs`, `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Create `index.html`** (full shell now; views are filled by later tasks' render code)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#111318">
  <title>Bench</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header id="topbar">
    <div id="streak-box">
      <span id="streak-flame">🔥</span>
      <span id="streak-count">0</span>
    </div>
    <div id="shield-box" title="Shields"></div>
  </header>

  <main>
    <section id="view-today" class="view"></section>
    <section id="view-stats" class="view hidden"></section>
    <section id="view-settings" class="view hidden"></section>
  </main>

  <div id="celebration" class="hidden"></div>

  <nav id="tabbar">
    <button data-view="today" class="tab active">Today</button>
    <button data-view="stats" class="tab">Stats</button>
    <button data-view="settings" class="tab">Settings</button>
  </nav>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create empty module stubs** so the page loads without errors

`logic.js`:
```js
// Pure functions only. No DOM, no localStorage, no Date.now() except as default args.
export const DAY_BOUNDARY_HOUR = 3;
```

`storage.js`:
```js
const PREFIX = 'bench:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}
```

`app.js`:
```js
import * as logic from './logic.js';
import * as store from './storage.js';

// Filled in by later tasks.
console.log('app loaded');
```

`test/logic.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../logic.js';

test('module loads', () => {
  assert.equal(logic.DAY_BOUNDARY_HOUR, 3);
});
```

- [ ] **Step 4: Create `style.css`** (complete stylesheet for the whole app — later tasks only add markup that these classes already cover)

```css
:root {
  --bg: #111318;
  --surface: #1b1e26;
  --surface-2: #242834;
  --text: #f2f3f5;
  --text-dim: #9aa0ad;
  --accent: #ff8c32;      /* flame orange */
  --accent-2: #4cc9f0;    /* stat blue */
  --good: #3ddc84;
  --danger: #ff5d5d;
  --radius: 14px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body { height: 100%; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

#topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}

#streak-box { font-size: 28px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
#streak-count { font-variant-numeric: tabular-nums; }
#shield-box { font-size: 22px; letter-spacing: 4px; min-height: 28px; }
.shield-slot-empty { opacity: 0.25; }

main { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.view.hidden { display: none; }

h2 { font-size: 15px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; }

.card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px;
  margin-bottom: 10px;
}

/* ---- Today: set rows ---- */
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin-bottom: 10px;
}
.set-row.done { opacity: 0.55; }
.set-values { display: flex; align-items: center; gap: 4px; font-size: 17px; font-weight: 600; }
.set-values .unit { color: var(--text-dim); font-size: 13px; font-weight: 400; }

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.stepper button {
  width: 34px; height: 34px;
  border: none; border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 20px; font-weight: 700;
}
.stepper .val { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }

.check-btn {
  width: 54px; height: 54px;
  border: none; border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 26px;
  flex-shrink: 0;
}
.check-btn.checked { background: var(--good); color: #06220f; }

#today-status { text-align: center; color: var(--text-dim); font-size: 14px; margin: 10px 0; }
#today-status.done-msg { color: var(--good); font-weight: 600; }

.tonnage-ticker {
  text-align: center;
  margin-top: 18px;
}
.tonnage-ticker .big {
  font-size: 34px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.tonnage-ticker .label { color: var(--text-dim); font-size: 13px; }

.comeback { text-align: center; color: var(--accent); font-weight: 600; margin: 8px 0; }

/* ---- Celebration overlay ---- */
#celebration {
  position: fixed; inset: 0;
  background: rgba(10, 11, 14, 0.96);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  gap: 18px; text-align: center; padding: 24px;
  z-index: 10;
}
#celebration.hidden { display: none; }
#celebration .streak-big { font-size: 64px; font-weight: 900; }
#celebration .tonnage-roll { font-size: 40px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
#celebration .sub { color: var(--text-dim); }
.badge {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 12px 16px;
  font-weight: 600;
  animation: pop 0.35s ease-out;
}
@keyframes pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#celebration .close-btn {
  margin-top: 8px;
  padding: 14px 40px;
  font-size: 17px; font-weight: 700;
  border: none; border-radius: var(--radius);
  background: var(--accent); color: #1a0d00;
}

/* ---- Stats ---- */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-grid .card { margin-bottom: 0; }
.stat-num { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 12px; color: var(--text-dim); }
.rank-name { font-size: 20px; font-weight: 800; color: var(--accent-2); }
.rank-bar { height: 8px; background: var(--surface-2); border-radius: 4px; margin-top: 8px; overflow: hidden; }
.rank-bar > div { height: 100%; background: var(--accent-2); }
svg.chart { width: 100%; height: auto; display: block; }
.equiv-list li { list-style: none; padding: 4px 0; }
.equiv-list .locked { color: var(--text-dim); opacity: 0.5; }

/* ---- Settings ---- */
.settings-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--surface-2);
}
.wide-btn {
  width: 100%; padding: 14px;
  margin-top: 10px;
  font-size: 16px; font-weight: 600;
  border: none; border-radius: var(--radius);
  background: var(--surface-2); color: var(--text);
}
.wide-btn.danger { color: var(--danger); }
.hint { font-size: 12px; color: var(--text-dim); margin-top: 6px; }

/* ---- Tab bar ---- */
#tabbar {
  display: flex;
  border-top: 1px solid var(--surface-2);
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--bg);
}
#tabbar .tab {
  flex: 1; padding: 12px 0;
  background: none; border: none;
  color: var(--text-dim);
  font-size: 14px; font-weight: 600;
}
#tabbar .tab.active { color: var(--accent); }
```

- [ ] **Step 5: Run the test scaffold**

Run: `node --test test/`
Expected: 1 test, PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: project scaffold (shell, styles, module stubs, test runner)"
```

---

### Task 2: Date logic — `effectiveDate` and `addDays`

The 3 a.m. day boundary: any time before 3:00 a.m. belongs to the previous calendar day.

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append to `test/logic.test.mjs`)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `logic.effectiveDate is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export function effectiveDate(now = new Date()) {
  const shifted = new Date(now.getTime() - DAY_BOUNDARY_HOUR * 3600 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: 3am-boundary effectiveDate and addDays"
```

---

### Task 3: Streak & shield computation

The heart of the app. Rules (from spec): streak = consecutive completed days; 7 consecutive completed days earn 1 shield (bank cap 2, progress resets to 0 on earn even at cap); a missed past day burns a shield if available (streak survives, shield progress resets to 0), otherwise streak resets to 0; a not-yet-completed *today* is never a penalty; shield-covered days do not count toward earning the next shield.

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append; the helper builds minimal sessions from date strings)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `computeStreakState is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export const SHIELD_EARN_DAYS = 7;
export const SHIELD_CAP = 2;

export function computeStreakState(sessions, todayStr) {
  const done = new Set(sessions.map(s => s.date));
  const out = { streak: 0, bestStreak: 0, shields: 0, shieldProgress: 0, todayDone: done.has(todayStr) };
  if (done.size === 0) return out;

  const first = [...done].sort()[0];
  let streak = 0, best = 0, shields = 0, progress = 0;

  for (let d = first; d <= todayStr; d = addDays(d, 1)) {
    if (done.has(d)) {
      streak += 1;
      progress += 1;
      if (progress === SHIELD_EARN_DAYS) {
        if (shields < SHIELD_CAP) shields += 1;
        progress = 0;
      }
      if (streak > best) best = streak;
    } else if (d !== todayStr) {
      if (shields > 0) {
        shields -= 1;
        progress = 0;
      } else {
        streak = 0;
        progress = 0;
      }
    }
  }

  out.streak = streak;
  out.bestStreak = best;
  out.shields = shields;
  out.shieldProgress = progress;
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS. If any fail, fix `computeStreakState` — the tests encode the spec and are correct.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: streak and earned-shield computation"
```

---

### Task 4: Tonnage and PRs

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `sessionVolume is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export function sessionVolume(session) {
  return session.sets.reduce((sum, s) => sum + s.kg * s.reps, 0);
}

export function computeTonnage(sessions) {
  return sessions.reduce((sum, s) => sum + sessionVolume(s), 0);
}

export function computePRs(sessions) {
  let maxWeight = 0, maxSessionVolume = 0;
  for (const s of sessions) {
    for (const set of s.sets) if (set.kg > maxWeight) maxWeight = set.kg;
    const vol = sessionVolume(s);
    if (vol > maxSessionVolume) maxSessionVolume = vol;
  }
  return { maxWeight, maxSessionVolume };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: tonnage and PR computation"
```

---

### Task 5: Ranks and equivalences

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `rankFor is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export const RANKS = [
  { threshold: 0,      name: 'Novice' },
  { threshold: 5000,   name: 'Apprentice' },
  { threshold: 15000,  name: 'Iron Worker' },
  { threshold: 35000,  name: 'Press Warden' },
  { threshold: 70000,  name: 'Steel Veteran' },
  { threshold: 120000, name: 'Iron Champion' },
  { threshold: 200000, name: 'Bench Master' },
  { threshold: 350000, name: 'Titan' },
];

export function rankFor(tonnage) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (tonnage >= RANKS[i].threshold) idx = i;
  return { ...RANKS[idx], next: RANKS[idx + 1] ?? null };
}

export const EQUIVALENCES = [
  { kg: 1000,    label: 'a small car' },
  { kg: 3000,    label: 'a full-size SUV' },
  { kg: 6000,    label: 'an African elephant' },
  { kg: 12000,   label: 'a city bus' },
  { kg: 25000,   label: 'a fire truck' },
  { kg: 40000,   label: 'a loaded semi-truck' },
  { kg: 75000,   label: 'a Boeing 737' },
  { kg: 150000,  label: 'a blue whale' },
  { kg: 225000,  label: 'the Statue of Liberty' },
  { kg: 440000,  label: 'a fully loaded Boeing 747' },
  { kg: 1000000, label: 'a small ferry' },
];

export function equivalencesFor(tonnage) {
  return EQUIVALENCES.filter(e => tonnage >= e.kg);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: rank thresholds and tonnage equivalences"
```

---

### Task 6: Chart data — weekly volumes and heatmap

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `weeklyVolumes is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export function weeklyVolumes(sessions, todayStr, weeks = 8) {
  const volByDate = {};
  for (const s of sessions) volByDate[s.date] = (volByDate[s.date] ?? 0) + sessionVolume(s);

  const [y, m, d] = todayStr.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = addDays(todayStr, -dow);

  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = addDays(thisMonday, -7 * w);
    let volume = 0;
    for (let i = 0; i < 7; i++) volume += volByDate[addDays(weekStart, i)] ?? 0;
    out.push({ weekStart, volume });
  }
  return out;
}

export function heatmapData(sessions, todayStr, days = 112) {
  const done = new Set(sessions.map(s => s.date));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayStr, -i);
    out.push({ date, done: done.has(date) });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: weekly volume and heatmap chart data"
```

---

### Task 7: Backup validation

**Files:**
- Modify: `logic.js`
- Test: `test/logic.test.mjs`

- [ ] **Step 1: Write failing tests** (append)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `validateBackup is not a function`.

- [ ] **Step 3: Implement** (append to `logic.js`)

```js
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Not a backup object' };
  if (!Array.isArray(obj.sessions)) return { ok: false, error: 'Missing sessions array' };
  for (const s of obj.sessions) {
    if (!s || typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      return { ok: false, error: 'Bad session date' };
    }
    if (!Array.isArray(s.sets) || s.sets.length === 0) return { ok: false, error: 'Bad session sets' };
    for (const set of s.sets) {
      if (!set || typeof set.kg !== 'number' || typeof set.reps !== 'number' || set.kg < 0 || set.reps <= 0) {
        return { ok: false, error: 'Bad set values' };
      }
    }
  }
  if (obj.settings !== undefined && (typeof obj.settings !== 'object' || obj.settings === null)) {
    return { ok: false, error: 'Bad settings' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.mjs
git commit -m "feat: backup validation"
```

---

### Task 8: App state, draft handling, and Today view

From here on, work is UI wiring — no unit tests, verified in the browser. Serve locally with `npx serve .` (or any static server) and open on desktop first; phone QA is Task 12.

**Files:**
- Modify: `app.js` (replace the stub entirely with the code below)

- [ ] **Step 1: Write `app.js` — state, draft, Today rendering, set completion**

```js
import * as logic from './logic.js';
import * as store from './storage.js';

// ---------- State ----------
const DEFAULT_SETTINGS = { sets: 3, kg: 40, reps: 8 };

let sessions = store.load('sessions', []);
let settings = { ...DEFAULT_SETTINGS, ...store.load('settings', {}) };
let today = logic.effectiveDate();
let draft = loadDraft();

function loadDraft() {
  const d = store.load('draft', null);
  if (d && d.date === today) return d;
  // Fresh draft: pre-fill from the most recent session, else settings defaults.
  const last = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const template = last
    ? last.sets.map(s => ({ kg: s.kg, reps: s.reps, done: false }))
    : Array.from({ length: settings.sets }, () => ({ kg: settings.kg, reps: settings.reps, done: false }));
  return { date: today, sets: template };
}

function persist() {
  store.save('sessions', sessions);
  store.save('settings', settings);
  store.save('draft', draft);
}

// Recheck the date whenever the app is foregrounded (iOS keeps PWAs alive for days).
function refreshDay() {
  const now = logic.effectiveDate();
  if (now !== today) {
    today = now;
    draft = loadDraft();
    renderAll();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshDay();
});

// ---------- Rendering ----------
const $ = sel => document.querySelector(sel);

function renderAll() {
  renderTopbar();
  renderToday();
  renderStats();
  renderSettings();
}

function renderTopbar() {
  const st = logic.computeStreakState(sessions, today);
  $('#streak-count').textContent = st.streak;
  $('#streak-flame').style.filter = st.todayDone ? 'none' : 'grayscale(1)';
  $('#shield-box').innerHTML =
    '🛡'.repeat(st.shields) +
    `<span class="shield-slot-empty">${'🛡'.repeat(logic.SHIELD_CAP - st.shields)}</span>`;
}

function renderToday() {
  const view = $('#view-today');
  const st = logic.computeStreakState(sessions, today);
  const tonnage = logic.computeTonnage(sessions);
  const doneCount = draft.sets.filter(s => s.done).length;

  let html = '';

  // Comeback framing after a reset (had history, streak is now small).
  if (!st.todayDone && st.streak === 0 && st.bestStreak > 0) {
    html += `<p class="comeback">Day 1 of the rebuild. Best: ${st.bestStreak} days — go take it back.</p>`;
  }

  // Plain-spoken shield-burn notice: yesterday was missed but the streak survived,
  // which can only mean a shield burned covering it.
  const yesterday = logic.addDays(today, -1);
  const doneDates = new Set(sessions.map(s => s.date));
  if (st.streak > 0 && !st.todayDone && !doneDates.has(yesterday)) {
    html += `<p class="comeback">🛡 Shield burned covering yesterday. ${st.shields} remaining.</p>`;
  }

  if (st.todayDone) {
    html += `<p id="today-status" class="done-msg">Done for today. See you tomorrow. 🔥</p>`;
  } else {
    html += `<h2>Today's bench</h2>`;
    draft.sets.forEach((set, i) => {
      html += `
        <div class="set-row ${set.done ? 'done' : ''}" data-i="${i}">
          <div class="set-values">
            <span class="stepper" data-field="kg">
              <button class="dec">−</button><span class="val">${set.kg}</span><button class="inc">+</button>
            </span>
            <span class="unit">kg ×</span>
            <span class="stepper" data-field="reps">
              <button class="dec">−</button><span class="val">${set.reps}</span><button class="inc">+</button>
            </span>
            <span class="unit">reps</span>
          </div>
          <button class="check-btn ${set.done ? 'checked' : ''}">✓</button>
        </div>`;
    });
    html += `<p id="today-status">${doneCount} / ${draft.sets.length} sets</p>`;
  }

  html += `
    <div class="tonnage-ticker">
      <div class="big">${tonnage.toLocaleString('en-US')} kg</div>
      <div class="label">lifted lifetime</div>
    </div>`;

  view.innerHTML = html;

  // Wire steppers and checks.
  view.querySelectorAll('.set-row').forEach(row => {
    const i = Number(row.dataset.i);
    row.querySelectorAll('.stepper').forEach(stepper => {
      const field = stepper.dataset.field;
      const step = field === 'kg' ? 2.5 : 1;
      const min = field === 'kg' ? 0 : 1;
      stepper.querySelector('.dec').addEventListener('click', () => {
        draft.sets[i][field] = Math.max(min, draft.sets[i][field] - step);
        persist(); renderToday();
      });
      stepper.querySelector('.inc').addEventListener('click', () => {
        draft.sets[i][field] += step;
        persist(); renderToday();
      });
    });
    row.querySelector('.check-btn').addEventListener('click', () => {
      draft.sets[i].done = !draft.sets[i].done;
      persist();
      if (draft.sets.every(s => s.done)) {
        completeSession();
      } else {
        renderToday();
      }
    });
  });
}

function completeSession() {
  const pre = snapshotStats();
  sessions.push({
    date: today,
    sets: draft.sets.map(s => ({ kg: s.kg, reps: s.reps })),
    completedAt: new Date().toISOString(),
  });
  store.remove('draft');
  draft = { date: today, sets: draft.sets }; // keep for display; todayDone hides it
  persist();
  const post = snapshotStats();
  renderAll();
  showCelebration(pre, post);
}

function snapshotStats() {
  return {
    streak: logic.computeStreakState(sessions, today),
    tonnage: logic.computeTonnage(sessions),
    prs: logic.computePRs(sessions),
    rank: logic.rankFor(logic.computeTonnage(sessions)),
    equivCount: logic.equivalencesFor(logic.computeTonnage(sessions)).length,
  };
}

// ---------- Tabs ----------
document.querySelectorAll('#tabbar .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#tabbar .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $(`#view-${tab.dataset.view}`).classList.remove('hidden');
  });
});

// Placeholders filled by later tasks.
function renderStats() {}
function renderSettings() {}
function showCelebration(pre, post) { console.log('celebrate', pre, post); }

refreshDay();
renderAll();
```

- [ ] **Step 2: Verify in browser**

Run: `npx serve .` and open the shown URL.
Expected: Today view shows 3 set rows at `40 kg × 8 reps` with working +/− steppers (kg steps by 2.5, reps by 1, no negative values); checking all three sets logs `celebrate` to the console and the view flips to "Done for today"; the streak in the header shows 1; reloading the page keeps everything (localStorage).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: app state, draft handling, Today view with set logging"
```

---

### Task 9: Celebration overlay

The variable-reward moment: streak tick, tonnage odometer roll, PR/rank/equivalence badges, and a ~1-in-3 random bonus fact.

**Files:**
- Modify: `app.js` (replace the `showCelebration` placeholder)

- [ ] **Step 1: Add bonus facts and replace `showCelebration`**

Add near the top of `app.js` (after the imports):

```js
const BONUS_FACTS = [
  'Resistance training increases bone density — your skeleton is literally getting stronger.',
  'Muscle burns calories at rest. Every session raises your idle burn rate.',
  'Consistency beats intensity: 10 minutes daily outperforms one big session a week.',
  'The bench press works your chest, shoulders, and triceps in one move.',
  'After ~66 days, habits run on autopilot. Every day here is a brick in that wall.',
  'Strength training in your 30s pays compound interest for decades.',
];
```

Replace the `showCelebration` placeholder function with:

```js
function showCelebration(pre, post) {
  const el = $('#celebration');
  let badges = '';

  if (post.prs.maxWeight > pre.prs.maxWeight) {
    badges += `<div class="badge">🏋️ New PR: heaviest lift ${post.prs.maxWeight} kg</div>`;
  }
  if (post.prs.maxSessionVolume > pre.prs.maxSessionVolume && pre.tonnage > 0) {
    badges += `<div class="badge">📈 New PR: biggest session ${post.prs.maxSessionVolume.toLocaleString('en-US')} kg</div>`;
  }
  if (post.streak.streak > pre.streak.bestStreak && pre.streak.bestStreak > 0) {
    badges += `<div class="badge">🔥 New record streak: ${post.streak.streak} days</div>`;
  }
  if (post.rank.name !== pre.rank.name) {
    badges += `<div class="badge">⭐ Rank up: you are now ${post.rank.name}</div>`;
  }
  if (post.equivCount > pre.equivCount) {
    const eq = logic.equivalencesFor(post.tonnage).at(-1);
    badges += `<div class="badge">🐘 You have now lifted ${eq.label} (${eq.kg.toLocaleString('en-US')} kg)</div>`;
  }
  if (post.streak.shields > pre.streak.shields) {
    badges += `<div class="badge">🛡 Shield earned — 7 straight days</div>`;
  }
  // Variable reward: ~1 in 3 sessions drops a bonus fact (only if nothing else fired, to keep it special).
  if (badges === '' && Math.random() < 1 / 3) {
    badges += `<div class="badge">💡 ${BONUS_FACTS[Math.floor(Math.random() * BONUS_FACTS.length)]}</div>`;
  }

  el.innerHTML = `
    <div class="streak-big">🔥 ${post.streak.streak}</div>
    <div class="sub">day streak</div>
    <div class="tonnage-roll" id="tonnage-roll">${pre.tonnage.toLocaleString('en-US')} kg</div>
    <div class="sub">lifted lifetime</div>
    ${badges}
    <button class="close-btn">Nice.</button>`;
  el.classList.remove('hidden');
  el.querySelector('.close-btn').addEventListener('click', () => el.classList.add('hidden'));

  // Odometer roll: animate pre → post tonnage over ~1.2s.
  const rollEl = el.querySelector('#tonnage-roll');
  const start = performance.now();
  const dur = 1200;
  function frame(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(pre.tonnage + (post.tonnage - pre.tonnage) * eased);
    rollEl.textContent = `${val.toLocaleString('en-US')} kg`;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Verify in browser**

Clear site data (DevTools → Application → Clear storage), reload, complete a session.
Expected: full-screen overlay, streak "🔥 1", tonnage rolls up from 0 to the session volume, a "heaviest lift" PR badge appears (first session always sets one), "Nice." dismisses it.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: celebration overlay with odometer roll and reward badges"
```

---

### Task 10: Stats view

**Files:**
- Modify: `app.js` (replace the `renderStats` placeholder)

- [ ] **Step 1: Replace `renderStats`**

```js
function renderStats() {
  const view = $('#view-stats');
  const st = logic.computeStreakState(sessions, today);
  const tonnage = logic.computeTonnage(sessions);
  const prs = logic.computePRs(sessions);
  const rank = logic.rankFor(tonnage);
  const weeks = logic.weeklyVolumes(sessions, today, 8);
  const heat = logic.heatmapData(sessions, today, 112);

  // --- Heatmap: 16 columns x 7 rows, GitHub-style (each column = 1 week) ---
  const cell = 20, gap = 3;
  let heatSvg = `<svg class="chart" viewBox="0 0 ${16 * (cell + gap)} ${7 * (cell + gap)}">`;
  heat.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    heatSvg += `<rect x="${col * (cell + gap)}" y="${row * (cell + gap)}" width="${cell}" height="${cell}" rx="4"
      fill="${d.done ? 'var(--good)' : 'var(--surface-2)'}"/>`;
  });
  heatSvg += '</svg>';

  // --- Weekly volume bars ---
  const maxVol = Math.max(1, ...weeks.map(w => w.volume));
  const bw = 34, bgap = 10, chartH = 120;
  let barSvg = `<svg class="chart" viewBox="0 0 ${weeks.length * (bw + bgap)} ${chartH + 20}">`;
  weeks.forEach((w, i) => {
    const h = Math.round((w.volume / maxVol) * chartH);
    barSvg += `<rect x="${i * (bw + bgap)}" y="${chartH - h}" width="${bw}" height="${h}" rx="4" fill="var(--accent-2)"/>`;
    barSvg += `<text x="${i * (bw + bgap) + bw / 2}" y="${chartH + 14}" text-anchor="middle"
      font-size="9" fill="var(--text-dim)">${w.weekStart.slice(5)}</text>`;
  });
  barSvg += '</svg>';

  // --- Rank progress ---
  const rankPct = rank.next
    ? Math.round(((tonnage - rank.threshold) / (rank.next.threshold - rank.threshold)) * 100)
    : 100;

  // --- Equivalences (unlocked + next locked one as a teaser) ---
  const unlocked = logic.equivalencesFor(tonnage);
  const nextEq = logic.EQUIVALENCES[unlocked.length] ?? null;
  let equivHtml = unlocked.map(e => `<li>✅ ${e.label} (${e.kg.toLocaleString('en-US')} kg)</li>`).join('');
  if (nextEq) equivHtml += `<li class="locked">🔒 ${nextEq.label} (${nextEq.kg.toLocaleString('en-US')} kg)</li>`;

  view.innerHTML = `
    <h2>Last 16 weeks</h2>
    <div class="card">${heatSvg}</div>

    <h2>Rank</h2>
    <div class="card">
      <div class="rank-name">${rank.name}</div>
      <div class="stat-label">${rank.next
        ? `${(rank.next.threshold - tonnage).toLocaleString('en-US')} kg to ${rank.next.name}`
        : 'Maximum rank reached'}</div>
      <div class="rank-bar"><div style="width:${rankPct}%"></div></div>
    </div>

    <h2>Records</h2>
    <div class="stat-grid">
      <div class="card"><div class="stat-num">${tonnage.toLocaleString('en-US')}</div><div class="stat-label">kg lifetime</div></div>
      <div class="card"><div class="stat-num">${st.bestStreak}</div><div class="stat-label">best streak</div></div>
      <div class="card"><div class="stat-num">${prs.maxWeight}</div><div class="stat-label">kg heaviest lift</div></div>
      <div class="card"><div class="stat-num">${prs.maxSessionVolume.toLocaleString('en-US')}</div><div class="stat-label">kg best session</div></div>
    </div>

    <h2>Weekly volume (kg)</h2>
    <div class="card">${barSvg}</div>

    <h2>You have lifted…</h2>
    <div class="card"><ul class="equiv-list">${equivHtml}</ul></div>
    ${exportReminderHtml()}`;
}

function exportReminderHtml() {
  const last = store.load('lastExport', null);
  const stale = !last || (Date.now() - last) > 30 * 24 * 3600 * 1000;
  if (!stale || sessions.length === 0) return '';
  return `<p class="hint">💾 No backup in the last 30 days — export your data from Settings.</p>`;
}
```

- [ ] **Step 2: Verify in browser**

Expected: Stats tab shows the heatmap (today's cell green if session done), rank card with progress bar, four record tiles, weekly bar chart with one bar of height > 0, equivalence list with the next locked item shown with 🔒, and (on a fresh profile) the backup reminder hint.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: stats view with heatmap, rank, records, weekly chart, equivalences"
```

---

### Task 11: Settings view — plan editing, export, import

**Files:**
- Modify: `app.js` (replace the `renderSettings` placeholder)

- [ ] **Step 1: Replace `renderSettings`**

```js
function renderSettings() {
  const view = $('#view-settings');
  view.innerHTML = `
    <h2>Default plan</h2>
    <div class="card">
      <div class="settings-row"><span>Sets</span>
        <span class="stepper" data-s="sets"><button class="dec">−</button><span class="val">${settings.sets}</span><button class="inc">+</button></span>
      </div>
      <div class="settings-row"><span>Weight (kg)</span>
        <span class="stepper" data-s="kg"><button class="dec">−</button><span class="val">${settings.kg}</span><button class="inc">+</button></span>
      </div>
      <div class="settings-row"><span>Reps</span>
        <span class="stepper" data-s="reps"><button class="dec">−</button><span class="val">${settings.reps}</span><button class="inc">+</button></span>
      </div>
      <p class="hint">Used when there is no previous session to copy. Day-to-day you adjust directly on the Today screen.</p>
    </div>

    <h2>Data</h2>
    <button class="wide-btn" id="export-btn">Export backup (JSON)</button>
    <button class="wide-btn" id="import-btn">Import backup</button>
    <input type="file" id="import-file" accept="application/json,.json" style="display:none">
    <p class="hint">Data lives only on this phone. Export a backup now and then — it is your only insurance.</p>`;

  view.querySelectorAll('.stepper').forEach(stepper => {
    const field = stepper.dataset.s;
    const step = field === 'kg' ? 2.5 : 1;
    const min = field === 'kg' ? 0 : 1;
    stepper.querySelector('.dec').addEventListener('click', () => {
      settings[field] = Math.max(min, settings[field] - step);
      persist(); renderSettings();
    });
    stepper.querySelector('.inc').addEventListener('click', () => {
      settings[field] += step;
      persist(); renderSettings();
    });
  });

  view.querySelector('#export-btn').addEventListener('click', exportBackup);
  const fileInput = view.querySelector('#import-file');
  view.querySelector('#import-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => importBackup(fileInput));
}

async function exportBackup() {
  const payload = JSON.stringify({ sessions, settings, exportedAt: new Date().toISOString() }, null, 2);
  const filename = `bench-backup-${today}.json`;
  const file = new File([payload], filename, { type: 'application/json' });

  // iOS share sheet when available; download link as fallback.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled — not an export
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  store.save('lastExport', Date.now());
}

function importBackup(fileInput) {
  const f = fileInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert('That file is not valid JSON. Nothing was changed.');
      return;
    }
    const check = logic.validateBackup(data);
    if (!check.ok) {
      alert(`Backup rejected: ${check.error}. Nothing was changed.`);
      return;
    }
    if (!confirm(`Replace current data with this backup (${data.sessions.length} sessions)?`)) return;
    sessions = data.sessions;
    if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
    store.remove('draft');
    draft = loadDraft();
    persist();
    renderAll();
  };
  reader.readAsText(f);
  fileInput.value = '';
}
```

- [ ] **Step 2: Verify in browser**

Expected: steppers adjust the defaults and persist across reload; Export downloads `bench-backup-<date>.json` (on desktop) containing sessions and settings; importing that same file back succeeds after the confirm dialog; importing a text file of garbage shows the rejection alert and changes nothing.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: settings view with plan defaults and JSON backup export/import"
```

---

### Task 12: Manifest, icons, service worker

**Files:**
- Create: `manifest.webmanifest`, `icon.svg`, `tools/make-icon.html`, `sw.js`
- Modify: `app.js` (register the service worker)

- [ ] **Step 1: Create `manifest.webmanifest`**

```json
{
  "name": "Bench",
  "short_name": "Bench",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#111318",
  "theme_color": "#111318",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 2: Create `icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#111318"/>
  <rect x="14" y="40" width="8" height="20" rx="2" fill="#ff8c32"/>
  <rect x="24" y="34" width="6" height="32" rx="2" fill="#ff8c32"/>
  <rect x="30" y="47" width="40" height="6" rx="3" fill="#f2f3f5"/>
  <rect x="70" y="34" width="6" height="32" rx="2" fill="#ff8c32"/>
  <rect x="78" y="40" width="8" height="20" rx="2" fill="#ff8c32"/>
</svg>
```

- [ ] **Step 3: Create `tools/make-icon.html`** (iOS home-screen icons must be PNG; this page generates it once, manually)

```html
<!DOCTYPE html>
<meta charset="utf-8">
<title>Icon generator</title>
<p>Right-click / long-press the image and save it as <code>apple-touch-icon.png</code> in the project root.</p>
<canvas id="c" width="180" height="180"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  const s = 1.8; // scale from the 100-unit SVG design
  ctx.fillStyle = '#111318'; ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = '#ff8c32';
  ctx.fillRect(14 * s, 40 * s, 8 * s, 20 * s);
  ctx.fillRect(24 * s, 34 * s, 6 * s, 32 * s);
  ctx.fillRect(70 * s, 34 * s, 6 * s, 32 * s);
  ctx.fillRect(78 * s, 40 * s, 8 * s, 20 * s);
  ctx.fillStyle = '#f2f3f5';
  ctx.fillRect(30 * s, 47 * s, 40 * s, 6 * s);
</script>
```

Open `tools/make-icon.html` in a browser, save the canvas as `apple-touch-icon.png` in the project root, and add it to git.

- [ ] **Step 4: Create `sw.js`**

```js
const CACHE = 'bench-v1'; // bump this string on every deploy that changes any cached file
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'logic.js', 'storage.js', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
```

- [ ] **Step 5: Register the service worker** — append to the bottom of `app.js`:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
```

- [ ] **Step 6: Verify in browser**

Serve, load once, then in DevTools → Network set "Offline" and reload.
Expected: the app still loads and works fully offline.

- [ ] **Step 7: Commit**

```bash
git add manifest.webmanifest icon.svg apple-touch-icon.png tools/make-icon.html sw.js app.js
git commit -m "feat: PWA manifest, icons, offline service worker"
```

---

### Task 13: Deploy to GitHub Pages + phone QA

**Files:** none created (deployment + manual verification)

- [ ] **Step 1: Run the full test suite one last time**

Run: `node --test test/`
Expected: all tests PASS.

- [ ] **Step 2: Create the GitHub repo and enable Pages**

```bash
gh repo create workout-streak-app --public --source . --push
gh api repos/{owner}/workout-streak-app/pages -X POST -f "source[branch]=master" -f "source[path]=/" 2>/dev/null || echo "Enable Pages manually: repo Settings → Pages → Deploy from branch → master / root"
```

The app will be at `https://<username>.github.io/workout-streak-app/`. Later updates deploy with a plain `git push` (remember to bump `CACHE` in `sw.js` whenever any cached file changes, or phones will keep the old version).

- [ ] **Step 3: Phone QA checklist** (on the iPhone 13 mini, in Safari)

- Open the Pages URL → Share → **Add to Home Screen** → opens fullscreen with the icon.
- Complete a real session: total interaction ≤ ~4 taps on a no-adjustment day; steppers are comfortably tappable with a thumb.
- Celebration overlay animates; streak shows 1.
- Airplane mode → app still opens and logs (offline works end to end).
- Settings → Export → iOS share sheet appears → save to Files; re-import the same file successfully.
- No horizontal scrolling anywhere on the 375-pt-wide screen.

- [ ] **Step 4: Commit any QA fixes**

```bash
git add -A
git commit -m "fix: phone QA adjustments"
git push
```

---

## Post-v1 ideas (explicitly out of scope — do not build)

Rest-day rhythm (heavier/lighter days), additional exercises, milestone medals gallery, shareable stats image. Revisit only after the habit has survived 6–8 weeks.
