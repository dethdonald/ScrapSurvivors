/* ---------- destructible crust (test level) ----------
   Voxel destruction on top of an arena that is not made of voxels.

   The trick is that nothing is cubed until it is hit. A wall stands as the single stretched box it has
   always been; the moment a round lands on one of its faces that face is "chunkified" - the column is
   pulled back by the depth of the crust, and the slab of space that opens up is filled with cubes,
   three layers deep, minus the ones the shot just took. From then on that face is real voxels: every
   hit knocks out more, holes have stepped cube edges and a visible thickness, and what comes off
   tumbles away as debris.

   Two things keep it cheap. Cost follows how much you have shot, not how big the arena is - cubing the
   whole bowl up front would be millions of instances. And only cubes with nothing in front of them are
   drawn, so the three layers cost nothing until something digs into them.

   Because only the outer crust is ever removed, the shape the game collides and paths against never
   changes: H, the flow field, the physics ring and the props all see the arena they always saw.

   Everything is behind CRUST.on, which only the arena_d level sets. */
let CUBE = 0.25;                 // cube edge: twelve across a 3 m cell
const CUBE_LOW = 0.5;            // on the low graphics preset, a quarter as many
const LAYERS = 3;                // how deep the crust goes
let SUB = 12;                    // cubes across one cell face
let SIDE_ROWS = 24;              // how far down a wall gets cubed (6 m at 0.25 m cubes)
const CRUST_MAXI = 90000;        // shell instance budget
const DEB_MAX = 420;             // cubes in the air at once

const CRUST = {
  on: false, mesh: null, geo: null, mat: null,
  cells: null,                   // cell index -> { faces, vox, slots }
  free: [], top: 0, lo: 1e9, hi: -1, full: false,
  deb: null, debGeo: null, debMesh: null, debMat: null, dust: null,
  gone: 0, cubed: 0,
};

/* voxel numbering inside one cell: the top face first, then the four sides, each one layer at a time */
const F_TOP = 0, F_XP = 1, F_XM = 2, F_ZP = 3, F_ZM = 4;
let TOPL = 144, SIDEL = 288, TOPN = 432, SIDEN = 864, VOXN = 3888;
function vxCounts() {
  TOPL = SUB * SUB;              // one layer of the top face
  SIDEL = SUB * SIDE_ROWS;       // one layer of a side face
  TOPN = TOPL * LAYERS;
  SIDEN = SIDEL * LAYERS;
  VOXN = TOPN + 4 * SIDEN;
}
const sideBase = f => TOPN + (f - 1) * SIDEN;
/* the voxel one layer deeper, directly behind this one */
function deeper(vi) {
  if (vi < TOPN) return (vi + TOPL < TOPN) ? vi + TOPL : -1;
  const b = sideBase(1 + (((vi - TOPN) / SIDEN) | 0)), i = vi - b;
  return (i + SIDEL < SIDEN) ? vi + SIDEL : -1;
}

const _cuM = new THREE.Matrix4(), _cuC = new THREE.Color(), _cuV = new THREE.Vector3(),
      _cuDeb = new THREE.Vector3();

/* ---------- where a voxel sits in the world ---------- */
function voxPos(k, vi, out) {
  const x0 = cellX(k) - CELL / 2, z0 = cellZ(k) - CELL / 2, h = H[k];
  if (vi < TOPN) {
    const L = (vi / TOPL) | 0, i = vi % TOPL, c = i % SUB, r = (i / SUB) | 0;
    out.set(x0 + (c + 0.5) * CUBE, h - (L + 0.5) * CUBE, z0 + (r + 0.5) * CUBE);
    return out;
  }
  const f = 1 + (((vi - TOPN) / SIDEN) | 0), rel = (vi - TOPN) % SIDEN;
  const L = (rel / SIDEL) | 0, i = rel % SIDEL, col = i % SUB, row = (i / SUB) | 0;
  const y = h - LAYERS * CUBE - (row + 0.5) * CUBE;
  const d = (L + 0.5) * CUBE;
  if (f === F_XP) out.set(x0 + CELL - d, y, z0 + (col + 0.5) * CUBE);
  else if (f === F_XM) out.set(x0 + d, y, z0 + (col + 0.5) * CUBE);
  else if (f === F_ZP) out.set(x0 + (col + 0.5) * CUBE, y, z0 + CELL - d);
  else out.set(x0 + (col + 0.5) * CUBE, y, z0 + d);
  return out;
}

