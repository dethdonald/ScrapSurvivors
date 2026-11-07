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
  AW = { cv, ctx: cv.getContext('2d'), raf: 0 };
  return AW;
}
/* swapFn runs once the screen is fully covered by glyphs, so any hidden/hidden DOM swap inside it is unseen. */
function asciiWipe(swapFn) {
  const { cv, ctx } = asciiWipeInit();
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, Hh = innerHeight;
  cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 13, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(Hh / cell) + 1;
  const css = getComputedStyle(document.documentElement), col = (css.getPropertyValue('--accent') || '').trim() || '#ff7a1a';
  const IN = 200, OUT = 200, t0 = performance.now();
  let swapped = false;
  cv.style.opacity = 1;
  function draw(frac) {   // frac 0..1 = how far the sweep has crossed (each column fades in just behind the front)
    ctx.clearRect(0, 0, W, Hh);
    ctx.font = `${cell - 2}px var(--f-mono), monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = col;
    const front = frac * (cols + 8) - 4;
    for (let cx = 0; cx < cols; cx++) {
      const d = front - cx; if (d < 0) continue;
      const a = Math.min(1, d / 3);
      ctx.globalAlpha = a * 0.92;
      for (let ry = 0; ry < rows; ry++) {
        if (Math.random() < 0.08) continue;      // a few gaps so it never reads as a solid sheet
        ctx.fillText(AWIPE_CHARS[(Math.random() * AWIPE_CHARS.length) | 0], cx * cell, ry * cell);
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    const t = now - t0;
    if (t < IN) { draw(t / IN); AW.raf = requestAnimationFrame(tick); return; }
    if (!swapped) { swapped = true; try { swapFn(); } catch (e) {} draw(1); }
    const t2 = t - IN;
    if (t2 < OUT) { draw(1 - t2 / OUT); AW.raf = requestAnimationFrame(tick); return; }
    ctx.clearRect(0, 0, W, Hh); cv.style.opacity = 0;
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
