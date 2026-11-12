'use strict';
/* Loadout, derived stats, the character controller and the shoulder camera. */
let L = null, stats = null;

const player = {
  pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), renderPos: new THREE.Vector3(),
  r: 0.8, onGround: false, landed: false, landSpeed: 0,
  coyoteT: 0, bufferT: 0, freshJump: false, jumping: false, airJumps: 0,
  dashCharges: 0, dashT: 0, dashCd: 0, slideT: 0, slideCd: 0, mantleT: 0, fuel: 0, jetting: false, jetHold: false,
  hp: 50, shield: 0, shieldT: 0, iframes: 0,
  model: null, visY: 0, camY: 0, legYaw: 0, legYawV: 0, torsoYawV: 0, flipT: 0, backpedal: false, walk: 0, peak: 0, props: [],
  dip: 0, dipV: 0, sway: new THREE.Vector2(), swayV: new THREE.Vector2(), lastVel: new THREE.Vector3(), flailT: 0,
};
const SQUASH = { y: 1, xz: 1, foot: 0 };   // the player's squash & stretch, shared with the physics body
const cam = { yaw: 0.6, pitch: 0.2, dist: CFG.camDist, dip: 0, shake: 0, bob: 0, bobV: 0, rumble: 0, side: 1, sideT: 1, sideCheck: 0, kick: new THREE.Vector3(), kickV: new THREE.Vector3(), lag: 0, lagV: 0, lagDelay: 0, lagImp: 0 };
const aim = { point: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), origin: new THREE.Vector3(), enemy: null };
const jumpV = h => Math.sqrt(2 * CFG.gravityUp * Math.max(0.2, h));

/* ---------- loadout ---------- */
function newLoadout() { return { body: null, store: [], perks: new Set(), bonus: { hp: 0, shield: 0, jump: 0, speed: 0, reload: 0, rate: 0, multi: 0, luck: 0, slot: 0, crit: 0 } }; }
/* Storage: one spare part, plus any Cargo Rack slots from level-ups. */
const packSlots = () => (L && L.body ? mountedItems().reduce((n, it) => n + (it.kind === 'block' && BLOCKS[it.type].pack ? BLOCKS[it.type].slots(it.lvl) : 0), 0) : 0);
const storeCap = () => S.test ? 99 : 1 + ((L && L.bonus && L.bonus.slot) || 0) + packSlots();
const storeCount = () => L.store.filter(Boolean).length;                        // every part (gems too) takes a slot
const storeFull = () => storeCount() >= storeCap();
/* Everything on the robot (in build order) */
function mountedItems() { return L.body ? [L.body, ...childrenOf(L.body)] : []; }
function allItems() {
  const out = mountedItems();
  L.store.forEach(it => { if (it) out.push(it, ...childrenOf(it)); });
  return out;
}
function equippedLegs() { return BUILD_V2 && L.body && L.body.kind === 'lower' ? lowerLegItems(L.body) : mountedItems().filter(it => it.kind === 'leg'); }
function mountedArms() { return mountedItems().filter(it => it.kind === 'arm'); }
function mountedWeapons() { return mountedItems().filter(it => it.kind === 'weapon'); }
function mountedBodies() { return mountedItems().filter(it => it.kind === 'block' && BLOCKS[it.type].body); }

/* Which mounted legs actually reach the ground. A leg hangs straight down from its socket, so one
   mounted high up (on a top block, or on top of anything) dangles in the air and does nothing. */
