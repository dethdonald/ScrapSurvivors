'use strict';
/* Enemies, weapons, projectiles, scrap and effects. */
let enemies = [], shots = [], gems = [], fx = [], targets = [];

/* ---------- enemies ---------- */
const geoSphere = new THREE.IcosahedronGeometry(1, 1);
const geoDome = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
const geoDisc = new THREE.CircleGeometry(1, 14); geoDisc.rotateX(Math.PI / 2);
/* Meshes are centred on the collision ball so they can tumble. */
let geoHullBox = null;   // the bevelled block hull at box scale (-0.5..0.5)
function hullBox() { if (!geoHullBox) { geoHullBox = getHullGeo().clone(); geoHullBox.scale(0.5, 0.5, 0.5); } return geoHullBox; }
function makeEnemyMesh(type, color, shape) {
  const g = new THREE.Group(), d = ETYPES[type], s = d.size, r = d.r;
  const mat = SM(color, 0, { roughness: 0.5, metalness: 0.3 });
  const eye = 0xffd27a;
  if (type === 'robovac') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 24), mat); g.add(body);
    const bump = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.1, 24, 1, true, -1.2, 2.4), M(0x2b2f33)); bump.position.y = -0.04; g.add(bump);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.03, 24), M(0x3a3f45)); top.position.y = 0.14; g.add(top);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 16), M(0x22262a)); dome.position.set(0, 0.19, 0.2); g.add(dome);
    const led = new THREE.Mesh(geoBox, B(0x4ab8ff)); led.scale.set(0.24, 0.03, 0.05); led.position.set(0, 0.16, -0.25); g.add(led);
    for (const sx of [-1, 1]) { const brush = bx(0.04, 0.02, 0.34, 0x9aa4ad, sx * 0.48, -0.12, 0.42); brush.rotation.y = sx * 0.6; g.add(brush); }
    g.userData.mat = mat; g.position.y = 0;
    return g;
  }
  if (type === 'bomber') {
    // a round charge with hazard bands and a fuse light on top
    const b = new THREE.Mesh(geoSphere, mat); b.scale.setScalar(r); g.add(b);
    g.add(bx(r * 2.06, 0.16, 0.16, COL.dark, 0, 0, 0)); g.add(bx(0.16, 0.16, r * 2.06, COL.dark, 0, 0, 0));
    g.add(bx(0.18, 0.3, 0.18, COL.dark, 0, r + 0.1, 0));
    const light = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xff3020 })); light.scale.setScalar(0.2); light.position.y = r + 0.32; g.add(light);
    g.userData.light = light;
  } else if (type === 'splitter' || type === 'splitling') {
    // a jelly-like ball with seams where it will split
    const b = new THREE.Mesh(geoSphere, mat); b.scale.setScalar(r); g.add(b);
    for (const rot of [0, Math.PI / 2]) { const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.05, 4, 18), M(COL.dark)); seam.rotation.y = rot; g.add(seam); }
    g.add(bx(r * 0.8, 0.1, 0.06, eye, 0, r * 0.25, r * 0.95, 0xb07a20));
  } else if (type === 'crawler') {
    if (shape === 'sphere') {
      const b = new THREE.Mesh(geoSphere, mat); b.scale.setScalar(r); g.add(b);
      g.add(bx(r * 0.9, 0.12, 0.08, eye, 0, r * 0.2, r * 0.93, 0xb07a20));
      g.add(bx(r * 2.05, 0.1, 0.1, COL.dark, 0, -r * 0.1, 0));
    } else if (shape === 'dome') {
      const b = new THREE.Mesh(geoDome, mat); b.scale.set(r * 1.15, r * 1.1, r * 1.15); b.position.y = -r * 0.55; g.add(b);
      const base = new THREE.Mesh(geoDisc, M(COL.dark)); base.scale.setScalar(r * 1.15); base.position.y = -r * 0.55; g.add(base);
      g.add(bx(r * 0.8, 0.12, 0.08, eye, 0, -r * 0.05, r * 0.98, 0xb07a20));
    } else {
      const b = new THREE.Mesh(hullBox(), mat); b.scale.setScalar(r * 1.55); g.add(b);
      g.add(bx(r * 0.9, 0.12, 0.06, eye, 0, r * 0.25, r * 0.79, 0xb07a20));
      g.add(bx(r * 1.6, 0.14, r * 1.6, COL.dark, 0, -r * 0.7, 0));
    }
  } else {
    const body = new THREE.Mesh(hullBox(), mat); g.add(body);
    const inner = new THREE.Group(); inner.position.y = d.fly ? 0 : -r; g.add(inner); inner.add(body);   // old meshes were built from the feet up
    if (type === 'brute') {
      body.scale.set(s, s * 0.7, s * 1.2); body.position.y = s * 0.35 + 0.28;
      inner.add(bx(s * 1.05, 0.3, s * 0.95, COL.dark, 0, 0.15, 0));
      inner.add(bx(s * 0.55, 0.12, 0.06, eye, 0, s * 0.45 + 0.28, s * 0.6, 0xb07a20));
      for (let i = -1; i <= 1; i++) inner.add(bx(0.4, 0.8, 0.4, COL.bone, i * 0.8, s * 0.7 + 0.6, 0));
    } else if (type === 'drone') {
      body.scale.set(s, s * 0.5, s);
      inner.add(bx(s * 2, 0.08, s * 0.42, COL.dark, 0, 0.1, 0));
      inner.add(bx(s * 0.5, 0.12, 0.06, eye, 0, 0, s * 0.5, 0xb07a20));
    } else if (type === 'spitter') {
      body.scale.set(s * 0.9, s * 1.2, s * 0.9); body.position.y = s * 0.6 + 0.2;
      inner.add(bx(0.4, 0.4, 0.7, COL.dark, 0, s * 0.9, s * 0.5));
      inner.add(bx(s * 0.9, 0.2, s * 0.9, COL.dark, 0, 0.1, 0));
    } else if (type === 'pig') {
      // a fat golden piggy bank on four stubby legs, coin slot on top
      body.scale.set(s * 1.25, s * 0.95, s * 1.6); body.position.y = s * 0.78 + 0.3;
      inner.add(bx(s * 0.8, s * 0.7, s * 0.55, color, 0, s * 0.78 + 0.25, s * 0.95));                  // snout
      inner.add(bx(s * 0.45, s * 0.3, 0.1, 0xffd9a0, 0, s * 0.72 + 0.25, s * 1.24));
      for (const sx of [-1, 1]) { inner.add(bx(0.4, 0.55, 0.3, color, sx * s * 0.42, s * 1.5, s * 0.6)); for (const sz of [-1, 1]) inner.add(bx(0.55, 0.65, 0.55, color, sx * s * 0.45, 0.33, sz * s * 0.5)); }
      inner.add(bx(s * 0.5, 0.1, 0.12, COL.dark, 0, s * 1.76, 0));
      inner.add(bx(0.18, 0.18, 0.5, color, 0, s * 1.1, -s * 0.95));
      inner.add(bx(0.22, 0.22, 0.08, eye, s * 0.25, s * 1.02, s * 1.0, 0xb07a20)); inner.add(bx(0.22, 0.22, 0.08, eye, -s * 0.25, s * 1.02, s * 1.0, 0xb07a20));
    } else if (type === 'magnetron') {
      // a flat hovering disc ringed by three tall coil pylons with glowing blue caps
      body.scale.set(s * 1.35, s * 0.3, s * 1.35); body.position.y = 2.6;
      inner.add(bx(s * 0.8, 0.5, s * 0.8, COL.dark, 0, 1.9, 0));
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2, x = Math.cos(a) * s * 0.62, z = Math.sin(a) * s * 0.62;
        inner.add(bx(0.7, 3.2, 0.7, COL.dark, x, 4.3, z)); inner.add(bx(1.0, 0.5, 1.0, 0x4ab8ff, x, 6.1, z, 0x1b6a90));
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 4, 12), M(0x9aa4ad)); coil.rotation.x = Math.PI / 2; coil.position.set(x, 4.6, z); inner.add(coil);
      }
      inner.add(bx(s * 0.5, 0.22, 0.1, eye, 0, 2.7, s * 0.68, 0xd09030));
      for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) inner.add(bx(0.8, 0.4, 0.8, 0x4ab8ff, x, 1.5, z, 0x1b6a90));
    } else if (type === 'smelter') {
      // a squat tracked furnace: glowing mouth in front, tall chimney and a vent panel on the back
      body.scale.set(s * 0.95, s * 0.7, s * 1.25); body.position.y = 2.8;
      for (const sx of [-1, 1]) inner.add(bx(1.5, 1.8, s * 1.5, COL.dark, sx * s * 0.62, 0.95, 0));
      inner.add(bx(s * 0.6, 1.5, 0.4, 0xff7a1a, 0, 2.5, s * 0.78, 0xa04010));
      inner.add(bx(1.1, 3.6, 1.1, COL.dark, s * 0.3, 6.2, -s * 0.35)); inner.add(bx(1.4, 0.4, 1.4, 0xf2c230, s * 0.3, 8.1, -s * 0.35, 0x5a4008));
      inner.add(bx(s * 0.55, 1.6, 0.25, 0xff7a1a, 0, 3.3, -s * 0.8, 0xa04010));
      for (let i = 0; i < 4; i++) inner.add(bx(0.5, 0.12, 0.12, i % 2 ? 0xf2c230 : COL.dark, -1.0 + i * 0.7, 5.3, s * 0.1));
    } else if (type === 'hivemother') {
      // a wide-legged spider: small head, huge swollen abdomen with three sockets for egg sacs
      body.scale.set(s * 0.8, s * 0.55, s * 0.9); body.position.y = 2.6;
      const ab = new THREE.Mesh(geoSphere, mat); ab.scale.setScalar(s * 0.75); ab.position.set(0, 3.6, -s * 0.55); inner.add(ab);
      inner.add(bx(s * 0.5, s * 0.4, s * 0.45, COL.dark, 0, 2.7, s * 0.7)); inner.add(bx(s * 0.3, 0.14, 0.08, eye, 0, 2.85, s * 0.96, 0xd09030));
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5, x = Math.cos(a) * 1.4, z = -s * 0.55 + Math.sin(a) * 1.4; const sock = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.14, 4, 10), M(COL.dark)); sock.rotation.x = Math.PI / 2; sock.position.set(x, 6.0, z); inner.add(sock); }
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
        const z = 1.1 - i * 1.5, up = bx(0.4, 0.4, 3.6, COL.dark, sx * 3.2, 3.3, z); up.rotation.z = sx * -0.6; inner.add(up);
        inner.add(bx(0.4, 3.0, 0.4, COL.dark, sx * 4.7, 1.5, z));
      }
    } else if (type === 'sac') {
      const sp = new THREE.Mesh(geoSphere, mat); sp.scale.setScalar(r * 1.15); sp.position.y = r; inner.add(sp);
      inner.add(bx(r * 0.7, 0.14, 0.08, 0xffffff, 0, r + 0.2, r * 1.1, 0x90b020));
    } else if (type === 'warden') {
      body.scale.set(5, 3.4, 4.4); body.position.y = 3.2;
      inner.add(bx(5.4, 1, 4.8, COL.dark, 0, 0.9, 0));
      inner.add(bx(2.4, 1.4, 2, color, 0, 5.6, 0.6));
      for (let i = -1; i <= 1; i++) inner.add(bx(0.5, 0.25, 0.1, eye, i * 0.7, 5.7, 1.65, 0xd09030));
      inner.add(bx(1.4, 3.6, 1.4, COL.dark, 3.4, 3, 0.4)); inner.add(bx(1.4, 3.6, 1.4, COL.dark, -3.4, 3, 0.4));
      for (let i = 0; i < 4; i++) inner.add(bx(0.6, 1.4, 0.6, COL.bone, -1.8 + i * 1.2, 5.4, -1.4));
    }
  }
  g.userData.mat = mat;
  return g;
}
/* ============================================================
   INSTANCED ENEMIES: every enemy of a kind is drawn in one go. Each enemy keeps a bare transform (e.mesh) that
   the game moves, turns and squashes as before; once a frame those transforms are poured into one InstancedMesh
   per piece (body, eyes, trim...) across all enemies. ~640 enemies cost a few dozen draw calls instead of thousands.
   ============================================================ */
const ENEMY_TPL = new Map(), ENEMY_BATCH = new Map();
function enemyTemplate(type, shape) {
  const key = type + ':' + (shape || '');
  let T = ENEMY_TPL.get(key); if (T) return T;
  const g = makeEnemyMesh(type, new THREE.Color(0xffffff), shape);
  g.updateMatrixWorld(true);
  T = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    const role = o.material === g.userData.mat ? 'body' : o === g.userData.light ? 'light' : 'fixed';
    const mat = o.material, bkey = role === 'body' ? 'body|' + o.geometry.uuid : role + '|' + o.geometry.uuid + '|' + mat.uuid;
    T.push({ local: o.matrixWorld.clone(), role, color: mat.color.clone(), bkey, geo: o.geometry, mat });
  });
  ENEMY_TPL.set(key, T);
  return T;
}
function enemyBatch(part) {
  let b = ENEMY_BATCH.get(part.bkey); if (b) return b;
  let mat;
  if (part.role === 'body') mat = SM(0xffffff, 0, { roughness: 0.5, metalness: 0.3 });
  else { mat = part.mat.clone(); mat.color = new THREE.Color(0xffffff); }
  const fmat = mat.clone(); fmat.transparent = true; fmat.opacity = 0.22; fmat.depthWrite = false;
  const tris = part.geo.index ? part.geo.index.count / 3 : part.geo.attributes.position.count / 3;
  b = { part, mat, fmat, cap: 0, mesh: null, fade: null, ns: null, lo: null, sh: null, n: 0, nf: 0, nn: 0, nl: 0, nsh: 0, heavy: part.role === 'body' && tris > HEAVY_TRIS };
  ENEMY_BATCH.set(part.bkey, b);
  growBatch(b, 128);
  return b;
}
/* The hull body (cube crawlers, drones, spitters, brutes) is 2,384 triangles, and anything near you was drawn twice
   (once more into the shadow map): a 640-strong horde was over a million triangles a frame. Heavy bodies now get:
     mesh  the full model, only within LOD_NEAR of the camera
     lo    a plain box of the same size beyond that (the grooves are sub-pixel there)
     sh    a box drawn only into the shadow map (never on screen), so no heavy body is ever rendered twice
   Light bodies (balls, domes) keep the old trio: mesh (casts a shadow), ns (out of shadow range), fade (see-through). */
const HEAVY_TRIS = 400, LOD_NEAR = 20;
const _loGeo = new Map();
function lowGeoFor(geo) {
  let g = _loGeo.get(geo.uuid); if (g) return g;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  g = new THREE.BoxGeometry(sx * 0.94, sy * 0.94, sz * 0.94);       // a touch smaller: the real hull's corners are cut
  g.translate((bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2);
  _loGeo.set(geo.uuid, g); return g;
}
const _shadowOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function growBatch(b, cap) {
  const old = {};
  for (const k of ['mesh', 'fade', 'ns', 'lo', 'sh']) if (b[k]) { old[k] = b[k]; scene.remove(b[k]); }
  const mk = (geo, m, shadow, key) => {
    const im = new THREE.InstancedMesh(geo, m, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color()); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.count = 0;
    // growing mid-frame keeps what has already been written this frame
    const o = old[key]; if (o) { im.instanceMatrix.array.set(o.instanceMatrix.array); im.instanceColor.array.set(o.instanceColor.array); o.dispose && o.dispose(); }
    scene.add(im);
    im.castShadow = shadow; im.receiveShadow = !m.isMeshBasicMaterial;
    return im;
  };
  const geo = b.part.geo, body = b.part.role === 'body';
  b.cap = cap;
  if (b.heavy) {
    b.mesh = mk(geo, b.mat, false, 'mesh');
    b.lo = mk(lowGeoFor(geo), b.mat, false, 'lo');
    b.sh = mk(lowGeoFor(geo), _shadowOnlyMat, true, 'sh'); b.sh.receiveShadow = false;
    b.fade = mk(geo, b.fmat, false, 'fade'); b.ns = null;
  } else {
    b.mesh = mk(geo, b.mat, body, 'mesh');     // only bodies cast shadows: trim and eyes would double the shadow pass for nothing
    b.fade = mk(geo, b.fmat, false, 'fade');
    b.ns = body ? mk(geo, b.mat, false, 'ns') : null;
  }
}
const SHADOW_REACH = 38;     // a bit past the sun's shadow box (34 m each way round the player)
const _em4 = new THREE.Matrix4(), _ec = new THREE.Color(), _eWhite = new THREE.Color(1, 1, 1), _eIce = new THREE.Color(0.62, 0.86, 1);
const _frustum = new THREE.Frustum(), _fpm = new THREE.Matrix4(), _fsph = new THREE.Sphere();
const EB_KEYS = ['mesh', 'fade', 'ns', 'lo', 'sh'], EB_CNT = ['n', 'nf', 'nn', 'nl', 'nsh'];
const ebPut = (b, key, cnt, m, c) => {
  if (b[cnt] >= b.cap) growBatch(b, b.cap * 2);
  const im = b[key], i = b[cnt]++;
  im.instanceMatrix.array.set(m.elements, i * 16);
  const ca = im.instanceColor.array, o = i * 3; ca[o] = c.r; ca[o + 1] = c.g; ca[o + 2] = c.b;
};
function updateEnemyBatches() {
  for (const b of ENEMY_BATCH.values()) { b.n = 0; b.nf = 0; b.nn = 0; b.nl = 0; b.nsh = 0; }
  camera.updateMatrixWorld();
  _frustum.setFromProjectionMatrix(_fpm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const cp = camera.position, pp = player.pos;
  // in a huge crowd only the enemies fairly close to you cast shadows (further out they are a few dark pixels under a sea of bodies)
  const trim2 = enemies.length > 900 ? 42 * 42 : enemies.length > 450 ? 58 * 58 : 75 * 75;     // eyes and trim are dropped sooner in a big crowd
  const shReach = enemies.length > 1100 ? 20 : enemies.length > 700 ? 26 : SHADOW_REACH;
  for (let q = 0; q < enemies.length; q++) {
    const e = enemies[q];
    if (e.dead || !e.tpl) continue;
    const px = e.mesh, P = px.position;
    const inShadow = Math.abs(P.x - pp.x) <= shReach && Math.abs(P.z - pp.z) <= shReach;
    // off screen: nothing to draw (its shadow can still fall into view, so that stays while it's in shadow range)
    _fsph.center.copy(P); _fsph.radius = e.r * 2.2 + 0.6;
    const seen = e.boss || _frustum.intersectsSphere(_fsph);
    e.seen = seen;
    if (!seen && !inShadow) continue;
    px.updateMatrix();
    // between its own (staggered) thinking steps a distant enemy keeps gliding the way it was going
    if (e.lodAcc > 0) { const te = px.matrix.elements; te[12] += e.vel.x * e.lodAcc; te[14] += e.vel.z * e.lodAcc; }
    const ud = px.userData, flash = ud.mat.emissive.r > 0.3, chill = !flash && ud.mat.emissive.b > 0.3;
    const cd2 = P.distanceToSquared(cp), far = cd2 > trim2 && !e.boss, faded = !!e.faded;
    const tpl = e.tpl;
    for (let t = 0; t < tpl.length; t++) {
      const part = tpl[t], role = part.role;
      if (role !== 'body' && (far || !seen)) continue;          // eyes and trim: a few pixels at range, and they cast no shadow
      const b = part.batch || (part.batch = enemyBatch(part));
      _em4.multiplyMatrices(px.matrix, part.local);
      if (role === 'body') { _ec.copy(e.color); if (flash) _ec.lerp(_eWhite, 0.6); else if (chill) _ec.lerp(_eIce, 0.45); }
      else if (role === 'light') _ec.copy(ud.light.material.color);
      else { _ec.copy(part.color); if (flash) _ec.lerp(_eWhite, 0.4); }
      if (b.heavy) {
        if (seen) { if (faded) ebPut(b, 'fade', 'nf', _em4, _ec); else if (cd2 > LOD_NEAR * LOD_NEAR && !e.boss && !e.mini) ebPut(b, 'lo', 'nl', _em4, _ec); else ebPut(b, 'mesh', 'n', _em4, _ec); }
        if (inShadow && !faded) ebPut(b, 'sh', 'nsh', _em4, _ec);
      } else if (faded) { if (seen) ebPut(b, 'fade', 'nf', _em4, _ec); }
      else if (b.ns && !inShadow) ebPut(b, 'ns', 'nn', _em4, _ec);
      else if (seen || role === 'body') ebPut(b, 'mesh', 'n', _em4, _ec);
    }
  }
  for (const b of ENEMY_BATCH.values()) {
    for (let k = 0; k < 5; k++) {
      const im = b[EB_KEYS[k]]; if (!im) continue;
      const n = b[EB_CNT[k]];
      im.count = n; im.visible = n > 0;
      if (n) {
        im.instanceMatrix.updateRange.offset = 0; im.instanceMatrix.updateRange.count = n * 16; im.instanceMatrix.needsUpdate = true;
        im.instanceColor.updateRange.offset = 0; im.instanceColor.updateRange.count = n * 3; im.instanceColor.needsUpdate = true;
      }
    }
  }
}
/* the stand-in each enemy carries: just a transform plus the bits of state the game pokes (flash, chill, the bomber's light) */
function enemyProxy(type, shape) {
  const p = new THREE.Object3D();
  p.userData.mat = { color: new THREE.Color(), emissive: new THREE.Color(0, 0, 0) };
  if (type === 'bomber') p.userData.light = { material: { color: new THREE.Color(0xff3020) } };
  return p;
}
const aimPt = e => new THREE.Vector3(e.pos.x, e.pos.y + (e.d.fly ? 0 : e.r * 0.9 + (e.boss ? 2 : 0)), e.pos.z);
/* the same point written into one shared vector: for hot loops that use it straight away (no new object per enemy per frame) */
const _apt = new THREE.Vector3();
const aimPtT = e => _apt.set(e.pos.x, e.pos.y + (e.d.fly ? 0 : e.r * 0.9 + (e.boss ? 2 : 0)), e.pos.z);

function spawnPoint(minD, maxD) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(minD, maxD);
    const k = idxOf(player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d);
    if (k >= 0 && inner(k) && flow[k] < 1e8) return { x: cellX(k) + rand(-1, 1), z: cellZ(k) + rand(-1, 1), y: H[k] };
  }
  let k; do { k = (Math.random() * NC) | 0; } while (!inner(k));
  return { x: cellX(k), z: cellZ(k), y: H[k] };
}
// each stage: much more health, harder hits, a bit faster
/* STAGE CLOCK: 10 minutes of ACTIVE combat (the clock only runs in 'play', so inventory, level-ups, cases, shop and menus stop it).
   One boss arrives at BOSS_AT. At STAGE_LEN, if the boss still lives, OVERTIME starts and lasts until it is defeated:
   no failure, no despawn, no second boss. Enemy progression used to run on a 15:00 clock; oldT() maps the new clock onto it. */
const STAGE_LEN = 600, BOSS_AT = 510, TIME_K = 900 / STAGE_LEN;
const OVERTIME_T = STAGE_LEN;
const oldT = () => S.test ? 0 : S.t * TIME_K;
const overtime = () => (S.test || !S.boss || S.boss.type === 'pig') ? 0 : Math.max(0, S.t - OVERTIME_T);
/* ordinary spawn density: a slow start, then a gentle wave (about 70 s) around a mean tuned so the stage pays ~75% of the old 15:00 rewards */
const DENSITY_MEAN = 1.12;
function densityMul() { const t = S.t; return DENSITY_MEAN * Math.min(1, 0.5 + t / 90 * 0.5) * (1 + 0.2 * Math.sin(t * 2 * Math.PI / 70 + 1)); }
/* bosses that can be chosen at BOSS_AT (more are added by later chunks); minStage keeps harder ones out of early stages */
const BOSS_POOL = [
  { type: 'warden', minStage: 1, w: 1 }, { type: 'magnetron', minStage: 1, w: 1 }, { type: 'smelter', minStage: 1, w: 1 },
  { type: 'hivemother', minStage: 1, w: 1 }, { type: 'pig', minStage: 1, w: 0.12 },       // the Golden Pig is very rare
];
function pickBoss() {
  const ok = BOSS_POOL.filter(b => S.stage >= b.minStage), tot = ok.reduce((t, b) => t + b.w, 0);
  let x = Math.random() * tot; for (const b of ok) { x -= b.w; if (x <= 0) return b.type; }
  return ok[ok.length - 1].type;
}
function overtimeMul() { const o = overtime(); return o <= 0 ? null : { hp: 2 + o / 30, dmg: 1.5 + o / 90, spd: Math.min(1.35, 1.1 + o / 600), rate: 1.8 + o / 25 }; }
function scaling() { const s = scalingBase(), ot = overtimeMul(); if (ot) { s.hp *= ot.hp; s.dmg *= ot.dmg; s.spd *= ot.spd; } return s; }
function scalingBase() { const k = S.stage - 1, T = oldT(); return { hp: (1 + T / 130) * (1 + k * 1.1) * Math.pow(1.12, k), dmg: (1 + T / 600) * (1 + k * 0.45), spd: 1 + Math.min(0.35, T / 1800) + k * 0.07 }; }
// each stage repaints the swarm: stage 1 keeps the original colours, later stages rotate the hue (and stay clear of the ground colour)
function stageHueShift() {
  const k = S.stage - 1; if (k <= 0) return 0;
  let sh = (k * 0.381966) % 1;
  const crawlerH = (new THREE.Color(ETYPES.crawler.color).getHSL({}).h + sh) % 1;
  let d = Math.abs(crawlerH - LEVEL_PAL.hue); d = Math.min(d, 1 - d);
  if (d < 0.14) sh = (sh + 0.3) % 1;
  return sh;
}
function tierColor(base) { const c = new THREE.Color(base); c.offsetHSL(stageHueShift(), S.stage > 1 ? 0.08 : 0, -0.06 * Math.min(3, Math.floor(S.t / 300))); return c; }

