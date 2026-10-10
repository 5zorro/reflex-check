// Headless check that the dodge game separates fast and slow reactions.
// A simple virtual player steers away from blocks, but only "sees" the field
// `lagMs` late and can only move its hand so fast. More lag should mean shorter survival.
//
//   node tools/sim_dodge.mjs

import { createGame, GEOMETRY } from '../js/dodge.js';

const { FIELD, WALL, PLAYER } = GEOMETRY;
const DT = 1 / 60;
const MAX_SECONDS = 120;

export function simulate({ lagMs, handSpeed = 450 }) {
  const game = createGame();
  const p = game.player;
  const history = [];  // past block snapshots, so the bot reacts to old information
  const lagFrames = Math.round(lagMs / 1000 / DT);

  while (game.elapsed < MAX_SECONDS) {
    history.push(game.blocks.map(b => ({ ...b })));
    const seen = history[Math.max(0, history.length - 1 - lagFrames)];

    // Push away from every block (stronger when close) and from the walls.
    const cx = p.x + PLAYER / 2, cy = p.y + PLAYER / 2;
    let fx = 0, fy = 0;
    for (const s of seen) {
      // Anticipate a little: where will this block be shortly (as last seen)?
      const b = { ...s, x: s.x + s.vx * 60, y: s.y + s.vy * 60 };
      for (const q of [s, b]) {
        const gx = Math.max(q.x - (p.x + PLAYER), p.x - (q.x + q.w), 0);
        const gy = Math.max(q.y - (p.y + PLAYER), p.y - (q.y + q.h), 0);
        const d = Math.max(2, Math.hypot(gx, gy));
        const dx = cx - (q.x + q.w / 2), dy = cy - (q.y + q.h / 2);
        const n = Math.hypot(dx, dy) || 1;
        fx += (dx / n) * 3000 / (d * d);
        fy += (dy / n) * 3000 / (d * d);
      }
    }
    const lo = WALL + 4, hi = FIELD - WALL - PLAYER - 4;
    fx += 1500 / Math.max(1, p.x - lo) ** 2 - 1500 / Math.max(1, hi - p.x) ** 2;
    fy += 1500 / Math.max(1, p.y - lo) ** 2 - 1500 / Math.max(1, hi - p.y) ** 2;
    // Gentle pull toward the middle so it doesn't hug a wall.
    fx += (FIELD / 2 - cx) * 0.002;
    fy += (FIELD / 2 - cy) * 0.002;

    const mag = Math.hypot(fx, fy);
    if (mag > 0.01) {
      const v = Math.min(handSpeed, mag * 200);
      p.x += (fx / mag) * v * DT;
      p.y += (fy / mag) * v * DT;
    }
    if (game.advance(DT)) break;
  }
  return game.elapsed;
}

const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('sim_dodge.mjs')) {
  console.log('lag(ms)  median survival over 200 runs');
  for (const lagMs of [0, 150, 250, 350, 500, 700]) {
    const runs = Array.from({ length: 200 }, () => simulate({ lagMs }));
    console.log(`${String(lagMs).padStart(6)}   ${median(runs).toFixed(1)} s`);
  }
  const still = Array.from({ length: 200 }, () => {
    const g = createGame();
    while (!g.advance(DT) && g.elapsed < 30);
    return g.elapsed;
  });
  console.log(`\nNot moving at all: crashes after ${median(still).toFixed(2)} s (min ${Math.min(...still).toFixed(2)} s)`);
}
