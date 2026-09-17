# Plank Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily plank with a built-in start/stop timer. From the cutover date forward, a day counts toward the streak only when **both** the bench sets and a plank are done. Track longest single plank and cumulative plank time (broken down into days/hours/minutes/seconds).

**Branch:** `claude/plank-feature-timer-smlz0q`

**Non-negotiable constraint: no existing data may be lost or invalidated.** The user's live `localStorage` under the `bench:` prefix is the only copy of their history.

---

## Architecture decisions (do not re-litigate)

1. **History is immutable.** `sessions` entries are the record that a day was completed. Never rewrite, re-validate, or re-filter them. `computeStreakState()` in `logic.js` is **not modified at all** — it still derives the streak from the set of dates present in `sessions`. This is the entire data-safety story: old days stay complete because they are already in the array, and nothing recomputes whether they "should" be.

2. **The new requirement is a gate on *writing* a session, not on *reading* one.** Today a session is pushed when every bench set is checked. After this change it is pushed when every bench set is checked **and** a plank exists for today (when required). Two entry points can now trigger completion: the last bench check, or the plank stop.

3. **Cutover date is stored, not computed.** `settings.plankRequiredFrom` (a `YYYY-MM-DD` string) is written once, on first load after the update, to the current effective date. `plankRequired(date)` is `date >= settings.plankRequiredFrom`. It goes in the backup payload so a restore does not change the rule. Days already in `sessions` are never re-evaluated, so a day already completed at cutover time stays complete.

4. **Planks are their own append-only log, not a field on `session`.** New storage key `bench:planks`, array of `{ date, seconds, completedAt }`. Reasons: a plank done on a day the bench is never finished still counts toward lifetime totals (a session row would never be written for that day); multiple planks per day work for free; and it leaves the existing `sessions` schema byte-identical.

5. **The timer is derived from an absolute timestamp, never accumulated.** Running state is `bench:plankRunning` = `{ startedAt: <epoch ms>, date }`. Elapsed is always `Date.now() - startedAt`. This is the only approach that survives iOS backgrounding, a killed PWA, and screen lock. Do not use a counter incremented by `setInterval`.

6. **All new arithmetic and formatting lives in `logic.js`** (pure, no DOM, no `localStorage`, no implicit `Date.now()`) and is unit tested. `app.js` does wiring only. This matches the existing split.

---

## Open questions — decisions taken, flag if the user disagrees

| Question | Decision taken |
|---|---|
| Is there a minimum plank length? | Yes, a floor of `PLANK_MIN_SECONDS = 5` to reject a mis-tap. No target duration and no maximum — any run ≥ 5s satisfies the day. |
| "Seconds, minutes, hours and days" — four counters or one total? | One cumulative total, rendered as a `2d 3h 14m 09s` breakdown plus the raw second count. |
| Does the plank have to follow the bench? | No. Either order; the day completes when the second one lands. |
| What if the bench is already done today when the update ships? | That day is already in `sessions` and stays complete. The plank requirement starts biting from the next incomplete day. |
| Can a plank be logged manually without the timer? | Not in this change. Timer only, per the request. |

---

## Task 1: Plank math in `logic.js`

**Files:** Modify `logic.js`; modify `test/logic.test.mjs`

- [ ] **Step 1:** Append to `logic.js`:

```js
// ---------- Plank ----------
export const PLANK_MIN_SECONDS = 5;          // shorter than this is a mis-tap, not a plank
export const PLANK_SANITY_SECONDS = 2 * 3600; // longer than this: confirm before recording

export function plankRequired(dateStr, plankRequiredFrom) {
  return Boolean(plankRequiredFrom) && dateStr >= plankRequiredFrom;
}

export function plankSecondsOn(planks, dateStr) {
  return planks.reduce((sum, p) => (p.date === dateStr ? sum + p.seconds : sum), 0);
}

export function plankedOn(planks, dateStr) {
  return planks.some(p => p.date === dateStr && p.seconds >= PLANK_MIN_SECONDS);
}

export function plankTotals(planks) {
  let totalSeconds = 0, longest = 0;
  const days = new Set();
  for (const p of planks) {
    totalSeconds += p.seconds;
    if (p.seconds > longest) longest = p.seconds;
    days.add(p.date);
  }
  return { totalSeconds, longest, count: planks.length, dayCount: days.size };
}

export function breakdownDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    totalSeconds: s,
  };
}

// Clock face for the running timer and for single-plank figures: m:ss, or h:mm:ss past an hour.
export function formatClock(totalSeconds) {
  const { days, hours, minutes, seconds } = breakdownDuration(totalSeconds);
  const h = days * 24 + hours;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// Long form for the cumulative figure: "2d 3h 14m 09s", dropping leading zero units.
export function formatDurationLong(totalSeconds) {
  const b = breakdownDuration(totalSeconds);
  const parts = [];
  if (b.days) parts.push(`${b.days}d`);
  if (b.days || b.hours) parts.push(`${b.hours}h`);
  if (b.days || b.hours || b.minutes) parts.push(`${b.minutes}m`);
  parts.push(`${String(b.seconds).padStart(2, '0')}s`);
  return parts.join(' ');
}
```