function spawnEnemy(type, p, extra) {
  const d = ETYPES[type], sc = d.boss ? scalingBase() : scaling();      // the Warden isn't pumped up by overtime
  const shape = type === 'crawler' ? (extra && extra.shape) || pick(CRAWLER_SHAPES) : null;
  const e = {
    type, d, shape, pos: new THREE.Vector3(p.x, p.y, p.z), vel: new THREE.Vector3(), r: d.r, mass: d.mass || 1, onGround: false, support: false,
    // many more of them, each much easier to kill (bosses unchanged)
    hp: d.hp * sc.hp * (d.boss || d.mini ? 1 : 0.45) * (extra && extra.hpMul || 1), speed: d.speed * sc.spd * rand(0.9, 1.1), dmg: d.dmg * sc.dmg,
    hitCd: 0, flash: 0, cd: rand(1, 2.5), sawCd: 0, bob: Math.random() * 6, state: {},
    q: new THREE.Quaternion(), spin: new THREE.Vector3(), stun: 0, roll: shape === 'sphere',
    direct: Math.random() < 0.85,       // most come straight at you (climbing anything in the way); the rest follow the paths
    /* Every field an enemy can ever carry is declared here, in one fixed order. It looks like bookkeeping but it is the
       single biggest speed-up in the enemy code: fields that were added later, on whichever enemy happened to climb, burn
       or get shoved first, gave the engine ~100 different object layouts for 'an enemy', so every e.something in the hot
       loops was a slow dictionary-style lookup that also allocated memory (hundreds of MB a minute at 1,300 enemies,
       and the garbage collector pauses that go with it). With one layout those reads are a single memory load.
       If you add a new per-enemy field anywhere, add it here too. */
    maxHp: 0, elite: false, mini: false, boss: false, dead: false, color: null, tpl: null, mesh: null, bar: null, barName: null, sBase: 1,
    lodPh: (Math.random() * 12) | 0, lodAcc: 0, ldt: 0, shoved: false, cgI: 0, cgJ: 0, seen: true, faded: false,
    chillT: 0, chillMul: 0, freezeT: 0, burnT: 0, burnDps: 0, pois: null, zapT: 0, pullT: 0, vacT: 0, flT: 0, flx: 0, flz: 0,
    wantX: 0, wantZ: 0, landed: false, bumped: false, sq: 0, sqV: 0, climbT: 0, wnx: undefined, wnz: 0, bouncy: false,
    stand: false, steer: null, steerSpd: 0, goal: null, thrown: null, held: null, attach: null, leap: null, cele: null, fuse: undefined,
    yawLast: 0, noSpawn: false, hidden: false, sacT: 0, toxBlast: false, shockCd: 0, sawT: null, patchCd: 0, neuroCd: 0, meleeT: null, haloCd: 0, ate: 0,
  };
  if (extra && extra.elite) {
    e.elite = true; e.hp *= ELITE.hpMul; e.r *= ELITE.sizeMul; e.mass *= ELITE.massMul; e.dmg *= ELITE.dmgMul; e.speed *= 0.9;
  }
  e.maxHp = e.hp;
  if (d.fly) e.pos.y = Math.max(p.y + 2, player.pos.y + rand(3, 12));
  // drawn instanced with every other enemy of its kind (see updateEnemyBatches)
  e.color = e.elite ? new THREE.Color(ELITE.color) : d.passive ? new THREE.Color(d.color) : tierColor(d.color);
  // overtime-buffed enemies drain toward black or white (picked per-enemy, so the swarm is a mix of the two), deeper the longer overtime runs
  if (!e.elite && !d.passive && overtime() > 0) e.color.lerp(new THREE.Color(Math.random() < 0.5 ? 0x000000 : 0xffffff), Math.min(0.75, 0.25 + overtime() / 120));
  e.tpl = enemyTemplate(type, shape);
  e.mesh = enemyProxy(type, shape); e.mesh.userData.mat.color.copy(e.color);
  if (e.elite) { e.mesh.scale.setScalar(ELITE.sizeMul); e.bar = makeHealthBar(); }
  e.sBase = e.mesh.scale.x;
  e.mesh.position.copy(e.pos);
  enemies.push(e);
  return e;
}
/* Basic crawlers arrive in small packs that share a shape. */
function spawnPack(p, n, extra) {
  const shape = pick(CRAWLER_SHAPES);
  const eliteAt = Math.random() < ELITE.chance * (1 + (stats.luck || 0) * 0.01) && oldT() > 20 ? 0 : -1;
  for (let i = 0; i < n; i++) {
    const x = p.x + rand(-2.2, 2.2), z = p.z + rand(-2.2, 2.2), k = idxOf(x, z);
    if (k < 0 || !inner(k)) continue;
    spawnEnemy('crawler', { x, z, y: H[k] + i * 0.3 }, Object.assign({ shape, elite: i === eliteAt }, extra || {}));
  }
}
/* the most enemies alive at once in a run. It was 640; the horde now costs well under half of what it did per enemy. */
const ENEMY_CAP = 1300;
function spawnTick(dt) {
  if (S.test || enemies.length >= ENEMY_CAP) return;      // the test range only spawns what you ask for
  // twice the swarm of the original tuning (each enemy just as tough)
  let rate = 2 * 2.2 * (0.75 + oldT() / 60 * 0.33 + (S.stage - 1) * 0.5) * (1 + 0.35 * (S.stage - 1)) * densityMul();
  const ot = overtimeMul();
  if (ot) rate *= ot.rate;                 // overtime: faster and faster
  else if (S.boss) rate *= 0.55;
  S.spawnAcc += rate * dt;
  const oT = oldT();
  while (S.spawnAcc >= 1) {
    if (enemies.length >= ENEMY_CAP) { S.spawnAcc = 0; break; }      // at the cap: don't bank spawns for a burst later
    const r = Math.random();
    if (oT > 40 && r < 0.035) { S.spawnAcc -= 1; spawnEnemy('bomber', spawnPoint(28, 55)); }
    else if (oT > 75 && r < 0.085) { S.spawnAcc -= 1; spawnEnemy('splitter', spawnPoint(28, 55)); }
    else if (oT > 60 && r < 0.22) { S.spawnAcc -= 1; spawnEnemy('drone', spawnPoint(28, 55)); }
    else if (oT > 150 && r < 0.36) { S.spawnAcc -= 1; spawnEnemy('spitter', spawnPoint(28, 55)); }
    else { const n = 3 + Math.floor(Math.random() * 4); S.spawnAcc -= n * 0.8; spawnPack(spawnPoint(28, 55), n); }
  }
}
const DIRS = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'];
function dirName(a) { const deg = (Math.atan2(Math.cos(a), -Math.sin(a)) * 180 / Math.PI + 360) % 360; return DIRS[Math.round(deg / 45) % 8]; }
function spawnHorde(h) {
  const n = Math.round(2 * 1.8 * (36 + S.stage * 8 + Math.floor(oldT() / 60) * 2) * (1 + 0.25 * (S.stage - 1)) * 0.75);
  for (let i = 0; i < n; i++) {
    const a = h.ang + rand(-0.5, 0.5), d = rand(32, 46);
    const x = clamp(player.pos.x + Math.cos(a) * d, -HALF + 4, HALF - 4), z = clamp(player.pos.z + Math.sin(a) * d, -HALF + 4, HALF - 4), k = idxOf(x, z);
    if (k < 0 || !inner(k)) continue;
    if (Math.random() < 0.18 && oldT() > 60) { spawnEnemy('drone', { x, z, y: H[k] }, { hpMul: 0.8 }); continue; }
    if (Math.random() < 0.05) { spawnEnemy('bomber', { x, z, y: H[k] }); continue; }
    const pack = 4 + Math.floor(Math.random() * 4);
    spawnPack({ x, z }, pack, { hpMul: 0.8 }); i += pack - 1;
  }
}
function spawnMini() {
  const e = spawnEnemy('brute', spawnPoint(25, 40), { hpMul: 1 + (S.nextMini / 200 - 1) * 0.6 });
  e.mini = true; S.mini = e;
  banner('BRUTE', '', 'var(--hostile)', 2.5);
  discoverEnemy('brute');
}
function spawnBoss(type = pickBoss()) {
  if (S.bossSpawned) return;
  S.bossSpawned = true;
  discoverEnemy(type);
  let p;
  if (S.gate) {
    const a = Math.random() * Math.PI * 2, x = S.gate.x + Math.cos(a) * 10, z = S.gate.z + Math.sin(a) * 10, k = idxOf(x, z);
    p = (k >= 0 && inner(k)) ? { x, z, y: H[k] } : spawnPoint(20, 30);
  } else p = spawnPoint(20, 32);
  const e = spawnEnemy(type, p);
  if (type === 'warden') e.pos.y += 45;                      // the Warden drops in from the sky; the others walk in
  e.boss = true; e.state = type === 'warden' ? { volley: 4, slam: 8, summon: 12, slamming: true } : {};
  // every boss scales with the stage and the (compressed) clock; the same formula for all of them
  e.maxHp = e.hp = ETYPES[type].hp * (1 + (S.stage - 1) * 0.9) * (1 + Math.max(0, oldT() - 300) / 1200);
  S.boss = e;
  const bn = ((typeof ENEMY_NAMES !== 'undefined' && ENEMY_NAMES[type]) || type).toUpperCase();
  updateBossBars();   // show the bar immediately rather than waiting for the next HUD tick
  if (type === 'pig') { pigStart(e); banner(bn, 'Hit it for bolts · it will escape', '#f2c230', 3.5); }
  else banner(bn, BOSS_HINT[type] || 'Kill it · exit opens', 'var(--hostile)', 3.5);
}

/* ============================================================
   ENEMY PHYSICS
   Every enemy is a ball with mass. They walk by pushing their velocity toward where they want to go,
   but only while standing on something (ground or another enemy). Hits and blasts add velocity;
   anything knocked into the air tumbles until it lands. Packed crowds climb over each other and pile up.
   ============================================================ */
const EGRAV = 30, CLIMB_SPEED = 3.4, CLIMB_MUL = 0.75;   // climbing speed = 75% of walking speed
const _eu = new THREE.Vector3(), _eq = new THREE.Quaternion();
const ecenter = e => _eu.set(e.pos.x, e.pos.y + (e.d.fly ? 0 : e.r), e.pos.z);
/* Push an enemy: dir (normalised) * strength, scaled by its mass. */
/* flinch: the enemy snaps back along the hit's direction for a moment and squashes (looks only; knockback is separate) */
function flinch(e, dir, power) {
  if (e.dead || e.boss) return;
  const l = Math.hypot(dir.x, dir.z) || 1, k = clamp(power, 0.1, 0.5) / Math.sqrt(Math.max(0.5, e.mass));
  e.flx = dir.x / l * k; e.flz = dir.z / l * k; e.flT = 0.14;
}
/* a flying enemy that dies doesn't just vanish: its wreck keeps its momentum, its thruster stays jammed on,
   it tumbles and smokes its way down, then crashes in a little fireball that clips anything it lands on */
let WRECKS = 0;
function droneCrash(e) {
  if (WRECKS >= 24) return;                         // plenty in the air already: the rest just pop
  WRECKS++;
  const g = makeEnemyMesh(e.type, e.color ? e.color.clone().multiplyScalar(0.55) : new THREE.Color(0x553355), e.shape);
  g.position.copy(e.mesh.position); g.quaternion.copy(e.mesh.quaternion); g.scale.copy(e.mesh.scale);
  g.traverse(o => { o.userData.noShadow = true; if (o.isMesh) o.castShadow = false; });      // (noShadow: adding it to the scene would switch shadows back on)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
  const v = e.vel.clone().multiplyScalar(0.7).addScaledVector(fwd, rand(4, 8)); v.y += rand(1, 4);
  const w = new THREE.Vector3(rand(-5, 5), rand(-9, 9), rand(-5, 5));
  let thrust = rand(10, 16), puffT = 0;
  const flame = new THREE.Mesh(geoBox, B(0xff8a2a)); flame.scale.set(0.18, 0.18, 0.5); flame.position.z = -0.45; g.add(flame);
  addFx(g, 3.5, (f, dt) => {
    const o = f.obj;
    // the jammed thruster shoves it along wherever it's pointing as it spins
    o.getWorldDirection(fwd); v.addScaledVector(fwd, thrust * dt); thrust = Math.max(0, thrust - dt * 6);
    v.y -= 20 * dt; v.multiplyScalar(1 - 0.25 * dt);
    o.position.addScaledVector(v, dt);
    o.rotation.x += w.x * dt; o.rotation.y += w.y * dt; o.rotation.z += w.z * dt;
    flame.visible = thrust > 0.5 && Math.random() < 0.85; flame.scale.z = 0.3 + Math.random() * 0.5;
    if ((puffT -= dt) <= 0) { puffT = 0.05; smokePuff(o.position.clone(), rand(0.3, 0.55)); if (Math.random() < 0.5) spark(o.position.clone(), 0xffa040); }
    const gy = groundAt(o.position.x, o.position.z);
    if (o.position.y < gy + 0.35 || f.life < 0.05) {
      const p = new THREE.Vector3(o.position.x, Math.max(gy, o.position.y), o.position.z);
      blast(p.clone().setY(p.y + 0.4), 1.6, 0xffa040); dust(p, 6); burst(p.clone().setY(p.y + 0.3), 0x8a6a5a, 8);
      for (let i = 0; i < 3; i++) stain(p.x + rand(-1, 1), p.z + rand(-1, 1), rand(0.4, 0.8), new THREE.Color(0x1a1412));
      DMG_SRC = null;
      envDmg(() => { for (const o2 of enemies) if (!o2.dead && o2.pos.distanceToSquared(p) < 2.6 * 2.6) { damage(o2, 14 * scaling().hp * 0.45); knock(o2, o2.pos.clone().sub(p).setY(0).normalize(), 3, 3); } });
      sfx('boom', 0.25); WRECKS--; f.life = 0; f.done = true;
    }
  });
}
function knock(e, dir, strength, lift = 0) {
  if (e.dead) return;
  if (e.boss) { strength *= 0.1; lift = 0; }       // bosses barely budge: no launching, no tumbling, no stunlock
  flinch(e, dir, 0.12 + strength * 0.05);
  strength *= 1.4; lift *= 1.25;                 // enemies get thrown around a bit more
  const k = strength / e.mass;
  e.vel.addScaledVector(dir, k);
  e.vel.y = Math.min(e.vel.y + lift * 0.6 / e.mass, Math.max(e.vel.y, 9));    // thrown, but not sky-high
  if (k + lift / e.mass > 3) { e.stun = Math.min(1.2, 0.25 + k * 0.05); e.onGround = false; }
  e.spin.add(new THREE.Vector3(dir.z, rand(-1, 1), -dir.x).multiplyScalar(k * 1.2));
}
const _steer = [0, 0];
function enemySteer(e, dx, dz, hd) {
  const k = idxOf(e.pos.x, e.pos.z);
  if (hd < 5 || k < 0 || flow[k] <= 1 || flow[k] >= 1e8) { _steer[0] = dx / (hd || 1); _steer[1] = dz / (hd || 1); return _steer; }
  let best = k, bv = flow[k];
  const i = k % GRID, j = (k / GRID) | 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const n = (j + dj) * GRID + i + di;
    if (!inner(n) || H[n] - H[k] > CLIMB) continue;
    if (di && dj) { const a = j * GRID + i + di, b = (j + dj) * GRID + i; if (H[a] - H[k] > CLIMB || H[b] - H[k] > CLIMB) continue; }
    if (flow[n] < bv) { bv = flow[n]; best = n; }
  }
  let mx = cellX(best) - e.pos.x, mz = cellZ(best) - e.pos.z; const l = Math.hypot(mx, mz) || 1;
  _steer[0] = mx / l; _steer[1] = mz / l; return _steer;
}
/* ---------- the enemy grid: who is near a point, without walking the whole horde ----------
   Rebuilt once a step (end of updateEnemies) into 4 m cells. Shots, explosions and target searches ask it for the
   handful of enemies around them: with 640 enemies and 150 bullets that was ~100,000 distance tests a step, and it grew
   with shots x enemies. egBox() fills (and returns) `out` with every living enemy in the cells touching the box, grown
   by the biggest enemy radius so nothing straddling a cell edge is missed. Anything spawned since the last rebuild is
   picked up next step. Callers that can run inside each other (explosions) pass their own array. */
const EG = { cell: 4, n: 0, cells: null, used: [], maxR: 1, ok: false };
function egReset() { if (EG.cells) for (const k of EG.used) EG.cells[k].length = 0; EG.used.length = 0; EG.ok = false; }
function egBuild() {
  const n = Math.ceil(HALF * 2 / EG.cell) + 2, inv = 1 / EG.cell;
  if (EG.n !== n) { EG.n = n; EG.cells = Array.from({ length: n * n }, () => []); EG.used.length = 0; }
  const cells = EG.cells, used = EG.used;
  for (let u = 0; u < used.length; u++) cells[used[u]].length = 0;
  used.length = 0;
  let mr = 0.7;
  for (let q = 0; q < enemies.length; q++) {
    const e = enemies[q]; if (e.dead) continue;
    const x = e.pos.x, z = e.pos.z; if (!(x === x && z === z)) continue;
    let i = ((x + HALF) * inv | 0) + 1, j = ((z + HALF) * inv | 0) + 1;
    i = i < 0 ? 0 : i >= n ? n - 1 : i; j = j < 0 ? 0 : j >= n ? n - 1 : j;
    const k = j * n + i, c = cells[k]; if (!c.length) used.push(k); c.push(e);
    const r = e.r + (e.boss ? 1.6 : 0); if (r > mr) mr = r;
  }
  EG.maxR = mr; EG.ok = true;
}
const _egOut = [];
function egBox(x0, x1, z0, z1, out = _egOut) {
  out.length = 0;
  if (!EG.ok) { for (let q = 0; q < enemies.length; q++) if (!enemies[q].dead) out.push(enemies[q]); return out; }
  const n = EG.n, inv = 1 / EG.cell, pad = EG.maxR + 1, cells = EG.cells;
  let i0 = ((x0 - pad + HALF) * inv | 0), i1 = ((x1 + pad + HALF) * inv | 0) + 2, j0 = ((z0 - pad + HALF) * inv | 0), j1 = ((z1 + pad + HALF) * inv | 0) + 2;
  if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 > n - 1) i1 = n - 1; if (j1 > n - 1) j1 = n - 1;
  for (let j = j0; j <= j1; j++) for (let i = i0, k = j * n + i0; i <= i1; i++, k++) {
    const c = cells[k];
    for (let q = 0; q < c.length; q++) if (!c[q].dead) out.push(c[q]);
  }
  return out;
}
const egNear = (x, z, r, out) => egBox(x - r, x + r, z - r, z + r, out);
/* far-off enemies (past LOD_FAR, not bosses) think every other step with twice the time step: nobody can tell at that range */
let LOD_FAR = 50, EN_STEP = 0;
function updateEnemies(dtAll) {
  cullTick();
  const pp = player.pos, hold = S.test && DEV.hold ? 0 : 1;     // test range: enemies can be told to stand still
  // the bigger the crowd, the closer the full-rate ring is drawn in (the fight right around you never thins out)
  const nAll = enemies.length, midR = nAll > 900 ? 14 : nAll > 450 ? 20 : 30, midR2 = midR * midR, stepN = (EN_STEP = (EN_STEP + 1) % 6000);
  // past 900 a third ring opens at 30 m (every 3rd step) and the far field drops to every 4th
  const outR2 = nAll > 900 ? 30 * 30 : LOD_FAR * LOD_FAR, farN = nAll > 900 ? 4 : 3;
  for (const e of enemies) {
    let dt = dtAll;
    if (!isFinite(e.pos.x + e.pos.y + e.pos.z + e.vel.x + e.vel.y + e.vel.z)) { const sp = spawnPoint(20, 40); e.pos.set(sp.x, sp.y, sp.z); e.vel.set(0, 0, 0); e.spin.set(0, 0, 0); }
    if (!e.boss && !e.mini && !e.dead) {
      // thinking rate by range: every step up close, every 2nd in the middle distance, every 3rd far off. The steps it
      // sits out are added to its next one (so it covers the same ground), each enemy has its own phase so the work is
      // spread evenly, and updateEnemyBatches() glides the drawn position along in between. Anything knocked about,
      // thrown or stunned keeps full rate so the physics stays crisp.
      const fx = e.pos.x - pp.x, fz = e.pos.z - pp.z, d2 = fx * fx + fz * fz;
      const every = (e.stun > 0 || e.thrown || e.held || e.attach || e.leap) ? 1 : d2 > LOD_FAR * LOD_FAR ? farN : d2 > outR2 ? 3 : d2 > midR2 ? 2 : 1;
      if (every > 1) {
        if (e.lodPh === undefined) e.lodPh = (Math.random() * 12) | 0;
        e.lodAcc = (e.lodAcc || 0) + dtAll;
        if ((stepN + e.lodPh) % every !== 0) { e.ldt = 0; continue; }
        dt = e.lodAcc; e.lodAcc = 0;
      } else if (e.lodAcc) { dt = dtAll + e.lodAcc; e.lodAcc = 0; }
    }
    e.ldt = dt;
    const d = e.d;
    if (e.boss) e.stun = Math.min(e.stun, 0);
    if (e.held) { heldTick(e, dt); continue; }                    // gripped by the Warden
    if (e.attach) { attachTick(e, dt); continue; }                // a Hive Mother's sac rides on its back
    if (e.leap) { pigLeapTick(e, dt); continue; }
    e.hitCd -= dt; e.flash = Math.max(0, e.flash - dt); e.sawCd -= dt; e.stun -= dt; e.chillT = (e.chillT || 0) - dt; e.freezeT = (e.freezeT || 0) - dt;
    if (e.chillT > 0 && Math.random() < dt * 6) spark(ecenter(e).clone().add(new THREE.Vector3(rand(-.4, .4), rand(0, .6), rand(-.4, .4))), 0xbfe9ff);
    if (e.pois) { poisonTick(e, dt); if (e.dead) continue; }
    if (e.burnT > 0) {
      e.burnT -= dt; e.hp -= e.burnDps * dt;
      if (Math.random() < dt * 14) spark(ecenter(e).clone().add(new THREE.Vector3(rand(-.4, .4), rand(0, .6), rand(-.4, .4))), Math.random() < 0.5 ? 0xff5a2a : 0xffc04a);
      if (e.hp <= 0) { killEnemy(e); continue; }
      if (e.burnT <= 0) e.burnDps = 0;
    }
    const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, dy = (pp.y + 1.3) - (e.pos.y + (d.fly ? 0 : e.r)), hd = Math.hypot(dx, dz);
    if (e.cele) celeTick(e, dt);                                  // after the frame goes down: stand still, a few hop and chirp
    if (d.fly) {
      e.bob += dt * 3;
      const ty = e.cele ? e.cele.y + (e.cele.quiet ? 0 : Math.abs(Math.sin(e.bob * 2)) * 1.4) : pp.y + 1.8 + Math.sin(e.bob) * 0.8;
      const len = Math.max(0.001, Math.hypot(dx, ty - e.pos.y, dz)), sp = (e.cele ? 0 : e.speed) * hold * (e.freezeT > 0 ? 0 : e.chillT > 0 ? e.chillMul || 0.5 : 1);
      const steer = e.stun > 0 ? 0.6 : 2.5;
      e.vel.x = lerp(e.vel.x, dx / len * sp, dt * steer); e.vel.z = lerp(e.vel.z, dz / len * sp, dt * steer); e.vel.y = lerp(e.vel.y, (ty - e.pos.y) / len * sp, dt * steer);
      const nx = e.pos.x + e.vel.x * dt, nz = e.pos.z + e.vel.z * dt;
      if (groundAt(nx, nz) > e.pos.y - 0.4) { e.vel.y = Math.max(e.vel.y, 6); e.vel.x *= -0.3; e.vel.z *= -0.3; } else { e.pos.x = nx; e.pos.z = nz; }
      e.pos.y += e.vel.y * dt;
      e.pos.y = Math.max(e.pos.y, groundAt(e.pos.x, e.pos.z) + 0.8);
    } else {
      // close and below you: head straight at the wall and climb rather than walking the long way round
      const straight = !e.boss && !d.npc && (e.direct || (dy > 1.5 && hd < 16));
      let mx, mz;
      if (straight && !d.npc && !e.steer) { mx = dx / (hd || 1); mz = dz / (hd || 1); }
      else { const st = d.npc ? vacSteer(e, dt) : e.steer ? e.steer : enemySteer(e, dx, dz, hd); mx = st[0]; mz = st[1]; }
      let sp = (e.cele ? 0 : e.steer ? (e.steerSpd || e.speed) : e.speed) * hold * (e.freezeT > 0 ? 0.02 : e.chillT > 0 ? e.chillMul || 0.5 : 1);
      if (e.stand) sp = 0;
      if (hold && d.ranged && hd < 16 && Math.abs(dy) < 8) { sp = 0; e.cd -= dt; if (e.cd <= 0) { e.cd = 2.6; fireHostile(e, pp, 15); } }
      if (e.boss && hold) bossAI(e, dt, hd);
      if (d.bomb) {
        if (hold && e.fuse === undefined && hd < 2.8 && Math.abs(dy) < 3) { e.fuse = d.bomb.fuse; sfx('fuse', 0.7); }
        if (e.fuse !== undefined) {
          e.fuse -= dt; sp *= 0.35;
          const blink = Math.sin(e.fuse * 60) > 0;
          e.mesh.userData.light.material.color.setHex(blink ? 0xffffff : 0xff3020);
          e.sBase = (e.elite ? ELITE.sizeMul : 1) * (1 + (d.bomb.fuse - e.fuse) * 0.4);
          if (blink) e.flash = 0.02;
          if (e.fuse <= 0) { envDmg(() => killEnemy(e)); continue; }
        } else {
          // armed and blinking: the whole charge flashes white on a steady beat
          const on = Math.sin(performance.now() / 110 + e.bob * 3) > 0.55;
          e.mesh.userData.light.material.color.setHex(on ? 0xffffff : 0xff3020);
          if (on) e.flash = Math.max(e.flash, 0.03);
        }
      }
      e.wantX = mx; e.wantZ = mz;
      // no walkable path to you (you're up on something): climb the wall instead, slowly
      const k0 = idxOf(e.pos.x, e.pos.z), noPath = !e.boss && hd > 2 && (k0 < 0 || flow[k0] >= 1e8);
      const climbing = e.climbT > 0 && e.stun <= 0;
      const standing = ((e.onGround || e.support) && e.stun <= 0) || climbing;
      if (standing) {
        const acc = Math.min(1, dt * 9);
        e.vel.x += (mx * sp - e.vel.x) * acc; e.vel.z += (mz * sp - e.vel.z) * acc;
        // hop up a ledge in the way
        if (e.onGround && sp > 0) {
          const gh = groundAt(e.pos.x + mx * (e.r + 0.7), e.pos.z + mz * (e.r + 0.7)) - e.pos.y;
          if (gh > 1.1 && gh <= (e.boss ? 8 : CLIMB + 0.3)) { e.vel.y = jumpVE(gh + 0.7); e.onGround = false; }
        }
      } else { const drag = Math.max(0, 1 - 0.4 * dt); e.vel.x *= drag; e.vel.z *= drag; }
      if (climbing) { e.climbT -= dt; e.vel.y = Math.max(1.2, sp * CLIMB_MUL) * (e.elite ? 0.8 : 1); }      // climbing: a bit slower than they walk
      else e.vel.y -= EGRAV * dt;
      // integrate against the terrain
      e.landed = false;
      const step = e.support ? 0.5 : 1.1;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      const wn = pushOutTerrain(e, e.r * 0.85, step);
      // pressing into a wall with nowhere to walk: grab on and keep climbing for a moment
      // (also when you're up above them and close, even if a long walk round exists)
      const wantUp = straight || noPath;
      if (wantUp && (wn.x || wn.z) && wn.x * mx + wn.z * mz < -0.2 && e.stun <= 0 && sp > 0) {
        e.climbT = 0.25; const wl = Math.hypot(wn.x, wn.z); e.wnx = wn.x / wl; e.wnz = wn.z / wl;
      }
      e.bumped = clipVel(e.vel, wn, e.stun > 0 ? 0.3 : 0);
      e.pos.y += e.vel.y * dt;
      const g = footGround(e);
      if (e.pos.y <= g) {
        if (!e.onGround) { e.landed = true; e.sqV = (e.sqV || 0) - Math.min(2.4, 0.4 - e.vel.y * 0.08); }
        e.pos.y = g;
        const impact = -e.vel.y;
        // a hard landing hurts (thrown, knocked off a ledge...) -- not explosive enemies, a hard landing shouldn't set them off
        if (impact > 12 && !d.fly && !e.boss && !d.npc && !d.bomb) { envDmg(() => damage(e, e.maxHp * Math.min(0.6, (impact - 12) * 0.035))); dust(e.pos, 3); if (e.dead) continue; }
        const bounce = (e.roll || e.bouncy) && e.stun > 0 && impact > 2.5;      // balls (and fresh splitlings) bounce while they're knocked about
        if (bounce) { e.vel.y = impact * 0.62; e.sqV = (e.sqV || 0) - 1.2; }
        else if (impact > 7) { e.vel.y *= -0.3; e.spin.multiplyScalar(0.6); } else e.vel.y = Math.max(0, e.vel.y);
        e.onGround = !bounce;
        if (e.stun > 0) { e.vel.x *= 0.85; e.vel.z *= 0.85; }
      } else if (e.onGround && e.vel.y <= 0 && e.pos.y - g < 0.25) { e.pos.y = g; e.vel.y = 0; }
      else e.onGround = false;
      if (e.pos.y < -20) { e.pos.set(cellX(idxOf(0, 0)), 30, cellZ(idxOf(0, 0))); e.vel.set(0, 0, 0); }
      if (e.boss && e.landed && e.state.slamming) { e.state.slamming = false; slamWave(e); }
    }
    e.support = false;
    if (e.thrown) thrownTick(e, dt, dx, dy, dz);
    if (e.dead) continue;
    if (!d.npc && e.dmg > 0 && Math.hypot(dx, dy, dz) < e.r + 1.1 && e.hitCd <= 0) { e.hitCd = 0.8; hurt(e.dmg, e.pos); }
  }
  collideEnemies(dtAll);
  for (const e of enemies) if (e.ldt > 0) poseEnemy(e, e.ldt, player.pos);
  egBuild();
}
/* Ball-ball contacts. Enemies go into a 2.5 m grid each pass and only test the 3x3 cells around them,
   so a crowd of 600 costs about what 100 did with the old sorted sweep. Big ones (bosses, brutes, elites)
   don't fit a cell, so they're tested against everyone directly; there are only ever a few. Two passes for stable stacks. */