/* how far down a side face is worth cubing: to the neighbour's height, capped */
function sideRows(k, f) {
  const i = k % GRID, j = (k / GRID) | 0;
  let ni = i, nj = j;
  if (f === F_XP) ni++; else if (f === F_XM) ni--; else if (f === F_ZP) nj++; else nj--;
  const nh = (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) ? -10 : H[nj * GRID + ni];
  const dh = H[k] - LAYERS * CUBE - nh;
  return Math.max(0, Math.min(SIDE_ROWS, Math.ceil(dh / CUBE)));
}

/* ---------- setting up ---------- */
function crustBuild() {
  crustClear();
  CUBE = (typeof SETTINGS === 'object' && SETTINGS.gfx === 'low') ? CUBE_LOW : 0.25;
  SUB = Math.round(CELL / CUBE);
  SIDE_ROWS = Math.round(6 / CUBE);
  vxCounts();
  CRUST.cells = new Map();
  CRUST.free = []; CRUST.top = 0; CRUST.gone = 0; CRUST.cubed = 0; CRUST.full = false;

  CRUST.geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
  CRUST.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (typeof wdApplyTerrain === 'function') wdApplyTerrain(CRUST.mat, CRUST.mat);
  const im = new THREE.InstancedMesh(CRUST.geo, CRUST.mat, CRUST_MAXI);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the colour attribute has to exist before the first draw, or the shader compiles without it and
  // every cube comes out white however many times setColorAt is called afterwards
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CRUST_MAXI * 3).fill(1), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
  im.count = 0;
  scene.add(im); CRUST.mesh = im;

  crustDebInit();
  // The shared pools are all opaque, and opaque dust at this size reads as a pile of cream boxes.
  // This one is the same pool class with a see-through material.
  CRUST.dust = new ParticlePool(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false }), 2600);
  CRUST.on = true;
}

/* put every column we pulled back where it was, and its cap tile with it */
function crustRestore() {
  if (!CRUST.cells || !terrainMesh) return;
  const M = new THREE.Matrix4();
  for (const [k] of CRUST.cells) {
    const base = -10, top = H[k] - 0.12;
    M.makeScale(CELL, top - base, CELL); M.setPosition(cellX(k), (top + base) / 2, cellZ(k));
    terrainMesh.setMatrixAt(k, M);
    if (typeof tileMesh !== 'undefined' && tileMesh) {
      M.makeTranslation(cellX(k), H[k], cellZ(k));
      tileMesh.setMatrixAt(k, M);
    }
  }
  terrainMesh.instanceMatrix.needsUpdate = true;
  if (typeof tileMesh !== 'undefined' && tileMesh) tileMesh.instanceMatrix.needsUpdate = true;
}

function crustClear() {
  crustRestore();
  if (CRUST.mesh) { scene.remove(CRUST.mesh); CRUST.mesh.dispose(); }
  if (CRUST.geo) CRUST.geo.dispose();
  if (CRUST.debMesh) { scene.remove(CRUST.debMesh); CRUST.debMesh.dispose(); }
  if (CRUST.debGeo) CRUST.debGeo.dispose();
  if (CRUST.debMat) CRUST.debMat.dispose();
  if (CRUST.dust) { CRUST.dust.clear(); scene.remove(CRUST.dust.im); CRUST.dust.im.material.dispose(); CRUST.dust.im.dispose(); CRUST.dust = null; }
  CRUST.on = false; CRUST.mesh = null; CRUST.geo = null; CRUST.mat = null;
  CRUST.debMesh = null; CRUST.debGeo = null; CRUST.debMat = null;
  CRUST.cells = null; CRUST.free = []; CRUST.top = 0; CRUST.lo = 1e9; CRUST.hi = -1;
}

/* ---------- chunkifying one cell ----------
   The column is pulled back by the full crust depth on every face that has been hit, and the slab that
   opens up is filled with cubes. Pulling the column back is what gives a hole real depth. */
function cellOf(k) {
  let c = CRUST.cells.get(k);
  if (!c) {
    c = { faces: 0, rusted: 0, vox: new Uint8Array(VOXN), slots: new Int32Array(VOXN).fill(-1) };
    CRUST.cells.set(k, c);
  }
  return c;
}

