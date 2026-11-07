'use strict';
/* ============================================================
   LIFESTEAL and POISON gems (Chunk 09), levels 1-5. The original eight gems are untouched.
   ARM gems act on direct shot hits (shotAttrHit):
     Lifesteal  heals LS_PCT[lvl]% of the damage actually dealt (overkill excluded) up to a shared per-ARM cap of LS_CAP[lvl] HP per second;
                never overheals; poison ticks and burn do not heal (they bypass damage()); no recursion.
     Poison     each hit adds a stack worth POIS_PCT[lvl]% of the hit's original damage per second. Max stacks POIS_MAX[lvl]
                (bosses POIS_BOSS[lvl]), 4 s duration refreshed by every hit, 4 ticks per second. Ticks never apply poison.
   LOWER-HALF gems act on movement (lowerGemTick):
     Lifesteal  LS_CAP[lvl] HP per 20 m of genuine travel, only with an enemy within 12 m, at most one heal per 2 s,
                stored distance capped at 40 m. Distance only counts when you move 5 m away from an anchor point, so
                wobbling in place, pausing or teleporting earns nothing.
     Poison     a patch every 3 m of travel (same anchor rule), 3 s life, max 12; each patch poisons an enemy at most once a second.
   ============================================================ */
const LS_PCT = [0, 1, 1.5, 2, 2.5, 3];          // percent of damage dealt healed
const LS_CAP = [0, 1, 1.5, 2, 2.5, 3];          // HP per second per arm / HP per heal for a lower half
const POIS_PCT = [0, 2, 3, 4, 5, 6];            // percent of the hit's damage, per stack, per second
const POIS_MAX = [0, 3, 4, 5, 6, 7], POIS_BOSS = [0, 2, 2, 3, 3, 4];
const POIS_TIME = 4, POIS_TICK = 0.25;
const POIS_COLOR = 0x58d62a;

function healPlayer(n) {
  if (!(n > 0) || !stats) return 0;
  const before = player.hp; player.hp = Math.min(stats.maxHp, player.hp + n);
  const got = player.hp - before; if (got > 0 && S.st) S.st.healedLS = (S.st.healedLS || 0) + got;
  return got;
}
/* arm Lifesteal: s.arm is the arm that fired the shot, dealt is the real damage (no overkill) */
function lifestealHit(s, dealt, lvl) {
  const arm = s.arm; if (!arm || !(dealt > 0) || S.mode !== 'play') return;
  const lv = Math.max(1, Math.min(5, lvl | 0)), L = arm.ls || (arm.ls = { t: -9, amt: 0 });
  if (S.t - L.t >= 1) { L.t = S.t; L.amt = 0; }                    // a fresh one-second window shared by every shot of this arm
  const room = LS_CAP[lv] - L.amt; if (room <= 0) return;
  const want = Math.min(room, dealt * LS_PCT[lv] / 100), hp0 = player.hp, got = healPlayer(want);
  const bank = s.attrs && s.attrs.combo === 'lifesteal+lifesteal';
  if (bank) {                                                      // Blood Bank: what would overheal becomes a small temporary shield (capped)
    const over = want - got; if (over > 0) { BANK.amt = Math.min(10 + 5 * lv, BANK.amt + over); BANK.t = 8; }
    L.amt += want;                                                 // the overheal counts towards the arm cap too
  } else L.amt += got;
  if (got > 0 && s.attrs && s.attrs.combo === 'ice+lifesteal' && hp0 < stats.maxHp * 0.5 && S.t >= (S.cryoCd || 0)) {   // Cryostasis: healing while below half HP -> brief resistance, 12 s cooldown
    S.cryoT = 2; S.cryoCd = S.t + 12; ring(new THREE.Vector3(player.pos.x, player.pos.y + 0.3, player.pos.z), 3, 0.4, 0xbfe9ff);
  }
}
/* Poison: add one stack worth `dps`. opt: dur (seconds), gen (spread generation), sup (Superstrain: spreads when it kills). */
function poisonAdd(e, dps, lv, opt) {
  if (e.dead || e.d.npc || !(dps > 0)) return;
  lv = Math.max(1, Math.min(5, lv | 0)); const max = e.boss ? POIS_BOSS[lv] : POIS_MAX[lv] + (opt && opt.sup ? 1 : 0);
  const P = e.pois || (e.pois = { st: [], t: 0, acc: 0, gen: 0, lv, sup: false });
  if (P.st.length < max) P.st.push(dps);
  else { let mi = 0; for (let i = 1; i < P.st.length; i++) if (P.st[i] < P.st[mi]) mi = i; if (dps > P.st[mi]) P.st[mi] = dps; }   // full: the weakest stack makes way
  P.lv = Math.max(P.lv, lv); P.t = Math.max(P.t, (opt && opt.dur) || POIS_TIME);                // every hit refreshes the timer
  if (opt && opt.gen !== undefined) P.gen = Math.max(P.gen, opt.gen);
  if (opt && opt.sup) P.sup = true;
}
/* base = the applying hit's original damage */
function poisonHit(e, base, lvl, opt) { const lv = Math.max(1, Math.min(5, lvl | 0)); poisonAdd(e, base * POIS_PCT[lv] / 100, lv, opt); }
function poisonTick(e, dt) {
  const P = e.pois; if (!P) return;
  P.t -= dt;
  if (P.t <= 0) { e.pois = null; return; }
  P.acc += dt;
  while (P.acc >= POIS_TICK && e.pois) {
    P.acc -= POIS_TICK;
    let sum = 0; for (const d of P.st) sum += d;
    e.hp -= sum * POIS_TICK;                                        // direct loss: not damage(), so no lifesteal, no gem procs, no recursion
    if (Math.random() < 0.35) spark(ecenter(e).clone().add(new THREE.Vector3(rand(-.4, .4), rand(0, .7), rand(-.4, .4))), POIS_COLOR);
    if (e.hp <= 0) { killEnemy(e); return; }
  }
}