const CG = { cell: 1.4, n: 0, head: null, next: new Int32Array(1024), list: [], big: [] };
function cgBuild(list) {
  const n = Math.ceil(HALF * 2 / CG.cell) + 2;
  if (CG.n !== n) { CG.n = n; CG.head = new Int32Array(n * n); }
  CG.head.fill(-1);
  if (CG.next.length < list.length) CG.next = new Int32Array(list.length * 2);
  const inv = 1 / CG.cell, head = CG.head, next = CG.next;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.r > 1.2 || !isFinite(e.pos.x + e.pos.z)) continue;
    let ci = ((e.pos.x + HALF) * inv | 0) + 1, cj = ((e.pos.z + HALF) * inv | 0) + 1;
    ci = ci < 0 ? 0 : ci >= n ? n - 1 : ci; cj = cj < 0 ? 0 : cj >= n ? n - 1 : cj;
    const k = cj * n + ci; e.cgI = ci; e.cgJ = cj; next[i] = head[k]; head[k] = i;
  }
}
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cgN = new THREE.Vector3(), _ppV = new THREE.Vector3(), _ppN = new THREE.Vector3(), _ppC = new THREE.Vector3();
function collidePair(a, b, pass) {
  const ax = a.pos.x, az = a.pos.z, bx = b.pos.x, bz = b.pos.z, rr = a.r + b.r;
  if (Math.abs(bx - ax) > rr || Math.abs(bz - az) > rr) return;
  _ca.set(ax, a.pos.y + (a.d.fly ? 0 : a.r), az);
  _cb.set(bx, b.pos.y + (b.d.fly ? 0 : b.r), bz);
  const n = _cgN.subVectors(_cb, _ca);
  const d2 = n.lengthSq();
  if (d2 >= rr * rr) return;
  const dd = Math.sqrt(d2) || 1e-4;
  if (d2 < 1e-8) n.set(rand(-1, 1), 0.2, rand(-1, 1)).normalize(); else n.divideScalar(dd);
  const over = rr - dd, wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
  a.pos.addScaledVector(n, -over * wa); b.pos.addScaledVector(n, over * wb);
  a.shoved = b.shoved = true;
  // velocity: remove the approaching part (a little bounce)
  const rel = (b.vel.x - a.vel.x) * n.x + (b.vel.y - a.vel.y) * n.y + (b.vel.z - a.vel.z) * n.z;
  if (rel < 0) { const imp = -rel * 1.1; a.vel.addScaledVector(n, -imp * wa); b.vel.addScaledVector(n, imp * wb); }
  // resting on top of another enemy counts as standing
  if (n.y > 0.55) { b.support = true; if (b.vel.y < a.vel.y) b.vel.y = a.vel.y; }
  else if (n.y < -0.55) { a.support = true; if (a.vel.y < b.vel.y) a.vel.y = b.vel.y; }
  // crowding: whoever is pushing into the other's back climbs on top of it
  if (pass === 0 && Math.abs(n.y) < 0.55 && over > 0.12) {
    const aPush = (a.wantX || 0) * n.x + (a.wantZ || 0) * n.z, bPush = -((b.wantX || 0) * n.x + (b.wantZ || 0) * n.z);
    if (aPush > 0.6 && !a.d.fly && a.mass <= b.mass * 1.5 && (a.onGround || a.support)) a.vel.y = Math.max(a.vel.y, 4.5);
    if (bPush > 0.6 && !b.d.fly && b.mass <= a.mass * 1.5 && (b.onGround || b.support)) b.vel.y = Math.max(b.vel.y, 4.5);
  }
}
function collideEnemies(dt) {
  const list = CG.list; list.length = 0; const big = CG.big; big.length = 0;
  for (const e of enemies) if (!e.dead) { e.shoved = false; list.push(e); if (e.r > 1.2) big.push(e); }
  /* A crowd of hundreds is where this gets expensive, so: a thick crowd gets one relaxation pass instead of two, and
     enemies far from you only collide every other step (nobody can tell at that range).
     The grid's cells are 1.4 m (it was 2.5): a pair can only touch if the two are within (ra + rb) of each other, and
     each pair is looked for from its BIGGER member, which searches just far enough to reach a neighbour its own size.
     An ordinary crawler (r 0.62) therefore tests a 4.2 m window instead of a 7.5 m one: about a third of the
     candidate pairs in a packed horde, where this cost used to grow fastest. */
  const passes = list.length > 300 ? 1 : 2, skipFar = list.length > 150 && ((CG.tick = (CG.tick | 0) ^ 1) === 1), pp0 = player.pos;
  const far2 = (list.length > 900 ? 26 : LOD_FAR) ** 2, thin = list.length > 150, out2 = list.length > 900 ? 45 * 45 : 1e9;
  CG.tick3 = ((CG.tick3 | 0) + 1) % 3;       // way out (45 m+) in a huge crowd: a third of them per step
  for (let pass = 0; pass < passes; pass++) {
    cgBuild(list);
    const n = CG.n, head = CG.head, next = CG.next, cell = CG.cell;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], ar = a.r; if (ar > 1.2) continue;
      if (thin) { const d2 = (a.pos.x - pp0.x) ** 2 + (a.pos.z - pp0.z) ** 2; if (d2 > far2 && (skipFar || (d2 > out2 && ((CG.tick3 + i) % 3)))) continue; }
      const ci = a.cgI, cj = a.cgJ, reach = Math.ceil(ar * 2 / cell);
      const j0 = cj - reach < 0 ? 0 : cj - reach, j1 = cj + reach >= n ? n - 1 : cj + reach, i0 = ci - reach < 0 ? 0 : ci - reach, i1 = ci + reach >= n ? n - 1 : ci + reach;
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0, kk = jj * n + i0; ii <= i1; ii++, kk++) {
        for (let k = head[kk]; k !== -1; k = next[k]) {
          if (k === i) continue;
          const b = list[k], br = b.r;
          if (br < ar || (br === ar && k > i)) collidePair(a, b, pass);
        }
      }
    }
    // the few big ones against everything
    for (let bi = 0; bi < big.length; bi++) {
      const a = big[bi];
      for (const b of list) if (b !== a && (b.r <= 1.2 || big.indexOf(b) > bi)) collidePair(a, b, pass);
    }
  }
  // keep enemies out of the player's body
  const pc = _ppC.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  for (const e of list) {
    const c = ecenter(e), v = _ppV.subVectors(c, pc); v.y *= 0.6;
    const dd = v.length(), rr = e.r + 0.85;
    if (dd < rr && dd > 1e-4 && e.mass < 20) { v.divideScalar(dd); e.pos.addScaledVector(v, rr - dd); const vn = e.vel.dot(v); if (vn < 0) e.vel.addScaledVector(v, -vn); physNudge(c, _ppN.copy(v).negate(), 0.04 * (rr - dd) * e.mass); }
    // crowd shoves must never leave anyone embedded in a wall
    if (!e.d.fly && e.shoved) clipVel(e.vel, pushOutTerrain(e, e.r * 0.85, 1.1));
  }
}
/* Facing and tumbling */
function poseEnemy(e, dt, pp) {
  const c = ecenter(e);
  e.mesh.position.copy(c);
  // off screen last frame (updateEnemyBatches sets e.seen) and not right on top of you: where it is is all anyone needs.
  // Facing, tumbling, flinch, squash and the health bar are picked up again the moment it comes back into view.
  if (e.seen === false && !e.bar && !e.boss) { e.faded = false; if (e.flT > 0) e.flT -= dt; if (e.zapT > 0) e.zapT -= dt; return; }
  const airborne = e.stun > 0 || (!e.onGround && !e.support && !e.d.fly && e.vel.y < -2);
  if (e.roll && !airborne) {
    // spheres roll along the ground
    const v = Math.hypot(e.vel.x, e.vel.z);
    if (v > 0.05) { _eq.setFromAxisAngle(_flAx.set(e.vel.z / v, 0, -e.vel.x / v), v * dt / e.r); e.q.premultiply(_eq); }
  } else if (airborne || e.spin.lengthSq() > 0.5) {
    const sl = e.spin.length();
    if (sl > 1e-3) { _eq.setFromAxisAngle(_flAx.copy(e.spin).divideScalar(sl), sl * dt); e.q.premultiply(_eq); }
    e.spin.multiplyScalar(Math.max(0, 1 - (airborne ? 0.4 : 4) * dt));
  }
  if (!airborne && !e.roll && !e.d.fly && e.climbT > 0 && e.wnx !== undefined) {
    // climbing: the flat underside presses against the wall, head pointing up the cliff
    _cbY.set(e.wnx, 0, e.wnz); _cbX.crossVectors(_cbY, _cbZ); _cbM.makeBasis(_cbX, _cbY, _cbZ);
    _eq.setFromRotationMatrix(_cbM);
    e.q.slerp(_eq, Math.min(1, dt * 12));
  } else if (!airborne && !e.roll) {
    // settle upright and turn to face the player
    const yaw = e.d.npc ? (Math.hypot(e.vel.x, e.vel.z) > 0.2 ? Math.atan2(e.vel.x, e.vel.z) : (e.yawLast || 0)) : Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    if (e.d.npc) e.yawLast = yaw;            // cleaners face where they're driving
    _eq.setFromAxisAngle(UP3, yaw);
    e.q.slerp(_eq, Math.min(1, dt * (e.d.fly ? 6 : 8)));
    e.spin.multiplyScalar(Math.max(0, 1 - 6 * dt));
  }
  e.mesh.quaternion.copy(e.q);
  if (e.zapT > 0) { e.zapT -= dt; e.mesh.position.x += rand(-0.07, 0.07); e.mesh.position.y += rand(-0.05, 0.05); e.mesh.position.z += rand(-0.07, 0.07); _eq.setFromAxisAngle(_flAx.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), rand(-0.2, 0.2)); e.mesh.quaternion.premultiply(_eq); if (Math.random() < dt * 20) spark(aimPt(e), Math.random() < 0.5 ? 0xbff6ff : COL.cyan); }
  if (e.pullT > 0) { e.pullT -= dt; e.sq = Math.max(e.sq || 0, 0.12); }
  if (e.flT > 0) {
    // flinch: knocked back along the hit and leaning away from it, springing straight back
    e.flT -= dt; const f = Math.max(0, e.flT / 0.14), ff = f * f;
    e.mesh.position.x += e.flx * ff; e.mesh.position.z += e.flz * ff;
    _eq.setFromAxisAngle(_flAx.set(e.flz, 0, -e.flx).normalize(), 2.2 * Math.hypot(e.flx, e.flz) * ff);
    e.mesh.quaternion.premultiply(_eq);
    e.sq = Math.min(e.sq || 0, -0.12 * ff);
  }
  // squash & stretch: stretch rising out of a jump, squash on landing (subtle)
  {
    const target = e.onGround || e.support || e.d.fly ? 0 : clamp(e.vel.y * 0.006, -0.05, 0.08);
    e.sqV = (e.sqV || 0) + (-160 * ((e.sq || 0) - target) - 12 * e.sqV) * dt;
    e.sq = clamp((e.sq || 0) + e.sqV * dt, -0.18, 0.12);
    const b = e.sBase || 1, sy = 1 + e.sq, sxz = 1 - e.sq * 0.55;
    e.mesh.scale.set(b * sxz, b * sy, b * sxz);
  }
  if (e.bar) {
    e.bar.position.set(c.x, c.y + e.r + 0.7, c.z);
    e.bar.quaternion.copy(camera.quaternion);
    const k = clamp(e.hp / e.maxHp, 0, 1); e.bar.userData.fill.scale.x = Math.max(0.001, k); e.bar.userData.fill.position.x = -0.75 * (1 - k);
  }
  const mat = e.mesh.userData.mat;
  const f = e.flash > 0 ? 0.6 : 0;
  if (e.chillT > 0 && !f) mat.emissive.setRGB(0.12, 0.28, 0.42); else mat.emissive.setRGB(f, f, f);
  // fade anything sitting between the camera and the player so swarms don't blind you
  _pcv.set(pp.x, pp.y + 1.4, pp.z);
  const cd2 = c.distanceToSquared(camera.position);
  e.faded = cd2 < camera.position.distanceToSquared(_pcv) && segDist2(camera.position, _pcv, c) < (e.r + 0.5) ** 2;
}
const UP3 = new THREE.Vector3(0, 1, 0), _pcv = new THREE.Vector3(), _flAx = new THREE.Vector3();
const _cbX = new THREE.Vector3(), _cbY = new THREE.Vector3(), _cbZ = new THREE.Vector3(0, 1, 0), _cbM = new THREE.Matrix4();
function bossAI(e, dt, hd) {
  if (e.type !== 'warden') { BOSS_AI[e.type](e, dt, hd); return; }
  const st = e.state;
  e.stand = false;
  if ((st.stagger || 0) > 0) { st.stagger -= dt; e.stand = true; return; }
  if (wardenGrab(e, dt)) return;
  st.volley -= dt; st.slam -= dt; st.summon -= dt;
  if (st.volley <= 0) {
    st.volley = Math.max(2.2, 4 - S.stage * 0.3);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; fireHostile(e, { x: e.pos.x + Math.cos(a) * 10, y: e.pos.y + 2, z: e.pos.z + Math.sin(a) * 10 }, 12, 4); }
    st.burst = 3; st.burstT = 0;
  }
  if (st.burst > 0) { st.burstT -= dt; if (st.burstT <= 0) { st.burst--; st.burstT = 0.18; fireHostile(e, player.pos, 20, 4); } }
  if (st.slam <= 0 && e.onGround && hd < 26) {
    st.slam = rand(7, 9); e.vel.y = jumpVE(9); e.onGround = false; st.slamming = true;
    e.vel.x = (player.pos.x - e.pos.x) * 0.6; e.vel.z = (player.pos.z - e.pos.z) * 0.6;
  }
  if (st.summon <= 0) { st.summon = 14; for (let i = 0; i < 4 + S.stage; i++) spawnEnemy('drone', { x: e.pos.x + rand(-4, 4), y: e.pos.y + 7, z: e.pos.z + rand(-4, 4) }); }
}
function slamWave(e) {
  cam.shake = 0.6; ring(e.pos, 14, 0.45, COL.red); burst(e.pos, COL.bone, 16);
  if (Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) < 14 && player.pos.y - e.pos.y < 2.2 && player.onGround) {
    hurt(e.dmg * 0.9, e.pos); player.vel.y = jumpV(1.5); player.onGround = false;
  }
}
function fireHostile(e, tgt, speed, yo = 1.4) {
  const o = new THREE.Vector3(e.pos.x, e.pos.y + (e.d.fly ? 0 : yo), e.pos.z);
  const v = new THREE.Vector3(tgt.x - o.x, (tgt.y + 1.3) - o.y, tgt.z - o.z).normalize().multiplyScalar(speed);
  const m = new THREE.Mesh(geoOrb, B(COL.red)); m.position.copy(o); scene.add(m);
  shots.push({ mesh: m, pos: o, last: o.clone(), vel: v, life: 5, r: 0.38, hostile: true, dmg: e.dmg * 0.8, hit: new Set(), pierce: 0 });
}