function crustShrink(k, c) {
  if (!terrainMesh) return;
  const D = LAYERS * CUBE;
  const xm = (c.faces & (1 << F_XM)) ? D : 0, xp = (c.faces & (1 << F_XP)) ? D : 0;
  const zm = (c.faces & (1 << F_ZM)) ? D : 0, zp = (c.faces & (1 << F_ZP)) ? D : 0;
  const topCut = (c.faces & (1 << F_TOP)) ? D : 0;
  // with the top cubed the shell covers the last D metres exactly, so the column stops flush with it
  const base = -10, top = H[k] - (topCut ? D : 0.12);
  const w = CELL - xm - xp, d = CELL - zm - zp;
  _cuM.makeScale(Math.max(0.01, w), top - base, Math.max(0.01, d));
  _cuM.setPosition(cellX(k) + (xm - xp) / 2, (top + base) / 2, cellZ(k) + (zm - zp) / 2);
  terrainMesh.setMatrixAt(k, _cuM);
  terrainMesh.instanceMatrix.needsUpdate = true;
  if (topCut && typeof tileMesh !== 'undefined' && tileMesh) {       // the cap tile is now cubes
    _cuM.makeScale(0, 0, 0); _cuM.setPosition(0, -1000, 0);
    tileMesh.setMatrixAt(k, _cuM);
    tileMesh.instanceMatrix.needsUpdate = true;
  }
}

function voxColour(k, vi, out) {
  const top = vi < TOPN, y = H[k];
  const t = clamp(y / 26, 0, 1);
  if (t < 0.5) out.copy(LEVEL_PAL.lo).lerp(LEVEL_PAL.mid, t * 2);
  else out.copy(LEVEL_PAL.mid).lerp(LEVEL_PAL.hi, (t - 0.5) * 2);
  const i = k % GRID, j = (k / GRID) | 0;
  if (!inner(k)) out.copy(LEVEL_PAL.lo).multiplyScalar(0.55);
  else {
    out.multiplyScalar(((i + j) & 1) ? 1 : 0.92);
    if (!top) out.multiplyScalar(0.7);
  }
  // the deeper layers are closer to the bare metal below them
  const L = vi < TOPN ? ((vi / TOPL) | 0) : (((vi - TOPN) % SIDEN) / SIDEL) | 0;
  if (L) out.lerp(RUST, L / LAYERS * 0.6);
  return out;
}
const RUST = new THREE.Color(0xa06b43);

function voxShow(k, c, vi) {
  if (c.vox[vi] || c.slots[vi] >= 0) return;
  const slot = CRUST.free.length ? CRUST.free.pop() : (CRUST.top < CRUST_MAXI ? CRUST.top++ : -1);
  if (slot < 0) { CRUST.full = true; return; }
  c.slots[vi] = slot;
  voxPos(k, vi, _cuV);
  _cuM.makeTranslation(_cuV.x, _cuV.y, _cuV.z);
  CRUST.mesh.setMatrixAt(slot, _cuM);
  CRUST.mesh.setColorAt(slot, voxColour(k, vi, _cuC));
  if (slot >= CRUST.mesh.count) CRUST.mesh.count = slot + 1;
  if (slot < CRUST.lo) CRUST.lo = slot;
  if (slot > CRUST.hi) CRUST.hi = slot;
}

const _cuHide = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -1000, 0);
function voxHide(c, vi) {
  const slot = c.slots[vi];
  if (slot < 0) return;
  CRUST.mesh.setMatrixAt(slot, _cuHide);
  CRUST.free.push(slot); c.slots[vi] = -1;
  if (slot < CRUST.lo) CRUST.lo = slot;
  if (slot > CRUST.hi) CRUST.hi = slot;
}

/* turn one face of a cell into cubes: only the outermost layer is drawn, the two behind it wait */
function chunkify(k, f) {
  const c = cellOf(k);
  if (c.faces & (1 << f)) return c;
  c.faces |= (1 << f);
  CRUST.cubed++;
  crustShrink(k, c);
  if (!c.rusted) {                       // what shows through a hole is bare rusted metal, not paint
    c.rusted = 1;
    const n = ((k * 7) % 11) / 11;
    _cuC.copy(RUST).multiplyScalar(0.8 + n * 0.4);
    terrainMesh.setColorAt(k, _cuC);
    if (terrainMesh.instanceColor) terrainMesh.instanceColor.needsUpdate = true;
  }
  if (f === F_TOP) for (let i = 0; i < TOPL; i++) voxShow(k, c, i);
  else {
    const rows = sideRows(k, f), b = sideBase(f);
    for (let r = 0; r < rows; r++) for (let col = 0; col < SUB; col++) voxShow(k, c, b + r * SUB + col);
  }
  return c;
}

