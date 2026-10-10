// Turns raw test numbers into a score and a speed cap.
//
// Score = 100 means "performing exactly like your own baseline".
// Each half of the check (reaction, dodge) contributes up to 75 points,
// so the max score is 150.

import { getHistory } from './storage.js';

/** Used until the person has done enough calibration runs. Rough adult numbers on a phone touchscreen. */
export const POPULATION_BASELINE = { reactionMs: 330, dodgeSec: 12, isDefault: true };

export const CALIBRATION_RUNS_NEEDED = 3;
const CALIBRATION_WINDOW = 5; // baseline = median of the most recent N calibration runs

/**
 * Speed bands. offsetMph is added to the posted limit (always <= 0: the app never
 * suggests going over the limit). offsetMph === null means "don't drive".
 */
export const BANDS = [
  { min: 110, offsetMph: 0,    label: 'Sharper than usual', cls: 'green',
    advice: 'Better than your baseline. Cap is the posted limit.' },
  { min: 95,  offsetMph: -5,   label: 'At your baseline',   cls: 'green',
    advice: 'Normal for you. Cap is 5 under the posted limit.' },
  { min: 85,  offsetMph: -10,  label: 'Slower than usual',  cls: 'yellow',
    advice: 'Noticeably slower than your baseline. Take it easy, or wait and retest.' },
  { min: 75,  offsetMph: -15,  label: 'Much slower',        cls: 'orange',
    advice: 'Well below your baseline. Strongly consider not driving.' },
  { min: -Infinity, offsetMph: null, label: "Don't drive",  cls: 'red',
    advice: 'Far below your baseline. Do not drive. Get a ride or wait.' },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function median(values) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function getBaseline() {
  const runs = getHistory().filter(r => r.kind === 'calibration').slice(0, CALIBRATION_WINDOW);
  if (runs.length < CALIBRATION_RUNS_NEEDED) {
    return { ...POPULATION_BASELINE, runs: runs.length };
  }
  return {
    reactionMs: median(runs.map(r => r.reactionMs)),
    dodgeSec: median(runs.map(r => r.dodgeSec)),
    isDefault: false,
    runs: runs.length,
  };
}

/**
 * @param {{reactionMs:number, falseStarts:number, dodgeSec:number}} raw
 * @param {{reactionMs:number, dodgeSec:number}} baseline
 */
export function scoreCheck(raw, baseline) {
  // Faster than baseline -> ratio > 1. Each false start (tapping before green) costs 7%.
  const reactionRatio = clamp(baseline.reactionMs / raw.reactionMs, 0, 1.5) * Math.pow(0.93, raw.falseStarts);
  const dodgeRatio = clamp(raw.dodgeSec / baseline.dodgeSec, 0, 1.5);
  const score = Math.round(50 * reactionRatio + 50 * dodgeRatio);
  const band = BANDS.find(b => score >= b.min);
  return { score, reactionRatio, dodgeRatio, band };
}

export function bandFor(score) {
  return BANDS.find(b => score >= b.min);
}

export const MPH_TO_KMH = 1.609344;

/** Offset in the user's display units, rounded to a whole number. */
export function offsetInUnits(offsetMph, units) {
  if (offsetMph === null) return null;
  return units === 'kmh' ? Math.round(offsetMph * MPH_TO_KMH) : offsetMph;
}
