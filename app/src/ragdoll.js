'use strict';
/* Death: the frame explodes and its parts fly loose, tumble and settle on the terrain. Simple position-based physics; looks right, costs little. */
const RAG = { pieces: [], active: false, root: null };
const RAG_G = 24;

function startRagdoll() {
  const m = player.model; if (!m) return;
  m.updateMatrixWorld(true);
  const parts = m.userData.parts.slice();           // children come before their parents in this list
  const set = new Set(parts);
  const info = parts.map(p => {
    let a = p.parent; while (a && !set.has(a)) a = a.parent;
    return { obj: p, parentObj: a || null, jointLocal: a ? a.worldToLocal(p.getWorldPosition(new THREE.Vector3())) : null };
  });
  for (const pc of info) scene.attach(pc.obj);      // children first, so every piece keeps only its own meshes
  scene.remove(m);
  player.model = null;
  player.props.forEach(o => scene.remove(o)); player.props = [];
  const base = player.vel.clone().multiplyScalar(0.6);
  RAG.pieces = info.map(pc => {
    pc.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pc.obj);
    const size = box.getSize(new THREE.Vector3());
    return {
      ...pc,
      pos: pc.obj.position.clone(), prev: pc.obj.position.clone(), q: pc.obj.quaternion.clone(),
      vel: base.clone().add(new THREE.Vector3(rand(-3, 3), rand(2, 6), rand(-3, 3))),
      w: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)),
      com: pc.obj.worldToLocal(box.getCenter(new THREE.Vector3())),
      r: Math.max(0.15, Math.max(size.x, size.y, size.z) * 0.38),
      heavy: !!(pc.obj.userData.item && pc.obj.userData.item.kind === 'block'),
    };
  });
  const byObj = new Map(RAG.pieces.map(p => [p.obj, p]));
  RAG.pieces.forEach(p => { p.parent = p.parentObj ? byObj.get(p.parentObj) : null; });
  RAG.root = RAG.pieces.find(p => !p.parent) || RAG.pieces[0];
  RAG.active = true;
  RAG.focus = null;
  cam.shake = 0.6;
  explodeFrame();
}
/* The frame blows apart: a fireball, a shock that throws nearby enemies, and every part
   breaks off its socket and flies, trailing smoke. */
