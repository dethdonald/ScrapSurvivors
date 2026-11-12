'use strict';
/* Heightfield arena: terraced blocks, cliffs, stair-slopes, jump pads.
   Every inner cell is guaranteed reachable with default legs (steps of <= CLIMB). */
const GRID = 84, CELL = 3, HALF = GRID * CELL / 2, CLIMB = 3, NC = GRID * GRID, ENEMY_GRAV = 34;
const H = new Float32Array(NC);
const flow = new Float32Array(NC);
let padSet = new Set(), redPads = new Set();
const redPadMeshes = new Map();
const NB4 = [1, -1, GRID, -GRID];
const idxOf = (x, z) => { const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL); return (i < 0 || j < 0 || i >= GRID || j >= GRID) ? -1 : j * GRID + i; };
const groundAt = (x, z) => { const k = idxOf(x, z); return k < 0 ? 60 : H[k]; };
const cellX = k => (k % GRID) * CELL - HALF + CELL / 2;
const cellZ = k => Math.floor(k / GRID) * CELL - HALF + CELL / 2;
const inner = k => { const i = k % GRID, j = (k / GRID) | 0; return i > 0 && j > 0 && i < GRID - 1 && j < GRID - 1; };

function makeNoise(rng) {
  const N = 256, p = new Float32Array(N * N);
  for (let i = 0; i < p.length; i++) p[i] = rng();
  const g = (a, b) => p[((a & 255) * N) + (b & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), u), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), u), v);
  };
}

