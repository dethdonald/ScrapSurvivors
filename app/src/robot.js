'use strict';
/* Robot model. Chassis blocks have real holes cut into their faces (sockets), lit orange inside.
   Parts are ball-jointed: the ball seats into a socket hole. The same model is used in the hangar and in the arena. */
const HOLE_R = 0.2, HOLE_DEPTH = 0.28;
const FACE_ROT = { front: [0, 0, 0], back: [0, Math.PI, 0], right: [0, Math.PI / 2, 0], left: [0, -Math.PI / 2, 0], top: [-Math.PI / 2, 0, 0], bottom: [Math.PI / 2, 0, 0] };
const holeWallGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); holeWallGeo.rotateX(Math.PI / 2);
const holeFloorGeo = new THREE.CircleGeometry(1, 24);
const haloGeo = new THREE.RingGeometry(1.15, 1.6, 32);
const ballGeo = new THREE.IcosahedronGeometry(1, 1);
const matHoleWall = new THREE.MeshBasicMaterial({ color: 0xd8600f, side: THREE.BackSide });
const matHoleFloor = new THREE.MeshBasicMaterial({ color: 0xffa24d });
// the round socket recesses cut into the hull: lit orange (or the player's secondary colour), with a little glow
const matSocket = SM(ORANGE, 0x6a2800);
const faceGeoCache = new Map();

function faceGeometry(fw, fh, holes) {
  const key = [fw, fh, ...holes.flat()].map(n => n.toFixed(3)).join(',');
  if (faceGeoCache.has(key)) return faceGeoCache.get(key);
  const s = new THREE.Shape();
  s.moveTo(-fw / 2, -fh / 2); s.lineTo(fw / 2, -fh / 2); s.lineTo(fw / 2, fh / 2); s.lineTo(-fw / 2, fh / 2); s.lineTo(-fw / 2, -fh / 2);
  for (const [u, v, r] of holes) { const p = new THREE.Path(); p.absarc(u, v, r, 0, Math.PI * 2, true); s.holes.push(p); }
  const g = new THREE.ShapeGeometry(s, 24);
  faceGeoCache.set(key, g);
  return g;
}
function faceDims(face, w, h, d) {
  if (face === 'front' || face === 'back') return [w, h, d / 2];
  if (face === 'left' || face === 'right') return [d, h, w / 2];
  return [w, d, h / 2];
}
/* A box with round holes. holes: [{face, u, v, r}] in face-local units. Returns { group, anchors } with one anchor per hole. */
function makeBlock(w, h, d, color, holes = [], hull = false) {
  const group = new THREE.Group(), anchors = [], faces = {};
  if (hull) {
    // the bevelled, grooved hull (see shapes.js); the flat faces below only carry the socket holes
    // 'plain': the recesses are dark panels, not sockets (the V2 halves)
    const m = hull === 'plain' ? new THREE.Mesh(getHullPlainGeo(), M(color)) : new THREE.Mesh(getHullGeo(), [M(color), matSocket]); m.scale.set(w / 2, h / 2, d / 2); group.add(m);
  }
  for (const face of Object.keys(FACE_ROT)) {
    const [fw, fh, off] = faceDims(face, w, h, d);
    const fg = new THREE.Group();
    const r = FACE_ROT[face]; fg.rotation.set(r[0], r[1], r[2]);
    fg.translateZ(off);
    const mine = holes.filter(x => x.face === face).map(x => [x.u || 0, x.v || 0, x.r || HOLE_R]);
    if (!hull) fg.add(new THREE.Mesh(faceGeometry(fw, fh, mine), M(color)));
    else fg.translateZ(-0.02 * Math.min(w, h, d));      // sit the sockets just inside the hull's recessed centre
    group.add(fg); faces[face] = fg;
  }
  for (const hd of holes) {
    const fg = faces[hd.face], u = hd.u || 0, v = hd.v || 0, r = hd.r || HOLE_R;
    const [fw, fh, off] = faceDims(hd.face, w, h, d);
    const depth = Math.min(HOLE_DEPTH, off * 0.9);
    let floor = null;
    if (!hull) {   // the hull model has its own socket recesses; the plain box needs drawn ones
      const wall = new THREE.Mesh(holeWallGeo, matHoleWall); wall.scale.set(r, r, depth); wall.position.set(u, v, -depth / 2); fg.add(wall);
      floor = new THREE.Mesh(holeFloorGeo, matHoleFloor); floor.scale.setScalar(r); floor.position.set(u, v, -depth + 0.002); fg.add(floor);
    }
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    halo.scale.setScalar(r); halo.position.set(u, v, 0.01); halo.visible = false; fg.add(halo);
    const anchor = new THREE.Object3D(); anchor.position.set(u, v, -0.03); fg.add(anchor);
    anchor.userData = { fq: fg.quaternion.clone(), out: new THREE.Vector3(0, 0, 1).applyQuaternion(fg.quaternion), halo, floor, r };
    anchors.push(anchor);
  }
  return { group, anchors, faces };
}

/* ---------- helpers used by part models in data.js ---------- */
const V = a => Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a;
function joint(g, p, r, color) { const m = new THREE.Mesh(ballGeo, M(color)); m.scale.setScalar(r); m.position.copy(V(p)); g.add(m); return m; }
function strut(g, a, b, t, color) {
  a = V(a); b = V(b);
  const len = a.distanceTo(b); if (len < 1e-4) return null;
  const m = new THREE.Mesh(geoBox, M(color)); m.scale.set(t, t, len);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  g.add(m); m.lookAt(b.x, b.y, b.z);
  return m;
}
/* A small cube with one socket hole facing +z (forward). Returns the anchor for whatever plugs in. */
function socketBlock(g, size, p, r = 0.13) {
  const b = makeBlock(size, size, size, COL.chassis, [{ face: 'front', r }]);
  b.group.position.copy(V(p)); g.add(b.group);
  return b.anchors[0];
}

/* ---------- parts ---------- */
const HIP_Y = 1.35;                       // height of the bottom body's centre; legs reach the floor from here
const JOINT_COL = 0x5d6872;
const faceOfDir = v => Math.abs(v.x) > 0.5 ? (v.x > 0 ? 'right' : 'left') : Math.abs(v.y) > 0.5 ? (v.y > 0 ? 'top' : 'bottom') : (v.z > 0 ? 'front' : 'back');
const baseY = () => HIP_Y - BLOCKS.body.neck - BLOCKS.body.size[1] / 2;

