'use strict';
/* ============================================================
   GAME CONTENT
   Every part, weapon and module is defined once here: stats, look and behaviour.
   To add something new, copy an existing entry, give it a new key and change it.
   It then appears in the hangar bin (legs/arms), in level-up offers, and in the inventory.
   ============================================================ */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const STARTER_WEAPON = 'pistol';   // weapon every new arm comes with

/* ---------- Rarity ----------
   Level-up stat cards roll a rarity (1..5). A part's rarity comes from its level (see tierOf). */
const RARITY = [
  null,
  { name: 'Common',    color: 0xb9c2c9, css: '#b9c2c9', weight: 60 },
  { name: 'Uncommon',  color: 0x4fd06b, css: '#4fd06b', weight: 25 },
  { name: 'Rare',      color: 0x3f8cff, css: '#3f8cff', weight: 10 },
  { name: 'Epic',      color: 0xb45cff, css: '#b45cff', weight: 4 },
  { name: 'Legendary', color: 0xffa21a, css: '#ffa21a', weight: 1 },
];
/* Roll a rarity 1..5. luck shifts weight from common toward the rarer tiers. */
function rollRarity(luck = 0) {
  const w = RARITY.slice(1).map((r, i) => i === 0 ? Math.max(5, r.weight - luck * 1.2) : r.weight * (1 + luck * 0.04 * i));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i + 1; }
  return 1;
}
/* Every upgradeable part runs Level 1..5, and the level IS the rarity:
   L1 Common, L2 Uncommon, L3 Rare, L4 Epic, L5 Legendary.
   A dropped part arrives at its rolled rarity's level. Two identical parts of the same level merge into one of the next level
   (L1+L1 -> L2 ... L4+L4 -> L5). There is no usage experience on parts; only the player earns XP.
   The balance tables were tuned on the old 1..100 scale, so stat formulas are still written for that scale: LEGACY_LV maps a
   level 1..5 onto the formula level it is evaluated at (see wrapLevelStats). */
const MAX_LVL = 5;
const TIER_START = [0, 1, 2, 3, 4, 5];
const LEGACY_LV = [0, 1, 10, 30, 60, 100];
const sLv = lvl => LEGACY_LV[Math.max(1, Math.min(5, Math.round(lvl) || 1))];
function tierOf(lvl) { return Math.max(1, Math.min(5, Math.round(lvl) || 1)); }
/* An old save or dev-shelf item may carry a level on the old 1..100 scale (or part experience): bring it onto Level 1..5. */
function migrateLvl(lvl) { lvl = Math.round(lvl) || 1; if (lvl <= 5 && lvl >= 1) return lvl; return lvl >= 60 ? 5 : lvl >= 30 ? 4 : lvl >= 10 ? 3 : lvl >= 5 ? 2 : 1; }
const rarityOf = lvl => RARITY[tierOf(lvl)];
/* 0 at Lv 1, rising toward 1 by about Lv 60: used for stats that must not run away (speeds, turn rates). */
const lvlCurve = (lvl, k = 22) => 1 - Math.exp(-(lvl - 1) / k);
const mkTag = lvl => `<em class="mk r${tierOf(lvl)}">Lv ${lvl}</em>`;
const lvTag = it => it.kind === 'gem' ? `<em class="mk r${Math.min(5, it.lvl)}">Tier ${ROMAN[it.lvl || 1]}</em>` : mkTag(it.lvl);

/* ---------- Level-up stat upgrades ----------
   Each card rolls a rarity; v[rarity] is the bonus. Bonuses last for the whole run. */
const STAT_UPGRADES = {
  hp:     { name: 'Hull Plating',      unit: ' health',          v: [0, 10, 20, 35, 55, 80],         icon: 'box' },
  shield: { name: 'Shield Capacitor',  unit: ' shield',          v: [0, 4, 7, 11, 16, 24],           icon: 'box' },
  jump:   { name: 'Piston Boost',      unit: ' m jump height',   v: [0, 0.2, 0.35, 0.5, 0.75, 1.0],  icon: 'jump' },
  speed:  { name: 'Servo Tuning',      unit: '% move speed',     v: [0, 4, 7, 11, 16, 22],           icon: 'speed' },
  reload: { name: 'Fast Loader',       unit: '% reload speed',   v: [0, 8, 13, 19, 27, 38],          icon: 'weapon' },
  rate:   { name: 'Trigger Tuning',    unit: '% fire rate',      v: [0, 5, 8, 12, 17, 24],           icon: 'weapon' },
  crit:   { name: 'Targeting Chip',    unit: '% critical hit chance (crits do double damage)', v: [0, 3, 5, 8, 12, 16], icon: 'weapon' },
  slot:   { name: 'Cargo Rack',        unit: ' storage slot',    v: [0, 1, 1, 1, 1, 2],              icon: 'box', weight: 0.35 },
  multi:  { name: 'Split Chamber',     unit: '% extra projectile chance (the extra shot does 60% damage)', v: [0, 3, 5, 8, 11, 16], icon: 'weapon' },
  pspeed: { name: 'Muzzle Velocity',   unit: '% projectile speed', v: [0, 6, 10, 15, 22, 32], icon: 'weapon' },
  range:  { name: 'Long Barrel',       unit: '% weapon range (reach, blast, orbit size)', v: [0, 5, 8, 12, 17, 24], icon: 'weapon', weight: 0.8 },
  luck:   { name: 'Lucky Charm',       unit: ' luck',            v: [0, 5, 9, 14, 20, 28],           icon: 'module' },
};

/* ---------- Loot ----------
   Targets and elite enemies can drop a part. Its Mk (rarity) is rolled with your luck. */
function rollLootOf(kinds, luck = 0) { let it; for (let i = 0; i < 40; i++) { it = rollLoot(luck); if (kinds.includes(it.kind)) break; } return it; }
const isLimb = kind => kind === 'arm' || kind === 'leg';
/* Loot lying around the world is never a leveled module: a module found out in the field is always Lv 1 (store, case and terminal rewards may be higher). */
function rollWorldLoot(luck = 0) { const it = rollLoot(luck); return it.kind === 'module' ? mkItem('module', it.type, 1) : it; }
function rollLoot(luck = 0) {
  const pool = [];
  for (const t of Object.keys(WEAPONS)) pool.push(['weapon', t, 3 * (WEAPONS[t].lootWeight ?? 1)]);
  for (const t of Object.keys(ARMS)) pool.push(['arm', t, 1.5]);
  if (!BUILD_V2) for (const t of Object.keys(LEGS)) pool.push(['leg', t, 1]);       // V2: the lower half never drops
  for (const t of Object.keys(MODULES)) pool.push(['module', t, 1.2]);
  if (BUILD_V2) for (const t of Object.keys(ADAPTERS)) pool.push(['adapter', t, 0.5]);
  if (!BUILD_V2) for (const t of Object.keys(BLOCKS)) if (!BLOCKS[t].body) pool.push(['block', t, 0.8]);    // V2: no free sockets for bricks
  let x = Math.random() * pool.reduce((a, p) => a + p[2], 0), pickd = pool[0];
  for (const p of pool) { x -= p[2]; if (x <= 0) { pickd = p; break; } }
  // a rolled rarity gives exactly the first level of that rarity
  const tier = rollRarity(luck);
  // limbs (arms and legs) always drop at level 1 and are raised by merging identical ones
  const it = mkItem(pickd[0], pickd[1], (pickd[0] === 'block' && !BLOCKS[pickd[1]].upgradable) || isLimb(pickd[0]) || pickd[0] === 'adapter' ? 1 : TIER_START[tier]);
  return it;
}

/* ---------- Blocks (bodies and bricks) ----------
   A block is a box with a hole on its faces. It plugs into a hole with a springy coupler on one face
   (the plug face: the bottom when stacked, the side when plugged into a side hole); every other face can have a socket.
   Bodies (body: true) give health and shield; you need two (a bottom and a top) to launch. Bricks just add sockets.
   size: [width, height, depth]. faces: 'all' (every free face) or 'out' (only the face opposite the plug).
   color: block colour. neck: coupler length. */
const BLOCKS = {
  body: {
    name: 'Frame Body', body: true, mass: 1.0, hp: 50, shield: 10, speed: 0, size: [1.1, 1.1, 1.1], faces: 'all', color: 0x4b5661, neck: 0.32,
    desc: 'A cube with a socket on every face. Stack one on another for a waist and chest.',
  },
  // ---- BUILD V2 upper halves: one sits on the lower half. 'arm' sockets (sphere) take arms, 'module' sockets (cube) take modules.
  upper_scout: {
    name: 'Scout Torso', body: true, upper: true, mass: 0.7, hp: 30, shield: 15, speed: 0.3, size: [1.1, 0.95, 0.95], faces: 'none', color: 0x4b5661, neck: 0.28,
    sockets: [{ face: 'right', at: [0, 0.08], accepts: 'arm' }, { face: 'left', at: [0, 0.08], accepts: 'arm' }, { face: 'top', at: [0, 0], accepts: 'module' }],
    desc: 'Light and quick. Two arms and one module on top.',
  },
  upper_brawler: {
    name: 'Brawler Torso', body: true, upper: true, mass: 1.1, hp: 50, shield: 10, speed: 0, size: [1.25, 1.2, 1.05], faces: 'none', color: 0x4b5661, neck: 0.28,
    sockets: [{ face: 'right', at: [-0.24, 0.26], accepts: 'arm' }, { face: 'right', at: [0.24, -0.26], accepts: 'arm' }, { face: 'left', at: [0.24, 0.26], accepts: 'arm' }, { face: 'left', at: [-0.24, -0.26], accepts: 'arm' }],
    desc: 'Built to fight: four arm sockets, two on each side, but no room for modules.',
  },
  upper_carrier: {
    name: 'Carrier Torso', body: true, upper: true, mass: 1.0, hp: 40, shield: 20, speed: 0, size: [1.2, 1.05, 1.05], faces: 'none', color: 0x4b5661, neck: 0.28,
    sockets: [{ face: 'right', at: [0, 0.1], accepts: 'arm' }, { face: 'left', at: [0, 0.1], accepts: 'arm' }, { face: 'top', at: [0, 0], accepts: 'module' }, { face: 'back', at: [0, 0.1], accepts: 'module' }, { face: 'front', at: [0, 0.25], accepts: 'module' }],
    desc: 'A utility frame: two arms and three module sockets (top, back and chest).',
  },
  pack: {
    name: 'Backpack', mass: 0.45, size: [0.95, 1.0, 0.5], faces: 'out', color: 0x5a5244, neck: 0.1, upgradable: true, pack: true,
    slots: lvl => 2 + (lvl >= 30 ? 1 : 0) + (lvl >= 60 ? 1 : 0),
    desc: 'A cargo pack for your back. Adds storage slots and has a socket on its back for one more part.',
    // straps, pouches and a lid on the faces around the socket
    decor(grp, w, h, d, outAxis) {
      const pouch = 0x4a4337, strap = 0x2a2620;
      if (outAxis !== 'y') {
        grp.add(bx(w * 1.02, h * 0.18, d * 1.06, ORANGE, 0, h * 0.42, 0));                       // lid
        grp.add(bx(w * 0.12, h * 1.04, d * 1.04, strap, -w * 0.3, 0, 0)); grp.add(bx(w * 0.12, h * 1.04, d * 1.04, strap, w * 0.3, 0, 0));
      }
      if (outAxis === 'z') { grp.add(bx(0.16, h * 0.55, d * 0.7, pouch, -w / 2 - 0.06, -h * 0.1, 0)); grp.add(bx(0.16, h * 0.55, d * 0.7, pouch, w / 2 + 0.06, -h * 0.1, 0)); }
      else if (outAxis === 'x') { grp.add(bx(w * 0.7, h * 0.55, 0.16, pouch, 0, -h * 0.1, -d / 2 - 0.06)); grp.add(bx(w * 0.7, h * 0.55, 0.16, pouch, 0, -h * 0.1, d / 2 + 0.06)); }
    },
  },
};

/* ---------- Part models ----------
   Any part except a block can plug into any block hole; weapons can also plug into an arm's wrist.
   model(g, { lvl, out }) builds the part with its ball joint at the origin.
   out: direction pointing away from the socket the part is plugged into (x = sideways, y = up, z = forward).
   Helpers: joint(g, [x,y,z], radius, color), strut(g, from, to, thickness, color),
            socketBlock(g, size, [x,y,z]) -> a holed block that another part can plug into (arms use it for the weapon),
            bx(w,h,d,color,x,y,z). Colours: COL.chassis, COL.dark, COL.joint, COL.bone, COL.cyan, ORANGE. */

/* ---------- Legs ----------
   speed: run contribution (two legs average to the run speed), jump: metres, air: extra mid-air jumps.
   rolling: true for treads (no stepping animation). The foot should end 1.35 below the ball. */
