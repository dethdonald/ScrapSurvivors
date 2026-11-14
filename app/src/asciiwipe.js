'use strict';
/* ============================================================
   ASCII WIPE: a terminal-style transition between menu screens. A canvas overlay sweeps a sheet of
   random monospace glyphs across the screen left-to-right, the DOM swap happens once fully covered
   (so it's invisible), then the glyphs clear away the same direction to reveal what's underneath.
   Used wherever one menu/panel replaces another (Options <-> its submenus, Customize, Catalog, ...).
   Never used for pausing/resuming gameplay itself -- only menu-to-menu jumps.
   ============================================================ */
const AWIPE_CHARS = '#%&*+-.:=|/\\<>[]01';
let AW = null;
function asciiWipeInit() {
  if (AW) return AW;
  const cv = document.createElement('canvas'); cv.id = 'asciiWipe';
  cv.style.cssText = 'position:fixed;inset:0;z-index:500;pointer-events:none;opacity:0';
  document.body.appendChild(cv);
  AW = { cv, ctx: cv.getContext('2d'), raf: 0, busy: false };
  return AW;
}
/* swapFn runs once the screen is fully covered, so the DOM swap inside it is never seen.
   dir: 'l' / 'r' / 'u' / 'd' is the way the sheet travels; left out, a random one is picked (menus).
   Gameplay always passes 'u' so going to the build bay and back always reads as the same move. */
function asciiWipe(swapFn, dir) {
  const A = asciiWipeInit(), { cv, ctx } = A;
  if (A.busy) { try { swapFn(); } catch (e) {} return; }         // already wiping: just do the swap
  A.busy = true;
  dir = dir || 'lrud'[(Math.random() * 4) | 0];
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, Hh = innerHeight;
  cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 13, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(Hh / cell) + 1;
  const css = getComputedStyle(document.documentElement), col = (css.getPropertyValue('--accent') || '').trim() || '#ff7a1a';
  const IN = 150, OUT = 150, t0 = performance.now();              // quick: about a third of a second end to end
  const horiz = dir === 'l' || dir === 'r', n = horiz ? cols : rows, EDGE = 5;
  /* Each cell keeps its glyph instead of being re-rolled every frame: re-rolling the whole sheet 60 times a
     second is what made the old wipe boil and flicker. A few cells change each frame, which reads as a
     terminal filling in rather than static. */
  const glyph = new Uint8Array(cols * rows), gap = new Uint8Array(cols * rows);
  for (let i = 0; i < glyph.length; i++) { glyph[i] = (Math.random() * AWIPE_CHARS.length) | 0; gap[i] = Math.random() < 0.06 ? 1 : 0; }
  const axis = (cx, ry) => dir === 'l' ? cx : dir === 'r' ? cols - 1 - cx : dir === 'u' ? rows - 1 - ry : ry;
  let swapped = false;
  cv.style.opacity = 1;
  function draw(frac) {
    ctx.clearRect(0, 0, W, Hh);
    const front = frac * (n + EDGE * 2) - EDGE;
    // the sheet is backed with black so whatever is behind it is properly hidden, not just speckled over
    const x0 = dir === 'l' ? 0 : dir === 'r' ? W : 0, y0 = dir === 'u' ? Hh : dir === 'd' ? 0 : 0;
    const x1 = dir === 'l' ? W : dir === 'r' ? 0 : 0, y1 = dir === 'u' ? 0 : dir === 'd' ? Hh : 0;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const at = clamp(front / n, 0, 1), soft = Math.min(0.5, EDGE / n);
    g.addColorStop(0, 'rgba(4,6,8,0.97)');
    g.addColorStop(clamp(at - soft, 0, 1), 'rgba(4,6,8,0.97)');
    g.addColorStop(clamp(at, 0.001, 1), 'rgba(4,6,8,0)');
    g.addColorStop(1, 'rgba(4,6,8,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
    // a few glyphs change each frame
    for (let i = 0; i < 90; i++) { const k = (Math.random() * glyph.length) | 0; glyph[k] = (Math.random() * AWIPE_CHARS.length) | 0; }
    ctx.font = `${cell - 2}px var(--f-mono), monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = col;
    for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
      const k = cx * rows + ry; if (gap[k]) continue;
      const d = front - axis(cx, ry); if (d < 0) continue;
      ctx.globalAlpha = Math.min(1, d / EDGE) * 0.9;
      ctx.fillText(AWIPE_CHARS[glyph[k]], cx * cell, ry * cell);
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    const t = now - t0;
    if (t < IN) { draw(t / IN); AW.raf = requestAnimationFrame(tick); return; }
    if (!swapped) { swapped = true; try { swapFn(); } catch (e) {} draw(1); }
    const t2 = t - IN;
    if (t2 < OUT) { draw(1 - t2 / OUT); AW.raf = requestAnimationFrame(tick); return; }
    ctx.clearRect(0, 0, W, Hh); cv.style.opacity = 0; A.busy = false;
  }
  cancelAnimationFrame(AW.raf);
  AW.raf = requestAnimationFrame(tick);
}
/* keeps every slider's --pct custom property in sync with its value, however that value changed
   (drag, keyboard/gamepad nav, or set programmatically) -- the CSS block-segment track reads it. */
(function rangeSync() {
  function tick() {
    for (const el of document.querySelectorAll('input[type=range]')) {
      const min = +el.min || 0, max = +el.max || 100, v = +el.value || 0;
      el.style.setProperty('--pct', (max > min ? (v - min) / (max - min) * 100 : 0) + '%');
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