/* ---------- player damage and rewards ---------- */
function hurt(a, from) {
  if (player.iframes > 0 || S.mode !== 'play') return;
  a = comboHurt(a);
  if (a <= 0.01) return;
  if (from) camKick(new THREE.Vector3(player.pos.x - from.x, 0, player.pos.z - from.z), Math.min(0.32, 0.1 + a * 0.006));   // the view jolts away from whatever hit you
  if (S.test && DEV.god) { player.iframes = 0.15; cam.shake = Math.max(cam.shake, 0.12); sfx('hurt', 0.25); return; }
  player.iframes = 0.15; player.shieldT = stats.shieldDelay;
  if (S.st) S.st.taken += Math.min(a, Math.max(0, player.hp) + Math.max(0, player.shield));
  if (player.shield > 0) { const s = Math.min(player.shield, a); player.shield -= s; a -= s; if (S.st) S.st.shielded += s; }
  player.hp -= a; cam.shake = Math.max(cam.shake, 0.25); sfx('hurt', 0.6);
  // the frame flinches and flails its arms for a beat: a hard kick into the existing body-sway spring (away
  // from whatever hit you, when we know where that was) plus a short window where the arms thrash instead of aiming
  {
    const dx = from ? player.pos.x - from.x : rand(-1, 1), dz = from ? player.pos.z - from.z : rand(-1, 1);
    const l = Math.hypot(dx, dz) || 1, cy = Math.cos(player.legYaw || 0), sy = Math.sin(player.legYaw || 0);
    const kx = dx / l, kz = dz / l, fwdK = kx * sy + kz * cy, sideK = kx * cy - kz * sy;
    const kick = clamp(2.5 + a * 0.12, 2.5, 7);
    player.swayV.x += fwdK * kick; player.swayV.y -= sideK * kick;
    player.flailT = Math.max(player.flailT || 0, clamp(0.22 + a * 0.01, 0.22, 0.55));
  }
  const v = $('#vignette');
  v.style.boxShadow = 'inset 0 0 140px 40px rgba(226,70,92,.55)';
  setTimeout(() => { v.style.boxShadow = 'inset 0 0 120px 30px rgba(226,70,92,0)'; }, 120);
  if (player.hp <= 0) gameOver();
}
/* ---------- ground stains: every enemy that dies (and some hits) leaves square blotches that stay for the whole stage ---------- */
const STAIN_MAX = 6000;
let stainMesh = null, stainN = 0;
const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _sp = new THREE.Vector3(), _sc = new THREE.Color();
function stainInit() {
  if (stainMesh) return;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  stainMesh = new THREE.InstancedMesh(geo, mat, STAIN_MAX);
  stainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stainMesh.setColorAt(0, new THREE.Color(0, 0, 0));
  stainMesh.count = 0; stainMesh.frustumCulled = false; stainMesh.receiveShadow = true; stainMesh.userData.noShadow = true;
  scene.add(stainMesh);
}
function stain(x, z, size, color) {
  stainInit();
  const g = groundAt(x, z), h = size / 2;
  // keep the square on one flat surface (never hanging over a ledge)
  for (const [ox, oz] of [[h, h], [-h, h], [h, -h], [-h, -h]]) if (Math.abs(groundAt(x + ox, z + oz) - g) > 0.05) return;
  const i = stainN % STAIN_MAX; stainN++;
  STAIN_XZ[i * 2] = x; STAIN_XZ[i * 2 + 1] = z; STAIN_LIVE[i] = 1;
  _sq.setFromAxisAngle(UP3, Math.random() * Math.PI / 2);
  _sm.compose(_sp.set(x, g + 0.015 + (i % 16) * 0.0012, z), _sq, _ss.set(size, 1, size));
  stainMesh.setMatrixAt(i, _sm);
  // a darker shade of the ground it lands on, with just a hint of the enemy's colour
  const k = idxOf(x, z);
  if (tileMesh && k >= 0) tileMesh.getColorAt(k, _sc); else _sc.setRGB(0.3, 0.3, 0.3);
  _sc.lerp(color, 0.12).multiplyScalar(rand(0.42, 0.58)); stainMesh.setColorAt(i, _sc);
  stainMesh.count = Math.min(STAIN_MAX, Math.max(stainMesh.count, i + 1));
  stainMesh.instanceMatrix.needsUpdate = true; stainMesh.instanceColor.needsUpdate = true;
}
function splatter(e, n, spread) {
  const col = e.mesh && e.mesh.userData.mat ? e.mesh.userData.mat.color : new THREE.Color(0x553333);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
    stain(e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, rand(0.18, 0.55) * Math.max(0.8, e.r * 1.4), col);
  }
}
function clearStains() { if (stainMesh) { stainMesh.count = 0; stainN = 0; } STAIN_LIVE.fill(0); }
const STAIN_XZ = new Float32Array(STAIN_MAX * 2), STAIN_LIVE = new Uint8Array(STAIN_MAX);
const _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
/* wipe every stain within r of (x, z); returns how many */
function wipeStains(x, z, r) {
  if (!stainMesh) return 0;
  let n = 0; const r2 = r * r, N = stainMesh.count;
  for (let i = 0; i < N; i++) { if (!STAIN_LIVE[i]) continue; const dx = STAIN_XZ[i * 2] - x, dz = STAIN_XZ[i * 2 + 1] - z; if (dx * dx + dz * dz < r2) { STAIN_LIVE[i] = 0; stainMesh.setMatrixAt(i, _zeroM); n++; } }
  if (n) stainMesh.instanceMatrix.needsUpdate = true;
  return n;
}
// set around a loop that kills many enemies in the same tick (nuke, mega-jump landing): trims the heaviest
// per-kill VFX/SFX (lots of new particle meshes + simultaneous sounds) so a mass-kill doesn't spike the frame.
let MASS_KILL = false;
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; e.hp = 0;
  if (e.elite) creditEliteKill();
  gemKill(e);
  if (!MASS_KILL && (!e.d.fly || e.pos.y - groundAt(e.pos.x, e.pos.z) < 6)) splatter(e, 5 + (Math.random() * 5 | 0), 0.6 + e.r * 1.6);
  scene.remove(e.mesh); S.kills++; runStatKill(e); if (!ENV_DMG) streakKill(e); discoverEnemy(e.type);
  if (e.d.fly && !e.boss) droneCrash(e);
  if (e.d.bomb) bomberBlast(e);
  if (e.burnT > 0) for (let i = 0; i < 3; i++) stain(e.pos.x + rand(-0.6, 0.6), e.pos.z + rand(-0.6, 0.6), rand(0.5, 0.9) * e.r * 1.4, new THREE.Color(0x0c0a09));   // burnt to a black husk
  if (e.d.split) {
    // pops into smaller splitlings that burst outward
    for (let i = 0; i < e.d.split; i++) {
      const a = i / e.d.split * Math.PI * 2 + Math.random(), x = e.pos.x + Math.cos(a) * 0.6, z = e.pos.z + Math.sin(a) * 0.6;
      const s = spawnEnemy('splitling', { x, y: e.pos.y + 0.6, z });
      const sp = rand(3, 7.5);
      s.vel.set(Math.cos(a) * sp, rand(3, 5.5), Math.sin(a) * sp); s.stun = rand(0.2, 0.4); s.onGround = false; s.bouncy = true; s.hitCd = 0;
      s.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    }
    burst(ecenter(e).clone(), e.d.color, 10); burst(ecenter(e).clone(), 0xffffff, 6); ring(e.pos, 2.2, 0.25, e.d.color); sfx('pop2', 0.6);
  }
  burst(e.pos.clone().setY(e.pos.y + 0.6), e.d.color, MASS_KILL ? (e.boss || e.mini ? 6 : 1) : e.boss ? 40 : e.mini ? 20 : 6);
  if (L.perks.has('leech')) player.hp = Math.min(stats.maxHp, player.hp + 1);
  if (e.bar) { scene.remove(e.bar); e.bar = null; }
  const luck = stats.luck || 0;
  if (e.d.xp) dropGem(e.pos, e.elite ? ELITE.xp : e.d.xp);
  if (Math.random() < 0.07 + luck * 0.0025) dropBolt(e.pos, 1);       // currency: rarer than experience
  if (Math.random() < 0.006 + luck * 0.0004 || (e.elite && Math.random() < 0.25)) dropHealth(e.pos);   // health packs: very rare
  if (Math.random() < 0.0006 + luck * 0.00003) dropPower(e.pos, 'vacuum');       // rare: pulls in every bit of experience
  else if (Math.random() < 0.00012 + luck * 0.000006) dropPower(e.pos, 'nuke');   // rarer still: wipes the field
  else if (enemies.length >= BERSERK_CROWD && !(S.berserkT > 0) && S.t - (S.berserkLast ?? -999) > BERSERK_GAP && Math.random() < 0.0008 + luck * 0.00003) { S.berserkLast = S.t; dropPower(e.pos, 'berserk'); }   // rare, and only in a big crowd
  else if (Math.random() < 0.0005 + luck * 0.00003 || (e.elite && Math.random() < 0.025) || (e.mini && Math.random() < 0.2)) dropPower(e.pos, 'frenzy');   // coin frenzy
  if ((S.frenzyT || 0) > 0) dropBolt(e.pos, Math.random() < 0.15 ? 3 : 1);          // during a frenzy everything pays out
  // parts (and gems) only come in weapon cases: now and then from tougher enemies, always from the Warden
  {
    const ch = e.type === 'pig' ? 0 : e.boss ? 1 : e.mini ? 0.5 : e.elite ? 0.1 : e.type === 'brute' ? 0.1 : e.type === 'splitter' ? 0.025 : e.type === 'spitter' ? 0.004 : 0;
    if (ch && Math.random() < ch * (1 + luck * 0.02)) dropCase(e.pos.clone().setY(e.pos.y + 0.6));
  }
  if (e.elite) { for (let i = 0; i < 3; i++) dropBolt(e.pos, 1); for (let i = 0; i < 3; i++) dropGem(e.pos, 2); }   // tough enemies pay out, but no parts
  if (e.mini) { for (let i = 0; i < 6; i++) dropGem(e.pos, 3); for (let i = 0; i < 5; i++) dropBolt(e.pos, 1); }
  if (!MASS_KILL || Math.random() < 0.08) sfx('kill', 0.35);
  if (e.type === 'pig') pigDown(e);
  else if (e.boss) onBossDown(e);
}
/* Medium explosion: hurts the player (falling off with distance) and every enemy in range, throws survivors. */
function bomberBlast(e) {
  const B = e.d.bomb, c = ecenter(e).clone(), sc = scaling();
  envDmg(() => explode(c, B.radius, B.enemyDmg * sc.hp * 0.5, false));      // a bomber's blast is the swarm hurting itself
  blast(c, B.radius * 0.7, 0xffe2a0);
  ring(new THREE.Vector3(c.x, groundAt(c.x, c.z), c.z), B.radius * 1.3, 0.5, ORANGE);
  burst(c, 0xffd27a, 8); burst(c, COL.dark, 6);
  sfx('boom', 0.8);
  const pc = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), d = pc.distanceTo(c);
  cam.shake = Math.max(cam.shake, clamp(1 - d / 30, 0, 0.8));
  if (d < B.radius + 0.8 && S.mode === 'play') {
    const k = 1 - d / (B.radius + 0.8);
    hurt(B.dmg * sc.dmg * (0.4 + 0.6 * k), c);
    // the blast shoves the frame too, less if it's heavy
    const push = pc.sub(c).setY(0); if (push.lengthSq() > 1e-4) push.normalize();
    const m = Math.max(1, stats.mass || 3.3) / 3.3;
    player.vel.addScaledVector(push, 14 * k / m); player.vel.y += 9 * k / m; player.onGround = false;
  }
}
/* Attribute effects when a shot hits an enemy */
function shotAttrHit(s, e) {
  const A = s.attrs, c = aimPt(e);
  const T = k => A.get ? A.get(k) || 0 : (A.has(k) ? 1 : 0), cb = A.combo;
  const dealt = HIT_E === e ? HIT_DEALT : 0; HIT_E = null;
  if (A.has('lifesteal') && dealt > 0) lifestealHit(s, dealt, T('lifesteal'));
  if (A.has('poison')) poisonHit(e, s.dmg, T('poison'), cb === 'poison+poison' ? { sup: true, dur: POIS_TIME * 1.75 } : undefined);
  if (cb) comboHit(s, e, dealt, cb, T);
  // Thermal Shock: ice on a burning enemy, or fire on a frozen one, shatters it
  if (cb === 'fire+ice' && (e.burnT > 0 || e.chillT > 0) && (e.shockCd || 0) < S.t) {
    e.shockCd = S.t + 0.6; damage(e, s.dmg * 3, s.manual); e.burnT = 0; e.chillT = 0;
    burst(c, 0xbfe9ff, 6); burst(c, 0xff6a1a, 6); sfx('pop2', 0.3); if (e.dead) return;
  }
  if (A.has('fire')) { ignite(e, s.dmg * (0.7 + 0.3 * T('fire')) * (cb === 'fire+fire' ? 2 : 1)); if (cb === 'fire+fire') e.burnT = 5; }
  if (A.has('ice')) { chill(e, T('ice')); if (cb === 'homing+ice' || cb === 'ice+ice') freeze(e, cb === 'ice+ice' ? 1.5 : 1); }
  if (A.has('lightning')) {
    // chains to one more enemy per tier; combos reach further, branch, blast, burn and chill
    const extra = cb === 'homing+lightning' ? 2 : cb === 'lightning+lightning' ? 3 : 0;
    const reach = (cb === 'homing+lightning' || cb === 'ice+lightning') ? 4 : 0;
    const done = new Set([e]); let from = c;
    const jump = (fromPt, n) => {
      done.add(n); const to = aimPt(n);
      let dmg = s.dmg * (0.5 + 0.1 * T('lightning'));
      if (cb === 'ice+lightning') { if (n.chillT > 0) dmg *= 2; chill(n, T('ice')); }
      damage(n, dmg, s.manual); if (cb) comboJump(s, n, HIT_DEALT, cb, T); lightning([fromPt, to], cb === 'lightning+lightning' ? 1.2 : 0.6);
      if (A.has('fire')) ignite(n, s.dmg * (cb === 'fire+lightning' ? 2 : 1));
      if (cb === 'explode+lightning') { explode(to, 1.6, s.dmg * 0.4, s.manual); }
      return to;
    };
    for (let i = 0; i < T('lightning') + extra; i++) {
      const n = nearestEnemy(from, 8 + i + reach, done); if (!n) break;
      const to = jump(from, n);
      if (cb === 'lightning+split') { const b = nearestEnemy(from, 8 + reach, done); if (b) jump(from, b); }   // Fork: a second branch at every jump
      from = to;
    }
  }
  if (A.has('explode') && s.miniBoom) { const k0 = S.kills, pl = cb === 'explode+poison' ? poisonedNear(s.pos, s.miniBoom) : null; explode(s.pos, s.miniBoom, s.dmg * (0.45 + 0.15 * T('explode')), s.manual); comboBoom(s, s.pos, s.miniBoom); if (cb) comboBoomGem(s, s.pos, s.miniBoom, k0, pl); s.life = 0; }
}
/* Fire: burns for 3 s; refreshing it never stacks above the strongest burn */
/* ---------- gem combos (two gems in one arm) ---------- */
function freeze(e, t) { if (e.dead || e.boss) return; e.freezeT = Math.max(e.freezeT || 0, t); e.chillT = Math.max(e.chillT || 0, t + 1); e.chillMul = 0.3; e.vel.x *= 0.2; e.vel.z *= 0.2; spark(aimPt(e), 0xe8fdff); }
function groundPatch(p, kind, life, tier, src) {
  const m = new THREE.Mesh(geoTrail, new THREE.MeshBasicMaterial({ color: kind === 'fire' ? 0xff6a1a : 0xbfe9ff, transparent: true, opacity: 0.7, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending }));
  m.position.set(p.x, groundAt(p.x, p.z) + 0.03, p.z); m.rotation.y = Math.random() * 6; m.scale.setScalar(rand(1, 1.5));
  scene.add(m); legTrail.push({ m, kind, life, src, tier: tier || 1 });
  if (legTrail.length > 160) { const o = legTrail.shift(); scene.remove(o.m); o.m.material.dispose(); }
}
/* one-off changes to a new shot */
function applyComboToShot(s, cb) {
  if (!cb) return;
  s.combo = cb;
  if (cb === 'bounce+bounce') s.bounces += 6;
  if (cb === 'homing+homing') { s.homeRate = (s.homeRate || 4) * 2.2; s.speed *= 1.3; s.vel.multiplyScalar(1.3); }
  if (cb === 'orbit+orbit') { s.life *= 1.6; if (s.orbit && Math.random() < 0.5) { s.orbit.r += 1.6; s.orbit.y += 0.6; } }
  if (cb === 'orbit+split' && s.orbit) s.orbit.r += 1.2;
  if (cb === 'explode+explode' && s.miniBoom) s.miniBoom *= 1.6;
  if (cb === 'explode+homing' && s.miniBoom) s.miniBoom *= 1.8;
  if (cb === 'explode+orbit' && s.miniBoom) s.miniBoom = Math.max(s.miniBoom, 2.4);
  if (cb === 'fire+orbit') { s.mesh.material = B(0xff7a1a); s.mesh.scale.setScalar(1.8); }
  if (cb === 'ice+orbit') { s.mesh.material = B(0xbfe9ff); s.mesh.scale.setScalar(1.5); }
}
/* per-frame combo behaviour; returns true if the shot was used up */
function comboShotTick(s, dt) {
  const cb = s.combo;
  comboTickGem(s, dt);
  if (cb === 'fire+homing' && s.homing) { s.trailT = (s.trailT || 0) - dt; if (s.trailT <= 0 && s.pos.y - groundAt(s.pos.x, s.pos.z) < 4) { s.trailT = 0.1; groundPatch(s.pos, 'fire', 2, 1, s.src); } }
  if (cb === 'homing+orbit' && s.orbit) {
    const e = nearestEnemy(player.pos.clone().setY(player.pos.y + 1), 7);
    if (e) { s.orbit = null; s.homing = true; s.target = e; s.speed = 34; s.homeRate = 9; s.vel.copy(aimPt(e).sub(s.pos).normalize().multiplyScalar(34)); s.life = Math.max(s.life, 1.2); spark(s.pos, ATTRS.homing.color); }
  }
  if (cb === 'bounce+orbit' && s.orbit && s.life < 0.1) {
    // Satellite: break off the ring and bounce away outward
    const out = new THREE.Vector3(s.pos.x - player.pos.x, 0, s.pos.z - player.pos.z).normalize();
    s.orbit = null; s.vel.copy(out.multiplyScalar(22)).setY(8); s.grav = 22; s.bounces = 4; s.life = 2.4; s.pierce = 2;
  }
  if (cb === 'fire+orbit' && s.orbit) for (const e of enemies) if (!e.dead && !(e.burnT > 0) && aimPtT(e).distanceToSquared(s.pos) < (1.2 + e.r) ** 2) ignite(e, s.dmg * 1.2);
  if (cb === 'lightning+orbit' && s.orbit) {
    // Tesla Ring: arcs to the next orbiter in the ring, shocking whatever is in between
    s.teslaT = (s.teslaT || 0) - dt;
    if (s.teslaT <= 0) {
      s.teslaT = 0.3;
      const mate = shots.find(o => o !== s && o.orbit && o.combo === cb && o.life > 0 && o.pos.distanceTo(s.pos) < 7);
      if (mate) {
        lightning([s.pos.clone(), mate.pos.clone()], 0.5);
        for (const e of enemies) if (!e.dead && segDist2(s.pos, mate.pos, aimPtT(e)) < (0.8 + e.r) ** 2) damage(e, s.dmg * 0.6, s.manual);
      }
    }
  }
  if (cb === 'ice+orbit' && s.orbit) {
    // Blizzard: a frost aura around you while the ring is up
    s.auraT = (s.auraT || 0) - dt;
    if (s.auraT <= 0) { s.auraT = 0.3; const R = s.orbit.r + 1.8; for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < R) chill(e, 1); if (Math.random() < 0.5) spark(s.pos, 0xe8fdff); }
  }
  return false;
}
/* things that happen each time a bouncing shot bounces */
function comboBounce(s) {
  const cb = s.combo, p = s.pos;
  comboBounceGem(s);
  if (cb === 'bounce+homing') { const e = nearestEnemy(p, 16, s.hit); if (e) { s.target = e; s.homing = true; s.homeRate = 7; s.speed = Math.max(s.speed || 30, 30); s.vel.copy(aimPt(e).sub(p).normalize().multiplyScalar(s.speed)).setY(Math.max(4, s.vel.y)); s.grav = 10; } }
  if (cb === 'bounce+lightning') { const done = new Set(); for (let i = 0; i < 2; i++) { const e = nearestEnemy(p, 5, done); if (!e) break; done.add(e); damage(e, s.dmg * 0.5, s.manual); lightning([p.clone(), aimPt(e)], 0.5); } }
  if (cb === 'bounce+explode') explode(p.clone(), 1.6, s.dmg * 0.5, s.manual);
  if (cb === 'bounce+split' && !s.child) {
    const keep = CUR_ATTRS, src = DMG_SRC; CUR_ATTRS = new Map(); DMG_SRC = s.src;
    const d = s.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.9, 0.9));
    bullet(p.clone(), p.clone().add(d), s.vel.length(), s.dmg * 0.6, { child: true, life: 1.4, manual: s.manual });
    const c = shots[shots.length - 1]; c.grav = 22; c.bounces = 1; c.child = true; c.mesh.material = s.mesh.material;
    CUR_ATTRS = keep; DMG_SRC = src;
  }
  if (cb === 'bounce+fire') groundPatch(p, 'fire', 2.5, 1, s.src);
  if (cb === 'bounce+ice') { groundPatch(p, 'ice', 2.5, 1, s.src); for (const e of enemies) if (!e.dead && e.pos.distanceTo(p) < 2.6) chill(e, 2); }
}
/* extra effects when a combo shot's blast goes off */
function comboBoom(s, p, r) {
  const cb = s.attrs && s.attrs.combo; if (!cb) return;
  if (cb === 'explode+split') {
    const keep = CUR_ATTRS, src = DMG_SRC; CUR_ATTRS = new Map(); DMG_SRC = s.src;
    for (let i = 0, nn = shotRoom(6); i < nn; i++) { const a = i / nn * Math.PI * 2; bullet(p.clone(), p.clone().add(new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a))), 34, s.dmg * 0.25, { life: 0.35, child: true, manual: s.manual }); shots[shots.length - 1].mesh.scale.setScalar(0.6); }
    CUR_ATTRS = keep; DMG_SRC = src;
  }
  if (cb === 'explode+fire') for (let i = 0; i < 4; i++) groundPatch(p.clone().add(new THREE.Vector3(rand(-r, r), 0, rand(-r, r))), 'fire', 3, 1, s.src);
  if (cb === 'explode+ice') { for (const e of enemies) if (!e.dead && e.pos.distanceTo(p) < r * 1.5) freeze(e, 1.2); ring(p, r * 1.5, 0.3, 0xbfe9ff); }
}
/* Ice: slowed for a few seconds; higher tiers slow harder and longer (50% -> 20% speed) */
function chill(e, t = 1) { if (e.dead) return; e.chillT = Math.max(e.chillT || 0, 2 + t); e.chillMul = Math.min(e.chillT > 0 && e.chillMul ? e.chillMul : 1, Math.max(0.2, 0.6 - 0.1 * t)); }
function ignite(e, dmg) { if (e.dead) return; e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, Math.max(4, dmg * 0.45)); }
const FIXED_DMG = 0.6;          // a gun bolted straight onto a block (no arm to hold it) hits for 60%
/* damage that isn't yours (enemies hurting each other or themselves, falls, barrels you didn't set off) runs inside envDmg():
   kills made there still count, but don't feed your kill streak */
let ENV_DMG = 0;
function envDmg(fn) { ENV_DMG++; try { return fn(); } finally { ENV_DMG--; } }
let DMG_SRC = null;             // the part whose damage is being dealt right now
/* After a part's level changes: stats follow straight away and a small banner lists it. */
function partLeveled(it) {
  if (S.inRun && stats) { const prev = stats; stats = computeStats(); syncCaps(); player.hp = Math.min(stats.maxHp, player.hp + Math.max(0, stats.maxHp - prev.maxHp)); renderLoadoutHUD(); }
  const box = $('#partUps'); if (!box) return;
  const el = document.createElement('div'); el.innerHTML = `${partIcon(it)}${itemName(it).toUpperCase()} · LV ${it.lvl}`;
  box.appendChild(el); setTimeout(() => el.remove(), 2700);
  while (box.children.length > 4) box.firstChild.remove();
  sfx('reloaded', 0.5);
}
/* ---------- leg gems ---------- */
const legWithGem = t => BUILD_V2 && L.body && L.body.kind === 'lower' ? (armGems(L.body).some(g => g.type === t) ? L.body : null) : groundedLegsCache().find(l => armGems(l).some(g => g.type === t)) || null;
let _glc = { t: -1, v: [] };
function groundedLegsCache() { if (_glc.t !== S.t) { _glc = { t: S.t, v: equippedLegs().filter(l => armGems(l).length) }; } return _glc.v; }
const legHas = t => stats && stats.legGems && stats.legGems.has(t);
const legT = t => (stats && stats.legGems && stats.legGems.get(t)) || 0;
/* in the air: stomp-seeker steers you onto an enemy below */
function legGemAir(dt) {
  const P = player;
  if (!legHas('homing') || P.onGround || P.vel.y > 0) return;
  let best = null, bd = 25;
  for (const e of enemies) { if (e.dead) continue; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d2 = dx * dx + dz * dz; if (d2 < bd && e.pos.y < P.pos.y) { bd = d2; best = e; } }
  if (!best) return;
  const d = Math.sqrt(bd) || 1, sp = Math.max(6, Math.hypot(P.vel.x, P.vel.z));
  P.vel.x = lerp(P.vel.x, (best.pos.x - P.pos.x) / d * sp, Math.min(1, dt * 4)); P.vel.z = lerp(P.vel.z, (best.pos.z - P.pos.z) / d * sp, Math.min(1, dt * 4));
}
/* on landing: rebound, stomp, discharge, shockwave */
function legGemLanding(impact, fall) {
  const P = player, lv = (stats && stats.legLv) || 1;
  if (legHas('homing') && impact > 4) {
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 1.6 + 0.4 * legT('homing') + e.r && Math.abs(e.pos.y - P.pos.y) < 2) {
        DMG_SRC = legWithGem('homing'); damage(e, (20 + lv * 1.2 + impact) * (0.6 + 0.4 * legT('homing'))); DMG_SRC = null; hit = true;
        if (!e.dead) knock(e, new THREE.Vector3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize(), 6, 6);
      }
    }
    if (hit) { ring(P.pos, 2.4, 0.3, ATTRS.homing.color); sfx('thud', 0.6); cam.shake = Math.max(cam.shake, 0.3); P.vel.y = jumpV(1.2); P.onGround = false; return; }
  }
  if (legHas('explode') && fall > 2.5) {
    const t = legT('explode');
    DMG_SRC = legWithGem('explode'); explode(P.pos.clone(), Math.min(7, 2.5 + fall * 0.3) * (0.8 + 0.2 * t), (12 + fall * 4 + lv * 0.5) * (0.6 + 0.4 * t), false, false); DMG_SRC = null;
  }
  if (legHas('lightning') && (P.charge || 0) >= 30 - 4 * legT('lightning')) {
    P.charge = 0;
    const c = new THREE.Vector3(P.pos.x, P.pos.y + 1, P.pos.z);
    const near = enemies.filter(e => !e.dead && e.pos.distanceTo(P.pos) < 12).sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos)).slice(0, 2 + legT('lightning'));
    DMG_SRC = legWithGem('lightning');
    for (const e of near) { damage(e, (22 + lv) * (0.6 + 0.4 * legT('lightning'))); lightning([c, aimPt(e)]); }
    DMG_SRC = null; if (near.length) sfx('zap', 0.5);
  }
  if (legHas('bounce') && impact > 9 && !P.superUp) { P.vel.y = jumpV(clamp(impact * 0.1 * (0.7 + 0.3 * legT('bounce')), 1, 5)); P.onGround = false; ring(P.pos, 1.6, 0.25, ATTRS.bounce.color); sfx('thud', 0.3); }
}
/* trails (fire / frost) and static charge, every tick */
const legTrail = [];
const geoTrail = new THREE.CircleGeometry(0.55, 10); geoTrail.rotateX(-Math.PI / 2);
function legGemTick(dt) {
  lowerGemTick(dt);
  const P = player, hs = Math.hypot(P.vel.x, P.vel.z);
  if (legHas('lightning')) {
    const need = 30 - 4 * legT('lightning');
    if (P.onGround) P.charge = Math.min(need, (P.charge || 0) + hs * dt);
    if (P.charge >= need && Math.random() < dt * 8) spark(new THREE.Vector3(P.pos.x + rand(-0.6, 0.6), P.pos.y + rand(0.2, 1.8), P.pos.z + rand(-0.6, 0.6)), COL.cyan);
  }
  for (const kind of ['fire', 'ice']) {
    if (!legHas(kind) || !P.onGround || hs < 2) continue;
    P['trailT' + kind] = (P['trailT' + kind] || 0) - dt;
    if (P['trailT' + kind] > 0) continue;
    P['trailT' + kind] = 0.14;
    const m = new THREE.Mesh(geoTrail, new THREE.MeshBasicMaterial({ color: kind === 'fire' ? 0xff6a1a : 0xbfe9ff, transparent: true, opacity: 0.7, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.set(P.pos.x + rand(-0.2, 0.2), groundAt(P.pos.x, P.pos.z) + 0.03, P.pos.z + rand(-0.2, 0.2)); m.rotation.y = Math.random() * 6;
    scene.add(m); legTrail.push({ m, kind, life: 1.8 + 0.6 * legT(kind), src: legWithGem(kind), tier: legT(kind) });
    if (legTrail.length > 70) { const o = legTrail.shift(); scene.remove(o.m); o.m.material.dispose(); }
  }
  for (const t of legTrail) {
    t.life -= dt;
    t.m.material.opacity = 0.7 * clamp(t.life / 0.8, 0, 1) * (t.kind === 'fire' ? 0.75 + 0.25 * Math.sin(S.t * 20 + t.m.position.x) : 1);
    if (t.kind === 'fire' && Math.random() < dt * 3) spark(t.m.position.clone().setY(t.m.position.y + 0.2), Math.random() < 0.5 ? 0xff5a2a : 0xffc04a);
    for (const e of enemies) {
      if (e.dead || Math.abs(e.pos.y - t.m.position.y) > 1.2) continue;
      if ((e.pos.x - t.m.position.x) ** 2 + (e.pos.z - t.m.position.z) ** 2 > (0.6 + e.r) ** 2) continue;
      if (t.kind === 'fire') { if (!(e.burnT > 0)) { DMG_SRC = t.src; ignite(e, (10 + ((stats && stats.legLv) || 1) * 0.4) * (0.6 + 0.4 * t.tier)); DMG_SRC = null; } }
      else chill(e, t.tier);
    }
  }
  for (let i = legTrail.length - 1; i >= 0; i--) if (legTrail[i].life <= 0) { scene.remove(legTrail[i].m); legTrail[i].m.material.dispose(); legTrail.splice(i, 1); }
}
function clearLegTrail() { clearGemFx(); legTrail.forEach(t => { scene.remove(t.m); t.m.material.dispose(); }); legTrail.length = 0; }
/* Projectile budget: split and burst shots multiply, and a fast gun with Split + Homing put 1,500 shots in the air (57 ms a step).
   Past SHOT_SOFT the bursts get smaller, past SHOT_HARD they stop (the parent just keeps flying as one shot). The damage stays shared out among what actually spawns. */
const SHOT_SOFT = 320, SHOT_HARD = 560;      // doubled: shots find their targets through the enemy grid now, so twice the bullets costs about what one set did
const shotRoom = n => shots.length >= SHOT_HARD ? 0 : shots.length >= SHOT_SOFT ? Math.max(1, Math.ceil(n / 3)) : n;
function homingSplit(s) {
  const tier = (s.attrs && s.attrs.get && s.attrs.get('homing')) || 1, want = s.pod ? 2 : 2 + tier + (s.combo === 'homing+split' ? 2 : 0), n = shotRoom(want);
  if (n < 2) { s.child = true; return; }                          // no room: carry on as a single homing shot
  // the original target first, then the enemies nearest to it
  const tg = [s.target], seen = new Set(tg);
  while (tg.length < n) { const e = nearestEnemy(aimPt(s.target), 12, seen); if (!e) break; tg.push(e); seen.add(e); }
  const keepSrc = DMG_SRC, keepA = CUR_ATTRS;
  DMG_SRC = s.src; CUR_ATTRS = new Map(s.attrs || []); CUR_ATTRS.combo = s.attrs && s.attrs.combo;
  for (let i = 0; i < n; i++) {
    const t = tg[i % tg.length], dir = s.vel.clone().normalize().add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.2, 0.3), rand(-0.5, 0.5))).normalize();
    bullet(s.pos.clone(), s.pos.clone().add(dir), s.speed || 30, s.dmg / n, s.pod
      ? { kind: 'rocket', explode: (s.explode || 2) * 0.75, target: t, life: 3, knock: 1, noArc: true, child: true, manual: s.manual }
      : { target: t, life: 2.2, knock: s.knock, child: true, manual: s.manual });
    const c = shots[shots.length - 1]; c.mesh.scale.multiplyScalar(s.pod ? 0.75 : 0.7); if (c.homing) c.homeRate = (s.homeRate || 4) * 1.3; c.prevVy = -1;
    if (s.pod) c.pod = true;
  }
  DMG_SRC = keepSrc; CUR_ATTRS = keepA;
  spark(s.pos, s.pod ? ORANGE : ATTRS.homing.color); sfx('pop2', 0.15);
  s.life = 0;
}
/* gems on rockets and missiles: everything caught in the blast gets the gem's effect */
function blastAttrs(s) {
  if (!s.attrs || !s.attrs.size) return;
  const R = (s.explode || 2) * 1.4;
  for (const e of enemies.slice()) if (!e.dead && aimPtT(e).distanceTo(s.pos) < R + e.r) shotAttrHit(s, e);
}
/* Blade Ring: flings spinning blades that circle you, cutting what they pass; its gems change the blades */
const geoBlade = new THREE.BoxGeometry(0.9, 0.04, 0.16);
function bladeTick(dt) {
  for (const it of mountedItems()) {
    if (it.kind !== 'module' || it.type !== 'blades') continue;
    const D = MODULES.blades;
    it.bladeT = (it.bladeT ?? 0.5) - dt;
    if (it.bladeT > 0) continue;
    it.bladeT = D.cd(it.lvl) / Math.max(0.5, (stats.fire || 1) * berserkMul());
    const gm = armGems(it); DMG_SRC = it; CUR_ATTRS = gemMap(gm); CUR_ATTRS.combo = gm.length === 2 ? comboKey(gm[0].type, gm[1].type) : null;
    const n = D.n(it.lvl), a0 = Math.random() * Math.PI * 2, o = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    for (let i = 0; i < n; i++) {
      bullet(o, o.clone().add(new THREE.Vector3(1, 0, 0)), 8, D.dmg(it.lvl) * (stats.dmg || 1), { child: true, knock: 2.2 });
      const s = shots[shots.length - 1];
      const a = a0 + i / n * Math.PI * 2;
      s.orbit = s.orbit || { a, r: 2.8 + 0.3 * (i % 2), y: 1 + 0.25 * (i % 3) }; s.orbit.a = a;
      s.life = D.life + (s.orbit.r > 3 ? 0.4 : 0); s.pierce = 99; s.hitCd = new Map(); s.blade = true; s.grav = 0; s.bounces = 0; s.homing = false;
      // swap the bullet for a spinning blade, tinted by its gem
      const col = gm.length ? new THREE.Color(ATTRS[gm[0].type].color).getHex() : 0xdfe6ec;
      scene.remove(s.mesh); s.mesh = new THREE.Mesh(geoBlade, B(col)); scene.add(s.mesh);
    }
    DMG_SRC = null; CUR_ATTRS = new Map();
    sfx('swish', 0.5);
  }
}
/* Whirl Core: on the beat of your slowest reload, the frame spins round and cuts everything near it */
function whirlTick(dt) {
  const ws = mountedItems().filter(it => it.kind === 'module' && it.type === 'whirl'); if (!ws.length) return;
  // the slowest weapon's full cycle (reload, or its fire interval for guns without a magazine)
  let period = 0;
  for (const w of mountedWeapons()) { const W = WEAPONS[w.type]; period = Math.max(period, W.reload ? W.reload(w.lvl) / (stats.reload || 1) : W.cd ? W.cd(w.lvl) : 1); }
  if (!period) period = 2.5;
  period = Math.max(0.8, period);
  for (const it of ws) {
    it.whirlT = (it.whirlT ?? period) - dt;
    if (it.whirlT > 0) continue;
    it.whirlT = period;
    const D = MODULES.whirl, R = D.radius(it.lvl), c = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    player.whirlT = 0.38;                                    // the body spins (drawn in updatePlayerVisual)
    DMG_SRC = it;
    for (const e of enemies) {
      if (e.dead) continue;
      const p = ecenter(e), d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d > R + e.r || Math.abs(p.y - c.y) > 2.5 + e.r) continue;
      damage(e, D.dmg(it.lvl) * (stats.dmg || 1), false);
      if (!e.dead) knock(e, new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize(), 7, 3);
    }
    DMG_SRC = null;
    ring(player.pos.clone().setY(player.pos.y + 0.6), R, 0.3, 0xdfe8ee); ring(player.pos.clone().setY(player.pos.y + 1.4), R * 0.85, 0.25, ORANGE);
    sfx('swish', 0.8); sfx('slash', 0.4);
  }
}
/* Missile pods: launch straight up, arc over, dive onto an enemy nearby */
function podTick(dt) {
  const ud = player.model && player.model.userData; if (!ud) return;
  for (const it of mountedItems()) {
    if (it.kind !== 'module' || it.type !== 'pods') continue;
    const D = MODULES.pods;
    it.podT = (it.podT || 0) - dt;
    if (it.podT > 0) continue;
    const o = new THREE.Vector3(), mz = ud.muzzleOf.get(it);
    if (mz) mz.getWorldPosition(o); else o.set(player.pos.x, player.pos.y + 2.6, player.pos.z);
    // pick one of the closest few enemies, so a volley spreads out
    const near = enemies.filter(e => !e.dead && e.pos.distanceToSquared(o) < 40 * 40).sort((a, b) => a.pos.distanceToSquared(o) - b.pos.distanceToSquared(o)).slice(0, 4);
    if (!near.length) { it.podT = 0.2; continue; }
    it.podT = D.cd(it.lvl) / Math.max(0.5, (stats.fire || 1) * berserkMul());
    DMG_SRC = it; CUR_ATTRS = gemMap(armGems(it));            // its gem changes the missiles
    const n = D.volley(it.lvl);
    const attrs = CUR_ATTRS;
    // pop-pop-pop: the tubes fire one after another, each with a little puff
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (!S.inRun || S.mode !== 'play' || !mountedItems().includes(it)) return;
      const te = near[i % near.length], oo = o.clone().add(new THREE.Vector3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2)));
      if (mz) { mz.getWorldPosition(oo); oo.add(new THREE.Vector3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))); }
      const up = oo.clone().add(new THREE.Vector3(rand(-2.5, 2.5), 10, rand(-2.5, 2.5)));
      DMG_SRC = it; CUR_ATTRS = attrs; CUR_WTYPE = 'pods'; CUR_WTYPE_POD = true;
      bullet(oo, up, rand(13, 17), D.dmg(it.lvl) * (stats.dmg || 1), { kind: 'rocket', explode: D.radius, target: te.dead ? null : te, life: 4, knock: 1, noArc: true });
      const s = shots[shots.length - 1]; s.climb = rand(0.25, 0.45); s.pod = true; s.mesh.scale.setScalar(0.5);
      DMG_SRC = null; CUR_ATTRS = new Map(); CUR_WTYPE = null; CUR_WTYPE_POD = false;
      puff(oo, 0.3, 0.6); sfxP('pop', 0.35, rand(0.9, 1.2)); sfx('rocket', 0.08);
    }, i * 75);
    DMG_SRC = null;
  }
}
const isHeld = w => mountedArms().some(a => armGuns(a).includes(w));
function damage(e, amt, manual) {
  if (e.dead) return;
  const crit = Math.random() < ((stats && stats.crit) || 0);
  if (crit) { amt *= 2; sfx('tink', 0.7); }
  if (e.boss) amt = bossHit(e, amt);
  runStatDamage(DMG_SRC, Math.min(amt, Math.max(0, e.hp)), amt);
  if (!ENV_DMG) { dmgNumber(aimPt(e), amt, crit); sfx('squeak', 0.22); }      // no numbers for damage you didn't do
  if (Math.random() < 0.25 && e.pos.y - groundAt(e.pos.x, e.pos.z) < 3) splatter(e, 1, e.r * 1.2);
  HIT_E = e; HIT_DEALT = Math.min(amt, Math.max(0, e.hp));       // what really lands: overkill is not counted
  e.hp -= amt; e.flash = 0.08;
  if (manual) { hitMarker(); sfx('hit', 0.3); }
  if (e.hp <= 0) { creditWeaponKill(DMG_SRC); killEnemy(e); }
}
/* Pickup budget: shards and bolts nobody collected used to pile up without limit (600+ separate meshes after a few minutes). Past GEM_CAP a new
   one is folded into the nearest loose one of its kind (the value is kept, it just grows) instead of becoming another mesh. */
