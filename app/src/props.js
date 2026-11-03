'use strict';
/* ============================================================
   LOOSE BLOCKS: odd-shaped scrap scattered over the field (crates, slabs, pillars, planks, barrels,
   wedges, L-brackets). Real Rapier bodies: you shove them by walking into them, shots knock them,
   blasts throw them, crowds of enemies bulldoze them.
   Only blocks near you are simulated; the rest sleep where they lie.
   ============================================================ */
let props = [];
const PROP_COLS = [0x5a6470, 0x6b5a43, 0x4a5a3a, 0x7a3a2e, 0x3e4852, 0x8a8270, 0x2f5a6a];
const PROP_TYPES = {
  crate:  () => { const s = rand(1.8, 3.2); return { parts: [{ box: [s, s, s] }], hull: true }; },
  slab:   () => ({ parts: [{ box: [rand(3.6, 5.6), rand(0.6, 0.9), rand(2.2, 3.2)] }] }),
  pillar: () => { const w = rand(1, 1.5); return { parts: [{ box: [w, rand(3.6, 5.6), w] }] }; },
  plank:  () => ({ parts: [{ box: [rand(5, 7), 0.36, rand(0.8, 1.2)] }] }),
  barrel: () => ({ parts: [{ cyl: [rand(0.75, 1), rand(2, 2.6)] }] }),
  wedge:  () => ({ parts: [{ wedge: [rand(2.8, 4.4), rand(1.6, 2.6), rand(2, 3)] }] }),
  ell:    () => { const t = rand(0.7, 1), l = rand(2.6, 4); return { parts: [{ box: [l, t, t * 2], at: [0, 0, 0] }, { box: [t, l * 0.8, t * 2], at: [-l / 2 + t / 2, l * 0.4 + t / 2, 0] }] }; },
  // explosive barrel: red, hazard-banded; shoot it or blast it and it goes up
  boom:   () => ({ parts: [{ cyl: [0.62, 1.5] }], explosive: true, col: 0xb8322c }),
};
function wedgeGeo(w, h, d) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(-w / 2, h / 2); sh.lineTo(-w / 2, -h / 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return g;
}
function placeProps() {
  clearProps();
  if (!PHYS.world) return;
  const n = 52, keys = Object.keys(PROP_TYPES).filter(k => k !== 'boom');
  for (let i = 0, tries = 0; i < n && tries < 600; tries++) {
    const k = (Math.random() * NC) | 0; if (!inner(k)) continue;
    const type = i % 4 === 0 ? 'boom' : pick(keys), spec = PROP_TYPES[type](), col = spec.col || pick(PROP_COLS);
    const x = cellX(k) + rand(-0.8, 0.8), z = cellZ(k) + rand(-0.8, 0.8);
    makeProp(type, spec, col, x, H[k], z);
    i++;
  }
  syncProps();
}
/* One loose block: type spec, colour, position on the ground at gy (or dropping in from dropY) */
function makeProp(type, spec, col, x, gy, z, dropY) {
  const g = new THREE.Group();
  const body = PHYS.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, gy + 3, z)
    .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0)))
    .setLinearDamping(0.15).setAngularDamping(0.4).setCanSleep(true));
  let bottom = 0;
  for (const p of spec.parts) {
    const at = p.at || [0, 0, 0]; let mesh, cd;
    if (p.box) {
      const [w, h, d] = p.box;
      mesh = new THREE.Mesh(spec.hull ? hullBox() : geoBox, M(col)); mesh.scale.set(w, h, d);
      cd = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2); bottom = Math.max(bottom, h / 2 - at[1]);
      if (!spec.hull && w > 1 && h < 0.5) { const s = bx(w * 0.9, 0.04, 0.12, ORANGE, at[0], at[1] + h / 2 + 0.02, at[2]); g.add(s); }   // a painted stripe
    } else if (p.cyl) {
      const [r, h] = p.cyl;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), M(col));
      for (const yy of [-h * 0.3, h * 0.3]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.12, 14), M(spec.explosive ? 0xf2c230 : COL.dark)); band.position.set(at[0], at[1] + yy, at[2]); g.add(band); }
      if (spec.explosive) {
        // hazard band and a glowing cap
        for (let q = 0; q < 6; q++) { const st = bx(0.12, 0.26, 0.06, COL.dark, Math.cos(q / 6 * Math.PI * 2) * r * 1.04, 0, Math.sin(q / 6 * Math.PI * 2) * r * 1.04); st.rotation.y = -q / 6 * Math.PI * 2; st.rotation.z = 0.6; g.add(st); }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.1, 10), M(0xff5a2a, 0xa02000)); cap.position.y = h / 2 + 0.05; g.add(cap);
      }
      cd = RAPIER.ColliderDesc.cylinder(h / 2, r); bottom = Math.max(bottom, h / 2);
    } else if (p.wedge) {
      const [w, h, d] = p.wedge;
      mesh = new THREE.Mesh(wedgeGeo(w, h, d), M(col));
      const pts = new Float32Array([-w / 2, -h / 2, -d / 2, w / 2, -h / 2, -d / 2, -w / 2, h / 2, -d / 2, -w / 2, -h / 2, d / 2, w / 2, -h / 2, d / 2, -w / 2, h / 2, d / 2]);
      cd = RAPIER.ColliderDesc.convexHull(pts); bottom = Math.max(bottom, h / 2);
    }
    mesh.position.set(at[0], at[1], at[2]); g.add(mesh);
    PHYS.world.createCollider(cd.setTranslation(at[0], at[1], at[2]).setDensity(0.45).setFriction(0.7).setRestitution(0.1)
      .setCollisionGroups(grp(PG_PROP, PG_TERRAIN | PG_PROP | PG_ROBOT | PG_PLAYER)), body);
  }
  body.setTranslation({ x, y: (dropY ?? gy + bottom + 0.02), z }, false);
  if (dropY === undefined) body.sleep();
  scene.add(g);
  const r = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).length() / 2;
  const pr = { body, group: g, r, home: { x, y: gy + bottom + 0.02, z }, explosive: !!spec.explosive, hp: 30, padCd: 0 };
  props.push(pr);
  return pr;
}
/* Every so often an explosive barrel drops out of the sky somewhere near you. It flattens whatever it lands on,
   but it only goes off when you shoot it (or a blast reaches it). A red ring marks where it will land. */