const LEGS = {
  basic: {
    name: 'Frame Leg', speed: 4.6, jump: 3.6, carry: 2.2, mass: 0.4, desc: 'Reliable. Clears any ledge the arena needs.',
    // Articulated: return { ik } and the game plants the foot on the ground and bends the knee to reach it.
    model(g, { lvl, out }) {
      const t = 0.15 + 0.06 * lvlCurve(sLv(lvl)), a = 0.72, b = 0.72;
      joint(g, [0, 0, 0], 0.17, JOINT_COL);
      const thigh = new THREE.Group(); g.add(thigh);
      thigh.add(bx(t, a, t, 0x6b7680, 0, -a / 2, 0));
      joint(thigh, [0, -a, 0], 0.15, JOINT_COL);
      const shin = new THREE.Group(); g.add(shin);
      shin.add(bx(t, b, t, 0x6b7680, 0, -b / 2, 0));
      joint(shin, [0, -b, 0], 0.11, JOINT_COL);
      const foot = new THREE.Group(); g.add(foot);
      const sole = new THREE.Mesh(ballGeo, M(COL.dark)); sole.scale.set(0.22, 0.08, 0.34); sole.position.set(0, 0, 0.08); foot.add(sole);
      return { ik: { thigh, shin, foot, a, b, footH: 0.08, rest: [out.x * 0.2, -1.27, 0.04] } };
    },
  },
  spider: {
    name: 'Spider Leg', speed: 4.8, jump: 3.0, carry: 2.6, mass: 0.45, climb: 2.4,
    desc: 'Long, jointed and arched. Steps straight up ledges over twice as tall as other legs can.',
    model(g, { lvl, out }) {
      const t = 0.1 + 0.04 * lvlCurve(sLv(lvl)), a = 0.9, b = 1.0, side = Math.sign(out.x) || 1;
      joint(g, [0, 0, 0], 0.15, JOINT_COL);
      const thigh = new THREE.Group(); g.add(thigh);
      thigh.add(bx(t, a, t, 0x2e363e, 0, -a / 2, 0));
      thigh.add(bx(t * 0.6, a * 0.7, t * 1.6, ORANGE, 0, -a / 2, 0));                    // a stripe of colour down the thigh
      joint(thigh, [0, -a, 0], 0.12, JOINT_COL);
      const shin = new THREE.Group(); g.add(shin);
      shin.add(bx(t * 0.8, b, t * 0.8, 0x2e363e, 0, -b / 2, 0));
      const foot = new THREE.Group(); g.add(foot);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), M(COL.dark)); tip.rotation.x = Math.PI; tip.position.y = 0.04; foot.add(tip);
      // knee arches up and out, like a spider's: always away from the body along the socket it's on,
      // so side, front and back legs all splay the same way
      let ox = out.x, oz = out.z; const ol = Math.hypot(ox, oz);
      if (ol < 0.3) { ox = side; oz = 0; } else { ox /= ol; oz /= ol; }
      return { ik: { thigh, shin, foot, a, b, footH: 0.06, rest: [ox * 0.75, -1.25, oz * 0.75], hint: [ox * 0.8, 1, oz * 0.8] } };
    },
  },
  wheel: {
    name: 'Wheel', speed: 8.4, jump: 1.7, carry: 2.4, mass: 0.5, rolling: true, grip: 0.55,
    desc: 'One big sprung wheel. The fastest legs there are, but it slides around and barely jumps.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.16, JOINT_COL);
      const x = out.x * 0.32, side = Math.sign(out.x) || 1;
      strut(g, [0, 0, 0], [x, -0.08, 0], 0.15, COL.dark);
      g.add(bx(0.22, 0.24, 0.22, 0x3a4048, x, -0.2, 0));
      g.add(bx(0.28, 0.05, 0.28, COL.dark, x, -0.34, 0));
      const rod = bx(0.07, 1, 0.07, 0xb9c2c9, x, 0, 0); g.add(rod);
      const coil = new THREE.Group(); coil.position.x = x; g.add(coil);
      for (let k = 0; k <= 7; k++) coil.add(bx(0.24, 0.035, 0.24, k % 2 ? ORANGE : 0xb85614, 0, k / 7, 0));
      const hub = new THREE.Group(); hub.position.set(x, -1.0, 0); g.add(hub);
      hub.add(bx(0.28, 0.05, 0.28, COL.dark, 0, 0.44, 0));
      hub.add(bx(0.08, 0.5, 0.12, COL.dark, side * 0.05, 0.2, 0));                         // fork
      const spin = new THREE.Group(); spin.position.set(side * 0.16, 0, 0); hub.add(spin);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 18), M(0x22272c)); tyre.rotation.z = Math.PI / 2; spin.add(tyre);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 12), M(0x8c96a0)); rim.rotation.z = Math.PI / 2; spin.add(rim);
      for (let k = 0; k < 3; k++) { const sp = bx(0.26, 0.05, 0.4, ORANGE, 0, 0, 0); sp.rotation.x = k * Math.PI / 3; spin.add(sp); }
      const shock = { hub, rod, coil, topY: -0.36, restY: -1.0, seat: 0.44, off: 0, vel: 0, spin: 0, wheel: spin, wheelR: 0.36 };
      setShock(shock, 0);
      return { shock };
    },
  },
  tread: {
    name: 'Tread', speed: 6.2, jump: 2.4, carry: 3.4, mass: 0.8, rolling: true, desc: 'Fast on the flat, with a lower jump. Sprung on a shock absorber.',
    // returns { shock }: the game moves the tread up and down on its spring over bumps and landings
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.17, JOINT_COL);
      const x = out.x * 0.35, side = Math.sign(out.x) || 1;
      strut(g, [0, 0, 0], [x, -0.08, 0], 0.16, COL.dark);
      g.add(bx(0.24, 0.26, 0.24, 0x3a4048, x, -0.2, 0));                     // shock body
      g.add(bx(0.3, 0.05, 0.3, COL.dark, x, -0.34, 0));                      // spring seat
      const rod = bx(0.07, 1, 0.07, 0xb9c2c9, x, 0, 0); g.add(rod);         // piston rod (stretched each frame)
      const coil = new THREE.Group(); coil.position.x = x; g.add(coil);       // spring (squashed each frame)
      for (let k = 0; k <= 7; k++) coil.add(bx(0.26, 0.035, 0.26, k % 2 ? ORANGE : 0xb85614, 0, k / 7, 0));
      const hub = new THREE.Group(); hub.position.set(x, -1.0, 0); g.add(hub);
      hub.add(bx(0.3, 0.05, 0.3, COL.dark, 0, 0.44, 0));                    // lower spring seat
      const belt = new THREE.Shape();
      belt.moveTo(-0.55, -0.32); belt.lineTo(0.55, -0.32); belt.lineTo(0.08, 0.42); belt.lineTo(-0.08, 0.42); belt.lineTo(-0.55, -0.32);
      const bg = new THREE.ExtrudeGeometry(belt, { depth: 0.34, bevelEnabled: false }); bg.translate(0, 0, -0.17); bg.rotateY(Math.PI / 2);
      hub.add(new THREE.Mesh(bg, M(0x2a3036)));
      for (const [zz, yy] of [[-0.38, -0.2], [0.38, -0.2], [0, 0.24]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), M(0x6b7680)); wh.rotation.z = Math.PI / 2;
        wh.position.set(side * 0.2, yy, zz); hub.add(wh);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), M(ORANGE)); cap.rotation.z = Math.PI / 2;
        cap.position.set(side * 0.22, yy, zz); hub.add(cap);
      }
      const shock = { hub, rod, coil, topY: -0.36, restY: -1.0, seat: 0.44, off: 0, vel: 0, spin: 0 };
      setShock(shock, 0);
      return { shock };
    },
  },
};

/* ---------- Arms (upper mounts) ----------
   dmg / rate multiply the mounted weapon. auto: true makes the arm aim and fire on its own (range multiplies weapon range).
   turn: how fast the arm swings to a target (radians per second). Each Mk above I adds rateUp to fire rate and turnUp to turn speed.
   The Sentry Arm starts sluggish (slow to turn, slow to fire) and gets much better with each Mk.
   Rotating a mounted auto arm (click it) points it in a different direction; it only engages enemies on that side.
   The model must return { weaponAnchor } from socketBlock(...) so a weapon can plug in. Point the forearm along +z. */
const ARMS = {
  sentry: {
    name: 'Sentry Arm', mass: 0.35, dmg: 1, rate: 0.42, auto: true, range: 1, turn: 3.4, rateUp: 0.22, turnUp: 0.7, desc: 'Aims and fires its weapon at the closest enemy on its own. Slower fire rate.',
    model(g, { out }) {
      // a curling, segmented arm that ends in a weapon socket
      joint(g, [0, 0, 0], 0.17, 0x4f8a8b);
      const pts = [];
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        pts.push([out.x * 0.5 * Math.sin(t * 2.2) + out.x * 0.1, 0.28 * Math.sin(t * Math.PI) - 0.1 * t + out.y * 0.4 * t, 0.62 * t * t]);
      }
      let prev = [0, 0, 0];
      pts.forEach((p, k) => { strut(g, prev, p, 0.12, k % 2 ? 0x3d6a6b : COL.dark); joint(g, p, 0.085, k % 2 ? COL.dark : 0x3d6a6b); prev = p; });
      g.add(bx(0.16, 0.1, 0.16, COL.cyan, prev[0], prev[1] + 0.19, prev[2] - 0.05, 0x1b6a70));   // targeting eye
      const top = (p, dy) => [p[0], p[1] + dy, p[2]];
      return { weaponAnchor: socketBlock(g, 0.28, [prev[0], prev[1], prev[2] + 0.12]), gemAt: [top(pts[2], 0.1), top(pts[3], 0.1)] };
    },
  },
  double: {
    name: 'Twin Arm', mass: 0.5, dmg: 1, rate: 0.7, auto: false, turn: 14, rateUp: 0.15, turnUp: 0.2, wrists: 2,
    desc: 'Manual aim. Holds two weapons and fires them in turn, back and forth. Slower than the Frame Arm.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.18, JOINT_COL);
      const elbow = [out.x * 0.42, out.y * 0.42 - 0.2, out.z * 0.42];
      strut(g, [0, 0, 0], elbow, 0.15, COL.chassis);
      joint(g, elbow, 0.15, JOINT_COL);
      const fork = [elbow[0], elbow[1] - 0.04, elbow[2] + 0.42];
      strut(g, elbow, fork, 0.16, COL.chassis);
      g.add(bx(0.62, 0.12, 0.14, COL.dark, fork[0], fork[1], fork[2]));        // the yoke
      const a1 = [fork[0] - 0.24, fork[1], fork[2] + 0.12], a2 = [fork[0] + 0.24, fork[1], fork[2] + 0.12];
      joint(g, a1, 0.1, JOINT_COL); joint(g, a2, 0.1, JOINT_COL);
      const fa = t => [lerp(elbow[0], fork[0], t), lerp(elbow[1], fork[1], t) + 0.11, lerp(elbow[2], fork[2], t)];
      return { weaponAnchor: socketBlock(g, 0.24, [a1[0], a1[1], a1[2] + 0.1]), weaponAnchor2: socketBlock(g, 0.24, [a2[0], a2[1], a2[2] + 0.1]), gemAt: [fa(0.3), fa(0.7)] };
    },
  },
  basic: {
    name: 'Frame Arm', mass: 0.3, dmg: 1, rate: 1, auto: false, turn: 22, rateUp: 0.15, turnUp: 0.2, desc: 'Manual aim. Standard mount.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.17, JOINT_COL);
      const elbow = [out.x * 0.42, out.y * 0.42 - 0.22, out.z * 0.42];
      strut(g, [0, 0, 0], elbow, 0.13, COL.chassis);
      joint(g, elbow, 0.14, JOINT_COL);
      const wrist = [elbow[0], elbow[1] - 0.05, elbow[2] + 0.55];
      strut(g, elbow, wrist, 0.14, COL.chassis);
      joint(g, wrist, 0.12, JOINT_COL);
      // the gem slots ride along the top of the forearm
      const fa = t => [lerp(elbow[0], wrist[0], t), lerp(elbow[1], wrist[1], t) + 0.1, lerp(elbow[2], wrist[2], t)];
      return { weaponAnchor: socketBlock(g, 0.28, [wrist[0], wrist[1], wrist[2] + 0.1]), gemAt: [fa(0.32), fa(0.68)] };
    },
  },
};

/* ---------- Weapons ----------
   Plug into an arm's wrist (aimed by the arm) or straight into a chest socket (fixed forward, fires on its own).
   range: auto-fire range. model(g, { lvl, out }) with the ball at the origin, barrel along +z; return { muzzle: [x,y,z] }.
   info(lvl): rows of [label, value] for the workbench hover window.
   upgrade(lvl): short text shown when two of the same weapon are combined into Mk lvl. sound: 'pistol' | 'shotgun' | 'autogun'.
   Click a weapon mounted straight on a block to rotate it 90° and change which way it fires.
   fire(c): called when ready. c = { w, lv, m, o, tp, te, manual }
     w: the weapon item (set w.cd to the cooldown), lv: its Mk, m: arm modifiers {dmg, rate},
     o: muzzle position, tp: target point, te: target enemy or null, manual: player-aimed.
   Helpers: bullet(o, tp, speed, dmg, {spread, pierce, life, kind:'rocket', explode, target, manual, knock}),
     knock = how hard each hit shoves the enemy (default 1.5). explode = blast radius; blasts throw survivors.
     explode(point, radius, dmg), lightning([points]), damage(enemy, amount, manual). */
