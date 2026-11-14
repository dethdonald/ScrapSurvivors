'use strict';
/* Keyboard, mouse and gamepad. Gameplay reads the IN object; presses are latched until consumed.
   Keyboard: WASD move, Space jump, Shift sprint, C / Ctrl slide, Q dash, LMB fire, E interact, Enter inventory, Esc pause.
   Gamepad (standard layout, Steam Deck): L stick move, R stick look, A jump, B slide, X interact, RB dash, LB sprint (hold) or L3 (toggle), RT fire, View/Y inventory, Start pause. */
const keys = {};
const IN = {
  mx: 0, mz: 0, mag: 0, jumpHeld: false, sprint: false, fire: false,
  jumpP: false, slideP: false, dashP: false, interactP: false,
  device: 'kbm', padSprintLatch: false,
};
let mouseFire = false, mouseLook = false, mouseZoom = false;

function menuOpen() { return ['catalog', 'wcase', 'devpanel', 'roulette', 'title', 'custom', 'hangar', 'inv', 'levelup', 'perk', 'pause', 'over', 'shop', 'terminal'].includes(S.mode); }
/* (typeof S: mouse and key events can arrive while the later scripts are still loading, before game.js has made S.
   That threw "S is not defined" hundreds of times in the log on a slow start.) */
const booted = () => typeof S !== 'undefined';
function playing() { return booted() && (S.mode === 'play' || S.mode === 'drop'); }   // (the drop countdown is not 'playing': nothing moves yet)

addEventListener('keydown', e => {
  IN.device = 'kbm';
  const first = !keys[e.code];
  keys[e.code] = true;
  if (S.test && (e.code === 'F1' || e.code === 'Backquote') && first && (S.mode === 'play' || S.mode === 'devpanel')) { devPanelToggle(); e.preventDefault(); return; }
  if (menuOpen()) {
    if (e.code === 'ArrowLeft') { navH(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight') { navH(1); e.preventDefault(); }
    else if (e.code === 'ArrowUp') { navMove(0, -1); e.preventDefault(); }
    else if (e.code === 'ArrowDown') { navMove(0, 1); e.preventDefault(); }
    else if (e.code === 'Escape') { menuBack(); e.preventDefault(); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && S.mode === 'inv') { if (first) closeInventory(); e.preventDefault(); }
    else if (e.code === 'Tab' && S.mode === 'inv' && first) { closeInventory(); e.preventDefault(); }
    return;
  }
  if (!first) return;
  if (e.code === 'Space') { IN.jumpP = true; e.preventDefault(); }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') IN.slideP = true;
  if (e.code === 'KeyQ') IN.dashP = true;
  if (e.code === 'KeyE' || e.code === 'KeyF') IN.interactP = true;
  // TESTING (developer mode only): G sets off a blast at the crosshair
  if (e.code === 'KeyG' && SETTINGS.dev && S.mode === 'play') explode(aim.point.clone(), 5, 8, true);
  if (e.code === 'KeyV' && S.test && S.mode === 'play') devSpawn(aim.point.clone());     // test range: spawn the chosen enemies at the crosshair
  if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Tab') && S.mode === 'play') { openInventory(false); e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'KeyP') openPause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => {
  IN.device = 'kbm';
  ensureAudio();
  if (!playing()) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); mouseLook = true; }
  if (e.button === 0) mouseFire = true;
  if (e.button === 2) { mouseZoom = true; if (document.pointerLockElement !== canvas) mouseLook = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; if (e.button === 2) { mouseLook = false; mouseZoom = false; } });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!playing()) return;
  if (document.pointerLockElement === canvas || mouseLook || mouseFire) {
    // Chromium's pointer lock sometimes reports a huge bogus jump (often when the cursor would have hit a
    // screen edge). Ignore those, or the view snaps round by 180 degrees.
    if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) return;
    const k = 0.0024 * SETTINGS.sens * (IN.zoom ? 0.65 : 1);
    cam.yaw -= e.movementX * k;
    cam.pitch = clamp(cam.pitch + e.movementY * k * (SETTINGS.invertY ? -1 : 1), -1.1, 1.25);
  }
});

