'use strict';
/* ============================================================
   3D TITLE LOGO
   The Scrap Survivors logo model (15 separate pieces, see logodata.js) hangs in the title scene where the old text logo
   used to be. It turns very slowly so you can see it is solid. Click a piece 5 times and it drops off, tumbles onto the floor
   and stays there for 10 seconds, then flies back to where it was. 15 clicks in total drop every piece still on.
   Physics: a small private Rapier world (convex hulls), with a plain ballistic fallback if Rapier isn't available.
   The old <h1> is kept in the page (invisible) only so the menu keeps its place and the logo knows where to sit.
   ============================================================ */
const LOGO = {
  root: null, sway: null, parts: [], ready: false, total: 0, hover: null, t: 0, groundY: -0.3, acc: 0,
  world: null, ground: null, cursor: false, shownH: 0,
  PER: 5, ALL: 15, LIE: 10, MAXLIE: 22, G: 26, RETURN: 0.9,
};
const _lgV = new THREE.Vector3(), _lgV2 = new THREE.Vector3(), _lgQ = new THREE.Quaternion(), _lgQ2 = new THREE.Quaternion(), _lgRay = new THREE.Raycaster(), _lgM = new THREE.Vector2();
const _lgB64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };

/* ---------- build ---------- */
function logoBuild() {
  if (LOGO.ready || typeof LOGO_DATA === 'undefined') return;
  const mats = LOGO_COL.map((c, i) => new THREE.MeshStandardMaterial({ color: c, metalness: i ? 0.35 : 0.7, roughness: i ? 0.4 : 0.34, emissive: i ? 0x601800 : 0x000000, emissiveIntensity: i ? 0.35 : 0 }));
  // the file lies flat (face up = +Y, top of the lettering = -Z). Stand it up: (x, y, z) -> (x, -z, y), then centre it.
  const raw = LOGO_DATA.map(d => ({ d, p: new Float32Array(_lgB64(d.p)), q: new Int8Array(_lgB64(d.q)), i: new Uint16Array(_lgB64(d.i)) }));
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const r of raw) for (let k = 0; k < r.p.length; k += 3) { x0 = Math.min(x0, r.p[k]); x1 = Math.max(x1, r.p[k]); y0 = Math.min(y0, r.p[k + 1]); y1 = Math.max(y1, r.p[k + 1]); z0 = Math.min(z0, r.p[k + 2]); z1 = Math.max(z1, r.p[k + 2]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
  LOGO.w = x1 - x0; LOGO.h = z1 - z0; LOGO.d = y1 - y0;
  const root = new THREE.Group(), sway = new THREE.Group(); root.add(sway); root.visible = false;
  for (const r of raw) {
    const n = r.p.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = r.p[k * 3] - cx; pos[k * 3 + 1] = -(r.p[k * 3 + 2] - cz); pos[k * 3 + 2] = r.p[k * 3 + 1] - cy;
      nor[k * 3] = r.q[k * 3] / 127; nor[k * 3 + 1] = -r.q[k * 3 + 2] / 127; nor[k * 3 + 2] = r.q[k * 3 + 1] / 127;
    }
    // each piece is centred on its own middle so it can spin about it when it falls
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, c0 = 1e9, c1 = -1e9;
    for (let k = 0; k < n; k++) { a0 = Math.min(a0, pos[k * 3]); a1 = Math.max(a1, pos[k * 3]); b0 = Math.min(b0, pos[k * 3 + 1]); b1 = Math.max(b1, pos[k * 3 + 1]); c0 = Math.min(c0, pos[k * 3 + 2]); c1 = Math.max(c1, pos[k * 3 + 2]); }
    const mx = (a0 + a1) / 2, my = (b0 + b1) / 2, mz = (c0 + c1) / 2;
    for (let k = 0; k < n; k++) { pos[k * 3] -= mx; pos[k * 3 + 1] -= my; pos[k * 3 + 2] -= mz; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(r.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, mats[r.d.m].clone()); mesh.position.set(mx, my, mz); mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.logoPart = true; sway.add(mesh);
    LOGO.parts.push({ name: r.d.n, mesh, home: mesh.position.clone(), clicks: 0, state: 'home', wob: 0, flash: 0, hullPts: pos, size: new THREE.Vector3(a1 - a0, b1 - b0, c1 - c0), base: mats[r.d.m].emissiveIntensity, body: null });
  }
  LOGO.root = root; LOGO.sway = sway; LOGO.ready = true;
}

/* ---------- screen placement: sit where the old text logo was ---------- */
function logoPlace(cam) {
  const h1 = document.querySelector('#title .tlogo'); if (!h1) return false;
  const r = h1.getBoundingClientRect(); if (r.width < 8) return false;
  const W = innerWidth, H = innerHeight;
  const tanH = Math.tan(cam.fov * Math.PI / 360);
  const targetH = Math.min(r.height * 1.08, (r.width * 1.15) * LOGO.h / LOGO.w);
  const d = LOGO.h * H / (targetH * 2 * tanH);                                       // depth at which the logo is that many pixels tall
  const nx = ((r.left + targetH * LOGO.w / LOGO.h / 2 + 4) / W) * 2 - 1, ny = -((r.top + r.height * 0.6) / H) * 2 + 1;
  const place = (px, py) => {
    _lgV.set(px, py, 0.5).unproject(cam).sub(cam.position).normalize();
    cam.getWorldDirection(_lgV2);
    return _lgV.multiplyScalar(d / _lgV.dot(_lgV2)).add(cam.position);
  };
  LOGO.root.position.copy(place(nx, ny));
  LOGO.root.lookAt(cam.position);
  const gy = place(nx, -0.7).y;                                                      // the floor the pieces land on sits low on the screen
  if (Math.abs(gy - LOGO.groundY) > 0.02) { LOGO.groundY = gy; if (LOGO.ground) { LOGO.ground.setTranslation({ x: 0, y: gy - 1, z: 0 }, true); for (const p of LOGO.parts) if (p.body) p.body.wakeUp(); } }
  return true;
}

/* ---------- physics ---------- */
function logoWorld() {
  if (LOGO.world || typeof RAPIER === 'undefined' || !PHYS.ready) return LOGO.world;
  try {
    const w = new RAPIER.World({ x: 0, y: -LOGO.G, z: 0 });
    LOGO.ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, LOGO.groundY - 1, 0));
    w.createCollider(RAPIER.ColliderDesc.cuboid(60, 1, 60).setFriction(0.8).setRestitution(0.25), LOGO.ground);
    LOGO.world = w;
  } catch (e) { console.warn('logo physics unavailable', e); LOGO.world = null; }
  return LOGO.world;
}
function logoRelease(p, kick) {
  if (p.state !== 'home') return;
  const m = p.mesh;
  m.getWorldPosition(_lgV); m.getWorldQuaternion(_lgQ);
  TITLE.scene.attach(m);
  p.state = 'fall'; p.t = 0; p.rest = 0; p.clicks = 0; p.prevVy = 0; p.wob = 0;
  m.material.emissiveIntensity = p.base;
  const out = _lgV2.copy(p.home).normalize();
  const v = { x: out.x * 1.6 + rand(-1.2, 1.2), y: rand(1.5, 4.5), z: rand(0.2, 2.2) + (kick || 0) }, a = { x: rand(-5, 5), y: rand(-4, 4), z: rand(-6, 6) };
  p.vel = new THREE.Vector3(v.x, v.y, v.z); p.ang = new THREE.Vector3(a.x, a.y, a.z);
  const w = logoWorld();
  if (w) {
    try {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_lgV.x, _lgV.y, _lgV.z).setRotation({ x: _lgQ.x, y: _lgQ.y, z: _lgQ.z, w: _lgQ.w })
        .setLinvel(v.x, v.y, v.z).setAngvel(a).setLinearDamping(0.05).setAngularDamping(0.35).setCcdEnabled(true));
      let cd = RAPIER.ColliderDesc.convexHull(p.hullPts);
      if (!cd) cd = RAPIER.ColliderDesc.cuboid(p.size.x / 2, p.size.y / 2, Math.max(0.05, p.size.z / 2));
      w.createCollider(cd.setRestitution(0.28).setFriction(0.75).setDensity(1.4), b);
      p.body = b;
    } catch (e) { console.warn('logo body failed', e); p.body = null; }
  }
  sfx('hit', 0.8);
}
function logoReturn(p) {
  const w = LOGO.world;
  if (p.body && w) { try { w.removeRigidBody(p.body); } catch (e) {} p.body = null; }
  p.state = 'return'; p.rt = 0; p.from = p.mesh.position.clone(); p.fromQ = p.mesh.quaternion.clone();
  sfx('unfold', 0.5);
}
function logoHome(p) {
  const w = LOGO.world;
  if (p.body && w) { try { w.removeRigidBody(p.body); } catch (e) {} }
  p.body = null; p.state = 'home'; p.clicks = 0; p.wob = 0; p.flash = 0;
  LOGO.sway.add(p.mesh); p.mesh.position.copy(p.home); p.mesh.quaternion.identity(); p.mesh.scale.setScalar(1); p.mesh.material.emissiveIntensity = p.base;
}
/* put everything back instantly (leaving the title, coming back to it) */
function logoReset() {
  if (!LOGO.ready) return;
  for (const p of LOGO.parts) logoHome(p);
  LOGO.total = 0; LOGO.hover = null; LOGO.root.visible = false;
  if (LOGO.cursor) { document.body.style.cursor = ''; LOGO.cursor = false; }
}
function logoOpen() { logoBuild(); if (!LOGO.ready) return; logoReset(); TITLE.scene.add(LOGO.root); LOGO.t = 0; }

