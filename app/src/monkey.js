'use strict';
/* ============================================================
   SCRAP MONKEY  (module: monkey)
   A pet robot monkey on a leash. He ranges around you, picks up loose experience and bolts that you
   would otherwise have to walk over, and carries them back. He holds only a few at first; levelling
   the module widens his pockets, his reach and his legs.

   He is pure utility and nothing can hurt him: he is not an enemy and not a physics body, just a
   group of meshes and a little state machine, so nothing targets him, nothing collides with him and
   he costs no simulation beyond this file.

   The one thing to be careful about: when he grabs a pickup it is spliced straight out of `gems`
   here, before `updateGems` runs in the same step. Marking it done instead would leave it in the
   array for that loop, which credits anything within 1.4 m of you - so a pickup grabbed at your feet
   would pay out twice. Whatever he is holding is banked by `monkeyReset`, so a stage ending with a
   full monkey loses nothing.
   ============================================================ */
const MONK = {
  on: false, item: null, g: null, P: null,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), face: 0, faceT: 0,
  state: 'idle', target: null,
  xp: 0, bolts: 0, n: 0, cap: 3, reach: 14, speed: 11,
  t: 0, step: 0, grabT: 0, hopT: 0, chirpT: 0, wander: 0, wanderT: 0, bob: 0, stuckT: 0, run: 0,
  leash: null, anchor: new THREE.Vector3(),
};

const MONK_LINKS = 18;          // segments in the leash
const MONK_ORBIT = 3.4;         // how far out he idles when there is nothing to fetch
const MONK_DROP = 2.0;          // how close he has to get to hand it over

/* ---------- the rig ----------
   Built facing +Z and turned with g.rotation.y. Long arms, short legs, a curling tail and a pouch on
   his back that swells as he fills up, so you can see how close he is to coming back. */
function monkeyBuild() {
  if (MONK.g) return;
  const g = new THREE.Group();
  const acc = accentHex();
  const SKIN = 0x6b5a4e, DARK = 0x2e2824, TRIM = 0x8d7d6d;
  const P = { arms: [], legs: [], tail: [], eyes: [] };

  const torso = new THREE.Group(); torso.position.y = 0.62; g.add(torso); P.torso = torso;
  torso.add(bx(0.34, 0.40, 0.26, SKIN, 0, 0, 0));
  torso.add(bx(0.26, 0.22, 0.06, TRIM, 0, 0.02, 0.14));            // chest plate
  torso.add(bx(0.38, 0.07, 0.30, acc, 0, 0.17, 0));                 // harness, where the leash clips on
  P.clip = new THREE.Object3D(); P.clip.position.set(0, 0.2, -0.16); torso.add(P.clip);

  const head = new THREE.Group(); head.position.set(0, 0.34, 0.02); torso.add(head); P.head = head;
  head.add(bx(0.28, 0.26, 0.26, SKIN, 0, 0, 0));
  head.add(bx(0.16, 0.12, 0.10, TRIM, 0, -0.04, 0.16));             // muzzle
  head.add(bx(0.17, 0.03, 0.03, DARK, 0, -0.07, 0.21));             // mouth line
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(ballGeo, M(TRIM)); ear.scale.set(0.09, 0.09, 0.04);
    ear.position.set(s * 0.16, 0.04, 0); head.add(ear);
    const eye = bx(0.07, 0.07, 0.04, acc, s * 0.07, 0.02, 0.14, 1.4); head.add(eye); P.eyes.push(eye);
  }

  // arms: upper and fore, hung off the shoulders. Long, so they swing low like a real monkey's.
  for (const s of [-1, 1]) {
    const up = new THREE.Group(); up.position.set(s * 0.2, 0.14, 0); torso.add(up);
    up.add(bx(0.11, 0.26, 0.11, SKIN, 0, -0.13, 0));
    const fore = new THREE.Group(); fore.position.y = -0.26; up.add(fore);
    fore.add(bx(0.095, 0.24, 0.095, TRIM, 0, -0.12, 0));
    fore.add(bx(0.12, 0.10, 0.13, DARK, 0, -0.26, 0.01));           // hand
    P.arms.push({ up, fore, s });
  }
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.11, -0.19, 0); torso.add(hip);
    hip.add(bx(0.12, 0.22, 0.12, SKIN, 0, -0.11, 0));
    const shin = new THREE.Group(); shin.position.y = -0.22; hip.add(shin);
    shin.add(bx(0.10, 0.20, 0.10, TRIM, 0, -0.10, 0));
    shin.add(bx(0.13, 0.07, 0.19, DARK, 0, -0.21, 0.03));           // foot
    P.legs.push({ hip, shin, s });
  }

  // tail: six shrinking segments, each parented to the last, so one sine runs a curl down the whole thing
  let prev = torso, len = 0.17;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? -0.16 : -0.0, i === 0 ? -0.15 : -len);
    prev.add(seg);
    seg.add(bx(0.075 - i * 0.008, 0.075 - i * 0.008, len, i % 2 ? TRIM : SKIN, 0, 0, -len / 2));
    P.tail.push(seg); prev = seg; len *= 0.88;
  }

  // the pouch: empty it is nothing, full it is a fat satchel on his back
  const sack = bx(0.3, 0.26, 0.2, 0x4a4036, 0, -0.02, -0.2); torso.add(sack);
  sack.scale.setScalar(0.001); P.sack = sack;
  const spark = new THREE.Mesh(ballGeo, B(COL.amber, { transparent: true, opacity: 0.85 }));
  spark.scale.setScalar(0.07); spark.position.set(0, 0.1, -0.22); torso.add(spark); P.spark = spark;

  g.visible = false; scene.add(g);
  MONK.g = g; MONK.P = P;

  /* The leash is one instanced draw of MONK_LINKS little links, re-posed along a sagging curve every
     frame. A THREE.Line would be a single pixel wide on most hardware and vanish at any distance. */
  const lk = new THREE.InstancedMesh(geoBox, M(0x3b3f45), MONK_LINKS);
  lk.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lk.frustumCulled = false; lk.castShadow = false; lk.receiveShadow = false;
  lk.userData.noShadow = true; lk.visible = false;
  scene.add(lk); MONK.leash = lk;
}

