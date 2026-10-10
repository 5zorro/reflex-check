// Drive mode: GPS speed + posted speed limit (from OpenStreetMap) + your cap from the last check.
// Advisory only. A phone app has no way to control a car's throttle.

import { MPH_TO_KMH } from './scoring.js';

// Public Overpass servers, tried in order (the main one is often busy and returns 429/504).
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const LOOKUP_RADIUS_M = 35;
const LOOKUP_MIN_MOVE_M = 120;   // re-query after moving this far...
const LOOKUP_MIN_GAP_MS = 8000;  // ...but no more often than this
const LOOKUP_MAX_AGE_MS = 60000; // and at least this often while moving
const LOOKUP_RETRY_MS = 15000;   // after a failed lookup, try again this soon even if standing still
const BEEP_EVERY_MS = 3000;
const DONT_DRIVE_MOVING_MPH = 5;

const MS_TO = { mph: 2.236936, kmh: 3.6 };

/* ---------- geometry ---------- */

function metersBetween(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance (m) from point p to segment a-b, using a flat local projection (fine at road scale). */
function distToSegment(p, a, b) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/* ---------- speed limits ---------- */

/** Parses an OSM maxspeed tag. "45 mph" -> {value:45, unit:'mph'}; "50" -> km/h. Returns null if not numeric. */
export function parseMaxspeed(tag) {
  if (!tag) return null;
  const m = String(tag).split(';')[0].trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2] && m[2].toLowerCase() === 'mph' ? 'mph' : 'kmh' };
}

function toUnits(limit, units) {
  if (limit.unit === units) return limit.value;
  return Math.round(units === 'mph' ? limit.value / MPH_TO_KMH : limit.value * MPH_TO_KMH);
}

/** Finds the nearest road with a posted maxspeed. Resolves with { value, unit, road } or null. */
export async function lookupLimit(lat, lon) {
  const q = `[out:json][timeout:10];way(around:${LOOKUP_RADIUS_M},${lat},${lon})[highway][maxspeed];out tags geom;`;
  let data = null, lastError = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      data = await res.json();
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!data) throw lastError;
  const p = { lat, lon };
  let best = null;
  for (const way of data.elements ?? []) {
    const limit = parseMaxspeed(way.tags?.maxspeed);
    if (!limit || !way.geometry) continue;
    for (let i = 1; i < way.geometry.length; i++) {
      const d = distToSegment(p, way.geometry[i - 1], way.geometry[i]);
      if (!best || d < best.d) best = { d, ...limit, road: way.tags.name || way.tags.ref || way.tags.highway };
    }
  }
  return best;
}

/* ---------- drive session ---------- */

/**
 * @param {object} ui         element refs (see app.js)
 * @param {object} opts
 * @param {object} opts.settings      user settings
 * @param {number|null|undefined} opts.offset  cap offset in display units; null = don't drive; undefined = no valid check
 */
