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
  const got = healPlayer(Math.min(room, dealt * LS_PCT[lv] / 100));
  L.amt += got;
}
/* Poison: add one stack. base = the applying hit's original damage. */
function poisonHit(e, base, lvl) {
  if (e.dead || e.d.npc || !(base > 0)) return;
  const lv = Math.max(1, Math.min(5, lvl | 0)), dps = base * POIS_PCT[lv] / 100, max = e.boss ? POIS_BOSS[lv] : POIS_MAX[lv];
  const P = e.pois || (e.pois = { st: [], t: 0, acc: 0 });
  if (P.st.length < max) P.st.push(dps);
  else { let mi = 0; for (let i = 1; i < P.st.length; i++) if (P.st[i] < P.st[mi]) mi = i; if (dps > P.st[mi]) P.st[mi] = dps; }   // full: the weakest stack makes way
  P.t = POIS_TIME;                                                  // every hit refreshes the timer
}
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
  for (const t of LOWER.patches) { scene.remove(t.m); t.m.material.dispose(); }
  LOWER.patches.length = 0; LOWER.ls.anchor = null; LOWER.ls.stored = 0; LOWER.ls.last = -9; LOWER.ps.anchor = null;
}