- [ ] **Step 2:** Add tests to `test/logic.test.mjs` (same `node:test` style as the existing file). Cover at minimum:
  - `plankRequired`: `false` when `plankRequiredFrom` is `undefined`/`null`/`''` (**this is the case that protects every historical day — test it explicitly**); `false` for a date before the cutover; `true` on the cutover date itself and after.
  - `plankedOn`: `false` for an empty log, `false` for a 3-second entry, `true` for a 30-second entry on that date, `false` for a 30-second entry on a different date.
  - `plankSecondsOn`: sums multiple entries on the same date.
  - `plankTotals`: empty log gives all zeros; `longest` is the max single run, not the daily sum; `dayCount` dedupes two planks on one date.
  - `breakdownDuration`: `0`, `59`, `60`, `3599`, `3600`, `86399`, `86400`, `90061` (→ 1d 1h 1m 1s).
  - `formatClock`: `0 → '0:00'`, `9 → '0:09'`, `65 → '1:05'`, `3600 → '1:00:00'`, `90061 → '25:01:01'`.
  - `formatDurationLong`: `9 → '09s'`, `65 → '1m 05s'`, `3661 → '1h 1m 01s'`, `90061 → '1d 1h 1m 01s'`.

- [ ] **Step 3:** Run `node --test test/` — all new and all pre-existing tests must pass. Do not proceed while anything is red.

---

## Task 2: Backup format — planks in, old backups still valid

Do this **before** any UI work, so that a mid-implementation export is already complete.

**Files:** Modify `logic.js` (`validateBackup`); modify `test/logic.test.mjs`

- [ ] **Step 1:** Extend `validateBackup(obj)`. Keep every existing check exactly as-is, and add, after the `sessions` loop:

```js
  if (obj.planks !== undefined) {
    if (!Array.isArray(obj.planks)) return { ok: false, error: 'Bad planks' };
    for (const p of obj.planks) {
      if (!p || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
        return { ok: false, error: 'Bad plank date' };
      }
      if (!Number.isFinite(p.seconds) || p.seconds <= 0) return { ok: false, error: 'Bad plank seconds' };
    }
  }
```

  `obj.planks === undefined` must stay valid: **every backup the user has already exported lacks the key, and those files must keep importing cleanly.** `settings` is already validated loosely enough that `plankRequiredFrom` needs no change there.

- [ ] **Step 2:** Tests: a v1 backup with no `planks` key validates `ok`; a backup with a well-formed `planks` array validates `ok`; `planks: {}`, a bad date string, `seconds: 0` and `seconds: 'abc'` each fail with the right error.

- [ ] **Step 3:** `node --test test/` green.

---

## Task 3: Plank state, migration, and completion gate in `app.js`

**Files:** Modify `app.js`

- [ ] **Step 1:** Load state alongside the existing loads:

```js
let planks = store.load('planks', []);
let running = store.load('plankRunning', null);
```

- [ ] **Step 2:** Add the one-time migration, called **once, immediately after `settings` is loaded and before the first render**:

```js
// One-time, idempotent: stamp the date from which a plank is also required.
// Days already in `sessions` are never re-evaluated, so nothing historical changes.
if (!settings.plankRequiredFrom) {
  settings.plankRequiredFrom = today;
  store.save('settings', settings);
}
```

  It must be idempotent (guarded on falsiness) and must never overwrite an existing value — that value is what keeps the cutover stable across reloads and restores.

- [ ] **Step 3:** Extend `persist()` to also `store.save('planks', planks)`. Keep `plankRunning` written/removed explicitly at start/stop rather than in `persist()`, so a re-render never resurrects a stopped timer.

- [ ] **Step 4:** Add the gate and route both completion paths through it:

```js
function plankDueToday() {
  return logic.plankRequired(today, settings.plankRequiredFrom);
}

function dayComplete() {
  const benchDone = draft.sets.length > 0 && draft.sets.every(s => s.done);
  if (!benchDone) return false;
  return plankDueToday() ? logic.plankedOn(planks, today) : true;
}

function maybeCompleteSession() {
  const alreadyDone = sessions.some(s => s.date === today);
  if (alreadyDone || !dayComplete()) return false;
  completeSession();
  return true;
}
```

  In the bench `.check-btn` handler, replace the `if (draft.sets.every(s => s.done)) completeSession(); else renderToday();` branch with `if (!maybeCompleteSession()) renderToday();`.

- [ ] **Step 5:** Stale-run recovery, run once at startup right after loading `running`:
  - `running` exists and `running.date !== today` → drop it (`store.remove('plankRunning'); running = null;`). Do **not** silently record it; a timer left running overnight is not a plank.
  - `running` exists for today and elapsed exceeds `logic.PLANK_SANITY_SECONDS` → leave it visibly running and let the user stop or discard it. The stop path (Task 4) handles the confirmation.

---

## Task 4: Timer UI on the Today view

**Files:** Modify `app.js`, `style.css`

Design constraints: same dark surface, same `.card` / `.stat-num` / `var(--accent)` vocabulary, one tap to start and one to stop, nothing new on the tab bar.

- [ ] **Step 1:** Module-scope ticker handle, declared next to the other module state:

```js
let plankTicker = null;
```

  **`renderToday()` replaces `innerHTML` wholesale on every stepper tap**, so the ticker must be cleared at the top of `renderToday()` and restarted at the end when a run is active, otherwise intervals leak and write to detached nodes.

- [ ] **Step 2:** In `renderToday()`, after the bench block and before the tonnage ticker, render a plank card:

  - **Running:** `<div class="plank-clock" id="plank-clock">${logic.formatClock(elapsed)}</div>` plus a full-width **Stop** button (`.wide-btn`, `--danger` text).
  - **Not running, no plank today:** `0:00` in the same clock style, a **Start plank** button, and a `.hint` reading `Plank required for today's streak.` when `plankDueToday()` is true.
  - **Not running, plank already logged today:** `✓ Plank ${logic.formatClock(logic.plankSecondsOn(planks, today))} today` in `var(--good)`, plus a secondary **Plank again** button so extra sets still count toward the lifetime total.
  - Render the card in the `st.todayDone` branch too — a completed day should still show today's plank time and allow another.

- [ ] **Step 3:** Start handler:

```js
running = { startedAt: Date.now(), date: today };
store.save('plankRunning', running);
renderToday();
```

- [ ] **Step 4:** Stop handler:

```js
const seconds = Math.round((Date.now() - running.startedAt) / 1000);
store.remove('plankRunning');
running = null;
if (seconds < logic.PLANK_MIN_SECONDS) {
  renderToday();                       // too short to be a plank; discard silently
  return;
}
if (seconds > logic.PLANK_SANITY_SECONDS &&
    !confirm(`Record ${logic.formatClock(seconds)}? That looks like the timer ran in your pocket.`)) {
  renderToday();
  return;
}
const pre = snapshotStats();
planks.push({ date: today, seconds, completedAt: new Date().toISOString() });
persist();
if (!maybeCompleteSession()) {
  renderAll();
  maybeCelebratePlankPR(pre);          // Task 5
}
```

  Note the ordering: the plank is persisted **before** the completion check, so `logic.plankedOn` sees it.

- [ ] **Step 5:** Ticking. Recompute from `running.startedAt` each tick; never increment a counter:

```js
function startPlankTicker() {
  stopPlankTicker();
  plankTicker = setInterval(() => {
    const el = $('#plank-clock');
    if (!el || !running) return stopPlankTicker();
    el.textContent = logic.formatClock(Math.floor((Date.now() - running.startedAt) / 1000));
  }, 250);
}
function stopPlankTicker() {
  if (plankTicker) { clearInterval(plankTicker); plankTicker = null; }
}
```

  250 ms keeps the seconds digit honest without burning battery. Also repaint the clock inside the existing `visibilitychange` handler, so the figure is correct the instant the app is foregrounded.

- [ ] **Step 6:** `style.css` — add `.plank-clock { font-size: 44px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--accent); text-align: center; }` and a `.plank-done { color: var(--good); font-weight: 600; text-align: center; }`. Reuse `.card`, `.wide-btn` and `.hint` for everything else; do not introduce new colours or radii.

- [ ] **Step 7 (optional, best-effort):** request `navigator.wakeLock.request('screen')` on start and release on stop, wrapped in try/catch and feature-detected. *Uncertain:* wake lock is supported in iOS Safari 16.4+, but behaviour inside an installed PWA is worth verifying on the actual device before relying on it. If it misbehaves, drop the step — it is not part of the requirement.