/* ---------- taking a hit ---------- */
function crustHit(p, radius, opts) {
  if (!CRUST.on || !CRUST.mesh) return 0;
  const o = opts || {};
  const r2 = radius * radius, D = LAYERS * CUBE;
  const i0 = Math.max(0, Math.floor((p.x - radius - D + HALF) / CELL)), i1 = Math.min(GRID - 1, Math.floor((p.x + radius + D + HALF) / CELL));
  const j0 = Math.max(0, Math.floor((p.z - radius - D + HALF) / CELL)), j1 = Math.min(GRID - 1, Math.floor((p.z + radius + D + HALF) / CELL));
  let killed = 0, debris = o.debris === undefined ? 10 : o.debris;
  let nearest = -1, nk = -1, nd = 1e9;

  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * GRID + i, h = H[k];
    if (p.y - radius > h + CUBE) continue;                     // the blast is above this column entirely
    const faces = [F_TOP, p.x > cellX(k) ? F_XP : F_XM, p.z > cellZ(k) ? F_ZP : F_ZM];

    for (const f of faces) {
      const c0 = CRUST.cells.get(k);
      const already = c0 && (c0.faces & (1 << f));
      if (!already) {                                          // only cube a face the blast touches
        if (f === F_TOP) {
          const px = clamp(p.x, cellX(k) - CELL / 2, cellX(k) + CELL / 2) - p.x;
          const py = h - CUBE / 2 - p.y;
          const pz = clamp(p.z, cellZ(k) - CELL / 2, cellZ(k) + CELL / 2) - p.z;
          if (px * px + py * py + pz * pz > r2) continue;
        } else {
          if (sideRows(k, f) === 0) continue;
          const fx = f === F_XP ? cellX(k) + CELL / 2 : f === F_XM ? cellX(k) - CELL / 2 : clamp(p.x, cellX(k) - CELL / 2, cellX(k) + CELL / 2);
          const fz = f === F_ZP ? cellZ(k) + CELL / 2 : f === F_ZM ? cellZ(k) - CELL / 2 : clamp(p.z, cellZ(k) - CELL / 2, cellZ(k) + CELL / 2);
          const fy = clamp(p.y, h - D - SIDE_ROWS * CUBE, h - D);
          const dx = fx - p.x, dy = fy - p.y, dz = fz - p.z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
        }
      }
      const c = already ? c0 : chunkify(k, f);

      // only walk the slice of the face the blast can reach
      const x0 = cellX(k) - CELL / 2, z0 = cellZ(k) - CELL / 2;
      let cLo = 0, cHi = SUB - 1, rLo = 0, rHi = (f === F_TOP ? SUB : SIDE_ROWS) - 1;
      if (f === F_TOP) {
        cLo = Math.max(0, Math.floor((p.x - radius - x0) / CUBE)); cHi = Math.min(SUB - 1, Math.ceil((p.x + radius - x0) / CUBE));
        rLo = Math.max(0, Math.floor((p.z - radius - z0) / CUBE)); rHi = Math.min(SUB - 1, Math.ceil((p.z + radius - z0) / CUBE));
      } else {
        const along = (f === F_XP || f === F_XM) ? p.z - z0 : p.x - x0;
        cLo = Math.max(0, Math.floor((along - radius) / CUBE)); cHi = Math.min(SUB - 1, Math.ceil((along + radius) / CUBE));
        const topY = h - D;
        rLo = Math.max(0, Math.floor((topY - p.y - radius) / CUBE)); rHi = Math.min(SIDE_ROWS - 1, Math.ceil((topY - p.y + radius) / CUBE));
      }
      if (cHi < cLo || rHi < rLo) continue;

      const base = f === F_TOP ? 0 : sideBase(f), layer = f === F_TOP ? TOPL : SIDEL;
      for (let L = 0; L < LAYERS; L++) for (let r = rLo; r <= rHi; r++) for (let col = cLo; col <= cHi; col++) {
        const vi = base + L * layer + r * SUB + col;
        if (c.vox[vi]) continue;
        voxPos(k, vi, _cuV);
        const d2 = _cuV.distanceToSquared(p);
        if (d2 > r2) {
          if (c.slots[vi] >= 0 && d2 < nd) { nd = d2; nearest = vi; nk = k; }
          continue;
        }
        const shown = c.slots[vi] >= 0;
        c.vox[vi] = 1;
        if (shown) { voxHide(c, vi); killed++; if (debris > 0) { crustDebris(_cuV, p, o.force || 1, voxColour(k, vi, _cuC)); debris--; } }
        const back = deeper(vi);                               // what was behind it is now on show
        if (back >= 0 && !c.vox[back]) voxShow(k, c, back);
      }
    }
  }

  // a round that lands between cubes still takes the nearest one it could have hit
  if (!killed && nearest >= 0 && nd < (radius + CUBE * 3) * (radius + CUBE * 3)) {
    const c = CRUST.cells.get(nk);
    c.vox[nearest] = 1; voxPos(nk, nearest, _cuV); voxHide(c, nearest); killed = 1;
    const back = deeper(nearest);
    if (back >= 0 && !c.vox[back]) voxShow(nk, c, back);
    if (debris > 0) crustDebris(_cuV, p, o.force || 1, voxColour(nk, nearest, _cuC));
  }
  if (!killed) return 0;

  CRUST.gone += killed;
  const im = CRUST.mesh;
  im.instanceMatrix.updateRange.offset = CRUST.lo * 16;
  im.instanceMatrix.updateRange.count = (CRUST.hi - CRUST.lo + 1) * 16;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) { im.instanceColor.updateRange.offset = CRUST.lo * 3; im.instanceColor.updateRange.count = (CRUST.hi - CRUST.lo + 1) * 3; im.instanceColor.needsUpdate = true; }
  CRUST.lo = 1e9; CRUST.hi = -1;

  crustSparks(p, Math.min(12, 2 + (killed >> 2)), o.force || 1, killed);
  if (typeof sfx === 'function' && !o.quiet) {
    if (killed > 220) { sfx('thoom', 0.55); sfx('thud', 0.6); }
    else if (killed > 40) sfx('thud', 0.45);
    else sfx('tink', 0.45);
  }
  return killed;
}