const WEAPONS = {
  shotgun: {
    name: 'Shotgun', range: 20, sound: 'shotgun', mass: 0.45, push: 2.6, kick: 2.4, casing: 'shell',
    mag: lvl => 2 + Math.floor(lvl / 40), reload: lvl => 1.35 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 8 * (1 + 0.1 * (lvl - 1)), pellets: lvl => 6 + Math.min(10, Math.floor((lvl - 1) / 8)), cd: lvl => 0.9 / (1 + 0.6 * lvlCurve(lvl, 30)),
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(1)} × ${this.pellets(lvl)} pellets`], ['Fire rate', `${(1 / this.cd(lvl)).toFixed(1)} /s`], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Push', 'strong'], ['Range', 'short']]; },
    desc: 'A tight burst of pellets. Brutal up close, weak at range.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.26, 0.2, 0.56, 0x3a3128, o[0], o[1] + 0.02, 0.32));
      g.add(bx(0.11, 0.11, 0.2, COL.dark, o[0] - 0.06, o[1] + 0.06, 0.66));
      g.add(bx(0.11, 0.11, 0.2, COL.dark, o[0] + 0.06, o[1] + 0.06, 0.66));
      g.add(bx(0.1, 0.22, 0.12, 0x3a3128, o[0], o[1] - 0.16, 0.16));
      g.add(bx(0.27, 0.05, 0.14, ORANGE, o[0], o[1] + 0.13, 0.42));                 // accent band (takes the rarity colour)
      return { muzzle: [o[0], o[1] + 0.06, 0.78] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = this.cd(lv) / m.rate;
      const dmg = this.dmg(lv) * m.dmg;
      for (let s = 0; s < this.pellets(lv); s++) bullet(o, tp, 75, dmg, { spread: 0.085, life: 0.3, manual, knock: this.push });
    },
  },
  autogun: {
    name: 'Autogun', range: 40, sound: 'autogun', mass: 0.4, push: 0, kick: 0.45, casing: 'brass',
    mag: lvl => 30 + 5 * Math.floor(lvl / 20), reload: lvl => 1.9 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 5.5 * (1 + 0.1 * (lvl - 1)), rounds: lvl => lvl >= 50 ? 3 : lvl >= 10 ? 2 : 1, pierce: lvl => lvl >= 70 ? 3 : lvl >= 25 ? 1 : 0,
    info(lvl) { const p = this.pierce(lvl); return [['Damage', this.dmg(lvl).toFixed(1)], ['Fire rate', '11 /s'], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Rounds per shot', this.rounds(lvl)], ['Pierce', p ? `${p} enem${p > 1 ? 'ies' : 'y'}` : 'none'], ['Push', 'none'], ['Range', '40 m']]; },
    desc: 'Fully automatic. Hold fire for a steady stream of light rounds. Twin rounds at Lv 10, pierce at Lv 25.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.18, 0.2, 0.5, COL.dark, o[0], o[1] + 0.02, 0.28));
      g.add(bx(0.07, 0.07, 0.3, COL.joint, o[0], o[1] + 0.04, 0.66));
      g.add(bx(0.1, 0.26, 0.1, COL.dark, o[0], o[1] - 0.18, 0.3));             // magazine
      g.add(bx(0.2, 0.05, 0.06, ORANGE, o[0], o[1] + 0.13, 0.2));
      return { muzzle: [o[0], o[1] + 0.04, 0.82] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = 0.09 / m.rate;
      for (let s = 0; s < this.rounds(lv); s++) bullet(o, tp, 100, this.dmg(lv) * m.dmg, { spread: s ? 0.04 : 0.022, life: 0.6, pierce: this.pierce(lv), manual, knock: this.push });
    },
  },
  pistol: {
    name: 'Pistol', range: 45, sound: 'pistol', mass: 0.2, push: 0.5, kick: 1.1, casing: 'brass',
    mag: lvl => 5 + Math.floor(lvl / 15), reload: lvl => 1.0 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 14 * (1 + 0.12 * (lvl - 1)), rounds: lvl => lvl >= 40 ? 3 : lvl >= 10 ? 2 : 1, pierce: lvl => lvl >= 60 ? 4 : lvl >= 25 ? 2 : 0, cd: lvl => 0.3 / (1 + 0.5 * lvlCurve(lvl, 30)),
    info(lvl) { const p = this.pierce(lvl); return [['Damage', this.dmg(lvl).toFixed(1)], ['Fire rate', `${(1 / this.cd(lvl)).toFixed(1)} /s`], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Rounds per shot', this.rounds(lvl)], ['Pierce', p ? `${p} enemies` : 'none'], ['Push', 'light'], ['Range', '45 m']]; },
    desc: 'Fast single rounds. Fires pairs at Lv 10, pierces at Lv 25.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      // on a chest socket, stand the gun off the surface a little
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.15, 0.17, 0.5, COL.dark, o[0], o[1] + 0.02, 0.3));
      g.add(bx(0.09, 0.2, 0.12, COL.dark, o[0], o[1] - 0.14, 0.14));
      g.add(bx(0.05, 0.05, 0.08, ORANGE, o[0], o[1] + 0.13, 0.48));
      return { muzzle: [o[0], o[1] + 0.02, 0.6] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = this.cd(lv) / m.rate;
      const dmg = this.dmg(lv) * m.dmg;
      for (let s = 0; s < this.rounds(lv); s++) bullet(o, tp, 95, dmg, { pierce: this.pierce(lv), spread: s ? 0.03 : 0.022, life: 0.8, manual, knock: this.push });
    },
  },
  lightning: {
    name: 'Arc Caster', range: 32, sound: 'zap', mass: 0.4, push: 0, kick: 0.6,
    mag: lvl => 6 + Math.floor(lvl / 25), reload: lvl => 1.5 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 16 * (1 + 0.1 * (lvl - 1)), bounces: lvl => Math.min(9, 2 + Math.floor((lvl - 1) / 12)), cd: lvl => 0.5 / (1 + 0.4 * lvlCurve(lvl, 30)),
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(1)} (−15% per jump)`], ['Bounces', this.bounces(lvl)], ['Fire rate', `${(1 / this.cd(lvl)).toFixed(1)} /s`], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Range', '32 m']]; },
    desc: 'Throws a bolt of lightning that jumps from enemy to enemy. More jumps as it levels up.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.2, 0.2, 0.42, 0x2e3a44, o[0], o[1] + 0.02, 0.26));
      for (let k = 0; k < 3; k++) g.add(bx(0.26, 0.26, 0.04, COL.cyan, o[0], o[1] + 0.02, 0.38 + k * 0.1, 0x1b6a70));   // coils
      g.add(bx(0.06, 0.06, 0.2, COL.joint, o[0], o[1] + 0.02, 0.66));
      return { muzzle: [o[0], o[1] + 0.02, 0.78] };
    },
    fire({ w, lv, m, o, tp, te, manual }) {
      w.cd = this.cd(lv) / m.rate;
      // first target: the enemy under the crosshair, or the closest one near the line of fire
      let t = te && !te.dead ? te : null;
      if (!t) { const d = tp.clone().sub(o).normalize(); let best = 2.2 * 2.2; for (const e of enemies) { if (e.dead || e.d.npc) continue; const c = aimPt(e), v = c.clone().sub(o), along = v.dot(d); if (along < 0 || along > this.range) continue; const off = v.lengthSq() - along * along; if (off < best) { best = off; t = e; } } }
      const pts = [o.clone()], power = 0.5 + 0.9 * lvlCurve(sLv(lv), 35);      // bigger, more spectacular bolts as it levels
      arcMuzzle(o, tp.clone().sub(o).normalize(), power);
      if (!t) { pts.push(tp.clone()); lightning(pts, power); return; }
      let dmg = this.dmg(lv) * m.dmg; const hit = new Set();
      for (let j = 0; t && j <= this.bounces(lv); j++) {
        hit.add(t); const c = aimPt(t); pts.push(c);
        damage(t, dmg, manual); spark(c, COL.cyan); if (CUR_ATTRS.has('fire')) ignite(t, dmg * (0.7 + 0.3 * CUR_ATTRS.get('fire'))); if (CUR_ATTRS.has('ice')) chill(t, CUR_ATTRS.get('ice'));
        dmg *= 0.85; t = nearestEnemy(c, 9 * CUR_RANGE, hit);
      }
      lightning(pts, power);
    },
  },
  rocket: {
    name: 'Rocket Launcher', range: 50, sound: 'rocket', mass: 0.8, push: 0, kick: 3.2, lootWeight: 0.15,
    mag: lvl => 1 + Math.floor(lvl / 35), reload: lvl => 2.4 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 95 * (1 + 0.12 * (lvl - 1)), radius: lvl => 4.2 + 2 * lvlCurve(lvl, 40),
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(0)} (blast)`], ['Blast radius', `${this.radius(lvl).toFixed(1)} m`], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Self damage', 'yes, inside the blast']]; },
    desc: 'Extra rare. Fires a rocket that explodes on impact, throwing everything near it. The blast hurts you too if you are inside it.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.13, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.24, out.y * 0.24, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.3, 0.3, 0.95, 0x4a5a3a, o[0], o[1] + 0.06, 0.3));
      g.add(bx(0.34, 0.34, 0.08, COL.dark, o[0], o[1] + 0.06, 0.78));
      g.add(bx(0.34, 0.34, 0.08, COL.dark, o[0], o[1] + 0.06, -0.16));
      g.add(bx(0.1, 0.22, 0.12, COL.dark, o[0], o[1] - 0.18, 0.2));
      g.add(bx(0.06, 0.1, 0.22, COL.red, o[0] + 0.18, o[1] + 0.18, 0.4, 0x601020));
      return { muzzle: [o[0], o[1] + 0.06, 0.84] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = 0.25;
      bullet(o, tp, 40, this.dmg(lv) * m.dmg, { kind: 'rocket', explode: this.radius(lv), life: 3, spread: 0.018, manual, selfHurt: true, knock: 0 });
    },
  },
  flamer: {
    name: 'Flamethrower', range: 9, sound: 'flame', mass: 0.5, push: 0, kick: 0.15,
    mag: lvl => 70 + Math.floor(lvl / 10) * 5, reload: lvl => 1.8 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 3.2 * (1 + 0.1 * (lvl - 1)), reach: lvl => 8 + 4 * lvlCurve(lvl, 40),
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(1)} per lick + burning`], ['Reach', `${this.reach(lvl).toFixed(0)} m`], ['Fuel', this.mag(lvl)], ['Refuel', `${this.reload(lvl).toFixed(2)} s`], ['Passes through', 'everything in the cone']]; },
    desc: 'A short roaring cone of fire. Hits everything in it and sets it burning.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 10), M(0xb8322c)); tank.rotation.x = Math.PI / 2; tank.position.set(o[0], o[1] - 0.12, 0.2); g.add(tank);
      g.add(bx(0.16, 0.16, 0.56, COL.dark, o[0], o[1] + 0.06, 0.34));
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.16, 8), M(0x8c96a0)); noz.rotation.x = Math.PI / 2; noz.position.set(o[0], o[1] + 0.06, 0.68); g.add(noz);
      const pilot = new THREE.Mesh(geoBox, B(0x58a8ff)); pilot.scale.setScalar(0.05); pilot.position.set(o[0], o[1] - 0.02, 0.74); g.add(pilot);
      return { muzzle: [o[0], o[1] + 0.06, 0.78] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = 0.05 / m.rate;
      for (let s = 0; s < 2; s++) flame(o, tp, this.dmg(lv) * m.dmg, this.reach(lv) * CUR_RANGE, manual);
    },
  },
  sniper: {
    name: 'Sniper Rifle', range: 120, sound: 'sniper', mass: 0.6, push: 5, kick: 3.6, casing: 'brass',
    mag: lvl => 4 + Math.floor(lvl / 30), reload: lvl => 2.1 / (1 + 0.5 * lvlCurve(lvl, 30)),
    dmg: lvl => 80 * (1 + 0.12 * (lvl - 1)), pierce: lvl => 2 + Math.floor(lvl / 25), cd: lvl => 1.25 / (1 + 0.4 * lvlCurve(lvl, 30)),
    info(lvl) { return [['Damage', this.dmg(lvl).toFixed(0)], ['Fire rate', `${(1 / this.cd(lvl)).toFixed(2)} /s`], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(2)} s`], ['Pierce', `${this.pierce(lvl)} enemies`], ['Push', 'heavy'], ['Range', '120 m']]; },
    desc: 'One slow, enormous round that punches through a line of enemies. Long range, heavy kick.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.14, 0.18, 0.7, 0x3a4436, o[0], o[1] + 0.02, 0.3));
      g.add(bx(0.06, 0.06, 0.62, COL.joint, o[0], o[1] + 0.04, 0.95));             // long barrel
      g.add(bx(0.12, 0.1, 0.06, COL.dark, o[0], o[1] + 0.04, 1.26));                // muzzle brake
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8), M(COL.dark)); scope.rotation.x = Math.PI / 2; scope.position.set(o[0], o[1] + 0.17, 0.32); g.add(scope);
      g.add(bx(0.04, 0.04, 0.02, 0x58cfd6, o[0], o[1] + 0.17, 0.5, 0x1b6a70));
      return { muzzle: [o[0], o[1] + 0.04, 1.3] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = this.cd(lv) / m.rate;
      bullet(o, tp, 260, this.dmg(lv) * m.dmg, { pierce: this.pierce(lv), life: 0.6, manual, knock: this.push, tracer: true });
    },
  },
  gatling: {
    name: 'Gatling Gun', range: 40, sound: 'autogun', mass: 0.9, push: 0.2, kick: 0.35, casing: 'brass', lootWeight: 0.5,
    mag: lvl => 120 + 20 * Math.floor(lvl / 15), reload: lvl => 6 / (1 + 0.4 * lvlCurve(lvl, 30)),
    dmg: lvl => 4.2 * (1 + 0.1 * (lvl - 1)),
    info(lvl) { return [['Damage', this.dmg(lvl).toFixed(1)], ['Fire rate', '20 /s'], ['Magazine', this.mag(lvl)], ['Reload', `${this.reload(lvl).toFixed(1)} s`], ['Push', 'light'], ['Range', '40 m']]; },
    desc: 'Six spinning barrels. A huge belt of rounds at a blistering rate, then a very long reload.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.13, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.24, 0.24, 0.36, COL.dark, o[0], o[1] + 0.02, 0.24));                // motor housing
      g.add(bx(0.2, 0.2, 0.2, 0x3a3128, o[0] + 0.16, o[1] - 0.08, 0.22));           // ammo drum
      g.add(bx(0.26, 0.05, 0.1, ORANGE, o[0], o[1] + 0.16, 0.2));
      // the barrel cluster spins about the firing axis (its local y is pointed down the barrels)
      const spin = new THREE.Group(); spin.position.set(o[0], o[1] + 0.02, 0.62); spin.rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; spin.add(bx(0.045, 0.52, 0.045, COL.joint, Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075)); }
      spin.add(bx(0.2, 0.04, 0.2, COL.dark, 0, 0.2, 0)); spin.add(bx(0.2, 0.04, 0.2, COL.dark, 0, -0.18, 0));
      const wrap = new THREE.Group(); wrap.add(spin); g.add(wrap);
      return { muzzle: [o[0], o[1] + 0.02, 0.9], spin };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = 0.05 / m.rate;
      bullet(o, tp, 100, this.dmg(lv) * m.dmg, { spread: 0.05, life: 0.6, manual, knock: this.push });
    },
  },
  katana: {
    name: 'Katana', range: 3, mass: 0.25, melee: true, kick: 0, lootWeight: 0.6,
    dmg: lvl => 30 * (1 + 0.12 * (lvl - 1)),
    arc: lvl => Math.min(180, 90 + 90 * (lvl - 1) / 59),           // degrees: 90 at Lv 1, 180 by Lv 60
    reach: lvl => 2.6 + 0.6 * lvlCurve(lvl, 30),
    info(lvl) { return [['Damage', this.dmg(lvl).toFixed(0)], ['Swing arc', `${Math.round(this.arc(lvl))}°`], ['Reach', `${this.reach(lvl).toFixed(1)} m`], ['Arc grows', 'to 180° at Lv 60']]; },
    desc: 'Melee. Every swing cuts everything in a wide arc in front of the arm: 90° to start, widening to 180° as it levels.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.11, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.2, out.y * 0.2, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.09, COL.dark);
      g.add(bx(0.09, 0.1, 0.34, 0x1c1a20, o[0], o[1], 0.2));                // wrapped grip
      for (let k = 0; k < 3; k++) g.add(bx(0.1, 0.11, 0.03, 0xd8d4c8, o[0], o[1], 0.08 + k * 0.1));
      g.add(bx(0.2, 0.04, 0.2, ORANGE, o[0], o[1], 0.38));                  // round-ish guard (rarity colour)
      // a long, slightly curved single-edged blade: three segments bending up
      const bm = M(0xe4ebef);
      let z = 0.42, y = 0; for (let k = 0; k < 3; k++) { const seg = bx(0.03, 0.08, 0.42, 0xe4ebef, o[0], o[1] + y, z + 0.21); seg.rotation.x = -0.05 * k; g.add(seg); z += 0.41; y += 0.025 * (k + 1); }
      void bm;
      return { muzzle: [o[0], o[1] + y, z + 0.05], base: [o[0], o[1], 0.44] };
    },
  },
  chainsaw: {
    name: 'Chainsaw', range: 3, mass: 0.7, saw: true, kick: 0, lootWeight: 0.6,
    dmg: lvl => 7 * (1 + 0.1 * (lvl - 1)),                          // per cut; it cuts each enemy about 8 times a second
    reach: lvl => 1.4 + 2.6 * Math.min(1, (lvl - 1) / 59),          // bar length in metres
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(1)} × 8 /s`], ['Bar length', `${this.reach(lvl).toFixed(1)} m`], ['Grows', 'longer every level']]; },
    desc: 'Melee. Rev it and everything along the bar in front of it gets shredded. The bar grows longer as it levels.',
    model(g, { out, lvl }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      const L = WEAPONS.chainsaw.reach(lvl || 1);
      const rig = new THREE.Group(); rig.position.set(o[0], o[1], 0); g.add(rig);
      rig.add(bx(0.26, 0.24, 0.34, 0xc0562a, 0, 0.02, 0.2));               // engine block
      rig.add(bx(0.1, 0.06, 0.2, COL.dark, 0, 0.18, 0.16));                 // top handle
      rig.add(bx(0.06, 0.12, 0.06, 0x3a3128, 0.1, 0.12, 0.06));             // exhaust stub
      rig.add(bx(0.27, 0.05, 0.12, ORANGE, 0, -0.08, 0.2));
      rig.add(bx(0.05, 0.14, L, 0xb8bec4, 0, 0.0, 0.38 + L / 2));          // the bar
      for (let k = 0; k < Math.round(L * 7); k++) rig.add(bx(0.07, 0.03, 0.06, COL.dark, 0, (k % 2 ? 0.085 : -0.085), 0.42 + k / 7));   // chain teeth
      return { muzzle: [o[0], o[1], 0.38 + L], base: [o[0], o[1], 0.4], saw: rig, exhaust: [o[0] + 0.1, o[1] + 0.2, 0.06] };
    },
  },
  knife: {
    name: 'Knife', range: 2.5, mass: 0.15, melee: true, kick: 0,
    dmg: lvl => 22 * (1 + 0.12 * (lvl - 1)),
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(0)} at 10 m/s`], ['Scales with', 'blade speed'], ['In an arm', 'swings (fire / auto)'], ['On a block', 'cuts as the frame moves'], ['Hit rate', 'once per enemy per 0.3 s']]; },
    desc: 'Melee. Damage depends on how fast the blade is moving: an arm swings it, a block carries it, a Spin Gear whirls it.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.11, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.2, out.y * 0.2, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.09, COL.dark);
      g.add(bx(0.1, 0.12, 0.3, 0x3a3128, o[0], o[1], 0.18));                 // grip
      g.add(bx(0.28, 0.06, 0.06, ORANGE, o[0], o[1], 0.34));                 // guard (takes the rarity colour)
      const blade = new THREE.Shape(); blade.moveTo(0, -0.07); blade.lineTo(0.6, -0.05); blade.lineTo(0.78, 0.04); blade.lineTo(0, 0.07); blade.lineTo(0, -0.07);
      const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.025, bevelEnabled: false }); bg.translate(0, 0, -0.0125); bg.rotateY(-Math.PI / 2);
      const bm = new THREE.Mesh(bg, M(0xd6dde2)); bm.position.set(o[0], o[1], 0.36); g.add(bm);
      return { muzzle: [o[0], o[1], 1.12], base: [o[0], o[1], 0.4] };
    },
  },
  gravity: {
    name: 'Gravity Gun', range: 30, sound: 'zap', mass: 0.7, push: 0, kick: 1.6, lootWeight: 0.6,
    dmg: lvl => 18 * (1 + 0.1 * (lvl - 1)), pull: lvl => 22 * (1 + 1.6 * lvlCurve(lvl, 35)), radius: lvl => 3.5 + 1.5 * lvlCurve(lvl, 40),
    cd: lvl => 2.8 / (1 + 0.35 * lvlCurve(lvl, 30)),
    info(lvl) { return [['Pull', `${this.pull(lvl).toFixed(0)} (grows with level)`], ['Radius', `${this.radius(lvl).toFixed(1)} m`], ['Collapse damage', this.dmg(lvl).toFixed(0)], ['Fire rate', `${(1 / this.cd(lvl)).toFixed(2)} /s`], ['Ammo', 'none']]; },
    desc: 'Fires a slow singularity that drags every enemy around it into a knot, then collapses on them. Tight area, slow to fire; levels make it pull harder.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.26, 0.24, 0.5, 0x3a3f4a, o[0], o[1], 0.24));
      for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.16 - k * 0.02, 0.03, 6, 16), M(COL.cyan, 0x1b6a70)); r.position.set(o[0], o[1], 0.52 + k * 0.1); g.add(r); }   // focusing rings (rarity colour)
      g.add(bx(0.06, 0.06, 0.24, 0x8c96a0, o[0] - 0.13, o[1] + 0.13, 0.62)); g.add(bx(0.06, 0.06, 0.24, 0x8c96a0, o[0] + 0.13, o[1] + 0.13, 0.62));   // prongs
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8a5cff })); core.position.set(o[0], o[1], 0.74); g.add(core);
      return { muzzle: [o[0], o[1], 0.8] };
    },
    fire({ w, lv, m, o, tp, manual }) {
      w.cd = this.cd(lv) / m.rate;
      gravityWell(o, tp, this.dmg(lv) * m.dmg, this.pull(lv), this.radius(lv) * CUR_RANGE, manual);
    },
  },
  field: {
    name: 'Forcefield', range: 0, sound: null, mass: 0.6, push: 0, kick: 0, lootWeight: 0.6,
    dmg: lvl => 5 * (1 + 0.1 * (lvl - 1)), radius: lvl => 3.5 + 4.5 * lvlCurve(lvl, 40), pulse: 0.35,
    info(lvl) { return [['Damage', `${this.dmg(lvl).toFixed(1)} per pulse`], ['Pulse', `${(1 / this.pulse).toFixed(1)} /s`], ['Radius', `${this.radius(lvl).toFixed(1)} m (grows with level)`], ['Ammo', 'none, always on'], ['Hits', 'everything inside the field']]; },
    desc: 'Wraps the robot in a crackling sphere that burns anything inside it. Its radius grows as it levels up.',
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, COL.dark);
      const o = out.z > 0.9 ? [0, 0, 0] : [out.x * 0.22, out.y * 0.22, 0];
      if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
      g.add(bx(0.24, 0.24, 0.3, 0x3a4048, o[0], o[1], 0.16));
      for (let k = 0; k < 3; k++) g.add(bx(0.3 - k * 0.04, 0.3 - k * 0.04, 0.04, COL.cyan, o[0], o[1], 0.36 + k * 0.08, 0x1b6a70));   // emitter rings (take the rarity colour)
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9feaff })); core.position.set(o[0], o[1], 0.58); g.add(core);
      return { muzzle: [o[0], o[1], 0.6] };
    },
    props({ w }) {
      // a faint digital shell: an edge glow and a pixel grid that flashes up on each pulse, then breaks
      // up into blinking blocks and fades away; a scan band sweeps over it
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uPing: { value: 0 }, uColor: { value: new THREE.Color(0x6fdcff) } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vP = position; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uTime; uniform float uPing; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main(){
            vec3 n = normalize(vN), v = normalize(vV);
            float fres = pow(1.0 - abs(dot(n, v)), 3.0);
            vec2 uv = vec2(atan(vP.z, vP.x) / 6.2832 + 0.5, asin(clamp(vP.y, -1.0, 1.0)) / 3.1416 + 0.5);
            vec2 g = uv * vec2(56.0, 28.0), cell = floor(g), f = fract(g);
            float grid = step(0.94, max(f.x, f.y));
            float scan = fract(uv.y - uTime * 0.3);
            float band = smoothstep(0.0, 0.03, scan) * (1.0 - smoothstep(0.03, 0.1, scan));
            float h = hash(cell + floor(uTime * 9.0));
            float keep = 0.15 + 0.85 * uPing;                 // as a pulse fades, more blocks blink out
            if (h > keep + band * 0.6) discard;
            float a = (fres * 0.13 + grid * 0.06 + band * 0.07) * (0.2 + 0.8 * uPing) + h * 0.015 * uPing;
            gl_FragColor = vec4(uColor * (1.0 + band * 1.5), a);
          }`,
      });
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
      s.userData.field = w; s.renderOrder = 5;
      return [s];
    },
  },
};