/* reg collects sockets, mounted parts and muzzles while a robot is built (null for loose parts). */
function newReg() { return { sockets: [], parts: [], partOf: new Map(), muzzleOf: new Map(), baseOf: new Map(), legs: [], jets: [], spinners: [], torso: null, hips: null, blocks: [] }; }

/* A springy coupler from the origin (in the parent's hole) to the block face, like a coil. */
function coupler(g, to, len) {
  const n = Math.max(3, Math.round(len / 0.07));
  for (let k = 0; k <= n; k++) {
    const t = k / n, ring = new THREE.Mesh(geoBox, M(k % 2 ? COL.dark : 0x7a848e));
    ring.scale.setScalar(k % 2 ? 0.2 : 0.26); ring.scale[Math.abs(to.x) > 0.5 ? 'x' : Math.abs(to.y) > 0.5 ? 'y' : 'z'] = 0.05;
    ring.position.copy(to).multiplyScalar(t * len); g.add(ring);
  }
}
function buildBlock(g, item, out, reg) {
  const def = BLOCKS[item.type], [w, h, d] = def.size;
  item.plug = OPPOSITE[faceOfDir(out)];                       // the face that points back at the parent
  const open = blockOpenFaces(item);
  const holes = [], idx = [];
  FACE_ORDER.forEach((f, i) => {
    if (open[i]) { holes.push({ face: f, r: def.body ? 0.2 : 0.15 }); idx.push(i); }
    else if (f === item.plug) { holes.push({ face: f, r: def.body ? 0.2 : 0.15 }); idx.push(-1); }   // the coupler sits in this hole
  });
  const blk = makeBlock(w, h, d, blockColor(def), holes, true);
  if (def.decor) { const of = OPPOSITE[item.plug]; def.decor(blk.group, w, h, d, of === 'left' || of === 'right' ? 'x' : of === 'top' || of === 'bottom' ? 'y' : 'z'); }
  if (def.body) addQrStickers(blk, item, w, h, d);
  if (def.body && BUILD_ROOT) {
    // stickers land in the same places on every robot you build (body 0 = bottom, 1 = the next one up...), and
    // stay wherever you've dragged them in Customize
    const bi = BODY_IDX++;
    if (item === BUILD_ROOT) addPatch(blk, item, w, h, d, bi);
    addStickerBomb(blk, item, w, h, d, bi);
  }
  const ext = Math.abs(out.x) * w / 2 + Math.abs(out.y) * h / 2 + Math.abs(out.z) * d / 2;
  blk.group.position.copy(out).multiplyScalar(def.neck + ext);
  g.add(blk.group);
  // the ball and spring coupler only show where this block plugs into something (not under the bottom body in the field)
  if (!(item === BUILD_ROOT && ROOT_BARE)) { joint(g, [0, 0, 0], def.body ? 0.15 : 0.11, JOINT_COL); coupler(g, out, def.neck); }
  if (reg) reg.blocks.push(blk.group);
  idx.forEach((i, k) => {
    if (i < 0) return;
    const ref = { owner: item, key: 'slots', i }, a = blk.anchors[k];
    if (def.spin) {
      // Spin Gear: a toothed wheel on the outer socket; the game turns this anchor (and whatever is plugged in)
      for (let t = 0; t < 10; t++) { const ang = t / 10 * Math.PI * 2, tooth = bx(0.1, 0.1, 0.07, 0x8c96a0, Math.cos(ang) * 0.27, Math.sin(ang) * 0.27, 0.02); tooth.rotation.z = ang; a.add(tooth); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 20), M(0x5d6872)); hub.rotation.x = Math.PI / 2; hub.position.z = 0.0; a.add(hub);
      a.add(bx(0.06, 0.4, 0.07, ORANGE, 0, 0, 0.04));
      if (reg) reg.spinners.push({ anchor: a, item });
    }
    if (reg) reg.sockets.push({ ref, anchor: a });
    if (item.slots[i]) mount(a, item.slots[i], ref, reg);
  });
  // anything sitting in a face that is now the plug face falls off (handled by the workbench)
}
/* ---------- QR stickers ----------
   Every body block carries one or two randomly generated QR-style stickers in a face corner. They are
   decoration only: the data modules are random noise with no valid format or error-correction
   information, so a phone scanner cannot decode them into a link (they go nowhere). */
