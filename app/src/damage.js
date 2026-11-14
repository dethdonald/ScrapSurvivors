'use strict';
/* ============================================================
   BATTLE DAMAGE: what taking a hit does to the frame you are looking at.
     · every hit throws sparks and shrapnel off the side it came from
     · the shield breaking is its own event: blue shards, a ring and a lower, louder crack
     · plates tear loose at 65%, 40% and 20% health and tumble away; they are bolted back on, with a spark
       and a clunk, the moment health climbs back above the line they came off at
     · the worse the damage, the more the frame spits sparks and trails smoke on its own
     · the lens the camera sees through cracks, kept deliberately faint and away from the middle of the view
   All of it is decoration: nothing here changes health, hitboxes or anything else the game simulates.
   ============================================================ */
const BDMG = {
  forModel: null,          // the model these parts belong to (the whole lot resets when the frame is rebuilt)
  cand: [],                // plates that may be torn off, worst-case first
  off: [],                 // the ones currently missing: { obj, step }
  loose: [],               // the pieces tumbling through the air
  sparkT: 0, smokeT: 0,
  lastShield: 0, lastHp: 1,
  lens: null, lensN: 0, lensShown: 0, lensA: 0,
};
const BDMG_STEPS = [0.65, 0.4, 0.2];        // health fractions where a plate comes away

/* ---------- which bits of the frame can be knocked off ----------
   Only small panels off the body blocks: never an arm, a gun, a leg or anything that would change what the
   frame can do, and never a cosmetic (the hat stays on). */
const _bdBox = new THREE.Box3(), _bdV = new THREE.Vector3(), _bdQ = new THREE.Quaternion();
function dmgScan(m) {
  BDMG.forModel = m; BDMG.cand = []; BDMG.off = [];
  if (!m) return;
  const skip = new Set();
  for (const it of (m.userData.parts || [])) {
    if (it.kind === 'arm' || it.kind === 'weapon' || it.kind === 'lower' || it.kind === 'leg' || it.kind === 'module' || it.kind === 'adapter') {
      const g = m.userData.partOf && m.userData.partOf.get(it); if (g) g.traverse(o => skip.add(o));
    }
  }
  m.updateMatrixWorld(true);
  m.traverse(o => {
    if (!o.isMesh || skip.has(o) || o.isInstancedMesh || !o.visible) return;
    let p = o; while (p) { if (p.userData && (p.userData.cosmetic || p.userData.jet || p.userData.muzzle)) return; p = p.parent; }
    if (Array.isArray(o.material) || !o.geometry) return;
    _bdBox.setFromObject(o); const s = _bdBox.getSize(_bdV);
    const big = Math.max(s.x, s.y, s.z), small = Math.min(s.x, s.y, s.z);
    if (big < 0.12 || big > 0.75 || small > 0.4) return;        // panel-sized: not a speck, not the whole chest
    BDMG.cand.push(o);
  });
  // a stable shuffle so the same frame always sheds the same plates in the same order
  BDMG.cand.sort((a, b) => (a.id * 2654435761 % 1000) - (b.id * 2654435761 % 1000));
  BDMG.cand.length = Math.min(BDMG.cand.length, BDMG_STEPS.length);
}

/* ---------- a plate tears off ---------- */
function dmgShed(step) {
  const obj = BDMG.cand[step]; if (!obj || !obj.visible) return;
  obj.updateMatrixWorld(true);
  const w = obj.getWorldPosition(new THREE.Vector3()), q = obj.getWorldQuaternion(new THREE.Quaternion());
  obj.visible = false;
  BDMG.off.push({ obj, step });
  // the piece itself, now loose in the world
  const piece = new THREE.Mesh(obj.geometry, obj.material);
  piece.position.copy(w); piece.quaternion.copy(q); piece.scale.copy(obj.getWorldScale(new THREE.Vector3()));
  piece.castShadow = false; piece.userData.noShadow = true;
  scene.add(piece);
  const away = new THREE.Vector3(w.x - player.pos.x, 0, w.z - player.pos.z);
  if (away.lengthSq() < 1e-4) away.set(rand(-1, 1), 0, rand(-1, 1));
  away.normalize();
  BDMG.loose.push({ m: piece, v: new THREE.Vector3(away.x * rand(3, 6), rand(4, 7), away.z * rand(3, 6)),
    w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), life: 4.5 });
  spark(w, 0xffb24a); burst(w, 0x8a8a86, 6);
  sfx('bonk', 0.5); sfx('tink', 0.4);
  cam.shake = Math.max(cam.shake || 0, 0.3);
}
/* ---------- and goes back on when the repair takes ---------- */
function dmgRefit(rec) {
  if (!rec.obj) return;
  rec.obj.visible = true;
  const w = rec.obj.getWorldPosition(new THREE.Vector3());
  spark(w, 0x9adfff); sfx('snapZ', 0.45); sfx('tink', 0.35);
}

