/* ============================================================
   ARENA POLISH (Chunk 11)
   - SPECTATORS: low-detail booths set into the inner face of the four outer walls. Each booth is a dark frame, a
     back panel, 2-4 little robots and a pane of see-through glass. Everything is instanced (6 draw calls for the lot),
     the robots only idle (bob) and turn their heads toward you, no AI, no physics, no collision (the arena
     is still the heightmap and nothing here touches it, so navigation and spawn access are unchanged).
   - DEATH CELEBRATION: when the frame goes down the nearest few survivors hop and chirp. Capped (CELE_MAX hoppers,
     CHIRP_MAX chirps per second) and it only lasts while the wreck tumbles.
   - OVERTIME FIRE: edge flames drawn with CSS (compositor-only), see ui.js.
   ============================================================ */
const SPEC_STEP = 14, SPEC_Y = 28, SPEC_W = 6.4, SPEC_H = 5.6, SPEC_FAR = 140;
const SPEC_COLS = [0xd2435a, 0x9a5ad8, 0xe0784a, 0xf2b230, 0x58cfd6, 0x8c96a0];
const SPEC = { group: null, booths: [], bodies: null, heads: null, eyes: null, n: 0, frame: 0, hop: 0, red: false };
const _spM = new THREE.Matrix4(), _spQ = new THREE.Quaternion(), _spP = new THREE.Vector3(), _spS = new THREE.Vector3(), _spE = new THREE.Euler(), _spC = new THREE.Color();