/* The player's secondary colour, for his eyes and harness, so the pet matches the robot. */
function accentHex() {
  try { const c = (CUSTOM && CUSTOM.color2) || '#ff7a1a'; return parseInt(c.slice(1), 16) || 0xff7a1a; }
  catch (e) { return 0xff7a1a; }
}

function monkeyClear() {
  if (MONK.g) { scene.remove(MONK.g); MONK.g = null; MONK.P = null; }
  if (MONK.leash) { scene.remove(MONK.leash); MONK.leash = null; }
  MONK.on = false; MONK.item = null; MONK.target = null; MONK.state = 'idle';
  MONK.xp = 0; MONK.bolts = 0; MONK.n = 0;
}

/* Banks whatever he is still holding. Called when the stage ends, so a full monkey is never a loss. */
function monkeyBank() {
  if (MONK.xp > 0) gainXp(MONK.xp);
  if (MONK.bolts > 0) { S.bolts += MONK.bolts; if (S.st) S.st.bolts += MONK.bolts; }
  MONK.xp = 0; MONK.bolts = 0; MONK.n = 0;
}

function monkeyReset() { monkeyBank(); monkeyClear(); }

/* Where the leash is tied on: the cleat on the module itself, or your chest if it cannot be found. */
function monkeyAnchor(out) {
  const ud = player.model && player.model.userData;
  const mz = ud && ud.muzzleOf && MONK.item ? ud.muzzleOf.get(MONK.item) : null;
  if (mz) mz.getWorldPosition(out);
  else out.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
  return out;
}

const _mkA = new THREE.Vector3(), _mkB = new THREE.Vector3(), _mkD = new THREE.Vector3(),
      _mkM = new THREE.Matrix4(), _mkQ = new THREE.Quaternion(), _mkS = new THREE.Vector3(),
      _mkUp = new THREE.Vector3(0, 0, 1);

function monkeyTick(dt) {
  const it = mountedItems().find(o => o.kind === 'module' && o.type === 'monkey');
  if (!it || !S.inRun) { if (MONK.on) monkeyReset(); return; }
  monkeyBuild();
  if (MONK.item !== it) {                       // first tick, or the module was swapped out for another
    MONK.item = it; MONK.on = true;
    MONK.pos.copy(player.pos); MONK.pos.y = groundAt(MONK.pos.x, MONK.pos.z);
  }
  const D = MODULES.monkey;
  MONK.cap = D.carry(it.lvl); MONK.reach = D.reach(it.lvl); MONK.speed = D.speed(it.lvl);

  const show = S.mode === 'play' || S.mode === 'pause' || S.mode === 'levelup';
  MONK.g.visible = show; MONK.leash.visible = show;
  if (S.mode !== 'play') return;

  MONK.t += dt;
  monkeyThink(dt);
  monkeyMove(dt);
  monkeyPose(dt);
  monkeyLeash();
}

