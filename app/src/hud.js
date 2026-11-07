'use strict';
/* ============================================================
   HUD EXTRAS (Chunk 13): the minimap, the "next event" line, and the death sequence (jingle + YOU DIED fade).
   ============================================================ */

/* ---------- minimap: the heightmap drawn once per stage into a small canvas, then shown heading-up around the player ---------- */
const MM = { img: null, ctx: null, t: 0, range: 70, built: -1 };
function mmBuild() {
  const c = document.createElement('canvas'); c.width = c.height = GRID; const g = c.getContext('2d'), id = g.createImageData(GRID, GRID);
  let mx = 1; for (let k = 0; k < NC; k++) if (inner(k)) mx = Math.max(mx, H[k]);
  for (let k = 0; k < NC; k++) {
    const t = inner(k) ? clamp(H[k] / mx, 0, 1) : 0, v = inner(k) ? 22 + t * 78 : 4;      // dark low ground, lighter high ground, black walls
    id.data[k * 4] = v * 0.8; id.data[k * 4 + 1] = v * 0.95; id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0); MM.img = c;
}
function drawMinimap(dt) {
  const cv = $('#minimap'); if (!cv || !MM.img) return;
  MM.t -= dt; if (MM.t > 0) return; MM.t = 1 / 15;
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height, cx = W / 2, cy = Hh / 2, ppm = (W / 2) / MM.range;
  const dir = camera.getWorldDirection(_mmV); let fx = dir.x, fz = dir.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const P = player.pos;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#05070a'; g.fillRect(0, 0, W, Hh);
  g.save(); g.beginPath(); g.rect(0, 0, W, Hh); g.clip();
  // terrain: world x -> (-fz, -fx), world z -> (fx, -fz) on screen (forward is up)
  g.imageSmoothingEnabled = false;
  g.setTransform(-fz * ppm * CELL, -fx * ppm * CELL, fx * ppm * CELL, -fz * ppm * CELL, cx, cy);
  g.translate(-(P.x + HALF) / CELL, -(P.z + HALF) / CELL); g.globalAlpha = 0.85; g.drawImage(MM.img, 0, 0); g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const to = (x, z) => { const dx = x - P.x, dz = z - P.z; return [cx + (-fz * dx + fx * dz) * ppm, cy - (fx * dx + fz * dz) * ppm]; };
  const R2 = MM.range * MM.range * 1.1;
  // range rings
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, r * W / 2 - 1, 0, 6.2832); g.stroke(); }
  const dot = (x, z, s, col, hollow) => { const [sx, sy] = to(x, z); if (sx < 2 || sy < 2 || sx > W - 2 || sy > Hh - 2) return; if (hollow) { g.strokeStyle = col; g.strokeRect(sx - s / 2, sy - s / 2, s, s); } else { g.fillStyle = col; g.fillRect(sx - s / 2, sy - s / 2, s, s); } };
  let n = 0;
  for (const e of enemies) {
    if (e.dead || e.d.npc || ++n > 400) continue;
    const dx = e.pos.x - P.x, dz = e.pos.z - P.z; if (dx * dx + dz * dz > R2) continue;
    if (e.boss) dot(e.pos.x, e.pos.z, 7, '#ff3a3a'); else if (e.mini || e.elite) dot(e.pos.x, e.pos.z, 4, '#ff7a3a', true); else dot(e.pos.x, e.pos.z, 2.4, '#e2465c');
  }
  if (S.gate) dot(S.gate.x, S.gate.z, 6, S.gate.state === 'exit' ? '#58cfd6' : '#6b7b86', true);
  if (S.shop) dot(S.shop.x, S.shop.z, 5, '#e8c35a');
  if (S.terminal) dot(S.terminal.x, S.terminal.z, 5, '#7dff9a');
  g.restore();
  // you: a small arrow, always pointing up
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--orange') || '#ff7a1a';
  g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 4.5, cy + 4.5); g.lineTo(cx, cy + 2); g.lineTo(cx - 4.5, cy + 4.5); g.closePath(); g.fill();
  g.fillStyle = '#9fb0ba'; g.font = '9px monospace'; g.fillText('N', ...to(P.x + (-0) , P.z - MM.range * 0.93).map((v, i) => clamp(v - (i ? -3 : 3), 4, W - 10)));
  const k = $('#mmKey'); if (k && !k.dataset.set) { k.dataset.set = 1; k.innerHTML = '<i style="background:#e2465c"></i>foe <i style="background:#e8c35a"></i>store <i style="background:#58cfd6"></i>exit'; }
}
const _mmV = new THREE.Vector3();