const qrTexCache = new Map();
function qrTexture(seed) {
  if (qrTexCache.has(seed)) return qrTexCache.get(seed);
  const N = 21, px = 4, pad = 2, size = (N + pad * 2) * px;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'), rng = mulberry32(seed);
  c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, size, size);
  c.fillStyle = '#16181a';
  const finder = (x, y) => { c.fillRect((x + pad) * px, (y + pad) * px, 7 * px, 7 * px); c.fillStyle = '#f2f0e8'; c.fillRect((x + 1 + pad) * px, (y + 1 + pad) * px, 5 * px, 5 * px); c.fillStyle = '#16181a'; c.fillRect((x + 2 + pad) * px, (y + 2 + pad) * px, 3 * px, 3 * px); };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rng() < 0.47) c.fillRect((x + pad) * px, (y + pad) * px, px, px);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
  if (qrTexCache.size > 64) qrTexCache.clear();
  qrTexCache.set(seed, tex);
  return tex;
}
const qrPlaneGeo = new THREE.PlaneGeometry(1, 1);
function addQrStickers(blk, item, w, h, d) {
  if (!item.qr) item.qr = (Math.random() * 1e9) | 0;
  const rng = mulberry32(item.qr);
  const faces = ['front', 'back', 'left', 'right'].filter(f => f !== item.plug);
  const n = rng() < 0.4 ? 2 : 1;
  for (let k = 0; k < n && faces.length; k++) {
    const f = faces.splice(Math.floor(rng() * faces.length), 1)[0], fg = blk.faces[f];
    const [fw, fh] = faceDims(f, w, h, d), s = Math.min(fw, fh) * 0.2;
    const sx = rng() < 0.5 ? 1 : -1, sy = 1;        // stickers take the upper corners; the patch goes low
    const m = new THREE.Mesh(qrPlaneGeo, new THREE.MeshLambertMaterial({ map: qrTexture((item.qr + k * 7919) | 0) }));
    m.scale.set(s, s, 1);
    m.position.set(sx * fw * 0.3, sy * fh * 0.3, 0.02 * Math.min(w, h, d) + 0.004);
    m.rotation.z = (rng() - 0.5) * 0.25;                 // stuck on by hand: never quite square
    fg.add(m);
  }
}
/* ---------- paint and patch (title screen > Customize) ---------- */
let BUILD_ROOT = null;   // the main body of the robot being built: it carries the patch
function blockColor(def) {
  if (!CUSTOM.color) return def.color;
  const c = new THREE.Color(CUSTOM.color);
  if (!def.body) c.multiplyScalar(0.82);            // bricks, plates and gears a shade darker than the body
  return c.getHex();
}
let patchTex = null, patchRev = -1;
function patchTexture() {
  if (patchRev === CUSTOM.rev && patchTex) return patchTex;
  const px = CUSTOM.patch; patchRev = CUSTOM.rev;
  if (!px || !px.some(Boolean)) return patchTex = null;
  // printed on a white sticker, like the QR stickers
  const pad = 2, N = PATCH_N + pad * 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d');
  c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, N, N);
  px.forEach((col, i) => { if (col) { c.fillStyle = col; c.fillRect(pad + i % PATCH_N, pad + ((i / PATCH_N) | 0), 1, 1); } });
  if (patchTex) patchTex.dispose();
  patchTex = new THREE.CanvasTexture(cv); patchTex.magFilter = THREE.NearestFilter; patchTex.minFilter = THREE.NearestFilter;
  return patchTex;
}
/* a sticker texture for any saved patch design (cached until the designs change) */
const bombTex = new Map(); let bombRev = -1;
function patchTexOf(px) {
  if (bombRev !== CUSTOM.rev) { bombTex.forEach(t => t.dispose()); bombTex.clear(); bombRev = CUSTOM.rev; }
  if (!px || !px.some(Boolean)) return null;
  const key = px.join(','); if (bombTex.has(key)) return bombTex.get(key);
  const pad = 2, N = PATCH_N + pad * 2, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'); c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, N, N);
  px.forEach((col, i) => { if (col) { c.fillStyle = col; c.fillRect(pad + i % PATCH_N, pad + ((i / PATCH_N) | 0), 1, 1); } });
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  bombTex.set(key, t); return t;
}
/* Sticker bomb: lots of your saved patches slapped all over the bodies at random sizes and angles */
function placeSticker(m, fg, key, fw, fh, s) {
  const o = CUSTOM.stickers[key];
  if (o && o.off) return;                                   // peeled off in Customize
  if (o) m.position.set(clamp(o.u, -(fw - s) / 2, (fw - s) / 2), clamp(o.v, -(fh - s) / 2, (fh - s) / 2), m.position.z);
  Object.assign(m.userData, { patch: true, skey: key, fw, fh, s });
  fg.add(m);
}
function addStickerBomb(blk, item, w, h, d, bi) {
  const n = Math.round(CUSTOM.bomb || 0); if (!n) return;
  const texs = CUSTOM.patches.map(p => patchTexOf(p.px)).filter(Boolean); if (!texs.length) return;
  const rng = mulberry32((CUSTOM.layout * 3 + 7919 * (bi + 1)) | 0);
  const faces = ['front', 'back', 'left', 'right', 'top'].filter(f => f !== item.plug && blk.faces[f]);
  const per = n * 2;                                    // per body: up to 24 when maxed out
  for (let k = 0; k < per; k++) {
    const f = faces[Math.floor(rng() * faces.length)], fg = blk.faces[f];
    const [fw, fh] = faceDims(f, w, h, d), s = Math.min(fw, fh) * (0.14 + rng() * 0.14);
    let u = 0, v = 0;
    for (let t = 0; t < 8; t++) { u = (rng() - 0.5) * (fw - s); v = (rng() - 0.5) * (fh - s); if (Math.hypot(u, v) > 0.22 + s * 0.5) break; }   // keep clear of the socket
    const m = new THREE.Mesh(qrPlaneGeo, new THREE.MeshLambertMaterial({ map: texs[Math.floor(rng() * texs.length)] }));
    m.scale.set(s, s, 1); m.position.set(u, v, 0.02 * Math.min(w, h, d) + 0.006 + k * 0.0012);
    m.rotation.z = (rng() - 0.5) * 1.4;
    placeSticker(m, fg, `${bi}:${k}`, fw, fh, s);
  }
}
function addPatch(blk, item, w, h, d, bi = 0) {
  const tex = patchTexture(); if (!tex) return;
  const rng = mulberry32((CUSTOM.layout + 101 * (bi + 1)) | 0);
  const faces = ['front', 'back', 'left', 'right'].filter(f => f !== item.plug);
  const f = faces[Math.floor(rng() * faces.length)], fg = blk.faces[f];
  const [fw, fh] = faceDims(f, w, h, d), s = Math.min(fw, fh) * 0.2;     // same size as a QR sticker
  const m = new THREE.Mesh(qrPlaneGeo, new THREE.MeshLambertMaterial({ map: tex }));
  m.scale.set(s, s, 1);
  m.position.set((rng() < 0.5 ? 1 : -1) * fw * 0.3, -fh * 0.3, 0.02 * Math.min(w, h, d) + 0.005);
  m.rotation.z = (rng() - 0.5) * 0.25;                                     // stuck on by hand, slightly crooked
  placeSticker(m, fg, `${bi}:p`, fw, fh, s);
}
/* Secondary colour: every orange accent on the robot (socket holes, trim, springs) takes the player's second colour. */
const ACCENT_HEX = new Set([ORANGE, 0xd8600f, 0xffa24d, 0xb85614]);
const accentMats = new Map();
function accentMat(src) {
  const hex = src.color.getHex(), key = CUSTOM.color2 + ':' + hex + ':' + src.type + ':' + src.side;
  if (accentMats.has(key)) return accentMats.get(key);
  const c = new THREE.Color(CUSTOM.color2);
  // keep the shading relationship of the original: hole walls darker, hole floors lighter
  if (hex === 0xd8600f || hex === 0xb85614) c.multiplyScalar(0.8); else if (hex === 0xffa24d) c.lerp(new THREE.Color(0xffffff), 0.25);
  const m = src.clone(); m.color = c;
  if (m.emissive && src.emissive && src.emissive.getHex()) m.emissive = c.clone().multiplyScalar(0.3);
  accentMats.set(key, m);
  return m;
}
function applySecondary(root) {
  if (!CUSTOM.color2 || CUSTOM.color2.toLowerCase() === '#ff7a1a') return;
  const swap = m => (m && !m.transparent && m.color && ACCENT_HEX.has(m.color.getHex())) ? accentMat(m) : m;   // leave glows and halos alone
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}
/* Rarity colour on a part: a glowing band round a weapon's barrel, a gem on anything else. Mk III+ also glows. */
const rarityMats = {};
function rarityMat(lvl, glow) {
  const k = lvl + (glow ? 'g' : '');
  return rarityMats[k] || (rarityMats[k] = new THREE.MeshBasicMaterial(glow ? { color: rarityOf(lvl).color, transparent: true, opacity: 0.28, depthWrite: false } : { color: rarityOf(lvl).color }));
}
function addRarityMark(g, item, res) {
  if (item.kind !== 'weapon') return;      // only weapons show rarity (in their accent colour)
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  g.children.forEach(c => { if (c.isMesh || c.children.length) box.expandByObject(c); });
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let mark;
  if (item.kind === 'weapon') {
    // a weapon shows its rarity in its accent colour (sights, bands, coils, tanks), not with an extra stripe
    const ACC = new Set([ORANGE, COL.cyan, COL.red, 0xb8322c, 0x58a8ff]);
    let n = 0;
    g.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color && ACC.has(o.material.color.getHex())) { o.material = rarityMat(item.lvl); n++; } });
    if (n) return;
    const mz = res.muzzle || [c.x, c.y, box.max.z];
    mark = new THREE.Mesh(geoBox, rarityMat(item.lvl));
    mark.scale.set(0.2, 0.21, 0.06);                       // a slim stripe round the barrel
    mark.position.set(mz[0], mz[1], mz[2] - 0.17);
  } else {
    mark = new THREE.Mesh(geoBox, rarityMat(item.lvl));
    mark.scale.setScalar(0.11); mark.rotation.set(0.6, 0.8, 0);
    const out = item.kind === 'leg' ? new THREE.Vector3(c.x, box.max.y - 0.35, c.z + 0.12) : new THREE.Vector3(c.x, box.max.y + 0.06, c.z);
    mark.position.copy(out);
  }
  g.add(mark);
  if (tierOf(item.lvl) >= 4) { const glow = new THREE.Mesh(geoBox, rarityMat(item.lvl, true)); glow.scale.copy(mark.scale).multiplyScalar(item.kind === 'weapon' ? 1.3 : 1.9); glow.position.copy(mark.position); g.add(glow); }
}

