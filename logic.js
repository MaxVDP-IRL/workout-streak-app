// Pure functions only. No DOM, no localStorage, no Date.now() except as default args.
export const DAY_BOUNDARY_HOUR = 3;

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