export function startDrive(ui, { settings, offset }) {
  const units = settings.units;
  const unitLabel = units === 'kmh' ? 'km/h' : 'mph';
  const state = {
    watchId: null, wakeLock: null, audio: null,
    lastFix: null, speed: null,
    autoLimit: null, manualLimit: null, roadName: '',
    lookupAt: 0, lookupFrom: null, lookupBusy: false, lookupError: false,
    lastBeep: 0,
  };

  ui.unit.textContent = unitLabel;

  // Banner reflects the check that drive mode is using.
  if (offset === null) {
    setBanner('bad', "Your last check said don't drive. Please get a ride.");
  } else if (offset === undefined) {
    setBanner('warn', 'No recent check. Showing the default cap (5 under the limit). Run a check first.');
  } else {
    setBanner('ok', offset === 0 ? 'Recent check: cap = posted limit.' : `Recent check: cap = limit ${offset} ${unitLabel}.`);
  }
  const capOffset = offset === undefined ? (units === 'kmh' ? -8 : -5) : offset;

  function setBanner(cls, text) {
    ui.banner.className = `banner ${cls}`;
    ui.banner.textContent = text;
  }

  // Beeps need an AudioContext created from a user tap; startDrive runs from one.
  try { state.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }

  function beep() {
    const ctx = state.audio;
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  async function keepAwake() {
    try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  function currentLimit() {
    return state.manualLimit ?? state.autoLimit;
  }

  function render() {
    const limit = currentLimit();
    ui.limit.textContent = limit ?? '--';
    ui.limitSrc.textContent = state.manualLimit != null ? 'set by you'
      : state.lookupError && state.autoLimit == null ? 'lookup failed'
      : state.autoLimit != null ? (state.roadName || 'OpenStreetMap')
      : state.lastFix ? 'no limit on map' : 'looking up…';

    let cap = null;
    if (offset === null) {
      ui.cap.textContent = '✕';
      ui.capNote.textContent = "don't drive";
    } else if (limit != null) {
      cap = limit + capOffset;
      ui.cap.textContent = cap;
      ui.capNote.textContent = capOffset === 0 ? 'at limit' : `${capOffset} ${unitLabel}`;
    } else {
      ui.cap.textContent = '--';
      ui.capNote.textContent = capOffset === 0 ? 'limit' : `limit ${capOffset}`;
    }

    const speed = state.speed;
    ui.speed.textContent = speed == null ? '--' : Math.round(speed);

    const movingMph = speed == null ? 0 : units === 'kmh' ? speed / MPH_TO_KMH : speed;
    const over = offset === null
      ? movingMph > DONT_DRIVE_MOVING_MPH
      : cap != null && speed != null && speed > cap + settings.tolerance;
    ui.speedBox.classList.toggle('over', over);

    if (over && Date.now() - state.lastBeep > BEEP_EVERY_MS) {
      state.lastBeep = Date.now();
      if (settings.sound) beep();
      if (settings.vibrate) navigator.vibrate?.([200, 100, 200]);
    }
  }

  async function maybeLookup(fix) {
    if (state.lookupBusy) return;
    const now = Date.now();
    const moved = state.lookupFrom ? metersBetween(state.lookupFrom, fix) : Infinity;
    const due = !state.lookupFrom
      || (moved > LOOKUP_MIN_MOVE_M && now - state.lookupAt > LOOKUP_MIN_GAP_MS)
      || (moved > 20 && now - state.lookupAt > LOOKUP_MAX_AGE_MS)
      || (state.lookupError && now - state.lookupAt > LOOKUP_RETRY_MS);
    if (!due) return;
    state.lookupBusy = true;
    state.lookupAt = now;
    state.lookupFrom = fix;
    try {
      const found = await lookupLimit(fix.lat, fix.lon);
      state.lookupError = false;
      // Keep the previous limit if this spot has no tagged road (e.g. GPS drift, untagged ramp).
      if (found) {
        state.autoLimit = toUnits(found, units);
        state.roadName = found.road;
      }
    } catch {
      state.lookupError = true;
    } finally {
      state.lookupBusy = false;
      render();
    }
  }

  function onFix(pos) {
    const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp };
    let ms = pos.coords.speed;
    if ((ms == null || Number.isNaN(ms)) && state.lastFix) {
      const dt = (fix.t - state.lastFix.t) / 1000;
      ms = dt > 0 ? metersBetween(state.lastFix, fix) / dt : null;
    }
    state.lastFix = fix;
    state.speed = ms == null ? null : Math.max(0, ms * MS_TO[units]);
    ui.gps.textContent = `GPS ±${Math.round(pos.coords.accuracy)} m`;
    render();
    maybeLookup(fix);
  }

  function onError(err) {
    ui.gps.textContent = err.code === 1
      ? 'Location permission denied. Allow location for this site to use drive mode.'
      : `GPS problem: ${err.message}`;
  }

  if ('geolocation' in navigator) {
    state.watchId = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
    });
  } else {
    ui.gps.textContent = 'This browser has no GPS access.';
  }

  const step = units === 'kmh' ? 10 : 5;
  const nudge = dir => () => {
    const base = currentLimit() ?? (units === 'kmh' ? 50 : 30);
    state.manualLimit = Math.max(step, base + dir * step);
    render();
  };
  const onDown = nudge(-1), onUp = nudge(1);
  const onAuto = () => { state.manualLimit = null; render(); };
  ui.limitDown.textContent = `−${step}`;
  ui.limitUp.textContent = `+${step}`;
  ui.limitDown.addEventListener('click', onDown);
  ui.limitUp.addEventListener('click', onUp);
  ui.limitAuto.addEventListener('click', onAuto);

  render();

  return function stop() {
    if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
    state.wakeLock?.release?.();
    state.audio?.close?.();
    document.removeEventListener('visibilitychange', onVisible);
    ui.limitDown.removeEventListener('click', onDown);
    ui.limitUp.removeEventListener('click', onUp);
    ui.limitAuto.removeEventListener('click', onAuto);
  };
}
