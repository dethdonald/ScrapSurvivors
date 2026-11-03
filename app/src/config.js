'use strict';
/* ============================================================
   MOVEMENT & CAMERA TUNING
   Everything that shapes how the frame runs and jumps lives here.
   Units: metres, seconds. Change a number, restart (Ctrl+R in dev).
   ============================================================ */
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

const SETTINGS = { sens: 1, invertY: false, aimAssist: true, dev: false, xhStyle: 'square', xhColor: 'white', xhSize: 1, xhParts: true, uiScale: 1 };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('scrapsurvivors.settings') || localStorage.getItem('scrapfall.settings') || '{}')); } catch (e) {}
/* circuits: the second currency, kept between runs */
const META = { circuits: 0 };
try { Object.assign(META, JSON.parse(localStorage.getItem('scrapsurvivors.meta') || '{}')); } catch (e) {}
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
function applyThemeColor() { try { const c = CUSTOM.color2 || '#ff7a1a'; const r = document.documentElement.style; r.setProperty('--sec', c); r.setProperty('--orange', c); } catch (e) {} }
function saveCustom() { CUSTOM.rev++; applyThemeColor(); try { localStorage.setItem('scrapsurvivors.custom', JSON.stringify({ color: CUSTOM.color, color2: CUSTOM.color2, patch: CUSTOM.patch, patches: CUSTOM.patches, cur: CUSTOM.cur, bomb: CUSTOM.bomb, stickers: CUSTOM.stickers, layout: CUSTOM.layout, cosmetics: CUSTOM.cosmetics })); } catch (e) {} }

if (typeof THREE !== 'undefined' && CUSTOM.color2) CUSTOM.color2 = brightAccent(CUSTOM.color2);
applyThemeColor();