const LOAD_REF = 0.75;     // load (weight / leg carry) of the starter frame: stats are tuned around it
function groundedLegs() {
  const legs = equippedLegs(); if (!legs.length) return [];
  const m = buildRobot(L); m.updateMatrixWorld(true);
  const out = [];
  for (const p of m.userData.legs) {
    const ud = p.userData; let foot;
    if (ud.ik) foot = p.localToWorld(ud.ik.restV.clone()).y;
    else if (ud.shock) foot = p.localToWorld(new THREE.Vector3(0, ud.shock.restY - 0.34, 0)).y;
    else foot = p.localToWorld(new THREE.Vector3()).y - 1.35;
    if (foot < 0.35) out.push(ud.item);
  }
  return out;
}
/* Legs that don't reach the ground (on top of the frame, sticking out sideways up high...) */
function misplacedLegs() { const g = new Set(groundedLegs()); return equippedLegs().filter(l => !g.has(l)); }
function frameMass() { return mountedItems().reduce((m, it) => m + partMass(it), 0); }
function computeStats() {
  const P = L.perks, s = {};
  let hp = 0, sh = 0, sp = 0, jp = 0, air = 0, bodySpeed = 0, carry = 0;
  for (const b of mountedBodies()) { const d = BLOCKS[b.type]; hp += d.hp || 0; sh += d.shield || 0; bodySpeed += d.speed || 0; }
  const V2L = BUILD_V2 && L.body && L.body.kind === 'lower' ? L.body : null;
  if (V2L) { hp += lowerHp(V2L); sh += lowerShield(V2L); }
  const legs = groundedLegs();
  // V2: however many legs a lower half has, together they count as one pair (six spider legs aren't three times the carry)
  const lk = V2L && legs.length ? 2 / legs.length : 1;
  const n = legs.reduce((t, l) => t + (LEGS[l.type].counts || 1) * lk, 0);   
  s.misLegs = equippedLegs().filter(l => !legs.includes(l)).length;
  // gems in legs that are actually on the ground change how you move
  s.legGems = gemMap(V2L ? armGems(V2L) : legs.flatMap(armGems));
  s.combos = new Map();                      // combos of the equipped arms (two gems in one arm), for the effects that are not tied to one shot
  for (const a of mountedArms()) { const k = armCombo(a); if (k && COMBOS[k]) s.combos.set(k, gemMap(armGems(a))); }
  // leg levels add up: Lv 10 total gives a double jump, 30 a triple, then 60, 100, 150; from 50 every air jump is a flip
  s.legLv = legs.reduce((t, l) => t + effLvl(l), 0);
  s.canSprint = legs.some(l => LEGS[l.type].rolling);      // only treads can sprint / boost
  s.stepUp = Math.max(CFG.stepHeight, ...legs.map(l => LEGS[l.type].climb || 0));   // spider legs walk up tall ledges
  // walking legs can scamper a short way up a wall; wheels and treads can't
  s.scamper = legs.length && !legs.some(l => LEGS[l.type].rolling) ? (legs.some(l => l.type === 'spider') ? 2.2 : 0.34) : 0;      // spider legs scramble up walls for much longer
  const grips = legs.map(l => LEGS[l.type].grip || 1); s.grip = grips.length ? grips.reduce((a, b) => a + b, 0) / grips.length : 1;
  for (const l of legs) {
    const c = (LEGS[l.type].counts || 1) * lk;
    sp += legSpeed(l) * c; jp += legJump(l) * c; carry += legCarry(l) * lk;
    if (LEGS[l.type].air) air += LEGS[l.type].air * lk;
  }
  // weight: everything you bolt on is carried by the legs on the ground
  s.mass = frameMass();
  s.load = n ? s.mass / carry : 9;
  let wMul = Math.sqrt(LOAD_REF / s.load);
  if (s.load > 1.2) wMul /= 1 + (s.load - 1.2) * 1.5;    // overloaded legs bog right down
  s.weightMul = clamp(wMul, 0.25, 1.3);
  const legF = n === 0 ? 0.35 : n === 1 ? 0.6 : n === 2 ? 1 : n === 3 ? 1.07 : 1.12;
  s.maxHp = Math.max(1, hp); s.maxShield = sh;
  s.speed = Math.max(2.4, ((n ? (sp / n) * 2 * legF : 3.2) + bodySpeed) * (n ? s.weightMul : 1));
  if (V2L) { s.speed *= lowerPerk(V2L, 'wheels'); s.scamper *= lowerPerk(V2L, 'spider'); }
  s.jump = n ? (jp / n) * (n === 1 ? 0.7 : 1) * clamp(s.weightMul, 0.3, 1.3) : 0.8;
  // whatever the legs and the load, the frame can always clear the tallest step the terrain has (CLIMB, with the
  // ledge pull-up), so no hole or pit can trap you
  const LT = k => s.legGems.get(k) || 0;
  if (LT('bounce')) s.jump *= 1.1 + 0.06 * LT('bounce');
  if (LT('ice')) s.speed *= 1.06 + 0.03 * LT('ice');
  // legs in places they can't walk from drag the whole frame down, hard
  if (s.misLegs) { const k = Math.pow(0.55, s.misLegs); s.speed = Math.max(1.6, s.speed * k); s.jump *= Math.max(0.45, Math.pow(0.7, s.misLegs)); }
  s.jump = Math.max(s.jump, CLIMB - CFG.mantleHeight + 0.5);
  s.accelMul = clamp(Math.pow(LOAD_REF / s.load, 0.6), 0.35, 1.35) * s.grip;   // wheels slide
  // how heavy the frame feels: -0.6 (light, twitchy) .. 1.2 (heavy, weighty). Drives landings, slides, turning and camera weight
  s.heavy = clamp((s.load - LOAD_REF) / LOAD_REF, -0.6, 1.2);
  s.airJumps = air + airJumpsFor(s.legLv) + [0, 1, 2, 3, 3, 4][s.legGems.get('split') || 0]; s.flip = s.legLv >= FLIP_AT; s.dashes = 0;
  if (s.legGems.has('ice')) s.accelMul *= 0.6;          // skates: quick, but slippery
  if (s.misLegs) s.accelMul *= Math.pow(0.6, s.misLegs);
  // jetpacks: summed thrust and fuel
  s.thrust = 0; s.fuel = 0;
  for (const it of mountedItems()) if (it.kind === 'module' && it.type === 'jetpack') { s.thrust += MODULES.jetpack.thrust(it.lvl); s.fuel += MODULES.jetpack.fuel(it.lvl); }
  s.fire = 1; s.dmg = 1; s.magnet = 4; s.shieldRate = 2.2; s.shieldDelay = 4; s.xpMult = 1;   // shield: small, refills slowly after 4 s without damage
  for (const it of mountedItems()) if (it.kind === 'module' && MODULES[it.type] && MODULES[it.type].apply) MODULES[it.type].apply(s, it.lvl);
  // run bonuses from level-up stat cards
  const bo = L.bonus || {};
  s.maxHp += bo.hp || 0; s.maxShield += bo.shield || 0; s.jump += bo.jump || 0;
  s.speed *= 1 + (bo.speed || 0) / 100; s.fire *= 1 + (bo.rate || 0) / 100; s.reload = 1 + (bo.reload || 0) / 100;
  s.multi = (bo.multi || 0) / 100; s.projSpeed = 1 + (bo.pspeed || 0) / 100; s.range = 1 + (bo.range || 0) / 100; s.luck = bo.luck || 0;
  s.crit = 0.05 + (bo.crit || 0) / 100;      // every hit has a small random chance to crit for double damage
  if (P.has('titan')) s.maxHp += 60;
  if (P.has('aegis')) { s.maxShield += 40; s.shieldDelay -= 1.5; }
  if (P.has('grav')) s.jump += 1.5;
  if (P.has('overclock')) s.fire += 0.25;
  if (P.has('payload')) s.dmg *= 1.2;
  if (P.has('scav')) s.xpMult *= 1.3;
  s.airJumps = Math.min(5, s.airJumps); s.dashes = Math.min(3, s.dashes);
  s.legs = Math.round(n); s.legsMounted = V2L ? 2 : equippedLegs().reduce((t, l) => t + (LEGS[l.type].counts || 1), 0);
  return s;
}
/* What the frame still needs before it can fight. Empty list = ready. */
function buildProblems() {
  if (BUILD_V2) {
    const p = [];
    if (!L.body) p.push('a lower half');
    else if (!mountedBodies().length) p.push('a torso');
    if (!mountedArms().length) p.push('an arm');
    return p;
  }
  const p = [], bodies = mountedBodies().length, legs = equippedLegs().reduce((t, l) => t + (LEGS[l.type].counts || 1), 0);
  if (bodies < 1) p.push('a body');
  if (legs < 2) p.push(legs ? '1 more leg' : '2 legs');
  else if (stats && stats.legs < 2) p.push('2 legs that reach the ground');
  if (!mountedArms().length) p.push('an arm');          // a weapon is optional
  return p;
}
function fitArray(arr, cap) {
  const overflow = arr.length > cap ? arr.splice(cap).filter(Boolean) : [];
  while (arr.length < cap) arr.push(null);
  return overflow;
}
function syncCaps() {
  L.store = L.store.filter(Boolean);      // storage has no limit
}
function refreshLoadout() {
  if (S.inRun) discoverLoadout();          // new gem pairs show up in the catalog
  const prev = stats;
  stats = computeStats();
  syncCaps();
  if (prev && S.inRun) {
    player.hp = Math.min(stats.maxHp, player.hp + Math.max(0, stats.maxHp - prev.maxHp));
    player.shield = Math.min(player.shield, stats.maxShield);
  }
  if (S.inRun) {
    if (player.model) scene.remove(player.model);
    player.model = buildRobot(L);
    player.model.position.copy(player.pos);
    scene.add(player.model);
    if (typeof physBuildRobot === 'function' && S.mode !== 'drop' && S.mode !== 'countdown' && !DR.active) physBuildRobot();
    rebuildWeaponProps();
    renderLoadoutHUD();
  }
  rebuildPreview();
}

/* ---------- controller ---------- */
function moveToward(v, tx, tz, maxDelta) {
  const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-6) { v.x = tx; v.z = tz; } else { v.x += dx / d * maxDelta; v.z += dz / d * maxDelta; }
}
function doJump(v) { const P = player; P.vel.y = v; P.onGround = false; P.coyoteT = 0; P.bufferT = 0; P.jumping = true; }