function genTerrain(seed) {
  const rng = mulberry32(seed);
  const n1 = makeNoise(rng), n2 = makeNoise(rng), n3 = makeNoise(rng);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const k = j * GRID + i;
    if (i === 0 || j === 0 || i === GRID - 1 || j === GRID - 1) { H[k] = 40; continue; }
    const base = n1(i / 13, j / 13) * 0.65 + n1(i / 6 + 40, j / 6 + 40) * 0.35;
    let t = Math.floor((base * 26 - 6) / 5) * 5;   // terraces 5 apart -> cliffs
    t += Math.floor(n2(i / 4.5, j / 4.5) * 3);     // 0..2 step slopes and bumps
    if (n3(i / 5, j / 5) > 0.83) t += 8;           // mesas and spires
    H[k] = Math.max(0, t);
  }
  // Connectivity repair: grow outward from the centre; where stuck, bend the cheapest neighbour into a stair.
  const vis = new Uint8Array(NC), q = [];
  const start = (GRID / 2 | 0) * GRID + (GRID / 2 | 0);
  vis[start] = 1; q.push(start);
  let head = 0;
  for (;;) {
    while (head < q.length) {
      const a = q[head++];
      for (const d of NB4) { const b = a + d; if (!vis[b] && inner(b) && Math.abs(H[b] - H[a]) <= CLIMB) { vis[b] = 1; q.push(b); } }
    }
    let best = -1, bd = 1e9, from = -1;
    for (const a of q) for (const d of NB4) { const b = a + d; if (!vis[b] && inner(b)) { const df = Math.abs(H[b] - H[a]); if (df < bd) { bd = df; best = b; from = a; } } }
    if (best < 0) break;
    H[best] = clamp(H[best], H[from] - CLIMB, H[from] + CLIMB);
    vis[best] = 1; q.push(best);
  }
  // Jump pads on low cells beside tall ground
  padSet = new Set();
  const cands = [];
  for (let k = 0; k < NC; k++) {
    if (!inner(k)) continue;
    const i = k % GRID, j = (k / GRID) | 0; let mx = 0;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const ii = i + di, jj = j + dj;
      if (ii > 0 && jj > 0 && ii < GRID - 1 && jj < GRID - 1) mx = Math.max(mx, H[jj * GRID + ii]);
    }
    if (mx - H[k] >= 7) cands.push(k);
  }
  for (let n = 0; n < 18 && cands.length; n++) padSet.add(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
  // rare red launch pads: one (sometimes two) per level, each good for one bonus drop
  redPads = new Set();
  const nRed = rng() < 0.3 ? 2 : 1;
  for (let n = 0; n < nRed && cands.length; n++) redPads.add(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
}

/* Every stage gets its own colour scheme: the ground in one hue and the sky in its complement. */
const LEVEL_PAL = { lo: new THREE.Color(0x36424c), mid: new THREE.Color(0x707568), hi: new THREE.Color(0xcfc09c), sky: new THREE.Color(SKY), hue: 0 };
function setLevelPalette() {
  const h = Math.random(), comp = (h + 0.5) % 1, sat = rand(0.16, 0.3);
  LEVEL_PAL.hue = h;
  LEVEL_PAL.lo.setHSL(h, sat * 0.8, 0.22);
  LEVEL_PAL.mid.setHSL((h + 0.04) % 1, sat, 0.42);
  LEVEL_PAL.hi.setHSL((h + 0.08) % 1, sat * 1.2, 0.68);
  LEVEL_PAL.sky.setHSL(comp, rand(0.25, 0.4), 0.2);           // the complementary hue, dark, for the sky and the haze
  scene.background.copy(LEVEL_PAL.sky); scene.fog.color.copy(LEVEL_PAL.sky);
  setLevelEnv(LEVEL_PAL.sky);
}
let terrainMesh = null, tileMesh = null;
const padMeshes = [];
/* Top tile: a bevelled panel that caps each column, leaving a thin dark seam between neighbours. */
let tileGeo = null;
function getTileGeo() {
  if (tileGeo) return tileGeo;
  const s = CELL / 2 - 0.2, sh = new THREE.Shape();
  sh.moveTo(-s, -s); sh.lineTo(s, -s); sh.lineTo(s, s); sh.lineTo(-s, s); sh.lineTo(-s, -s);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.13, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.computeBoundingBox(); g.translate(0, -g.boundingBox.max.y, 0);   // top face at y = 0
  return tileGeo = g;
}
function buildTerrainMesh() {
  if (terrainMesh) { scene.remove(terrainMesh); if (terrainMesh.material) terrainMesh.material.dispose(); }
  if (tileMesh) { scene.remove(tileMesh); tileMesh.material.dispose(); }
  padMeshes.forEach(m => scene.remove(m)); padMeshes.length = 0;
  const im = new THREE.InstancedMesh(geoBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), NC);
  const Mx = new THREE.Matrix4(), c = new THREE.Color();
  const lo = LEVEL_PAL.lo, mid = LEVEL_PAL.mid, hi = LEVEL_PAL.hi, wall = LEVEL_PAL.lo.clone().multiplyScalar(0.55);
  const tiles = new THREE.InstancedMesh(getTileGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), NC);
  for (let k = 0; k < NC; k++) {
    const h = H[k], base = -10, top = h - 0.12;          // the column stops just under its tile
    Mx.makeScale(CELL, top - base, CELL);
    Mx.setPosition(cellX(k), (top + base) / 2, cellZ(k));
    im.setMatrixAt(k, Mx);
    Mx.makeTranslation(cellX(k), h, cellZ(k));
    tiles.setMatrixAt(k, Mx);
    if (!inner(k)) c.copy(wall);
    else {
      const t = clamp(h / 26, 0, 1);
      if (t < 0.5) c.copy(lo).lerp(mid, t * 2); else c.copy(mid).lerp(hi, (t - 0.5) * 2);
      const i = k % GRID, j = (k / GRID) | 0;
      c.multiplyScalar(((i + j) & 1) ? 1 : 0.92);
    }
    tiles.setColorAt(k, c);
    im.setColorAt(k, c.multiplyScalar(0.62));            // darker walls and seams under the lighter tiles
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  tiles.instanceMatrix.needsUpdate = true; if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  if (typeof wdApplyTerrain === 'function') wdApplyTerrain(im.material, tiles.material);     // weathering (see worlddetail.js)
  scene.add(im); terrainMesh = im;
  // the cap tiles sit flush on top of their columns, and the columns already cast the very same shadow:
  // keeping the 7,056 bevelled caps out of the shadow map saves ~200k triangles a frame for no visible change
  tiles.userData.noShadow = true;
  scene.add(tiles); tiles.castShadow = false; tileMesh = tiles;
  redPadMeshes.forEach(m => scene.remove(m)); redPadMeshes.clear();
  for (const k of redPads) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geoBox, new THREE.MeshLambertMaterial({ color: 0xff3a3a, emissive: 0x801010 }));
    m.scale.set(CELL * 0.8, 0.22, CELL * 0.8); m.position.y = 0.11; g.add(m);
    const ch = bx(CELL * 0.4, 0.04, 0.3, 0xffe0e0, 0, 0.24, 0, 0x803030); g.add(ch);     // an up-arrow stripe
    const ch2 = bx(0.3, 0.04, CELL * 0.4, 0xffe0e0, 0, 0.24, 0, 0x803030); g.add(ch2);
    const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.18, depthWrite: false })); beam.scale.set(0.5, 30, 0.5); beam.position.y = 15; g.add(beam);
    g.position.set(cellX(k), H[k], cellZ(k)); scene.add(g); redPadMeshes.set(k, g);
  }
  for (const k of padSet) {
    const m = new THREE.Mesh(geoBox, new THREE.MeshLambertMaterial({ color: COL.cyan, emissive: 0x2a9aa0 }));
    m.scale.set(CELL * 0.8, 0.18, CELL * 0.8); m.position.set(cellX(k), H[k] + 0.09, cellZ(k));
    scene.add(m); padMeshes.push(m);
  }
}

/* Path distance for ground enemies (cells), from the player's cell. */
function computeFlow(px, pz) {
  flow.fill(1e9);
  const p = idxOf(px, pz); if (p < 0 || !inner(p)) return;
  const q = [p]; flow[p] = 0; let head = 0;
  while (head < q.length) {
    const b = q[head++];
    for (const d of NB4) { const a = b + d; if (inner(a) && flow[a] > flow[b] + 1 && H[b] - H[a] <= CLIMB) { flow[a] = flow[b] + 1; q.push(a); } }
  }
}