/* ---------- a hit lands ---------- */
function dmgHit(amount, from, shieldHit) {
  const m = player.model; if (!m || !S.inRun) return;
  const p = player.renderPos || player.pos;
  const dir = from ? new THREE.Vector3(from.x - p.x, 0, from.z - p.z) : new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1));
  if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
  dir.normalize();
  // the point on the frame facing whatever hit it
  const hp0 = new THREE.Vector3(p.x + dir.x * 0.75, p.y + 1.25 + rand(-0.3, 0.45), p.z + dir.z * 0.75);
  const n = Math.round(clamp(3 + amount * 0.35, 3, 14));
  for (let i = 0; i < n; i++) spark(hp0, i % 3 === 0 ? 0xffe6a0 : 0xffb24a);
  burst(hp0, shieldHit ? 0x6fa6ff : 0x6a6f74, Math.round(clamp(2 + amount * 0.2, 2, 9)));
  if (!shieldHit && amount > 6) smokePuff(hp0, 0.5);
}

/* ---------- the shield goes ---------- */
function dmgShieldBreak() {
  const p = player.renderPos || player.pos, c = new THREE.Vector3(p.x, p.y + 1.3, p.z);
  ring(c, 3.4, 0.45, 0x6fa6ff); ring(c, 2.2, 0.3, 0xbfe0ff);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.5, 1.1);
    const o = new THREE.Vector3(c.x + Math.cos(a) * r, c.y + rand(-0.9, 1.1), c.z + Math.sin(a) * r);
    spark(o, 0x6fa6ff);
  }
  burst(c, 0x9adfff, 14);
  sfx('snapZ', 0.8); sfx('bonk', 0.7); sfx('hitH', 0.5);
  cam.shake = Math.max(cam.shake || 0, 0.45);
  const v = $('#vignette');
  if (v) { v.style.boxShadow = 'inset 0 0 150px 46px rgba(111,166,255,.5)'; setTimeout(() => { v.style.boxShadow = 'inset 0 0 120px 30px rgba(226,70,92,0)'; }, 160); }
}

/* ---------- the cracked lens ----------
   Cracks start at the edges and corners and run inward, stopping well short of the middle: the part of the
   screen you are actually aiming through is never drawn over. Faint, and it clears as you are repaired. */
function dmgLensInit() {
  if (BDMG.lens && BDMG.lens.w === innerWidth && BDMG.lens.h === innerHeight) return BDMG.lens;
  let cv = document.getElementById('lensCracks');
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'lensCracks';
    cv.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity .5s';
    (document.getElementById('hud') || document.body).appendChild(cv);     // inside the HUD, so menus cover it and it goes away with the HUD
  }
  const W = innerWidth, Hh = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  BDMG.lens = { cv, ctx, w: W, h: Hh, drawn: 0 };
  BDMG.lensShown = 0;
  return BDMG.lens;
}
/* one more crack cluster, grown from a random edge */
function dmgLensDraw(level) {
  const L = dmgLensInit(), { ctx, w: W, h: Hh } = L;
  const cx = W / 2, cy = Hh / 2, keep = Math.min(W, Hh) * 0.3;      // the clear middle
  const corners = [[0, 0], [W, 0], [0, Hh], [W, Hh], [0, Hh * 0.5], [W, Hh * 0.5]];
  const [sx, sy] = corners[(level * 2 + 1) % corners.length];
  const toC = Math.atan2(cy - sy, cx - sx);
  ctx.lineCap = 'round';
  const branch = (x, y, ang, len, depth) => {
    if (depth > 3 || len < 12) return;
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    if (Math.hypot(nx - cx, ny - cy) < keep) return;                 // never into the middle of the view
    ctx.strokeStyle = 'rgba(12,16,20,0.85)'; ctx.lineWidth = Math.max(0.8, 2.4 - depth * 0.6);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    ctx.strokeStyle = 'rgba(210,230,245,0.5)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(nx + 1, ny + 1); ctx.stroke();
    branch(nx, ny, ang + rand(-0.5, 0.5), len * rand(0.55, 0.8), depth + 1);
    if (Math.random() < 0.7) branch(nx, ny, ang + rand(-1.1, 1.1), len * rand(0.35, 0.6), depth + 1);
  };
  for (let i = 0; i < 3; i++) branch(sx, sy, toC + rand(-0.6, 0.6), Math.min(W, Hh) * rand(0.1, 0.17), 0);
  L.drawn = level + 1;
}
function dmgLens(frac) {
  // one crack per plate lost, so the view and the frame tell the same story
  const want = BDMG_STEPS.filter(s => frac < s).length;
  if (want > BDMG.lensShown) { for (let i = BDMG.lensShown; i < want; i++) dmgLensDraw(i); BDMG.lensShown = want; }
  else if (want < BDMG.lensShown) {
    const L = dmgLensInit(); L.ctx.clearRect(0, 0, L.w, L.h); BDMG.lensShown = 0;
    for (let i = 0; i < want; i++) dmgLensDraw(i);
    BDMG.lensShown = want;
  }
  const L = BDMG.lens; if (!L) return;
  const a = want ? 0.22 + 0.07 * (want - 1) : 0;      // deliberately faint: you should notice it without it being in the way
  if (Math.abs(a - BDMG.lensA) > 0.01) { BDMG.lensA = a; L.cv.style.opacity = a.toFixed(2); }
}
function dmgLensClear() {
  const L = BDMG.lens; if (!L) return;
  L.ctx.clearRect(0, 0, L.w, L.h); L.cv.style.opacity = 0; BDMG.lensShown = 0; BDMG.lensA = 0;
}

