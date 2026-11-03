'use strict';
/* ============================================================
   WINDOWS: menus behave like desktop windows. Grab the hazard-stripe bar along the top to move one,
   pull the corner grip to resize it. Where you leave them is saved and comes back next time.
   Options > "Reset window layout" puts everything back.
   ============================================================ */
const WIN_KEY = 'scrapsurvivors.layout';
let WIN_LAYOUT = {};
try { WIN_LAYOUT = JSON.parse(localStorage.getItem(WIN_KEY) || '{}') || {}; } catch (e) {}
const saveWinLayout = () => { try { localStorage.setItem(WIN_KEY, JSON.stringify(WIN_LAYOUT)); } catch (e) {} };
const WINS = [];

/* the element's zoom (UI scale): positions on a zoomed element are in its own, zoomed pixels */
const winZoom = el => parseFloat(getComputedStyle(el).zoom) || 1;

/* Menus used to be draggable/resizable windows. That didn't feel good, so it's off: makeWin now only adds the
   hazard-stripe bar along the top as decoration. Any layout saved by older builds is wiped so panels sit where they belong. */
const WINDOWS_MOVABLE = false;
try { localStorage.removeItem(WIN_KEY); } catch (e) {}
WIN_LAYOUT = {};
function makeWin(el, id, opts = {}) {
  if (!el || el.dataset.win) return;
  el.dataset.win = id; el.classList.add('win');
  const bar = document.createElement('div'); bar.className = 'winbar static';
  el.prepend(bar);
  if (!WINDOWS_MOVABLE) return;
  makeWinMovable(el, id, opts, bar);
}
function makeWinMovable(el, id, opts, bar) {
  const grip = document.createElement('div'); grip.className = 'wingrip'; grip.title = 'Drag to resize';
  bar.classList.remove('static'); bar.title = 'Drag to move · double-click to reset';
  el.append(grip);
  WINS.push({ el, id, opts });
  const start = (e, mode) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const z = winZoom(el), r = el.getBoundingClientRect();
    detach(el, r, z);
    const s0 = { x: e.clientX, y: e.clientY, l: r.left / z, t: r.top / z, w: r.width / z, h: r.height / z, z };
    document.body.classList.add(mode === 'move' ? 'win-moving' : 'win-sizing');
    const move = ev => {
      const dx = (ev.clientX - s0.x) / s0.z, dy = (ev.clientY - s0.y) / s0.z;
      if (mode === 'move') { el.style.left = (s0.l + dx) + 'px'; el.style.top = (s0.t + dy) + 'px'; }
      else { el.style.width = Math.max(opts.minW || 200, s0.w + dx) + 'px'; el.style.height = Math.max(opts.minH || 120, s0.h + dy) + 'px'; el.style.maxHeight = 'none'; el.style.maxWidth = 'none'; }
      keepOnScreen(el);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('win-moving', 'win-sizing');
      const L0 = WIN_LAYOUT[id] || {};
      L0.x = parseFloat(el.style.left); L0.y = parseFloat(el.style.top);
      if (mode === 'size' || L0.w) { L0.w = parseFloat(el.style.width); if (el.style.height) L0.h = parseFloat(el.style.height); }
      WIN_LAYOUT[id] = L0; saveWinLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  bar.addEventListener('pointerdown', e => start(e, 'move'));
  grip.addEventListener('pointerdown', e => start(e, 'size'));
  bar.addEventListener('dblclick', () => { delete WIN_LAYOUT[id]; saveWinLayout(); resetWin(el); });
  applyWin(el, id);
}
/* take it out of the page flow and pin it where it is right now, so moving it doesn't jump */
function detach(el, r, z) {
  if (el.classList.contains('win-free')) return;
  el.classList.add('win-free');
  Object.assign(el.style, { position: 'fixed', left: r.left / z + 'px', top: r.top / z + 'px', right: 'auto', bottom: 'auto', transform: 'none', margin: '0', width: r.width / z + 'px', height: r.height / z + 'px', maxHeight: 'none' });
}
function applyWin(el, id) {
  const L0 = WIN_LAYOUT[id]; if (!L0 || !isFinite(L0.x)) return;
  el.classList.add('win-free');
  Object.assign(el.style, { position: 'fixed', left: L0.x + 'px', top: L0.y + 'px', right: 'auto', bottom: 'auto', transform: 'none', margin: '0' });
  if (L0.w) { el.style.width = L0.w + 'px'; el.style.maxWidth = 'none'; }
  if (L0.h) { el.style.height = L0.h + 'px'; el.style.maxHeight = 'none'; }
}
function resetWin(el) {
  el.classList.remove('win-free');
  for (const k of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'margin', 'width', 'height', 'maxHeight', 'maxWidth']) el.style[k] = '';
}
/* never lose a window off the edge: at least its bar stays on screen */
function keepOnScreen(el) {
  if (!el.classList.contains('win-free') || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
  const z = winZoom(el), r = el.getBoundingClientRect();
  if (!r.width) return;
  const minVis = 60;
  let l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
  if (r.right < minVis) l += (minVis - r.right) / z;
  if (r.left > innerWidth - minVis) l -= (r.left - innerWidth + minVis) / z;
  if (r.top < 0) t -= r.top / z;
  if (r.top > innerHeight - 24) t -= (r.top - innerHeight + 24) / z;
  el.style.left = l + 'px'; el.style.top = t + 'px';
}
function resetWinLayout() {
  for (let i = WINS.length - 1; i >= 0; i--) if (!document.body.contains(WINS[i].el)) WINS.splice(i, 1); WIN_LAYOUT = {}; saveWinLayout(); WINS.forEach(w => resetWin(w.el)); }
addEventListener('resize', () => WINS.forEach(w => keepOnScreen(w.el)));

/* the menus that act as windows */
makeWin($('#inv .bstats'), 'bench-stats', { minW: 220, minH: 90 });
makeWin($('#inv .abilities'), 'bench-abilities', { minW: 220, minH: 90 });
makeWin($('#partsPanel'), 'bench-parts', { minW: 240, minH: 260 });
makeWin($('#custPanel'), 'customize', { minW: 300, minH: 260 });
makeWin($('#optMenu'), 'options2', { minW: 340, minH: 260 });
makeWin($('#over .overcard'), 'gameover', { minW: 420, minH: 320 });