function playerStep(dt) {
  const P = player, st = stats;
  P.bufferT -= dt; P.coyoteT -= dt; P.slideCd -= dt; P.dashCd -= dt; P.iframes -= dt; P.mantleT -= dt;
  if (IN.jumpP) { IN.jumpP = false; P.bufferT = CFG.jumpBuffer; P.freshJump = true; }
  const hsp = Math.hypot(P.vel.x, P.vel.z);
  const sprint = IN.sprint && IN.mag > 0.25 && st.canSprint;
  let maxSp = st.speed * (sprint ? CFG.sprintMul : 1);
  // strafe drive (orbit gem in a leg): sideways and backwards at a quarter more speed
  if (st.legGems && st.legGems.has('orbit') && IN.mag > 0.3) { const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); if ((IN.mx * fx + IN.mz * fz) / IN.mag < 0.5) maxSp *= 1.15 + 0.08 * st.legGems.get('orbit'); }

  // Slide: from a run, on the ground
  if (IN.slideP) {
    IN.slideP = false;
    if (P.onGround && P.slideCd <= 0 && hsp > st.speed * 0.55) {
      const sp = Math.max(hsp, st.speed * CFG.sprintMul) * CFG.slideBoost;
      P.vel.x = P.vel.x / hsp * sp; P.vel.z = P.vel.z / hsp * sp;
      P.slideT = CFG.slideTime; P.slideCd = CFG.slideTime + CFG.slideCooldown;
      dust(P.pos, 6);
    }
  }
  // Dash: needs a Dash Thruster
  if (IN.dashP) {
    IN.dashP = false;
    if (P.dashCharges > 0 && P.dashCd <= 0) {
      let dx = IN.mx, dz = IN.mz;
      if (IN.mag < 0.2) { dx = -Math.sin(cam.yaw); dz = -Math.cos(cam.yaw); }
      const l = Math.hypot(dx, dz) || 1;
      P.vel.x = dx / l * CFG.dashSpeed; P.vel.z = dz / l * CFG.dashSpeed;
      P.vel.y = Math.max(P.vel.y, 0);
      P.dashT = CFG.dashTime; P.dashCd = CFG.dashCooldown; P.dashCharges--; P.slideT = 0;
      ring(P.pos.clone().setY(P.pos.y + 1.2), 2.2, 0.25, COL.cyan);
    }
  }

  // Horizontal control
  if (P.dashT > 0) {
    P.dashT -= dt;
  } else if (P.slideT > 0) {
    P.slideT -= dt;
    if (P.onGround) {
      const sp = Math.hypot(P.vel.x, P.vel.z), ns = Math.max(0, sp - CFG.slideFriction * (1 - 0.35 * (st.heavy || 0)) * dt);
      let dx = P.vel.x / (sp || 1), dz = P.vel.z / (sp || 1);
      if (IN.mag > 0.2) {
        const k = Math.min(1, CFG.slideSteer * dt);
        dx = lerp(dx, IN.mx / IN.mag, k); dz = lerp(dz, IN.mz / IN.mag, k);
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      }
      P.vel.x = dx * ns; P.vel.z = dz * ns;
      if (ns < st.speed * 0.75) P.slideT = 0;
    }
  } else if (P.onGround) {
    const tx = IN.mx * maxSp, tz = IN.mz * maxSp;
    const opposing = IN.mag > 0.2 && (P.vel.x * IN.mx + P.vel.z * IN.mz) < 0;
    // only legs on the ground push: heavier frames get going (and stop) more slowly
    const a = (IN.mag > 0.1 ? (opposing ? CFG.turnAccel * (1 - 0.3 * (st.heavy || 0)) : CFG.groundAccel) : CFG.groundDecel * (1 - 0.25 * (st.heavy || 0))) * (st.legs ? st.accelMul : 0.3);
    moveToward(P.vel, tx, tz, a * dt);
  } else {
    if (IN.mag > 0.1) {
      const cap = Math.max(maxSp, hsp - 3 * dt);    // air control never kills momentum you earned
      moveToward(P.vel, IN.mx / Math.max(IN.mag, 1e-3) * cap * IN.mag, IN.mz / Math.max(IN.mag, 1e-3) * cap * IN.mag, CFG.airAccel * dt);
    } else {
      const k = Math.max(0, 1 - CFG.airDrag * 0.25 * dt); P.vel.x *= k; P.vel.z *= k;
    }
  }

  // Jump: ground/coyote first, then air jumps on a fresh press
  let jumpedNow = false;
  if (P.bufferT > 0) {
    if (P.onGround || P.coyoteT > 0) {
      doJump(jumpV(st.jump)); P.slideT = 0; jumpedNow = true; P.sqV = (P.sqV || 0) + 1.6;
      cam.bobV += 1.6; P.dipV += 1.5;                  // legs push off: the camera lifts with the frame
    } else if (P.freshJump && (P.wallT || 0) > 0 && (P.wallKicks || 0) < 3) {
      // wall kick: jump off a wall you're touching (or scampering up) and kick away from it
      const nx = P.wallNX, nz = P.wallNZ, push = 8.5 * (1 - 0.15 * (st.heavy || 0));
      P.vel.x = nx * push + IN.mx * 3; P.vel.z = nz * push + IN.mz * 3;
      doJump(jumpV(st.jump * 0.85)); P.wallKicks = (P.wallKicks || 0) + 1; P.wallT = 0; P.kickT = 0.28; P.scamperLeft = 0;
      P.sqV = (P.sqV || 0) + 1.4; cam.bobV += 1.2; sfx('thud', 0.45); sfx('step', 0.5);
      const wp = new THREE.Vector3(P.pos.x - nx * 0.6, P.pos.y + 0.8, P.pos.z - nz * 0.6);
      dust(wp, 5); spark(wp, 0xb9b09a); ring(wp, 1.1, 0.25, 0xe4e9e6);
      camKick(new THREE.Vector3(nx, 0.2, nz), 0.12);
    } else if (P.freshJump && P.airJumps > 0) {
      const below = P.pos.y - groundAt(P.pos.x, P.pos.z);
      if (!(P.vel.y < 0 && below < CFG.landBufferHeight)) {
        P.airJumps--; doJump(jumpV(st.jump * 0.85)); P.sqV = (P.sqV || 0) + 1.2;
        ring(P.pos, 1.8, 0.3, COL.cyan);
        if (st.flip) P.flipT = 0.001;                  // purely for show
        cam.bobV += 1.2;
      }
    }
  }
  // Jetpack: a fresh press in the air, or holding jump past the top of a jump, lights it while held
  if (st.thrust > 0 && !P.onGround && !jumpedNow && P.fuel > 0 && IN.jumpHeld && ((P.freshJump && !P.airJumps) || P.jetHold || P.vel.y <= 1)) P.jetHold = true;
  if (!IN.jumpHeld || P.onGround || P.fuel <= 0) P.jetHold = false;
  P.freshJump = false;
  if (P.jumping && !IN.jumpHeld && P.vel.y > 0) { P.vel.y *= CFG.jumpCut; P.jumping = false; }
  if (P.vel.y <= 0) P.jumping = false;

  // Gravity: lighter going up, heavier coming down, floaty at the apex while held
  let g = P.vel.y > 0 ? CFG.gravityUp : CFG.gravityDown;
  if (!P.onGround && Math.abs(P.vel.y) < CFG.apexBand && IN.jumpHeld && !P.jetHold) g *= CFG.apexGravityMul;
  if (P.dashT > 0) g = 0;
  P.jetting = false;
  if (P.jetHold) {
    // each jetpack pushes along its own facing (turn it in the workbench to aim it); acceleration = thrust / weight
    const per = st.thrust / Math.max(1, player.model ? player.model.userData.jets.length : 1);
    const acc = jetAccel(per / st.mass);
    if (acc) {
      P.vel.addScaledVector(acc, dt);
      g = CFG.gravityUp;                                   // steady, even gravity while flying
      P.vel.y -= P.vel.y * Math.min(1, 1.4 * dt);          // thrusters damp the bob: settles into a hover
      P.fuel = Math.max(0, P.fuel - dt);
      P.jetting = true; P.jumping = false;
    }
  }
  if (P.onGround) P.fuel = Math.min(st.fuel, P.fuel + dt * st.fuel / 1.2);
  P.vel.y = Math.max(P.vel.y - g * dt, -CFG.maxFall);
  if (P.superUp) { P.vel.y = 90; if (P.pos.y - groundAt(P.pos.x, P.pos.z) > 55) { bonusDrop(); return; } }      // well out of shot by then

  const wasAir = !P.onGround;
  legGemAir(dt);
  P.wallX = P.wallZ = 0;
  const vx0 = P.vel.x, vz0 = P.vel.z;
  movePlayer(dt);
  // springy legs (bounce gem): slam into a wall at speed and you rebound off it
  if (st.legGems && st.legGems.has('bounce') && (P.wallX || P.wallZ) && !P.scampering) {
    const wl = Math.hypot(P.wallX, P.wallZ), nx = P.wallX / wl, nz = P.wallZ / wl, into = -(vx0 * nx + vz0 * nz);
    if (into > 4 && (P.bounceCd || 0) <= 0) {
      const e = 0.75 + 0.1 * st.legGems.get('bounce');
      P.vel.x = vx0 + nx * into * (1 + e); P.vel.z = vz0 + nz * into * (1 + e);
      P.vel.y = Math.max(P.vel.y, jumpV(0.8 + 0.4 * st.legGems.get('bounce'))); P.onGround = false;
      P.bounceCd = 0.25; P.sqV = (P.sqV || 0) - 1.5; sfx('thud', 0.4); cam.shake = Math.max(cam.shake, 0.12);
      ring(new THREE.Vector3(P.pos.x - nx * 0.7, P.pos.y + 1, P.pos.z - nz * 0.7), 1.2, 0.25, ATTRS.bounce.color);
    }
  }
  P.bounceCd = (P.bounceCd || 0) - dt;
  P.wallT = (P.wallT || 0) - dt; P.kickT = (P.kickT || 0) - dt;
  if (!P.onGround && (P.wallX || P.wallZ)) { const wl = Math.hypot(P.wallX, P.wallZ); P.wallT = 0.18; P.wallNX = P.wallX / wl; P.wallNZ = P.wallZ / wl; }
  if (P.kickT <= 0) scamper(dt, st);

  if (!P.onGround) P.peak = Math.max(P.peak, P.pos.y);
  if (P.onGround) {
    P.coyoteT = CFG.coyote; P.airJumps = st.airJumps; P.dashCharges = st.dashes; P.wallKicks = 0;
    if (P.landed && wasAir) {
      const impact = P.landSpeed, hw = 1 + 0.5 * (st.heavy || 0);    // heavy frames land harder
      P.dipV -= Math.min(6, impact * 0.22) * hw;          // knees absorb the landing
      P.sqV = (P.sqV || 0) - Math.min(2.6, 0.5 + impact * 0.09) * hw;   // squash on landing
      cam.dip = Math.min(0.7, impact / 60 * hw);
      cam.bobV -= Math.min(5, impact * 0.18) * hw; cam.shake = Math.max(cam.shake, clamp((impact - 10) / 40, 0, 0.45) * hw);
      if (impact > 9) { cam.lagDelay = 0.05; cam.lagImp = -Math.min(5, (impact - 6) * 0.16) * hw; if (st.heavy > 0.3) sfx('thud', Math.min(0.7, 0.2 + impact * 0.015)); else sfx('land', Math.min(0.5, 0.12 + impact * 0.012)); }
      if (impact > 14) dust(P.pos, Math.min(10, impact / 3 | 0));
      const fall = P.peak - P.pos.y;
      legGemLanding(impact, fall);
      if (fall > 7 && L.perks.has('skyfall')) shockwave(P.pos, 6 + fall * 0.3, 25 + fall * 4);
    }
    P.peak = P.pos.y;
    const k = idxOf(P.pos.x, P.pos.z);
    if (padSet.has(k)) { P.vel.y = jumpV(CFG.padHeight); P.onGround = false; P.jumping = false; P.coyoteT = 0; ring(P.pos, 3, 0.4, COL.cyan); }
    else if (redPads.has(k) && S.mode === 'play') { redPads.delete(k); const m = redPadMeshes.get(k); if (m) { scene.remove(m); redPadMeshes.delete(k); } superLaunch(); }
  }
}