const GEM_CAP = 220, GEM_N = { xp: 0, bolt: 0 };
function foldGem(kind, p, val) {
  let best = null, bd = 1e9;
  for (const g of gems) if (g.kind === kind && !g.pull && !g.float && !g.sky && !g.done) { const d = (g.pos.x - p.x) ** 2 + (g.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = g; } }
  if (!best) return false;
  best.val += val; best.mesh.scale.setScalar(Math.min(2.2, 1 + Math.log2(1 + best.val / (kind === 'xp' ? 2 : 4)) * 0.25));
  if (kind === 'xp') best.mesh.material = B(COL.amber);
  return true;
}
function dropGem(p, val) {
  if (GEM_N.xp >= GEM_CAP && foldGem('xp', p, val)) return;
  const big = val >= 3;
  const m = new THREE.Mesh(geoGem, B(big ? COL.amber : COL.cyan)); if (big) m.scale.setScalar(1.4);
  const pos = new THREE.Vector3(p.x + rand(-.6, .6), p.y + 1, p.z + rand(-.6, .6)); m.position.copy(pos); scene.add(m);
  gems.push({ kind: 'xp', mesh: m, pos, vel: new THREE.Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)), val, pull: false });
}
const geoBolt = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 6); geoBolt.rotateX(Math.PI / 2);
/* Health pack: a white case with a red cross. Restores 30% hull. Very rare. */
function dropHealth(p) {
  const g = new THREE.Group();
  g.add(bx(0.55, 0.4, 0.4, 0xece5d0));
  g.add(bx(0.36, 0.1, 0.42, COL.red, 0, 0, 0, 0x601020)); g.add(bx(0.1, 0.3, 0.42, COL.red, 0, 0, 0, 0x601020));
  const pos = new THREE.Vector3(p.x, p.y + 1, p.z); g.position.copy(pos); scene.add(g);
  gems.push({ kind: 'health', mesh: g, pos, vel: new THREE.Vector3(rand(-2, 2), 7, rand(-2, 2)), val: 0.3, pull: false });
}
/* Rare power-ups: the XP vacuum (a cyan magnet) and the nuke (a hazard-striped warhead). */
const POWER_NAMES = { vacuum: 'Magnet', nuke: 'Nuke', frenzy: 'Coin Frenzy', berserk: 'Berserk', health: 'Repair Kit', case: 'Weapon Case' };
const POWER_COLOR = { vacuum: COL.cyan, nuke: 0xf2c230, frenzy: 0xffd23a, berserk: 0xff3a3a, health: 0xff5a6a, case: 0xff7a1a };
/* a temporary power-up never drops while the same one is already active or still lying on the field */
function powerActive(kind) {
  if (kind === 'berserk' && (S.berserkT || 0) > 0) return true;
  if (kind === 'frenzy' && (S.frenzyT || 0) > 0) return true;
  if (kind === 'nuke' && S.nuke) return true;
  if (kind === 'vacuum' && gems.some(g => g.float)) return true;
  return gems.some(g => g.kind === kind);
}
function dropPower(p, kind, force) {
  if (!force && powerActive(kind)) return;
  const g = powerMesh(kind);
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: POWER_COLOR[kind] || 0xf2c230, transparent: true, opacity: 0.3, depthWrite: false }));
  beam.scale.set(0.1, 5, 0.1); beam.position.y = 2.4; g.add(beam);
  const pos = new THREE.Vector3(p.x, p.y + 1, p.z); g.position.copy(pos); scene.add(g);
  gems.push({ kind, mesh: g, pos, vel: new THREE.Vector3(rand(-2, 2), 7, rand(-2, 2)), val: 0, pull: false });
}
/* the look of each power-up (shared by the drop and the catalog) */
function powerMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'health') {
    g.add(bx(0.55, 0.4, 0.4, 0xece5d0));
    g.add(bx(0.36, 0.1, 0.42, COL.red, 0, 0, 0, 0x601020)); g.add(bx(0.1, 0.3, 0.42, COL.red, 0, 0, 0, 0x601020));
    return g;
  }
  if (kind === 'case') { g.add(caseMesh()); return g; }
  if (kind === 'berserk') {
    // a red spiked core: angry, unmistakable
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), M(0xff3a3a, 0x6a0808)); g.add(core);
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), M(0x2b2f33)); sp.position.set(x * 0.38, y * 0.38, z * 0.38); sp.lookAt(x * 2, y * 2, z * 2); sp.rotateX(Math.PI / 2); g.add(sp); }
    return g;
  }
  if (kind === 'frenzy') {
    // two fat gold coins, one leaning on the other
    const coin = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 18);
    const a = new THREE.Mesh(coin, M(0xffc83a, 0x6a4a08)); a.rotation.x = Math.PI / 2; a.position.set(-0.12, 0, 0); g.add(a);
    const b = new THREE.Mesh(coin, M(0xffd85a, 0x6a4a08)); b.rotation.set(Math.PI / 2, 0, 0.5); b.position.set(0.16, 0.1, 0.06); g.add(b);
    g.add(bx(0.1, 0.3, 0.12, 0x6a4a08, -0.12, 0, 0.06)); g.add(bx(0.1, 0.3, 0.12, 0x6a4a08, 0.16, 0.1, 0.12));
  } else if (kind === 'vacuum') {
    const mat = M(COL.cyan, 0x1b6a70);
    g.add(bx(0.18, 0.55, 0.18, COL.cyan, -0.22, 0.05, 0, 0x1b6a70)); g.add(bx(0.18, 0.55, 0.18, COL.cyan, 0.22, 0.05, 0, 0x1b6a70));
    g.add(bx(0.62, 0.18, 0.18, COL.cyan, 0, -0.22, 0, 0x1b6a70));
    g.add(bx(0.2, 0.12, 0.2, 0xe4e9ea, -0.22, 0.36, 0)); g.add(bx(0.2, 0.12, 0.2, 0xe4e9ea, 0.22, 0.36, 0));
  } else {
    const core = new THREE.Mesh(geoSphere, M(0xf2c230, 0x5a4008)); core.scale.setScalar(0.36); g.add(core);
    for (const r of [0, 1.05, 2.1]) { const b = bx(0.74, 0.1, 0.1, COL.dark, 0, 0, 0); b.rotation.z = r; g.add(b); }
    g.add(bx(0.14, 0.3, 0.14, COL.dark, 0, 0.42, 0));
  }
  return g;
}
function usePower(kind) {
  discover('power:' + kind, POWER_NAMES[kind]);
  if (kind === 'berserk') {
    S.berserkT = BERSERK_T;
    banner('BERSERK', '×2 fire rate · no reload', '#ff3a3a', 2.2);
    sfx('thoom', 0.7); sfx('jackpot', 0.5); ring(player.pos, 9, 0.5, 0xff3a3a); ring(player.pos, 5, 0.4, 0xff8a6a);
    cam.shake = Math.max(cam.shake || 0, 0.4); $('#bzBar').hidden = false; document.body.classList.add('berserk');
    return;
  }
  if (kind === 'frenzy') {
    S.frenzyT = 15; S.frenzyMax = 15; S.fzRain = 0; S.fzPop = 0;
    banner('COIN FRENZY', '15s', '#ffd23a', 2.2);
    sfx('jackpot', 0.8); ring(player.pos, 10, 0.6, 0xffd23a); ring(player.pos, 6, 0.45, 0xfff0a0);
    $('#fzBar').hidden = false;
    return;
  }
  if (kind === 'vacuum') {
    // every scrap on the field lifts gently into the air, hangs a moment, then drifts in to you from above
    for (const g of gems) if (g.kind === 'xp' && !g.sky) { g.pull = false; g.vac = false; g.float = { t: 0, delay: rand(0.6, 1.4), y0: g.pos.y, lift: rand(3, 6), ph: Math.random() * 6 }; }
    banner('MAGNET', '', 'var(--xp)', 1.8);
    sfx('vacuum', 0.7); ring(player.pos, 14, 0.7, COL.cyan); ring(player.pos, 8, 0.5, 0x9feaff);
  } else {
    // the nuke: a warhead whistles down out of the sky... then everything that isn't a boss is scrapped
    const g = new THREE.Group();
    g.add(bx(0.7, 1.8, 0.7, 0x2b2f33)); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 10), M(0xf2c230, 0x5a4000)); tip.rotation.x = Math.PI; tip.position.y = -1.3; g.add(tip);
    for (const a of [0, 1, 2, 3]) { const fin = bx(0.06, 0.6, 0.5, 0xf2c230, 0, 0.8, 0); fin.rotation.y = a * Math.PI / 2; fin.position.set(Math.sin(a * Math.PI / 2) * 0.35, 0.8, Math.cos(a * Math.PI / 2) * 0.35); g.add(fin); }
    const at = player.pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))); at.y = groundAt(at.x, at.z);
    g.position.set(at.x, at.y + 90, at.z); scene.add(g);
    S.nuke = { obj: g, at, t: 0, dur: 2.3 };
    sfx('nukefall', 0.8);
    banner('NUKE INBOUND', '', '#f2c230', 2);
  }
}
/* the falling warhead and its blast */
function nukeTick(dt) {
  const N = S.nuke; if (!N) return;
  N.t += dt; const k = Math.min(1, N.t / N.dur);
  N.obj.position.y = N.at.y + 90 * (1 - k * k); N.obj.rotation.y += dt * 4;
  if (Math.random() < 0.6) smokePuff(N.obj.position.clone().add(new THREE.Vector3(0, 1.4, 0)), rand(0.4, 0.8));
  cam.shake = Math.max(cam.shake, k * 0.25);
  if (k < 1) return;
  scene.remove(N.obj); S.nuke = null;
  const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  sfx('boom', 1.4); setTimeout(() => sfx('boom', 0.8), 120); cam.shake = 1.6;
  MASS_KILL = true;
  for (const e of enemies) { if (e.dead) continue; if (e.boss || e.mini) damage(e, e.maxHp * 0.25); else killEnemy(e); }
  MASS_KILL = false;
  blast(N.at.clone().setY(N.at.y + 2), 12, 0xffe2a0); ring(N.at, 60, 1.4, 0xf2c230); ring(N.at, 30, 1, ORANGE); dust(N.at, 24);
  for (let i = 0; i < 10; i++) smokePuff(N.at.clone().add(new THREE.Vector3(rand(-4, 4), rand(1, 8), rand(-4, 4))), rand(2, 3.5));
  propsBlast(N.at.clone(), 40, 10);
  banner('FIELD CLEARED', '', '#f2c230', 1.8);
}
/* Bolts: the currency. Gold hex nuts, rarer than experience. */
function dropBolt(p, val) {
  if (GEM_N.bolt >= GEM_CAP && foldGem('bolt', p, val)) return;
  const m = new THREE.Mesh(geoBolt, M(0xe8c35a, 0x6a4a10));
  const pos = new THREE.Vector3(p.x + rand(-.6, .6), p.y + 1, p.z + rand(-.6, .6)); m.position.copy(pos); scene.add(m);
  gems.push({ kind: 'bolt', mesh: m, pos, vel: new THREE.Vector3(rand(-3, 3), rand(6, 9), rand(-3, 3)), val, pull: false });
}
/* A part lying in the world: spins over a rarity-coloured beam until you walk into it. */
function dropLoot(p, item) {
  const g = new THREE.Group();
  const model = buildPart(item, new THREE.Vector3(1, 0, 0), null);
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
  model.position.copy(c).negate(); const spin = new THREE.Group(); spin.add(model); g.add(spin);
  const col = item.kind === 'gem' ? new THREE.Color(ATTRS[item.type].color).getHex() : item.kind === 'orb' ? 0xffd24a : rarityOf(item.lvl).color;
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
  beam.scale.set(0.12, 6, 0.12); beam.position.y = 2.5; g.add(beam);
  const halo = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  halo.scale.setScalar(0.9); halo.position.y = -0.55; g.add(halo);
  const pos = p.clone(); g.position.copy(pos); scene.add(g);
  gems.push({ kind: 'loot', item, mesh: g, spin, pos, vel: new THREE.Vector3(rand(-2, 2), 7, rand(-2, 2)), val: 0, pull: false });
}
/* Overhead health bar for elites: a billboard that always faces the camera. */
function makeHealthBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshBasicMaterial({ color: 0x111418, transparent: true, opacity: 0.8, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.12), new THREE.MeshBasicMaterial({ color: 0xe2465c, depthWrite: false }));
  fill.position.z = 0.01; g.add(bg); g.add(fill); g.userData.fill = fill;
  g.renderOrder = 10; scene.add(g);
  return g;
}
const CULL = { q: [] }, CULL_PER_STEP = 12;
function cullTick() { const q = CULL.q; if (!q.length) return; for (let n = 0; n < CULL_PER_STEP && q.length; n++) { const o = q.pop(); if (!o.dead) killEnemy(o); } }
function onBossDown(e) {
  creditBossKill(e.type);
  S.bossDead = true; S.boss = null; $('#bossbar').hidden = true; cam.shake = 1;
  // the swarm falls with its boss, but not all in one call: 600 kills at once (particles, drops, sounds, gem effects) froze the game for seconds.
  // They go down in a quick wave, CULL_PER_STEP a step, harmless meanwhile.
  CULL.q = enemies.filter(o => o !== e && !o.dead); CULL.q.forEach(o => { o.dmg = 0; o.noSpawn = true; });
  for (let i = 0; i < 10; i++) dropGem(e.pos, 3);
  if (!S.gate) placeGate(e.pos.x, e.pos.z);
  setGateState('exit');
  banner('WARDEN DOWN', 'Exit open', 'var(--orange)', 3.5);
}

/* ---------- gate ---------- */
function placeGate(px, pz) {
  let k = -1;
  if (px !== undefined) k = idxOf(px, pz);
  else for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(25, 48), c = idxOf(player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d);
    if (c >= 0 && inner(c)) { k = c; break; }
  }
  if (k < 0 || !inner(k)) do { k = (Math.random() * NC) | 0; } while (!inner(k));
  const x = cellX(k), z = cellZ(k), y = H[k];
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(bx(0.8, 5, 0.8, COL.dark, -2, 2.5, 0)); g.add(bx(0.8, 5, 0.8, COL.dark, 2, 2.5, 0)); g.add(bx(5, 0.8, 0.9, COL.dark, 0, 5.2, 0));
  const panel = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.55 }));
  panel.scale.set(3.2, 4.4, 0.2); panel.position.y = 2.4; g.add(panel);
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.16, depthWrite: false }));
  beam.scale.set(1.4, 140, 1.4); beam.position.y = 75; g.add(beam);
  g.rotation.y = Math.atan2(-x, -z);
  scene.add(g);
  S.gate = { group: g, panel, beam, x, z, y, state: 'open' };
}
function setGateState(s) {
  if (!S.gate) return;
  S.gate.state = s;
  const c = s === 'sealed' ? COL.red : s === 'exit' ? ORANGE : COL.cyan;
  S.gate.panel.material.color.setHex(c); S.gate.beam.material.color.setHex(c);
}

/* ---------- weapons (behaviour lives in WEAPONS in data.js) ---------- */
const _nearList = [];
function nearestEnemy(o, range, exclude) {
  let best = null, bd = range * range;
  const list = range < 60 ? egNear(o.x, o.z, range, _nearList) : enemies;
  for (let ni = 0; ni < list.length; ni++) {
    const e = list[ni];
    if (e.dead || e.d.npc || (exclude && exclude.has(e))) continue;
    const d = aimPtT(e).distanceToSquared(o);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/* Arm Mk: +15% fire rate per level (turn speed is applied in the visuals) */
const berserkMul = () => (S.berserkT > 0 ? 2 : 1);           // BERSERK: double fire rate on everything
function armMods(arm) { const A = ARMS[arm.type]; return { dmg: A.dmg * stats.dmg * armDmgMul(arm), rate: armRate(arm) * stats.fire * berserkMul(), auto: A.auto, range: A.range || 1 }; }

/* Fire a weapon: plays its sound, and the Split Chamber stat can add extra shots. */
/* Magazines: each weapon fires its magazine, then reloads (reload speed is its own stat). */
function weaponReady(w, W, dt) {
  if (!W.mag) return true;
  if (w.ammo === undefined) w.ammo = W.mag(w.lvl);
  if (S.berserkT > 0) { if (w.reloadT > 0) { w.reloadT = 0; w.ammo = W.mag(w.lvl); } return true; }     // BERSERK: no reloads at all
  if (!(w.reloadT > 0) && w.ammo < W.mag(w.lvl) && S.t - (w.lastShot || 0) > 1.6) { w.reloadT = W.reload(w.lvl) / (stats.reload || 1); sfx('reload', 0.3); }
  if (w.reloadT > 0) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) { w.reloadT = 0; w.ammo = W.mag(w.lvl); sfx('reloaded', 0.35); }
    return false;
  }
  return true;
}
/* Spent brass (or a red shotgun shell) kicked out to the side of the gun; it bounces once or twice and fades. */
const geoCasing = new THREE.CylinderGeometry(0.035, 0.035, 0.11, 6);
function ejectCasing(o, dir, kind) {
  const right = new THREE.Vector3().crossVectors(dir, UP3).normalize();
  if (right.lengthSq() < 0.1) right.set(1, 0, 0);
  const m = new THREE.Mesh(geoCasing, M(kind === 'shell' ? 0xb8322c : 0xd8a640, kind === 'shell' ? 0x300a08 : 0x3a2808));
  if (kind === 'shell') m.scale.set(1.6, 1.4, 1.6);
  const p = o.clone().addScaledVector(dir, -0.35); m.position.copy(p);
  const v = right.multiplyScalar(rand(2.5, 4)).addScaledVector(dir, rand(-1.2, -0.3)).add(new THREE.Vector3(rand(-0.5, 0.5), rand(2.5, 4), rand(-0.5, 0.5)));
  const w = new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20));
  addFx(m, rand(1.2, 1.8), (f, dt) => {
    v.y -= 26 * dt; f.obj.position.addScaledVector(v, dt);
    f.obj.rotation.x += w.x * dt; f.obj.rotation.y += w.y * dt; f.obj.rotation.z += w.z * dt;
    const g = groundAt(f.obj.position.x, f.obj.position.z) + 0.04;
    if (f.obj.position.y < g) { f.obj.position.y = g; if (v.y < 0) v.y *= -0.35; v.x *= 0.6; v.z *= 0.6; w.multiplyScalar(0.6); }
    if (f.life < 0.3) f.obj.scale.setScalar(f.life / 0.3 * (kind === 'shell' ? 1.5 : 1));
  });
}
let CUR_ATTRS = new Map();
let CUR_VOL = 0;         // one id per trigger pull: shots from the same volley share it (Leech Swarm)
let CUR_ARM = null;      // the arm whose shot is being made (Lifesteal needs to know which arm to cap)
let HIT_E = null, HIT_DEALT = 0;     // the last enemy damage() hit and how much really landed (no overkill)
let CUR_RANGE = 1;       // weapon range multiplier while a shot is being made (arm range x the Long Barrel stat)
function fireW(W, c) {
  CUR_RANGE = Math.max(0.5, ((c.m && c.m.range) || 1) * ((stats && stats.range) || 1));
  // a twin arm fires both guns at once, so the pair is less accurate: a cone that narrows with level but never closes
  if (c.twin && c.arm && c.tp) {
    const half = THREE.MathUtils.degToRad(TWIN_SPREAD_DEG), dist = c.o.distanceTo(c.tp), r = Math.tan(half) * Math.sqrt(Math.random()) * dist, a = Math.random() * Math.PI * 2;
    const fwd = c.tp.clone().sub(c.o).normalize(), side = new THREE.Vector3().crossVectors(fwd, UP3).normalize(), up = new THREE.Vector3().crossVectors(side, fwd);
    c = { ...c, tp: c.tp.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r), te: null };
  }
  // attributes live on arms and change whatever gun the arm holds
  CUR_ATTRS = gemMap(armGems(c.arm)); CUR_ATTRS.combo = armCombo(c.arm); CUR_ARM = c.arm || null; CUR_VOL++;
  DMG_SRC = c.w; CUR_KICK = W.kick || 0.6; CUR_WTYPE = c.w.type;
  if (c.manual) XH.bloom = Math.min(1, XH.bloom + 0.16 + (W.kick || 0) * 0.07);     // the reticle flares (looks only: aim is unchanged)
  W.fire(c);
  // split: one extra copy of the shot per tier (combos fan out wider and add more)
  {
    const cb = CUR_ATTRS.combo, sp = CUR_ATTRS.get('split') || 0;
    let n = sp, fan = 0.05;
    if (cb === 'split+split') { n = sp * 2 + 2; fan = 0.12; }
    else if (cb === 'fire+split' || cb === 'ice+split') { n = sp + 2; fan = 0.1; }
    for (let i = 0; i < n; i++) { const cd = c.w.cd; W.fire({ ...c, tp: c.tp.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(fan * c.o.distanceTo(c.tp))) }); c.w.cd = cd; }
  }
  // magazine
  c.w.lastShot = S.t;
  if (W.mag && !(S.berserkT > 0)) { c.w.ammo = (c.w.ammo ?? W.mag(c.lv)) - 1; if (c.w.ammo <= 0) { c.w.reloadT = W.reload(c.lv) / (stats.reload || 1); sfx('reload', 0.4); } }
  // kick: an arm soaks up most of it; a gun bolted straight to the body shoves the whole frame
  const kick = W.kick || 0, dir = c.tp.clone().sub(c.o).normalize();
  if (kick) {
    c.w.slideV = (c.w.slideV || 0) + kick * 4.6;
    if (c.arm) c.arm.kickV = (c.arm.kickV || 0) + kick * 10;    // arms jump more (looks only: shots still go where you aim)
    const P = player, fs = Math.sin(P.legYaw), fc = Math.cos(P.legYaw);
    const fwd = dir.x * fs + dir.z * fc, side = dir.x * fc - dir.z * fs, k = kick * (c.arm ? 0.12 : 0.55);
    P.swayV.x -= fwd * k; P.swayV.y += side * k;
    if (c.manual && c.w.type !== 'sniper') { cam.shake = Math.max(cam.shake, Math.min(0.28, kick * 0.09)); camKick(dir.clone().negate(), Math.min(0.12, kick * 0.03)); }
  }
  if (W.casing) ejectCasing(c.o, dir, W.casing);
  if (kick) physRecoil(c.w, dir, kick);
  CUR_ATTRS = new Set();
  // Split Chamber: at most ONE extra shot per trigger pull, at 60% damage, never on very fast guns (no projectile spam)
  const extra = Math.min(0.35, stats.multi || 0), slow = !W.cd || W.cd(c.lv) >= 0.2;
  if (slow && Math.random() < extra) {
    const tp = c.tp.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).multiplyScalar(0.06 * c.o.distanceTo(c.tp)));
    const cd = c.w.cd; W.fire({ ...c, tp, m: { ...c.m, dmg: c.m.dmg * 0.6 } }); c.w.cd = cd;
  }
  muzzleFlash(c.o, dir, Math.min(2.2, 0.5 + kick * 0.45));
  wfxFire(c, W, dir);
  CUR_KICK = 0; CUR_WTYPE = null; CUR_RANGE = 1;
  if (W.sound) sfxP(W.sound, c.manual ? 0.55 : c.fixed ? 0.18 : 0.35, wfxShotPitch(c));
}
const FIXED_CONE = 0.4;   // radians either side of its barrel that a block-mounted weapon will fire at
const AUTO_CONE = 1.45;   // an auto arm only engages enemies within this angle of the way it is mounted (~83°)
const AUTO_ALIGN = 0.22;  // and only fires once its barrel has swung this close to the target
function updateWeapons(dt) { updateWeapons_(dt); DMG_SRC = null; }
function updateWeapons_(dt) {
  const ud = player.model.userData;
  const muzzlePos = w => { const o = new THREE.Vector3(), m = ud.muzzleOf.get(w); if (m) m.getWorldPosition(o); else o.set(player.pos.x, player.pos.y + 2.3, player.pos.z); return o; };
  const held = new Set(mountedArms().flatMap(armGuns));
  for (const it of mountedItems()) {
    if (held.has(it)) continue;
    if (it.kind === 'arm') {
      const arm = it, m = armMods(arm), guns = armGuns(arm);
      if (!guns.length) { arm.aimT = m.auto ? null : aim.point; continue; }
      // every gun on the arm cools down, reloads and fires on its own timers; a twin arm fires both at once (with a spread penalty)
      const ready = new Map();
      for (const g of guns) { g.cd = (g.cd || 0) - dt; g.swingCd = (g.swingCd || 0) - dt; ready.set(g, weaponReady(g, WEAPONS[g.type], dt)); }
      const twin = guns.length > 1;
      for (const w of guns) {
      const W = WEAPONS[w.type], rdy = ready.get(w);
      if (W.tick) W.tick({ w, lv: w.lvl, m, arm, dt });
      if (W.saw) {
        // chainsaw: revs while you hold fire (manual arm), or while anything is within the bar's reach (auto arm)
        const o = muzzlePos(w), near = nearestEnemy(o, W.reach(w.lvl) + 1);
        arm.aimT = m.auto ? (near ? aimPt(near) : null) : aim.point;
        w.sawOn = m.auto ? !!near : IN.fire;
        continue;
      }
      if (W.melee) {
        // swing: on the trigger (manual arm) or when an enemy comes in reach (auto arm)
        const o = muzzlePos(w), near = nearestEnemy(o, W.reach ? W.reach(w.lvl) : 3.2);
        arm.aimT = m.auto ? (near ? aimPt(near) : null) : aim.point;
        if ((w.swingCd || 0) <= 0 && (m.auto ? !!near : IN.fire)) {
          w.swingCd = 0.34 / Math.max(0.5, m.rate); arm.swingT = Math.max(arm.swingT || 0, w.swingCd); if ((arm.swingT || 0) >= w.swingCd) arm.swingDir = -(arm.swingDir || 1); sfx('swish', 0.5);
          if (W.arc) katanaSweep(w, W, m, arm);
        }
        continue;
      }
      if (!W.fire) { arm.aimT = null; continue; }
      const o = muzzlePos(w);
      let tp, te = null;
      if (m.auto) {
        // only enemies on the side the arm is mounted facing (rotate it in the workbench to change sides)
        const ag = ud.partOf.get(arm);
        const facing = ag ? new THREE.Vector3(0, 0, 1).applyQuaternion(ag.parent.getWorldQuaternion(new THREE.Quaternion())) : null;
        const range = (W.range || 40) * m.range;
        let bd = range * range;
        for (const e of enemies) {
          if (e.dead || e.d.npc) continue;
          const v = aimPtT(e).sub(o), d2 = v.lengthSq();
          if (d2 >= bd) continue;
          if (facing && v.normalize().dot(facing) < Math.cos(AUTO_CONE)) continue;
          bd = d2; te = e;
        }
        arm.aimT = te ? aimPt(te) : null;
        if (!te) continue;
        tp = aimPt(te);
        const mz = ud.muzzleOf.get(w);
        // Sentry: fires once its barrel is within its tolerance of the target (it narrows with level), and the shot is not corrected, so it lands a little off
        const tol = THREE.MathUtils.degToRad(SENTRY_TOL_DEG);
        if (mz && mz.getWorldDirection(new THREE.Vector3()).dot(tp.clone().sub(o).normalize()) < Math.cos(tol)) continue;   // still turning
        tp.add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).multiplyScalar(Math.tan(tol * 0.35) * tp.distanceTo(o)));
      } else {
        arm.aimT = aim.point;
        if (!IN.fire) continue;
        tp = aim.point.clone(); te = aim.enemy;
      }
      if (w.cd > 0 || !rdy) continue;
      fireW(W, { w, lv: w.lvl, m, o, tp, te, manual: !m.auto, arm, twin });
      }
    } else if (it.kind === 'weapon') {
      // mounted straight on a block: fires continuously the way it faces
      const w = it, W = WEAPONS[w.type];
      w.cd = (w.cd || 0) - dt;
      const rdy = weaponReady(w, W, dt);
      const m = { dmg: stats.dmg * FIXED_DMG, rate: stats.fire * berserkMul(), auto: true, range: 1 };
      if (W.tick) W.tick({ w, lv: w.lvl, m, arm: null, dt });
      const mz = ud.muzzleOf.get(w);
      if (!W.fire || w.cd > 0 || !mz || !rdy) continue;
      const o = muzzlePos(w);
      const fwd = mz.getWorldDirection(new THREE.Vector3()).normalize();   // whichever way it has been turned
      const range = W.range || 40;
      // always firing, straight down the barrel, whatever you're doing
      fireW(W, { w, lv: w.lvl, m, o, tp: o.clone().addScaledVector(fwd, range), te: null, manual: false, fixed: true });
    }
  }
}
/* Melee: every blade on the frame cuts whatever it passes through, harder the faster it's moving.
   Runs on the rendered motion (arm swings, spin gears, the frame running), once per enemy per 0.3 s. */