/* sparks, grit and a cloud of dust - the dust is what sells the weight */
function crustSparks(p, n, force, killed) {
  if (typeof PFX === 'undefined') return;
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rand(-1, 1), rand(0.1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(5, 15) * force);
    if (PFX.add) PFX.add.add(p.x, p.y, p.z, v.x, v.y, v.z, rand(0.12, 0.3), rand(0.04, 0.09), 0xffd27a, 18, 0, 0, 0, 0, 0, 0, 0.9);
  }
  if (PFX.lit) for (let i = 0; i < Math.min(14, 3 + (killed >> 3)); i++) {     // grit
    const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1), rand(-1, 1)).multiplyScalar(rand(2, 6) * force);
    PFX.lit.add(p.x + rand(-0.4, 0.4), p.y + rand(-0.4, 0.4), p.z + rand(-0.4, 0.4), v.x, v.y, v.z,
                rand(0.5, 1.1), rand(0.05, 0.12), 0x8d8276, 26);
  }
  if (CRUST.dust) {                                                            // the cloud
    const puffs = Math.min(22, 2 + (killed >> 3));
    for (let i = 0; i < puffs; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 0.9), rand(-1, 1)).multiplyScalar(rand(0.8, 2.4 + force));
      CRUST.dust.add(p.x + rand(-0.6, 0.6), p.y + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6), v.x, v.y, v.z,
                     rand(0.6, 1.4), rand(0.5, 1.3 + force * 0.4), 0x8d8478, -1.1, 0.9, 2);
    }
  }
}

/* ---------- the cubes that come off ---------- */
function crustDebInit() {
  CRUST.debGeo = new THREE.BoxGeometry(CUBE * 0.96, CUBE * 0.96, CUBE * 0.96);
  CRUST.debMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (typeof wdApplyTerrain === 'function') wdApplyTerrain(CRUST.debMat, CRUST.debMat);
  const im = new THREE.InstancedMesh(CRUST.debGeo, CRUST.debMat, DEB_MAX);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB_MAX * 3).fill(1), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.castShadow = true; im.count = 0;
  scene.add(im); CRUST.debMesh = im;
  CRUST.deb = [];
  for (let i = 0; i < DEB_MAX; i++) CRUST.deb.push({ live: false, p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), col: new THREE.Color(), t: 0, gone: 0 });
}

