// Thin localStorage wrapper. Everything the app remembers lives on the phone.

const KEYS = {
  settings: 'rc.settings',
  history: 'rc.history',
};

export const DEFAULT_SETTINGS = {
  units: 'mph',       // 'mph' | 'kmh'
  validHours: 2,      // how long a check counts before drive mode asks for a new one
  tolerance: 1,       // alert when speed > cap + tolerance (display units)
  sound: true,
  vibrate: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage full: the app still works for this session.
  }
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

/** All check results, newest first. */
export function getHistory() {
  return read(KEYS.history, []);
}

export function addResult(result) {
  const history = getHistory();
  history.unshift(result);
  write(KEYS.history, history.slice(0, 200));
}

export function clearHistory() {
  write(KEYS.history, []);
}

/** Drops calibration runs so the baseline starts over; normal checks are kept. */
export function resetBaseline() {
  write(KEYS.history, getHistory().map(r => (r.kind === 'calibration' ? { ...r, kind: 'retired-calibration' } : r)));
}

export function latestCheck() {
  return getHistory().find(r => r.kind === 'check') || null;
}