const _mt = new THREE.Vector3(), _mb = new THREE.Vector3();
function meleeTick(dt) {
  if (!player.model || dt <= 0) return;
  const ud = player.model.userData, now = S.t;
  for (const w of mountedWeapons()) {
    const W = WEAPONS[w.type]; if (!W.melee || W.arc) continue;
    const tipO = ud.muzzleOf.get(w), baseO = ud.baseOf.get(w); if (!tipO || !baseO) continue;
    tipO.getWorldPosition(_mt); baseO.getWorldPosition(_mb);
    const last = w._lastTip; w._lastTip = _mt.clone();
    if (!last) continue;
    const vel = _mt.clone().sub(last).divideScalar(dt), sp = vel.length();
    if (sp < 3) continue;
    for (const e of enemies) {
      if (e.dead) continue;
      const rr = e.r + 0.3 + (e.boss ? 1.6 : 0);
      if (segDist2(_mb, _mt, aimPtT(e)) > rr * rr && segDist2(last, _mt, aimPtT(e)) > rr * rr) continue;
      e.meleeT = e.meleeT || {};
      if ((e.meleeT[w.id] || -9) > now - 0.3) continue;
      e.meleeT[w.id] = now;
      const dmg = W.dmg(w.lvl) * stats.dmg * clamp(sp / 10, 0.3, 3) * (isHeld(w) ? 1 : FIXED_DMG);
      DMG_SRC = w; damage(e, dmg, true); DMG_SRC = null; spark(_mt, 0xffffff); sfx('slash', 0.5);
      knock(e, vel.clone().setY(0).normalize(), Math.min(14, sp * 0.5), 2);
    }
  }
}
/* Gravity gun: a slow purple singularity that coasts to a stop, drags every enemy in its radius into a knot,
   then collapses on them for one hit. */
const geoWell = new THREE.IcosahedronGeometry(1, 2);
function gravityWell(o, tp, dmg, pull, radius, manual) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(geoWell, new THREE.MeshBasicMaterial({ color: 0x15061f })); core.scale.setScalar(0.35); g.add(core);
  const halo = new THREE.Mesh(geoWell, new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(0.6); g.add(halo);
  const field = new THREE.Mesh(geoWell, new THREE.MeshBasicMaterial({ color: 0x8a5cff, wireframe: true, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })); field.scale.setScalar(radius); g.add(field);
  wfxWellMake(g);
  g.position.copy(o); scene.add(g);
  const dir = tp.clone().sub(o).normalize(), dist = Math.min(o.distanceTo(tp), 34);
  shots.push({ mesh: g, pos: o.clone(), last: o.clone(), vel: dir.multiplyScalar(Math.max(9, dist * 1.2)), life: 2.6, max: 2.6, r: 0.4, dmg: 0, pierce: 999, hit: new Set(), attrs: CUR_ATTRS, src: DMG_SRC, manual,
    well: { dmg, pull, radius, halo, field, core } });
}
function wellTick(s, dt) {
  const W = s.well, k = 1 - s.life / s.max;
  wfxWellTick(s, dt);
  s.vel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));                       // coasts to a stop
  s.pos.addScaledVector(s.vel, dt);
  const gy = groundAt(s.pos.x, s.pos.z) + 1.2; if (s.pos.y < gy) { s.pos.y = gy; s.vel.y = Math.abs(s.vel.y) * 0.3; }
  s.mesh.position.copy(s.pos);
  W.halo.scale.setScalar(0.6 + 0.12 * Math.sin(S.t * 18)); W.field.rotation.y += dt * 2; W.field.rotation.x += dt * 0.7;
  W.field.material.opacity = 0.06 + 0.06 * Math.sin(S.t * 6);
  for (const e of enemies) {
    if (e.dead || e.boss) continue;
    const c = ecenter(e), v = s.pos.clone().sub(c), d = v.length();
    if (d > W.radius || d < 1e-3) continue;
    v.divideScalar(d);
    // dragged in at a speed set by the gun's pull (heavier enemies resist), and held in the knot
    const want = Math.min(d * 3, W.pull * (0.45 + 0.55 * (1 - d / W.radius)) / Math.max(0.7, Math.sqrt(e.mass)));
    e.vel.lerp(v.clone().multiplyScalar(want), Math.min(1, dt * 5));
    if (d > 1.0) { e.onGround = false; e.stun = Math.max(e.stun, 0.3); }
    e.pullT = 0.1;
    if (Math.random() < dt * 3) spark(c, 0x8a5cff);
  }
  if (s.life <= 0) {
    // collapse: one hit on everything in the knot, and a soft shove outward
    for (const e of enemies) {
      if (e.dead) continue;
      const c = ecenter(e), d = c.distanceTo(s.pos);
      if (d < 3.2 + e.r) { damage(e, W.dmg * (d < 1.8 ? 1 : 0.6), s.manual); if (s.attrs && s.attrs.size) shotAttrHit(s, e); if (!e.dead) knock(e, c.clone().sub(s.pos).setY(0.4).normalize(), 4, 2); }
    }
    burst(s.pos, 0x8a5cff, 10); wfxWellCollapse(s);
  }
}
/* Forcefield: a sphere round the robot that hurts everything inside it on each pulse. */
function fieldTick(dt) {
  if (!player.props || !player.props.length) return;
  for (const s of player.props) {
    const w = s.userData.field; if (!w) continue;
    const W = WEAPONS.field, R = W.radius(w.lvl) * ((stats && stats.range) || 1), t = S.t;
    s.position.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    // on-for-a-while, then a cooldown: fieldOnT counts down while active; on hitting zero, fieldCoolT counts down with the field off
    if (w.fieldCoolT > 0) {
      w.fieldCoolT -= dt;
      s.visible = false;
      if (w.fieldCoolT <= 0) { w.fieldCoolT = 0; w.fieldOnT = W.onDur(w.lvl); sfx('reloaded', 0.3); }
      continue;
    }
    if (!(w.fieldOnT > 0)) w.fieldOnT = W.onDur(w.lvl);
    s.visible = true;
    w.fieldOnT -= dt;
    if (w.fieldOnT <= 0) { w.fieldCoolT = W.reload(w.lvl) / (stats.reload || 1); sfx('reload', 0.3); continue; }
    w.fieldT = (w.fieldT || 0) - dt;
    const ping = Math.max(0, w.fieldPing || 0); w.fieldPing = ping - dt * 1.4;
    s.scale.setScalar(R * (1 + 0.03 * Math.sin(t * 9) + 0.06 * ping));
    s.material.uniforms.uTime.value = t; s.material.uniforms.uPing.value = Math.min(1, ping);
    s.rotation.y += dt * 0.3;
    if (w.fieldT > 0) continue;
    w.fieldT = W.pulse / Math.max(0.5, stats.fire || 1);
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const p = aimPtT(e), dx = p.x - s.position.x, dy = p.y - s.position.y, dz = p.z - s.position.z;
      const rr = R + e.r;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      DMG_SRC = w; damage(e, W.dmg(w.lvl) * (stats.dmg || 1) * (isHeld(w) ? 1 : FIXED_DMG), false); DMG_SRC = null; hit = true;
      spark(p, 0x9feaff);
      const hd = Math.hypot(dx, dz) || 1; knock(e, new THREE.Vector3(dx / hd, 0, dz / hd), 2.5, 0);
    }
    w.fieldPing = Math.max(w.fieldPing, hit ? 1 : 0.45);
    if (hit) sfx('zap', 0.12);
  }
}
/* Weapons that keep objects in the world (orbiting blades, turrets) can register them here. */
function rebuildWeaponProps() {
  player.props.forEach(p => scene.remove(p)); player.props = [];
  for (const w of mountedWeapons()) {
    const W = WEAPONS[w.type];
    if (W.props) player.props.push(...W.props({ w }).map(o => { scene.add(o); return o; }));
  }
}
let CUR_KICK = 0, CUR_WTYPE_POD = false;          // how heavy the gun firing right now is: bigger, brighter, longer rounds
function bullet(o, tgt, speed, dmg, opt = {}) {
  const ps = (stats && stats.projSpeed) || 1;      // Muzzle Velocity: travelling shots fly faster, but live shorter so their distance stays the same
  speed *= ps; if (opt.life) opt = { ...opt, life: opt.life / ps };
  const dir = tgt.clone().sub(o).normalize();
  if (opt.spread) { dir.x += rand(-opt.spread, opt.spread); dir.y += rand(-opt.spread, opt.spread); dir.z += rand(-opt.spread, opt.spread); dir.normalize(); }
  const rocket = opt.kind === 'rocket';
  const m = rocket ? bx(0.25, 0.25, 0.6, COL.red, 0, 0, 0, 0x701020) : new THREE.Mesh(geoBullet, B(0xffd9a8));
  m.position.copy(o); scene.add(m);
  const s = { mesh: m, pos: o.clone(), last: o.clone(), vel: dir.multiplyScalar(speed), life: (opt.life || 1.4) * CUR_RANGE, r: rocket ? 0.45 : 0.25, dmg,
    pierce: opt.pierce || 0, hit: new Set(), explode: (opt.explode || 0) * CUR_RANGE, src: DMG_SRC, arm: CUR_ARM, vol: CUR_VOL, target: opt.target, rocket, speed, manual: opt.manual, knock: opt.knock ?? 1.5,
    selfHurt: !!opt.selfHurt, attrs: CUR_ATTRS };
  // homing rockets loft up first, then dive onto their target
  if (rocket && opt.target && !opt.noArc) { s.vel.y += speed * 0.55; s.climb = 0.16; }
  s.child = !!opt.child; s.wk = CUR_WTYPE; s.o0 = o.clone();
  if (rocket && !CUR_WTYPE_POD) { const fl = new THREE.Mesh(geoBox, B(0xffa83a)); fl.scale.set(0.8, 0.8, 0.9); fl.position.z = -0.85; m.add(fl); s.flameMesh = fl; }
  if (opt.tracer) { tracer(o.clone(), o.clone().addScaledVector(s.vel.clone().normalize(), Math.min(140, speed * s.life))); m.scale.set(0.6, 0.6, 3); m.lookAt(o.clone().add(s.vel)); }
  else if (!rocket) {
    // a streak, not a dot: heavier guns fire fatter, longer, hotter rounds
    const wt = s.wt = clamp(0.5 + (CUR_KICK || 0.6) * 0.45, 0.5, 2.2);
    m.material = B(wt > 1.3 ? 0xfff4dc : 0xffdca0); m.scale.set(0.45 + 0.35 * wt, 0.45 + 0.35 * wt, 2.2 + 2.6 * wt); s.streak = true;
    wfxStyleBullet(s, m, wt); m.lookAt(o.clone().add(s.vel));
  }
  const A = CUR_ATTRS;
  if (A.size) {
    const col = ATTRS[[...A.keys()][0]].color, T = k => A.get(k) || 0;
    m.material = B(new THREE.Color(col).getHex()); if (!rocket) m.scale.setScalar(1.3);
    if (A.has('bounce')) { s.grav = 22; s.bounces = 2 + T('bounce'); s.life = Math.max(s.life, 2 + 0.4 * T('bounce')); s.vel.y += 3; }
    if (A.has('homing')) { s.target = opt.target || aim.enemy; s.homing = true; s.homeRate = 2.5 + 1.2 * T('homing'); s.life = Math.max(s.life, 2 + 0.4 * T('homing')); s.vel.multiplyScalar(0.7); s.speed = speed * 0.7; if (!opt.child) { s.vel.y += s.speed * 0.75; s.climb = 0.14; } }
    if (A.has('orbit')) { s.orbit = { a: Math.atan2(dir.z, dir.x), r: (2.2 + 0.4 * T('orbit') + Math.random() * 0.8) * CUR_RANGE, y: rand(0.8, 1.8) }; s.r *= Math.sqrt(CUR_RANGE); s.life = 2.4 + 0.8 * T('orbit'); s.pierce = 99; s.hitCd = new Map(); }
    if (A.has('explode') && !s.explode) s.miniBoom = (1.3 + 0.5 * T('explode')) * CUR_RANGE;
    applyComboToShot(s, A.combo);
  }
  shots.push(s);
}
/* Flamethrower: a lick of fire that swells, slows and fades; passes through enemies and sets them burning */
function flame(o, tp, dmg, reach, manual) {
  const dir = tp.clone().sub(o).normalize();
  dir.x += rand(-0.09, 0.09); dir.y += rand(-0.06, 0.06); dir.z += rand(-0.09, 0.09); dir.normalize();
  const m = new THREE.Mesh(geoBox, FLAME_MATS[Math.random() < 0.5 ? 0 : 1]);
  m.position.copy(o); m.scale.setScalar(0.2); m.rotation.set(rand(0, 3), rand(0, 3), 0); scene.add(m);
  const speed = reach / 0.45 * rand(0.85, 1.1);
  shots.push({ mesh: m, pos: o.clone(), last: o.clone(), vel: dir.multiplyScalar(speed).add(player.vel.clone().multiplyScalar(0.6)), life: 0.45, max: 0.45, r: 0.5, dmg, pierce: 999, hit: new Set(), manual, knock: 0, flame: true, attrs: new Map(), src: DMG_SRC });
}
/* Sniper tracer: a bright line that hangs in the air for a moment */
function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
  addFx(l, 0.5, f => { const k = f.life / f.max; f.obj.material.opacity = k * k; });
  // a thin smoke trail left hanging along the shot
  const L = a.distanceTo(b), n = Math.min(14, Math.floor(L / 5));
  for (let i = 1; i <= n; i++) puff(a.clone().lerp(b, i / (n + 1)), 0.14, 0.9, new THREE.Vector3(rand(-0.2, 0.2), rand(0.1, 0.4), rand(-0.2, 0.2)));
}
function lob(o, tp, dmg, radius) {
  const T = clamp(o.distanceTo(tp) / 18, 0.8, 1.6), g = 30;
  const v = new THREE.Vector3((tp.x - o.x) / T, (tp.y - o.y + 0.5 * g * T * T) / T, (tp.z - o.z) / T);
  const m = new THREE.Mesh(geoShell, B(0xd8cfb4)); m.position.copy(o); scene.add(m);
  shots.push({ mesh: m, pos: o.clone(), last: o.clone(), vel: v, life: 4, r: 0.5, dmg, explode: radius, grav: g, mortar: true, hit: new Set(), pierce: 0, src: DMG_SRC });
}
function explode(p, radius, dmg, manual, selfHurt) {
  blast(p, radius, ORANGE);
  { const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z); if (d < radius * 4 + 6) camKick(new THREE.Vector3(player.pos.x - p.x, 0.3, player.pos.z - p.z), 0.22 * (1 - d / (radius * 4 + 6)) * Math.min(1.5, radius / 3)); }
  physBlast(p, radius * 1.8 + 2, 1.2 + radius * 0.5);
  propsBlast(p, radius * 2 + 2, 1.5 + radius * 0.6);
  if (selfHurt && S.mode === 'play') {
    // your own rockets: inside the blast you take a share of it, and get shoved
    const pc = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), d = pc.distanceTo(p);
    if (d < radius + 0.6) {
      const k = 1 - d / (radius + 0.6);
      player.iframes = 0; hurt(dmg * 0.22 * (0.35 + 0.65 * k), p);
      const push = pc.sub(p); if (push.lengthSq() > 1e-4) push.normalize();
      const mm = Math.max(1, stats.mass || 3.3) / 3.3;
      player.vel.addScaledVector(push, 12 * k / mm); player.vel.y += 8 * k / mm; player.onGround = false;
    }
  }
  const pd = Math.hypot(player.pos.x - p.x, player.pos.y + 1.2 - p.y, player.pos.z - p.z);
  cam.shake = Math.max(cam.shake, clamp(1 - pd / (radius * 3 + 12), 0, 1) * Math.min(1, 0.25 + radius * 0.1));
  let any = false;
  const er = radius * 1.4, nearE = egNear(p.x, p.z, er, []);     // enemies feel a bigger blast than you do (own list: blasts can set off blasts)
  for (let ni = 0; ni < nearE.length; ni++) {
    const e = nearE[ni];
    if (e.dead) continue;
    const c0 = ecenter(e), ddx = c0.x - p.x, ddy = c0.y - p.y, ddz = c0.z - p.z, dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    if (dd >= er + e.r) continue;
    const c = c0.clone();
    damage(e, dmg); any = true;
    // survivors get thrown
    const dir = dd > 1e-3 ? c.sub(p).divideScalar(dd) : new THREE.Vector3(0, 1, 0);
    const k = 1 - dd / (er + e.r);
    knock(e, dir, 6 + 18 * k, 6 + 10 * k); e.sqV = (e.sqV || 0) + 1.2 * k;
  }
  for (const t of targets) if (!t.dead && t.pos.distanceTo(p) < radius + 0.6) hitTarget(t, dmg);
  if (any && manual) hitMarker();
}
// closest approach of segment a->b to point c, squared
function segDist2(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0; t = clamp(t, 0, 1);
  const x = a.x + abx * t - c.x, y = a.y + aby * t - c.y, z = a.z + abz * t - c.z;
  return x * x + y * y + z * z;
}
function updateShots(dt) { updateShots_(dt); DMG_SRC = null; }
const _shotNear = [];
function updateShots_(dt) {
  for (const s of shots) {
    DMG_SRC = s.src || null;
    s.life -= dt;
    if (s.well) { s.last.copy(s.pos); wellTick(s, dt); continue; }
    s.last.copy(s.pos);
    if (s.grav) s.vel.y -= s.grav * dt;
    // homing shots and missiles burst into several smaller ones at the top of their arc (damage shared out)
    s.age = (s.age || 0) + dt;
    if ((s.homing || s.pod) && !s.child && s.target && ((s.prevVy > 0 && s.vel.y <= 0) || (s.combo === 'homing+split' && s.age > 0.12))) { homingSplit(s); continue; }
    if (s.combo && comboShotTick(s, dt)) continue;
    s.prevVy = s.vel.y;
    if (s.climb > 0) s.climb -= dt;
    else if (s.pod && (!s.target || s.target.dead)) s.target = nearestEnemy(s.pos, 30);
    else if (s.homing && !s.orbit && (!s.target || s.target.dead)) s.target = nearestEnemy(s.pos, 20, s.hit);    // homing shots find something to chase
    if (!(s.climb > 0) && (s.rocket || s.homing) && s.target && !s.target.dead) s.vel.lerp(aimPt(s.target).sub(s.pos).normalize().multiplyScalar(s.speed), Math.min(1, dt * (s.homing ? s.homeRate || 6 : 3)));
    if (s.orbit) {
      // circles the frame, then flies off
      s.orbit.a += dt * 4.5;
      const c = player.pos;
      s.pos.set(c.x + Math.cos(s.orbit.a) * s.orbit.r, c.y + s.orbit.y, c.z + Math.sin(s.orbit.a) * s.orbit.r);
      s.hit.clear(); for (const [e, t] of s.hitCd) if (performance.now() - t < 350) s.hit.add(e);
      if (s.blade) { s.mesh.rotation.y += dt * 22; s.orbit.a += dt * 1.5; }                   // blades spin as they circle
    } else s.pos.addScaledVector(s.vel, dt);
    if (s.flame) {
      const k = 1 - s.life / s.max;
      s.vel.multiplyScalar(Math.max(0, 1 - 2.2 * dt)); s.vel.y += 6 * dt;          // slows and rises like real fire
      s.mesh.scale.setScalar(0.25 + k * 1.6); s.mesh.rotation.x += dt * 6;
      wfxFlameTick(s, k);
      s.r = 0.35 + k * 0.9;
    }
    s.mesh.position.copy(s.pos);
    if (s.rocket || s.mortar || s.streak) s.mesh.lookAt(s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z);
    if (!wfxShotTick(s, dt) && s.mortar) { s.trailT = (s.trailT || 0) - dt; if (s.trailT <= 0) { s.trailT = 0.05; puff(s.pos.clone(), rand(0.25, 0.4)); } }   // smoke trails
    if (s.flame && s.pos.y < groundAt(s.pos.x, s.pos.z)) { s.pos.y = groundAt(s.pos.x, s.pos.z); s.vel.y = Math.abs(s.vel.y) * 0.2; wfxFlameGround(s); }   // fire licks along the ground
    if (!s.flame && !s.orbit && s.pos.y < groundAt(s.pos.x, s.pos.z) && (!s.mortar || s.vel.y < 0)) {
      if (s.bounces > 0 && s.last.y >= groundAt(s.last.x, s.last.z)) {
        s.bounces--;
        const wallX = groundAt(s.pos.x, s.last.z) > s.last.y, wallZ = groundAt(s.last.x, s.pos.z) > s.last.y;
        s.pos.copy(s.last);
        if (wallX || wallZ) { if (wallX) s.vel.x *= -0.9; if (wallZ) s.vel.z *= -0.9; s.vel.y = Math.max(s.vel.y, 2); }   // ricochet off the wall
        else { s.vel.y = Math.abs(s.vel.y) * 0.65 + 2; s.vel.x *= 0.85; s.vel.z *= 0.85; }
        spark(s.pos, COL.bone);
        if (s.combo) comboBounce(s);
        continue;
      }
      if (s.explode) { if (s.rocket && !s.pod) wfxRocketBoom(s.pos, s.explode); explode(s.pos, s.explode, s.dmg, s.manual, s.selfHurt); blastAttrs(s); } else if (s.miniBoom) { explode(s.pos, s.miniBoom, s.dmg * 0.6, s.manual); comboBoom(s, s.pos, s.miniBoom); }
      else { spark(s.pos, s.hostile ? COL.red : COL.bone); if (s.wk) wfxHitGround(s); if ((s.wt || 0) > 1.1) { for (let i = 0; i < 3; i++) spark(s.pos, 0xffe6a0); dust(s.pos, 2); } }   // heavy rounds kick up a bigger ricochet
      s.life = 0; continue;
    }
    if (s.hostile) {
      const c = new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z);
      if (segDist2(s.last, s.pos, c) < 1.4) { hurt(s.dmg, s.pos.clone().addScaledVector(s.vel, -0.2)); s.life = 0; }
      continue;
    }
    if (hitTargets(s)) continue;
    if (props.length && propsHitShot(s)) { if (s.pierce > 0) s.pierce--; else { s.life = 0; continue; } }
    const reach = Math.hypot(s.pos.x - s.last.x, s.pos.y - s.last.y, s.pos.z - s.last.z);
    const near = egBox(Math.min(s.pos.x, s.last.x) - s.r, Math.max(s.pos.x, s.last.x) + s.r, Math.min(s.pos.z, s.last.z) - s.r, Math.max(s.pos.z, s.last.z) + s.r, _shotNear);
    for (let ni = 0; ni < near.length; ni++) {
      const e = near[ni];
      if (e.dead || s.hit.has(e)) continue;
      const rr = s.r + e.r + (e.boss ? 1.6 : 0), lim = rr + reach;
      if (Math.abs(e.pos.x - s.pos.x) > lim && Math.abs(e.pos.x - s.last.x) > lim) continue;        // cheap reject: far from the shot's path (x/z only; the aim point shares the enemy's x/z)
      if (Math.abs(e.pos.z - s.pos.z) > lim && Math.abs(e.pos.z - s.last.z) > lim) continue;
      if (segDist2(s.last, s.pos, aimPtT(e)) < rr * rr) {
        if (s.explode) { if (s.rocket && !s.pod) wfxRocketBoom(s.pos, s.explode); const k0 = S.kills, pl = s.attrs && s.attrs.combo === 'explode+poison' ? poisonedNear(s.pos, s.explode) : null; explode(s.pos, s.explode, s.dmg, s.manual, s.selfHurt); blastAttrs(s); if (s.attrs && s.attrs.combo) comboBoomGem(s, s.pos, s.explode, k0, pl); s.life = 0; break; }
        const wasAlive = !e.dead;
        damage(e, s.dmg, s.manual); s.hit.add(e);
        if (!s.flame) flinch(e, s.vel, 0.12 + (s.wt || 1) * 0.12);
        if (s.wk) wfxHitEnemy(s, e, wasAlive);
        if (s.flame) { ignite(e, s.dmg * 2.2); continue; } else spark(s.pos, e.color ? e.color.getHex() : ORANGE);
        // heavy rounds (shotgun pellets, sniper) also pop the enemy up off the ground
        if (s.knock) { const heavy = s.knock >= 2; knock(e, s.vel.clone().normalize(), s.knock, heavy ? s.knock * (s.knock >= 4 ? 1.3 : 0.35) : s.knock * 0.25); if (heavy) { e.onGround = false; e.sqV = (e.sqV || 0) + 0.8; } }
        if (s.orbit) s.hitCd.set(e, performance.now());
        if (s.attrs.size) shotAttrHit(s, e);
        if (s.pierce > 0) s.pierce--; else { s.life = 0; break; }
      }
    }
  }
  shots = shots.filter(s => { if (s.life <= 0) { scene.remove(s.mesh); return false; } return true; });
  enemies = enemies.filter(e => !e.dead);
}