/* Scamper: keep pushing into a wall and walking legs claw a short way up it (a little higher with spider legs). */
function scamper(dt, st) {
  const P = player;
  if (P.onGround && !P.scampering) P.scamperLeft = st.scamper;
  const wl = Math.hypot(P.wallX || 0, P.wallZ || 0);
  const into = wl > 1e-4 && IN.mag > 0.3 ? -(IN.mx * P.wallX + IN.mz * P.wallZ) / (wl * IN.mag) : 0;
  P.wallPushT = into > 0.55 ? (P.wallPushT || 0) + dt : 0;
  P.scampering = false;
  if (st.scamper > 0 && P.scamperLeft > 0 && P.wallPushT > (P.onGround ? 0.12 : 0) && !P.jetting && S.mode === 'play') {
    P.scamperLeft -= dt; P.scampering = true; P.scampT2 = 0.15; P.scampWX = P.wallX; P.scampWZ = P.wallZ;
    P.vel.y = Math.max(P.vel.y, 6.2); P.onGround = false;
    P.scampT = (P.scampT || 0) - dt;
    if (P.scampT <= 0) { P.scampT = 0.11; sfx('step', 0.3); spark(new THREE.Vector3(P.pos.x - P.wallX / wl * 0.6, P.pos.y + 0.3, P.pos.z - P.wallZ / wl * 0.6), 0xb9b09a); cam.bobV += 0.5; }
  }
}
function movePlayer(dt) {
  const P = player, wasGround = P.onGround, vy0 = P.vel.y;
  P.landed = false;
  const step = wasGround ? (stats.stepUp || CFG.stepHeight) : CFG.airStep;
  if (!tryMantle(dt)) {
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    const n = pushOutTerrain(P, P.r, step);
    P.wallX = n.x; P.wallZ = n.z;
    if (clipVel(P.vel, n) && P.slideT > 0 && (P.vel.x * P.vel.x + P.vel.z * P.vel.z) < 4) P.slideT = 0;
  }
  P.pos.y += P.vel.y * dt;
  pushOutTerrain(P, P.r, step);   // falling past a ledge lip never leaves us embedded in it
  let g = footGround(P, P.onGround ? (stats.stepUp || CFG.stepHeight) : CFG.airStep);
  // loose blocks are ground too: stand on them, and land on them with a bump
  const pg = propGround(P.pos.x, P.pos.y, P.pos.z, P.r * 0.5, P.onGround ? Math.min(0.6, stats.stepUp || CFG.stepHeight) : 0.35);
  P.onProp = null;
  if (pg && pg.y > g) { g = pg.y; P.onProp = pg; }
  if (P.pos.y <= g) {
    if (!wasGround) {
      P.landed = true; P.landSpeed = -Math.min(0, vy0); P.lastImpact = P.landSpeed;
      if (P.onProp && P.onProp.body && P.onProp.body.isDynamic()) {
        const b = P.onProp.body; b.wakeUp();
        b.applyImpulseAtPoint({ x: 0, y: -Math.min(P.landSpeed, 20) * 0.12 * b.mass(), z: 0 }, { x: P.onProp.px, y: g, z: P.onProp.pz }, true);
      }
    }
    P.pos.y = g; if (P.vel.y < 0) P.vel.y = 0; P.onGround = true;
  } else if (wasGround && P.vel.y <= 0 && P.pos.y - g <= (stats.stepUp || CFG.stepHeight)) {
    P.pos.y = g; P.vel.y = 0; P.onGround = true;     // stick to stairs instead of hopping off each step
  } else P.onGround = false;
}
/* Sum of jetpack accelerations in world space (each along its part's +y, i.e. away from its nozzles). */
const _jq = new THREE.Quaternion(), _jd = new THREE.Vector3(), _ja = new THREE.Vector3();
function jetAccel(perAcc) {
  const m = player.model; if (!m || !m.userData.jets.length) return null;
  _ja.set(0, 0, 0);
  for (const j of m.userData.jets) { j.getWorldQuaternion(_jq); _jd.fromArray(j.userData.jet.dir).applyQuaternion(_jq); _ja.addScaledVector(_jd, perAcc); }
  return _ja;
}
/* Mantle: clipped a ledge mid-air that is just within reach — pull up onto it. */
function tryMantle(dt) {
  const P = player;
  if (P.onGround || P.vel.y <= -16) return false;
  const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
  if (!blockedAt(nx, nz, P.pos.y, P.r, CFG.airStep)) return false;
  const top = maxGroundAround(nx, nz, P.r), rise = top - P.pos.y;
  if (rise > CFG.mantleHeight || blockedAt(nx, nz, top + 0.02, P.r, CFG.stepHeight)) return false;
  P.pos.y = top + 0.02; P.pos.x = nx; P.pos.z = nz;
  if (P.vel.y < 0) P.vel.y = 0;
  P.mantleT = 0.2;
  return true;
}

/* Drop phase: steer a falling frame */
function dropStep(dt) {
  const P = player;
  // steering in the fall: quick to respond, plus a gentle pull toward the bolts and rings just below you
  // in the direction you're already steering (or straight down if you're not steering)
  let ax = 0, az = 0;
  {
    let best = null, bs = 0;
    const steer = IN.mag > 0.2, sx = steer ? IN.mx / IN.mag : 0, sz = steer ? IN.mz / IN.mag : 0;
    const consider = (x, y, z, w) => {
      const dy = P.pos.y - y; if (dy < 3 || dy > 55) return;
      const dx = x - P.pos.x, dz = z - P.pos.z, hd = Math.hypot(dx, dz); if (hd > 16) return;
      if (steer && hd > 2 && (dx * sx + dz * sz) / hd < 0.3) return;          // only things roughly where you're heading
      const sc = w / (1 + hd * 0.2 + dy * 0.05); if (sc > bs) { bs = sc; best = [dx, dz, hd]; }
    };
    for (const g of gems) if (g.sky && !g.pull && !g.ringCoin) consider(g.pos.x, g.pos.y, g.pos.z, 1);
    for (const R of SKY_RINGS) if (!R.done) consider(R.c.x, R.c.y, R.c.z, 3);
    if (best && best[2] > 0.5) { const k = Math.min(1, best[2] / 4) * 7; ax = best[0] / best[2] * k; az = best[1] / best[2] * k; }
  }
  P.vel.x = lerp(P.vel.x, IN.mx * 20 + ax, Math.min(1, dt * 5));
  P.vel.z = lerp(P.vel.z, IN.mz * 20 + az, Math.min(1, dt * 5));
  P.vel.y = -24;
  const prevY = P.pos.y + 1.3;
  P.pos.addScaledVector(P.vel, dt);
  skyRingTick(prevY, dt);
  updateGems(dt);
  P.pos.x = clamp(P.pos.x, -HALF + 5, HALF - 5); P.pos.z = clamp(P.pos.z, -HALF + 5, HALF - 5);
  IN.jumpP = IN.slideP = IN.dashP = IN.interactP = false;
  if (P.pos.y <= groundAt(P.pos.x, P.pos.z)) land();
}