/* ---------- next event: the nearest of the next horde and the boss ---------- */
function nextEventText() {
  if (S.mode === 'drop') return 'Drop';
  if (S.bossDead) return 'Exit open';
  if (S.boss) return overtime() > 0 ? 'OVERTIME · kill the boss' : 'Kill the boss';
  const evs = [['Boss', BOSS_AT - S.t]];
  const h = S.hordes && S.hordes[S.hordeIdx]; if (h && S.t < BOSS_AT) evs.push(['Horde', h.t - S.t]);
  evs.sort((a, b) => a[1] - b[1]);
  return `Next · ${evs[0][0]} ${fmt(Math.max(0, evs[0][1]))}`;
}
/* the boss bar names whatever boss is up (any of the five) */
function bossLabel(e) { return e === S.boss ? `${(typeof ENEMY_NAMES !== 'undefined' && ENEMY_NAMES[e.type] || 'Boss').toUpperCase()} · STAGE ${S.stage}` : `BRUTE CRAWLER · ${fmt(S.t)}`; }

/* ---------- death: a short descending jingle (skippable), YOU DIED fading in over the wreck, then the stats ---------- */
const DEATH = { gain: null, t: 0, skipped: false, on: false };
function deathJingle() {
  if (!actx) return;
  try {
    const t0 = actx.currentTime + 0.05, master = actx.createGain(); master.gain.value = 0.32; master.connect(actx.destination); DEATH.gain = master;
    const note = (f, at, dur, type, g) => { const o = actx.createOscillator(), e = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at); o.frequency.exponentialRampToValueAtTime(f * 0.97, t0 + at + dur); e.gain.setValueAtTime(0.0001, t0 + at); e.gain.exponentialRampToValueAtTime(g, t0 + at + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(e); e.connect(master); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); };
    [[392, 0], [349, 0.38], [311, 0.76], [262, 1.2], [196, 1.9]].forEach(([f, at], i) => { note(f, at, i === 4 ? 1.5 : 0.5, 'square', 0.22); note(f / 2, at, i === 4 ? 1.6 : 0.5, 'triangle', 0.3); });
    note(55, 1.9, 1.6, 'sine', 0.5);
  } catch (e) {}
}
function deathStart() {
  DEATH.on = true; DEATH.skipped = false; DEATH.t = 0; deathJingle();
  const el = $('#youDied'); if (el) { el.hidden = false; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
}
function deathSkip() {
  if (!DEATH.on || DEATH.skipped) return; DEATH.skipped = true;
  try { if (DEATH.gain) { DEATH.gain.gain.cancelScheduledValues(actx.currentTime); DEATH.gain.gain.setTargetAtTime(0, actx.currentTime, 0.04); } } catch (e) {}
  if (S.mode === 'dying') S.dieT = Math.min(S.dieT, 0.35);
}
function deathEnd() { DEATH.on = false; const el = $('#youDied'); if (el) { el.hidden = true; el.classList.remove('on'); } }
addEventListener('keydown', e => { if (DEATH.on && !e.repeat) deathSkip(); });
addEventListener('mousedown', () => { if (DEATH.on) deathSkip(); });
addEventListener('gamepadbuttondown', () => { if (DEATH.on) deathSkip(); });
{ const c = document.getElementById('crt'); if (c) c.hidden = SETTINGS.crt === false; }