/* ---------- sky loot: clusters of floating scrap along the drop ---------- */
const DROP_HEIGHT = 300;
/* a ring of bolts hanging flat in the sky, with a faint gold hoop through them */
const SKY_RINGS = [];
const RING_R = 10;
function skyRing(c, bonus) {
  const coins = [], n = 12;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.14, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  hoop.rotation.x = Math.PI / 2; hoop.position.copy(c); scene.add(hoop);
  const core = new THREE.Mesh(new THREE.CircleGeometry(RING_R * 0.45, 32), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  core.rotation.x = -Math.PI / 2; core.position.copy(c); scene.add(core);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, p = new THREE.Vector3(c.x + Math.cos(a) * RING_R, c.y, c.z + Math.sin(a) * RING_R);
    const val = i % 4 === 0 ? (bonus ? 5 : 3) : 1;
    dropBolt(p, val); const g = gems[gems.length - 1]; g.sky = true; g.ringCoin = true; g.pos.copy(p); g.vel.set(0, 0, 0);
    g.mesh.scale.multiplyScalar(val >= 5 ? 3 : val > 1 ? 2.4 : 1.9);
    if (val >= 5) g.mesh.material = M(0x3a8cff, 0x0a2a8a);
    coins.push(g);
  }
  SKY_RINGS.push({ c: c.clone(), hoop, core, coins, done: false });
}
/* falling through a ring's middle collects every bolt on it; missing it lets the hoop fade */
function skyRingTick(prevY, dt) {
  const P = player;
  for (const R of SKY_RINGS) {
    if (R.done) continue;
    R.hoop.rotation.z += dt * 0.6;
    if (prevY >= R.c.y && P.pos.y + 1.3 < R.c.y) {
      R.done = true;
      const d = Math.hypot(P.pos.x - R.c.x, P.pos.z - R.c.z);
      if (d < RING_R * 0.62) {
        let got = 0;
        for (const g of R.coins) if (!g.done && gems.includes(g)) { g.pull = true; g.ringPull = true; got++; }
        sfx('jackpot', 0.5); sfx('coin', 0.7); ring(R.c, RING_R * 1.4, 0.5, 0xffd25a);
        banner('RING', `+${got}`, '#ffd25a', 1.2);
        R.hoop.material.opacity = 1; R.hoop.scale.setScalar(1);
        addFx(R.hoop, 0.5, f => { f.obj.scale.multiplyScalar(1 + dt * 1.5); f.obj.material.opacity *= 0.88; });
      } else addFx(R.hoop, 0.6, f => { f.obj.material.opacity *= 0.9; });
      scene.remove(R.core);
    }
  }
}
function clearSkyRings() { for (const R of SKY_RINGS) { scene.remove(R.hoop); scene.remove(R.core); } SKY_RINGS.length = 0; S.skyRingY = undefined; }
function placeSkyLoot(start, bonus) {
  S.skyRingY = undefined;
  // bolts scattered at random through the whole fall, spread far wider than you can steer: pick your line
  const place = (p, val) => {
    dropBolt(p, val); const g = gems[gems.length - 1]; g.sky = true; g.pos.copy(p); g.vel.set(0, 0, 0);
    g.mesh.scale.multiplyScalar(val >= 10 ? 3.6 : val >= 5 ? 3 : val > 1 ? 2.4 : 1.8);
    if (val >= 10) g.mesh.material = M(0xff2a2a, 0x8a0808); else if (val >= 5) g.mesh.material = M(0x3a8cff, 0x0a2a8a);   // 10s glow red, 5s blue
  };
  const roll = () => { const r = Math.random(); return r < (bonus ? 0.05 : 0.025) ? 10 : r < (bonus ? 0.13 : 0.075) ? 5 : r < (bonus ? 0.28 : 0.135) ? 3 : 1; };
  const spread = bonus ? 34 : 28, step = bonus ? 5 : 7;
  let cx = start.x, cz = start.z;
  for (let y = DROP_HEIGHT - 25; y > 35; y -= rand(step * 0.6, step * 1.4)) {
    cx = clamp(cx + rand(-6, 6), -HALF + 10, HALF - 10); cz = clamp(cz + rand(-6, 6), -HALF + 10, HALF - 10);   // the cloud drifts as you fall
    const n = 1 + (Math.random() < 0.45 ? 1 : 0) + (bonus && Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
      place(new THREE.Vector3(clamp(cx + Math.cos(a) * r, -HALF + 6, HALF - 6), y + rand(-2, 2), clamp(cz + Math.sin(a) * r, -HALF + 6, HALF - 6)), roll());
    }
    // coin rings: fly through the middle and you scoop up the whole ring
    if (y < DROP_HEIGHT - 40 && y > 60 && (S.skyRingY === undefined || S.skyRingY - y > (bonus ? 26 : 38))) {
      S.skyRingY = y;
      const a = Math.random() * Math.PI * 2, r = spread * 0.6 * Math.random();
      skyRing(new THREE.Vector3(clamp(cx + Math.cos(a) * r, -HALF + 16, HALF - 16), y, clamp(cz + Math.sin(a) * r, -HALF + 16, HALF - 16)), bonus);
    }
    // now and then a short line of bolts to chase
    if (Math.random() < 0.12) { const a = Math.random() * Math.PI * 2, r = spread * Math.random(), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; for (let i = 0; i < 4; i++) place(new THREE.Vector3(clamp(x + i * 1.2, -HALF + 6, HALF - 6), y - i * 1.6, z), 1); }
  }
}
/* Red launch pad: one use. Rockets you straight up, then you fall the whole way again through fresh bolts. */
function superLaunch() {
  const P = player;
  P.superUp = true; P.vel.y = 90; P.onGround = false;
  // the camera stays put and watches the frame rocket up and out of shot (it doesn't follow)
  camera.updateMatrixWorld(); cam.launchHold = { pos: camera.position.clone(), look: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(20)), t: 0 };
  ring(P.pos, 4, 0.5, 0xff3a3a); dust(P.pos, 10); cam.shake = Math.max(cam.shake, 0.6); sfx('launch'); sfx('rocket', 0.6);
  banner('LAUNCH!', 'Grab the bolts', '#ff5a5a', 2.2);
}
function bonusDrop() {
  const P = player;
  P.superUp = false;
  gems.filter(g => g.sky).forEach(g => { g.done = true; scene.remove(g.mesh); }); gems = gems.filter(g => !g.done);
  P.pos.y = DROP_HEIGHT; P.prev.copy(P.pos); P.vel.set(0, -18, 0); P.onGround = false;
  placeSkyLoot(P.pos, true);
  physDestroyRobot();
  S.megaLand = true;
  cam.launchHold = null;
  const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');     // a white cut into the fall
  sfx('whistle', 0.6);
  S.mode = 'drop'; startDropRag(); cam.pitch = 1.2; cam.dist = 30; cam.shake = 0.5;
}
/* ---------- scrap ---------- */
const BASE_PULL = 4;    // bolts, loot and other pickups come to you only from this close; the Magnet module pulls XP only
const SKY_PICK = 7;    // pickup reach while falling (shown as a glowing ring around you)
let pickRing = null;
/* a tiny gold mote drawn from a bolt into the frame */
function suckMote(from, to) {
  const m = new THREE.Mesh(geoBox, B(0xffe6a0)); m.scale.setScalar(rand(0.05, 0.1)); m.position.copy(from).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)));
  const start = m.position.clone(), ctl = start.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)));
  addFx(m, rand(0.25, 0.4), f => { const k = 1 - f.life / f.max, a = start.clone().lerp(ctl, k), b2 = ctl.clone().lerp(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), k); f.obj.position.copy(a.lerp(b2, k)); });
}
function updatePickRing(on, dt) {
  if (!pickRing) {
    pickRing = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0xe8c35a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; pickRing.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xe8c35a, transparent: true, opacity: 0.025, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    disc.rotation.x = -Math.PI / 2; pickRing.add(disc);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshBasicMaterial({ color: 0xe8c35a, wireframe: true, transparent: true, opacity: 0.015, depthWrite: false, blending: THREE.AdditiveBlending }));
    pickRing.add(shell); pickRing.userData.ring = ring;
    scene.add(pickRing);
  }
  pickRing.visible = on;
  if (!on) return;
  if (!pickRing.parent) scene.add(pickRing);
  pickRing.position.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
  pickRing.scale.setScalar(SKY_PICK);
  pickRing.rotation.y += dt * 0.8;
  pickRing.userData.ring.material.opacity = 0.16 + 0.06 * Math.sin(performance.now() / 260);
}
const _gv = new THREE.Vector3(), _gc = new THREE.Vector3();
function updateGems(dt) {
  const c = _gc.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
  for (const g of gems) {
    const d = g.pos.distanceTo(c);
    if (g.float) {
      // magnet: rise and hang, then glide in from above
      const F = g.float; F.t += dt;
      if (F.t < F.delay) { g.pos.y += (F.y0 + F.lift - g.pos.y) * Math.min(1, dt * 2.2); g.pos.x += Math.sin(F.t * 3 + F.ph) * dt * 0.3; g.mesh.position.copy(g.pos); g.mesh.rotation.y += dt * 2; continue; }
      const v = _gv.copy(c); v.y += Math.max(0, 6 - (F.t - F.delay) * 5); v.sub(g.pos); const L = v.length();
      const sp = Math.min(30, 6 + (F.t - F.delay) * 14);
      g.pos.addScaledVector(v.divideScalar(L || 1), Math.min(L, sp * dt));
      if (d < 1.4) { g.float = null; g.pull = true; }
      g.mesh.position.copy(g.pos); g.mesh.rotation.y += dt * 4; continue;
    }
    if (g.kind !== 'loot' && g.kind !== 'case' && g.kind !== 'upgrade' && d < (g.sky ? SKY_PICK : g.kind === 'xp' ? stats.magnet : BASE_PULL)) g.pull = true;
    if (g.pull && g.sky) {
      // falling: the bolt eases in (faster the closer it gets), shrinking, with a thin stream of motes ahead of it
      g.pullT = (g.pullT || 0) + dt;
      const sp = (g.ringPull ? 26 : 14) + g.pullT * 40 + Math.max(0, 10 - d) * 3;
      g.pos.addScaledVector(_gv.copy(c).sub(g.pos).normalize(), Math.min(d, sp * dt));
      if (!g.s0) g.s0 = g.mesh.scale.x;
      g.mesh.scale.setScalar(g.s0 * clamp(d / 4, 0.35, 1));
      if (Math.random() < dt * 22) suckMote(g.pos, c);
    } else if (g.pull) g.pos.addScaledVector(_gv.copy(c).sub(g.pos).normalize(), Math.min(d, Math.max(g.vac ? 30 + d * 0.8 : 16, 34 - d) * dt));
    else if (g.sky) g.pos.y += Math.sin(performance.now() / 300 + g.pos.x) * 0.01;
    else {
      g.vel.y -= 30 * dt; g.pos.addScaledVector(g.vel, dt);
      const gr = groundAt(g.pos.x, g.pos.z) + (g.kind === 'loot' || g.kind === 'case' || g.kind === 'upgrade' ? 0.9 : 0.4);
      if (g.pos.y < gr) { g.pos.y = gr; g.vel.set(0, 0, 0); }
    }
    g.mesh.position.copy(g.pos);
    if (g.kind === 'loot' || g.kind === 'case' || g.kind === 'upgrade') { g.spin.rotation.y += dt * 1.6; g.spin.position.y = Math.sin(performance.now() / 400) * 0.12; }
    else g.mesh.rotation.y += dt * 3;
    if (g.kind === 'loot' && d < 2.2 && storeFull() && !allItems().some(o => o.autoUp && canCombine(o, g.item))) {
      // no free storage slot: leave it lying there
      if (!g.warnT || performance.now() - g.warnT > 4000) { g.warnT = performance.now(); banner('STORAGE FULL', '', 'var(--hostile)', 1.6); sfx('deny', 0.5); }
      g.mesh.position.copy(g.pos); continue;
    }
    if (d < (g.kind === 'loot' || g.kind === 'case' || g.kind === 'upgrade' ? 2.2 : 1.4)) {
      g.done = true;
      if (g.kind === 'xp') { gainXp(g.val); sfx('xp', 0.25); }
      else if (g.kind === 'bolt') { S.bolts += g.val; if (S.st) S.st.bolts += g.val; sfx('coin', 0.5); }
      else if (g.kind === 'vacuum' || g.kind === 'nuke' || g.kind === 'frenzy' || g.kind === 'berserk') usePower(g.kind);
      else if (g.kind === 'health') { discover('power:health', POWER_NAMES.health); if (S.st) S.st.heals++; player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * g.val); sfx('levelup', 0.5); ring(player.pos, 2.5, 0.4, 0x4fd06b); }
      else if (g.kind === 'case') { discover('power:case', POWER_NAMES.case); openWeaponCase(); }
      else if (g.kind === 'upgrade') claimUpgrade(g.offer);
      else pickUpLoot(g.item);
    }
  }
  GEM_N.xp = GEM_N.bolt = 0;
  gems = gems.filter(g => { if (g.done) { scene.remove(g.mesh); return false; } if (g.kind === 'xp') GEM_N.xp++; else if (g.kind === 'bolt') GEM_N.bolt++; return true; });
}
function pickUpLoot(it) {
  const stored = receiveItem(it);
  sfx('loot');
  banner(`${itemName(it).toUpperCase()}`, `${it.kind === 'orb' ? 'In storage' : 'Lv ' + it.lvl}${stored ? '' : ' · storage full'}`, partColor(it), 2);
  renderLoadoutHUD();
}
function gainXp(v) {
  S.xp += v * stats.xpMult;
  while (S.xp >= S.need) { S.xp -= S.need; S.level++; S.need = xpNeed(S.level); S.pendingLv++; }
}

/* ---------- effects ---------- */
/* decoration budget: sparks, dust and lightning arcs are skipped once this many effects are alive (orbit + lightning put 20,000 on screen) */
const FX_MAX = 2500;
const fxRoom = () => fx.length < FX_MAX;
/* ---------- particle pools ----------
   Sparks, debris cubes, dust, smoke puffs and motes used to be one scene object + one closure each, gathered into an
   instanced batch again every frame. They're the bulk of every fight's effects, so they now live in flat arrays: a
   particle is a few numbers, a frame is one tight loop that writes straight into the instance buffers, and nothing is
   allocated or collected. Three pools, one draw call each: GLOW (unlit, blooms), LIT (shaded scrap) and ADD (additive).
   size curve `mode`: 0 shrinks with life, 1 pops in then holds (debris), 2 swells and fades (smoke), 3 shrinks to a tenth. */
class ParticlePool {
  constructor(mat, cap) {
    this.cap = cap; this.n = 0;
    const F = () => new Float32Array(cap);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.max = F(); this.size = F(); this.grav = F(); this.drag = F();
    this.rx = F(); this.ry = F(); this.wx = F(); this.wy = F(); this.cr = F(); this.cg = F(); this.cb = F();
    this.mode = new Uint8Array(cap);
    const im = this.im = new THREE.InstancedMesh(geoBox, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.count = 0; im.visible = false; im.frustumCulled = false; im.userData.noShadow = true;
    scene.add(im); im.castShadow = false; im.receiveShadow = false;
  }
  add(x, y, z, vx, vy, vz, life, size, hex, grav = 0, drag = 0, mode = 0, rx = 0, ry = 0, wx = 0, wy = 0, dim = 1) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.rx[i] = rx; this.ry[i] = ry; this.wx[i] = wx; this.wy[i] = wy; this.mode[i] = mode;
    this.cr[i] = ((hex >> 16) & 255) / 255 * dim; this.cg[i] = ((hex >> 8) & 255) / 255 * dim; this.cb[i] = (hex & 255) / 255 * dim;
  }
  clear() { this.n = 0; this.im.count = 0; this.im.visible = false; }
  tick(dt) {
    const im = this.im; let n = this.n;
    if (!n) { if (im.visible) { im.visible = false; im.count = 0; } return; }
    const { px, py, pz, vx, vy, vz, life, max, size, grav, drag, rx, ry, wx, wy, cr, cg, cb, mode } = this;
    const M = im.instanceMatrix.array, C = im.instanceColor.array;
    for (let i = 0; i < n; i++) {
      let l = life[i] - dt;
      if (l <= 0) {
        // dead: the last particle takes its place
        const j = --n;
        if (i !== j) {
          px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j]; vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
          life[i] = life[j]; max[i] = max[j]; size[i] = size[j]; grav[i] = grav[j]; drag[i] = drag[j];
          rx[i] = rx[j]; ry[i] = ry[j]; wx[i] = wx[j]; wy[i] = wy[j]; cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j]; mode[i] = mode[j];
        }
        i--; continue;
      }
      life[i] = l;
      if (grav[i]) vy[i] -= grav[i] * dt;
      if (drag[i]) { const k = 1 - drag[i] * dt; vx[i] *= k; vy[i] *= k; vz[i] *= k; }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      const m = mode[i], f = l / max[i];
      let s = size[i];
      if (m === 0) s *= f; else if (m === 1) s *= l * 3 < 1 ? l * 3 : 1;
      else if (m === 2) { const k = 1 - f, a = k * 1.6 + 0.15; s *= Math.sin((a < 1 ? a : 1) * Math.PI) * (0.6 + k * 0.6); }
      else s *= f > 0.1 ? f : 0.1;
      const o = i * 16;
      if (wx[i] || wy[i] || rx[i] || ry[i]) {
        const ax = (rx[i] += wx[i] * dt), ay = (ry[i] += wy[i] * dt), cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
        M[o] = cy * s; M[o + 1] = sx * sy * s; M[o + 2] = -cx * sy * s; M[o + 4] = 0; M[o + 5] = cx * s; M[o + 6] = sx * s; M[o + 8] = sy * s; M[o + 9] = -sx * cy * s; M[o + 10] = cx * cy * s;
      } else { M[o] = s; M[o + 1] = 0; M[o + 2] = 0; M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = s; }
      M[o + 3] = 0; M[o + 7] = 0; M[o + 11] = 0; M[o + 12] = px[i]; M[o + 13] = py[i]; M[o + 14] = pz[i]; M[o + 15] = 1;
      const c = i * 3; C[c] = cr[i]; C[c + 1] = cg[i]; C[c + 2] = cb[i];
    }
    this.n = n; im.count = n; im.visible = n > 0;
    if (n) {
      im.instanceMatrix.updateRange.offset = 0; im.instanceMatrix.updateRange.count = n * 16; im.instanceMatrix.needsUpdate = true;
      im.instanceColor.updateRange.offset = 0; im.instanceColor.updateRange.count = n * 3; im.instanceColor.needsUpdate = true;
    }
  }
}
const PFX = { glow: null, lit: null, add: null };
function pfxInit() {
  if (PFX.glow) return;
  PFX.glow = new ParticlePool(new THREE.MeshBasicMaterial({ color: 0xffffff }), 12000);
  PFX.lit = new ParticlePool(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.15 }), 8000);
  PFX.add = new ParticlePool(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 6000);
}
function pfxTick(dt) { if (!PFX.glow) return; PFX.glow.tick(dt); PFX.lit.tick(dt); PFX.add.tick(dt); }
function pfxClear() { if (!PFX.glow) return; PFX.glow.clear(); PFX.lit.clear(); PFX.add.clear(); }
const pfxCount = () => PFX.glow ? PFX.glow.n + PFX.lit.n + PFX.add.n : 0;
const hexOf = c => (typeof c === 'number' ? c : c && c.isColor ? c.getHex() : 0xffffff);
function addFx(obj, life, upd) { scene.add(obj); fx.push({ obj, life, max: life, upd, own: obj.material && !isSharedMat(obj.material) }); }
function spark(p, color) {
  pfxInit(); if (PFX.glow.n > 9000) return;
  PFX.glow.add(p.x, p.y, p.z, rand(-4, 4), rand(2, 6), rand(-4, 4), 0.25, 0.22, hexOf(color));
}
/* muzzle flash: a hot star of light at the barrel and a brief real light that lights up the frame and the ground */
const MUZZLE_LIGHT = new THREE.PointLight(0xffc27a, 0, 10, 2); scene.add(MUZZLE_LIGHT);
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.25, 'rgba(255,214,140,.9)'); r.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,240,200,.9)'; for (let i = 0; i < 4; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 4); g.fillRect(-30, -2, 60, 4); g.restore(); }
  return new THREE.CanvasTexture(c); })();
const flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function muzzleFlash(p, dir, size = 1) {
  const s = new THREE.Sprite(flashMat); s.position.copy(p); if (dir) s.position.addScaledVector(dir, 0.15 * size);
  const sc = (0.7 + Math.random() * 0.4) * (0.6 + 0.5 * size); s.scale.set(sc, sc, sc); s.material.rotation = Math.random() * 6;
  addFx(s, 0.05, f => { f.obj.scale.multiplyScalar(0.8); });
  MUZZLE_LIGHT.position.copy(p); MUZZLE_LIGHT.intensity = Math.max(MUZZLE_LIGHT.intensity, 1.6 + size * 1.4);
}
function muzzleLightTick(dt) { MUZZLE_LIGHT.intensity *= Math.exp(-dt * 38); if (MUZZLE_LIGHT.intensity < 0.02) MUZZLE_LIGHT.intensity = 0; }
function burst(p, color, n) {
  pfxInit(); const hex = hexOf(color);
  for (let i = 0; i < n; i++) PFX.lit.add(p.x, p.y, p.z, rand(-7, 7), rand(3, 10), rand(-7, 7), rand(0.5, 0.9), rand(0.2, 0.45), hex, 32, 0, 1, 0, 0, 8, 0);
}
function dust(p, n) {
  pfxInit(); if (PFX.lit.n > 6000) return;
  for (let i = 0; i < n; i++) PFX.lit.add(p.x + rand(-.5, .5), p.y + 0.1, p.z + rand(-.5, .5), rand(-3, 3), rand(1, 3), rand(-3, 3), rand(0.3, 0.5), rand(0.15, 0.3), 0x8a8270);
}
/* fading effects share a few stepped-opacity materials per colour, so lots of them still draw instanced */
const _fadeMats = new Map();
function fadeMat(color, op, side) {
  const step = Math.max(0, Math.min(7, Math.round(op * 8))), key = color + ':' + step + ':' + (side ? 1 : 0);
  let m = _fadeMats.get(key);
  if (!m) { m = shareMat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: step / 8, depthWrite: false, side: side ? THREE.DoubleSide : THREE.FrontSide })); _fadeMats.set(key, m); }
  return m;
}
function blast(p, radius, color) {
  const m = new THREE.Mesh(geoBlast, fadeMat(color, 0.6)); m.position.copy(p);
  addFx(m, 0.3, f => { const k = 1 - f.life / f.max; f.obj.scale.setScalar(radius * (0.3 + 0.7 * k)); f.obj.material = fadeMat(color, 0.6 * (1 - k)); });
}
function ring(p, radius, life, color) {
  const m = new THREE.Mesh(geoRing, fadeMat(color, 0.8, true));
  m.position.set(p.x, p.y + 0.2, p.z);
  addFx(m, life, f => { const k = 1 - f.life / f.max; f.obj.scale.setScalar(1 + radius * k); f.obj.material = fadeMat(color, 0.8 * (1 - k), true); });
}
/* Lightning bolt through a chain of points. power 0..3: thicker, more jagged, more forks, longer glow.
   Drawn with thin additive boxes (WebGL lines are always 1 px), a hot white core inside a cyan sheath. */