/* Two-bone leg IK in the leg's own space: hip at the origin, T = where the ankle should be. Knees bend forward. */
const DOWN = new THREE.Vector3(0, -1, 0);
function legPose(ik, T) {
  const { a, b } = ik;
  const len = T.length(), d = clamp(len, 0.05, a + b - 1e-3);
  const dir = len > 1e-4 ? T.clone().divideScalar(len) : DOWN.clone();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  // which way the knee bends: forward by default, or the leg's own hint (spider legs arch up and out)
  const hint = ik.hintV ? ik.hintV.clone() : new THREE.Vector3(0, 0, 1);
  hint.addScaledVector(dir, -hint.dot(dir));
  if (hint.lengthSq() < 1e-4) hint.set(0, 1, 0).addScaledVector(dir, -dir.y);
  hint.normalize();
  const knee = dir.clone().multiplyScalar(a * cosA).addScaledVector(hint, a * sinA);
  const end = dir.clone().multiplyScalar(d);
  ik.thigh.quaternion.setFromUnitVectors(DOWN, knee.clone().normalize());
  ik.shin.position.copy(knee);
  ik.shin.quaternion.setFromUnitVectors(DOWN, end.clone().sub(knee).normalize());
  ik.foot.position.copy(end);
}
const ROTATABLE = ['arm', 'weapon', 'module'];
/* Tread suspension: off > 0 pushes the tread up into the spring, < 0 lets it hang. */
function setShock(sh, off) {
  const hubY = sh.restY + off, seatY = hubY + sh.seat;
  sh.hub.position.y = hubY;
  const len = Math.max(0.05, sh.topY - seatY);
  sh.coil.position.y = seatY; sh.coil.scale.y = len;
  sh.rod.position.y = (sh.topY + 0.15 + seatY) / 2; sh.rod.scale.y = Math.max(0.05, sh.topY + 0.15 - seatY);
}

/* Builds a part (and everything plugged into it) with its ball joint at the origin.
   out = direction pointing away from the socket it plugs into (robot frame). */
