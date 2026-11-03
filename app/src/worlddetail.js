'use strict';
/* ============================================================
   WORLD DETAIL: makes the arena look used and lived-in, almost for free.
   1. Weathering, done in the terrain's own shaders (the terrain is instanced, so there are no per-vertex colours
      to paint): every wall and tile looks up its neighbours' heights in a small height texture and darkens with
      grime where floor meets wall, wears pale on ledge edges, streaks rust down from the top of walls, gets
      lighter on high ground and darker down low, plus grunge blotches, speckles and riveted panel seams.
   2. Corner debris: plates, nuts, pipes, cable loops and dented barrels heaped against wall bases. All merged into
      one mesh: one draw call.
   3. ArUco stickers: generated fiducial markers slapped on walls, all in one mesh: one more draw call.
   Options > "World detail" turns it all off.
   ============================================================ */
if (SETTINGS.detail === undefined) SETTINGS.detail = true;
const WD = { hTex: null, uniforms: [], debris: null, aruco: null };

/* ---------- 1. weathering ---------- */
function wdHeightTexture() {
  const data = new Float32Array(GRID * GRID * 4);
  for (let k = 0; k < NC; k++) data[k * 4] = H[k];
  if (!WD.hTex) {
    WD.hTex = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat, THREE.FloatType);
    WD.hTex.magFilter = WD.hTex.minFilter = THREE.NearestFilter;
  } else WD.hTex.image.data = data;
  WD.hTex.needsUpdate = true;
  return WD.hTex;
}
const WD_GLSL = `
  uniform sampler2D uH; uniform float uDetail, uHalf, uCell, uGrid, uHLo, uHHi; uniform vec3 uDirt, uRust, uWear;
  varying vec3 vWP; varying vec3 vWN;
  float wdH(vec2 xz) { vec2 c = floor((xz + uHalf) / uCell); c = clamp(c, 0.0, uGrid - 1.0); return texture2D(uH, (c + 0.5) / uGrid).r; }
  float wdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wdNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wdHash(i), wdHash(i + vec2(1, 0)), f.x), mix(wdHash(i + vec2(0, 1)), wdHash(i + vec2(1, 1)), f.x), f.y); }
  float wdFbm(vec2 p) { return wdNoise(p) * 0.55 + wdNoise(p * 2.13 + 7.1) * 0.3 + wdNoise(p * 4.7 + 3.3) * 0.15; }
`;
function wdPatch(mat, kind) {
  const u = {
    uH: { value: WD.hTex }, uDetail: { value: SETTINGS.detail ? 1 : 0 }, uHalf: { value: HALF }, uCell: { value: CELL }, uGrid: { value: GRID },
    uHLo: { value: 0 }, uHHi: { value: 20 }, uDirt: { value: new THREE.Color() }, uRust: { value: new THREE.Color() }, uWear: { value: new THREE.Color() },
  };
  WD.uniforms.push(u);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      { mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vWP = (modelMatrix * im * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * mat3(im) * objectNormal); }`);
    sh.fragmentShader = WD_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (uDetail > 0.5) {
        vec3 col = diffuseColor.rgb, n = normalize(vWN);
        ${kind === 'wall' ? `
        if (abs(n.y) < 0.5) {
          vec2 nd = normalize(n.xz);
          float hOwn = wdH(vWP.xz - nd * 0.2), hN = wdH(vWP.xz + nd * 0.2);
          float above = vWP.y - hN, below = hOwn - vWP.y;
          float along = dot(vWP.xz, vec2(-nd.y, nd.x));
          // grime where the floor meets the wall
          float dirt = (1.0 - smoothstep(0.0, 1.4, above)) * (0.55 + 0.3 * wdNoise(vec2(along * 1.7, vWP.y * 2.0)));
          // rust running down from the top edge in uneven streaks
          float st = wdNoise(vec2(along * 2.4, hOwn * 3.1)) * wdNoise(vec2(along * 0.6 + 4.0, 1.7));
          float len = 0.9 + 3.2 * wdNoise(vec2(along * 1.3, 9.0));
          float rust = smoothstep(0.18, 0.5, st) * (1.0 - smoothstep(0.0, len, below)) * 0.65;
          // riveted panels: a seam every 1.5 m up the wall and at each cell edge, rivets in the corners
          float sy = abs(fract(vWP.y / 1.5) - 0.5), sx = abs(fract((along + uHalf) / uCell) - 0.5);
          float seam = smoothstep(0.47, 0.495, max(sy, sx));
          vec2 rv = vec2(fract((along + uHalf) / uCell), fract(vWP.y / 1.5));
          float rivet = 1.0 - smoothstep(0.025, 0.045, length(vec2(min(rv.x, 1.0 - rv.x) * uCell, min(rv.y, 1.0 - rv.y) * 1.5) - 0.12));
          col = mix(col, uRust, rust);
          col = mix(col, uDirt, clamp(dirt, 0.0, 0.85));
          col *= 1.0 - 0.22 * seam;
          col *= 1.0 + 0.12 * rivet * (1.0 - seam);
          col *= 0.9 + 0.18 * wdFbm(vec2(along, vWP.y) * 0.6);
        }` : `
        if (n.y > 0.5) {
          vec2 c = floor((vWP.xz + uHalf) / uCell), lp = (vWP.xz + uHalf) / uCell - c - 0.5;    // -0.5..0.5 inside the cell
          float hOwn = wdH(vWP.xz), dirt = 0.0, wear = 0.0;
          for (int s = 0; s < 4; s++) {
            vec2 d = s == 0 ? vec2(1, 0) : s == 1 ? vec2(-1, 0) : s == 2 ? vec2(0, 1) : vec2(0, -1);
            float hN = wdH(vWP.xz + d * uCell), edge = (0.5 - dot(lp, d)) * uCell;     // metres to that side's edge
            if (hN > hOwn + 0.6) dirt = max(dirt, (1.0 - smoothstep(0.0, 1.4, edge)) * (0.62 + 0.35 * wdNoise(vWP.xz * 1.9)));   // grime against a wall
            if (hN < hOwn - 0.6) wear = max(wear, 1.0 - smoothstep(0.0, 0.32, edge));                                         // scuffed ledge lip
          }
          float ht = smoothstep(uHLo, uHHi, hOwn);
          col *= mix(0.86, 1.07, ht);                                       // high ground cleaner, low ground grimier
          col = mix(col, uDirt, clamp(dirt, 0.0, 0.8));
          col = mix(col, uWear, wear * 0.45);
          col *= 0.88 + 0.22 * wdFbm(vWP.xz * 0.35);                         // grunge blotches
          float sp = step(0.992, wdHash(floor(vWP.xz * 22.0)));
          col *= 1.0 - 0.14 * sp;                                            // speckles
          float scr = smoothstep(0.985, 1.0, wdNoise(vec2(vWP.x * 0.3 + vWP.z * 2.6, vWP.z * 0.3)));
          col *= 1.0 + 0.15 * scr;                                           // faint scratches
        }`}
        diffuseColor.rgb = col;
      }`);
  };
  mat.customProgramCacheKey = () => 'wd-' + kind;
  return u;
}
/* called from buildTerrainMesh with the two terrain materials */
function wdApplyTerrain(wallMat, topMat) {
  wdHeightTexture();
  WD.uniforms = [];
  const hs = []; for (let k = 0; k < NC; k++) if (inner(k)) hs.push(H[k]); hs.sort((a, b) => a - b);
  const lo = hs[(hs.length * 0.1) | 0] || 0, hi = hs[(hs.length * 0.9) | 0] || 20;
  const dirt = LEVEL_PAL.lo.clone().lerp(new THREE.Color(0x2a1d12), 0.6).multiplyScalar(0.55);
  const rust = new THREE.Color(0x8a4a22).lerp(LEVEL_PAL.mid, 0.2);
  const wear = LEVEL_PAL.hi.clone().lerp(new THREE.Color(0xffffff), 0.35);
  for (const [m, kind] of [[wallMat, 'wall'], [topMat, 'top']]) {
    const u = wdPatch(m, kind);
    u.uHLo.value = lo; u.uHHi.value = hi; u.uDirt.value.copy(dirt); u.uRust.value.copy(rust); u.uWear.value.copy(wear);
  }
}
function wdSetEnabled(on) {
  SETTINGS.detail = on;
  for (const u of WD.uniforms) u.uDetail.value = on ? 1 : 0;
  if (WD.debris) WD.debris.visible = on;
  if (WD.aruco) WD.aruco.visible = on;
}

