'use strict';
/* ============================================================
   MOVEMENT & CAMERA TUNING
   Everything that shapes how the frame runs and jumps lives here.
   Units: metres, seconds. Change a number, restart (Ctrl+R in dev).
   ============================================================ */
/* BUILD V2 (Nov 3): the frame is one LOWER HALF (a block with its legs built in) plus one UPPER HALF (with sphere arm
   sockets and cube module sockets). Set to false to go back to the old free-form blocks-and-legs build; the old version
   is also kept on GitHub as the branch "pre-build-revamp". */
const BUILD_V2 = true;
const CFG = {
  simHz: 60,            // gameplay tick rate
  playerSubsteps: 2,    // player physics runs at simHz * substeps (120 Hz)

  // Jumping
  gravityUp: 38,        // gravity while rising
  gravityDown: 64,      // gravity while falling (snappier descent)
  apexGravityMul: 0.5,  // gravity multiplier near the top of a held jump (hang time)
  apexBand: 3.5,        // |vertical speed| below which apex hang applies
  jumpCut: 0.42,        // vertical speed kept when jump is released early (short hops)
  coyote: 0.13,         // seconds you can still jump after running off a ledge
  jumpBuffer: 0.16,     // seconds a jump press is remembered before landing
  landBufferHeight: 0.9,// near the ground, a press waits for landing instead of spending an air jump
  maxFall: 50,

  // Running
  groundAccel: 85,
  groundDecel: 75,      // braking when no input
  turnAccel: 150,       // extra grip when reversing direction
  airAccel: 32,
  airDrag: 3,
  sprintMul: 1.45,

  // Slide (sprint + crouch on the ground). Jump out of a slide to keep its speed.
  slideBoost: 1.25,
  slideTime: 0.7,
  slideFriction: 7,
  slideSteer: 2.2,
  slideCooldown: 0.3,

  // Dash (needs a Dash Thruster module)
  dashSpeed: 24,
  dashTime: 0.16,
  dashCooldown: 0.45,

  // Ledges
  stepHeight: 1.1,      // walk up a step this tall without jumping
  airStep: 0.5,         // ledge lip you slide over while airborne
  mantleHeight: 0.9,    // if a jump comes up this short of a ledge, the frame pulls itself up
                        // reach = jump height + mantleHeight (default legs: 3.6 + 0.9 = 4.5 m, cliffs are 5 m+)

  padHeight: 15,        // jump pad launch height

  // Camera (over the shoulder)
  camDist: 5.8,         // minimum; taller robots pull the camera further back
  camShoulder: 1.0,    // and a little further right (swaps sides automatically when a wall or crowd is in the way)
  camHeight: 2.1,
  fov: 68,
  speedFovAdd: 9,
  zoomFov: 14,          // right mouse / LT: camera moves in and narrows by this many degrees
};

// TESTING: the hangar shelf hands out unlimited copies of every part. Set to false for the real starting shelf.
CFG.unlimitedParts = true;

const SETTINGS = { sens: 1, invertY: false, aimAssist: true, dev: false, xhStyle: 'square', xhColor: 'white', xhSize: 1, xhParts: true, uiScale: 1, autoUpMods: true };      // autoUpMods: new modules start with auto-upgrade on (a saved choice overrides this)
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('scrapsurvivors.settings') || localStorage.getItem('scrapfall.settings') || '{}')); } catch (e) {}
/* circuits: the second currency, kept between runs.
   unlock: lifetime progress toward build-bench/drop unlocks (weapons, chests, legs, arms). See data.js "UNLOCKS". */
function defaultUnlockState() { return { weaponKills: {}, weaponMastered: {}, eliteKills: 0, limbMaxed: false, bosses: {} }; }
const META = { circuits: 0, unlock: defaultUnlockState() };
try { Object.assign(META, JSON.parse(localStorage.getItem('scrapsurvivors.meta') || '{}')); } catch (e) {}
// back-fill any unlock fields an older save never had (new fields added after that save was written)
if (!META.unlock || typeof META.unlock !== 'object') META.unlock = defaultUnlockState();
else { const d = defaultUnlockState(); for (const k in d) if (!(k in META.unlock)) META.unlock[k] = d[k]; }
// Pogo Spring was removed (0.30.0): drop its discovery key so old saves stay clean
try { if (META.disc && META.disc['module:pogo']) { delete META.disc['module:pogo']; localStorage.setItem('scrapsurvivors.meta', JSON.stringify(META)); } } catch (e) {}
function saveMeta() { try { localStorage.setItem('scrapsurvivors.meta', JSON.stringify(META)); } catch (e) {} }
function saveSettings() { try { localStorage.setItem('scrapsurvivors.settings', JSON.stringify(SETTINGS)); } catch (e) {} }