function clearSpectators() {
  if (SPEC.group) { scene.remove(SPEC.group); SPEC.group.traverse(o => { if (o.material) o.material.dispose(); }); }
  SPEC.group = null; SPEC.booths = []; SPEC.n = 0; SPEC.hop = 0;
}
function buildSpectators() {
  clearSpectators();
  const rng = mulberry32(((H[GRID * GRID / 2 + GRID / 2] || 1) * 7919 + 13) | 0), g = new THREE.Group();
  const inner = HALF - CELL;                               // the inner face of the outer wall
  const sides = [{ nx: 1, nz: 0, x: -inner, along: 'z' }, { nx: -1, nz: 0, x: inner, along: 'z' }, { nx: 0, nz: 1, z: -inner, along: 'x' }, { nx: 0, nz: -1, z: inner, along: 'x' }];
  for (const sd of sides) for (let a = -HALF + 24; a <= HALF - 24; a += SPEC_STEP) {
    const px = sd.along === 'z' ? sd.x : a, pz = sd.along === 'z' ? a : sd.z;
    // skip booths where tall ground rises up to (or past) the booth: they'd sit inside the terrain
    let hi = 0; for (let d = 1; d <= 3; d++) for (let o = -1; o <= 1; o++) hi = Math.max(hi, groundAt(px + sd.nx * (d * CELL) + (sd.along === 'x' ? o * 3 : 0), pz + sd.nz * (d * CELL) + (sd.along === 'z' ? o * 3 : 0)));
    if (hi > SPEC_Y - 1.5) continue;
    const n = 2 + (rng() * 3 | 0), cast = [];
    for (let i = 0; i < n; i++) cast.push({ u: (i + 0.5) / n * 2 - 1, s: 0.8 + rng() * 0.55, ph: rng() * 6.28, col: SPEC_COLS[(rng() * SPEC_COLS.length) | 0], big: rng() < 0.2, yaw: 0, pit: 0 });
    SPEC.booths.push({ px, pz, nx: sd.nx, nz: sd.nz, cast, ry: Math.atan2(sd.nx, sd.nz) });
  }
  const nb = SPEC.booths.length; if (!nb) return;
  const total = SPEC.booths.reduce((s, b) => s + b.cast.length, 0); SPEC.n = total;
  const frame = new THREE.InstancedMesh(geoBox, new THREE.MeshLambertMaterial({ color: 0x14181d }), nb);
  const panel = new THREE.InstancedMesh(geoBox, new THREE.MeshBasicMaterial({ color: 0x23323d }), nb);
  const glass = new THREE.InstancedMesh(geoBox, new THREE.MeshBasicMaterial({ color: 0x9fe9ff, transparent: true, opacity: 0.16, depthWrite: false }), nb);
  SPEC.bodies = new THREE.InstancedMesh(geoBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), total);
  SPEC.heads = new THREE.InstancedMesh(geoBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), total);
  SPEC.eyes = new THREE.InstancedMesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
  glass.renderOrder = 5;
  [SPEC.bodies, SPEC.heads, SPEC.eyes].forEach(m => { m.frustumCulled = false; });
  let k = 0;
  SPEC.booths.forEach((b, bi) => {
    _spQ.setFromEuler(_spE.set(0, b.ry, 0));
    // booth layers, deepest first: frame (flush with the wall face), panel, spectators, glass in front
    const at = d => _spP.set(b.px + b.nx * d, SPEC_Y + SPEC_H / 2, b.pz + b.nz * d);
    frame.setMatrixAt(bi, _spM.compose(at(0.2), _spQ, _spS.set(SPEC_W + 0.8, SPEC_H + 0.8, 0.4)));
    panel.setMatrixAt(bi, _spM.compose(at(0.45), _spQ, _spS.set(SPEC_W, SPEC_H, 0.1)));
    glass.setMatrixAt(bi, _spM.compose(at(1.0), _spQ, _spS.set(SPEC_W, SPEC_H, 0.06)));
    for (const c of b.cast) { c.i = k; SPEC.bodies.setColorAt(k, _spC.setHex(c.col)); SPEC.heads.setColorAt(k, _spC.setHex(c.col).multiplyScalar(0.8)); SPEC.eyes.setColorAt(k, _spC.setHex(0x9fe9ff)); k++; }
  });
  [frame, panel, glass].forEach(m => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; g.add(m); });
  g.add(SPEC.bodies, SPEC.heads, SPEC.eyes);
  scene.add(g); SPEC.group = g; SPEC.red = false; SPEC.frame = 0;
  updateSpectators(0, true);
}
/* idle bob + head turn toward you; booths further than SPEC_FAR just freeze, and the rest update every other frame */
function updateSpectators(dt, force) {
  if (!SPEC.group || !SPEC.n) return;
  if (!force && (++SPEC.frame & 1)) return;
  const t = performance.now() / 1000, pp = player.pos, hopping = SPEC.hop > 0; if (hopping) SPEC.hop -= dt * 2;
  const red = typeof overtime === 'function' && overtime() > 0;
  if (red !== SPEC.red) { SPEC.red = red; for (let i = 0; i < SPEC.n; i++) SPEC.eyes.setColorAt(i, _spC.setHex(red ? 0xff3a2a : 0x9fe9ff)); if (SPEC.eyes.instanceColor) SPEC.eyes.instanceColor.needsUpdate = true; }
  if (SPEC.bodies.instanceColor && !SPEC.colDone) { SPEC.colDone = true; SPEC.bodies.instanceColor.needsUpdate = SPEC.heads.instanceColor.needsUpdate = true; if (SPEC.eyes.instanceColor) SPEC.eyes.instanceColor.needsUpdate = true; }
  for (const b of SPEC.booths) {
    const dx = pp.x - b.px, dz = pp.z - b.pz;
    if (!force && dx * dx + dz * dz > SPEC_FAR * SPEC_FAR) continue;
    const tx = -b.nz, tz = b.nx;                                   // along the wall
    for (const c of b.cast) {
      const s = c.s * (c.big ? 1.3 : 1), floor = SPEC_Y + 0.55 + (c.big ? 0.15 : 0);
      const bob = Math.sin(t * 2.2 + c.ph) * 0.05 + (hopping ? Math.abs(Math.sin(t * 7 + c.ph)) * 0.9 : 0);
      const lat = c.u * (SPEC_W / 2 - 0.9), bx = b.px + b.nx * 0.7 + tx * lat, bz = b.pz + b.nz * 0.7 + tz * lat;
      // head turn: yaw relative to facing out of the wall, limited so nobody breaks their neck; pitch up towards the player
      const wx = pp.x - bx, wz = pp.z - bz, ang = Math.atan2(wx, wz) - b.ry;
      let tyaw = Math.atan2(Math.sin(ang), Math.cos(ang)); tyaw = clamp(tyaw, -1.1, 1.1) + Math.sin(t * 0.7 + c.ph) * 0.08;
      const hd = Math.hypot(wx, wz), tpit = -clamp(Math.atan2(pp.y + 1.3 - (floor + 1.2), hd), -0.2, 0.6);
      c.yaw += (tyaw - c.yaw) * 0.18; c.pit += (tpit - c.pit) * 0.18;
      _spQ.setFromEuler(_spE.set(0, b.ry, 0));
      SPEC.bodies.setMatrixAt(c.i, _spM.compose(_spP.set(bx, floor + 0.5 * s + bob, bz), _spQ, _spS.set(0.9 * s, 1.0 * s, 0.7 * s)));
      _spQ.setFromEuler(_spE.set(c.pit, b.ry + c.yaw, 0, 'YXZ'));
      const hy = floor + 1.35 * s + bob;
      SPEC.heads.setMatrixAt(c.i, _spM.compose(_spP.set(bx, hy, bz), _spQ, _spS.set(0.68 * s, 0.58 * s, 0.6 * s)));
      // the eye bar sits on the face, in the head's own frame
      _spP.set(0, 0.04 * s, 0.31 * s).applyQuaternion(_spQ); _spP.x += bx; _spP.y += hy; _spP.z += bz;
      SPEC.eyes.setMatrixAt(c.i, _spM.compose(_spP, _spQ, _spS.set(0.5 * s, 0.1 * s, 0.05)));
    }
  }
  SPEC.bodies.instanceMatrix.needsUpdate = SPEC.heads.instanceMatrix.needsUpdate = SPEC.eyes.instanceMatrix.needsUpdate = true;
}