/* ---------- Attributes ----------
   Very rarely an arm rolls a unique attribute. It applies to whatever weapon the arm holds.
   The store can add one to a part. */
const ATTRS = {
  bounce:    { name: 'Bounce',    color: '#7fe08a', desc: 'Shots arc under gravity and bounce off the ground.' },
  homing:    { name: 'Homing',    color: '#ff7ad1', desc: 'Shots curve into the enemy you aimed at.' },
  orbit:     { name: 'Orbit',     color: '#9fb8ff', desc: 'Shots circle around you for a few seconds, cutting through enemies.' },
  lightning: { name: 'Lightning', color: '#58cfd6', desc: 'Each hit arcs to another nearby enemy.' },
  explode:   { name: 'Explode',   color: '#ff9a3c', desc: 'Shots burst in a small explosion (much smaller than a rocket).' },
  split:     { name: 'Split',     color: '#ffe26a', desc: 'Doubles the number of shots.' },
  fire:      { name: 'Fire',      color: '#ff5a2a', desc: 'Sets enemies on fire.' },
  ice:       { name: 'Ice',       color: '#bfe9ff', desc: 'Chills enemies it hits: they move at half speed for a few seconds.' },
  lifesteal: { name: 'Lifesteal', color: '#d6204a', desc: 'Heals you for 1% (up to 3% at level V) of the damage its shots really deal, capped at 1-3 HP per second per arm.' },
  poison:    { name: 'Poison',    color: '#58d62a', desc: 'Each hit adds a poison stack worth 2-6% of its damage per second (max 3-7 stacks, fewer on bosses) for 4 seconds.' },
};
const ATTR_KEYS = Object.keys(ATTRS);
/* Two gems in one arm make a combo with its own effect (key: the two gem types, sorted, joined by '+') */
const COMBOS = {
  'bounce+homing':    ['Pinball', 'Every bounce snaps onto a new enemy.'],
  'bounce+orbit':     ['Satellite', 'Orbiting shots break off and bounce away across the ground.'],
  'bounce+lightning': ['Spark Ball', 'Every bounce zaps the enemies around it.'],
  'bounce+explode':   ['Cluster', 'Every bounce sets off a small blast.'],
  'bounce+split':     ['Scatter', 'Every bounce throws off an extra shot.'],
  'bounce+fire':      ['Firebrand', 'Every bounce leaves a burning patch.'],
  'bounce+ice':       ['Hailstone', 'Every bounce chills everything around it.'],
  'homing+orbit':     ['Guardian', 'Shots orbit you, and dart out at anything that comes close.'],
  'homing+lightning': ['Seeker Storm', 'Homing hits chain further and to more enemies.'],
  'explode+homing':   ['Smart Bomb', 'Homing shots carry a much bigger blast.'],
  'homing+split':     ['Swarm', 'Shots split early into a swarm of extra seekers.'],
  'fire+homing':      ['Comet', 'Homing shots trail fire across the ground.'],
  'homing+ice':       ['Frost Seeker', 'Hits freeze the target solid for a second.'],
  'lightning+orbit':  ['Tesla Ring', 'Orbiting shots are linked by arcs that shock anything crossing them.'],
  'explode+orbit':    ['Mine Ring', 'Orbiting shots are mines with a big blast.'],
  'orbit+split':      ['Halo', 'Twice the orbiters, in a wider ring.'],
  'fire+orbit':       ['Fire Wheel', 'A ring of fire spins around you, igniting anything it touches.'],
  'ice+orbit':        ['Blizzard', 'While the ring is up, a frost aura slows everything near you.'],
  'explode+lightning':['Thunderclap', 'Each chain jump sets off a blast.'],
  'lightning+split':  ['Fork', 'Chains branch in two at every jump.'],
  'fire+lightning':   ['Plasma', 'Chained enemies catch fire and burn hotter.'],
  'ice+lightning':    ['Superconductor', 'Chains jump further, chill, and hit chilled enemies twice as hard.'],
  'explode+split':    ['Shrapnel', 'Blasts throw out a ring of pellets.'],
  'explode+fire':     ['Napalm', 'Blasts leave burning ground behind.'],
  'explode+ice':      ['Frost Nova', 'Blasts freeze everything they catch.'],
  'fire+split':       ['Spread Fire', 'A wider fan of shots that all set enemies alight.'],
  'ice+split':        ['Sleet', 'A wide spray of shots that all chill.'],
  'fire+ice':         ['Thermal Shock', 'Freezing a burning enemy (or burning a frozen one) shatters it for huge damage.'],
  // two of the same gem
  'bounce+bounce':       ['Ricochet', 'Shots keep bouncing, almost endlessly.'],
  'homing+homing':       ['Hunter', 'Fast, razor-tight homing that never misses.'],
  'orbit+orbit':         ['Double Ring', 'Two rings of orbiters that last much longer.'],
  'lightning+lightning': ['Storm', 'Chains jump to three more enemies.'],
  'explode+explode':     ['Demolition', 'Much bigger blasts.'],
  'split+split':         ['Shotgun Fan', 'A wide fan of extra shots.'],
  'fire+fire':           ['Inferno', 'Burns twice as hot and twice as long.'],
  'ice+ice':             ['Deep Freeze', 'Every hit freezes enemies solid.'],
  // Lifesteal and Poison combos (Chunk 10)
  'bounce+lifesteal':    ['Bloodshot', 'After a bounce, hitting a new enemy heals you.'],
  'homing+lifesteal':    ['Bloodhound', 'Hitting the homed target heals a little; killing it heals more.'],
  'lifesteal+orbit':     ['Vampiric Halo', 'Orbiting shots siphon life from what they cut.'],
  'lifesteal+lightning': ['Life Conduit', 'Every chain jump siphons life (inside the arm cap).'],
  'explode+lifesteal':   ['Blood Burst', 'A blast that kills sends out a healing pulse.'],
  'lifesteal+split':     ['Leech Swarm', 'Each different enemy your split shots reach heals you.'],
  'fire+lifesteal':      ['Blood Furnace', 'Burning enemies that die release a healing pulse.'],
  'ice+lifesteal':       ['Cryostasis', 'Healing below half health grants brief damage resistance (12 s cooldown).'],
  'lifesteal+lifesteal': ['Blood Bank', 'Healing that would overflow becomes a small temporary shield.'],
  'bounce+poison':       ['Contagion', 'Bounces carry poison stacks to a fresh enemy.'],
  'homing+poison':       ['Patient Zero', 'Shots home on infected enemies; infected kills spread the poison once.'],
  'orbit+poison':        ['Toxic Halo', 'The orbiting ring poisons whatever it touches.'],
  'lightning+poison':    ['Neurotoxin', 'Chains poison and stagger heavily infected enemies (bosses resist).'],
  'explode+poison':      ['Toxic Burst', 'Blasts poison everything and spread the stacks of enemies they kill.'],
  'poison+split':        ['Viral Spread', 'Heavily poisoned hits send a weaker stack to a neighbour.'],
  'fire+poison':         ['Toxic Combustion', 'A heavily poisoned burning enemy bursts into a poisonous blast.'],
  'ice+poison':          ['Septic Frost', 'The more stacks, the slower the enemy (capped).'],
  'poison+poison':       ['Superstrain', 'Poison lasts longer and its kills spread it a little.'],
  'lifesteal+poison':    ['Parasitic Infection', 'Poisoned enemies that die heal you, by their stacks (capped).'],
};
const comboKey = (a, b) => [a, b].sort().join('+');
function armCombo(arm) { const g = armGems(arm); return g.length === 2 ? comboKey(g[0].type, g[1].type) : null; }
/* The same gems socketed into a leg change how you move instead */
const LEG_GEM = {
  bounce:    'Springy legs: higher jumps, and a hard landing rebounds you into a free hop.',
  homing:    'Stomp-seeker: falling near an enemy steers you onto it, and landing on it stomps it.',
  orbit:     'Strafe drive: moving sideways or backwards is faster, for circling enemies while you aim.',
  lightning: 'Static stride: running builds charge; your next landing zaps the nearest enemies.',
  explode:   'Shockwave landing: jumps and falls end in a blast that grows with the drop.',
  split:     'One extra air jump.',
  fire:      'Burning footprints: you leave a trail of fire that burns whatever follows you.',
  ice:       'Skates: a frost trail that slows enemies, and you glide faster with less grip.',
  lifesteal: 'Blood miles: every 20 m you run with an enemy within 12 m heals 1-3 HP (once per 2 s at most).',
  poison:    'Toxic wake: you leave a poison patch every 3 m (3 s, 12 at most) that poisons enemies standing in it.',
};
const ATTR_CHANCE = 0.06;    // per dropped arm
/* Gems: each attribute is now a gem you socket into an arm (every arm has two gem slots).
   They change whatever gun the arm holds. Rare drops from enemies, sometimes from crates, targets and locked cases. */