/* Player customisation (title screen > Customize): robot paint colour and a 20x20 pixel patch. */
const PATCH_N = 20;
const CUSTOM = { color: '#4b5661', color2: '#ff7a1a', patch: null, rev: 0 };   // primary (grey) and secondary (orange)
try { Object.assign(CUSTOM, JSON.parse(localStorage.getItem('scrapsurvivors.custom') || localStorage.getItem('scrapfall.custom') || '{}')); } catch (e) {}
// saved patch designs (a little directory), which one is selected, and how many stickers get bombed onto the bodies
if (!Array.isArray(CUSTOM.patches) || !CUSTOM.patches.length) CUSTOM.patches = [{ name: 'Patch 1', px: CUSTOM.patch || null }];
if (!(CUSTOM.cur >= 0 && CUSTOM.cur < CUSTOM.patches.length)) CUSTOM.cur = 0;
if (typeof CUSTOM.bomb !== 'number') CUSTOM.bomb = 0;
if (!CUSTOM.stickers || typeof CUSTOM.stickers !== 'object') CUSTOM.stickers = {};     // stickers you've dragged: 'body:sticker' -> {u, v}
if (!CUSTOM.layout) CUSTOM.layout = (Math.random() * 1e9) | 0;                           // seeds where the stickers land
CUSTOM.patch = CUSTOM.patches[CUSTOM.cur].px ? CUSTOM.patches[CUSTOM.cur].px.slice() : null;
const BOMB_MAX = 12;
/* menus pick up the secondary colour (hazard stripes) */
/* secondary colours are always bright: dark or dull picks get lifted so the UI accent stays readable */
function brightAccent(hex) {
  try {
    const c = new THREE.Color(hex), h = {}; c.getHSL(h);
    if (h.l >= 0.8) return '#' + c.getHexString();                                            // already bright (whites, pastels)
    if (h.s < 0.15) return '#' + c.setHSL(h.h, h.s, Math.max(0.82, h.l)).getHexString();     // greys become near-white
    return '#' + c.setHSL(h.h, Math.max(0.65, h.s), Math.min(0.72, Math.max(0.55, h.l))).getHexString();
  } catch (e) { return hex; }
}
/* The secondary colour is the HUD accent. It must stay readable on the near-black panels: lift it until its contrast against the panel colour is at least 4.5:1,
   and pick black or white text for anything drawn ON the accent. */
function accentSafe(hex) {
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  let r = parseInt(hex.slice(1, 3), 16) || 255, g = parseInt(hex.slice(3, 5), 16) || 122, b = parseInt(hex.slice(5, 7), 16) || 26;
  const bg = lum(10, 11, 12);
  for (let i = 0; i < 12 && (lum(r, g, b) + 0.05) / (bg + 0.05) < 4.5; i++) { r = Math.round(r + (255 - r) * 0.18); g = Math.round(g + (255 - g) * 0.18); b = Math.round(b + (255 - b) * 0.18); }
  const L = lum(r, g, b), on = (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#05070a' : '#ffffff';
  return { hex: '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''), on };
}
function applyThemeColor() { try { const a = accentSafe(CUSTOM.color2 || '#ff7a1a'); const r = document.documentElement.style; r.setProperty('--sec', a.hex); r.setProperty('--orange', a.hex); r.setProperty('--accent', a.hex); r.setProperty('--on-accent', a.on); } catch (e) {} }
function saveCustom() { CUSTOM.rev++; applyThemeColor(); try { localStorage.setItem('scrapsurvivors.custom', JSON.stringify({ color: CUSTOM.color, color2: CUSTOM.color2, patch: CUSTOM.patch, patches: CUSTOM.patches, cur: CUSTOM.cur, bomb: CUSTOM.bomb, stickers: CUSTOM.stickers, layout: CUSTOM.layout, cosmetics: CUSTOM.cosmetics, titleScene: CUSTOM.titleScene })); } catch (e) {} }

if (typeof THREE !== 'undefined' && CUSTOM.color2) CUSTOM.color2 = brightAccent(CUSTOM.color2);
applyThemeColor();