/* ---------- per frame ---------- */
function logoTick(dt) {
  if (!LOGO.ready || !LOGO.root.parent) return;
  const show = S.mode === 'title' && !$('#title').hidden;
  const okPlace = show && logoPlace(TITLE.cam);
  LOGO.root.visible = !!okPlace;
  if (!okPlace) return;
  LOGO.t += dt;
  // very slow turn so it reads as solid
  LOGO.sway.rotation.set(Math.sin(LOGO.t * 0.19 + 1) * 0.07 - 0.03, Math.sin(LOGO.t * 0.23) * 0.5, Math.sin(LOGO.t * 0.13) * 0.015);
  LOGO.sway.position.y = Math.sin(LOGO.t * 0.5) * 0.05;
  LOGO.root.updateMatrixWorld(true);

  const w = LOGO.world;
  if (w) { LOGO.acc = Math.min(LOGO.acc + dt, 0.1); while (LOGO.acc >= 1 / 60) { w.step(); LOGO.acc -= 1 / 60; } }
  let allHome = true;
  for (const p of LOGO.parts) {
    const m = p.mesh;
    if (p.state === 'home') {
      // loosening: each click tilts it a bit more and pulls it forward; a hit makes it rattle
      p.wob = Math.max(0, p.wob - dt * 3.2); p.flash = Math.max(0, p.flash - dt * 4);
      const loose = p.clicks / LOGO.PER, rat = Math.sin(LOGO.t * 60) * p.wob;
      m.position.set(p.home.x + rat * 0.03, p.home.y + rat * 0.02, p.home.z + loose * 0.07 + p.wob * 0.05);
      m.rotation.set(rat * 0.05, 0, loose * 0.05 * (p.home.x < 0 ? 1 : -1) + rat * 0.04);
      const hov = LOGO.hover === p ? 0.55 : 0;
      m.material.emissiveIntensity = p.base + hov + p.flash * 1.6;
      continue;
    }
    allHome = false;
    if (p.state === 'fall') {
      p.t += dt;
      if (p.body) {
        const t = p.body.translation(), q = p.body.rotation(), v = p.body.linvel(), av = p.body.angvel();
        m.position.set(t.x, t.y, t.z); m.quaternion.set(q.x, q.y, q.z, q.w);
        if (p.prevVy < -4 && v.y > p.prevVy + 3) sfx('land', Math.min(0.7, -p.prevVy / 14));
        p.prevVy = v.y;
        const calm = Math.hypot(v.x, v.y, v.z) < 0.35 && Math.hypot(av.x, av.y, av.z) < 0.8;
        if (p.t > 0.4 && calm) p.rest += dt;
      } else {                                                                       // no Rapier: plain ballistic tumble
        p.vel.y -= LOGO.G * dt; m.position.addScaledVector(p.vel, dt);
        _lgQ.setFromAxisAngle(_lgV.copy(p.ang).normalize(), p.ang.length() * dt); m.quaternion.premultiply(_lgQ);
        const floor = LOGO.groundY + 0.1;
        if (m.position.y < floor) { m.position.y = floor; p.vel.y *= -0.3; p.vel.x *= 0.7; p.vel.z *= 0.7; p.ang.multiplyScalar(0.6); if (Math.abs(p.vel.y) < 1) p.vel.y = 0; }
        if (p.t > 0.4 && p.vel.length() < 0.35 && m.position.y <= floor + 0.01) p.rest += dt;
      }
      if (p.rest >= LOGO.LIE || p.t >= LOGO.MAXLIE) logoReturn(p);
    } else if (p.state === 'return') {
      p.rt += dt; const k = Math.min(1, p.rt / LOGO.RETURN), e = k * k * (3 - 2 * k);
      LOGO.sway.localToWorld(_lgV.copy(p.home)); LOGO.sway.getWorldQuaternion(_lgQ2);
      m.position.lerpVectors(p.from, _lgV, e); m.position.y += Math.sin(Math.PI * e) * 0.9;
      m.quaternion.slerpQuaternions(p.fromQ, _lgQ2, e);
      if (k >= 1) { logoHome(p); p.flash = 1; p.wob = 0.6; sfx('slot', 0.6); }
    }
  }
  if (!allHome) LOGO.wasAway = true; else if (LOGO.wasAway) { LOGO.wasAway = false; LOGO.total = 0; }   // the count starts over once everything is back
}

