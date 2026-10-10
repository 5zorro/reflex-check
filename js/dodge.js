// The dodge game, modeled on the classic "Pilot Trainer" shape game:
// steer the red square, avoid the bouncing blue blocks and the black wall.
// Blocks speed up over time. Score = seconds survived.

const FIELD = 450;        // logical field size (square)
const WALL = 50;          // thickness of the black border the player must not touch
const PLAYER = 40;
const BASE_SPEED = 150;   // logical px/sec at t=0
const SPEEDUP = 0.045;    // +4.5% speed per second survived
const MAX_SPEED_MULT = 3;
const JITTER_DEG = 8;     // small random angle change per run so it can't be memorized exactly
const SUBSTEP = 1 / 240;  // physics step (s); small enough that fast blocks can't skip over the player

const COLORS = { wall: '#000000', field: '#ffffff', block: '#1f4fd8', player: '#e01b24', hit: '#ff9f1a' };

// Start layout: one block in each corner (over the wall), each on a diagonal that
// doesn't aim straight at the player, so there's a fair moment to react.
const BLOCKS = [
  { x: 15,  y: 15,  w: 60,  h: 50,  dx:  1,   dy:  0.55 },
  { x: 335, y: 15,  w: 100, h: 20,  dx: -0.5, dy:  1    },
  { x: 15,  y: 375, w: 30,  h: 60,  dx:  1,   dy: -0.45 },
  { x: 375, y: 375, w: 60,  h: 60,  dx: -0.6, dy: -1    },
];

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function makeBlocks() {
  return BLOCKS.map(b => {
    const angle = Math.atan2(b.dy, b.dx) + ((Math.random() * 2 - 1) * JITTER_DEG * Math.PI) / 180;
    return { ...b, vx: Math.cos(angle), vy: Math.sin(angle) };
  });
}

/** Sizes the canvas to the largest square that fits and returns logical->CSS scale. */
function fitCanvas(canvas) {
  const hud = canvas.previousElementSibling?.offsetHeight ?? 0;
  const size = Math.floor(Math.min(window.innerWidth, window.innerHeight - hud - 60));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.width = canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform((size * dpr) / FIELD, 0, 0, (size * dpr) / FIELD, 0, 0);
  return { ctx, scale: size / FIELD };
}

function draw(ctx, player, blocks, crashed) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, FIELD, FIELD);
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(WALL, WALL, FIELD - 2 * WALL, FIELD - 2 * WALL);
  ctx.fillStyle = COLORS.block;
  for (const b of blocks) ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = crashed ? COLORS.hit : COLORS.player;
  ctx.fillRect(player.x, player.y, player.w, player.h);
}

/**
 * The game rules with no DOM, so they can also run headless (see tools/sim_dodge.mjs).
 * Move `game.player` yourself; call `advance(dt)` each frame. It returns true on a crash.
 */
export function createGame() {
  const start = (FIELD - PLAYER) / 2;
  const game = {
    player: { x: start, y: start, w: PLAYER, h: PLAYER },
    blocks: makeBlocks(),
    elapsed: 0,
    crashed() {
      const p = game.player, inner = WALL, outer = FIELD - WALL;
      if (p.x < inner || p.y < inner || p.x + p.w > outer || p.y + p.h > outer) return true;
      return game.blocks.some(b => overlap(p, b));
    },
    advance(dt) {
      let hit = game.crashed();
      while (dt > 0 && !hit) {
        const h = Math.min(SUBSTEP, dt);
        const speed = BASE_SPEED * Math.min(MAX_SPEED_MULT, 1 + SPEEDUP * game.elapsed);
        for (const b of game.blocks) {
          b.x += b.vx * speed * h;
          b.y += b.vy * speed * h;
          if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
          if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
          if (b.x + b.w > FIELD) { b.x = FIELD - b.w; b.vx = -Math.abs(b.vx); }
          if (b.y + b.h > FIELD) { b.y = FIELD - b.h; b.vy = -Math.abs(b.vy); }
        }
        game.elapsed += h;
        dt -= h;
        hit = game.crashed();
      }
      return hit;
    },
  };
  return game;
}

export const GEOMETRY = { FIELD, WALL, PLAYER };

/**
 * Plays one round. Resolves with seconds survived.
 * @param {HTMLCanvasElement} canvas
 * @param {(sec:number)=>void} onTick  called every frame with elapsed seconds
 * @param {(text:string)=>void} say    shows a message under the field
 */
export function playRound(canvas, onTick, say) {
  return new Promise(resolve => {
    const { ctx, scale } = fitCanvas(canvas);
    const game = createGame();
    const { player, blocks } = game;
    const area = canvas.parentElement; // the whole screen is the touch pad, not just the field

    let running = false;
    let last = 0;
    let drag = null;   // { pointerId, px, py, sx, sy }

    draw(ctx, player, blocks, false);
    onTick(0);
    say('Put a finger anywhere and drag to steer the red square.');

    function onDown(e) {
      e.preventDefault();
      if (drag) return; // ignore a second finger
      try { area.setPointerCapture(e.pointerId); } catch { /* capture is a nicety, not required */ }
      drag = { pointerId: e.pointerId, px: e.clientX, py: e.clientY, sx: player.x, sy: player.y };
      if (!running && game.elapsed === 0) {
        running = true;
        say('');
        last = performance.now();
        requestAnimationFrame(frame);
      }
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.preventDefault();
      // Relative drag: the square moves with your finger but sits where it was, so your finger doesn't cover it.
      player.x = drag.sx + (e.clientX - drag.px) / scale;
      player.y = drag.sy + (e.clientY - drag.py) / scale;
    }

    function onUp(e) {
      if (drag && e.pointerId === drag.pointerId) drag = null;
    }

    function frame(now) {
      // Cap the frame gap so a backgrounded tab pauses the game instead of fast-forwarding it.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const hit = game.advance(dt);
      draw(ctx, player, blocks, hit);
      onTick(game.elapsed);
      if (hit) return end();
      requestAnimationFrame(frame);
    }

    function end() {
      running = false;
      area.removeEventListener('pointerdown', onDown);
      area.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      say(`You lasted ${game.elapsed.toFixed(1)} s`);
      setTimeout(() => resolve(game.elapsed), 1400);
    }

    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}