function explodeFrame() {
  const c = new THREE.Vector3(), n = RAG.pieces.length || 1;
  RAG.pieces.forEach(p => c.add(p.com.clone().applyQuaternion(p.q).add(p.pos)));
  c.divideScalar(n);
  RAG.focus = c.clone();
  explode(c, 7, 35, false);                       // damages and throws enemies (and draws the core flash)
  blast(c, 4.2, 0xffe2a0); blast(c, 2.6, 0xffffff);
  ring(new THREE.Vector3(c.x, groundAt(c.x, c.z), c.z), 9, 0.7, ORANGE);
  burst(c, ORANGE, 10); burst(c, COL.dark, 14); burst(c, 0xffd27a, 6);
  for (let i = 0; i < 10; i++) smokePuff(c.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1))), rand(0.8, 1.5));
  cam.shake = 1.3;
  sfx('boom', 1.3);
  for (const p of RAG.pieces) {
    p.parent = null;                              // no joints any more: every part is loose
    const pc = p.com.clone().applyQuaternion(p.q).add(p.pos);
    const dir = pc.sub(c); dir.y = Math.max(dir.y, 0.2);
    if (dir.lengthSq() < 1e-4) dir.set(rand(-1, 1), 1, rand(-1, 1));
    dir.normalize();
    const k = p.heavy ? 0.55 : 1;
    p.vel.addScaledVector(dir, rand(9, 15) * k); p.vel.y += rand(5, 10) * k;
    p.prev.copy(p.pos);
    p.w.set(rand(-14, 14), rand(-14, 14), rand(-14, 14)).multiplyScalar(k);
    p.smoke = rand(1.6, 3); p.smokeT = 0;
  }
  // a couple of late pops as the wreck cooks off
  [0.25, 0.55, 0.9].forEach((t, i) => { const o = new THREE.Object3D(); let done = false;
    addFx(o, t, f => { if (!done && f.life <= 0.02) { done = true; const pp = RAG.pieces[(Math.random() * RAG.pieces.length) | 0]; if (!pp) return;
      const q = pp.com.clone().applyQuaternion(pp.q).add(pp.pos); blast(q, 1.6 - i * 0.3, ORANGE); burst(q, 0xffd27a, 4); sfx('pop2', 0.8); cam.shake = Math.max(cam.shake, 0.3); } }); });
}
function smokePuff(p, s) {
  // pooled (see ParticlePool in combat.js): a wreck trails one of these every 50 ms, and each used to be its own see-through draw call
  pfxInit(); if (PFX.glow.n > 10500) return;
  PFX.glow.add(p.x, p.y, p.z, rand(-1, 1), rand(1.5, 3), rand(-1, 1), rand(0.9, 1.6), s * 1.35, 0x2b2f33, 0, 0, 2, rand(0, 3), rand(0, 3), 0, rand(-1, 1));
}
const _rq = new THREE.Quaternion(), _rv = new THREE.Vector3(), _ra = new THREE.Vector3();
function stepRagdoll(dt) {
  if (!RAG.active) return;
  dt = Math.min(dt, 1 / 30);
  for (const p of RAG.pieces) {
    p.prev.copy(p.pos);
    p.vel.y -= RAG_G * dt;
    p.pos.addScaledVector(p.vel, dt);
    // limbs swing down from their joint like pendulums
    if (p.parent) {
      const arm = p.com.clone().applyQuaternion(p.q);
      p.w.add(arm.cross(_rv.set(0, -1, 0)).multiplyScalar(14 * dt));
    }
    const wl = p.w.length();
    if (wl > 1e-4) { _rq.setFromAxisAngle(_rv.copy(p.w).divideScalar(wl), wl * dt); p.q.premultiply(_rq); }
    p.w.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
  }
  for (let it = 0; it < 4; it++) {
    for (const p of RAG.pieces) { p.obj.position.copy(p.pos); p.obj.quaternion.copy(p.q); p.obj.updateMatrixWorld(true); }
    // keep each part pinned to its socket on the parent
    for (const p of RAG.pieces) {
      if (!p.parent) continue;
      const anchor = p.parent.obj.localToWorld(p.jointLocal.clone());
      const diff = anchor.sub(p.pos);
      const wp = p.heavy && !p.parent.heavy ? 0.5 : 0.85;
      p.pos.addScaledVector(diff, wp);
      p.parent.pos.addScaledVector(diff, -(1 - wp) * 0.6);
    }
    // the ground
    for (const p of RAG.pieces) {
      const c = p.com.clone().applyQuaternion(p.q).add(p.pos);
      const g = groundAt(c.x, c.z);
      if (c.y - p.r < g) {
        const push = g - (c.y - p.r);
        p.pos.y += push;
        p.w.multiplyScalar(0.85);
      }
    }
  }
  for (const p of RAG.pieces) {
    // walls: shove the piece out of any terrain column it flew into
    const cc = p.com.clone().applyQuaternion(p.q).add(p.pos), body = { pos: cc.clone() };
    pushOutTerrain(body, p.r, -p.r + 0.25);
    p.pos.x += body.pos.x - cc.x; p.pos.z += body.pos.z - cc.z;
    if (p.smoke > 0) { p.smoke -= dt; p.smokeT -= dt; if (p.smokeT <= 0) { p.smokeT = 0.07; smokePuff(cc, p.heavy ? 1 : 0.6); } }
    const nv = p.pos.clone().sub(p.prev).divideScalar(dt);
    const c = p.com.clone().applyQuaternion(p.q).add(p.pos);
    if (c.y - p.r <= groundAt(c.x, c.z) + 0.02) { nv.x *= 0.86; nv.z *= 0.86; if (nv.y < 0) nv.y *= -0.2; }
    p.vel.copy(nv);
    p.obj.position.copy(p.pos); p.obj.quaternion.copy(p.q);
  }
}
function ragdollCenter() {
  if (!RAG.root) return null;
  if (RAG.focus) return RAG.focus;
  return RAG.root.com.clone().applyQuaternion(RAG.root.q).add(RAG.root.pos);
}
function clearRagdoll() {
  RAG.pieces.forEach(p => scene.remove(p.obj));
  RAG.pieces = []; RAG.active = false; RAG.root = null;
}

/* ============================================================
   DROP RAGDOLL: during the fall the frame goes completely limp. Every part hangs off its socket and
   flails in the rushing air while the whole wreck tumbles. Simulated in the falling frame of reference
   (so gravity cancels out) with the wind pushing every part upward.
   ============================================================ */