const GEMS = {};
for (const k of ATTR_KEYS) GEMS[k] = {
  name: ATTRS[k].name + ' Gem', color: ATTRS[k].color, desc: `In an arm: ${ATTRS[k].desc} In a lower half: ${LEG_GEM[k]}`, mass: 0.02,
  model(g, { out, lvl }) {
    const col = new THREE.Color(ATTRS[k].color), t = lvl || 1;
    const c = new THREE.Mesh(geoGem, new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.4 + 0.15 * t), roughness: 0.15, metalness: 0.1 }));
    const s = 0.17 + 0.025 * t;                    // higher tiers are bigger and brighter
    c.scale.set(s, s * 1.4, s);
    const o = (out || new THREE.Vector3(0, 1, 0)).clone().normalize();
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o); c.position.copy(o).multiplyScalar(0.12);
    g.add(c);
    return {};
  },
};
const mkGem = type => mkItem('gem', type || pick(ATTR_KEYS));
const GEM_MAX = 5;                                   // gems share the five levels: I -> II -> III -> IV -> V
/* type -> best tier, for a list of gems */
const gemMap = gs => { const m = new Map(); for (const g of gs) m.set(g.type, Math.max(m.get(g.type) || 0, g.lvl || 1)); return m; };
const armGems = a => (a && a.gems ? a.gems.filter(Boolean) : []);
const attrTag = it => armGems(it).map(g => `<em class="attr" style="color:${ATTRS[g.type].color}">✦ ${ATTRS[g.type].name}</em>`).join(' ')
  + (it && it.kind === 'gem' ? `<em class="attr" style="color:${ATTRS[it.type].color}">✦</em>` : '');

/* ---------- Modules (upper mounts) ----------
   apply(s, lvl): change the frame's stats. Fields you can change on s:
     maxHp, maxShield, speed, jump, airJumps, dashes, fire (rate mult), dmg (mult), magnet (pickup m),
     shieldRate, shieldDelay, xpMult.
   model(g, { out }): ball at the origin, body pushed outward along out.
   Example:
   plate: { name: 'Armor Plate', desc: '+25 max hull per Mk.', apply(s, lvl) { s.maxHp += 25 * lvl; },
            model(g, { out }) { joint(g, [0,0,0], 0.15, COL.joint); g.add(bx(0.5, 0.6, 0.12, COL.joint, out.x*0.3, out.y*0.3, out.z*0.3)); } },
*/
/* ---------- BUILD V2 lower halves: a single block with its legs built in. Nothing else plugs into it except the upper half
   on top, and two shared gem slots that open as it levels (Mk II, Mk III). Gems here change how you move, like leg gems did.
   mounts: where each built-in leg sits [face, u, v] on the block. Legs use the old LEGS models and stats. ---------- */
const LOWERS = {
  standard: { name: 'Walker Legs', legType: 'basic', mass: 1.6, hp: 50, shield: 10, mounts: [['left', 0, 0], ['right', 0, 0]],
    desc: 'Two sturdy legs. Balanced, and they can scramble a short way up a wall.' },
  spider:   { name: 'Spider Legs', legType: 'spider', mass: 2.4, hp: 45, shield: 10, mounts: [['left', -0.34, 0], ['left', 0, 0], ['left', 0.34, 0], ['right', -0.34, 0], ['right', 0, 0], ['right', 0.34, 0]],
    desc: 'Three arched legs a side. Steps up tall ledges and climbs walls for much longer.' },
  treads:   { name: 'Tread Base', legType: 'tread', mass: 2.6, hp: 65, shield: 10, mounts: [['back', -0.32, 0], ['back', 0.32, 0], ['front', 0, 0]],
    desc: 'Two treads at the back, one at the front. Heavy, tough and can boost, but no wall climbing.' },
  wheels:   { name: 'Wheel Base', legType: 'wheel', mass: 1.9, hp: 45, shield: 10, mounts: [['left', -0.32, 0], ['left', 0.32, 0], ['right', -0.32, 0], ['right', 0.32, 0]],
    desc: 'Four wheels at the corners. Fast and slidey, can boost.' },
};
/* ---------- adapters (Build V2) ----------
   An adapter plugs into a torso socket and changes what that socket takes. 'from' = the socket type it plugs into,
   'to' = what its own sockets hold. Level 1 has one socket, Level 2 has two (independent parts, same original socket).
   Adapters never hold adapters, and they top out at Level 2. */
const ADAPTERS = {
  arm2mod: { name: 'Arm-to-Module Adapter', from: 'arm', to: 'module', mass: 0.2, maxLvl: 2,
    desc: 'Plugs into an ARM socket (sphere) and turns it into a MODULE socket (cube). Level 2 holds two modules.' },
  mod2arm: { name: 'Module-to-Arm Adapter', from: 'module', to: 'arm', mass: 0.2, maxLvl: 2,
    desc: 'Plugs into a MODULE socket (cube) and turns it into an ARM socket (sphere). Level 2 holds two arms.' },
};
/* ---------- the Universal Upgrade Orb ----------
   Found only in weapon cases (5% per case). It sits in storage; drag it onto any part that can still go up a level and it raises it by one
   through upgradeItem(). It is only used up when the upgrade succeeds. */
const ORBS = { universal: { name: 'Universal Upgrade Orb', desc: 'Drag it onto a weapon, arm, module, gem, lower half or adapter to raise it one level (normal parts max at Lv 5, adapters at Lv 2).' } };
const ORB_COLOR = '#ffd24a';
const partColor = it => it.kind === 'gem' ? ATTRS[it.type].color : it.kind === 'orb' ? ORB_COLOR : rarityOf(it.lvl || 1).css;
/* Uses an orb on a target in one step: the orb is consumed only if the upgrade went through. Returns {ok, from, to, reason}. */
function useOrb(orb, target) {
  if (!orb || orb.kind !== 'orb' || orb.spent) return { ok: false, reason: 'no orb' };
  if (target === orb) return { ok: false, reason: 'not a target' };
  const r = upgradeItem(target, 1);
  if (r.ok) orb.spent = true;
  return r;
}
/* What a +1 would change, read off the hover rows. */
function orbPreview(target) {
  const c = upgradeCheck(target); if (!c.ok) return null;
  const a = partInfo(target), b = partInfo({ ...target, lvl: c.to, gems: target.gems, slots: target.slots });
  const diff = b.filter((r, i) => a[i] && String(a[i][1]) !== String(r[1]) && r[0] !== 'Weight').map(r => `${r[0].toLowerCase()} ${a.find(x => x[0] === r[0])[1]} → ${r[1]}`);
  return `${itemName(target)}  Lv ${c.from} → ${c.to}` + (diff.length ? ' · ' + diff.slice(0, 3).join(', ') : '');
}
const lowerLegItems = it => {
  // the built-in legs, made once per lower-half item (they aren't parts of their own: you can't take them off)
  if (!it._legs || it._legs.length !== LOWERS[it.type].mounts.length) Object.defineProperty(it, '_legs', { value: LOWERS[it.type].mounts.map(() => mkItem('leg', LOWERS[it.type].legType, 1)), enumerable: false, configurable: true, writable: true });
  return it._legs;
};
const MODULES = {
  jetpack: {
    name: 'Jetpack', mass: 0.5,
    desc: 'Hold jump in the air to fire it. It pushes the way its nozzles point away from, so mount it facing down to fly up; turn it (click) to boost sideways.',
    // Lv 1 only slows a fall, around Lv 20 it can hover a standard frame, by Lv 100 it really flies
    thrust: lvl => 110 * (1 + 1.0 * lvlCurve(lvl, 40)), fuel: lvl => 1.5 * (1 + 1.5 * lvlCurve(lvl, 40)),
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.15, JOINT_COL);
      const c = [out.x * 0.3, out.y * 0.3, out.z * 0.3], flames = [];
      for (const dx of [-0.17, 0.17]) {
        const ox = Math.abs(out.x) > 0.5 ? 0 : dx, oz = Math.abs(out.x) > 0.5 ? dx : 0;
        g.add(bx(0.3, 0.8, 0.3, 0x56606a, c[0] + ox, c[1], c[2] + oz));
        g.add(bx(0.2, 0.08, 0.2, COL.dark, c[0] + ox, c[1] - 0.44, c[2] + oz));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), B(ORANGE, { transparent: true, opacity: 0.85 }));
        flame.rotation.x = Math.PI; flame.position.set(c[0] + ox, c[1] - 0.64, c[2] + oz); g.add(flame);
        flames.push(flame);
      }
      // nozzles point along local -y: thrust pushes along local +y
      return { jet: { flames, dir: [0, 1, 0] } };
    },
  },
};