let ownUnlock = false;
/* Pointer lock is asynchronous: a request made just before a menu opens (e.g. the last card of one level-up, then the
   next level-up opens at once) could be granted AFTER the menu was up, which hid the cursor and swallowed the clicks.
   LOCK_WANT tracks whether the game wants the mouse captured right now; a lock that arrives when it doesn't is let go at once. */
let LOCK_WANT = false;
const NO_CAPTURE = new Set(['levelup', 'perk', 'pause', 'over', 'shop', 'terminal', 'roulette', 'wcase', 'devpanel', 'catalog']);
function lockPointer() {
  if (NO_CAPTURE.has(S.mode)) return;                              // a menu is up: never grab the mouse
  if (S.mode === 'play' && S.pendingLv > 0) return;                  // a queued level-up opens on the very next step: don't grab the mouse just to let go of it
  LOCK_WANT = true;
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function unlockPointer() {
  LOCK_WANT = false; mouseFire = false; mouseLook = false; mouseZoom = false;
  if (document.pointerLockElement) { ownUnlock = true; document.exitPointerLock(); }
  const a = document.activeElement; if (a && a !== document.body && a.blur && !a.classList.contains('nav')) a.blur();
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) { if (!ownUnlock && playing()) openPause(); ownUnlock = false; return; }
  // locked: is that still wanted? (a menu may have opened while the request was in flight)
  if (!LOCK_WANT || NO_CAPTURE.has(S.mode)) { ownUnlock = true; document.exitPointerLock(); }
});

/* Gamepad */
const gp = { axes: [0, 0, 0, 0], btn: [], prev: [], rt: 0, repeat: 0 };
function pollInput(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad = null;
  for (const p of pads) if (p && p.connected) { pad = p; break; }
  gp.prev = gp.btn.slice();
  if (pad) {
    const dz = v => Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84;
    gp.axes = [dz(pad.axes[0] || 0), dz(pad.axes[1] || 0), dz(pad.axes[2] || 0), dz(pad.axes[3] || 0)];
    gp.btn = pad.buttons.map(b => b.pressed);
    gp.rt = pad.buttons[7] ? pad.buttons[7].value : 0;
    if (gp.btn.some(Boolean) || gp.axes.some(a => a !== 0)) IN.device = 'pad';
  } else { gp.axes = [0, 0, 0, 0]; gp.btn = []; gp.rt = 0; }
  const pressed = i => gp.btn[i] && !gp.prev[i];
  const released = i => !gp.btn[i] && gp.prev[i];
  if (S.mode === 'hangar' || S.mode === 'inv') { if (pad) benchPad(dt, pressed, released); readMoveAxes(); return; }

  if (menuOpen()) {
    let dx = 0, dy = 0;
    if (pressed(14)) dx = -1; if (pressed(15)) dx = 1; if (pressed(12)) dy = -1; if (pressed(13)) dy = 1;
    const ax = gp.axes[0], ay = gp.axes[1];
    gp.repeat -= dt;
    if ((Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6) && gp.repeat <= 0) { if (Math.abs(ax) > Math.abs(ay)) dx = Math.sign(ax); else dy = Math.sign(ay); gp.repeat = 0.2; }
    if (Math.abs(ax) < 0.3 && Math.abs(ay) < 0.3) gp.repeat = 0;
    if (dx) navH(dx); else if (dy) navMove(0, dy);
    if (pressed(0)) { const a = document.activeElement; if (a && a.classList.contains('nav')) a.click(); else focusFirst(); }
    if (pressed(1)) menuBack();
    if (pressed(9) && S.mode === 'pause') resume();
    if ((pressed(8) || pressed(3) || pressed(9)) && S.mode === 'inv') closeInventory();
    readMoveAxes();
    return;
  }

  if (pressed(0)) IN.jumpP = true;
  if (pressed(1)) IN.slideP = true;
  if (pressed(5)) IN.dashP = true;
  if (pressed(2)) IN.interactP = true;
  if (pressed(10)) IN.padSprintLatch = !IN.padSprintLatch;
  if ((pressed(8) || pressed(3)) && S.mode === 'play') openInventory(false);
  if (pressed(9)) openPause();

  const lookScale = (IN.device === 'pad' && aim.enemy && SETTINGS.aimAssist) ? 0.55 : 1;
  cam.yaw -= gp.axes[2] * 2.9 * SETTINGS.sens * lookScale * dt;
  cam.pitch = clamp(cam.pitch + gp.axes[3] * 2.0 * SETTINGS.sens * lookScale * (SETTINGS.invertY ? -1 : 1) * dt, -1.1, 1.25);
  readMoveAxes();
}
function readMoveAxes() {
  let x = 0, z = 0;
  if (keys.KeyW) z -= 1; if (keys.KeyS) z += 1; if (keys.KeyA) x -= 1; if (keys.KeyD) x += 1;
  x += gp.axes[0]; z += gp.axes[1];
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  if (playing()) {
    if (keys.ArrowLeft) cam.yaw += 0.03; if (keys.ArrowRight) cam.yaw -= 0.03;
    if (keys.ArrowUp) cam.pitch = clamp(cam.pitch - 0.02, -1.1, 1.25); if (keys.ArrowDown) cam.pitch = clamp(cam.pitch + 0.02, -1.1, 1.25);
  }
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  // camera forward = (-s, 0, -c), right = (c, 0, -s)
  IN.mx = x * c + (-z) * (-s);
  IN.mz = x * (-s) + (-z) * (-c);
  IN.mag = Math.min(1, Math.hypot(x, z));
  if (IN.mag < 0.1) IN.padSprintLatch = false;
  IN.jumpHeld = !!(keys.Space || gp.btn[0]);
  IN.sprint = !!(keys.ShiftLeft || keys.ShiftRight || gp.btn[4] || IN.padSprintLatch);
  IN.fire = mouseFire || gp.rt > 0.4;
  IN.zoom = mouseZoom || (gp.btn.length > 6 && gp.btn[6]);
}

