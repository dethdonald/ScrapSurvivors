'use strict';
/* ============================================================
   PHYSICS BODY (Rapier)
   The robot you see is a set of real rigid bodies, one per part, joined at their ball sockets.
   An invisible "skeleton" (the old animated model) still runs the controls, stepping, knees and aiming.
   Every physical part is pushed toward its pose on that skeleton by a motor of limited strength:
     - the main body is pulled along by the movement capsule (so controls stay tight),
     - every other part has a joint motor that tries to match the animation.
   Gravity, weight, recoil, blasts and walls push back, so the frame sways, sags and gets shoved,
   but it never falls over while alive (no stumbles).
   Toggle: SETTINGS.physics (pause menu > Physics body).
   ============================================================ */
const PHYS = { ready: false, world: null, pieces: [], byItem: new Map(), root: null, vm: null, active: false, lastTarget: new THREE.Vector3(), hasLast: false };
const PG_ROBOT = 0x0001, PG_TERRAIN = 0x0002, PG_PROP = 0x0004, PG_PLAYER = 0x0008;
const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
const CAP_Y = 1.6;   // capsule centre above the feet (bottom at +0.3)
/* The top of a loose block under (x, z), if it's within reach of feet at y: lets the frame stand on props.
   A ray starting inside a block (too tall to step onto) doesn't count. Returns { y, body } or null. */
const _pgOff = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
function propGround(x, y, z, r, step) {
  if (!PHYS.world || typeof props === 'undefined' || !props.length) return null;
  let best = null;
  for (const [ox, oz] of _pgOff) {
    const top = y + step, ray = new RAPIER.Ray({ x: x + ox * r, y: top, z: z + oz * r }, { x: 0, y: -1, z: 0 });
    const h = PHYS.world.castRay(ray, step + 0.6, true, undefined, grp(PG_PLAYER, PG_PROP));
    if (!h) continue;
    const t = h.toi ?? h.timeOfImpact;
    if (!(t > 1e-3)) continue;
    const gy = top - t;
    if (!best || gy > best.y) best = { y: gy, collider: h.collider, px: x + ox * r, pz: z + oz * r };
  }
  if (best) best.body = best.collider.parent();
  return best;
}
if (SETTINGS.physics === undefined) SETTINGS.physics = true;
if (window.RAPIER) RAPIER.init().then(() => { PHYS.ready = true; if (typeof S !== 'undefined' && S.inRun && S.mode !== 'drop' && S.mode !== 'countdown') { physResetWorld(); physBuildRobot(); } }).catch(e => console.error('Rapier failed to start', e));
const physOn = () => PHYS.ready && SETTINGS.physics;

/* ---------- world: one fixed collider per terrain column ---------- */
function physResetWorld() {
  physDestroyRobot();
  if (typeof clearProps === 'function') clearProps();
  if (PHYS.world) { PHYS.world.free(); PHYS.world = null; }
  if (!PHYS.ready) return;     // the world (terrain + loose blocks) always runs; the physics body is the optional part
  const w = new RAPIER.World({ x: 0, y: -30, z: 0 });
  w.timestep = 1 / 120;
  w.numSolverIterations = 8;
  PHYS.ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  PHYS.cells = new Map(); PHYS.cellAt = -1;
  // an invisible capsule that follows the frame, so walking shoves loose blocks around
  // its bottom sits a little above the feet, so standing on a block never presses it into the ground
  PHYS.capsule = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(player.pos.x, player.pos.y + CAP_Y, player.pos.z));
  w.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.7).setCollisionGroups(grp(PG_PLAYER, PG_PROP)), PHYS.capsule);
  PHYS.world = w;
}
/* Only the terrain columns around the frame get colliders (the robot never reaches further);
   they're swapped in and out as you move, which keeps every physics step cheap. */
function physStreamTerrain() {
  const k0 = idxOf(player.pos.x, player.pos.z);
  if (k0 === PHYS.cellAt) return;
  PHYS.cellAt = k0;
  const i0 = k0 % GRID, j0 = (k0 / GRID) | 0, R = 5, need = new Set(), base = -10;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
    need.add(j * GRID + i);
  }
  for (const [k, c] of PHYS.cells) if (!need.has(k)) { PHYS.world.removeCollider(c, false); PHYS.cells.delete(k); }
  for (const k of need) {
    if (PHYS.cells.has(k)) continue;
    const h = H[k];
    PHYS.cells.set(k, PHYS.world.createCollider(RAPIER.ColliderDesc.cuboid(CELL / 2, (h - base) / 2, CELL / 2)
      .setTranslation(cellX(k), (h + base) / 2, cellZ(k)).setFriction(0.8)
      .setCollisionGroups(grp(PG_TERRAIN, PG_ROBOT | PG_PROP)), PHYS.ground));
  }
}