Object.assign(MODULES, {
  blades: {
    name: 'Blade Ring', mass: 0.5, blades: true,
    desc: 'Not a gun: every few seconds it flings spinning blades that circle you, cutting everything they pass. More blades, faster, as it levels. Opens a gem slot at Lv 10 and another at Lv 30; gems change the blades.',
    gemSlots: lvl => [0, 0, 0, 1, 2, 2][Math.max(1, Math.min(5, lvl))],      // L3 opens the first gem slot, L4 the second
    n: lvl => 2 + Math.floor(lvl / 20), dmg: lvl => 9 * (1 + 0.06 * (lvl - 1)), cd: lvl => 4.2 / (1 + 1.5 * lvlCurve(lvl, 35)), life: 3.2,
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.13, JOINT_COL);
      const c = [out.x * 0.26, out.y * 0.26, out.z * 0.26];
      strut(g, [0, 0, 0], c, 0.1, COL.dark);
      g.add(bx(0.36, 0.2, 0.36, 0x3a4048, c[0], c[1], c[2]));
      const spin = new THREE.Group(); spin.position.set(c[0], c[1] + 0.14, c[2]); g.add(spin);
      for (let k = 0; k < 4; k++) { const b = bx(0.42, 0.03, 0.08, 0xd8dee4, 0.21, 0, 0); const h = new THREE.Group(); h.rotation.y = k * Math.PI / 2; h.add(b); spin.add(h); }
      spin.add(bx(0.1, 0.06, 0.1, ORANGE, 0, 0.02, 0));
      return { spin };
    },
  },
  pods: {
    name: 'Missile Pod', mass: 0.45, rate: true, gemSlots: () => 1,
    desc: 'Not a gun: it fires small missiles straight up on its own; they arc over and dive onto nearby enemies. Low damage and a small blast, but it fires faster as it levels.',
    dmg: lvl => 7 * (1 + 0.05 * (lvl - 1)), cd: lvl => 2.4 / (1 + 3 * lvlCurve(lvl, 35)), radius: 2.2,
    volley: lvl => 3 + Math.floor(lvl / 25),
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.13, JOINT_COL);
      const c = [out.x * 0.3, out.y * 0.3, out.z * 0.3];
      strut(g, [0, 0, 0], c, 0.1, COL.dark);
      g.add(bx(0.5, 0.26, 0.42, 0x46505a, c[0], c[1], c[2]));                       // launcher box
      g.add(bx(0.52, 0.05, 0.44, ORANGE, c[0], c[1] + 0.15, c[2]));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {                     // 6 tubes, pointing up
        const x = c[0] + (i - 1) * 0.15, z = c[2] + (j - 0.5) * 0.18;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), M(COL.dark)); tube.position.set(x, c[1] + 0.26, z); g.add(tube);
        g.add(bx(0.06, 0.03, 0.06, 0xe2465c, x, c[1] + 0.37, z, 0x601020));        // warhead tips
      }
      // the gem socket sits on the rear face of the launcher box (clear of the missile tubes); a pod mounted on the back faces its socket sideways instead
      const rear = out.z < -0.5 ? 'right' : 'back';
      const gemSock = rear === 'back' ? { face: 'back', pos: [c[0], c[1], c[2] - 0.21 - 0.03] } : { face: 'right', pos: [c[0] + 0.25 + 0.03, c[1], c[2]] };
      return { muzzle: [c[0], c[1] + 0.45, c[2]], gemSock };
    },
  },
  magnet: {
    name: 'Magnet Coil', mass: 0.35,
    desc: 'Pulls experience orbs in from much further away. (Bolts and loot are not affected.)',
    range: lvl => 5 + 12 * lvlCurve(lvl, 30),
    apply(s, lvl) { s.magnet += this.range(lvl); },
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.13, JOINT_COL);
      const c = [out.x * 0.28, out.y * 0.28, out.z * 0.28];
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), M(0x8c96a0)); core.position.set(c[0], c[1] + 0.05, c[2]); g.add(core);
      for (let k = 0; k < 5; k++) { const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 14), M(0xc0703a, 0x301000)); ringM.rotation.x = Math.PI / 2; ringM.position.set(c[0], c[1] - 0.15 + k * 0.1, c[2]); g.add(ringM); }
      g.add(bx(0.12, 0.08, 0.12, COL.cyan, c[0], c[1] + 0.34, c[2], 0x1b6a70));
      return {};
    },
  },
  dash: {
    name: 'Dash Thruster', mass: 0.4,
    desc: 'Q / RB to burst a short distance in the direction you\'re steering. One charge, two from Lv 30, three from Lv 70; recharges on landing.',
    charges: lvl => 1 + (lvl >= 30 ? 1 : 0) + (lvl >= 70 ? 1 : 0),
    apply(s, lvl) { s.dashes += this.charges(lvl); },
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.14, JOINT_COL);
      const c = [out.x * 0.3, out.y * 0.3, out.z * 0.3];
      g.add(bx(0.34, 0.34, 0.4, 0x46505a, c[0], c[1], c[2]));
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.24, 12), M(COL.dark)); bell.rotation.x = Math.PI / 2; bell.position.set(c[0], c[1], c[2] - 0.3); g.add(bell);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0x58a8ff })); glow.position.set(c[0], c[1], c[2] - 0.43); glow.rotation.y = Math.PI; g.add(glow);
      g.add(bx(0.36, 0.06, 0.06, ORANGE, c[0], c[1] + 0.2, c[2]));
      // the burst: a long blue-white flame out of the bell, hidden until you dash
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 10), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.rotation.x = -Math.PI / 2; flame.position.set(c[0], c[1], c[2] - 0.88); flame.visible = false; g.add(flame);
      return { dashFx: { flame, glow } };
    },
  },
  whirl: {
    name: 'Whirl Core', mass: 0.5, whirl: true,
    desc: 'Not a gun: every time your slowest weapon finishes a reload cycle, the whole frame spins and slashes everything around it. Bigger, harder spins as it levels.',
    dmg: lvl => 22 * (1 + 0.08 * (lvl - 1)), radius: lvl => 3.6 + 2.4 * lvlCurve(lvl, 40),
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.14, JOINT_COL);
      const c = [out.x * 0.26, out.y * 0.26, out.z * 0.26];
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.26, 12), M(0x3a4048)); core.position.set(...c); core.rotation.set(out.z ? Math.PI / 2 : 0, 0, out.x ? Math.PI / 2 : 0); g.add(core);
      const spin = new THREE.Group(); spin.position.set(...c); spin.rotation.copy(core.rotation); g.add(spin);
      for (let k = 0; k < 3; k++) { const b = bx(0.62, 0.04, 0.09, 0xb9c2c9, 0, 0.15, 0); b.rotation.y = k * Math.PI / 3; spin.add(b); }   // blades
      spin.add(bx(0.14, 0.06, 0.14, ORANGE, 0, 0.18, 0));
      return { spin };
    },
  },
  radar: {
    name: 'Radar', mass: 0.3,
    desc: 'Marks locked cases, the store, elites, power-ups and parts on your screen.',
    range: lvl => 45 + 120 * lvlCurve(lvl, 30),
    apply(s, lvl) { s.radar = Math.max(s.radar || 0, this.range(lvl)); },
    model(g, { out }) {
      joint(g, [0, 0, 0], 0.12, JOINT_COL);
      const c = [out.x * 0.24, out.y * 0.24, out.z * 0.24];
      strut(g, [0, 0, 0], c, 0.1, COL.dark);
      g.add(bx(0.26, 0.14, 0.26, 0x46505a, c[0], c[1] + 0.04, c[2]));              // base
      g.add(bx(0.07, 0.3, 0.07, COL.dark, c[0], c[1] + 0.26, c[2]));                // mast
      const spin = new THREE.Group(); spin.position.set(c[0], c[1] + 0.44, c[2]); g.add(spin);
      const bar = new THREE.Group(); bar.rotation.x = -0.3; spin.add(bar);          // tilted antenna array
      bar.add(bx(0.66, 0.16, 0.04, 0xb9c2c9, 0, 0.02, 0));
      for (let k = -2; k <= 2; k++) bar.add(bx(0.03, 0.18, 0.06, COL.dark, k * 0.14, 0.02, 0.02));
      bar.add(bx(0.66, 0.03, 0.06, ORANGE, 0, -0.07, 0.01));
      spin.add(bx(0.08, 0.06, 0.08, 0xe2465c, 0, -0.06, 0, 0x601020));           // turning hub light
      return { spin };
    },
  },
});

/* ---------- Stage perks (one per cleared stage) ---------- */
const PERKS = [
  { id: 'overclock', name: 'Overclock',     desc: '+25% fire rate on every weapon.' },
  { id: 'titan',     name: 'Titan Plating', desc: '+60 max hull.' },
  { id: 'grav',      name: 'Grav Boots',    desc: '+1.5 m jump height. Reach ledges other frames can’t.' },
  { id: 'leech',     name: 'Leech Rounds',  desc: 'Each kill restores 1 hull.' },
  { id: 'aegis',     name: 'Aegis Lattice', desc: '+40 shield. Recharge starts 1.5 s sooner.' },
  { id: 'skyfall',   name: 'Skyfall',       desc: 'Landing from a big fall blasts nearby enemies.' },
  { id: 'payload',   name: 'Heavy Payload', desc: '+20% weapon damage.' },
  { id: 'scav',      name: 'Scavenger',     desc: '+30% experience from scrap.' },
];

/* ---------- Enemies ----------
   r: collision radius (enemies are physical balls: they push, stack, get knocked flying). mass: how hard they are to shove.
   The basic crawler comes in three shapes with identical stats; each group that spawns shares a shape. */
const ETYPES = {
  crawler: { hp: 30,   speed: 4.6, dmg: 9,  r: 0.62, mass: 1,  xp: 1,  color: 0xd2435a, size: 1.1 },
  drone:   { hp: 19,   speed: 6.0, dmg: 7,  r: 0.6,  mass: 0.7, xp: 1, color: 0x9a5ad8, size: 0.9, fly: true },
  spitter: { hp: 44,   speed: 3.4, dmg: 12, r: 0.8,  mass: 1.6, xp: 2,  color: 0xe0784a, size: 1.2, ranged: true },
  // rare: rolls up to you, lights its fuse and blows up. The blast hurts you and every enemy nearby (and sets off other bombers).
  bomber:  { hp: 26,   speed: 5.4, dmg: 0,  r: 0.7,  mass: 1.3, xp: 3,  color: 0xf2b230, size: 1.1, bomb: { radius: 5.5, dmg: 34, enemyDmg: 140, fuse: 0.75 } },
  // splits into three splitlings when it dies
  splitter: { hp: 75, speed: 3.9, dmg: 12, r: 1.05, mass: 2.6, xp: 3, color: 0x3fb8a0, size: 1.6, split: 10 },
  splitling: { hp: 14, speed: 5.8, dmg: 5, r: 0.42, mass: 0.5, xp: 1, color: 0x7fe0c8, size: 0.7 },
  brute:   { hp: 2400, speed: 5.0, dmg: 26, r: 1.8,  mass: 10, xp: 30, color: 0xa8233a, size: 2.8, mini: true },
  // not an enemy: a little cleaning bot that roams the level hoovering up the mess. Shootable (big xp), never targeted by lock-on.
  robovac: { hp: 320, speed: 2.2, dmg: 0, r: 0.75, mass: 2.5, xp: 12, color: 0xd8dde2, size: 1, npc: true },
  warden:  { hp: 16000, speed: 3.9, dmg: 30, r: 3.0,  mass: 60, xp: 0,  color: 0x6e1c30, size: 5,   boss: true },
  // bosses (Chunk 08): one is picked at random at 8:30. passive = never attacks and keeps its own colour on every stage
  pig:        { hp: 3200,  speed: 2.4, dmg: 0,  r: 1.5, mass: 25, xp: 0, color: 0xf2c230, size: 2.4, boss: true, passive: true },
  magnetron:  { hp: 14000, speed: 3.0, dmg: 26, r: 2.8, mass: 55, xp: 0, color: 0x2a6fb8, size: 4.6, boss: true },
  smelter:    { hp: 15000, speed: 2.3, dmg: 28, r: 3.0, mass: 70, xp: 0, color: 0xb8541c, size: 4.8, boss: true },
  hivemother: { hp: 12000, speed: 2.7, dmg: 24, r: 3.0, mass: 55, xp: 0, color: 0x6a8f2a, size: 4.6, boss: true },
  // not a boss: a Hive Mother's glowing egg sac. Shoot it to stop its spawns.
  sac:        { hp: 700,   speed: 0,   dmg: 0,  r: 0.9, mass: 5,  xp: 0, color: 0xb6e040, size: 1.4 },
};
const CRAWLER_SHAPES = ['cube', 'sphere', 'dome'];
/* Elite crawlers: an occasional pack leader. Bigger, tougher, health bar overhead, always drops a part. */
const ELITE = { chance: 0.12, hpMul: 7, sizeMul: 1.55, massMul: 4, dmgMul: 1.6, xp: 8, color: 0xe8b23a };

