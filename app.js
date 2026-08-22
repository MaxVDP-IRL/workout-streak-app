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
