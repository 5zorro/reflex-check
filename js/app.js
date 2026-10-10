// Screen navigation and the check flow (intro -> reaction -> dodge x2 -> result).

import { runReaction } from './reaction.js';
import { playRound } from './dodge.js';
import { startDrive } from './drive.js';
import { getBaseline, scoreCheck, bandFor, offsetInUnits, CALIBRATION_RUNS_NEEDED } from './scoring.js';
import {
  getSettings, saveSettings, getHistory, addResult, clearHistory, resetBaseline, latestCheck,
} from './storage.js';

const DODGE_ROUNDS = 2;

const $ = id => document.getElementById(id);
let stopDrive = null;

function show(name) {
  if (stopDrive && name !== 'drive') { stopDrive(); stopDrive = null; }
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
}

/* ---------- formatting ---------- */

const unitLabel = s => (s.units === 'kmh' ? 'km/h' : 'mph');

function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(ts).toLocaleDateString();
}

function capText(offsetMph, settings) {
  const off = offsetInUnits(offsetMph, settings.units);
  if (off === null) return "Don't drive";
  if (off === 0) return 'Posted limit';
  return `Limit ${off} ${unitLabel(settings)}`;
}

function isValid(check, settings) {
  return check && Date.now() - check.at < settings.validHours * 3600000;
}

/* ---------- home ---------- */

function renderHome() {
  const settings = getSettings();
  const base = getBaseline();
  const last = latestCheck();
  const card = $('status-card');

  const baseLine = base.isDefault
    ? `<p><b>Baseline:</b> not calibrated yet (${base.runs} of ${CALIBRATION_RUNS_NEEDED} runs). Until then you're compared to typical adult numbers. Do your calibration runs while rested and sober.</p>`
    : `<p><b>Baseline:</b> ${base.reactionMs} ms reaction, ${base.dodgeSec.toFixed(1)} s dodge (from ${base.runs} runs).</p>`;

  if (!last) {
    card.innerHTML = `<h2>No checks yet</h2>${baseLine}`;
    return;
  }
  const band = bandFor(last.score);
  const valid = isValid(last, settings);
  card.innerHTML = `
    <div class="g-label">Last check · ${ago(last.at)}${valid ? '' : ' · expired'}</div>
    <div class="big">${last.score}</div>
    <span class="band band-${valid ? band.cls : 'gray'}">${band.label}</span>
    <dl class="kv"><dt>Speed cap</dt><dd>${valid ? capText(last.offsetMph, settings) : 'Run a new check'}</dd></dl>
    ${baseLine}`;
}

/* ---------- check flow ---------- */

let introResolve = null;
$('intro-go').addEventListener('click', () => introResolve?.());

async function runCheck(kind) {
  const base = getBaseline();
  const calibrating = kind === 'calibration';
  $('intro-title').textContent = calibrating ? 'Calibration run' : 'Reflex check';
  $('intro-body').textContent = calibrating
    ? `Do this while rested and sober — it becomes your "normal". Run ${base.isDefault ? `${base.runs + 1} of ${CALIBRATION_RUNS_NEEDED}` : 'refresh (uses your last 5 runs)'}.`
    : 'Two short tests. Your score is compared to your own baseline.';
  show('intro');
  await new Promise(r => { introResolve = r; });
  introResolve = null;

  show('reaction');
  const reaction = await runReaction($('reaction-pad'), $('reaction-msg'), $('reaction-sub'));

  show('dodge');
  const rounds = [];
  for (let i = 0; i < DODGE_ROUNDS; i++) {
    $('dodge-round').textContent = `Dodge ${i + 1} of ${DODGE_ROUNDS}`;
    const sec = await playRound(
      $('dodge-canvas'),
      t => { $('dodge-time').textContent = `${t.toFixed(1)} s`; },
      text => { $('dodge-msg').textContent = text; },
    );
    rounds.push(Math.round(sec * 100) / 100);
  }
  const dodgeSec = rounds.reduce((a, b) => a + b, 0) / rounds.length;

  const scored = scoreCheck({ ...reaction, dodgeSec }, base);
  const result = {
    at: Date.now(),
    kind,
    reactionMs: reaction.reactionMs,
    reactionTimes: reaction.times,
    falseStarts: reaction.falseStarts,
    dodgeRounds: rounds,
    dodgeSec: Math.round(dodgeSec * 100) / 100,
    score: scored.score,
    offsetMph: scored.band.offsetMph,
    baselineUsed: { reactionMs: base.reactionMs, dodgeSec: base.dodgeSec, isDefault: base.isDefault },
  };
  addResult(result);
  renderResult(result);
  show('result');
}