/* ---------- visuals ---------- */
/* ---------- body physics (visual) ----------
   The frame never falls over while alive, but its parts react: feet plant on the ground and step,
   knees bend over uneven ground and on landings, the body sways with acceleration, arms lag and swing. */
const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function updatePlayerVisual(dt, alpha) {
  const P = player, m = P.model; if (!m || dt <= 0) return;
  P.scampT2 = (P.scampT2 || 0) - dt;
  if (P.scampT2 > 0 && !P.wallX && !P.wallZ) { P.wallX = P.scampWX; P.wallZ = P.scampWZ; }
  const x = lerp(P.prev.x, P.pos.x, alpha), y = lerp(P.prev.y, P.pos.y, alpha), z = lerp(P.prev.z, P.pos.z, alpha);
  const dy = y - P.visY;
  if ((P.onGround || P.mantleT > 0) && Math.abs(dy) < 2.6) P.visY += dy * (1 - Math.exp(-dt * 24)); else P.visY = y;
  P.renderPos.set(x, P.visY, z);
  m.position.copy(P.renderPos);
  // jet flames burn while the jetpack fires
  for (const j of m.userData.jets) for (const f of j.userData.jet.flames) {
    f.visible = P.jetting;
    if (P.jetting) { const k = 1 + Math.random() * 0.6; f.scale.set(1.2, 1.4 * k, 1.2); }
  }
  if (P.jetting) { sfx('jet', 0.5); if (Math.random() < 0.3) { const j = m.userData.jets[0]; if (j) dust(j.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.6, 0)), 1); } }
  const hs = Math.hypot(P.vel.x, P.vel.z);
  const aimYaw = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // LEGS face where you are going. Steering comes from the stick/keys, not the raw velocity, so scraping
  // along a wall (where velocity flickers) can't spin the frame around. Standing still they don't turn at all:
  // the upper body can swing a full 360 over them.
  const heavy = clamp((stats.mass || 3.3) / 3.3, 0.6, 2.5);
  let moveYaw = null;
  if (P.onGround && IN.mag > 0.2 && hs > 0.6) moveYaw = Math.atan2(IN.mx, IN.mz);
  else if (hs > 2.5) moveYaw = Math.atan2(P.vel.x, P.vel.z);
  let legTgt = null;
  if (moveYaw !== null) {
    const rel = wrap(moveYaw - aimYaw);
    // backpedal with hysteresis so the hips don't flip back and forth at the boundary
    if (P.backpedal ? Math.abs(rel) > 1.65 : Math.abs(rel) > 2.35) P.backpedal = true; else P.backpedal = false;
    legTgt = P.backpedal ? moveYaw + Math.PI : moveYaw;
  }
  if (P.torsoYaw === undefined) P.torsoYaw = P.legYaw;
  // springs integrated in small steps so they stay stable at any frame rate
  for (let t = dt; t > 1e-6; t -= 1 / 120) {
    const h = Math.min(t, 1 / 120);
    // hips: a heavy spring that lags behind the torso
    if (legTgt !== null) P.legYawV += (wrap(legTgt - P.legYaw) * 120 / heavy - P.legYawV * 17 / Math.sqrt(heavy)) * h;
    else P.legYawV *= Math.max(0, 1 - 10 * h);
    P.legYaw = wrap(P.legYaw + P.legYawV * h);
    // torso: a lighter, faster spring that chases the aim (the arms on it chase their target faster still)
    P.torsoYawV += (wrap(aimYaw - P.torsoYaw) * 260 / heavy - P.torsoYawV * 26 / Math.sqrt(heavy)) * h;
    P.torsoYaw = wrap(P.torsoYaw + P.torsoYawV * h);
  }
  m.rotation.order = 'YXZ'; m.rotation.set(0, P.legYaw, 0);
  // show-off flip on air jumps once the legs total Lv 50
  if (P.flipT > 0) {
    P.flipT += dt / 0.5;
    const a = P.flipT >= 1 ? 0 : -Math.PI * 2 * (P.flipT * P.flipT * (3 - 2 * P.flipT));
    if (P.flipT >= 1) P.flipT = 0;
    m.rotation.x = a;
    const c = 1.3;   // spin about the chest, not the feet
    m.position.y += c - c * Math.cos(a); m.position.x += -c * Math.sin(a) * Math.sin(P.legYaw); m.position.z += -c * Math.sin(a) * Math.cos(P.legYaw);
  }
  const ud = m.userData;
  const sliding = P.slideT > 0 && P.onGround;

  // body sway: a damped spring pushed by acceleration (in the body's own frame)
  const ax = (P.vel.x - P.lastVel.x) / dt, az = (P.vel.z - P.lastVel.z) / dt;
  P.lastVel.copy(P.vel);
  const cy = Math.cos(P.legYaw), sy = Math.sin(P.legYaw);
  const fwdA = clamp(ax * sy + az * cy, -80, 80), sideA = clamp(ax * cy - az * sy, -80, 80);
  P.swayV.x += (-90 * P.sway.x - 11 * P.swayV.x + fwdA * 0.06) * dt;
  P.swayV.y += (-90 * P.sway.y - 11 * P.swayV.y - sideA * 0.05) * dt;
  P.sway.addScaledVector(P.swayV, dt);
  P.sway.x = clamp(P.sway.x, -0.35, 0.35); P.sway.y = clamp(P.sway.y, -0.3, 0.3);
  // landing dip: knees compress and spring back
  P.dipV += (-140 * P.dip - 10 * P.dipV) * dt;
  P.dip = clamp(P.dip + P.dipV * dt, -0.45, 0.2);

  if (ud.hips) {
    ud.hips.position.y = (sliding ? -0.55 : 0) + P.dip;
    ud.hips.rotation.set(P.sway.x * 0.4, 0, P.sway.y * 0.4);
  }
  if (ud.torso) {
    const torsoYaw = wrap(P.torsoYaw - P.legYaw);
    // the twist winds up a little sideways lean, and the torso leans into a fast turn
    let whirl = 0;
    if ((P.whirlT || 0) > 0) { P.whirlT -= dt; const k = 1 - Math.max(0, P.whirlT) / 0.38; whirl = Math.PI * 2 * (1 - Math.pow(1 - k, 3)); }   // a full spin, fast then easing
    ud.torso.rotation.set((sliding ? -0.35 : P.dashT > 0 ? 0.35 : 0) + P.sway.x * 0.7, torsoYaw + whirl, P.sway.y * 0.7 - clamp(P.torsoYawV * 0.025, -0.18, 0.18));
  }
  m.updateMatrixWorld(true);
  stepLegs(ud, dt, hs, sliding);
  // tread suspension: springs follow the ground under each tread, soak up landings and rattle over bumps
  ud.legs.forEach((lg, i) => {
    const sh = lg.userData.shock; if (!sh) return;
    let target;
    if (!P.onGround) target = -0.18;                                   // hanging in the air
    else {
      const hw = lg.localToWorld(new THREE.Vector3(sh.hub.position.x, sh.restY, 0));
      target = clamp(groundAt(hw.x, hw.z) - P.renderPos.y, -0.2, 0.3) - P.dip * 0.9
             + (hs > 1 ? Math.sin(P.walk * 6 + i * 2.1) * 0.025 * Math.min(1, hs / 8) : 0);
    }
    sh.vel += ((target - sh.off) * 150 - sh.vel * 11) * dt;
    sh.off = clamp(sh.off + sh.vel * dt, -0.25, 0.3);
    setShock(sh, sh.off);
    // wheels roll with how fast you're going forward
    if (sh.wheel) { const fwd = P.vel.x * Math.sin(P.legYaw) + P.vel.z * Math.cos(P.legYaw); sh.wheel.rotation.x += fwd * dt / sh.wheelR; }
  });

  // arms swing toward their target at their own speed, with a little lag from body motion
  if (P.flailT > 0) P.flailT -= dt;
  mountedArms().forEach((it, ii) => {
    const ag = ud.partOf.get(it); if (!ag) return;
    const A = ARMS[it.type];
    const rate = P.flailT > 0 ? armTurn(it) * 2.4 : armTurn(it);
    let t = it.aimT;
    if (P.flailT > 0) {
      // hit reaction: arms thrash out and up instead of aiming, each on its own wild phase, easing back to normal as it fades
      ag.parent.getWorldQuaternion(_q1);
      const k = Math.min(1, P.flailT / 0.22), ph = ii * 2.4 + S.t * 26;
      t = ag.getWorldPosition(_w).clone().add(new THREE.Vector3(Math.sin(ph) * 1.6, 1.2 + Math.sin(ph * 1.3) * 1.1, 0.6 + Math.cos(ph * 0.9) * 1.4).applyQuaternion(_q1).multiplyScalar(k * 2.2 + 0.3));
    } else if (P.scampering || (P.scampT2 || 0) > 0) {
      // scampering: arms reach up the wall, hand over hand
      const wl = Math.hypot(P.wallX || 0, P.wallZ || 0) || 1, inX = -(P.wallX || 0) / wl, inZ = -(P.wallZ || 0) / wl;
      const ap = ag.getWorldPosition(_w).clone(), k = mountedArms().indexOf(it);
      t = ap.add(new THREE.Vector3(inX * 2, 2.4 + 1.6 * Math.sin(S.t * 16 + k * Math.PI), inZ * 2));
    } else if (!t) { // idle: point the way the arm is mounted, sagging slightly
      ag.parent.getWorldQuaternion(_q1);
      t = ag.getWorldPosition(_w).clone().add(new THREE.Vector3(0, -0.25, 1).applyQuaternion(_q1).multiplyScalar(4));
    }
    const cur = ag.userData.q || ag.quaternion.clone();
    // keep the arm from swinging back through its own body: the aim can't point more than a little across the frame
    {
      const ap = ag.getWorldPosition(new THREE.Vector3()), bc = (ud.torso || player.model).getWorldPosition(new THREE.Vector3());
      const o = ap.clone().sub(bc); o.y = 0;
      if (o.lengthSq() > 0.01) {
        o.normalize();
        const d = t.clone().sub(ap), L = d.length() || 1; d.divideScalar(L);
        const k = d.dot(o);
        if (k < -0.15) { d.addScaledVector(o, -0.15 - k).normalize(); t = ap.clone().addScaledVector(d, L); }
      }
    }
    ag.lookAt(t.x, t.y, t.z);
    _q2.copy(ag.quaternion);
    cur.rotateTowards(_q2, rate * dt);
    // inertia: arms trail when the body accelerates
    // recoil: the arm takes the kick and springs back
    it.kickV = (it.kickV || 0) + (-260 * (it.kickA || 0) - 20 * (it.kickV || 0)) * dt;
    it.kickA = clamp((it.kickA || 0) + it.kickV * dt, -0.2, 0.9);
    // melee swing: a fast sideways slash across the target, alternating direction
    let swing = 0;
    if (it.swingT > 0) { const T = 0.34; it.swingT -= dt; const p = 1 - clamp(it.swingT / T, 0, 1); const kat = gs => gs.find(g => WEAPONS[g.type].arc); const kg = kat(armGuns(it)); const amp = kg ? THREE.MathUtils.degToRad(WEAPONS.katana.arc(kg.lvl)) / 2 + 0.25 : 1.35; swing = (it.swingDir || 1) * amp * Math.sin(p * Math.PI * 2); if (it.swingT <= 0) swing = 0; }   // wind up, slash through, recover (a katana swings as wide as its arc)   // wind up, slash through, recover
    _q1.setFromEuler(new THREE.Euler(-P.sway.x * 0.6 - it.kickA * 0.55, swing, -P.sway.y * 0.6));
    ag.quaternion.copy(cur).multiply(_q1);
    ag.userData.q = cur;
    // reloading: a single-gun arm drops its gun down to the waist, works the magazine, then comes back up
    const gs = armGuns(it), rl = gs.length === 1 && gs[0].reloadT > 0 ? 1 : 0;
    it.rlA = (it.rlA || 0) + (rl - (it.rlA || 0)) * Math.min(1, dt * 9);
    if (it.rlA > 0.01) {
      const ap = ag.getWorldPosition(_w).clone(), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion((ud.torso || m).getWorldQuaternion(new THREE.Quaternion()));
      const jig = rl ? Math.sin(S.t * 22) * 0.15 : 0;
      const shown = ag.quaternion.clone();
      ag.lookAt(ap.x + fwd.x * (0.9 + jig), ap.y - 3, ap.z + fwd.z * (0.9 + jig));
      ag.quaternion.copy(shown.slerp(ag.quaternion, it.rlA));
    }
  });
  cosmeticTick(m, dt);
  // radar dishes sweep round
  for (const p of ud.parts) { if (p.userData.spinMesh) p.userData.spinMesh.rotation.y += dt * 2.4; if (p.userData.spinMesh2) p.userData.spinMesh2.rotation.y -= dt * 2.4; }
  // squash and stretch: a soft spring, stretched a touch while rising fast, squashed on landing
  {
    const target = P.onGround ? 0 : clamp(P.vel.y * 0.006, -0.05, 0.07);
    P.sqV = (P.sqV || 0) + (-170 * ((P.sq || 0) - target) - 13 * (P.sqV || 0)) * dt;
    P.sq = clamp((P.sq || 0) + P.sqV * dt, -0.16, 0.12);
    SQUASH.y = 1 + P.sq; SQUASH.xz = 1 - P.sq * 0.55; SQUASH.foot = P.visY !== undefined ? P.visY : P.pos.y;
    if (!PHYS.active) m.scale.set(SQUASH.xz, SQUASH.y, SQUASH.xz); else m.scale.set(1, 1, 1);
  }
  // dash thrusters: idle pilot glow, a long flame while dashing
  const dashing = P.dashT > 0, tt = performance.now() * 0.001;
  for (const p of ud.parts) {
    const fx = p.userData.dashFx; if (!fx) continue;
    fx.flame.visible = dashing;
    if (dashing) { const s = 0.8 + Math.random() * 0.5; fx.flame.scale.set(1, s * 1.4, 1); fx.glow.material.color.setHex(0xffffff); fx.glow.scale.setScalar(1.6); }
    else { fx.glow.material.color.setHex(P.dashCharges > 0 ? 0x58a8ff : 0x203040); fx.glow.scale.setScalar(0.9 + 0.12 * Math.sin(tt * 6)); }
  }
  // spin gears turn whatever is plugged into them
  for (const sp of ud.spinners) sp.anchor.rotation.z += dt * BLOCKS[sp.item.type].spinRate(sp.item.lvl);
  if (S.mode === 'play') { m.updateMatrixWorld(true); meleeTick(dt); sawTick(dt); fieldTick(dt); }
  // weapons slide back in their mount on each shot
  for (const w of mountedWeapons()) {
    const wg = ud.partOf.get(w); if (!wg) continue;
    if (!wg.userData.restPos) wg.userData.restPos = wg.position.clone();
    w.slideV = (w.slideV || 0) + (-500 * (w.slide || 0) - 30 * (w.slideV || 0)) * dt;
    w.slide = clamp((w.slide || 0) + w.slideV * dt, -0.05, 0.25);
    wg.position.copy(wg.userData.restPos).add(_l.set(0, 0, -w.slide).applyQuaternion(wg.quaternion));
    // guns not carried by a single arm (bolted on, or on a twin arm) tip forward 45 degrees while they reload
    if (!wg.userData.restQ) wg.userData.restQ = wg.quaternion.clone();
    const arm = mountedArms().find(a => armGuns(a).includes(w)), tilts = !arm || armGuns(arm).length > 1;
    w.tiltA = (w.tiltA || 0) + ((tilts && w.reloadT > 0 ? 1 : 0) - (w.tiltA || 0)) * Math.min(1, dt * 10);
    wg.quaternion.copy(wg.userData.restQ);
    if (w.tiltA > 0.005) wg.quaternion.multiply(_q1.setFromAxisAngle(_l.set(1, 0, 0), Math.PI / 4 * w.tiltA));
  }
  // treads rumble the camera a touch; walking legs thump it on each footfall (in stepLegs)
  if (P.onGround && ud.legs.some(l => l.userData.shock) && hs > 1) cam.rumble = Math.max(cam.rumble || 0, Math.min(0.05, hs * 0.004));
  P.walk += dt * hs * 0.9;
}

