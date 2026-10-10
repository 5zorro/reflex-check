// Simple reaction-time test: the pad turns green after a random delay; tap as fast as you can.

import { median } from './scoring.js';

const TRIALS = 5;
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 4000;
const LAPSE_MS = 2000;          // no tap within this long counts as a lapse at this value
const ANTICIPATION_MS = 100;    // faster than humanly possible = guessed, counts as a false start
const MAX_FALSE_STARTS = 10;

/**
 * Runs the test inside `pad`. Resolves with { reactionMs, times, falseStarts }.
 * @param {HTMLElement} pad
 * @param {HTMLElement} msg
 * @param {HTMLElement} sub
 */
export function runReaction(pad, msg, sub) {
  return new Promise(resolve => {
    const times = [];
    let falseStarts = 0;
    let state = 'idle';   // idle | wait | go | pause
    let goAt = 0;
    let timer = 0;

    const show = (cls, text, subText = '') => {
      pad.className = `pad ${cls}`;
      msg.textContent = text;
      sub.textContent = subText;
    };

    const progress = () => `Tap ${times.length + 1} of ${TRIALS}`;

    function startTrial() {
      state = 'wait';
      show('wait', 'Wait for green…', progress());
      timer = setTimeout(goGreen, MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
    }

    function goGreen() {
      state = 'go';
      goAt = performance.now();
      show('go', 'TAP!', '');
      // Refine to the frame the green actually paints (if one paints before the tap).
      requestAnimationFrame(t => { if (state === 'go') goAt = Math.max(goAt, t); });
      timer = setTimeout(() => record(LAPSE_MS, 'Too slow'), LAPSE_MS);
    }

    function record(ms, label) {
      clearTimeout(timer);
      times.push(ms);
      state = 'pause';
      show('info', label ?? `${Math.round(ms)} ms`, times.length < TRIALS ? 'Get ready…' : '');
      setTimeout(next, 900);
    }

    function falseStart(text) {
      clearTimeout(timer);
      falseStarts++;
      state = 'pause';
      show('info', text, 'Wait for green. Restarting this tap…');
      setTimeout(next, 1200);
    }

    function next() {
      if (falseStarts >= MAX_FALSE_STARTS) {
        while (times.length < TRIALS) times.push(LAPSE_MS);
      }
      if (times.length >= TRIALS) return finish();
      startTrial();
    }

    function finish() {
      pad.removeEventListener('pointerdown', onTap);
      resolve({ reactionMs: Math.round(median(times)), times: times.map(Math.round), falseStarts });
    }

    function onTap(e) {
      e.preventDefault();
      if (state === 'idle') return startTrial();
      if (state === 'wait') return falseStart('Too soon!');
      if (state === 'go') {
        const rt = e.timeStamp - goAt;
        if (rt < ANTICIPATION_MS) return falseStart('Too soon!');
        return record(rt);
      }
    }

    show('info', 'Reaction test', 'Tap anywhere to begin. Then tap the moment the screen turns green.');
    pad.addEventListener('pointerdown', onTap);
  });
}