/* ---------- death celebration ---------- */
const CELE_MAX = 12, CELE_RANGE = 70, CHIRP_MAX = 5, CELE = { chirps: 0, t: 0 };
function startCelebration() {
  const pp = player.pos, pool = [];
  for (const e of enemies) {
    if (e.dead || e.boss || e.held || e.attach || e.d.npc || e.type === 'sac') continue;
    const d2 = (e.pos.x - pp.x) ** 2 + (e.pos.z - pp.z) ** 2; if (d2 > CELE_RANGE * CELE_RANGE) continue;
    pool.push([d2, e]);
  }
  pool.sort((a, b) => a[0] - b[0]);
  pool.forEach(([, e], i) => { if (i < CELE_MAX) e.cele = { t: Math.random() * 0.4, y: e.pos.y, quiet: false }; else e.cele = { t: 1e9, y: e.pos.y, quiet: true }; });     // the rest just stop and watch
  SPEC.hop = 1;
  CELE.chirps = 0; CELE.t = 0;
}
function celeTick(e, dt) {
  const c = e.cele; c.t -= dt;
  if (c.quiet) return;
  if (c.t > 0) return;
  c.t = 0.35 + Math.random() * 0.35;
  if (e.d.fly) { e.bob += 1.2; }
  else if (e.onGround && e.stun <= 0) { e.vel.y = jumpVE(1.3 + Math.random() * 1.2); e.onGround = false; e.sqV = (e.sqV || 0) + 1.4; }
  const now = performance.now() / 1000; if (now - CELE.t >= 1) { CELE.t = now; CELE.chirps = 0; }
  if (CELE.chirps < CHIRP_MAX) { CELE.chirps++; sfx('chirp', 0.35); }
}