/* ---------- clicking ---------- */
const logoOk = e => S.mode === 'title' && LOGO.ready && LOGO.root.visible && !$('#title').hidden && !(e.target.closest && e.target.closest('button, input, .custpanel, .tip, a'));
function logoPick(e) {
  const r = canvas.getBoundingClientRect();
  _lgM.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  _lgRay.setFromCamera(_lgM, TITLE.cam);
  const meshes = []; for (const p of LOGO.parts) if (p.state === 'home') meshes.push(p.mesh);
  const hit = _lgRay.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  return { part: LOGO.parts.find(p => p.mesh === hit.object), point: hit.point };
}
function logoHit(p, point) {
  ensureAudio();
  p.clicks++; LOGO.total++; p.wob = 1; p.flash = 1;
  const last = p.clicks >= LOGO.PER, all = LOGO.total >= LOGO.ALL;
  sfx(last || all ? 'hit' : 'tink', 0.9);
  if (typeof titleBurst === 'function') titleBurst(point, p.mesh.userData.spark || (p.base ? ORANGE : 0xdfe6ea), last ? 10 : 4);
  if (all) {
    for (const q of LOGO.parts) logoRelease(q, 0);
    LOGO.total = 0;
    if (typeof TITLE !== 'undefined') TITLE.shake = Math.max(TITLE.shake || 0, 0.5);
  } else if (last) {
    logoRelease(p, 0);
    if (typeof TITLE !== 'undefined') TITLE.shake = Math.max(TITLE.shake || 0, 0.2);
  }
}
addEventListener('pointerdown', e => {
  if (e.button !== 0 || !logoOk(e)) return;
  const h = logoPick(e); if (h) logoHit(h.part, h.point);
});
addEventListener('pointermove', e => {
  if (!LOGO.ready) return;
  if (!logoOk(e)) { if (LOGO.cursor) { document.body.style.cursor = ''; LOGO.cursor = false; } LOGO.hover = null; return; }
  const h = logoPick(e); LOGO.hover = h ? h.part : null;
  if (h && !LOGO.cursor) { document.body.style.cursor = 'pointer'; LOGO.cursor = true; }
  else if (!h && LOGO.cursor) { document.body.style.cursor = ''; LOGO.cursor = false; }
});