function crustDebris(at, from, force, colour) {
  let d = null;
  for (const c of CRUST.deb) if (!c.live) { d = c; break; }
  if (!d) return;
  d.live = true; d.t = 0; d.gone = 0;
  d.p.copy(at);
  _cuDeb.copy(d.p).sub(from);
  if (_cuDeb.lengthSq() < 1e-4) _cuDeb.set(rand(-1, 1), 1, rand(-1, 1));
  _cuDeb.normalize();
  d.v.copy(_cuDeb).multiplyScalar(rand(3, 10) * force);
  d.v.y += rand(2, 8) * force;
  d.w.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
  if (colour) d.col.copy(colour);
}

const DEB_SHRINK = 0.28;         // once it touches down it pinches out of existence
function crustTick(dt) {
  if (!CRUST.on || !CRUST.debMesh) return;
  if (CRUST.dust) CRUST.dust.tick(dt);
  let n = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  for (const d of CRUST.deb) {
    if (!d.live) continue;
    d.t += dt;
    let fade = 1;
    if (d.gone) {
      d.gone += dt;
      fade = 1 - d.gone / DEB_SHRINK;
      if (fade <= 0) { d.live = false; continue; }
    } else {
      d.v.y -= 34 * dt;
      d.p.addScaledVector(d.v, dt);
      const g = groundAt(d.p.x, d.p.z);
      if (d.p.y <= g + CUBE / 2) { d.p.y = g + CUBE / 2; d.gone = 1e-4; }   // landed: start shrinking
      else if (d.t > 6) d.gone = 1e-4;                                       // or it has been out there long enough
    }
    e.set(d.w.x * d.t, d.w.y * d.t, d.w.z * d.t);
    q.setFromEuler(e);
    s.setScalar(fade);
    _cuM.compose(d.p, q, s);
    CRUST.debMesh.setMatrixAt(n, _cuM);
    CRUST.debMesh.setColorAt(n, d.col);
    n++;
  }
  CRUST.debMesh.count = n;
  if (n) {
    CRUST.debMesh.instanceMatrix.needsUpdate = true;
    if (CRUST.debMesh.instanceColor) CRUST.debMesh.instanceColor.needsUpdate = true;
  }
}

/* ---------- how hard each thing hits ----------
   One place to tune what every weapon does to the walls. */
function crustShot(s, p) {
  if (!CRUST.on) return;
  const w = s.wt || 0.6;                              // round weight: pistol 0.6, heavy rounds up to ~2
  if (s.flame) { crustHit(p, 0.3, { debris: 2, force: 0.4, quiet: true }); return; }
  crustHit(p, 0.3 + w * 0.36, { debris: Math.min(7, 3 + (w | 0)), force: 0.8 + w * 0.3 });
}
function crustBlast(p, radius) {
  if (!CRUST.on) return;
  crustHit(p, radius * 1.15 + 1, { debris: 40, force: 1.7 });
}
function crustStomp(p, impact) {
  if (!CRUST.on) return;
  crustHit(p, 1 + impact * 0.09, { debris: 18, force: 1 + impact * 0.03 });
}

/* The arena rebuilding itself takes the crust with it: it is shaken loose as the ground starts to
   move, and a fresh surface is back once the new shape has settled (levelshift.js). */
let CRUST_WAS = false;
function crustShatterAll() {
  if (!CRUST.on) return;
  const p = player ? player.pos : new THREE.Vector3();
  let budget = 120;
  for (const [k, c] of CRUST.cells) {
    if (budget <= 0) break;
    const dx = cellX(k) - p.x, dz = cellZ(k) - p.z;
    if (dx * dx + dz * dz > 45 * 45) continue;
    for (let vi = 0; vi < VOXN && budget > 0; vi++) {
      if (c.slots[vi] < 0 || Math.random() > 0.25) continue;
      voxPos(k, vi, _cuV);
      crustDebris(_cuV, p, 0.8, voxColour(k, vi, _cuC));
      budget--;
    }
  }
  if (typeof sfx === 'function') sfx('thoom', 0.5);
}
