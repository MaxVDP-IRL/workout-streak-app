# Workout Streak App — Design Spec

**Date:** 2026-08-22
**Owner:** Max
**Status:** Approved design, pending implementation plan

## Purpose

A personal, single-user habit app that makes a daily 5–10 minute bench press session addictive to maintain. Goals: build the daily habit (primary), grow chest strength, and support bone health through resistance training. The user's strongest motivators are **numbers going up** and **streak protection** (loss aversion), with a secondary payoff of showing progress to another person in real life.

Not goals: multi-user support, accounts/login, cloud sync, multiple exercises (v1 is bench press only), notifications.

## Platform & constraints

- Runs in Safari on an **iPhone 13 mini** (375×812 pt — one-column layout, large thumb targets).
- Installed to the home screen via web manifest; opens fullscreen like a native app.
- Static site on **GitHub Pages**; vanilla HTML/CSS/JS, **no build step**, no chart libraries (charts are hand-rolled SVG).
- Minimal service worker for offline use.
- All data in `localStorage` on the phone. No backend of any kind.
- Logging a session must take **under ~15 seconds and ~4 taps** on a typical day.

## The daily loop (Hook cycle)

1. **Trigger:** the user's own morning routine. The app sends no notifications.
2. **Action:** the Today screen shows the streak and today's sets **pre-filled from the last session** (e.g. `60 kg × 8 — 3 sets`). The user taps a large ✓ after each set while resting. Weight/reps are adjusted with +/− steppers, never typed.
3. **Variable reward:** after the final set, a celebration screen: streak ticks up with animation and the lifetime tonnage counter rolls upward like an odometer. Approximately **1 in 3 sessions** (random), a surprise bonus card also drops: a milestone medal, a newly unlocked weight equivalence, or a PR celebration.
4. **Investment:** streak length, tonnage, ranks, and charts accumulate — more to lose, more to show off.

## Streak & shield mechanics

- **Completed day** = at least one completed session (all planned sets confirmed) on that day.
- **Day boundary is 3:00 a.m. local time**, not midnight: a session at 12:30 a.m. counts toward the previous calendar day's slot ("today" as the user experiences it).
- **Streak** = consecutive completed days, where a shield-covered miss does not break the chain.
- **Shields:**
  - Earned only: **7 consecutive completed days → 1 shield**. Shield-progress days must be actual completed days (a day saved by a shield does not count toward earning the next shield, and burning a shield **resets progress toward the next shield to 0**).
  - Bank cap: **2 shields**.
  - On a missed day, one shield burns **automatically** at the day boundary; the streak survives. The app states it plainly: "Shield burned. 0 remaining."
  - No purchasing, no free grants, no manual use.
- **Streak reset:** a missed day with zero shields resets the streak to 0.
  - The **best streak** is stored and displayed permanently as the record to beat.
  - The first day after a reset is framed as a comeback ("Day 1 of the rebuild"), never as failure — this counters the "what-the-hell" abandonment effect.

## Progression (numbers that go up)

- **Lifetime tonnage** (hero number): Σ(kg × reps) across all sets, forever. Only increases.
- **Ranks:** identity titles unlocked at lifetime-tonnage thresholds (e.g. Novice → Apprentice → Iron Worker → … → Titan; exact names/thresholds chosen during implementation, roughly one rank-up every 2–4 weeks at expected volume early on, slowing over time). Rank-up always triggers a celebration and a guaranteed bonus card.
- **PRs tracked:** heaviest weight lifted, biggest single-session volume, longest streak. Beating any PR triggers a celebration on the finish screen.
- **Equivalences:** lifetime tonnage translated into memorable comparisons ("you've lifted an orca"), unlocked progressively — the shareable, show-a-human layer.
- **Charts:** weekly volume bar chart and a GitHub-style calendar heatmap of completed days. Both hand-rolled SVG.

## Screens

1. **Today (home):** streak flame + shield icons at top; today's pre-filled set list with per-set ✓ buttons and +/− steppers for weight and reps; lifetime tonnage ticker at the bottom.
2. **Celebration (auto, after final set):** animated streak increment and tonnage roll-up; PR/rank/bonus card when applicable; single tap returns to Today.
3. **Stats:** calendar heatmap, weekly volume chart, PRs, current rank and progress to next, equivalences, best streak. Designed to be handed to another person.
4. **Settings:** edit default sets/weight/reps for the daily plan; **export full history as a JSON file** (iOS share sheet) and **import** to restore. Nothing else.

## Data model & architecture

`localStorage` keys (JSON):

- `sessions`: append-only list of `{ date: "YYYY-MM-DD", sets: [{ kg, reps }], completedAt }` (date already adjusted for the 3 a.m. boundary).
- `settings`: `{ defaultSets, defaultKg, defaultReps }`.
- `shieldLedger`: append-only list of shield events `{ date, type: "earned" | "burned" }`.
- `meta`: schema version for future migrations.

**All derived values — streak, best streak, shields banked, shield progress, tonnage, PRs, rank, chart data — are computed from `sessions` + `shieldLedger` on load, never stored.** This makes corruption/drift impossible and the logic testable.

Code structure:

- `logic.js` — pure functions, no DOM: streak/shield computation, stats, rank thresholds, date-boundary handling. Unit-testable with plain Node (`node --test`).
- `app.js` — UI wiring, rendering, localStorage access.
- `index.html`, `style.css`, `sw.js` (service worker), `manifest.webmanifest`.

## Error handling & data safety

- Export/import JSON backup is the sole persistence insurance; the Stats screen shows a gentle reminder if no export has happened in 30+ days.
- Import validates the JSON shape and refuses malformed files without touching existing data.
- If `localStorage` is empty on load (new phone, cleared storage), the app starts fresh and offers import.
- A session in progress (some sets ✓'d, app closed) is kept for the current day and resumes on reopen; it counts as completed only when all planned sets are confirmed.

## Testing

- `logic.js` covered by Node's built-in test runner: streak math across boundaries (3 a.m. edge, shield burn, shield-progress reset, bank cap, streak reset, comeback), tonnage/PR computation, rank thresholds, import validation.
- UI verified manually on the actual phone (small-screen layout, tap targets, share-sheet export).

## Research basis (summary)

- Tiny, low-friction daily actions beat ambitious ones for habit formation (BJ Fogg, Tiny Habits).
- Streaks are powerful via loss aversion, but rigid streaks cause abandonment after one miss ("what-the-hell effect", 2020 CHI study on streak anxiety); forgiveness mechanics like earned streak freezes retain users without weakening motivation (Duolingo, ~23% retention improvement).
- Variable rewards outperform predictable ones (Hook Model).
- Identity framing ("someone who trains daily") improves recovery from lapses; the comeback framing and permanent best-streak record implement this.
- External gamification carries the habit through the ~6–8 weeks until it becomes internally rewarding; visible progress toward the real goals (strength, bone health) sustains it after.