/* Menu navigation for keyboard and gamepad */
// title screen isn't a '.overlay' (it's the base screen, not a dimming layer over gameplay), and its
// customize/catalog subpanels are plain divs nested inside it rather than their own overlay sections -
// so the generic '.overlay' lookup below never found any of them. Give those three their own container.
const NAV_CONTAINER = { title: '#title', custom: '#custPanel', catalog: '#catalog' };
function focusables() {
  const sel = NAV_CONTAINER[S.mode];
  const ov = sel ? document.querySelector(sel) : [...document.querySelectorAll('.overlay')].find(o => !o.hidden);
  return ov ? [...ov.querySelectorAll('.nav')].filter(e => !e.disabled && e.offsetParent !== null) : [];
}
function focusFirst() { const f = focusables(); if (f.length) f[0].focus(); }
function navH(dx) {
  const cur = document.activeElement;
  if (cur && cur.dataset && cur.dataset.cycle) { cycleChassis(cur.dataset.cycle, dx); return; }
  if (cur && cur.type === 'range') { cur.value = +cur.value + dx * +cur.step; cur.dispatchEvent(new Event('input')); return; }
  navMove(dx, 0);
}
function navMove(dx, dy) {
  const els = focusables(); if (!els.length) return;
  const cur = document.activeElement;
  if (!els.includes(cur)) { els[0].focus(); return; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = 1e9;
  for (const e of els) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect(), vx = q.left + q.width / 2 - cx, vy = q.top + q.height / 2 - cy;
    const along = dx ? vx * dx : vy * dy; if (along <= 4) continue;
    // cross-axis penalty: 0 when the two elements' edges overlap on that axis, so a vertical list of
    // left-aligned, variable-width buttons (title menu) doesn't get its center dragged rightward by a
    // longer label and skip over the next, shorter one - same idea for a horizontal row of varying height.
    const gap = dx ? Math.max(0, q.top - r.bottom, r.top - q.bottom) : Math.max(0, q.left - r.right, r.left - q.right);
    const sc = along + gap * 2.2;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
}
function menuBack() {
  if (S.mode === 'catalog') closeCatalog();
  else if (S.mode === 'devpanel') devPanelClose();
  else if (S.mode === 'terminal') { if (TERM.sel >= 0) { TERM.sel = -1; renderTerminal(); focusFirst(); } else closeTerminal(); }
  else if (S.mode === 'pause') pauseBack();
  else if (S.mode === 'inv' || S.mode === 'hangar') invBack();
}
