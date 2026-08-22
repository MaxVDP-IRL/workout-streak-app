import * as logic from './logic.js';
import * as store from './storage.js';

const BONUS_FACTS = [
  'Resistance training increases bone density — your skeleton is literally getting stronger.',
  'Muscle burns calories at rest. Every session raises your idle burn rate.',
  'Consistency beats intensity: 10 minutes daily outperforms one big session a week.',
  'The bench press works your chest, shoulders, and triceps in one move.',
  'After ~66 days, habits run on autopilot. Every day here is a brick in that wall.',
  'Strength training in your 30s pays compound interest for decades.',
];

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

refreshDay();
renderAll();