/* ---------------- lower half gems ---------------- */
const LOWER = { ls: { anchor: null, stored: 0, last: -9, scan: 0, near: false }, ps: { anchor: null }, patches: [] };
const patchGeo = new THREE.CircleGeometry(1, 10); patchGeo.rotateX(-Math.PI / 2);
const MAX_PATCHES = 12, PATCH_LIFE = 3, PATCH_STEP = 3, PATCH_R = 1.5;
function travelCredit(A, step) {                                    // metres of genuine travel since the last credit, anchor-based
  const P = player;
  if (!A.anchor) { A.anchor = { x: P.pos.x, z: P.pos.z }; return 0; }
  const d = Math.hypot(P.pos.x - A.anchor.x, P.pos.z - A.anchor.z);
  if (d > 40) { A.anchor = { x: P.pos.x, z: P.pos.z }; return 0; }     // a teleport / respawn: no credit
  if (d < step) return 0;
  A.anchor = { x: P.pos.x, z: P.pos.z }; return d;
}
function lowerGemTick(dt) {
  if (!stats || S.mode !== 'play' || S.test) return;
  const P = player;
  if (legHas('lifesteal')) {
    const lv = legT('lifesteal'), A = LOWER.ls;
    A.scan -= dt; if (A.scan <= 0) { A.scan = 0.3; A.near = false; for (const e of enemies) { if (e.dead || e.d.npc) continue; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; if (dx * dx + dz * dz < 144) { A.near = true; break; } } }
    const d = travelCredit(A, 5); if (d) A.stored = Math.min(40, A.stored + d);
    if (A.stored >= 20 && A.near && S.t - A.last >= 2) { A.stored -= 20; A.last = S.t; if (healPlayer(LS_CAP[Math.max(1, Math.min(5, lv))]) > 0) { sfx('coin', 0.15); spark(new THREE.Vector3(P.pos.x, P.pos.y + 1.4, P.pos.z), 0xd6204a); } }
  } else { LOWER.ls.anchor = null; }
  if (legHas('poison') && P.onGround) {
    const lv = legT('poison'), A = LOWER.ps;
    if (travelCredit(A, PATCH_STEP)) addPatch(P.pos.x, P.pos.z, lv);
  } else { LOWER.ps.anchor = null; }
  for (let i = LOWER.patches.length - 1; i >= 0; i--) {
    const t = LOWER.patches[i]; t.life -= dt;
    t.m.material.opacity = 0.55 * clamp(t.life / 0.8, 0, 1);
    t.cd -= dt;
    if (t.cd <= 0 && t.life > 0) {                                 // contact is checked 3 times a second, not every frame
      t.cd = 0.33;
      const base = 100 * scalingBase().hp;
      for (const e of enemies) {
        if (e.dead || e.d.npc || (e.patchCd || 0) > S.t) continue;
        if (Math.abs(e.pos.y - t.y) > 1.5) continue;
        const dx = e.pos.x - t.x, dz = e.pos.z - t.z; if (dx * dx + dz * dz > (PATCH_R + e.r) ** 2) continue;
        e.patchCd = S.t + 1; poisonHit(e, base, t.lv);
      }
    }
    if (t.life <= 0) { scene.remove(t.m); t.m.material.dispose(); LOWER.patches.splice(i, 1); }
  }
}
function addPatch(x, z, lv) {
  const m = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({ color: POIS_COLOR, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const y = groundAt(x, z) + 0.04; m.position.set(x, y, z); m.scale.setScalar(PATCH_R); scene.add(m);
  LOWER.patches.push({ m, x, z, y, lv, life: PATCH_LIFE, cd: 0 });
  while (LOWER.patches.length > MAX_PATCHES) { const o = LOWER.patches.shift(); scene.remove(o.m); o.m.material.dispose(); }
}
function clearGemFx() {
  S.cryoT = 0; S.cryoCd = 0; BANK.amt = 0; VOLS.clear(); for (const k in PROCS) delete PROCS[k]; HEAL_POOL.t = -9;
  for (const t of LOWER.patches) { scene.remove(t.m); t.m.material.dispose(); }
  LOWER.patches.length = 0; LOWER.ls.anchor = null; LOWER.ls.stored = 0; LOWER.ls.last = -9; LOWER.ps.anchor = null;
}

/* ============================================================
   COMBOS with Lifesteal and Poison (Chunk 10). Every proc is bounded:
     - heals from combos share one pool (COMBO_HEAL_CAP HP per second) on top of the arm cap;
     - pulses, blasts and spreads are limited per second by procOK();
     - poison spread only goes one generation deep (copies carry gen 1 and never spread again);
     - combos live in ONE arm (two gems); lower-half gems keep their own movement meaning.
   ============================================================ */
const COMBO_HEAL_CAP = 6;
const PROCS = {};
function procOK(key, perSec) { const P = PROCS[key] || (PROCS[key] = { t: -9, n: 0 }); if (S.t - P.t >= 1) { P.t = S.t; P.n = 0; } if (P.n >= perSec) return false; P.n++; return true; }
function comboLv(key, gem) { const m = stats && stats.combos && stats.combos.get(key); return m ? (m.get(gem) || 1) : 0; }     // level of `gem` in an equipped arm with this combo, 0 if none
let HEAL_POOL = { t: -9, amt: 0 };
function comboHeal(n) {
  if (!(n > 0) || S.mode !== 'play') return 0;
  if (S.t - HEAL_POOL.t >= 1) { HEAL_POOL.t = S.t; HEAL_POOL.amt = 0; }
  const room = COMBO_HEAL_CAP - HEAL_POOL.amt; if (room <= 0) return 0;
  const want = Math.min(room, n), got = healPlayer(want); HEAL_POOL.amt += got; return got;
}
function pulseFx(color) { const p = new THREE.Vector3(player.pos.x, player.pos.y + 0.3, player.pos.z); ring(p, 3.2, 0.35, color); }
function poisonSpread(from, n, range, take, potency, tag) {
  const P = from.pois; if (!P || P.gen >= 1) return 0;                      // copies never spread again: no chains
  const stacks = P.st.slice().sort((a, b) => b - a).slice(0, take), done = new Set([from]); let c = 0;
  for (let i = 0; i < n; i++) {
    const t = nearestEnemy(ecenter(from).clone(), range, done); if (!t) break; done.add(t);
    for (const d of stacks) poisonAdd(t, d * potency, P.lv, { gen: 1, dur: P.t > 0 ? Math.min(P.t, POIS_TIME) : POIS_TIME, sup: false });
    if (t.pois) spark(ecenter(t).clone(), POIS_COLOR); c++;
  }
  return c;
}
/* called from shotAttrHit for every direct hit. dealt = damage that really landed. */
function comboHit(s, e, dealt, cb, T) {
  const ls = T('lifesteal'), po = T('poison');
  switch (cb) {
    case 'bounce+lifesteal':                                        // Bloodshot: hitting a NEW enemy after a bounce heals
      if ((s.nb || 0) > 0 && dealt > 0 && procOK('bloodshot', 4)) comboHeal(LS_CAP[ls] * 0.6); break;
    case 'homing+lifesteal':                                        // Bloodhound: the homed target hurts a little, killing it heals
      if (s.homing && e === s.target && procOK('bloodhound', 6)) comboHeal(e.dead ? LS_CAP[ls] * 1.0 : LS_CAP[ls] * 0.25); break;
    case 'lifesteal+orbit':                                         // Vampiric Halo: orbiters siphon
      if (s.orbit && dealt > 0 && procOK('halo', 5)) comboHeal(LS_CAP[ls] * 0.25); break;
    case 'lifesteal+split': {                                       // Leech Swarm: each DISTINCT enemy a volley's shots reach heals
      if (!s.vol) break; let v = VOLS.get(s.vol); if (!v) { v = new Set(); VOLS.set(s.vol, v); if (VOLS.size > 24) VOLS.delete(VOLS.keys().next().value); }
      if (!v.has(e)) { v.add(e); if (v.size >= 2 && procOK('leech', 5)) comboHeal(LS_CAP[ls] * 0.4); } break; }
    case 'bounce+poison': s.lastE = e; break;                        // Contagion: remember who it just hit
    case 'poison+split':                                            // Viral Spread: a heavily poisoned hit sends a weaker stack to a neighbour
      if (e.pois && e.pois.st.length >= 2 && procOK('viral', 8)) { const n = nearestEnemy(ecenter(e).clone(), 6, new Set([e])); if (n) poisonHit(n, s.dmg * 0.5, po, { gen: 1 }); } break;
    case 'lightning+poison': neuro(e, s, po); break;
    case 'fire+poison':                                             // Toxic Combustion: heavily poisoned AND burning -> one poisonous blast
      if (e.pois && e.pois.st.length >= 3 && e.burnT > 0 && !e.toxBlast && procOK('combust', 4)) {
        e.toxBlast = true; const c = ecenter(e).clone(); blast(c, 3, POIS_COLOR); ring(new THREE.Vector3(c.x, groundAt(c.x, c.z), c.z), 3.4, 0.35, POIS_COLOR);
        let n = 0; for (const o of enemies) { if (o.dead || o === e || o.d.npc || n >= 12) continue; if (ecenter(o).distanceToSquared(c) < 9 + o.r * o.r) { poisonHit(o, s.dmg * 0.6, po, { gen: 1 }); n++; } }
        damage(e, s.dmg * 0.4, s.manual); sfx('pop2', 0.3);
      } break;
    case 'ice+poison':                                              // Septic Frost: slow grows with stacks, capped (bosses less)
      if (e.pois) { const st = e.pois.st.length, floor = e.boss ? 0.75 : 0.45; e.chillT = Math.max(e.chillT || 0, 3); e.chillMul = Math.min(e.chillMul || 1, Math.max(floor, 1 - 0.1 * st)); } break;
    case 'poison+poison': if (e.pois) { e.pois.t = Math.max(e.pois.t, POIS_TIME * 1.75); e.pois.sup = true; } break;   // Superstrain: longer poison
  }
}
const VOLS = new Map();
/* Neurotoxin: lightning staggers a heavily infected enemy (not bosses), once per 2 s per enemy */
function neuro(e, s, po) {
  if (e.pois && e.pois.st.length >= 3 && !e.boss && (e.neuroCd || 0) < S.t && procOK('neuro', 8)) { e.neuroCd = S.t + 2; e.stun = Math.max(e.stun, 0.6); e.vel.x *= 0.2; e.vel.z *= 0.2; spark(aimPt(e), 0x9fff7a); }
}
/* one lightning chain jump (n = the enemy it reached, dealt = what landed) */
function comboJump(s, n, dealt, cb, T) {
  if (cb === 'lifesteal+lightning') lifestealHit(s, dealt, T('lifesteal'));          // Life Conduit: each jump siphons, inside the arm's normal cap
  if (cb === 'lightning+poison') { poisonHit(n, s.dmg * 0.5, T('poison'), { gen: 1 }); neuro(n, s, T('poison')); }
}
/* each time a combo shot bounces off the ground */
function comboBounceGem(s) {
  const cb = s.combo;
  if (cb === 'bounce+lifesteal') s.nb = (s.nb || 0) + 1;
  if (cb === 'bounce+poison' && s.lastE && s.lastE.pois && !s.lastE.dead && procOK('contagion', 6)) {   // Contagion: carry the stacks to a fresh enemy
    const n = nearestEnemy(s.pos, 8, new Set([s.lastE]));
    if (n && s.lastE.pois) { const from = s.lastE.pois, stacks = from.st.slice().sort((a, b) => b - a).slice(0, 2); for (const d of stacks) poisonAdd(n, d, from.lv, { gen: 1 }); spark(aimPt(n), POIS_COLOR); }
  }
}
/* per frame for combo shots */
function comboTickGem(s, dt) {
  const cb = s.combo;
  if (cb === 'homing+poison' && s.homing) {                                          // Patient Zero: shots swing onto an infected enemy
    s.pzT = (s.pzT || 0) - dt;
    if (s.pzT <= 0 && (!s.target || !s.target.pois)) {
      s.pzT = 0.3; let best = null, bd = 14 * 14;
      for (const e of enemies) { if (e.dead || !e.pois || e.d.npc) continue; const d = aimPtT(e).distanceToSquared(s.pos); if (d < bd) { bd = d; best = e; } }
      if (best) s.target = best;
    }
  }
  if (cb === 'orbit+poison' && s.orbit) {                                            // Toxic Halo: the ring poisons whatever it passes
    s.toxT = (s.toxT || 0) - dt;
    if (s.toxT <= 0) {
      s.toxT = 0.4; const po = (s.attrs && s.attrs.get && s.attrs.get('poison')) || 1;
      for (const e of enemies) { if (e.dead || e.d.npc || (e.haloCd || 0) > S.t) continue; if (aimPtT(e).distanceToSquared(s.pos) < (1.3 + e.r) ** 2) { e.haloCd = S.t + 0.5; poisonHit(e, s.dmg * 0.5, po, { gen: 1 }); } }
    }
  }
}
/* explosions made by a combo shot: k0 = S.kills before the blast, list = poisoned enemies in range before it */
function comboBoomGem(s, p, r, k0, list) {
  const cb = s.attrs && s.attrs.combo; if (!cb) return;
  const kills = S.kills - k0, T = k => (s.attrs.get && s.attrs.get(k)) || 0;
  if (cb === 'explode+lifesteal' && kills > 0 && procOK('bburst', 3)) { comboHeal(Math.min(5, kills) * LS_CAP[T('lifesteal')] * 0.35); pulseFx(0xd6204a); }   // Blood Burst: a healing pulse when a blast kills
  if (cb === 'explode+poison' && list) {                                             // Toxic Burst: enemies the blast killed spill their poison onto neighbours
    for (const e of list) if (e.dead && e.pois && procOK('tburst', 10)) poisonSpread(e, 3, r + 3, 2, 0.8);
    for (const e of enemies) if (!e.dead && !e.d.npc && ecenter(e).distanceTo(p) < r + e.r) poisonHit(e, s.dmg * 0.4, T('poison'), { gen: 1 });
  }
}
const poisonedNear = (p, r) => enemies.filter(e => !e.dead && e.pois && ecenter(e).distanceTo(p) < r + e.r + 1);
/* any enemy dying (called from killEnemy) */
function gemKill(e) {
  if (!stats || !stats.combos || !stats.combos.size) return;
  if (e.burnT > 0 && comboLv('fire+lifesteal', 'lifesteal') && procOK('furnace', 3)) { comboHeal(LS_CAP[comboLv('fire+lifesteal', 'lifesteal')] * 0.8); pulseFx(0xff5a2a); }     // Blood Furnace
  if (e.pois) {
    const st = e.pois.st.length;
    const pz = comboLv('homing+poison', 'poison'); if (pz && procOK('pzero', 4)) poisonSpread(e, 2, 6, 2, 1);               // Patient Zero: infected kills spread
    const ss = comboLv('poison+poison', 'poison'); if (ss && e.pois.sup && procOK('super', 3)) poisonSpread(e, 1, 5, 2, 0.8);  // Superstrain: limited kill spread
    const pi = comboLv('lifesteal+poison', 'lifesteal'); if (pi && procOK('parasite', 4)) comboHeal(Math.min(LS_CAP[pi] * 2, st * LS_CAP[pi] * 0.4));   // Parasitic Infection: heals by stacks, capped
  }
}
/* damage the player takes: Cryostasis resistance, Blood Bank shield */
function comboHurt(a) {
  if ((S.cryoT || 0) > 0) a *= 0.7;
  if (BANK.amt > 0) { const ab = Math.min(BANK.amt, a); BANK.amt -= ab; a -= ab; }
  return a;
}
const BANK = { amt: 0, t: 0 };
function gemComboTick(dt) {
  if ((S.cryoT || 0) > 0) S.cryoT -= dt;
  if (BANK.amt > 0) { BANK.t -= dt; if (BANK.t <= 0) BANK.amt = 0; }
}