/* ---------- the robot as jointed bodies ----------
   Parts bolted rigidly together (stacked blocks, legs, guns on blocks or in a wrist, modules) are merged into ONE
   rigid body with several colliders, so a stack can't wobble apart. Bodies only meet at the joints that move:
   each arm (ball joint), the chest on the waist (hinge, so the upper body can lead), anything on a Spin Gear. */
const _pb = new THREE.Box3(), _pm = new THREE.Matrix4(), _pinv = new THREE.Matrix4();
function localBox(obj) {
  // bounding box of this part's own meshes, in the part's own frame
  obj.updateMatrixWorld(true);
  _pinv.copy(obj.matrixWorld).invert();
  const box = new THREE.Box3();
  obj.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _pb.copy(o.geometry.boundingBox).applyMatrix4(_pm.multiplyMatrices(_pinv, o.matrixWorld));
    box.union(_pb);
  });
  return box;
}
function physBuildRobot() {
  physDestroyRobot();
  if (!physOn() || !PHYS.world || !player.model || !S.inRun) return;
  const skel = player.model, sreg = skel.userData;
  skel.updateMatrixWorld(true);
  // a second, visible copy of the robot that gets split into one object per part
  const vm = buildRobot(L);
  vm.position.copy(skel.position); vm.quaternion.copy(skel.quaternion);
  scene.add(vm); vm.updateMatrixWorld(true);
  const vreg = vm.userData, parts = vreg.parts.slice(), set = new Set(parts);   // children come before parents
  const info = parts.map(p => {
    let a = p.parent; while (a && !set.has(a)) a = a.parent;
    return { obj: p, parentObj: a || null };
  });
  for (const pc of info) scene.attach(pc.obj);
  scene.remove(vm);
  const W = PHYS.world;
  const pieces = info.map(pc => ({ ...pc, item: pc.obj.userData.item, skel: sreg.partOf.get(pc.obj.userData.item) }));
  const byObj = new Map(pieces.map(p => [p.obj, p]));
  for (const p of pieces) p.parent = p.parentObj ? byObj.get(p.parentObj) : null;
  // which parts start their own body (a moving joint) and which are bolted into their parent's body
  for (const p of pieces) {
    if (!p.parent) { p.joint = 'root'; continue; }
    const onGear = p.parent.item.kind === 'block' && BLOCKS[p.parent.item.type].spin;
    if (p.item.kind === 'arm' || onGear) p.joint = 'ball';
    else if (p.skel && p.skel === sreg.torso) p.joint = 'hinge';
    else p.joint = 'fixed';
  }
  // groups (parents first)
  const groups = [];
  for (const p of pieces.slice().reverse()) {
    if (p.joint === 'fixed') { p.group = p.parent.group; p.group.members.push(p); continue; }
    p.group = { lead: p, members: [p], parentGroup: p.parent ? p.parent.group : null, joint: p.joint };
    groups.push(p.group);
  }
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  for (const g of groups) {
    const lead = g.lead.obj;
    g.body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(lead.position.x, lead.position.y, lead.position.z).setRotation(lead.quaternion)
      .setLinearDamping(0.5).setAngularDamping(2).setCanSleep(false));
    g.mass = 0;
    const leadInv = lead.quaternion.clone().invert();
    for (const m of g.members) {
      // where this part sits on the group's body, kept for drawing
      m.offP = m.obj.position.clone().sub(lead.position).applyQuaternion(leadInv);
      m.offQ = leadInv.clone().multiply(m.obj.quaternion);
      const box = localBox(m.obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const mass = Math.max(0.06, partMass(m.item));
      g.mass += mass;
      const cpos = c.clone().applyQuaternion(m.offQ).add(m.offP);
      const hit = m.item.kind === 'arm' || (m.item.kind === 'weapon' && m.parent && m.parent.item.kind === 'arm');
      W.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.05, size.x * 0.45), Math.max(0.05, size.y * 0.45), Math.max(0.05, size.z * 0.45))
        .setTranslation(cpos.x, cpos.y, cpos.z).setRotation(m.offQ).setMass(mass).setFriction(0.6)
        // only arms and what they hold bump into walls; the core passes through, so a wall can't wedge the frame
        .setCollisionGroups(hit ? grp(PG_ROBOT, PG_TERRAIN | PG_PROP) : grp(PG_ROBOT, 0)), g.body);
    }
    const pi = g.body.principalInertia();
    g.I = Math.max(1e-3, (pi.x + pi.y + pi.z) / 3);
    g.skel = g.lead.skel;
    const lv = 1 + 0.8 * lvlCurve(g.lead.item.lvl || 1);
    g.strength = g.joint === 'hinge' ? 1 : 0.8 * lv;
  }
  // joints between groups, at the lead part's ball socket
  for (const g of groups) {
    if (!g.parentGroup) continue;
    const pg = g.parentGroup, pl = pg.lead.obj, jointW = g.lead.obj.position;
    const a1 = jointW.clone().sub(pl.position).applyQuaternion(pl.quaternion.clone().invert());
    let jd;
    if (g.joint === 'hinge') {
      const rel = pl.quaternion.clone().invert().multiply(g.lead.obj.quaternion);
      jd = RAPIER.JointData.revolute(a1, { x: 0, y: 0, z: 0 }, new THREE.Vector3(0, 1, 0).applyQuaternion(rel));
    } else jd = RAPIER.JointData.spherical(a1, { x: 0, y: 0, z: 0 });
    W.createImpulseJoint(jd, pg.body, g.body, true).setContactsEnabled(false);
  }
  // inertia a motor must turn: its own body plus the bodies hanging off it (parallel axis)
  for (const g of groups) g.Ieff = g.I;
  for (const g of groups) { let a = g.parentGroup; while (a) { a.Ieff += g.I + g.mass * g.lead.obj.position.distanceToSquared(a.lead.obj.position); a = a.parentGroup; } }
  for (const g of groups) { g.load = 0; } for (const g of groups) { let a = g.parentGroup; while (a) { a.load += g.mass; a = a.parentGroup; } }
  PHYS.pieces = pieces; PHYS.groups = groups; PHYS.root = groups[0];
  PHYS.byItem = new Map(pieces.map(p => [p.item, p]));
  skel.visible = false;   // the skeleton keeps running the animation but is no longer drawn
  // guns fire from where the physical guns actually are; blades cut where the physical blades are
  PHYS.skelMuzzle = [skel, sreg.muzzleOf, sreg.baseOf];
  sreg.muzzleOf = vreg.muzzleOf; sreg.baseOf = vreg.baseOf;
  PHYS.vreg = vreg; PHYS.active = true; PHYS.stepped = false;
}
function physDestroyRobot(showSkeleton = true) {
  if (!PHYS.active) return;
  for (const p of PHYS.pieces) scene.remove(p.obj);
  if (PHYS.world) for (const g of PHYS.groups) PHYS.world.removeRigidBody(g.body);
  PHYS.pieces = []; PHYS.groups = []; PHYS.byItem = new Map(); PHYS.root = null; PHYS.active = false;
  if (PHYS.skelMuzzle) { const [sk, mz, bs] = PHYS.skelMuzzle; sk.userData.muzzleOf = mz; sk.userData.baseOf = bs; PHYS.skelMuzzle = null; }
  if (player.model && showSkeleton) player.model.visible = true;
}