/* ---------- items ---------- */
const armGuns = a => [a.weapon, a.weapon2].filter(Boolean);
const WRISTS = ['weapon', 'weapon2'];
const FACE_ORDER = ['right', 'left', 'front', 'back', 'top', 'bottom'];
const OPPOSITE = { right: 'left', left: 'right', front: 'back', back: 'front', top: 'bottom', bottom: 'top' };
let nextItemId = 1;
/* Everything upgradeable (weapons, arms, modules, lower halves, legacy legs, upgradable blocks, gems) tops out at Level 5. */
const maxLvlOf = it => it.kind === 'gem' ? GEM_MAX : it.kind === 'adapter' ? 2 : MAX_LVL;
const markFor = (kind, lvl) => Math.max(1, Math.min(kind === 'adapter' ? 2 : MAX_LVL, Math.round(lvl) || 1));
/* arms, legs and lowers scale on the same five levels (their own stats are set in armRate/armTurn/lowerMul below) */
const effLvl = it => sLv(it.lvl);
/* gem slots follow one schedule for arms, lower halves and legs: none at L1, one at L2-L3, two at L4-L5 */
const SLOT_SCHEDULE = [0, 0, 1, 1, 2, 2];
function gemSlotsFor(it) {
  if (it.kind === 'arm' || it.kind === 'lower') return SLOT_SCHEDULE[Math.max(1, Math.min(5, it.lvl))];
  if (it.kind === 'leg') return Math.min(1, SLOT_SCHEDULE[Math.max(1, Math.min(5, it.lvl))]);
  if (it.kind === 'module' && MODULES[it.type] && MODULES[it.type].gemSlots) return MODULES[it.type].gemSlots(it.lvl);
  return 0;
}
function syncGemSlots(it) {
  if (it.kind === 'adapter') { it.slots = it.slots || []; let n = 0; while (it.slots.length < it.lvl) { it.slots.push(null); n++; } return 0; }     // an adapter's sockets: one per level
  const n = gemSlotsFor(it); if (!n && !it.gems) return 0;
  it.gems = it.gems || []; let added = 0;
  while (it.gems.length < n) { it.gems.push(null); added++; }
  return added;
}
function mkItem(kind, type, lvl = 1) {
  const it = { id: nextItemId++, kind, type, lvl: markFor(kind, lvl) };
  if (kind === 'arm') { it.weapon = null; if (ARMS[type] && ARMS[type].wrists === 2) it.weapon2 = null; }
  if (kind === 'block') { it.slots = new Array(BLOCKS[type] && BLOCKS[type].sockets ? BLOCKS[type].sockets.length : 6).fill(null); it.plug = 'bottom'; }
  if (kind === 'lower') { it.slots = new Array(6).fill(null); it.plug = 'bottom'; }
  if (kind === 'module' && typeof SETTINGS !== 'undefined' && SETTINGS.autoUpMods) it.autoUp = true;     // new modules start with auto-upgrade on
  if (kind === 'adapter') { it.maxLvl = 2; it.slots = new Array(it.lvl).fill(null); }      // only the top slot is used: the upper half
  syncGemSlots(it);
  return it;
}
/* Flat side-view drawings of each weapon, for the HUD and the workbench (viewBox 32 x 14, filled in the text colour). */
const WEAPON_ICONS = {
  pistol: '<path d="M6 3h17v2h2v2h-2v1H14l-1 1h-1l-2 4H6l2-5H6z"/>',
  gatling: '<path d="M1 3h9l2 1h3v6h-3l-2 1H1z"/><path d="M15 4h16v1.5H15zM15 6.25h16v1.5H15zM15 8.5h16V10H15z"/><path d="M5 11h4v3H5z"/>',
  katana: '<path d="M1 6h7v2H1z"/><path d="M8 4.5h1.6v5H8z"/><path d="M9.6 6.3l14 -.6c3 0 5.5-.8 7.4-2.2-1.4 2.4-4 3.8-7.4 4.3l-14 .2z"/>',
  chainsaw: '<path d="M1 3h9v8H1z"/><path d="M3 1h5v2H3z"/><path d="M10 5h19a2 2 0 0 1 0 4H10z"/><path d="M11 4h2v1h-2zM15 4h2v1h-2zM19 4h2v1h-2zM23 4h2v1h-2zM11 9h2v1h-2zM15 9h2v1h-2zM19 9h2v1h-2zM23 9h2v1h-2z"/>',
  autogun: '<path d="M1 5l3-1h4l1 1h12V4h2v1h7v2h-7v1h-5l-1 5h-3l1-5h-2l-1 3H9l1-3H7l-3 2H1z"/>',
  shotgun: '<path d="M1 4h3l3 1h4h20v2H18v2H11l-1 3H7l1-3H4l-3 1z"/><rect x="18" y="8" width="7" height="2"/>',
  sniper: '<path d="M1 4h2l3 2h6V4h2V3h6v1h1v1h-1v1h11v1h-11v1h-5l-1 4h-3l1-4H6l-3 2H1z"/>',
  rocket: '<path d="M3 4h22l3 1v4l-3 1H3l-2-2V6z"/><path d="M10 10h3v3h-3zM5 2h2v2H5zM5 10h2v2H5z"/>',
  flamer: '<path d="M3 3h9v8H3z"/><path d="M12 6h12v2h-2v2h-5V8h-5z"/><path d="M25 5c2 0 3-2 3-2s1 2 3 4c-2 1-3 3-5 3 1-2 0-3-1-3z"/>',
  lightning: '<path d="M2 4h14l2 2v2l-2 2H2z"/><path d="M18 6l4-3-1 3 4-1-6 6 1-3-3 1z"/><path d="M6 10h3v3H6z"/>',
  knife: '<path d="M2 6h8v3H2z"/><path d="M10 5h2v5h-2z"/><path d="M12 6h14l5 1-5 1H12z"/>',
  field: '<circle cx="16" cy="7" r="2.5"/><path d="M16 1a6 6 0 1 1 0 12a6 6 0 1 1 0-12zm0 1.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z"/><path d="M5 6h4v2H5zM23 6h4v2h-4zM1 6.5h2v1H1zM29 6.5h2v1h-2z"/>',
  gravity: '<path d="M2 4h10l2 1h6v4h-6l-2 1H2z"/><circle cx="26" cy="7" r="3"/><path d="M26 1a6 6 0 0 1 0 12v-1.5a4.5 4.5 0 0 0 0-9z"/>',
  whirl: '<circle cx="16" cy="7" r="2.2"/><path d="M16 4.5L26 2l-1.5 3zM18 8.8l2.5 4.5-3.2-.7zM13.6 8.2L5 12l1-3z"/>',
  blades: '<circle cx="16" cy="7" r="1.6"/><path d="M16 1l2 5-2 1zM22 7l-5 2-1-2zM16 13l-2-5 2-1zM10 7l5-2 1 2z"/>',
  pods: '<path d="M4 6h16v7H4z"/><path d="M6 1h3v5H6zM11 1h3v5h-3zM16 1h3v5h-3z"/><path d="M22 4l6-3-2 4 4 0-8 3z"/>',
};
const weaponIcon = (type, cls = 'wicon') => WEAPON_ICONS[type] ? `<svg class="${cls}" viewBox="0 0 32 14" fill="currentColor" aria-hidden="true">${WEAPON_ICONS[type]}</svg>` : '';
/* A small unique icon for every non-weapon part (24 x 24, drawn in the text colour). Weapons use WEAPON_ICONS. */
const PART_ICONS = {
  'block:body': '<path fill-rule="evenodd" d="M2 2h20v20H2zM12 7.5a4.5 4.5 0 1 0 .01 0zm0 2.2a2.3 2.3 0 1 1-.01 0z"/><path d="M4 4h3v1.4H4zM17 18.6h3V20h-3z"/>',
  'block:pack': '<path fill-rule="evenodd" d="M9 2h6v3h2.5A2.5 2.5 0 0 1 20 7.5V22H4V7.5A2.5 2.5 0 0 1 6.5 5H9zM10.5 3.4V5h3V3.4zM7 10h10v3H7z"/><path d="M8 15h8v5H8z" opacity=".55"/>',
  'lower:standard': '<path d="M5 2h14v8H5z"/><path d="M6 10h3v7l-2 5H4l2-5zM15 10h3v7l2 5h-3l-2-5z"/>',
  'lower:spider': '<path d="M7 3h10v7H7z"/><path d="M7 5L1 2l-1 2 6 3zM7 8L0 9v2l7-1zM7 9.5L2 16l1.6 1 4.4-6zM17 5l6-3 1 2-6 3zM17 8l7 1v2l-7-1zM17 9.5l5 6.5-1.6 1-4.4-6z"/>',
  'lower:treads': '<path d="M6 2h12v8H6z"/><path d="M2 12h20a4 4 0 0 1 0 8H2a4 4 0 0 1 0-8zm2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm16 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
  'lower:wheels': '<path d="M6 3h12v8H6z"/><circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/>',
  'block:upper_scout': '<path d="M6 6h12v12H6z"/><circle cx="3.5" cy="12" r="2.5"/><circle cx="20.5" cy="12" r="2.5"/><path d="M10 2h4v4h-4z"/>',
  'block:upper_brawler': '<path d="M6 4h12v16H6z"/><circle cx="3.5" cy="8" r="2.5"/><circle cx="3.5" cy="16" r="2.5"/><circle cx="20.5" cy="8" r="2.5"/><circle cx="20.5" cy="16" r="2.5"/>',
  'block:upper_carrier': '<path d="M6 6h12v12H6z"/><circle cx="3.5" cy="12" r="2.5"/><circle cx="20.5" cy="12" r="2.5"/><path d="M10 2h4v4h-4zM10 18h4v4h-4z"/>',
  'leg:basic': '<circle cx="8" cy="4" r="3"/><path d="M7.2 6.2l2-1 5 8.3-2 1.1z"/><circle cx="13" cy="13.5" r="2.5"/><path d="M12 14.5h2.4l.6 6h-2.6z"/><path d="M9 20h9v2.5H9z"/>',
  'leg:spider': '<circle cx="4" cy="13" r="2.8"/><path d="M4.6 11.4l8.6-8.8 2 1.9-8.6 8.8z"/><path d="M13.4 3.2l2.2-.6L21 21.5l-1.6.5z"/><circle cx="14.4" cy="3.4" r="1.8"/>',
  'leg:wheel': '<path d="M11 1h2v9h-2z"/><path fill-rule="evenodd" d="M12 6.5a8.25 8.25 0 1 0 .01 0zm0 3a5.25 5.25 0 1 1-.01 0z"/><path d="M11.3 10h1.4v9.5h-1.4zM7 14.05h10v1.4H7z"/>',
  'leg:tread': '<path d="M11 1h2v8h-2z"/><path fill-rule="evenodd" d="M6.5 9h11a6 6 0 0 1 0 12h-11a6 6 0 0 1 0-12zm0 2.6a3.4 3.4 0 0 0 0 6.8h11a3.4 3.4 0 0 0 0-6.8z"/><circle cx="7" cy="15" r="1.7"/><circle cx="12" cy="15" r="1.7"/><circle cx="17" cy="15" r="1.7"/>',
  'arm:basic': '<circle cx="4" cy="5" r="3"/><path d="M5.6 3.8l7 6.8-1.8 1.8-7-6.8z"/><circle cx="11.6" cy="12.8" r="2.3"/><path d="M12.5 11.8h6v2.6h-6z"/><path fill-rule="evenodd" d="M17.5 9h5v8h-5zm1.6 2.6v2.8h1.8v-2.8z"/>',
  'arm:double': '<circle cx="4" cy="12" r="3"/><path d="M6 10.8h6v2.4H6z"/><path d="M11.5 4h2.4v16h-2.4z"/><path d="M13.9 4h8v3.4h-8zM13.9 16.6h8V20h-8z"/>',
  'arm:sentry': '<circle cx="4" cy="20" r="2.8"/><circle cx="6.8" cy="14.2" r="2"/><circle cx="10.2" cy="9.2" r="2"/><circle cx="14.8" cy="5.8" r="2"/><path fill-rule="evenodd" d="M17 1.5h6v7h-6zm1.8 2.2v2.6h2.4V3.7z"/>',
  'module:jetpack': '<path d="M4 3h6v13H4zM14 3h6v13h-6z"/><path d="M10 6h4v3h-4z"/><path d="M5.2 17h3.6L7 23zM15.2 17h3.6L17 23z"/>',
  'module:magnet': '<path fill-rule="evenodd" d="M3 2h6v10a3 3 0 0 0 6 0V2h6v10a9 9 0 0 1-18 0z"/><path d="M3 2h6v3H3zM15 2h6v3h-6z" opacity=".55"/>',
  'module:dash': '<path d="M10 6h7.5l5 6-5 6H10z"/><path d="M1 7.5h7V9H1zM0 11.2h8v1.6H0zM1 15h7v1.5H1z"/>',
  'module:radar': '<path d="M2 3a13 13 0 0 0 16 16z"/><path d="M9.6 12.4l7.6-7.6 1.6 1.6-7.6 7.6z"/><circle cx="19.5" cy="4.5" r="2"/><path d="M11 18h2v3h-2zM6 21h12v2H6z"/>',
  'module:whirl': '<circle cx="12" cy="12" r="3"/><path d="M12 1.5c5 0 8.5 3.5 8.5 7l-6.5 2zM20 17c-2.5 4.4-7.5 6-11 4.6l3.2-6zM2.2 13.8C1 8.8 3.6 4.4 7 3.2l2 6.5z"/>',
  'module:blades': '<circle cx="12" cy="12" r="2.6"/><path d="M12 .5l2.6 9.3-2.6.9zM23.5 12l-9.3 2.6-.9-2.6zM12 23.5l-2.6-9.3 2.6-.9zM.5 12l9.3-2.6.9 2.6z"/>',
  'module:pods': '<path d="M2 14h20v8H2z"/><path d="M4.5 6L7 2l2.5 4v7h-5zM9.5 6L12 2l2.5 4v7h-5zM14.5 6L17 2l2.5 4v7h-5z"/>',
  'orb:universal': '<circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="9" r="2.2" fill="#fff" opacity=".7"/>',
  'adapter:arm2mod': '<circle cx="5" cy="12" r="3.2"/><path d="M8 10.5h5v3H8z"/><path d="M14 6h8v12h-8z"/>',
  'adapter:mod2arm': '<path d="M2 6h8v12H2z"/><path d="M11 10.5h5v3h-5z"/><circle cx="19" cy="12" r="3.2"/>',
  'gem': '<path d="M6 2.5h12l4.5 6.5L12 22 1.5 9z"/><path d="M1.5 9h21M8.5 2.5L12 9l3.5-6.5M12 9v13" stroke="rgba(0,0,0,.35)" stroke-width="1" fill="none"/>',
};
function partIcon(it, cls = 'picon') {
  if (!it) return '';
  if (it.kind === 'weapon' && WEAPON_ICONS[it.type]) return weaponIcon(it.type);
  if (it.kind === 'gem') return `<svg class="${cls} gemi" viewBox="0 0 24 24" style="color:${ATTRS[it.type].color}" fill="currentColor" aria-hidden="true">${PART_ICONS.gem}</svg>`;
  const p = PART_ICONS[it.kind + ':' + it.type]; if (!p) return '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${p}</svg>`;
}
/* ---------- upgrades ----------
   One place decides whether a part can go up a level and does it: merging duplicates, auto-upgrade, and later the Upgrade Orb all
   go through upgradeItem(). Parts have no experience of their own. */