function buildPart(item, out, reg) {
  const g = new THREE.Group(), def = itemDef(item);
  if (item.kind === 'lower') buildLower(g, item, out, reg);
  else if (item.kind === 'block' && BLOCKS[item.type].upper) buildUpper(g, item, out, reg);
  else if (item.kind === 'block') buildBlock(g, item, out, reg);
  else if (item.kind === 'adapter') buildAdapter(g, item, out, reg);
  else {
    const res = (def.model ? def.model(g, { lvl: item.lvl, out, item }) : null) || {};
    if (res.ik) { g.userData.ik = res.ik; res.ik.restV = new THREE.Vector3().fromArray(res.ik.rest); if (res.ik.hint) res.ik.hintV = new THREE.Vector3().fromArray(res.ik.hint).normalize(); legPose(res.ik, res.ik.restV); }
    if (res.spin) g.userData.spinMesh = res.spin;
    if (res.saw) g.userData.saw = res.saw;
    if (res.exhaust) { const x = new THREE.Object3D(); x.position.fromArray(res.exhaust); g.add(x); g.userData.exhaust = x; }
    if (res.dashFx) g.userData.dashFx = res.dashFx;
    if (res.pogoSpring) g.userData.pogoSpring = res.pogoSpring;
    if (res.shock) g.userData.shock = res.shock;
    if (res.jet) g.userData.jet = res.jet;
    addRarityMark(g, item, res);
    if (!def.model) g.add(bx(0.36, 0.36, 0.36, COL.joint, out.x * 0.25, out.y * 0.25, out.z * 0.25));
    if (res.muzzle) { const m = new THREE.Object3D(); m.position.fromArray(res.muzzle); g.add(m); g.userData.muzzle = m; }
    if (res.base) { const b = new THREE.Object3D(); b.position.fromArray(res.base); g.add(b); g.userData.base = b; }
    syncGemSlots(item);
    if (item.kind === 'module' && item.gems && item.gems.length) {
      // modules with gem slots carry them on top
      g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      item.gems.forEach((gm, i) => {
        const gs = res.gemSock;       // a module can name its own socket spot (the Missile Pod: its rear face)
        const side = gs && gs.face === 'right';
        const gb = gs ? makeBlock(side ? 0.08 : 0.17, 0.17, side ? 0.17 : 0.08, COL.dark, [{ face: gs.face, r: 0.06 }]) : makeBlock(0.17, 0.08, 0.17, COL.dark, [{ face: 'top', r: 0.06 }]);
        if (gs) gb.group.position.set(gs.pos[0], gs.pos[1] + i * 0.2, gs.pos[2]); else gb.group.position.set(cx + (i - (item.gems.length - 1) / 2) * 0.22, bb.max.y + 0.03, cz);
        g.add(gb.group);
        const ga = gb.anchors[0], gref = { owner: item, key: 'gems', i };
        if (reg) reg.sockets.push({ ref: gref, anchor: ga });
        if (gm) mount(ga, gm, gref, reg);
      });
    }
    if (item.kind === 'leg' && item.gems && item.gems.length) {
      // like the arm's: a small socket block, here on the front of the thigh, halfway down
      // on the outside of the thigh, facing away from the body
      let ox = out.x, oz = out.z; if (Math.hypot(ox, oz) < 0.3) { ox = 1; oz = 0; }
      const ax = Math.abs(ox) >= Math.abs(oz), face = ax ? (ox > 0 ? 'right' : 'left') : (oz > 0 ? 'front' : 'back'), sx = ax ? Math.sign(ox) : 0, sz = ax ? 0 : Math.sign(oz);
      const gb = makeBlock(ax ? 0.08 : 0.17, 0.17, ax ? 0.17 : 0.08, COL.dark, [{ face, r: 0.06 }]);
      if (res.ik) {
        const th = res.ik.thigh.children[0], hw = th ? th.scale.x / 2 : 0.08;
        gb.group.position.set(sx * (hw + 0.04), -res.ik.a * 0.42, sz * (hw + 0.04)); res.ik.thigh.add(gb.group);
      } else if (res.shock) {
        // sprung legs (wheel, pogo, tread): on the outer side of the spring housing
        const hx = res.shock.hub.position.x, hz = res.shock.hub.position.z;
        gb.group.position.set(hx + sx * 0.2, -0.22, hz + sz * 0.2); g.add(gb.group);
      } else {
        g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g);
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        gb.group.position.set(sx ? (sx > 0 ? bb.max.x + 0.04 : bb.min.x - 0.04) : cx, bb.max.y - 0.32, sz ? (sz > 0 ? bb.max.z + 0.04 : bb.min.z - 0.04) : cz); g.add(gb.group);
      }
      const ga = gb.anchors[0], gref = { owner: item, key: 'gems', i: 0 };
      if (reg) reg.sockets.push({ ref: gref, anchor: ga });
      if (item.gems[0]) mount(ga, item.gems[0], gref, reg);
    }
    if (item.kind === 'arm') {
      const a = res.weaponAnchor || socketBlock(g, 0.3, [out.x * 0.3, 0, 0.5]);
      const ref = { owner: item, key: 'weapon' };
      if (reg) reg.sockets.push({ ref, anchor: a });
      if (item.weapon) mount(a, item.weapon, ref, reg);
      if (res.weaponAnchor2) {
        const ref2 = { owner: item, key: 'weapon2' };
        if (reg) reg.sockets.push({ ref: ref2, anchor: res.weaponAnchor2 });
        if (item.weapon2) mount(res.weaponAnchor2, item.weapon2, ref2, reg);
      }
      // two small gem sockets on the shoulder, facing up
      for (let i = 0; i < (item.gems || []).length; i++) {
        const gb = makeBlock(0.17, 0.08, 0.17, COL.dark, [{ face: 'top', r: 0.06 }]);
        if (res.gemAt) gb.group.position.fromArray(res.gemAt[i]);
        else gb.group.position.set(out.x * 0.16 + (i ? 0.1 : -0.1) * (out.x ? 0 : 1), 0.2, (i ? 0.1 : -0.1) * (out.x ? 1 : 0) - 0.02);
        g.add(gb.group);
        const ga = gb.anchors[0], gref = { owner: item, key: 'gems', i };
        if (reg) reg.sockets.push({ ref: gref, anchor: ga });
        if (item.gems[i]) mount(ga, item.gems[i], gref, reg);
      }
    }
  }
  g.userData.item = item;
  return g;
}
/* Seats a part in a socket. The holder cancels the face rotation so the part is built in the robot's frame. */
function attachPart(anchor, item, reg) {
  const holder = new THREE.Group();
  holder.quaternion.copy(anchor.userData.fq).invert();
  // 90° turns about the socket axis (click a mounted part in the workbench)
  if (item.rot && ROTATABLE.includes(item.kind)) holder.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(anchor.userData.out, item.rot * Math.PI / 2));
  anchor.add(holder);
  let out = anchor.userData.out.clone();
  // Legs adapt to where they're plugged in: on a back socket the whole leg turns round, so its knee
  // bends the other way and it walks backwards; anywhere else it faces forward.
  if (item.kind === 'leg' && out.z < -0.5) {
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    holder.quaternion.multiply(flip);
    out.applyQuaternion(flip.clone().invert());
  }
  const p = buildPart(item, out, reg);
  holder.add(p);
  return p;
}
function mount(anchor, item, ref, reg) {
  const p = attachPart(anchor, item, reg);
  if (anchor.userData.accepts === 'arm') anchor.add(maleArm());          // V2: the ball that sits in the ring
  else if (anchor.userData.accepts === 'module') anchor.add(maleModule()); // V2: the cube plug in the square recess
  p.userData.ref = ref;
  p.userData.out = anchor.userData.out.clone();
  if (reg) {
    if (item.kind !== 'gem') reg.parts.push(p);      // a gem rides inside its arm or leg (it isn't a part of its own for physics or ragdolls)
    reg.partOf.set(item, p);
    if (p.userData.muzzle) reg.muzzleOf.set(item, p.userData.muzzle);
    if (p.userData.base) reg.baseOf.set(item, p.userData.base);
    if (item.kind === 'leg') reg.legs.push(p);
    if (p.userData.jet) reg.jets.push(p);
    if (ref.key === 'body') reg.hips = p;
    else if (item.kind === 'block' && BLOCKS[item.type].body && ref.owner === BUILD_ROOT && ref.i === FACE_ORDER.indexOf('top')) reg.torso = p;
  }
  return p;
}
function plainAnchor(y) {
  const a = new THREE.Object3D(); a.position.set(0, y, 0);
  a.userData = { fq: new THREE.Quaternion(), out: new THREE.Vector3(0, 1, 0), halo: null, r: 0.2 };
  return a;
}