/* ---------- helpers: merge many transformed copies of small shapes into one coloured mesh ---------- */
function wdMerge(parts) {
  for (const p of parts) if (p.geo.index) p.geo = p.geo.toNonIndexed();
  let n = 0; for (const p of parts) n += p.geo.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;   // merged meshes draw unindexed
    nm.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      col[o * 3] = p.c.r; col[o * 3 + 1] = p.c.g; col[o * 3 + 2] = p.c.b;
      if (U) { uv[o * 2] = p.uv ? p.uv[0] + U.getX(i) * p.uv[2] : U.getX(i); uv[o * 2 + 1] = p.uv ? p.uv[1] + U.getY(i) * p.uv[2] : U.getY(i); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
const nonIdx = g => g.index ? g.toNonIndexed() : g;

/* ---------- 2. corner debris ---------- */
const WD_SHAPES = {
  plate: nonIdx(new THREE.BoxGeometry(0.9, 0.05, 0.6)),
  nut: nonIdx(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 6)),
  pipe: nonIdx(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8, 1, true)),
  cable: nonIdx(new THREE.TorusGeometry(0.32, 0.04, 5, 14)),
  barrel: nonIdx(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10)),
  block: nonIdx(new THREE.BoxGeometry(0.35, 0.25, 0.3)),
};
function wdClear() {
  for (const k of ['debris', 'aruco']) if (WD[k]) { scene.remove(WD[k]); WD[k].geometry.dispose(); WD[k] = null; }
}
/* spots where scrap would gather: floor cells hemmed in by taller neighbours */
function wdCorners() {
  const out = [];
  for (let k = 0; k < NC; k++) {
    if (!inner(k)) continue;
    const walls = [];
    for (const [d, dx, dz] of [[1, 1, 0], [-1, -1, 0], [GRID, 0, 1], [-GRID, 0, -1]]) if (H[k + d] - H[k] > 1.2) walls.push([dx, dz]);
    if (walls.length) out.push({ k, walls });
  }
  return out;
}
function wdKeepOut(x, z) {
  const near = (a, b, r) => Math.hypot(x - a, z - b) < r;
  if (S.shop && near(S.shop.x, S.shop.z, 5)) return true;
  if (typeof cases !== 'undefined') for (const c of cases) if (near(c.x, c.z, 3)) return true;
  if (player && player.pos && near(player.pos.x, player.pos.z, 7)) return true;
  const k = idxOf(x, z); if (padSet.has(k) || redPads.has(k)) return true;
  return false;
}
function wdBuildDebris() {
  const target = { low: 450, medium: 900, high: 1400 }[SETTINGS.gfx || 'high'] || 900;
  const spots = wdCorners(); if (!spots.length) return;
  const parts = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const base = LEVEL_PAL.lo.clone().lerp(new THREE.Color(0x3a332c), 0.5);
  const tints = [base.clone().multiplyScalar(0.8), base.clone().multiplyScalar(1.15), new THREE.Color(0x6a4a2e), new THREE.Color(0x4a4f55), LEVEL_PAL.mid.clone().multiplyScalar(0.6)];
  const shapes = ['plate', 'plate', 'nut', 'nut', 'nut', 'pipe', 'cable', 'block', 'block', 'barrel'];
  let made = 0, guard = 0;
  while (made < target && guard++ < target * 6) {
    const s = spots[(Math.random() * spots.length) | 0], [dx, dz] = s.walls[(Math.random() * s.walls.length) | 0];
    const pile = Math.random() < 0.3 ? 3 + ((Math.random() * 4) | 0) : 1;
    const along = (Math.random() - 0.5) * CELL * 0.85, off = CELL / 2 - rand(0.25, 0.9);
    const cx = cellX(s.k) + dx * off + (dz ? along : 0), cz = cellZ(s.k) + dz * off + (dx ? along : 0);
    if (wdKeepOut(cx, cz)) continue;
    for (let i = 0; i < pile && made < target; i++, made++) {
      const type = shapes[(Math.random() * shapes.length) | 0], g = WD_SHAPES[type];
      const x = cx + rand(-0.35, 0.35), z = cz + rand(-0.35, 0.35), y = H[s.k] + 0.02 + i * 0.07;
      const sz = rand(0.7, 1.35);
      if (type === 'barrel') { e.set(Math.random() < 0.5 ? Math.PI / 2 : rand(-0.15, 0.15), rand(0, 6.3), 0); p.set(x, y + (e.x > 1 ? 0.34 : 0.45) * sz, z); }
      else if (type === 'pipe') { e.set(Math.PI / 2 + rand(-0.3, 0.3), rand(0, 6.3), 0); p.set(x, y + 0.09 * sz, z); }
      else if (type === 'plate') {
        // leaning against the wall at an angle, or lying flat
        const lean = Math.random() < 0.5; e.set(lean ? rand(0.6, 1.2) : rand(-0.12, 0.12), Math.atan2(dx, dz), rand(-0.2, 0.2), 'YXZ');
        p.set(x + dx * 0.15, y + (lean ? 0.3 : 0.03) * sz, z + dz * 0.15);
      } else if (type === 'cable') { e.set(Math.PI / 2 + rand(-0.25, 0.25), 0, rand(0, 6.3)); p.set(x, y + 0.04, z); }
      else { e.set(rand(-0.4, 0.4), rand(0, 6.3), rand(-0.4, 0.4)); p.set(x, y + 0.08 * sz, z); }
      q.setFromEuler(e); sc.setScalar(sz);
      m.compose(p, q, sc);
      parts.push({ geo: g, m: m.clone(), c: tints[(Math.random() * tints.length) | 0].clone().multiplyScalar(rand(0.8, 1.1)) });
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  WD.debris = new THREE.Mesh(wdMerge(parts), mat);
  WD.debris.visible = !!SETTINGS.detail;
  scene.add(WD.debris); WD.debris.castShadow = false; WD.debris.receiveShadow = true;
}

/* ---------- 3. ArUco stickers: random 4x4 fiducial markers printed on white stickers, stuck to walls ---------- */
let arucoTex = null;
function wdArucoAtlas() {
  if (arucoTex) return arucoTex;
  const N = 8, px = 64, cv = document.createElement('canvas'); cv.width = cv.height = N * px;
  const c = cv.getContext('2d');
  for (let t = 0; t < N * N; t++) {
    const ox = (t % N) * px, oy = ((t / N) | 0) * px, m = 8;           // 8 modules: white margin, black border, 4x4 bits
    c.fillStyle = '#f1efe6'; c.fillRect(ox, oy, px, px);
    c.fillStyle = '#121416'; c.fillRect(ox + m, oy + m, m * 6, m * 6);
    c.fillStyle = '#f1efe6';
    let bits = 0;
    for (let i = 0; i < 16; i++) if (Math.random() < 0.5) { bits++; c.fillRect(ox + m * 2 + (i % 4) * m, oy + m * 2 + ((i / 4) | 0) * m, m, m); }
    if (bits < 3) c.fillRect(ox + m * 2, oy + m * 2, m, m);
    // a little wear on the paper
    c.fillStyle = 'rgba(80,60,40,.12)'; for (let i = 0; i < 6; i++) c.fillRect(ox + Math.random() * px, oy + Math.random() * px, rand(2, 8), rand(2, 8));
  }
  arucoTex = new THREE.CanvasTexture(cv); arucoTex.magFilter = THREE.NearestFilter; arucoTex.minFilter = THREE.LinearMipMapLinearFilter;
  return arucoTex;
}
function wdBuildAruco() {
  const n = { low: 24, medium: 40, high: 56 }[SETTINGS.gfx || 'high'] || 40;
  const quad = nonIdx(new THREE.PlaneGeometry(1, 1)), parts = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const white = new THREE.Color(1, 1, 1);
  let made = 0, guard = 0;
  while (made < n && guard++ < n * 40) {
    const k = (Math.random() * NC) | 0; if (!inner(k)) continue;
    const dirs = [[1, 1, 0], [-1, -1, 0], [GRID, 0, 1], [-GRID, 0, -1]].filter(([d]) => H[k] - H[k + d] > 1.8);
    if (!dirs.length) continue;
    const [d, dx, dz] = dirs[(Math.random() * dirs.length) | 0], floor = H[k + d], top = H[k];
    const s = rand(0.55, 1.0), y = floor + rand(0.7, Math.max(0.8, Math.min(3.2, top - floor - s * 0.6)));
    if (y + s / 2 > top - 0.1) continue;
    const along = rand(-CELL * 0.3, CELL * 0.3);
    p.set(cellX(k) + dx * (CELL / 2 + 0.015) + (dz ? along : 0), y, cellZ(k) + dz * (CELL / 2 + 0.015) + (dx ? along : 0));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand(-0.12, 0.12)));
    if (wdKeepOut(p.x, p.z)) continue;
    sc.set(s, s, 1); m.compose(p, q, sc);
    const t = (Math.random() * 64) | 0;
    parts.push({ geo: quad, m: m.clone(), c: white, uv: [(t % 8) / 8, 1 - (((t / 8) | 0) + 1) / 8, 1 / 8] });
    made++;
  }
  if (!parts.length) return;
  const mat = new THREE.MeshLambertMaterial({ map: wdArucoAtlas(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  WD.aruco = new THREE.Mesh(wdMerge(parts), mat);
  WD.aruco.visible = !!SETTINGS.detail;
  scene.add(WD.aruco); WD.aruco.castShadow = false;
}
function wdBuildStage() { wdClear(); wdBuildDebris(); wdBuildAruco(); }
$('#detailBtn').addEventListener('click', () => { wdSetEnabled(!(SETTINGS.detail !== false)); saveSettings(); syncSettingsUI(); sfx('tick'); });