const upgradeable = it => it && it.kind !== 'orb' && (it.kind === 'gem' || it.kind !== 'block' || (BLOCKS[it.type] && BLOCKS[it.type].upgradable));
/* ceiling for this part: normal parts L5 (adapters get their own lower cap in a later chunk via it.maxLvl) */
const levelCap = it => Math.min(maxLvlOf(it), it && it.maxLvl ? it.maxLvl : 99);
function upgradeCheck(it, by = 1) {
  if (!it || !upgradeable(it)) return { ok: false, reason: 'not upgradeable' };
  if (!(by >= 1)) return { ok: false, reason: 'bad amount' };
  if ((it.lvl || 1) >= levelCap(it)) return { ok: false, reason: 'max level' };
  return { ok: true, from: it.lvl || 1, to: Math.min(levelCap(it), (it.lvl || 1) + by) };
}
/* Raises a part's level (never past its cap). Returns {ok, from, to, reason, added}; changes nothing when refused.
   Gem slots that the new level opens are added; the player's stats are refreshed by the caller via partLeveled(). */
function upgradeItem(it, by = 1) {
  const c = upgradeCheck(it, by); if (!c.ok) return c;
  it.prevLvl = it.lvl || 1; it.lvl = c.to;
  c.added = syncGemSlots(it);
  if (c.added && typeof gemSlotDialog === 'function') gemSlotDialog(it, c.added);
  return c;
}
/* Same kind, same type, same level, below the cap: the rule for merging two parts. */
const sameLevelPair = (a, b) => !!a && !!b && a !== b && a.kind === b.kind && a.type === b.type && (a.lvl || 1) === (b.lvl || 1);
const DEFS = { orb: () => ORBS, adapter: () => ADAPTERS, lower: () => LOWERS, leg: () => LEGS, arm: () => ARMS, weapon: () => WEAPONS, module: () => MODULES, block: () => BLOCKS, gem: () => GEMS };
function itemDef(it) { return DEFS[it.kind]()[it.type]; }
function itemName(it) { return itemDef(it).name + (it.kind === 'gem' ? ' ' + ROMAN[it.lvl || 1] : ''); }
const KIND_LABEL = { orb: 'Upgrade orb', adapter: 'Adapter', lower: 'Lower half', leg: 'Leg', arm: 'Arm', weapon: 'Weapon', module: 'Module', block: 'Block', gem: 'Gem' };
function itemSub(it) {
  if (it.kind === 'orb') return 'Upgrade orb';
  if (it.kind === 'adapter') return 'Adapter';
  if (it.kind === 'gem') return 'Gem';
  if (it.kind === 'lower') return 'Lower half';
  if (it.kind === 'block' && BLOCKS[it.type].upper) return 'Upper half';
  if (it.kind === 'arm') return (ARMS[it.type].auto ? 'Arm · auto-aim' : 'Arm · manual aim');
  if (it.kind === 'block') return BLOCKS[it.type].body ? 'Body' : BLOCKS[it.type].spin ? 'Gear' : BLOCKS[it.type].pack ? 'Pack' : 'Brick';
  return KIND_LABEL[it.kind];
}
/* Which faces of a block have usable sockets, given the face it plugs in with. Index = FACE_ORDER. */
function blockOpenFaces(it) {
  const def = BLOCKS[it.type];
  if (def.upper) return def.sockets.map(() => true);          // V2 torso: every socket is its own slot
  return FACE_ORDER.map(f => f !== it.plug && (def.faces === 'all' || (def.faces === 'out' && f === OPPOSITE[it.plug])));
}
/* Everything plugged into an item (not including the item itself). */
function childrenOf(it) {
  const out = [];
  const walk = x => { if (!x) return; out.push(x); (x.slots || []).forEach(walk); walk(x.weapon); walk(x.weapon2); (x.gems || []).forEach(walk); };
  (it.slots || []).forEach(walk); walk(it.weapon); walk(it.weapon2); (it.gems || []).forEach(walk);
  return out;
}

/* Rows shown in the workbench hover window for any part. */
function partInfo(it) {
  const rows = partInfoBase(it);
  if (it.kind === 'arm' || it.kind === 'leg' || it.kind === 'lower') rows.unshift(['Level', `${it.lvl}/${maxLvlOf(it)}`], ['Gem slots', `${gemSlotsFor(it)}/${it.kind === 'leg' ? 1 : 2}`]);
  if (it.kind === 'lower') rows.unshift(['Gems', armGems(it).length ? armGems(it).map(g => `${ATTRS[g.type].name}`).join(' + ') : it.gems && it.gems.length ? `${it.gems.length} empty` : 'opens at L2']);
  if (it.kind === 'arm') { rows.unshift(['Gems', armGems(it).length ? armGems(it).map(g => ATTRS[g.type].name).join(' + ') : (it.gems && it.gems.length ? `${it.gems.length} empty` : 'opens at L2')]); const ck = armCombo(it); if (ck && COMBOS[ck]) rows.unshift(['Combo', COMBOS[ck][0]]); }
  if (it.kind === 'leg') rows.unshift(['Gem', armGems(it).length ? `${ATTRS[armGems(it)[0].type].name}: ${LEG_GEM[armGems(it)[0].type]}` : it.gems && it.gems.length ? 'empty' : 'opens at L2']);
  return rows;
}
function partInfoBase(it) {
  const d = itemDef(it), L1 = it.lvl - 1;
  if (it.kind === 'orb') return [['Effect', '+1 level'], ['Works on', 'weapons, arms, modules, gems, lowers, adapters'], ['Normal max', 'Lv 5'], ['Adapter max', 'Lv 2']];
  if (it.kind === 'adapter') return [['Plugs into', `${d.from} socket`], ['Holds', `${d.to}s`], ['Sockets', `${it.lvl}/2`], ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'lower') {
    const lg = mkItem('leg', d.legType, 1), Ld = LEGS[d.legType], n = d.mounts.length;
    return [['Legs', `${n} × ${Ld.name.replace(/ Legs?$/, '')}`], ['Health', `+${d.hp}`], ['Run speed', `${(legSpeed(lg) * 2).toFixed(1)} m/s`], ['Jump', `${legJump(lg).toFixed(1)} m`], ['Carries', `${(legCarry(lg) * n).toFixed(1)} t`],
      ['Boost', Ld.rolling ? 'yes' : 'no'], ...(Ld.climb ? [['Steps up', `${Ld.climb} m ledges`]] : []), ['Weight', `${partMass(it).toFixed(2)} t`]];
  }
  if (it.kind === 'block' && d.upper) {
    const arms = d.sockets.filter(s => s.accepts === 'arm').length, mods = d.sockets.length - arms;
    return [['Health', `+${d.hp}`], ['Shield', `+${d.shield}`], ['Arm sockets', arms], ['Module sockets', mods], ['Weight', `${partMass(it).toFixed(2)} t`]];
  }
  if (it.kind === 'block' && d.pack) return [['Storage', `+${d.slots(it.lvl)} slots`], ['Sockets', 1], ['Weight', `${partMass(it).toFixed(2)} t`], ['Upgradable', 'yes']];
  if (it.kind === 'module' && d.whirl) return [['Spin damage', d.dmg(it.lvl).toFixed(0)], ['Radius', `${d.radius(it.lvl).toFixed(1)} m`], ['Timing', 'per weapon cycle'], ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'module' && d.blades) return [['Blades', `${d.n(it.lvl)} per throw`], ['Damage', `${d.dmg(it.lvl).toFixed(1)} per cut`], ['Every', `${d.cd(it.lvl).toFixed(1)} s`], ['Gem slots', `${gemSlotsFor(it)}/2`], ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'module' && d.rate) return [['Volley', `${d.volley(it.lvl)} missiles`], ['Damage', `${d.dmg(it.lvl).toFixed(1)} each`], ['Blast', `${d.radius} m`], ['Fire rate', `${(1 / d.cd(it.lvl)).toFixed(2)} /s`], ['Range', '40 m'], ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'block' && d.spin) return [['Spin', `${(d.spinRate(it.lvl) * 9.55).toFixed(0)} rpm`], ['Sockets', 1], ['Weight', `${partMass(it).toFixed(2)} t`], ['Upgradable', 'yes']];
  if (it.kind === 'weapon') return [...(d.info ? d.info(it.lvl) : []), ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'arm') return [
    ['Aim', d.auto ? 'automatic' : 'manual'],
    ['Fire rate', `×${armRate(it).toFixed(2)}`],
    ['Tracking', `${Math.round(armTurn(it) * 57.3)}°/s`],
    ['Wrist', it.weapon ? `${itemName(it.weapon)} Lv ${it.weapon.lvl}` : 'empty'],
    ...(d.wrists === 2 ? [['Wrist 2', it.weapon2 ? `${itemName(it.weapon2)} Lv ${it.weapon2.lvl}` : 'empty']] : []),
    ['Weight', `${partMass(it).toFixed(2)} t`],
  ];
  if (it.kind === 'leg') return [
    ['Run speed', `${(legSpeed(it) * 2).toFixed(1)} m/s`],
    ['Jump', `${legJump(it).toFixed(1)} m`],
    ['Carries', `${legCarry(it).toFixed(1)} t`],
    ['Sprint', d.rolling ? 'yes (boost)' : 'no'],
    ...(d.climb ? [['Steps up', `${d.climb} m ledges`]] : []),
    ...(d.grip ? [['Grip', 'slippery']] : []),
    ...(d.counts ? [['Counts as', `${d.counts} legs`]] : []),
    ['Weight', `${partMass(it).toFixed(2)} t`],
    ...(d.rolling ? [['Suspension', 'sprung shock']] : []),
  ];
  if (it.kind === 'module' && it.type === 'jetpack') return [['Thrust', `${d.thrust(it.lvl).toFixed(0)} kN`], ['Fuel', `${d.fuel(it.lvl).toFixed(1)} s`], ['Weight', `${partMass(it).toFixed(2)} t`]];
  if (it.kind === 'module') return [['Effect', d.desc]];
  if (it.kind === 'gem') return [['Tier', `${ROMAN[it.lvl || 1]}/${ROMAN[GEM_MAX]}`], ['Arm', ATTRS[it.type].desc], ['Leg', LEG_GEM[it.type]]];
  if (it.kind === 'block') {
    const holes = d.faces === 'all' ? 5 : 1;
    return [['Health', d.hp || 0], ['Shield', d.shield || 0], ['Sockets', holes], ['Weight', `${partMass(it).toFixed(2)} t`], ['Upgradable', 'no']];
  }
  return [];
}

/* ---------- level scaling helpers (shared by the game and the hover window) ---------- */
/* Total level of the legs on the ground unlocks extra jumps (and at 50, a flip on every air jump). */
const AIR_JUMP_AT = [10, 30, 60, 100, 150];
const FLIP_AT = 50;
const airJumpsFor = total => AIR_JUMP_AT.filter(t => total >= t).length;
function legSpeed(l) { return LEGS[l.type].speed * (1 + 0.5 * lvlCurve(effLvl(l))); }
function legJump(l) { return LEGS[l.type].jump + 1.6 * lvlCurve(effLvl(l)); }
function legCarry(l) { return (LEGS[l.type].carry || 2) * (1 + 1.0 * lvlCurve(effLvl(l))); }
/* Arms: each level adds +5% damage, +2.5% fire rate and +8% turn speed (L5 = +20% / +10% / +32%) */
const armDmgMul = a => 1 + 0.05 * (markFor('arm', a.lvl) - 1);
function armRate(a) { const A = ARMS[a.type]; return A.rate * (1 + 0.025 * (markFor('arm', a.lvl) - 1)); }
function armTurn(a) { const A = ARMS[a.type]; return (A.turn || 20) * (1 + 0.08 * (markFor('arm', a.lvl) - 1)); }
/* Twin Arm: both guns fire at once and the pair spreads (half-angle in degrees, by level; never reaches zero).
   Sentry Arm: how far off-target its barrel may be and still fire, and the same tolerance spreads its shots a little (never perfect). */
const TWIN_SPREAD_DEG = [0, 9, 8, 7, 6, 5];
const SENTRY_TOL_DEG = [0, 22, 18, 15, 12, 9];
/* Level-up XP: stages are 10 minutes now (was 15), so each level costs 1.6x to keep level-ups near 75% of the old count */
const XP_K = 1.6;
const xpNeed = lvl => Math.floor((5 + lvl * 3.2 + lvl * lvl * 0.35) * XP_K);

/* Lower halves: hull and shield grow with level (L5 = x1.7 hull, x2.8 shield); wheels get faster, spiders climb longer */
const LOWER_HP = [0, 1, 1.16, 1.32, 1.5, 1.7], LOWER_SH = [0, 1, 1.4, 1.8, 2.2, 2.8];
const lowerHp = it => (LOWERS[it.type].hp || 0) * LOWER_HP[markFor('lower', it.lvl)];
const lowerShield = it => (LOWERS[it.type].shield || 0) * LOWER_SH[markFor('lower', it.lvl)];
const lowerPerk = (it, kind) => 1 + (kind === 'wheels' ? 0.025 : kind === 'spider' ? 0.0625 : 0) * (markFor('lower', it.lvl) - 1) * (it.type === kind ? 1 : 0);
/* Weight in tonnes: higher levels are a little heavier. */
function partMass(it) { const d = itemDef(it); return (d.mass ?? 0.3) * (it.kind === 'block' ? 1 : 1 + 0.25 * lvlCurve(sLv(it.lvl))); }

/* ---------- level scaling ----------
   Every stat formula above is written as f(lvl) on the old 1..100 scale. This wraps them once, so callers keep passing the real
   part level (1..5) and the formula sees LEGACY_LV[level]. Only one-argument "lvl =>" functions are wrapped. */
(function wrapLevelStats() {
  const wrapAll = tbl => {
    for (const d of Object.values(tbl)) for (const k of Object.keys(d)) {
      const f = d[k];
      if (typeof f !== 'function' || f.length !== 1 || k === 'gemSlots' || f._lv5) continue;
      if (!/^\(?\s*lvl\s*\)?\s*=>|^\w*\(\s*lvl\s*\)\s*\{/.test(Function.prototype.toString.call(f))) continue;
      const w = function (lvl) { return f.call(this, sLv(lvl)); }; w._lv5 = true; d[k] = w;
    }
  };
  wrapAll(WEAPONS); wrapAll(MODULES); wrapAll(BLOCKS);
})();