const DR = { active: false, pieces: [], root: null, last: new THREE.Vector3(), tumble: new THREE.Vector3() };
function startDropRag() {
  const m = player.model; if (!m) return;
  m.updateMatrixWorld(true);
  const parts = m.userData.parts.slice(), set = new Set(parts);
  const info = parts.map(p => {
    let a = p.parent; while (a && !set.has(a)) a = a.parent;
    return { obj: p, parentObj: a || null, jointLocal: a ? a.worldToLocal(p.getWorldPosition(new THREE.Vector3())) : null };
  });
  for (const pc of info) scene.attach(pc.obj);
  scene.remove(m); player.model = null;
  DR.pieces = info.map(pc => {
    const box = new THREE.Box3().setFromObject(pc.obj);
    return { ...pc, pos: pc.obj.position.clone(), prev: pc.obj.position.clone(), q: pc.obj.quaternion.clone(),
      w: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), com: pc.obj.worldToLocal(box.getCenter(new THREE.Vector3())),
      heavy: !!(pc.obj.userData.item && pc.obj.userData.item.kind === 'block'), seed: Math.random() * 100 };
  });
  const byObj = new Map(DR.pieces.map(p => [p.obj, p]));
  DR.pieces.forEach(p => { p.parent = p.parentObj ? byObj.get(p.parentObj) : null; });
  DR.root = DR.pieces.find(p => !p.parent) || DR.pieces[0];
  DR.tumble.set(rand(-1.6, 1.6), rand(-1, 1), rand(-1.6, 1.6));
  DR.last.copy(player.pos);
  DR.active = true;
}
const _dq = new THREE.Quaternion(), _dv = new THREE.Vector3();
function stepDropRag(dt) {
  if (!DR.active) return;
  dt = Math.min(dt, 1 / 30);
  const P = player, move = P.pos.clone().sub(DR.last); DR.last.copy(P.pos);
  const t = performance.now() / 1000;
  // steering leans the tumble a little
  DR.tumble.x += (IN.mz * 2.5 - DR.tumble.x * 0.4) * dt; DR.tumble.z += (-IN.mx * 2.5 - DR.tumble.z * 0.4) * dt;
  for (const p of DR.pieces) {
    p.pos.add(move); p.prev.add(move);
    if (p === DR.root) continue;
    // relative wind: everything streams upward and flutters
    const vel = p.pos.clone().sub(p.prev).divideScalar(Math.max(dt, 1e-3));
    p.prev.copy(p.pos);
    vel.y += 22 * dt;
    vel.x += Math.sin(t * 7 + p.seed) * 9 * dt; vel.z += Math.cos(t * 6 + p.seed * 1.3) * 9 * dt;
    vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
    p.pos.addScaledVector(vel, dt);
    p.w.add(_dv.set(Math.sin(t * 5 + p.seed), Math.cos(t * 4 + p.seed), Math.sin(t * 6 + p.seed * 2)).multiplyScalar(10 * dt));
    p.w.multiplyScalar(Math.max(0, 1 - 1.5 * dt));
    const wl = p.w.length(); if (wl > 1e-4) { _dq.setFromAxisAngle(_dv.copy(p.w).divideScalar(wl), wl * dt); p.q.premultiply(_dq); }
  }
  // the core tumbles end over end and stays centred on the falling frame
  const r = DR.root, tl = DR.tumble.length();
  if (tl > 1e-4) { _dq.setFromAxisAngle(_dv.copy(DR.tumble).divideScalar(tl), tl * dt); r.q.premultiply(_dq); }
  r.pos.copy(P.pos).add(new THREE.Vector3(0, 1.4, 0)).sub(r.com.clone().applyQuaternion(r.q)); r.prev.copy(r.pos);
  for (let it = 0; it < 4; it++) {
    for (const p of DR.pieces) { p.obj.position.copy(p.pos); p.obj.quaternion.copy(p.q); p.obj.updateMatrixWorld(true); }
    for (const p of DR.pieces) {
      if (!p.parent) continue;
      const anchor = p.parent.obj.localToWorld(p.jointLocal.clone()), diff = anchor.sub(p.pos);
      const wp = p.parent === r ? 1 : p.heavy && !p.parent.heavy ? 0.5 : 0.85;
      p.pos.addScaledVector(diff, wp);
      if (p.parent !== r) p.parent.pos.addScaledVector(diff, -(1 - wp) * 0.6);
    }
  }
  for (const p of DR.pieces) { p.obj.position.copy(p.pos); p.obj.quaternion.copy(p.q); }
}
function endDropRag() {
  if (!DR.active) return;
  DR.pieces.forEach(p => scene.remove(p.obj));
  DR.pieces = []; DR.root = null; DR.active = false;
  // the frame snaps back together on touchdown
  player.model = buildRobot(L); player.model.position.copy(player.pos); scene.add(player.model);
  rebuildWeaponProps(); renderLoadoutHUD();
  physBuildRobot();
}