/* The whole robot. opts.stand adds the hangar display stand, whose top hole takes the bottom body. */
let ROOT_BARE = false, BODY_IDX = 0;
function buildRobot(L, opts = {}) {
  const g = new THREE.Group(), reg = newReg();
  const by = baseY();
  let base;
  if (opts.stand) {
    const pole = bx(0.22, by - 0.3, 0.22, COL.dark, 0, (by - 0.3) / 2, 0); g.add(pole);
    const cap = makeBlock(0.55, 0.28, 0.55, COL.chassis, [{ face: 'top', r: 0.2 }]);
    cap.group.position.y = by - 0.14 + 0.03; g.add(cap.group);
    base = cap.anchors[0];
    reg.blocks.push(cap.group);
    reg.sockets.push({ ref: { owner: L, key: 'body' }, anchor: base });
  } else { base = plainAnchor(by); g.add(base); }
  BUILD_ROOT = L.body; ROOT_BARE = !opts.stand; BODY_IDX = 0;
  if (L.body) mount(base, L.body, { owner: L, key: 'body' }, reg);
  BUILD_ROOT = null; ROOT_BARE = false;
  applySecondary(g);
  g.userData = reg;
  if (typeof attachCosmetics === 'function') attachCosmetics(g, L, reg);
  markMisplacedLegs(g);
  return g;
}
/* Where a leg's foot would be with the frame standing (y in the robot's frame) */
function legFootY(p) {
  const ud = p.userData;
  if (ud.ik) return p.localToWorld(ud.ik.restV.clone()).y;
  if (ud.shock) return p.localToWorld(new THREE.Vector3(0, ud.shock.restY - 0.34, 0)).y;
  return p.localToWorld(new THREE.Vector3()).y - 1.35;
}
/* Legs that can't reach the ground glow red, so it's obvious something is wrong */
const misMat = new Map();
function markMisplacedLegs(g) {
  g.updateMatrixWorld(true);
  const base = g.position.y;
  for (const p of g.userData.legs) {
    if (legFootY(p) - base < 0.35) continue;
    p.userData.misplaced = true;
    p.traverse(o => {
      let c = o; while (c && !(c.userData && c.userData.cosmetic)) c = c.parent; if (c) return;     // cosmetics keep their colours
      if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.isMeshBasicMaterial || (o.parent && o.parent.userData && o.parent.userData.item && o.parent.userData.item.kind === 'gem')) return;
      const src = o.material; let m = misMat.get(src);
      if (!m) { m = src.clone(); m.color = src.color.clone().lerp(new THREE.Color(0xff2a2a), 0.65); if (m.emissive) m.emissive = new THREE.Color(0x5a0808); misMat.set(src, m); }
      o.material = m;
    });
  }
}

/* ---------- BUILD V2 ----------
   Shapes from Luke's sketch set (beveled_sketch_shapes_all.glb), rebuilt here as clean low-poly bevelled solids with the
   same proportions: a ring (the arm socket, sphere connector), a block with a square recess (the module socket, cube
   connector), and the lower halves (disc = Walker, tapered block = Spider, slab = Wheels; the triangle for Treads is
   new in the same style). The male halves (ball, cube plug) ride on the part that plugs in. */