/* ---------- what he is doing ----------
   Everything he considers is measured from YOU, not from him, so he never wanders off: the reach is a
   ring around the robot, and the leash is long enough to be decorative rather than a constraint. */
function monkeyThink(dt) {
  MONK.chirpT -= dt;

  // the thing he is going for may have been walked over by you in the meantime
  if (MONK.target && (MONK.target.done || !gems.includes(MONK.target) || MONK.target.pull)) MONK.target = null;

  if (MONK.n < MONK.cap) {
    const near = monkeyFind();
    if (near && near !== MONK.target) {
      if (!MONK.target) { MONK.target = near; monkeyChirp(0.5); }
      // only switch for something meaningfully closer, or he dithers between two equal piles
      else if (near.pos.distanceToSquared(MONK.pos) < MONK.target.pos.distanceToSquared(MONK.pos) * 0.55) MONK.target = near;
    }
  } else MONK.target = null;

  /* Reach is measured flat, with a generous allowance for height. The arena is terraced and he is
     simply stood on top of whatever terrain is under him, so a pickup a step down the slope sits a
     couple of metres below his feet: a plain 3D distance test meant he would jog up to within arm's
     length of it and never close the gap. */
  if (MONK.target) {
    const dx = MONK.target.pos.x - MONK.pos.x, dz = MONK.target.pos.z - MONK.pos.z;
    if (dx * dx + dz * dz < 0.9 * 0.9 && Math.abs(MONK.target.pos.y - MONK.pos.y) < 3) monkeyGrab(MONK.target);
  }

  // state comes last, from what is actually true now - a grab clears the target, and deciding before
  // that left him in 'fetch' with nothing to fetch
  if (MONK.n >= MONK.cap || (MONK.n > 0 && !MONK.target)) MONK.state = 'return';
  else if (MONK.target) MONK.state = 'fetch';
  else MONK.state = 'idle';

  if (MONK.state === 'return') {
    const d = _mkA.copy(player.pos).setY(0).distanceTo(_mkB.copy(MONK.pos).setY(0));
    if (d < MONK_DROP) monkeyDeposit();
  }
  /* Last resort. Terrain can always find a way to put something where he cannot stand - wedged in a
     crevice, on a lip he slides off - and a pet that locks onto one unreachable bolt and stares at it
     for the rest of the stage is worse than one that misses it. If he has been trying to reach the
     same thing without getting anywhere for three seconds, he writes it off and looks elsewhere. */
  if (MONK.state === 'fetch' && MONK.target) {
    MONK.stuckT = (MONK.run || 0) < 0.6 ? MONK.stuckT + dt : 0;
    if (MONK.stuckT > 3) { MONK.target.monkNo = true; MONK.target = null; MONK.stuckT = 0; }
  } else MONK.stuckT = 0;

  // the odd chirp while he is pottering about
  if (MONK.chirpT <= 0 && MONK.state === 'idle' && Math.random() < dt * 0.25) monkeyChirp(0.32);
}