function skyBarrelTick(dt) {
  if (!PHYS.world) return;
  S.barrelT = (S.barrelT ?? rand(15, 30)) - dt;
  if (S.barrelT > 0) return;
  S.barrelT = rand(14, 30);
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2, d = rand(6, 26);
    const x = player.pos.x + Math.cos(a) * d, z = player.pos.z + Math.sin(a) * d, k = idxOf(x, z);
    if (k < 0 || !inner(k)) continue;
    const pr = makeProp('boom', PROP_TYPES.boom(), 0xb8322c, x, H[k], z, H[k] + 45);
    pr.falling = true; pr.body.setLinvel({ x: 0, y: -20, z: 0 }, true);
    pr.body.setAngvel({ x: rand(-2, 2), y: rand(-2, 2), z: rand(-2, 2) }, true);
    const mk = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mk.position.set(x, H[k] + 0.06, z); mk.scale.setScalar(1.4); scene.add(mk); pr.marker = mk;
    sfx('fuse', 0.4);
    return;
  }
}
function fallingBarrel(p, t, dt) {
  const gy = groundAt(t.x, t.z);
  if (t.y < gy - 1) { p.body.setTranslation({ x: t.x, y: gy + p.r * 0.6, z: t.z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); t = p.body.translation(); }   // landed outside the simulated ground
  const v = p.body.linvel();
  if (p.marker) { p.marker.scale.setScalar(1.4 + 0.25 * Math.sin(S.t * 14)); p.marker.material.opacity = 0.45 + 0.3 * Math.sin(S.t * 14); }
  if (v.y < -4) {
    for (const e of enemies) {
      if (e.dead || (p.squashed && p.squashed.has(e))) continue;
      const c = ecenter(e);
      if (Math.hypot(c.x - t.x, c.z - t.z) < p.r * 0.55 + e.r && t.y - c.y < p.r + e.r && t.y > c.y - e.r) {
        (p.squashed = p.squashed || new Set()).add(e);
        envDmg(() => damage(e, 90 * (1 + (S.stage - 1) * 0.4))); if (!e.dead) knock(e, new THREE.Vector3(c.x - t.x, 0, c.z - t.z).normalize(), 6, 3);
        spark(c, ORANGE); sfx('thud', 0.6);
      }
    }
  } else if (t.y - groundAt(t.x, t.z) < p.r + 0.6) {
    p.falling = false; if (p.marker) { scene.remove(p.marker); p.marker.material.dispose(); p.marker = null; }
    dust(new THREE.Vector3(t.x, groundAt(t.x, t.z), t.z), 8); sfx('thud', 0.7);
    if (Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < 20) cam.shake = Math.max(cam.shake, 0.3);
  }
}
function clearProps() { props.forEach(p => { scene.remove(p.group); if (p.marker) scene.remove(p.marker); }); props = []; S.barrelT = rand(15, 30); }
/* explosive barrels: a big blast that hurts enemies, you (if you're close) and sets off other barrels */
function detonate(p) {
  if (p.dead) return;
  p.dead = true;
  const t = p.body.translation(), c = new THREE.Vector3(t.x, t.y, t.z);
  scene.remove(p.group); if (p.marker) scene.remove(p.marker);
  if (PHYS.world) PHYS.world.removeRigidBody(p.body);
  props = props.filter(x => x !== p);
  const boom = () => explode(c, 6, 140 * (1 + (S.stage - 1) * 0.4), false, true);
  if (p.byPlayer) boom(); else envDmg(boom);           // only a barrel you set off feeds your kill streak
  blast(c, 4.5, 0xffe2a0); ring(new THREE.Vector3(c.x, groundAt(c.x, c.z), c.z), 8, 0.6, ORANGE);
  burst(c, 0xb8322c, 10); burst(c, 0xffd27a, 10);
  for (let i = 0; i < 5; i++) smokePuff(c.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), rand(1, 1.8));
  sfx('boom', 0.9);
}
function hurtProp(p, dmg) {
  if (!p.explosive || p.dead || p.fuse > 0) return;
  p.hp -= dmg;
  if (p.hp <= 0) { p.fuse = 0.12; p.byPlayer = !ENV_DMG; spark(p.group.position, ORANGE); }
}
const _pv = new THREE.Vector3();
/* per physics tick: keep far blocks asleep, let enemies bulldoze near ones, and catch anything that fell through */
function propsTick(dt) {
  const P = player.pos;
  for (const p of props) {
    if (p.dead) continue;
    const t = p.body.translation(), d = Math.hypot(t.x - P.x, t.z - P.z);
    // jump pads launch blocks too
    p.padCd -= dt;
    if (p.padCd <= 0 && d < 15) {
      const k = idxOf(t.x, t.z);
      if (padSet.has(k) && t.y - H[k] < p.r + 0.4) {
        const v = p.body.linvel(); p.body.setLinvel({ x: v.x, y: Math.sqrt(2 * 30 * CFG.padHeight), z: v.z }, true);
        p.body.applyTorqueImpulse({ x: rand(-1, 1) * p.body.mass(), y: rand(-1, 1) * p.body.mass(), z: rand(-1, 1) * p.body.mass() }, true);
        p.padCd = 0.6; ring(new THREE.Vector3(t.x, H[k], t.z), 3, 0.4, COL.cyan); sfx('thud', 0.5);
      }
    }
    if (p.fuse > 0) { p.fuse -= dt; if (p.fuse <= 0) detonate(p); continue; }
    if (p.falling) { fallingBarrel(p, t, dt); continue; }
    if (d > 13) { if (!p.body.isSleeping()) { const v = p.body.linvel(); if (Math.hypot(v.x, v.y, v.z) < 2) p.body.sleep(); } }
    else if (enemies.length) {
      // enemies shove blocks they walk into
      for (const e of enemies) {
        if (e.dead || e.d.fly) continue;
        const c = ecenter(e), dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z, dd = Math.hypot(dx, dy, dz), rr = p.r * 0.8 + e.r;
        if (dd < rr && dd > 1e-3) { const k = (rr - dd) * e.mass * 0.6; p.body.applyImpulse({ x: dx / dd * k + e.vel.x * 0.02 * e.mass, y: 0.05, z: dz / dd * k + e.vel.z * 0.02 * e.mass }, true); }
      }
    }
    // fell through the world (it was thrown out past the loaded terrain): put it back down
    if (t.y < groundAt(t.x, t.z) - 2 || t.y < -30) {
      p.body.setTranslation({ x: t.x, y: groundAt(t.x, t.z) + p.r + 0.1, z: t.z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
}
function syncProps() {
  for (const p of props) { const t = p.body.translation(), q = p.body.rotation(); p.group.position.set(t.x, t.y, t.z); p.group.quaternion.set(q.x, q.y, q.z, q.w); }
}
/* a shot passing through a block knocks it and stops (unless it pierces) */
function propsHitShot(s) {
  for (const p of props) {
    const t = p.body.translation();
    if (Math.abs(t.x - s.pos.x) > p.r + 2 || Math.abs(t.z - s.pos.z) > p.r + 2) continue;
    _pv.set(t.x, t.y, t.z);
    if (segDist2(s.last, s.pos, _pv) > (p.r * 0.75) ** 2) continue;
    const v = s.vel.clone().normalize(), k = 0.4 + (s.knock || 0) * 0.5 + s.dmg * 0.01;
    p.body.applyImpulseAtPoint({ x: v.x * k, y: v.y * k + 0.1, z: v.z * k }, { x: s.pos.x, y: s.pos.y, z: s.pos.z }, true);
    spark(s.pos, COL.bone);
    hurtProp(p, s.dmg);
    if (s.explode) explode(s.pos, s.explode, s.dmg, s.manual, s.selfHurt);
    return true;
  }
  return false;
}
/* blasts throw nearby blocks (only near the frame, where the terrain is loaded) */
function propsBlast(point, radius, strength) {
  for (const p of props.slice()) {
    if (p.dead) continue;
    const t = p.body.translation(), dx = t.x - point.x, dy = t.y - point.y, dz = t.z - point.z, d = Math.hypot(dx, dy, dz);
    // a blast sets off any explosive barrel caught in it (wherever it is), after a short delay so chains ripple
    if (p.explosive && d < radius * 0.8 + p.r && !(p.fuse > 0)) { p.fuse = rand(0.12, 0.3); p.byPlayer = !ENV_DMG; }
    if (d > radius || d < 1e-3 || Math.hypot(t.x - player.pos.x, t.z - player.pos.z) > 14) continue;
    const m = p.body.mass(), k = strength * (1 - d / radius) * Math.min(m, 4) * 1.5;
    p.body.applyImpulse({ x: dx / d * k, y: Math.abs(dy / d) * k + k * 0.6, z: dz / d * k }, true);
    p.body.applyTorqueImpulse({ x: rand(-1, 1) * k * 0.3, y: rand(-1, 1) * k * 0.3, z: rand(-1, 1) * k * 0.3 }, true);
  }
}