const V2_SHELL = 0x4b5661, V2_STEEL = 0x5d6872, V2_BALL = 0x8c96a0;
const v2GeoCache = new Map();
/* a flat profile (points in x/y) extruded along z, bevelled; size stays what the points say */
function bevelSolid(key, pts, depth, bev, holes) {
  if (v2GeoCache.has(key)) return v2GeoCache.get(key);
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (holes) sh.holes = holes;
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, depth - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 20 });
  g.translate(0, 0, -(depth - bev * 2) / 2);
  g.computeVertexNormals();
  v2GeoCache.set(key, g); return g;
}
const inset = (pts, b) => { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x - dx / l * b * 1.2, y - dy / l * b * 1.2]; }); };
const circlePts = (r, n = 28) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * r, Math.sin(k / n * Math.PI * 2) * r]);
const rectPts = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
/* a vertical prism: a top-view outline (x, z) extruded up h, centred on y = 0 */
function prismMesh(key, xz, h, bev, color) {
  const g = bevelSolid(key, inset(xz.map(([x, z]) => [x, -z]), bev), h, bev);
  const m = new THREE.Mesh(g, M(color)); m.rotation.x = -Math.PI / 2; return m;
}
/* ---- connectors (local +z points out of the surface; z = 0 is the surface) ---- */
const RING = { R: 0.23, r: 0.095, T: 0.1 }, BOXC = { S: 0.4, T: 0.2, H: 0.22, D: 0.12 };
const ARM_LEN = RING.T + 0.14, MOD_LEN = BOXC.T + 0.08;          // how far out the plugged-in part sits
function femaleArm() {
  const g = new THREE.Group(), hole = new THREE.Path(); hole.absarc(0, 0, RING.r + 0.015, 0, Math.PI * 2, true);
  const ring = new THREE.Mesh(bevelSolid('ringF', circlePts(RING.R - 0.015), RING.T, 0.015, [hole]), M(V2_STEEL)); ring.position.z = RING.T / 2; g.add(ring);
  const seat = new THREE.Mesh(new THREE.CircleGeometry(RING.r, 20), M(0x1a1e22)); seat.position.z = 0.004; g.add(seat);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(RING.r + 0.004, 0.012, 6, 24), matSocket); lip.position.z = RING.T; g.add(lip);
  return g;
}
function maleArm() {       // anchor-relative: the arm starts at z = 0, the ball sits in the ring behind it
  const g = new THREE.Group();
  const ball = new THREE.Mesh(ballGeo, M(V2_BALL)); ball.scale.setScalar(0.13); ball.position.z = -(ARM_LEN - RING.T - 0.02); g.add(ball);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, ARM_LEN - RING.T - 0.02, 12), M(COL.dark)); neck.rotation.x = Math.PI / 2; neck.position.z = -(ARM_LEN - RING.T - 0.02) / 2; g.add(neck);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16), M(V2_STEEL)); col.rotation.x = Math.PI / 2; col.position.z = -0.02; g.add(col);
  return g;
}
function femaleModule() {
  const g = new THREE.Group(), b = 0.015;
  const hole = new THREE.Path(rectPts(BOXC.H + b * 2, BOXC.H + b * 2).reverse().map(([x, y]) => new THREE.Vector2(x, y)));
  const frame = new THREE.Mesh(bevelSolid('boxF', rectPts(BOXC.S - b * 2.4, BOXC.S - b * 2.4), BOXC.D, b, [hole]), M(V2_STEEL)); frame.position.z = BOXC.T - BOXC.D / 2; g.add(frame);
  const back = new THREE.Mesh(bevelSolid('boxB', rectPts(BOXC.S - b * 2.4, BOXC.S - b * 2.4), BOXC.T - BOXC.D + 0.01, b), M(V2_STEEL)); back.position.z = (BOXC.T - BOXC.D) / 2; g.add(back);
  const floor = bx(BOXC.H, BOXC.H, 0.01, 0x1a1e22, 0, 0, BOXC.T - BOXC.D + 0.01); g.add(floor);
  for (const [x, y, w, h] of [[0, BOXC.H / 2, BOXC.H + 0.03, 0.02], [0, -BOXC.H / 2, BOXC.H + 0.03, 0.02], [BOXC.H / 2, 0, 0.02, BOXC.H], [-BOXC.H / 2, 0, 0.02, BOXC.H]]) { const t = new THREE.Mesh(geoBox, matSocket); t.scale.set(w, h, 0.012); t.position.set(x, y, BOXC.T + 0.002); g.add(t); }
  return g;
}
function maleModule() {
  const g = new THREE.Group(), into = MOD_LEN - BOXC.T + BOXC.D * 0.8;
  g.add(bx(BOXC.H - 0.02, BOXC.H - 0.02, into, V2_BALL, 0, 0, -MOD_LEN + BOXC.T - BOXC.D * 0.8 + into / 2));
  g.add(bx(0.3, 0.3, 0.04, COL.dark, 0, 0, -0.02));
  return g;
}
/* ---- lower-half shells. mounts: [face, x, y, z] hip positions; gems: [x, y, z] on the front; h: height ---- */
const LOWER_SHELLS = {
  standard: { h: 0.37, bottom: -0.185, top: 0.185, flat: ['top'], w: 1.2, d: 1.2,
    mesh: () => { const m = new THREE.Mesh(bevelSolid('disc', circlePts(0.585, 36), 0.37, 0.035), M(V2_SHELL)); m.rotation.x = -Math.PI / 2; return m; },
    mounts: [['left', -0.6, 0, 0], ['right', 0.6, 0, 0]], gems: [[-0.13, 0, 0.586], [0.13, 0, 0.586]] },
  spider: { h: 0.4, bottom: -0.2, top: 0.2, flat: ['top', 'back'], w: 1.0, d: 1.56,
    // a tapered block, wider at the back (Luke's trapezoid)
    xz: [[-0.55, -0.78], [0.55, -0.78], [0.445, 0.78], [-0.445, 0.78]],
    mounts: [-0.5, 0, 0.5].flatMap(z => { const x = 0.55 - (z + 0.78) / 1.56 * 0.105; return [['left', -x, 0, z], ['right', x, 0, z]]; }), gems: [[-0.12, 0, 0.78], [0.12, 0, 0.78]] },
  treads: { h: 0.45, bottom: -0.225, top: 0.225, flat: ['top', 'back'], w: 1.24, d: 1.3,
    // a triangle seen from above: the wide edge at the back carries two treads, the point at the front one
    xz: [[-0.62, -0.55], [0.62, -0.55], [0.15, 0.75], [-0.15, 0.75]],
    mounts: [['back', -0.32, 0, -0.55], ['back', 0.32, 0, -0.55], ['front', 0, 0, 0.75]], gems: [[-0.07, 0.1, 0.75], [0.07, -0.1, 0.75]] },
  wheels: { h: 0.52, bottom: -0.26, top: 0.26, flat: ['top', 'front', 'back', 'left', 'right'], w: 1.12, d: 1.6,
    xz: [[-0.56, -0.8], [0.56, -0.8], [0.56, 0.8], [-0.56, 0.8]],
    mounts: [['left', -0.56, 0, -0.55], ['left', -0.56, 0, 0.55], ['right', 0.56, 0, -0.55], ['right', 0.56, 0, 0.55]], gems: [[-0.13, 0, 0.8], [0.13, 0, 0.8]] },
};
function anchorAt(parent, face, pos, r = 0.2) {
  const fg = new THREE.Group(), fr = FACE_ROT[face]; fg.rotation.set(fr[0], fr[1], fr[2]); fg.position.copy(pos); parent.add(fg);
  const a = new THREE.Object3D(); fg.add(a);
  a.userData = { fq: fg.quaternion.clone(), out: new THREE.Vector3(0, 0, 1).applyQuaternion(fg.quaternion), halo: null, r };
  return { fg, a };
}
function lowerShellMesh(type) {
  const S = LOWER_SHELLS[type];
  return S.mesh ? S.mesh() : prismMesh('low_' + type, S.xz, S.h, 0.035, V2_SHELL);
}
function buildLower(g, item, out, reg) {
  const S = LOWER_SHELLS[item.type], body = BLOCKS.body;
  item.plug = 'bottom';
  const grp = new THREE.Group();
  const shell = lowerShellMesh(item.type);
  if (CUSTOM.color) shell.material = M(blockColor(body));
  grp.add(shell);
  // flat faces carry stickers (a fake "blk" with just those faces)
  const faces = {}, half = { top: S.top, bottom: -S.bottom, front: S.d / 2, back: S.d / 2, left: S.w / 2, right: S.w / 2 };
  for (const f of S.flat) { const fg = new THREE.Group(), fr = FACE_ROT[f]; fg.rotation.set(fr[0], fr[1], fr[2]); fg.translateZ(half[f] + 0.002); grp.add(fg); faces[f] = fg; }
  const blk = { group: grp, faces };
  if (BUILD_ROOT) {
    const bi = BODY_IDX++;
    if (item.type === 'wheels') { addQrStickers(blk, item, S.w, S.h, S.d); if (item === BUILD_ROOT) addPatch(blk, item, S.w, S.h, S.d, bi); }
    addStickerBomb(blk, item, Math.min(S.w, 0.9), S.h, Math.min(S.d, 0.9), bi);
  }
  // the hips sit where the old body's centre was, so the legs still reach the floor
  grp.position.copy(out).multiplyScalar(body.neck + body.size[1] / 2);
  g.add(grp);
  if (!(item === BUILD_ROOT && ROOT_BARE)) { joint(g, [0, 0, 0], 0.15, JOINT_COL); coupler(g, out, body.neck + body.size[1] / 2 + S.bottom); }
  if (reg) reg.blocks.push(grp);
  // the built-in legs: real leg models (they walk with IK and count as legs), registered as parts with no socket ref,
  // so the workbench grabs the whole lower half instead of one leg
  const legs = lowerLegItems(item);
  S.mounts.forEach(([face, x, y, z], i) => {
    const A = anchorAt(grp, face, new THREE.Vector3(x, y, z));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 14), M(COL.dark)); col.rotation.x = Math.PI / 2; col.position.z = 0.02; A.fg.add(col);
    const p = attachPart(A.a, legs[i], reg);
    p.userData.out = A.a.userData.out.clone(); p.userData.builtIn = true;
    if (reg) { reg.parts.push(p); reg.partOf.set(legs[i], p); reg.legs.push(p); }
  });
  // gem sockets on the front, opened at Mk II and Mk III
  syncGemSlots(item);
  (item.gems || []).forEach((gm, i) => {
    const gb = makeBlock(0.15, 0.15, 0.07, COL.dark, [{ face: 'front', r: 0.055 }]);
    const [x, y, z] = S.gems[i]; gb.group.position.set(x, y, z + 0.02); grp.add(gb.group);
    const ga = gb.anchors[0], gref = { owner: item, key: 'gems', i };
    if (reg) reg.sockets.push({ ref: gref, anchor: ga });
    if (gm) mount(ga, gm, gref, reg);
  });
  // the top: the torso plugs in here (an orange-ringed hole)
  const T = anchorAt(grp, 'top', new THREE.Vector3(0, S.top - 0.03, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 28), matSocket); ring.position.z = 0.03; T.fg.add(ring);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), M(0x1a1e22)); bore.position.z = 0.032; T.fg.add(bore);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  halo.scale.setScalar(0.2); halo.position.z = 0.05; halo.visible = false; T.fg.add(halo); T.a.userData.halo = halo; T.a.position.z = 0.03;
  const ti = FACE_ORDER.indexOf('top'), tref = { owner: item, key: 'slots', i: ti };
  if (reg) reg.sockets.push({ ref: tref, anchor: T.a });
  if (item.slots[ti]) mount(T.a, item.slots[ti], tref, reg);
}
/* An adapter: a small housing that plugs into a torso socket and carries 1 (L1) or 2 (L2) sockets of the converted type
   on its outer face. It is built in the robot's frame like every part, so its own sockets point the way the torso socket does. */