/* The nearest loose experience or bolt inside his reach of you, that is not already flying to you. */
function monkeyFind() {
  let best = null, bd = Infinity;
  const R = MONK.reach * MONK.reach;
  for (const g of gems) {
    if (g.done || g.pull || g.sky || g.float || g.monkNo) continue;
    if (g.kind !== 'xp' && g.kind !== 'bolt') continue;
    const dp = g.pos.distanceToSquared(player.pos);
    if (dp > R) continue;
    const d = g.pos.distanceToSquared(MONK.pos);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function monkeyGrab(g) {
  const i = gems.indexOf(g);
  if (i >= 0) gems.splice(i, 1);                 // out of the array NOW: see the note at the top
  scene.remove(g.mesh);
  if (g.kind === 'xp') MONK.xp += g.val; else MONK.bolts += g.val;
  MONK.n++;
  MONK.target = null; MONK.state = 'idle'; MONK.grabT = 0.26;
  sfx(g.kind === 'xp' ? 'xp' : 'coin', 0.18);
  if (PFX.add) for (let k = 0; k < 4; k++) {
    PFX.add.add(g.pos.x, g.pos.y + 0.2, g.pos.z, rand(-1.4, 1.4), rand(1, 3), rand(-1.4, 1.4),
      rand(0.16, 0.3), 0.05, g.kind === 'xp' ? COL.amber : 0xffc851, 14, 0, 0, 0, 0, 0, 0, 0.9);
  }
}

function monkeyDeposit() {
  if (MONK.n <= 0) return;
  const n = MONK.n, hadXp = MONK.xp > 0;
  monkeyBank();
  MONK.hopT = 0.45; MONK.state = 'idle';
  sfx(hadXp ? 'xp' : 'coin', 0.5); monkeyChirp(0.6);
  if (PFX.add) for (let k = 0; k < Math.min(14, 4 + n * 2); k++) {
    PFX.add.add(MONK.pos.x, MONK.pos.y + 0.8, MONK.pos.z, rand(-2.5, 2.5), rand(2, 5), rand(-2.5, 2.5),
      rand(0.25, 0.5), 0.06, hadXp ? COL.amber : 0xffc851, 16, 0, 0, 0, 0, 0, 0, 0.9);
  }
}

function monkeyChirp(v) { MONK.chirpT = rand(1.4, 3.2); sfx('chirp', v); }

/* ---------- getting there ----------
   He runs on the ground, steered toward whatever the state wants, and is simply placed on top of the
   terrain each step. No collision: he is allowed to run through things, which is what keeps a pet from
   ever getting stuck behind a wall and left behind. */
function monkeyMove(dt) {
  let want = _mkA;
  if (MONK.state === 'fetch' && MONK.target) want.copy(MONK.target.pos);
  else if (MONK.state === 'return' || MONK.state === 'fetch') want.copy(player.pos);
  else {
    // idle: amble around you on a slowly drifting orbit
    MONK.wanderT -= dt;
    if (MONK.wanderT <= 0) { MONK.wanderT = rand(1.6, 3.4); MONK.wander = Math.random() * Math.PI * 2; }
    MONK.bob += dt * 0.6;
    const a = MONK.wander + Math.sin(MONK.bob) * 0.5;
    want.set(player.pos.x + Math.cos(a) * MONK_ORBIT, player.pos.y, player.pos.z + Math.sin(a) * MONK_ORBIT);
  }

  _mkD.copy(want).sub(MONK.pos); _mkD.y = 0;
  const d = _mkD.length();
  /* He slows as he arrives so he settles instead of jittering on the spot - but a fetch drives all
     the way in. Easing out over the last half metre parked him a stride short of anything standing
     on a ledge: he would stop just below the lip, where the terrain under HIM is metres lower than
     the pickup, and sit there forever. Walking that last step is what carries him up onto it. */
  const stop = MONK.state === 'idle' ? 1.1 : MONK.state === 'return' ? MONK_DROP * 0.8 : 0;
  const sp = MONK.speed * clamp((d - stop * 0.5) / 2.2, 0, 1) * (MONK.grabT > 0 ? 0.25 : 1);
  if (d > 0.001) _mkD.divideScalar(d);
  const acc = 26;
  MONK.vel.x += (_mkD.x * sp - MONK.vel.x) * Math.min(1, acc * dt);
  MONK.vel.z += (_mkD.z * sp - MONK.vel.z) * Math.min(1, acc * dt);
  MONK.pos.x += MONK.vel.x * dt; MONK.pos.z += MONK.vel.z * dt;
  // eased rather than snapped, so a terrace reads as him scrambling up it instead of teleporting
  const gy = groundAt(MONK.pos.x, MONK.pos.z);
  MONK.pos.y += (gy - MONK.pos.y) * Math.min(1, dt * 14);
  if (Math.abs(gy - MONK.pos.y) < 0.02) MONK.pos.y = gy;

  const run = Math.hypot(MONK.vel.x, MONK.vel.z);
  MONK.step += run * dt * 2.6;
  if (run > 0.4) {                                // face the way he is going, easing round
    const want2 = Math.atan2(MONK.vel.x, MONK.vel.z);
    let dif = want2 - MONK.face;
    while (dif > Math.PI) dif -= Math.PI * 2; while (dif < -Math.PI) dif += Math.PI * 2;
    MONK.face += dif * Math.min(1, dt * 9);
  }
  MONK.run = run;
}

/* ---------- how he looks doing it ---------- */
function monkeyPose(dt) {
  const P = MONK.P, g = MONK.g;
  MONK.grabT = Math.max(0, MONK.grabT - dt);
  MONK.hopT = Math.max(0, MONK.hopT - dt);
  const run = MONK.run || 0, gait = Math.min(1, run / 6);
  const hop = MONK.hopT > 0 ? Math.sin((1 - MONK.hopT / 0.45) * Math.PI) : 0;

  g.position.copy(MONK.pos);
  g.position.y += Math.abs(Math.sin(MONK.step * 2)) * 0.06 * gait + hop * 0.55;
  g.rotation.y = MONK.face;

  const sw = Math.sin(MONK.step) * gait;
  P.legs[0].hip.rotation.x = sw * 0.9; P.legs[1].hip.rotation.x = -sw * 0.9;
  P.legs[0].shin.rotation.x = Math.max(0, -sw) * 0.8; P.legs[1].shin.rotation.x = Math.max(0, sw) * 0.8;

  // arms swing opposite the legs; a grab throws them forward; carrying pulls them in to hug the load
  const hug = MONK.n > 0 ? Math.min(1, MONK.n / Math.max(1, MONK.cap)) * 0.5 : 0;
  const reach = MONK.grabT > 0 ? Math.sin((1 - MONK.grabT / 0.26) * Math.PI) : 0;
  P.arms[0].up.rotation.x = -sw * 1.1 - reach * 1.6 + hug * 0.6 + hop * -1.9;
  P.arms[1].up.rotation.x = sw * 1.1 - reach * 1.6 + hug * 0.6 + hop * -1.9;
  for (const a of P.arms) { a.up.rotation.z = a.s * (0.12 + hug * 0.5); a.fore.rotation.x = -0.35 - hug * 0.9 - reach * 0.5; }

  P.torso.rotation.x = gait * 0.22 + reach * 0.5 - hop * 0.3;
  P.head.rotation.x = -P.torso.rotation.x * 0.7 + Math.sin(MONK.t * 1.7) * 0.05;
  P.head.rotation.y = Math.sin(MONK.t * 0.9) * (MONK.state === 'idle' ? 0.5 : 0.12);

  // the tail curls and sways: one wave running down the segments
  for (let i = 0; i < P.tail.length; i++) {
    const t = P.tail[i];
    t.rotation.x = (i === 0 ? -0.5 : -0.26) + Math.sin(MONK.t * 3.2 - i * 0.55) * (0.07 + gait * 0.1);
    t.rotation.y = Math.sin(MONK.t * 2.1 - i * 0.4) * (0.06 + gait * 0.12);
  }

  const f = MONK.cap > 0 ? MONK.n / MONK.cap : 0;
  P.sack.scale.setScalar(Math.max(0.001, f));
  P.spark.visible = MONK.n > 0;
  if (MONK.n > 0) {
    P.spark.material = B(MONK.xp >= MONK.bolts ? COL.amber : 0xffc851, { transparent: true, opacity: 0.85 });
    P.spark.scale.setScalar(0.05 + f * 0.06 + Math.sin(MONK.t * 9) * 0.008);
  }
  // his eyes brighten as he fills up, so a full monkey reads from across the arena
  for (const e of P.eyes) e.material = M(accentHex(), 1 + f * 2.2);
}

/* ---------- the leash ----------
   Straight line from the cleat to his harness with a sine sag laid over it, so it hangs when he is
   close and pulls taut when he is out at the end of his range. Decorative: it never pulls on him. */
function monkeyLeash() {
  const lk = MONK.leash;
  monkeyAnchor(_mkA);
  MONK.P.clip.getWorldPosition(_mkB);
  const span = _mkA.distanceTo(_mkB);
  const sag = clamp(0.35 + (MONK.reach - span) * 0.1, 0.18, 1.5);
  let px = _mkA.x, py = _mkA.y, pz = _mkA.z;
  for (let i = 0; i < MONK_LINKS; i++) {
    const t = (i + 1) / MONK_LINKS;
    const x = _mkA.x + (_mkB.x - _mkA.x) * t;
    const y = _mkA.y + (_mkB.y - _mkA.y) * t - Math.sin(Math.PI * t) * sag;
    const z = _mkA.z + (_mkB.z - _mkA.z) * t;
    _mkD.set(x - px, y - py, z - pz);
    const len = _mkD.length() || 0.001;
    _mkQ.setFromUnitVectors(_mkUp, _mkD.divideScalar(len));
    _mkM.compose(_mkS.set((px + x) / 2, (py + y) / 2, (pz + z) / 2), _mkQ, _mkD.set(0.045, 0.045, len));
    lk.setMatrixAt(i, _mkM);
    px = x; py = y; pz = z;
  }
  lk.instanceMatrix.needsUpdate = true;
}