/* Procedural stepping: each foot stays planted until the body has moved far enough, then steps ahead. */
function stepLegs(ud, dt, hs, sliding) {
  const P = player;
  const legs = ud.legs.filter(l => l.userData.ik);
  let stepping = legs.filter(l => l.userData.leg && l.userData.leg.t < 1).length;
  legs.forEach((lg, idx) => {
    const ik = lg.userData.ik;
    const len = ik.a + ik.b;
    // how far a planted foot can sit from straight-below before the leg would have to stretch
    const maxHoriz = Math.sqrt(Math.max(0.01, (len * 0.97) ** 2 - ik.restV.y ** 2));
    const reach = Math.min(maxHoriz * 0.85, 0.28 + hs * 0.05);
    // cadence: faster running means quicker steps, so a foot never has to cover more ground than the leg allows
    const stepTime = clamp(maxHoriz * 0.95 / Math.max(hs, 0.5), 0.06, 0.3);
    const rest = lg.localToWorld(ik.restV.clone());
    const lead = new THREE.Vector3(P.vel.x, 0, P.vel.z).multiplyScalar(stepTime * 0.9);
    if (lead.length() > maxHoriz * 0.7) lead.setLength(maxHoriz * 0.7);
    const want = rest.clone().add(lead); want.y = groundAt(want.x, want.z) + ik.footH;
    let st = lg.userData.leg;
    if (!st) st = lg.userData.leg = { foot: want.clone(), from: want.clone(), to: want.clone(), t: 1 };
    // a leg mounted too high to reach the floor just hangs
    if (lg.userData.dangle === undefined) lg.userData.dangle = P.model.worldToLocal(lg.localToWorld(ik.restV.clone())).y > 0.35 + (ud.hips ? ud.hips.position.y : 0);
    if (P.scampering && !lg.userData.dangle) {
      // scampering: feet claw at the wall in turn, kicking up and pushing down
      const wl = Math.hypot(P.wallX || 0, P.wallZ || 0) || 1, inX = -(P.wallX || 0) / wl, inZ = -(P.wallZ || 0) / wl;
      const ph = S.t * 16 + idx * Math.PI;
      const tgt = rest.clone().add(new THREE.Vector3(inX * 0.45, 0.35 + 0.35 * Math.sin(ph), inZ * 0.45));
      // spider legs: lightweight procedural wall contact. Each claw is staggered up the wall (3 heights) and probes along the
      // wall direction to find the real surface, then plants its tip just short of it; planted claws kick a puff of grit.
      const it = lg.userData.item;
      if (it && it.type === 'spider') {
        const y = rest.y + 0.15 + (idx % 3) * 0.28 + 0.22 * Math.sin(ph + idx);
        let hit = -1;
        for (let d = 0.15; d <= 1.3; d += 0.08) if (groundAt(rest.x + inX * d, rest.z + inZ * d) >= y - 0.05) { hit = d; break; }
        if (hit > 0) {
          tgt.set(rest.x + inX * (hit - 0.04), y, rest.z + inZ * (hit - 0.04));
          const planted = Math.sin(ph + idx) < -0.6;
          if (planted && !st.clawHold) { st.clawHold = true; if (Math.random() < 0.5) spark(tgt.clone(), 0xb9b0a0); }
          else if (!planted) st.clawHold = false;
        }
      }
      st.foot.lerp(tgt, 1 - Math.exp(-dt * 25)); st.t = 1;
    } else if (!P.onGround || sliding || S.mode === 'drop' || lg.userData.dangle) {
      // airborne: legs hang under the body and swing a little
      const hang = rest.clone().add(new THREE.Vector3(0, P.vel.y < 0 ? 0.25 : 0.1, 0)).addScaledVector(new THREE.Vector3(P.vel.x, 0, P.vel.z), sliding ? 0.06 : -0.02);
      st.foot.lerp(hang, 1 - Math.exp(-dt * 12)); st.t = 1;
    } else if (st.t < 1) {
      st.to.copy(want);                       // keep aiming the swinging foot at where it needs to land
      st.t = Math.min(1, st.t + dt / stepTime);
      const e = st.t * st.t * (3 - 2 * st.t);
      st.foot.lerpVectors(st.from, st.to, e);
      st.foot.y += Math.sin(st.t * Math.PI) * Math.min(0.3, 0.1 + hs * 0.02);
      if (st.t >= 1) {
        st.foot.copy(st.to);
        // footfall: the body's weight lands on this leg -> a small physical bounce and a lean onto that side
        const hf = 1 + 0.6 * ((stats && stats.heavy) || 0);
        P.dipV -= (0.7 + hs * 0.11) * hf;
        cam.bobV -= (0.35 + hs * 0.05) * hf;              // each footfall jolts the camera a little
        const side = Math.sign((lg.userData.out && lg.userData.out.x) || 1);
        P.swayV.y += side * (0.15 + hs * 0.02);
        if (hs > 2) dustStep(st.foot);
        if (hs > 1.5) sfx('step', Math.min(0.5, 0.15 + hs * 0.02));
      }
    } else {
      const off = Math.hypot(st.foot.x - want.x, st.foot.z - want.z), groundGap = Math.abs(st.foot.y - want.y);
      const local = lg.worldToLocal(st.foot.clone());
      const stretched = local.length() > len * 0.985;          // leg can't reach: step now, whatever the other leg is doing
      const partnerBusy = legs.some((o, j) => j !== idx && (j % 2) !== (idx % 2) && o.userData.leg && o.userData.leg.t < 1);
      if (stretched || ((off > reach || groundGap > 0.6) && !partnerBusy && stepping < Math.ceil(legs.length / 2))) {
        st.from.copy(st.foot); st.to.copy(want); st.t = 0; stepping++;
      }
      st.foot.y = Math.max(st.foot.y, groundAt(st.foot.x, st.foot.z) + ik.footH);
    }
    legPose(ik, lg.worldToLocal(st.foot.clone()));
  });
}
function dustStep(p) { if (Math.random() < 0.5) dust(p, 1); }