/* ---------- motors ---------- */
const _tq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _eq2 = new THREE.Quaternion(), _ax = new THREE.Vector3(),
  _tp = new THREE.Vector3(), _sv = new THREE.Vector3(), _wv = new THREE.Vector3();
/* rotation that takes current -> target, as an axis * angle vector (shortest way round) */
function quatErr(target, cur, out) {
  _eq2.copy(target).multiply(_cq.copy(cur).invert());
  if (_eq2.w < 0) { _eq2.x = -_eq2.x; _eq2.y = -_eq2.y; _eq2.z = -_eq2.z; _eq2.w = -_eq2.w; }
  const s = Math.sqrt(1 - Math.min(1, _eq2.w * _eq2.w));
  const ang = 2 * Math.acos(Math.min(1, _eq2.w));
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(_eq2.x / s * ang, _eq2.y / s * ang, _eq2.z / s * ang);
}
function physStep(dt) {
  if (!PHYS.world) return;
  physStreamTerrain();
  const n = Math.max(1, Math.round(dt / PHYS.world.timestep)), h = dt / n;
  PHYS.capsule.setNextKinematicTranslation({ x: player.pos.x, y: player.pos.y + CAP_Y, z: player.pos.z });
  if (typeof propsTick === 'function') propsTick(dt);
  if (!PHYS.active || !player.model) { for (let s = 0; s < n; s++) PHYS.world.step(); return; }
  const skel = player.model; skel.updateMatrixWorld(true);
  for (const g of PHYS.groups) if (g.skel) { g.tq = g.tq || new THREE.Quaternion(); g.skel.getWorldQuaternion(g.tq); }
  // where the main body should be: the capsule's position this tick (not the render-smoothed one, which
  // updates at a different rate and made the body jitter) plus the hips' offset on the skeleton
  const R = PHYS.root;
  R.skel.getWorldPosition(_tp); _tp.sub(skel.position).add(player.pos);
  _sv.copy(player.vel);
  const rt = R.body.translation();
  if (Math.hypot(rt.x - _tp.x, rt.y - _tp.y, rt.z - _tp.z) > 3) { physSnapToSkeleton(); return; }   // teleported
  for (const g of PHYS.groups) {
    const t = g.body.translation(), q = g.body.rotation();
    if (!g.prevP) { g.prevP = new THREE.Vector3(); g.prevQ = new THREE.Quaternion(); g.curP = new THREE.Vector3(); g.curQ = new THREE.Quaternion(); }
    g.prevP.set(t.x, t.y, t.z); g.prevQ.set(q.x, q.y, q.z, q.w);
  }
  for (let s = 0; s < n; s++) {
    for (const g of PHYS.groups) {
      if (!g.skel) continue;
      const b = g.body, q = b.rotation(), w = b.angvel();
      quatErr(g.tq, _cq.set(q.x, q.y, q.z, q.w), _ax);
      if (!g.parentGroup) {
        // the core: a critically damped spring to the movement capsule (carrying the whole frame's weight) and an
        // upright spring, so it never tips over
        const t = b.translation(), v = b.linvel(), mt = g.mass + g.load, w0 = 22;
        b.applyImpulse({
          x: mt * (w0 * w0 * (_tp.x - t.x) + 2 * w0 * (_sv.x - v.x)) * h,
          y: mt * (w0 * w0 * (_tp.y - t.y) + 2 * w0 * (_sv.y - v.y) + 30) * h,
          z: mt * (w0 * w0 * (_tp.z - t.z) + 2 * w0 * (_sv.z - v.z)) * h }, true);
        const r0 = 16, I = g.I;
        b.applyTorqueImpulse({ x: I * (r0 * r0 * _ax.x - 2 * r0 * w.x) * h, y: I * (r0 * r0 * _ax.y - 2 * r0 * w.y) * h, z: I * (r0 * r0 * _ax.z - 2 * r0 * w.z) * h }, true);
        continue;
      }
      // joint motor: a critically damped spring toward the animated pose; the parent takes the equal and opposite twist
      const pw = g.parentGroup.body.angvel(), w0 = g.joint === 'hinge' ? 18 : 16;
      _wv.set(w0 * w0 * _ax.x - 2 * w0 * (w.x - pw.x), w0 * w0 * _ax.y - 2 * w0 * (w.y - pw.y), w0 * w0 * _ax.z - 2 * w0 * (w.z - pw.z)).multiplyScalar(g.I * h);
      const maxImp = g.Ieff * 500 * g.strength * h;          // a motor can only push so hard
      if (_wv.length() > maxImp) _wv.setLength(maxImp);
      b.applyTorqueImpulse(_wv, true);
      // (the core is held by the capsule, so it doesn't take the reaction; that kept spinning it off course)
      if (g.parentGroup.parentGroup) g.parentGroup.body.applyTorqueImpulse({ x: -_wv.x * 0.5, y: -_wv.y * 0.5, z: -_wv.z * 0.5 }, true);
    }
    PHYS.world.step();
  }
  for (const g of PHYS.groups) { const t = g.body.translation(), q = g.body.rotation(); g.curP.set(t.x, t.y, t.z); g.curQ.set(q.x, q.y, q.z, q.w); }
  PHYS.stepped = true;
}
/* put every body exactly where the skeleton has it (used after teleports) */
function physSnapToSkeleton() {
  for (const g of PHYS.groups) {
    if (!g.skel) continue;
    g.skel.getWorldPosition(_tp); g.skel.getWorldQuaternion(_tq);
    g.body.setTranslation(_tp, true); g.body.setRotation(_tq, true);
    g.body.setLinvel({ x: 0, y: 0, z: 0 }, true); g.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  PHYS.stepped = false;
}
/* copy local transforms of every non-part descendant (IK bones, shocks, flames, gear teeth) from the skeleton */
function copyPose(src, dst) {
  const n = Math.min(src.children.length, dst.children.length);
  for (let i = 0; i < n; i++) {
    const a = src.children[i], b = dst.children[i];
    if (a.userData && a.userData.item) continue;           // another part: drawn from its own body
    b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible;
    if (a.children.length) copyPose(a, b);
  }
}
/* draw: every part where its body is (blended between physics ticks), plus the animated details */
const _gp = new THREE.Vector3(), _gq = new THREE.Quaternion();
function physSync(alpha = 1) {
  if (!PHYS.active) return;
  // squash & stretch about the feet (drawing only; the bodies themselves are untouched)
  const sq = typeof SQUASH !== 'undefined' && Math.abs(SQUASH.y - 1) > 0.002, cx = player.renderPos.x, cz = player.renderPos.z, fy = sq ? SQUASH.foot : 0;
  for (const g of PHYS.groups) {
    if (g.prevP && PHYS.stepped) { _gp.lerpVectors(g.prevP, g.curP, alpha); _gq.slerpQuaternions(g.prevQ, g.curQ, alpha); }
    else { const t = g.body.translation(), q = g.body.rotation(); _gp.set(t.x, t.y, t.z); _gq.set(q.x, q.y, q.z, q.w); }
    for (const m of g.members) {
      m.obj.quaternion.copy(_gq).multiply(m.offQ);
      m.obj.position.copy(m.offP).applyQuaternion(_gq).add(_gp);
      if (sq) {
        const p = m.obj.position;
        p.set(cx + (p.x - cx) * SQUASH.xz, fy + (p.y - fy) * SQUASH.y, cz + (p.z - cz) * SQUASH.xz);
        m.obj.scale.set(SQUASH.xz, SQUASH.y, SQUASH.xz);
      } else m.obj.scale.set(1, 1, 1);
      if (m.skel && (m.item.kind === 'leg' || m.item.kind === 'module' || (m.item.kind === 'block' && BLOCKS[m.item.type].spin))) copyPose(m.skel, m.obj);
    }
  }
}

/* ---------- pushes from the game ---------- */
function physPieceOf(item) { return PHYS.active ? PHYS.byItem.get(item) : null; }
/* recoil: shove the gun (and whatever body it's part of) back along its barrel, at the gun */
function physRecoil(item, dir, kick) {
  const p = physPieceOf(item); if (!p) return;
  const g = p.group, k = kick * 0.3 * Math.sqrt(Math.min(g.mass, 1.5));
  const at = p.obj.getWorldPosition(new THREE.Vector3());
  g.body.applyImpulseAtPoint({ x: -dir.x * k, y: -dir.y * k + k * 0.15, z: -dir.z * k }, at, true);
}
/* a blast or a hit: every part near the point gets thrown, heavier parts less */
function physBlast(point, radius, strength) {
  if (!PHYS.active) return;
  for (const g of PHYS.groups) {
    const t = g.body.translation(), dx = t.x - point.x, dy = t.y - point.y, dz = t.z - point.z, d = Math.hypot(dx, dy, dz);
    if (d > radius || d < 1e-4) continue;
    const k = strength * (1 - d / radius) * Math.min(1.5, g.mass);
    g.body.applyImpulse({ x: dx / d * k, y: dy / d * k + k * 0.3, z: dz / d * k }, true);
  }
}
/* something bumped the frame at a point (enemy contact): jostle the nearest part */
function physNudge(point, dir, k) {
  if (!PHYS.active) return;
  let best = null, bd = 1e9;
  for (const g of PHYS.groups) { const t = g.body.translation(), d = (t.x - point.x) ** 2 + (t.y - point.y) ** 2 + (t.z - point.z) ** 2; if (d < bd) { bd = d; best = g; } }
  if (best) best.body.applyImpulse({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, true);
}