/* Collision helpers shared by player and enemies */
const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
function blockedAt(x, z, y, r, step = 1.1) { for (const o of OFFS) if (groundAt(x + o[0] * r, z + o[1] * r) > y + step) return true; return false; }
function maxGroundAround(x, z, r) { let m = groundAt(x, z); for (const o of OFFS) m = Math.max(m, groundAt(x + o[0] * r, z + o[1] * r)); return m; }
function footGround(b, step = 1.1) {
  let g = groundAt(b.pos.x, b.pos.z); const r = b.r * 0.5;
  for (let i = 0; i < 4; i++) { const v = groundAt(b.pos.x + OFFS[i][0] * r, b.pos.z + OFFS[i][1] * r); if (v <= b.pos.y + step && v > g) g = v; }
  return g;
}
/* Push a round body out of any terrain column taller than y + step (circle vs square cells).
   Moving freely then pushing out means a body that is already touching a wall can still slide along it
   or back away, instead of every move being refused (the old "sticky wall" problem).
   Returns the summed push normal {x, z} (zero if nothing was touched). */
const _pn = { x: 0, z: 0 };
function pushOutTerrain(b, r, step) {
  _pn.x = 0; _pn.z = 0;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    const i0 = Math.floor((b.pos.x - r + HALF) / CELL), i1 = Math.floor((b.pos.x + r + HALF) / CELL);
    const j0 = Math.floor((b.pos.z - r + HALF) / CELL), j1 = Math.floor((b.pos.z + r + HALF) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = (i < 0 || j < 0 || i >= GRID || j >= GRID) ? 60 : H[j * GRID + i];
      if (h <= b.pos.y + step) continue;
      const x0 = i * CELL - HALF, x1 = x0 + CELL, z0 = j * CELL - HALF, z1 = z0 + CELL;
      const cx = clamp(b.pos.x, x0, x1), cz = clamp(b.pos.z, z0, z1);
      let dx = b.pos.x - cx, dz = b.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let ux, uz, push;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); ux = dx / d; uz = dz / d; push = r - d; }
      else {   // centre is inside the column: leave by the nearest side
        const l = b.pos.x - x0, rr = x1 - b.pos.x, n = b.pos.z - z0, s = z1 - b.pos.z, m = Math.min(l, rr, n, s);
        if (m === l) { ux = -1; uz = 0; } else if (m === rr) { ux = 1; uz = 0; } else if (m === n) { ux = 0; uz = -1; } else { ux = 0; uz = 1; }
        push = m + r;
      }
      b.pos.x += ux * (push + 1e-4); b.pos.z += uz * (push + 1e-4);
      _pn.x += ux; _pn.z += uz; moved = true;
    }
    if (!moved) break;
  }
  const l = Math.hypot(_pn.x, _pn.z); if (l > 0) { _pn.x /= l; _pn.z /= l; }
  return _pn;
}
/* Remove the part of a velocity that runs into a wall normal (with optional bounce). */
function clipVel(v, n, bounce = 0) {
  if (!n.x && !n.z) return false;
  const vn = v.x * n.x + v.z * n.z;
  if (vn < 0) { v.x -= (1 + bounce) * vn * n.x; v.z -= (1 + bounce) * vn * n.z; }
  return true;
}
/* Simple body integration for enemies */
function moveBody(b, dt) {
  b.bumped = false; b.landed = false;
  const nx = b.pos.x + b.vel.x * dt; if (!blockedAt(nx, b.pos.z, b.pos.y, b.r)) b.pos.x = nx; else { b.vel.x = 0; b.bumped = true; }
  const nz = b.pos.z + b.vel.z * dt; if (!blockedAt(b.pos.x, nz, b.pos.y, b.r)) b.pos.z = nz; else { b.vel.z = 0; b.bumped = true; }
  b.vel.y -= ENEMY_GRAV * dt; b.pos.y += b.vel.y * dt;
  const g = footGround(b);
  if (b.pos.y <= g) { if (!b.onGround) b.landed = true; b.pos.y = g; if (b.vel.y < 0) b.vel.y = 0; b.onGround = true; }
  else if (b.onGround && b.vel.y <= 0 && b.pos.y - g < 0.25) { b.pos.y = g; b.vel.y = 0; }
  else b.onGround = false;
}
const jumpVE = h => Math.sqrt(2 * ENEMY_GRAV * Math.max(0.1, h));

/* Ray march against the heightfield. Returns distance or -1. */
function rayTerrain(o, d, t0, maxT) {
  let prev = t0;
  for (let t = t0; t <= maxT; t += 0.4) {
    if (o.y + d.y * t < groundAt(o.x + d.x * t, o.z + d.z * t)) {
      let a = prev, b = t;
      for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (o.y + d.y * m < groundAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return a;
    }
    prev = t;
  }
  return -1;
}