---

## Task 5: Stats, celebration, and the streak copy

**Files:** Modify `app.js`

- [ ] **Step 1:** In `renderStats()`, compute `const pt = logic.plankTotals(planks);` and add a **Plank** section after **Records**:

```
Longest plank     logic.formatClock(pt.longest)
Total planked     logic.formatDurationLong(pt.totalSeconds)
Seconds planked   pt.totalSeconds.toLocaleString('en-US')
Days planked      pt.dayCount
```

  Use the existing `.stat-grid` / `.card` / `.stat-num` / `.stat-label` markup verbatim. `Seconds planked` is there because the user asked for the raw second count alongside the breakdown; the breakdown line covers days/hours/minutes.

- [ ] **Step 2:** Extend `snapshotStats()` with `plank: logic.plankTotals(planks)` so the celebration can diff it.

- [ ] **Step 3:** In `showCelebration(pre, post)`, add a badge before the bonus-fact fallback:

```js
if (post.plank.longest > pre.plank.longest && pre.plank.longest > 0) {
  badges += `<div class="badge">⏱ New PR: longest plank ${logic.formatClock(post.plank.longest)}</div>`;
}
```

  The `pre.plank.longest > 0` guard mirrors the existing session-volume badge: the very first plank is not a "record".

- [ ] **Step 4:** Add `maybeCelebratePlankPR(pre)` for the case where a plank sets a record on a day that does *not* complete a session (bench still outstanding). Reuse the badge text; a one-line toast or a minimal overlay is fine — do not fire the full streak celebration, which would be a lie about the day being done.

- [ ] **Step 5:** Today-view status copy. When the bench is finished but the plank is not, `#today-status` must say `Bench done — plank left to lock in the day.` rather than `3 / 3 sets`. The user must never be able to think the day is safe when it is not.

---

## Task 6: Backup wiring, cache bump, verification

**Files:** Modify `app.js`, `sw.js`

- [ ] **Step 1:** `exportBackup()` payload becomes `{ sessions, planks, settings, exportedAt }`. `settings` already carries `plankRequiredFrom`.

- [ ] **Step 2:** `importBackup()`:
  - after validation passes, set `planks = Array.isArray(data.planks) ? data.planks : []`;
  - `store.remove('plankRunning'); running = null;` alongside the existing draft reset;
  - the confirm dialog must name what is being replaced on **both** axes, because importing a pre-plank backup wipes plank history:
    `Replace your current ${sessions.length} sessions and ${planks.length} planks with this backup's ${data.sessions.length} sessions and ${(data.planks ?? []).length} planks? This cannot be undone.`
  - keep the existing behaviour that a rejected file changes nothing.

- [ ] **Step 3:** Bump the service worker cache: `const CACHE = 'bench-v2';` in `sw.js`. **Skipping this ships the change to a phone that keeps serving the old cached bundle.** No new files are added, so `ASSETS` is unchanged.

- [ ] **Step 4:** Verification, all of it, before claiming done:
  - `node --test test/` — green, old tests included.
  - Serve the directory and walk the flows in a browser:
    1. Seed `localStorage` with a v1 payload (several `bench:sessions` days, `bench:settings`, **no** `bench:planks`, **no** `plankRequiredFrom`). Load the app: **streak, tonnage, rank, heatmap and best-streak must read exactly as they did before the change.** This is the regression that matters most.
    2. Complete the bench only → day does not complete, status says the plank is outstanding, streak does not tick.
    3. Start the timer, background the tab for ~30s, return → the clock reflects real elapsed time, not frozen time.
    4. Stop → plank logged, session completes, celebration fires, streak ticks.
    5. Reload mid-run → the timer is still running with the correct elapsed figure.
    6. Plank first, bench second → day completes on the last bench check.
    7. Export, wipe `localStorage`, import the file → sessions **and** planks and the cutover date all return.
    8. Import an old pre-plank backup → accepted, no crash, planks land as empty.

- [ ] **Step 5:** Commit on `claude/plank-feature-timer-smlz0q` and push with `git push -u origin claude/plank-feature-timer-smlz0q`. Do not open a pull request unless asked.

---

## Rollback

Every change is additive. If something is wrong in the field: revert the commit and bump `CACHE` again. `bench:sessions` and `bench:settings` are never rewritten by this work except for the single additive `plankRequiredFrom` key, and `bench:planks` is a new key that the old build simply ignores. **Before touching anything, use Settings → Export backup on the device and keep the file.**