function renderResult(r) {
  const settings = getSettings();
  const band = bandFor(r.score);
  const b = r.baselineUsed;
  const calibrating = r.kind === 'calibration';
  const after = getBaseline();
  const pct = Math.min(100, (r.score / 150) * 100);

  const header = calibrating
    ? `<h2>Calibration saved</h2><p>${after.isDefault
        ? `${after.runs} of ${CALIBRATION_RUNS_NEEDED} runs done. Do ${CALIBRATION_RUNS_NEEDED - after.runs} more (ideally on different days) to lock in your baseline.`
        : `Your baseline is now ${after.reactionMs} ms reaction and ${after.dodgeSec.toFixed(1)} s dodge.`}</p>`
    : '';

  $('result-card').innerHTML = `
    ${header}
    <div class="g-label">Score (100 = your normal)</div>
    <div class="big">${r.score}</div>
    <div class="meter"><span class="band-${band.cls}" style="width:${pct}%"></span></div>
    <span class="band band-${band.cls}">${band.label}</span>
    ${calibrating ? '' : `<p style="margin-top:10px">${band.advice}</p>`}
    <dl class="kv">
      ${calibrating ? '' : `<dt>Speed cap</dt><dd><b>${capText(r.offsetMph, settings)}</b></dd>`}
      <dt>Reaction (median)</dt><dd>${r.reactionMs} ms <small>vs ${Math.round(b.reactionMs)}</small></dd>
      <dt>Taps</dt><dd>${r.reactionTimes.join(', ')}</dd>
      <dt>False starts</dt><dd>${r.falseStarts}</dd>
      <dt>Dodge rounds</dt><dd>${r.dodgeRounds.map(s => s.toFixed(1)).join(' s, ')} s <small>vs ${b.dodgeSec.toFixed(1)}</small></dd>
    </dl>
    ${b.isDefault && !calibrating ? '<p class="fine" style="margin-top:10px">Not calibrated yet: compared to typical adult numbers, not your own.</p>' : ''}
    ${!calibrating && r.offsetMph === null ? '<p style="margin-top:10px"><b>Please don\'t drive. Call a friend, a cab, or a rideshare.</b></p>' : ''}`;
}

/* ---------- drive ---------- */

function openDrive() {
  const settings = getSettings();
  const last = latestCheck();
  const offset = isValid(last, settings) ? offsetInUnits(last.offsetMph, settings.units) : undefined;
  show('drive');
  stopDrive = startDrive({
    banner: $('drive-banner'), limit: $('g-limit'), limitSrc: $('g-limit-src'),
    cap: $('g-cap'), capNote: $('g-cap-note'), speed: $('g-speed'), speedBox: $('g-speed').parentElement,
    unit: $('g-unit'), gps: $('drive-gps'),
    limitDown: $('limit-down'), limitUp: $('limit-up'), limitAuto: $('limit-auto'),
  }, { settings, offset });
}

$('drive-stop').addEventListener('click', () => show('home'));

/* ---------- history ---------- */

function renderHistory() {
  const settings = getSettings();
  const list = $('history-list');
  const rows = getHistory();
  if (!rows.length) { list.innerHTML = '<p class="fine">Nothing yet.</p>'; return; }
  list.innerHTML = rows.map(r => {
    const band = bandFor(r.score);
    const tag = r.kind === 'check' ? capText(r.offsetMph, settings) : r.kind === 'calibration' ? 'Calibration' : 'Old calibration';
    return `<div class="item">
      <div><b>${r.score}</b> <span class="band band-${r.kind === 'check' ? band.cls : 'gray'}">${tag}</span>
        <small>${new Date(r.at).toLocaleString()} · ${r.reactionMs} ms · ${r.dodgeSec.toFixed(1)} s dodge</small></div>
    </div>`;
  }).join('');
}

/* ---------- settings ---------- */

const settingInputs = {
  units: $('set-units'), validHours: $('set-valid'), tolerance: $('set-tolerance'),
  sound: $('set-sound'), vibrate: $('set-vibrate'),
};

function renderSettings() {
  const s = getSettings();
  settingInputs.units.value = s.units;
  settingInputs.validHours.value = String(s.validHours);
  settingInputs.tolerance.value = String(s.tolerance);
  settingInputs.sound.checked = s.sound;
  settingInputs.vibrate.checked = s.vibrate;
}

for (const el of Object.values(settingInputs)) {
  el.addEventListener('change', () => saveSettings({
    units: settingInputs.units.value,
    validHours: Number(settingInputs.validHours.value),
    tolerance: Number(settingInputs.tolerance.value),
    sound: settingInputs.sound.checked,
    vibrate: settingInputs.vibrate.checked,
  }));
}

$('reset-baseline').addEventListener('click', () => {
  if (confirm('Start your baseline over? Past calibration runs will stop counting.')) resetBaseline();
});
$('clear-history').addEventListener('click', () => {
  if (confirm('Delete all checks and your baseline from this phone?')) clearHistory();
});

/* ---------- wiring ---------- */

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) return show(nav.dataset.nav);
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'check') runCheck('check');
  if (action === 'calibrate') runCheck('calibration');
  if (action === 'drive') openDrive();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

show('home');