const ARC_MAT = { glow: null, core: null };
function arcMats() {
  if (!ARC_MAT.glow) {
    ARC_MAT.glow = shareMat(new THREE.MeshBasicMaterial({ color: 0x58cfd6, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    ARC_MAT.core = shareMat(new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
  return ARC_MAT;
}
const _au = new THREE.Vector3(0, 0, 1);
function arcSeg(a, b, w, mat, life) {
  if (!fxRoom()) return;
  const d = b.clone().sub(a), L = d.length(); if (L < 1e-3) return;
  const m = new THREE.Mesh(geoBox, mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_au, d.divideScalar(L)); m.scale.set(w, w, L);
  addFx(m, life, f => { const k = f.life / f.max; f.obj.scale.x = f.obj.scale.y = w * (0.3 + 0.7 * k); });
}
function arcPath(a, b, jag) {
  const n = Math.max(3, Math.round(a.distanceTo(b) / 0.7)), out = [a.clone()];
  for (let s = 1; s < n; s++) { const t = s / n, p = a.clone().lerp(b, t), j = jag * Math.sin(t * Math.PI); out.push(p.add(new THREE.Vector3(rand(-j, j), rand(-j, j), rand(-j, j)))); }
  out.push(b.clone()); return out;
}
function lightning(pts, power = 0.6) {
  const M_ = arcMats(), w = 0.04 + 0.035 * power, life = 0.12 + 0.06 * power, jag = 0.35 + 0.3 * power;
  for (let i = 0; i < pts.length - 1; i++) {
    const path = arcPath(pts[i], pts[i + 1], jag);
    for (let k = 0; k < path.length - 1; k++) { arcSeg(path[k], path[k + 1], w * 2.2, M_.glow, life); arcSeg(path[k], path[k + 1], w, M_.core, life * 0.7); }
    // forks: short side branches that crackle off the main bolt
    const forks = Math.round(power * 2.5 * Math.random() + power);
    for (let f = 0; f < forks; f++) {
      const from = path[1 + (Math.random() * (path.length - 2) | 0)], to = from.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(0.8 + power * 0.7));
      const fp = arcPath(from, to, jag * 0.6);
      for (let k = 0; k < fp.length - 1; k++) arcSeg(fp[k], fp[k + 1], w * 1.3, M_.glow, life * 0.8);
    }
  }
  // a burst of light and sparks at every point it touches
  for (let i = 1; i < pts.length; i++) {
    for (let s = 0; s < 1 + power * 2; s++) spark(pts[i], s % 2 ? 0xe8fdff : COL.cyan);
    if (power > 0.9) { const fl = new THREE.Mesh(geoBlast, M_.glow); fl.position.copy(pts[i]); addFx(fl, 0.1, f => fl.scale.setScalar((0.15 + power * 0.1) * (1.6 - f.life / f.max))); }
  }
  wfxArcEcho(pts, power);
}
/* the Arc Caster's muzzle: sparks spray out of the coils, more and bigger as it levels */
function arcMuzzle(o, dir, power) {
  const n = 3 + Math.round(power * 4);
  pfxInit();
  for (let i = 0; i < n; i++) {
    const k = rand(2, 6);
    PFX.add.add(o.x, o.y, o.z, dir.x * k + rand(-3, 3), dir.y * k + rand(-1, 4), dir.z * k + rand(-3, 3), rand(0.15, 0.35), 0.05 + 0.03 * power, 0xbff6ff, 14, 0, 0, 0, 0, 0, 0, 0.85);
  }
  const fl = new THREE.Mesh(geoBlast, arcMats().glow); fl.position.copy(o);
  addFx(fl, 0.08, f => fl.scale.setScalar((0.1 + 0.07 * power) * (1.4 - f.life / f.max)));
}
function shockwave(p, radius, dmg) {
  ring(p, radius, 0.4, ORANGE); cam.shake = 0.4;
  for (const e of enemies) if (!e.dead && e.pos.distanceTo(p) < radius) { damage(e, dmg); const dir = e.pos.clone().sub(p).setY(0).normalize(); knock(e, dir, 12, 10); }
}
/* debris and dust: the little cubes from every hit and kill are drawn instanced too (one draw call per colour, no shadows) */
const FX_BATCH = new Map();
/* also the xp shards and bolts lying around (they can number in the hundreds) */
function batchFx() {
  for (const b of FX_BATCH.values()) b.n = 0;
  const add = (o, own) => {
    if (!o || !o.isMesh || o.isInstancedMesh || own || o.children.length || o.parent !== scene || Array.isArray(o.material) || !isSharedMat(o.material)) return;      // (shared see-through materials batch too: a lightning storm was 400+ separate draw calls)
    // (the key is remembered on the object: building the string for every particle every frame was a steady stream of garbage)
    if (o._fxG !== o.geometry || o._fxM !== o.material) { o._fxG = o.geometry; o._fxM = o.material; o._fxKey = o.geometry.uuid + '|' + o.material.uuid; }
    const key = o._fxKey;
    let b = FX_BATCH.get(key);
    if (!b || b.n >= b.cap) {
      const cap = b ? b.cap * 2 : 256;
      const im = new THREE.InstancedMesh(o.geometry, o.material, cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
      scene.add(im); im.castShadow = false; im.receiveShadow = false;
      const nb = { im, cap, n: b ? b.n : 0 };
      if (b) { for (let i = 0; i < b.n; i++) { b.im.getMatrixAt(i, _em4); im.setMatrixAt(i, _em4); } scene.remove(b.im); }
      FX_BATCH.set(key, nb); b = nb;
    }
    o.visible = false; o.updateMatrix();
    b.im.setMatrixAt(b.n++, o.matrix);
  };
  for (const f of fx) add(f.obj, f.own);
  for (const s of shots) add(s.mesh, false);                  // bullets and flames in flight
  for (const g of gems) if (g.kind === 'xp' || g.kind === 'bolt') add(g.mesh, false);
  for (const b of FX_BATCH.values()) { b.im.count = b.n; b.im.visible = b.n > 0; if (b.n) b.im.instanceMatrix.needsUpdate = true; }
}
const _sharedMats = new WeakMap();
function isSharedMat(m) { let v = _sharedMats.get(m); if (v === undefined) { v = isShared(m) || WFX_SHARED.has(m); _sharedMats.set(m, v); } return v; }
function updateFx(dt) {
  muzzleLightTick(dt); pfxTick(dt);
  for (const f of fx) { f.life -= dt; f.upd(f, dt); }
  fx = fx.filter(f => {
    if (f.life > 0) return true;
    scene.remove(f.obj);
    if (f.obj.geometry && f.obj.geometry.type === 'BufferGeometry') f.obj.geometry.dispose();
    if (f.own && f.obj.material) f.obj.material.dispose();
    return false;
  });
}

/* ============================================================
   TARGETS: breakable crates on the ground and bullseye plates on cliff walls.
   They drop a little experience or a bolt, and sometimes a part.
   ============================================================ */
function makeCrate() {
  const g = new THREE.Group();
  g.add(bx(0.95, 0.95, 0.95, 0x6b5a43));
  for (const y of [-0.3, 0.3]) g.add(bx(1.0, 0.12, 1.0, ORANGE, 0, y, 0));
  g.add(bx(0.3, 0.3, 1.0, COL.dark, 0, 0, 0));
  return g;
}
function makePlate() {
  const g = new THREE.Group();
  g.add(bx(1.3, 1.3, 0.12, COL.dark, 0, 0, -0.06));
  [[0.6, 0xe4ddc8], [0.45, COL.red], [0.3, 0xe4ddc8], [0.15, COL.red]].forEach(([r, c], i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), M(c)); m.position.z = 0.01 + i * 0.005; g.add(m);
  });
  return g;
}
/* A broken crate bursts open: the lid flips up, the sides fall away, the bands spring off, with a flash and a puff.
   A bullseye plate cracks into quarters and its rings spin off like coins. */
function debris(obj, pos, vel, spin, life, floorPad = 0.05) {
  obj.position.copy(pos);
  addFx(obj, life, (f, dt) => {
    vel.y -= 22 * dt; f.obj.position.addScaledVector(vel, dt);
    f.obj.rotation.x += spin.x * dt; f.obj.rotation.y += spin.y * dt; f.obj.rotation.z += spin.z * dt;
    const g = groundAt(f.obj.position.x, f.obj.position.z) + floorPad;
    if (f.obj.position.y < g) { f.obj.position.y = g; if (vel.y < 0) vel.y *= -0.3; vel.x *= 0.6; vel.z *= 0.6; spin.multiplyScalar(0.5); }
    if (f.life < 0.4) f.obj.scale.multiplyScalar(Math.pow(0.02, dt / 0.4));
  });
}
function popFlash(p, color, size) {
  const m = new THREE.Mesh(geoBlast, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(p); m.scale.setScalar(0.2);
  addFx(m, 0.22, f => { const k = 1 - f.life / f.max; f.obj.scale.setScalar(0.2 + k * size); f.obj.material.opacity = 0.9 * (1 - k); });
}
function popTarget(t) {
  const p = t.pos.clone(), q = t.mesh.quaternion;
  const out = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q);
  if (t.kind === 'crate') {
    popFlash(p, 0xffd28a, 2.2); ring(p.clone().setY(p.y - 0.45), 2.2, 0.35, ORANGE); dust(p, 8);
    // lid: flips straight up, tumbling
    const lid = bx(0.98, 0.1, 0.98, 0x6b5a43);
    debris(lid, p.clone().add(out(0, 0.48, 0)), out(rand(-1, 1), 0, rand(-1, 1)).setY(9), new THREE.Vector3(rand(-9, 9), rand(-4, 4), rand(-9, 9)), 1.8);
    // four sides fall outward
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const side = bx(x ? 0.08 : 0.95, 0.9, z ? 0.08 : 0.95, 0x6b5a43);
      side.quaternion.copy(q);
      debris(side, p.clone().add(out(x * 0.46, 0, z * 0.46)), out(x * 3.5, 0, z * 3.5).setY(rand(3, 5)), out(z * 5, 0, -x * 5), 1.6);
    }
    // the orange bands spring off
    for (let i = 0; i < 2; i++) {
      const band = bx(1.0, 0.1, 1.0, ORANGE); band.quaternion.copy(q);
      debris(band, p.clone().add(out(0, i ? 0.3 : -0.3, 0)), new THREE.Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)), new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), 1.4);
    }
    // packing straw / splinters
    for (let i = 0; i < 10; i++) debris(bx(0.08, 0.08, rand(0.2, 0.4), i % 3 ? 0xc9a96a : 0x8a7350), p.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3))), new THREE.Vector3(rand(-5, 5), rand(4, 9), rand(-5, 5)), new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15)), rand(0.9, 1.4), 0.04);
  } else {
    popFlash(p, 0xffffff, 1.6); burst(p, 0xe4ddc8, 6);
    const n = out(0, 0, 1);   // the way the plate faces (out of the wall)
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const qt = bx(0.62, 0.62, 0.1, COL.dark); qt.quaternion.copy(q);
      debris(qt, p.clone().add(out(x * 0.32, y * 0.32, 0)), out(x * 2.5, y * 2 + 2, 0).addScaledVector(n, 3.5), out(rand(-6, 6), rand(-6, 6), x * 6), 1.6);
    }
    [[0.6, 0xe4ddc8], [0.45, COL.red], [0.3, 0xe4ddc8], [0.15, COL.red]].forEach(([r, c], i) => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 20), M(c)); disc.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      debris(disc, p.clone().addScaledVector(n, 0.05 + i * 0.03), n.clone().multiplyScalar(2 + i * 1.5).add(new THREE.Vector3(rand(-1.5, 1.5), 3 + i, rand(-1.5, 1.5))), new THREE.Vector3(rand(-4, 4), rand(8, 14), rand(-4, 4)), 1.7, 0.03);
    });
  }
}
function placeTargets() {
  targets.forEach(t => scene.remove(t.mesh)); targets = [];
  const centre = idxOf(player.pos.x, player.pos.z);
  // crates on open ground
  for (let n = 0, tries = 0; n < 9 && tries < 400; tries++) {
    const k = (Math.random() * NC) | 0;
    if (!inner(k) || padSet.has(k)) continue;
    const x = cellX(k) + rand(-0.8, 0.8), z = cellZ(k) + rand(-0.8, 0.8);
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 12) continue;
    const m = makeCrate(); m.position.set(x, H[k] + 0.48, z); m.rotation.y = Math.random() * Math.PI; scene.add(m);
    targets.push({ mesh: m, pos: m.position.clone(), hp: 24, r: 0.7, kind: 'crate' }); n++;
  }
  // bullseye plates bolted to cliff faces
  for (let n = 0, tries = 0; n < 9 && tries < 3000; tries++) {
    const k = (Math.random() * NC) | 0;
    if (!inner(k)) continue;
    const d = pick(NB4), w = k + d;
    if (!inner(w) || H[w] - H[k] < 3) continue;
    const dx = d === 1 ? 1 : d === -1 ? -1 : 0, dz = d === GRID ? 1 : d === -GRID ? -1 : 0;
    const y = H[k] + rand(1.2, Math.min(H[w] - H[k] - 0.7, 4));
    const m = makePlate();
    m.position.set(cellX(k) + dx * (CELL / 2 - 0.08), y, cellZ(k) + dz * (CELL / 2 - 0.08));
    m.lookAt(m.position.x - dx, y, m.position.z - dz);
    scene.add(m);
    targets.push({ mesh: m, pos: m.position.clone(), hp: 12, r: 0.65, kind: 'plate' }); n++;
  }
}
function hitTargets(s) {
  for (const t of targets) {
    if (t.dead) continue;
    if (segDist2(s.last, s.pos, t.pos) < (t.r + s.r) ** 2) {
      if (s.explode) { explode(s.pos, s.explode, s.dmg, s.manual); s.life = 0; return true; }
      hitTarget(t, s.dmg); spark(s.pos, ORANGE); if (s.manual) { hitMarker(); sfx('hit', 0.3); }
      s.life = 0; return true;
    }
  }
  return false;
}
function hitTarget(t, dmg) {
  t.hp -= dmg;
  t.mesh.rotation.z += rand(-0.15, 0.15);
  if (t.hp > 0) return;
  t.dead = true; scene.remove(t.mesh);
  popTarget(t); sfx('kill', 0.5); sfx('pop2', 0.6);
  const luck = stats.luck || 0;
  const drop = t.pos.clone().setY(t.pos.y - 0.4), g0 = gems.length;
  if (Math.random() < 0.03) dropHealth(drop);
  if (Math.random() < 0.08 + luck * 0.004) { dropLoot(t.pos.clone(), rollWorldLoot(luck)); sfx('loot'); }
  else if (Math.random() < 0.025 + luck * 0.001) { dropLoot(t.pos.clone(), mkGem()); sfx('loot'); }      // now and then a gem
  if (Math.random() < 0.28) dropBolt(drop, 1 + (Math.random() < 0.3 ? 1 : 0));
  // a good handful of experience every time
  for (let i = 0; i < 4 + (Math.random() * 4 | 0); i++) dropGem(drop, 1);
  for (let i = 0; i < 1 + (Math.random() * 2 | 0); i++) dropGem(drop, 3);
  if (Math.random() < 0.008) dropPower(drop, 'vacuum'); else if (Math.random() < 0.0012) dropPower(drop, 'nuke');
  // the experience, bolts and health it dropped stream straight to you (parts and power-ups wait to be picked up)
  for (let i = g0; i < gems.length; i++) if (['xp', 'bolt', 'health'].includes(gems[i].kind)) { gems[i].pull = true; gems[i].vac = true; }
  targets = targets.filter(x => !x.dead);
}

/* ---------- COIN FRENZY: bolts rain down around you, every kill drops one, coins burst off the XP bar.
   When it ends, half the bolts still lying around fizzle away: grab them while you can ---------- */
const BERSERK_T = 7, BERSERK_CROWD = 180, BERSERK_GAP = 75;     // seconds it lasts · enemies needed on the field · min seconds between drops
function berserkTick(dt) {
  if (!(S.berserkT > 0)) return;
  S.berserkT -= dt;
  const bar = $('#bzFill'); if (bar) bar.style.width = (Math.max(0, S.berserkT) / BERSERK_T * 100) + '%';
  if (S.berserkT <= 0) { S.berserkT = 0; $('#bzBar').hidden = true; document.body.classList.remove('berserk'); banner('BERSERK OVER', '', '#ff3a3a', 1.2); }
}
function frenzyTick(dt) {
  if (!(S.frenzyT > 0)) return;
  S.frenzyT -= dt;
  const P = player;
  if ((S.fzRain -= dt) <= 0) {
    S.fzRain = rand(0.18, 0.35);
    const a = Math.random() * Math.PI * 2, r = rand(3, 14), x = clamp(P.pos.x + Math.cos(a) * r, -HALF + 4, HALF - 4), z = clamp(P.pos.z + Math.sin(a) * r, -HALF + 4, HALF - 4);
    dropBolt({ x, y: groundAt(x, z) + rand(14, 22), z }, Math.random() < 0.12 ? 3 : 1);
    const g = gems[gems.length - 1]; g.vel.set(rand(-1, 1), rand(-8, -3), rand(-1, 1)); g.fzRain = true;
  }
  if ((S.fzPop -= dt) <= 0) { S.fzPop = 0.09; fzCoinPop(); }
  const fill = $('#fzFill'); if (fill) fill.style.transform = `scaleX(${clamp(S.frenzyT / (S.frenzyMax || 15), 0, 1)})`;
  if (S.frenzyT <= 0) {
    S.frenzyT = 0; $('#fzBar').hidden = true;
    // half the bolts left on the ground vanish
    const left = gems.filter(g => g.kind === 'bolt' && !g.sky && !g.pull && !g.done);
    left.sort(() => Math.random() - 0.5);
    const gone = left.slice(0, Math.floor(left.length / 2));
    for (const g of gone) { g.done = true; spark(g.pos.clone(), 0xffd23a); spark(g.pos.clone(), 0xffffff); }
    if (gone.length) { banner('FRENZY OVER', `−${gone.length} bolts`, '#ffd23a', 1.6); sfx('whoops', 0.5); }
    else banner('FRENZY OVER', '', '#ffd23a', 1.2);
  }
}
/* a little gold coin pops up off the XP bar and tumbles away */
function fzCoinPop() {
  const bar = $('#xpline'); if (!bar) return;
  const r = bar.getBoundingClientRect(), c = document.createElement('div'); c.className = 'fzcoin';
  const x = r.left + Math.random() * r.width; c.style.left = x + 'px'; c.style.top = (r.top - 6) + 'px';
  document.body.appendChild(c);
  const dx = rand(-60, 60), up = rand(50, 130);
  c.animate([{ transform: 'translate(-50%,0) scale(.4) rotateY(0deg)', opacity: 0 }, { transform: `translate(calc(-50% + ${dx * 0.5}px), ${-up}px) scale(1) rotateY(360deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(calc(-50% + ${dx}px), ${-up * 0.4}px) scale(.8) rotateY(720deg)`, opacity: 0 }], { duration: rand(700, 1100), easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => c.remove();
}

/* ---------- KILL STREAK MULTIPLIER: on the right of the screen. Kills within 2.2 s of each other build it;
   it grows, glows hotter, shakes and throws sparks as it climbs. When it runs out it pays circuits. ---------- */
const STREAK_WINDOW = 1.5;      // seconds between kills before the streak breaks (was 2.2)
const KM_TIERS = [[0, '#e6e9ea'], [15, '#ffe46a'], [40, '#ffa23a'], [90, '#ff5a3a'], [180, '#ff4ad2'], [350, '#8a7aff']];
/* streakKill() runs for every kill, and a big fight has several a step: it only counts now. The counter's DOM (text,
   colour, size, glow, the little "bump") is brought up to date once per drawn frame by streakUi(), and the bump is a
   Web Animation instead of the old remove-class / force-layout / add-class restart, which made the browser lay out the
   whole page for every single kill. */
const KM = { dirty: false, shown: 0, tier: -1, col: '', ks: '', kg: '', sh: '', bumpA: null, sparkT: 0, wantSpark: 0, fill: -1 };
function streakKill(e) {
  if (!S.inRun) return;
  S.streak = (S.streak || 0) + 1; S.streakT = STREAK_WINDOW;
  if (S.st) S.st.bestStreak = Math.max(S.st.bestStreak || 0, S.streak);
  KM.dirty = true;
  const n = S.streak;
  // crossing a tier: a burst of sparks and a chime (the little every-5 bursts are rationed in streakUi)
  if (n === 10 || n === 25 || n === 50 || n === 100 || n === 200 || (n > 200 && n % 100 === 0)) { KM.wantSpark = 2; sfx('sparks', 0.4); sfx('levelup', 0.35); }
  else if (n >= 5 && n % 5 === 0 && !KM.wantSpark) KM.wantSpark = 1;
}
function streakUi(dt) {
  KM.sparkT -= dt;
  const el = $('#killMul'); if (!el) return;
  if (S.streakT > 0) { const f = Math.round(clamp(S.streakT / STREAK_WINDOW, 0, 1) * 200) / 200; if (f !== KM.fill) { KM.fill = f; const b = $('#kmFill'); if (b) b.style.transform = `scaleX(${f})`; } }
  if (!KM.dirty) return; KM.dirty = false;
  const n = S.streak || 0; if (!n) return;
  if (n >= 2 && el.hidden) el.hidden = false;
  const num = $('#kmN'); num.textContent = n;
  let tier = 0; for (let i = 0; i < KM_TIERS.length; i++) if (n >= KM_TIERS[i][0]) tier = i;
  const col = KM_TIERS[tier][1];
  const ks = (1 + Math.min(1.3, Math.log2(1 + n) * 0.16)).toFixed(2), kg = Math.min(40, 4 + n * 0.35).toFixed(0) + 'px', sh = Math.min(6, n / 15).toFixed(1) + 'px';
  if (col !== KM.col) { KM.col = col; el.style.setProperty('--kc', col); }
  if (ks !== KM.ks) { KM.ks = ks; el.style.setProperty('--ks', ks); }
  if (kg !== KM.kg) { KM.kg = kg; el.style.setProperty('--kg', kg); }
  if (sh !== KM.sh) { KM.sh = sh; el.style.setProperty('--kshake', sh); }
  if (tier !== KM.tier) { KM.tier = tier; el.dataset.tier = tier; }
  if (KM.bumpA) KM.bumpA.cancel();
  KM.bumpA = num.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,1.8,.4,1)' });
  if (KM.wantSpark === 2 || (KM.wantSpark === 1 && KM.sparkT <= 0)) { sparkBurst(num, col, KM.wantSpark === 2 ? 18 + tier * 6 : 6 + tier * 2); KM.sparkT = 0.35; }
  KM.wantSpark = 0;
}
function streakTick(dt) {
  if (!(S.streakT > 0)) return;
  S.streakT -= dt;
  if (S.streakT <= 0) streakEnd();
}
function streakEnd() {
  const n = S.streak || 0; S.streak = 0; S.streakT = 0; KM.dirty = false; KM.wantSpark = 0;
  const el = $('#killMul'); if (!el) return;
  // pay out: a few circuits for a good streak, more the longer it ran
  const c = n >= 20 ? Math.floor(Math.pow(n / 20, 1.2)) : 0;
  if (c > 0) {
    META.circuits += c; saveMeta(); if (S.st) S.st.circuits = (S.st.circuits || 0) + c;
    const pop = document.createElement('div'); pop.className = 'kmPay'; pop.innerHTML = `+${c} ${sym('circuits', '')}`;
    el.appendChild(pop); setTimeout(() => pop.remove(), 1400);
    sfx('coin', 0.6); sfx('combine', 0.4);
  }
  el.classList.add('out'); setTimeout(() => { if (!(S.streak > 1)) { el.hidden = true; } el.classList.remove('out'); }, c > 0 ? 1300 : 400);
}

/* ---------- katana: each swing cuts everything inside its arc (90° at Lv 1, widening to 180°) in front of the arm ---------- */
function katanaSweep(w, W, m, arm) {
  const ud = player.model && player.model.userData; if (!ud) return;
  const base = (ud.baseOf.get(w) || ud.muzzleOf.get(w)); if (!base) return;
  const o = base.getWorldPosition(new THREE.Vector3());
  const tgt = arm.aimT || aim.point; const fx = tgt.x - o.x, fz = tgt.z - o.z, fl = Math.hypot(fx, fz) || 1;
  if (!isFinite(o.x + o.y + o.z + fx + fz)) return;          // a degenerate arm pose: skip this swing rather than poison every enemy with NaN
  const half = THREE.MathUtils.degToRad(W.arc(w.lvl)) / 2, reach = W.reach(w.lvl), cosH = Math.cos(half);
  const dmg = W.dmg(w.lvl) * m.dmg * (isHeld(w) ? 1 : FIXED_DMG);
  let hits = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const p = aimPtT(e), dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d > reach + e.r || Math.abs(p.y - o.y) > 2.2 + e.r) continue;
    if (d > 0.3 && (dx * fx + dz * fz) / (d * fl) < cosH) continue;
    DMG_SRC = w; damage(e, dmg, !m.auto); DMG_SRC = null;
    if (!e.dead) knock(e, new THREE.Vector3(dx, 0, dz).normalize(), 6, 2);
    hits++;
  }
  if (hits) { sfx('slash', 0.6); spark(o.clone().add(new THREE.Vector3(fx / fl, 0, fz / fl).multiplyScalar(reach * 0.7)), 0xffffff); }
  slashArc(o, Math.atan2(fx, fz), half, reach);
}
/* the white crescent a katana swing leaves in the air */
function slashArc(o, yaw, half, reach) {
  const geo = new THREE.RingGeometry(reach * 0.35, reach, 24, 1, -half, half * 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = yaw - Math.PI / 2;
  const holder = new THREE.Group(); holder.add(mesh); holder.position.copy(o); scene.add(holder);
  addFx(holder, 0.22, f => { mesh.material.opacity = 0.55 * (f.life / f.max); holder.scale.setScalar(1 + 0.15 * (1 - f.life / f.max)); });
}
/* ---------- chainsaw: shreds everything along the bar while it's revving; on a block it's always running ---------- */
const _sawA = new THREE.Vector3(), _sawB = new THREE.Vector3();
function sawTick(dt) {
  if (!player.model) return;
  const ud = player.model.userData, now = S.t;
  for (const w of mountedWeapons()) {
    const W = WEAPONS[w.type]; if (!W.saw) continue;
    const pg = ud.partOf.get(w), held = isHeld(w);
    const on = held ? !!w.sawOn : true;
    // idle shudder and smoke whether it's cutting or not; harder while revving
    if (pg && pg.userData.saw) { const k = on ? 0.035 : 0.012; pg.userData.saw.position.x = (Math.random() - 0.5) * k; pg.userData.saw.position.y = (Math.random() - 0.5) * k; }
    w.smokeT = (w.smokeT || 0) - dt;
    if (pg && pg.userData.exhaust && w.smokeT <= 0) { w.smokeT = on ? 0.06 : 0.16; smokePuff(pg.userData.exhaust.getWorldPosition(new THREE.Vector3()), on ? rand(0.18, 0.3) : rand(0.1, 0.18)); }
    if (!on) continue;
    const tipO = ud.muzzleOf.get(w), baseO = ud.baseOf.get(w); if (!tipO || !baseO) continue;
    tipO.getWorldPosition(_sawB); baseO.getWorldPosition(_sawA);
    if (!isFinite(_sawA.x + _sawA.y + _sawA.z + _sawB.x + _sawB.y + _sawB.z)) continue;
    w.revT = (w.revT || 0) - dt; if (w.revT <= 0) { w.revT = 0.18; sfxP('hiss', 0.18, 1.6); }
    const dmg = W.dmg(w.lvl) * stats.dmg * (held ? 1 : FIXED_DMG);
    for (const e of enemies) {
      if (e.dead) continue;
      const rr = e.r + 0.35 + (e.boss ? 1.6 : 0);
      if (segDist2(_sawA, _sawB, aimPtT(e)) > rr * rr) continue;
      e.sawT = e.sawT || {};
      if ((e.sawT[w.id] || -9) > now - 0.12) continue;
      e.sawT[w.id] = now;
      DMG_SRC = w; damage(e, dmg, held); DMG_SRC = null;
      if (Math.random() < 0.5) spark(aimPtT(e).clone(), Math.random() < 0.5 ? 0xffd27a : 0xff7a2a);
      if (!e.dead) { e.stun = Math.max(e.stun, 0.08); e.vel.multiplyScalar(0.6); }
    }
  }
}

/* ---------- RoboVacs: harmless cleaning bots. At least VAC_COUNT roam each stage, sucking up the stains your kills leave.
   They never chase or hurt you, take no fall damage, aren't targeted by auto-aim, lock-on or chains, and have no health bar.
   Shoot one for a big xp drop; another drops in from the sky somewhere out of sight. ---------- */
const VAC_COUNT = 3;
function vacSteer(e, dt) {
  e.vacT = (e.vacT || 0) - dt;
  // eat whatever is under it
  const got = wipeStains(e.pos.x, e.pos.z, e.r + 0.35);
  if (got) { e.ate = (e.ate || 0) + got; if (Math.random() < 0.5) spark(e.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x9feaff); }
  // pick a new goal: the nearest stain within reach, or a random spot to wander to
  if (!e.goal || e.vacT <= 0 || Math.hypot(e.goal.x - e.pos.x, e.goal.z - e.pos.z) < 0.6) {
    e.vacT = rand(3, 6);
    let best = null, bd = 30 * 30;
    if (stainMesh) {
      const N = stainMesh.count, step = Math.max(1, Math.floor(N / 900));       // a sample is plenty to find a mess
      for (let i = Math.floor(Math.random() * step); i < N; i += step) { if (!STAIN_LIVE[i]) continue; const dx = STAIN_XZ[i * 2] - e.pos.x, dz = STAIN_XZ[i * 2 + 1] - e.pos.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
    }
    if (best !== null) e.goal = { x: STAIN_XZ[best * 2], z: STAIN_XZ[best * 2 + 1] };
    else { const a = Math.random() * Math.PI * 2, r = rand(6, 18); e.goal = { x: clamp(e.pos.x + Math.cos(a) * r, -HALF + 6, HALF - 6), z: clamp(e.pos.z + Math.sin(a) * r, -HALF + 6, HALF - 6) }; }
  }
  const gx = e.goal.x - e.pos.x, gz = e.goal.z - e.pos.z, gl = Math.hypot(gx, gz) || 1;
  // bumped into a wall: turn away and find somewhere else
  if (e.bumped) { e.vacT = Math.min(e.vacT, 0.2); }
  return [gx / gl, gz / gl];
}
/* keep the level stocked: top up to VAC_COUNT, dropping replacements in from the sky out of sight */
function vacTick(dt) {
  if (S.test || !S.inRun || S.mode !== 'play') return;
  let n = 0; for (const e of enemies) if (!e.dead && e.d.npc) n++;
  if (!S.vacSeeded) {        // stage start: the first ones are already down on the ground
    for (let i = n; i < VAC_COUNT; i++) { const p = vacSpot(); if (p) spawnEnemy('robovac', p); }
    S.vacSeeded = true; return;
  }
  if (n >= VAC_COUNT) { S.vacT = 0; return; }
  S.vacT = (S.vacT || 0) - dt; if (S.vacT > 0) return;
  S.vacT = 1.2;
  const p = vacSpot(); if (!p) return;
  const v = spawnEnemy('robovac', p);
  if (S.vacSeeded) { v.pos.y = p.y + 45; v.vel.set(0, -4, 0); v.onGround = false; }     // a replacement falls in from the sky
}
/* a spot well away from the player and out of the camera's view */
function vacSpot() {
  camera.updateMatrixWorld(); const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (let i = 0; i < 60; i++) {
    const x = rand(-HALF + 10, HALF - 10), z = rand(-HALF + 10, HALF - 10), k = idxOf(x, z);
    if (k < 0 || !inner(k) || Math.hypot(x - player.pos.x, z - player.pos.z) < 30) continue;
    const p = new THREE.Vector3(x, H[k], z);
    if (f.containsPoint(p) || f.containsPoint(p.clone().setY(p.y + 45))) continue;
    return { x, z, y: H[k] };
  }
  return null;
}