/* Is the straight line a->b clear of terrain (sampled)? */
function lineClear(a, b, pad = 0.3) {
  for (let i = 1; i <= 10; i++) {
    const t = i / 10, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    if (y < groundAt(x, z) + pad) return false;
  }
  return true;
}
/* How badly enemies crowd the segment a->b (count of bodies close to the line). */
function lineCrowd(a, b) {
  let n = 0;
  for (const e of enemies) { if (e.dead) continue; const c = aimPtT(e); if (segDist2(a, b, c) < (e.r + 0.5) ** 2) n++; }
  return n;
}
const _cn = new THREE.Vector3();
function updateCamera(dt) {
  const P = player;
  if (P.superUp && cam.launchHold) {
    // red launch pad: the camera holds its spot, tilts up a little after the frame, and lets it fly out of shot
    const H0 = cam.launchHold; H0.t += dt;
    const k = Math.min(1, H0.t / 0.35), up = k * k * 6;
    camera.position.copy(H0.pos);
    if (cam.shake > 0) { camera.position.x += rand(-1, 1) * cam.shake * 0.25; camera.position.y += rand(-1, 1) * cam.shake * 0.25; cam.shake = Math.max(0, cam.shake - dt * 1.8); }
    camera.lookAt(H0.look.x, H0.look.y + up, H0.look.z);
    camera.updateProjectionMatrix();
    return;
  }
  const dropping = S.mode === 'drop';
  // frame the robot by its own size: the pivot sits just above its top, far enough back to see it whole
  if (player.model && cam.sizeOf !== player.model) {
    cam.sizeOf = player.model;
    const bb = new THREE.Box3().setFromObject(player.model), sz = bb.getSize(new THREE.Vector3());
    cam.robotH = clamp(bb.max.y - player.model.position.y, 1.6, 6);
    cam.robotW = clamp(Math.max(sz.x, sz.z), 1, 4);
  }
  const rH = cam.robotH || 2.6, rW = cam.robotW || 1.6;
  const tgtY = P.visY + rH + 0.25;
  P.camY = Math.abs(P.camY - tgtY) > 6 ? tgtY : lerp(P.camY, tgtY, 1 - Math.exp(-dt * 16));
  cam.dip = Math.max(0, cam.dip - dt * 2.8);
  // landing lag: a beat after a big landing the camera sinks too, then springs back up
  if (cam.lagDelay > 0) { cam.lagDelay -= dt; if (cam.lagDelay <= 0) cam.lagV = (cam.lagV || 0) + cam.lagImp; }
  cam.lagV = (cam.lagV || 0) + (-55 * (cam.lag || 0) - 9 * (cam.lagV || 0)) * dt;
  cam.lag = clamp((cam.lag || 0) + cam.lagV * dt, -0.9, 0.4);
  // directional kick: a small positional jolt away from a hit or a blast that springs back (not random shake)
  cam.kickV.addScaledVector(cam.kick, -150 * dt).multiplyScalar(Math.max(0, 1 - 15 * dt));
  cam.kick.addScaledVector(cam.kickV, dt); if (cam.kick.length() > 0.35) cam.kick.setLength(0.35);
  if (!isFinite(cam.kick.x + cam.kickV.x)) { cam.kick.set(0, 0, 0); cam.kickV.set(0, 0, 0); }
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = new THREE.Vector3(-sy * cp, -sp, -cy * cp);
  const right = new THREE.Vector3(cy, 0, -sy);
  cam.zoom = lerp(cam.zoom || 0, IN.zoom && S.mode === 'play' ? 1 : 0, 1 - Math.exp(-dt * 12));
  const want = dropping ? lerp(14, 36, clamp((P.pos.y - groundAt(P.pos.x, P.pos.z)) / 100, 0, 1)) : RAG.active ? 15 : Math.max(CFG.camDist, 2.6 + rH * 1.35) * (1 - 0.35 * cam.zoom);
  const head = new THREE.Vector3(P.renderPos.x, P.camY - cam.dip * 0.5, P.renderPos.z);
  // Shoulder side: stay over the right shoulder, but swap when a wall or a crowd blocks that side and the other is clear.
  const baseSh = dropping || RAG.active ? 0 : (CFG.camShoulder + rW * 0.3) * (1 - 0.25 * cam.zoom);
  cam.sideCheck -= dt;
  if (baseSh > 0 && cam.sideCheck <= 0 && S.mode === 'play') {
    cam.sideCheck = 0.2;
    const score = side => {
      const pv = head.clone().addScaledVector(right, baseSh * side), cpos = pv.clone().addScaledVector(f, -want);
      return (lineClear(head, pv) ? 0 : 4) + (lineClear(pv, cpos) ? 0 : 2) + lineCrowd(pv, cpos) * 0.6;
    };
    const cur = score(cam.sideT), other = score(-cam.sideT);
    if (cur - other >= 1.5) cam.sideT = -cam.sideT;          // only swap for a clear improvement (no flicker)
  }
  cam.side = lerp(cam.side, cam.sideT, 1 - Math.exp(-dt * 5));
  // keep the pivot itself out of walls: pull the shoulder offset in until the line from the head is clear
  let sh = baseSh * cam.side;
  for (let k = 0; k < 4 && Math.abs(sh) > 0.05; k++) { if (lineClear(head, _cn.copy(head).addScaledVector(right, sh), 0.15)) break; sh *= 0.5; }
  if (Math.abs(sh) <= 0.05) sh = 0;
  cam.shNow = cam.shNow === undefined ? sh : lerp(cam.shNow, sh, 1 - Math.exp(-dt * 10));
  const pivot = head.clone().addScaledVector(right, cam.shNow);
  let dist = want;
  if (!dropping) {
    for (let i = 1; i <= 16; i++) {
      const t = i / 16 * want;
      if (pivot.y - f.y * t < groundAt(pivot.x - f.x * t, pivot.z - f.z * t) + 0.45) { dist = Math.max(0.9, t - 0.7); break; }
    }
  }
  cam.dist = dist < cam.dist ? lerp(cam.dist, dist, 1 - Math.exp(-dt * 30)) : lerp(cam.dist, dist, 1 - Math.exp(-dt * 4));
  // footfall / jump / landing bob: a damped spring on the camera height
  cam.bobV += (-170 * cam.bob - 15 * cam.bobV) * dt;
  cam.bob = clamp(cam.bob + cam.bobV * dt, -0.35, 0.35);
  camera.position.set(pivot.x - f.x * cam.dist, pivot.y - f.y * cam.dist + cam.bob * 0.35 + (cam.lag || 0), pivot.z - f.z * cam.dist);
  camera.position.add(cam.kick);
  // shake: smooth noise (not white jitter), scaled by the square of the trauma so small hits stay subtle
  const tN = performance.now() / 1000, tr = cam.shake * cam.shake + (cam.rumble || 0);
  let roll = 0;
  if (tr > 1e-4) {
    const n = (a, b) => Math.sin(tN * a + b) * 0.6 + Math.sin(tN * a * 2.31 + b * 1.7) * 0.4;
    camera.position.addScaledVector(right, n(41, 0) * tr * 0.55);
    camera.position.y += n(47, 2) * tr * 0.45;
    roll = n(33, 5) * tr * 0.06;
  }
  cam.shake = Math.max(0, cam.shake - dt * 1.8);
  cam.rumble = Math.max(0, (cam.rumble || 0) - dt * 0.3);
  camera.lookAt(pivot.x + f.x * 20 + cam.kick.x * 0.4, pivot.y + f.y * 20 + cam.bob * 0.2 + (cam.lag || 0) * 0.5 + cam.kick.y * 0.4, pivot.z + f.z * 20 + cam.kick.z * 0.4);
  if (roll) camera.rotateZ(roll);
  const hs = Math.hypot(P.vel.x, P.vel.z);
  // speed FOV: widens as you go faster than a run (boost, slide, pads, falls), more again while dashing
  const fast = clamp((hs - stats.speed * 0.9) / (stats.speed * 0.9), 0, 1);
  const fovT = CFG.fov + fast * CFG.speedFovAdd + (P.dashT > 0 ? CFG.speedFovAdd * 0.9 : 0) + (P.slideT > 0 ? 3 : 0) - CFG.zoomFov * cam.zoom;
  camera.fov = lerp(camera.fov, fovT, 1 - Math.exp(-dt * (fovT > camera.fov ? 9 : 4)));     // snaps wide, eases back
  if (cam.fovPunch) { camera.fov += cam.fovPunch; cam.fovPunch *= Math.exp(-dt * 7); if (Math.abs(cam.fovPunch) < 0.05) cam.fovPunch = 0; }
  camera.updateProjectionMatrix();
  aim.origin.copy(camera.position);
  aim.dir.copy(f);
}