/* ---------- every frame ---------- */
function dmgTick(dt) {
  if (!S.inRun) { if (BDMG.lensShown) dmgLensClear(); return; }
  const m = player.model;
  if (m !== BDMG.forModel) { BDMG.loose.forEach(l => scene.remove(l.m)); BDMG.loose = []; dmgScan(m); }
  const maxHp = Math.max(1, stats.maxHp || 1), frac = clamp(player.hp / maxHp, 0, 1);

  // plates off and plates back on
  for (let i = 0; i < BDMG_STEPS.length; i++) {
    const lost = BDMG.off.some(o => o.step === i);
    if (!lost && frac < BDMG_STEPS[i]) dmgShed(i);
    else if (lost && frac > BDMG_STEPS[i] + 0.06) {                   // a little headroom, so it can't flicker on the line
      const k = BDMG.off.findIndex(o => o.step === i);
      if (k >= 0) { dmgRefit(BDMG.off[k]); BDMG.off.splice(k, 1); }
    }
  }
  // the loose pieces fall and settle
  for (let i = BDMG.loose.length - 1; i >= 0; i--) {
    const L = BDMG.loose[i];
    L.life -= dt;
    L.v.y -= 22 * dt;
    L.m.position.addScaledVector(L.v, dt);
    const g = groundAt(L.m.position.x, L.m.position.z) + 0.08;
    if (L.m.position.y <= g) { L.m.position.y = g; L.v.set(L.v.x * 0.4, Math.abs(L.v.y) * 0.25, L.v.z * 0.4); L.w.multiplyScalar(0.4); if (L.v.y < 1) { L.v.set(0, 0, 0); L.w.set(0, 0, 0); } }
    const wl = L.w.length();
    if (wl > 1e-4) { _bdQ.setFromAxisAngle(_bdV.copy(L.w).divideScalar(wl), wl * dt); L.m.quaternion.premultiply(_bdQ); }
    if (L.life <= 0) { scene.remove(L.m); BDMG.loose.splice(i, 1); }
  }
  // a damaged frame spits sparks and trails smoke on its own, worse the lower it gets
  if (frac < 0.75 && player.model) {
    const p = player.renderPos || player.pos, hurtK = 1 - frac;
    BDMG.sparkT -= dt;
    if (BDMG.sparkT <= 0) {
      BDMG.sparkT = rand(0.35, 1.1) * (1.15 - hurtK);
      const a = Math.random() * Math.PI * 2;
      spark(new THREE.Vector3(p.x + Math.cos(a) * 0.5, p.y + rand(0.9, 1.9), p.z + Math.sin(a) * 0.5), 0xffc46a);
    }
    if (frac < 0.45) {
      BDMG.smokeT -= dt;
      if (BDMG.smokeT <= 0) { BDMG.smokeT = rand(0.18, 0.4); smokePuff(new THREE.Vector3(p.x + rand(-0.35, 0.35), p.y + 1.5, p.z + rand(-0.35, 0.35)), 0.5 + hurtK * 0.5); }
    }
  }
  // the shield breaking is its own moment
  const sh = player.shield || 0;
  if (BDMG.lastShield > 0.5 && sh <= 0.01 && S.mode === 'play') dmgShieldBreak();
  BDMG.lastShield = sh;
  dmgLens(frac);
}
/* called when a run ends or the world is rebuilt */
function dmgReset() {
  BDMG.loose.forEach(l => scene.remove(l.m)); BDMG.loose = [];
  BDMG.off = []; BDMG.cand = []; BDMG.forModel = null; BDMG.lastShield = 0;
  dmgLensClear();
}
addEventListener('resize', () => { if (BDMG.lens) { BDMG.lens.w = -1; const n = BDMG.lensShown; dmgLensInit(); BDMG.lensShown = 0; for (let i = 0; i < n; i++) dmgLensDraw(i); BDMG.lensShown = n; } });