function buildAdapter(g, item, out, reg) {
  const A = ADAPTERS[item.type], n = Math.max(1, Math.min(2, item.lvl || 1)), toArm = A.to === 'arm';
  const o = out.clone().normalize();
  const lat = Math.abs(o.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const xa = lat.clone().cross(o).normalize();
  const hg = new THREE.Group(); hg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, lat, o)); g.add(hg);
  const gap = 0.5, H = 0.3, W = 0.42, Hh = W + (n - 1) * gap;
  hg.add(bx(W, Hh, H, V2_STEEL, 0, 0, H / 2));
  hg.add(bx(W + 0.04, Hh + 0.04, 0.05, toArm ? 0x3a6ea8 : 0xa8763a, 0, 0, 0.03));       // blue collar for arm sockets it makes, copper for module sockets
  const fq = hg.quaternion.clone();
  for (let i = 0; i < n; i++) {
    const fg = new THREE.Group(); fg.position.set(0, (i - (n - 1) / 2) * gap, H - 0.01); hg.add(fg);
    fg.add(toArm ? femaleArm() : femaleModule());
    const len = toArm ? ARM_LEN : MOD_LEN, a = new THREE.Object3D(); a.position.z = len; fg.add(a);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    halo.scale.setScalar(toArm ? 0.16 : 0.17); halo.position.z = (toArm ? RING.T : BOXC.T) + 0.01; halo.visible = false; fg.add(halo);
    a.userData = { fq: fq.clone(), out: o.clone(), halo, r: 0.2, accepts: A.to };
    const ref = { owner: item, key: 'slots', i };
    if (reg) reg.sockets.push({ ref, anchor: a });
    if (item.slots[i]) mount(a, item.slots[i], ref, reg);
  }
}
/* The torso: Luke's hull with the socket inserts removed, and his ring / square-recess connectors on its sockets. */
function buildUpper(g, item, out, reg) {
  const def = BLOCKS[item.type], [w, h, d] = def.size;
  item.plug = 'bottom';
  const blk = makeBlock(w, h, d, blockColor(def), [], 'plain');
  if (BUILD_ROOT) { const bi = BODY_IDX++; addStickerBomb(blk, item, w, h, d, bi); }
  const ext = Math.abs(out.x) * w / 2 + Math.abs(out.y) * h / 2 + Math.abs(out.z) * d / 2;
  blk.group.position.copy(out).multiplyScalar(def.neck + ext);
  g.add(blk.group);
  joint(g, [0, 0, 0], 0.15, JOINT_COL); coupler(g, out, def.neck);
  if (reg) reg.blocks.push(blk.group);
  const half = { left: w / 2, right: w / 2, front: d / 2, back: d / 2, top: h / 2, bottom: h / 2 };
  def.sockets.forEach((sk, i) => {
    const arm = sk.accepts === 'arm', len = arm ? ARM_LEN : MOD_LEN;
    // the socket's face frame: x/y along the face, +z out of it
    const fg = new THREE.Group(), fr = FACE_ROT[sk.face]; fg.rotation.set(fr[0], fr[1], fr[2]); blk.group.add(fg);
    fg.translateZ(half[sk.face] - 0.01); fg.translateX(sk.at[0]); fg.translateY(sk.at[1]);
    fg.add(arm ? femaleArm() : femaleModule());
    const a = new THREE.Object3D(); a.position.z = len; fg.add(a);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    halo.scale.setScalar(arm ? 0.16 : 0.17); halo.position.z = (arm ? RING.T : BOXC.T) + 0.01; halo.visible = false; fg.add(halo);
    a.userData = { fq: fg.quaternion.clone(), out: new THREE.Vector3(0, 0, 1).applyQuaternion(fg.quaternion), halo, r: 0.2, accepts: sk.accepts };
    const ref = { owner: item, key: 'slots', i };
    if (reg) reg.sockets.push({ ref, anchor: a });
    if (item.slots[i]) mount(a, item.slots[i], ref, reg);
  });
}