/* Aim ray: what the crosshair is over. */
function updateAim() {
  const o = aim.origin, d = aim.dir, minT = cam.dist + 0.6;
  let best = 160, hitE = null;
  const tt = rayTerrain(o, d, minT, 160); if (tt > 0) best = tt;
  for (const e of enemies) {
    if (e.dead) continue;
    const ep = e.pos, ox = ep.x - o.x, oz = ep.z - o.z, oy = ep.y + (e.d.fly ? 0 : e.r * 0.9 + (e.boss ? 2 : 0)) - o.y, tc = ox * d.x + oy * d.y + oz * d.z;
    if (tc < minT || tc > best) continue;
    const r = e.r + 0.35 + (e.boss ? 1.4 : 0);
    if (ox * ox + oy * oy + oz * oz - tc * tc <= r * r) { best = tc; hitE = e; }
  }
  for (const t of targets) {
    if (t.dead) continue;
    const ox = t.pos.x - o.x, oy = t.pos.y - o.y, oz = t.pos.z - o.z, tc = ox * d.x + oy * d.y + oz * d.z;
    if (tc < minT || tc > best) continue;
    if (ox * ox + oy * oy + oz * oz - tc * tc <= t.r * t.r) { best = tc; hitE = null; }
  }
  aim.point.copy(o).addScaledVector(d, best);
  if (!hitE && IN.device === 'pad' && SETTINGS.aimAssist) {
    let ba = 0.075;
    for (const e of enemies) {
      if (e.dead || e.d.npc) continue;
      const v = _aaV.copy(aimPtT(e)).sub(o), dist = v.length();
      if (dist < minT || dist > 70 || (tt > 0 && dist > tt + 1)) continue;
      const ang = Math.acos(clamp(v.dot(d) / dist, -1, 1));
      if (ang < ba) { ba = ang; hitE = e; }
    }
    if (hitE) aim.point.copy(aimPt(hitE));
  }
  aim.enemy = hitE;
}

/* nudge the camera: dir is the way it gets shoved (world space), amt how far (kept small) */
function camKick(dir, amt) {
  if (!cam.kickV || !(amt > 0)) return;
  const l = dir.length(); if (!(l > 1e-4)) return;
  cam.kickV.addScaledVector(dir, amt * 7 / l);
}

const _aaV = new THREE.Vector3();
