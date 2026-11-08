'use strict';
/* ============================================================
   INFERNO: the burning box-art diorama (Luke's sketch). Used two ways:
     - as the alternative main-menu scene (Customize > Scene > Inferno), and
     - by the box-art rig (boxart.html), which adds a posed robot, held muzzle blasts, camera tools and a PNG export.
   makeInferno(opts) builds everything into one group, positioned so the top of the robot's pillar is at the world
   origin (the title robot stands at 0,0,0). Built from the game's own pieces:
     terrain.js + worlddetail.js  the real terraced block terrain from a hand-made heightmap, with weathering and debris
     combat.js makeEnemyMesh()    the real crawler / elite / drone models, drawn instanced (a few draw calls for the lot)
   The terrain builder works on the arena's globals (H, LEVEL_PAL, terrainMesh, WD...), so building borrows them and
   puts the arena's back untouched afterwards; this scene keeps its own copy of its heights.
   The crawlers are dropped in and settled with a small ball-physics pass (gravity, ball-ball and ball-terrain contacts,
   steering toward the robot, hop-ups when blocked) so they heap against the pillar and over each other like in a run.
   ============================================================ */
const INFERNO_NOISE = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }`;

function makeInferno(opts = {}) {
  const fxScene = opts.fxScene;                         // where live shots are spawned (world space)
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const C0 = 42, K0 = C0 * GRID + C0, RX = cellX(K0), RZ = cellZ(K0), PILLAR = 5;
  const IG = new THREE.Group(); IG.position.set(-RX, -PILLAR, -RZ);
  const infH = new Float32Array(NC);
  const gAt = (x, z) => { const k = idxOf(x, z); return k < 0 ? 0 : infH[k]; };

  /* ---------------- terrain ---------------- */
  let terrainParts = [], terrainHTex = null;
  function heights(seed) {
    const rng = mulberry32(seed), n1 = makeNoise(rng), n2 = makeNoise(rng);
    const setH = (di, dj, h) => { infH[(C0 + dj) * GRID + (C0 + di)] = h; };
    const hAt = (di, dj) => infH[(C0 + dj) * GRID + (C0 + di)];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i, di = i - C0, dj = j - C0, d = Math.hypot(di, dj);
      if (!inner(k)) { infH[k] = 0; continue; }
      let h = 0;
      const b = n1(i / 4.5, j / 4.5);
      if (b > 0.58) h = 1; if (b > 0.72) h = 2;
      // a skyline of mesas and spires further out, mostly behind the robot
      const far = d > 7 ? Math.min(1, (d - 7) / 6) : 0, behind = dj < -3 ? 1 : 0.55;
      if (far > 0 && n2(i / 3.2, j / 3.2) > 0.6 - 0.12 * behind) h = Math.round(6 + n2(i / 2 + 50, j / 2) * 16 * behind + far * 4);
      // keep the foreground (between the camera and the robot) low so the horde reads
      if (dj > 0 && dj < 9 && Math.abs(di) < 6) h = Math.min(h, b > 0.66 ? 1 : 0);
      infH[k] = h;
    }
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (Math.hypot(di, dj) < 2.5) setH(di, dj, Math.min(hAt(di, dj), 1));
    setH(0, 0, PILLAR);                                 // the robot's pillar and the steps around it
    setH(1, -1, 2); setH(0, -1, 3); setH(-1, -1, 1); setH(-1, 0, 1); setH(1, 0, 2); setH(1, 1, 1);
    // the big left mesa (crawlers on top, a drone overhead) and the tall right pillar, as in the sketch
    for (const [di, dj, h] of [[-4, -3, 11], [-3, -3, 11], [-4, -2, 10], [-3, -2, 11], [-5, -3, 9], [-4, -4, 12], [-3, -4, 12],
                               [4, -2, 13], [4, -3, 14], [5, -3, 12], [5, -2, 9], [3, -4, 10]]) setH(di, dj, h);
  }
  function buildTerrain(seed) {
    heights(seed);
    for (const p of terrainParts) { IG.remove(p); if (p.isInstancedMesh) { p.material.dispose(); p.dispose && p.dispose(); } else { p.geometry.dispose(); p.material.dispose(); } }
    terrainParts = [];
    if (terrainHTex) { terrainHTex.dispose(); terrainHTex = null; }
    // borrow the arena's terrain globals, build, then hand them back exactly as they were
    const sv = {
      H: H.slice(), lo: LEVEL_PAL.lo.clone(), mid: LEVEL_PAL.mid.clone(), hi: LEVEL_PAL.hi.clone(), sky: LEVEL_PAL.sky.clone(),
      tm: terrainMesh, tl: tileMesh, pads: padMeshes.slice(), red: new Map(redPadMeshes), padSet, redPads,
      hTex: WD.hTex, debris: WD.debris, aruco: WD.aruco, uni: WD.uniforms,
    };
    terrainMesh = null; tileMesh = null; padMeshes.length = 0; redPadMeshes.clear(); padSet = new Set(); redPads = new Set();
    WD.hTex = null; WD.debris = null; WD.aruco = null;
    try {
      H.set(infH);
      LEVEL_PAL.lo.setHSL(0.045, 0.42, 0.13); LEVEL_PAL.mid.setHSL(0.055, 0.40, 0.25); LEVEL_PAL.hi.setHSL(0.07, 0.36, 0.42); LEVEL_PAL.sky.setHex(0x6a1206);
      buildTerrainMesh();
      wdBuildDebris(); wdBuildAruco();
      terrainParts = [terrainMesh, tileMesh, WD.debris, WD.aruco].filter(Boolean);
      for (const p of terrainParts) { if (p.parent) p.parent.remove(p); IG.add(p); }
      // the weathering shader looks heights up by world position: tell it where this terrain has been moved to
      for (const u of WD.uniforms) if (u.uOff) u.uOff.value.copy(IG.position);
      terrainHTex = WD.hTex;
    } finally {
      H.set(sv.H); LEVEL_PAL.lo.copy(sv.lo); LEVEL_PAL.mid.copy(sv.mid); LEVEL_PAL.hi.copy(sv.hi); LEVEL_PAL.sky.copy(sv.sky);
      terrainMesh = sv.tm; tileMesh = sv.tl; padMeshes.length = 0; padMeshes.push(...sv.pads);
      redPadMeshes.clear(); sv.red.forEach((v, k) => redPadMeshes.set(k, v)); padSet = sv.padSet; redPads = sv.redPads;
      WD.hTex = sv.hTex; WD.debris = sv.debris; WD.aruco = sv.aruco; WD.uniforms = sv.uni;
    }
  }

  /* ---------------- sky + flame walls ---------------- */
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uFire: { value: 1 }, uFireI: { value: 1 }, uSmoke: { value: 1 } }, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: INFERNO_NOISE + `
    varying vec3 vDir; uniform float uT, uFire, uFireI, uSmoke;
    void main(){
      vec3 d = normalize(vDir); float e = d.y;
      vec3 col = mix(vec3(1.0, 0.28, 0.07), vec3(0.52, 0.05, 0.03), smoothstep(-0.05, 0.28, e));
      col = mix(col, vec3(0.17, 0.01, 0.015), smoothstep(0.3, 0.95, e));
      float smoke = fbm3(vec3(d.x * 2.2 + uT * 0.02, e * 2.6 - uT * 0.05, d.z * 2.2));
      col *= pow(max(0.45 + 1.15 * smoke, 0.01), uSmoke);
      float tall = fbm3(vec3(d.x * 1.4, 3.0, d.z * 1.4));
      float hgt = max((0.08 + 0.6 * tall * tall) * uFire, 0.001);
      float n = fbm3(vec3(d.x * 5.0, e * 5.0 - uT * 0.7, d.z * 5.0));
      float f = n * 1.3 - max(e, 0.0) / hgt * 0.6 - 0.12;
      float fl = smoothstep(0.0, 0.6, f);
      vec3 fc = mix(vec3(0.95, 0.14, 0.03), vec3(1.7, 0.7, 0.12), smoothstep(0.15, 0.55, fl));
      fc = mix(fc, vec3(3.2, 2.4, 1.4), smoothstep(0.65, 1.0, fl));
      col = mix(col, fc * uFireI, smoothstep(0.02, 0.3, fl) * smoothstep(-0.12, 0.0, e) * smoothstep(0.0, 0.15, uFire));
      gl_FragColor = vec4(col, 1.0);
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
  sky.renderOrder = -1000; sky.frustumCulled = false; sky.userData.noShadow = true; IG.add(sky);

  const flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.translate(0, 0.5, 0);
  const FLAMES = [];
  function flame(x, y, z, w, h, inten = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uSeed: { value: Math.random() * 50 }, uI: { value: inten } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: INFERNO_NOISE + `
      varying vec2 vUv; uniform float uT, uSeed, uI;
      void main(){
        vec2 uv = vUv; float x = (uv.x - 0.5) * 2.0;
        float n = fbm3(vec3(uv.x * 2.6 + uSeed, uv.y * 2.2 - uT * 1.3, uSeed));
        float n2 = fbm3(vec3(uv.x * 6.0 - uSeed, uv.y * 5.0 - uT * 2.4, uSeed * 1.7));
        float body = (1.0 - pow(abs(x), 1.5)) * (1.0 - uv.y);
        float f = clamp((n * 1.1 + n2 * 0.55) * body * 2.2 - 0.35 - uv.y * 0.25, 0.0, 1.0);
        vec3 c = mix(vec3(0.8, 0.1, 0.02), vec3(1.6, 0.6, 0.1), smoothstep(0.08, 0.4, f));
        c = mix(c, vec3(2.8, 2.0, 1.1), smoothstep(0.45, 0.85, f));
        float a = smoothstep(0.0, 0.18, f) * smoothstep(0.0, 0.05, uv.y);
        gl_FragColor = vec4(c * a * uI, 1.0);
      }`,
    });
    const mesh = new THREE.Mesh(flameGeo, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, 1);
    mesh.userData = { w, h, i: inten, noShadow: true };
    IG.add(mesh); FLAMES.push(mesh); return mesh;
  }
  flame(RX + 3, 0, RZ - 13, 11, 19, 0.75);         // the blaze behind the robot (its backlight), off to one side so the robot still reads
  flame(RX - 3.5, 0, RZ - 12, 8, 12, 0.6);
  flame(RX - 6, 2, RZ - 15, 12, 17, 0.9);
  flame(RX + 9, 1, RZ - 16, 12, 15, 0.9);
  flame(RX - 12, 10, RZ - 13, 10, 14, 1.0);        // over the left mesa
  flame(RX - 20, 0, RZ - 30, 22, 34, 0.85);        // the towering one, top left in the sketch
  flame(RX + 15, 13, RZ - 11, 6, 9, 0.9);          // on the right pillar
  { const rng = mulberry32(911);
    for (let i = 0; i < 16; i++) { const a = rng() * Math.PI * 2, r = 30 + rng() * 40; flame(RX + Math.cos(a) * r, 0, RZ + Math.sin(a) * r, 14 + rng() * 14, 18 + rng() * 22, 0.75); } }

  /* ---------------- lights ---------------- */
  const hemi = new THREE.HemisphereLight(0xff9a60, 0x2a0804, 0.4); IG.add(hemi);
  // the key comes from behind, out of the fire: rim light + long shadows toward the camera
  const key = new THREE.DirectionalLight(0xff8a3a, 1.3); key.position.set(RX + 8, 34, RZ - 32); key.target.position.set(RX, PILLAR, RZ);
  IG.add(key); IG.add(key.target); setupShadowLight(key, 26, 140);
  { const q = GFX_PRESETS[SETTINGS.gfx]; if (q && q.shadow) key.shadow.mapSize.set(q.shadow, q.shadow); }
  const fill = new THREE.DirectionalLight(0xffd2b0, 0.7); fill.position.set(RX + 10, 12, RZ + 18); fill.target.position.set(RX, PILLAR, RZ);
  IG.add(fill); IG.add(fill.target);
  const backGlow = new THREE.PointLight(0xff6a18, 5, 26, 1.6); backGlow.position.set(RX, PILLAR + 4, RZ - 6); IG.add(backGlow);
  const mesaGlow = new THREE.PointLight(0xff7a20, 3, 22, 1.6); mesaGlow.position.set(RX - 11, 13, RZ - 10); IG.add(mesaGlow);
  const groundGlow = new THREE.PointLight(0xff4a10, 1.6, 18, 1.8); groundGlow.position.set(RX - 4, 1.2, RZ - 3); IG.add(groundGlow);

  /* ---------------- the horde ---------------- */
  const ENEMY_RED = 0xc4262e, GRAV = 34;
  const tplCache = {};
  const tplKey = b => b.shape + (b.elite ? 'E' : '');
  function enemyTemplate(shape, elite) {
    const k = shape + (elite ? 'E' : '');
    if (!tplCache[k]) { tplCache[k] = makeEnemyMesh('crawler', elite ? ELITE.color : ENEMY_RED, shape); tplCache[k].updateMatrixWorld(true); }
    return tplCache[k];
  }
  const HORDE = new THREE.Group(); IG.add(HORDE);
  let balls = [], inst = [];
  function makeBalls(count, seed) {
    const rng = mulberry32(seed); balls = [];
    const add = (x, z, tx, tz, y) => {
      // elites mostly off to the sides and behind: the sketch's foreground is red
      const elite = rng() < (z > RZ + 2.5 ? 0.01 : 0.035), shape = rng() < 0.5 ? 'sphere' : (rng() < 0.85 ? 'cube' : 'dome');
      const r = ETYPES.crawler.r * (elite ? ELITE.sizeMul : 1);
      const b = { x, y: (y != null ? y : gAt(x, z) + r + rng() * 6), z, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, r, elite, shape, tx, tz, spd: 4.6 * (0.85 + rng() * 0.3), up: false, tilt: (rng() - 0.5) * 0.7, roll: (rng() - 0.5) * 0.7 };
      b.px = b.x; b.py = b.y; b.pz = b.z; balls.push(b);
    };
    for (let i = 0, guard = 0; i < count && guard < count * 20; i++, guard++) {
      const a = rng() * Math.PI * 2, rr = 2.2 + Math.sqrt(rng()) * 15;
      const x = RX + Math.cos(a) * rr, z = RZ + Math.sin(a) * rr;
      if (gAt(x, z) > 3.5) { i--; continue; }        // not inside the tall blocks
      add(x, z, RX, RZ);
    }
    const mx = cellX(K0 - 3 * GRID - 4) + 1.5, mz = cellZ(K0 - 3 * GRID - 4) + 1.5;   // a few up on the left mesa
    for (let i = 0; i < 4; i++) add(mx + (rng() - 0.5) * 3, mz + (rng() - 0.5) * 3, mx + 2, mz + 3, gAt(mx, mz) + 1 + i);
  }
  function collideTerrain(b) {
    const i0 = Math.floor((b.x + HALF) / CELL), j0 = Math.floor((b.z + HALF) / CELL);
    let up = false;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
      const k = j * GRID + i, h = infH[k], cx = cellX(k), cz = cellZ(k);
      const qx = clamp(b.x, cx - CELL / 2, cx + CELL / 2), qy = clamp(b.y, -10, h), qz = clamp(b.z, cz - CELL / 2, cz + CELL / 2);
      const dx = b.x - qx, dy = b.y - qy, dz = b.z - qz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= b.r * b.r) continue;
      if (d2 < 1e-10) { b.y = h + b.r; up = true; continue; }
      const d = Math.sqrt(d2), k2 = (b.r - d) / d;
      b.x += dx * k2; b.y += dy * k2; b.z += dz * k2;
      if (dy / d > 0.5) up = true;
    }
    return up;
  }
  function keepOffRobot(b) {
    // the horde surges up to the pillar's lip, but the robot stands clear above it
    if (b.y < PILLAR - 0.5) return;
    const dx = b.x - RX, dz = b.z - RZ, d = Math.hypot(dx, dz), R = 2.1 + b.r;
    if (d >= R) return;
    const s = d > 1e-6 ? R / d : 0; b.x = RX + (s ? dx * s : R); b.z = RZ + (s ? dz * s : 0);
  }
  const hash = new Map();
  function stepPile(dt, rng) {
    for (const b of balls) {
      b.px = b.x; b.py = b.y; b.pz = b.z;
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz) || 1, want = d > 1.4 ? b.spd : 0;
      b.vx += (dx / d * want - b.vx) * Math.min(1, dt * 5); b.vz += (dz / d * want - b.vz) * Math.min(1, dt * 5);
      if (b.up && Math.hypot(b.vx, b.vz) < 1.4 && rng() < dt * 0.9) b.vy = 5.5 + rng() * 2;   // blocked: hop up onto it, like the game's crawlers
      b.vy -= GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.up = false;
    }
    const CS = 2.0;
    for (let it = 0; it < 3; it++) {
      hash.clear();
      for (let n = 0; n < balls.length; n++) { const b = balls[n], key = (Math.floor(b.x / CS) + 500) * 100000 + (Math.floor(b.z / CS) + 500); let a = hash.get(key); if (!a) hash.set(key, a = []); a.push(n); }
      for (let n = 0; n < balls.length; n++) {
        const b = balls[n], gx = Math.floor(b.x / CS), gz = Math.floor(b.z / CS);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const a = hash.get((gx + ox + 500) * 100000 + (gz + oz + 500)); if (!a) continue;
          for (const m of a) {
            if (m <= n) continue;
            const c = balls[m], dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z, rr = b.r + c.r, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= rr * rr || d2 < 1e-10) continue;
            const d = Math.sqrt(d2), pen = (rr - d) / d, wb = c.elite && !b.elite ? 0.7 : b.elite && !c.elite ? 0.3 : 0.5, wc = 1 - wb;
            b.x -= dx * pen * wb; b.y -= dy * pen * wb; b.z -= dz * pen * wb;
            c.x += dx * pen * wc; c.y += dy * pen * wc; c.z += dz * pen * wc;
            if (dy / d < -0.45) b.up = true; else if (dy / d > 0.45) c.up = true;
            if (Math.abs(dy / d) < 0.5) { b.up = true; c.up = true; }        // pushing into someone in front also counts as blocked
          }
        }
      }
      for (const b of balls) { if (collideTerrain(b)) b.up = true; keepOffRobot(b); }
    }
    for (const b of balls) {           // velocities from what actually happened (position-based dynamics)
      const vy = (b.y - b.py) / dt;
      b.vx = (b.x - b.px) / dt; b.vz = (b.z - b.pz) / dt; b.vy = Math.min(vy, b.vy > 0 ? b.vy : vy);
      if (b.up) { b.vx *= 0.92; b.vz *= 0.92; }
      b.vx = clamp(b.vx, -12, 12); b.vy = clamp(b.vy, -30, 12); b.vz = clamp(b.vz, -12, 12);   // a big correction must never become a launch
    }
  }
  // one InstancedMesh per piece of each enemy model: the whole horde in a couple of dozen draw calls
  function buildHorde() {
    for (const im of inst) { HORDE.remove(im); im.dispose && im.dispose(); } inst = [];
    const groups = new Map();
    balls.forEach((b, i) => { const k = tplKey(b); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
    for (const [, idxs] of groups) {
      const b0 = balls[idxs[0]], tpl = enemyTemplate(b0.shape, b0.elite);
      tpl.traverse(o => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, idxs.length);
        im.userData.local = o.matrixWorld.clone(); im.userData.idxs = idxs; im.frustumCulled = false;
        HORDE.add(im); inst.push(im);
      });
    }
    syncHorde();
  }
  const _m = new THREE.Matrix4(), _bm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function syncHorde() {
    for (const im of inst) {
      const { local, idxs } = im.userData;
      for (let j = 0; j < idxs.length; j++) {
        const b = balls[idxs[j]];
        _e.set(b.tilt, Math.atan2(b.tx - b.x, b.tz - b.z), b.roll, 'YXZ'); _q.setFromEuler(_e);   // eyes on the robot, tumbled a little
        _s.setScalar(b.elite ? ELITE.sizeMul : 1); _p.set(b.x, b.y, b.z);
        _bm.compose(_p, _q, _s); _m.multiplyMatrices(_bm, local); im.setMatrixAt(j, _m);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }
  function pile(count, seed) {
    makeBalls(count, seed);
    const rng = mulberry32(seed * 7 + 1);
    for (let s = 0; s < 720; s++) stepPile(1 / 60, rng);
    buildHorde();
  }
  const liveRng = mulberry32(77);

  /* drones overhead */
  const DRONES = [];
  { const tpl = makeEnemyMesh('drone', 0xb43cc0);
    for (const [x, y, z] of [[RX - 7.5, 13.2, RZ - 7], [RX + 9, 15.5, RZ - 4], [RX - 2, 17, RZ - 14]]) {
      const d = tpl.clone(); d.position.set(x, y, z); d.rotation.set(0.2, Math.atan2(RX - x, RZ - z), -0.25); d.userData.base = y;
      IG.add(d); DRONES.push(d);
    } }

  /* ---------------- embers ---------------- */
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,200,120,0.7)'); r.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const EN = 900, EBASE = 260, ePos = new Float32Array(EN * 3), eVel = new Float32Array(EN * 3), eLife = new Float32Array(EN);
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3)); eGeo.setDrawRange(0, EBASE);
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.2, map: glowTex, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  embers.frustumCulled = false; embers.userData.noShadow = true; IG.add(embers);
  function emberSpawn(i, first) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 18;
    ePos[i * 3] = RX + Math.cos(a) * r; ePos[i * 3 + 1] = first ? Math.random() * 16 : Math.random() * 2; ePos[i * 3 + 2] = RZ + Math.sin(a) * r - 4;
    eVel[i * 3] = (Math.random() - 0.5) * 0.6 + 0.3; eVel[i * 3 + 1] = 1 + Math.random() * 2; eVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    eLife[i] = 3 + Math.random() * 5;
  }
  for (let i = 0; i < EN; i++) emberSpawn(i, true);

  /* ---------------- gunfire (cosmetic: streaks, flashes, rockets, arcs) ---------------- */
  const FX = {
    pistol: { color: 0xffe2a0, rate: 0.28, len: 3, thick: 0.05, spread: 0.03 },
    autogun: { color: 0xffe0a0, rate: 0.09, len: 2.4, thick: 0.045, spread: 0.06 },
    shotgun: { color: 0xffd890, rate: 0.5, len: 1.8, thick: 0.05, spread: 0.34, pellets: 8 },
    sniper: { color: 0xffffff, rate: 0.55, len: 5, thick: 0.07, spread: 0.01 },
    rocket: { color: 0xffa040, rate: 0.9, missile: true },
    lightning: { color: 0x9feaff, rate: 0.12, arc: true },
    flamer: { color: 0xff8a2a, rate: 0.03, flame: true },
    gatling: { color: 0xffe0a0, rate: 0.055, len: 2.2, thick: 0.04, spread: 0.08 },
    gravity: { color: 0xb890ff, rate: 0.6, ring: true },
    pods: { color: 0xffa040, rate: 0.3, missile: true },
  };
  const fxOf = t => FX[t] || { color: 0xffe0a0, rate: 0.3, len: 2, thick: 0.05, spread: 0.08 };
  const live = [], _fp = V3(0, 0, 0), _fd = V3(0, 0, 0), _fq = new THREE.Quaternion(), streakMats = {};
  const addFx = o => (fxScene || IG.parent || IG).add(o), remFx = o => o.parent && o.parent.remove(o);
  function spawnFlash(p, hex, s, life) {
    const m = new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(s); addFx(sp); live.push({ o: sp, m, life, max: life, kind: 'flash', s });
  }
  function spawnStreak(p, d, len, speed, hex, thick, life) {
    const m = streakMats[hex] || (streakMats[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const mesh = new THREE.Mesh(geoBox, m.clone()); mesh.userData.noShadow = true; mesh.scale.set(thick, thick, len); mesh.position.copy(p).addScaledVector(d, len / 2); mesh.lookAt(mesh.position.clone().add(d)); addFx(mesh);
    live.push({ o: mesh, m: mesh.material, life, max: life, kind: 'streak', v: d.clone().multiplyScalar(speed) });
  }
  function spawnArc(p, d) {
    const pts = [], tgt = p.clone().addScaledVector(d, 4 + Math.random() * 2);
    for (let i = 0; i <= 10; i++) { const q = p.clone().lerp(tgt, i / 10); if (i && i < 10) { q.x += (Math.random() - 0.5) * 0.5; q.y += (Math.random() - 0.5) * 0.5; q.z += (Math.random() - 0.5) * 0.3; } pts.push(q); }
    const g = new THREE.BufferGeometry().setFromPoints(pts), m = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, blending: THREE.AdditiveBlending });
    const l = new THREE.Line(g, m); addFx(l); live.push({ o: l, m, g, life: 0.1, max: 0.1, kind: 'fade' });
  }
  function spawnRing(p, d, hex) {
    const g = new THREE.RingGeometry(0.5, 0.58, 36), m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const r = new THREE.Mesh(g, m); r.position.copy(p).addScaledVector(d, 0.4); r.lookAt(r.position.clone().add(d)); addFx(r);
    live.push({ o: r, m, g, life: 0.5, max: 0.5, kind: 'ring', r0: 0.6, r1: 3.2, v: d.clone().multiplyScalar(6) });
  }
  function spawnMissile(p, d) {
    const g = new THREE.Group(); g.add(bx(0.1, 0.1, 0.34, 0xe2465c, 0, 0, 0, 0xff3a28));
    const tm = new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const tail = new THREE.Sprite(tm); tail.position.z = -0.3; tail.scale.setScalar(0.7); g.add(tail);
    g.position.copy(p); g.lookAt(p.clone().add(d)); addFx(g);
    live.push({ o: g, m: tm, life: 1.4, max: 1.4, kind: 'move', v: d.clone().multiplyScalar(16) });
  }
  function fireMuzzle(muz, type, s = 1) {
    if (!muz) return;
    muz.updateWorldMatrix(true, false); muz.getWorldPosition(_fp); muz.getWorldQuaternion(_fq);
    _fd.set(0, 0, 1).applyQuaternion(_fq);
    const F = fxOf(type), p = _fp.clone(), d = _fd.clone();
    if (F.missile) { spawnMissile(p, d); spawnFlash(p, 0xffa040, 1.2 * s, 0.14); return; }
    if (F.arc) { spawnArc(p, d); spawnFlash(p, 0x58cfd6, 0.8 * s, 0.08); return; }
    if (F.ring) { spawnRing(p, d, F.color); spawnFlash(p, F.color, 1.1 * s, 0.18); return; }
    if (F.flame) {
      for (let i = 0; i < 4; i++) {
        const v = d.clone().multiplyScalar(6 + Math.random() * 3); v.x += (Math.random() - 0.5) * 1.4; v.y += (Math.random() - 0.5) * 1.4 + 0.4; v.z += (Math.random() - 0.5) * 1.4;
        const m = new THREE.SpriteMaterial({ map: glowTex, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(0.5 * s); addFx(sp);
        live.push({ o: sp, m, life: 0.55, max: 0.55, kind: 'puff', v, s: 0.5 * s });
      }
      return;
    }
    for (let i = 0; i < (F.pellets || 1); i++) {
      const dd = d.clone(); dd.x += (Math.random() - 0.5) * F.spread; dd.y += (Math.random() - 0.5) * F.spread; dd.z += (Math.random() - 0.5) * F.spread; dd.normalize();
      spawnStreak(p, dd, F.len * s, 34 + Math.random() * 10, F.color, F.thick * s, 0.45);
    }
    spawnFlash(p, 0xffe2a0, (0.6 + F.thick * 6) * s, 0.1);
  }
  function tickLive(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i]; f.life -= dt; const k = Math.max(0, f.life / f.max);
      if (f.v) f.o.position.addScaledVector(f.v, dt);
      if (f.kind === 'streak' || f.kind === 'fade') f.m.opacity = k;
      else if (f.kind === 'flash') { f.m.opacity = k; f.o.scale.setScalar(f.s * (1.4 - 0.4 * k)); }
      else if (f.kind === 'puff') { f.m.opacity = 0.9 * k; f.o.scale.setScalar(f.s * (2.2 - 1.2 * k)); }
      else if (f.kind === 'ring') { f.o.scale.setScalar(f.r0 + (f.r1 - f.r0) * (1 - k)); f.m.opacity = 0.9 * k; }
      if (f.life <= 0) { remFx(f.o); if (f.m) f.m.dispose(); if (f.g) f.g.dispose(); live.splice(i, 1); }
    }
  }
  function clearLive() { for (const f of live) { remFx(f.o); if (f.m) f.m.dispose(); if (f.g) f.g.dispose(); } live.length = 0; }

  /* ---------------- knobs ---------------- */
  const FIRE = { amt: 1, bri: 1 };
  function applyFire() {
    skyMat.uniforms.uFire.value = FIRE.amt; skyMat.uniforms.uFireI.value = FIRE.bri;
    FLAMES.forEach(f => { const u = f.userData; f.visible = FIRE.amt > 0.02; f.scale.set(u.w * (0.55 + 0.45 * FIRE.amt), u.h * FIRE.amt, 1); f.material.uniforms.uI.value = u.i * FIRE.bri; });
  }
  const fog = new THREE.Fog(0x8a2410, 26, 150);
  const api = {
    group: IG, RX, RZ, PILLAR, glowTex, fxOf, fireMuzzle, clearLive, fill, key, lights: [key],
    bg: new THREE.Color(0x5a0c06), fog, env: makeEnv(0x9a3010), exposure: 1.05,
    buildTerrain, pile, balls: () => balls,
    setFire(amt, bri) { if (amt != null) FIRE.amt = amt; if (bri != null) FIRE.bri = bri; applyFire(); },
    setSmoke(v) { skyMat.uniforms.uSmoke.value = v; },
    setEmbers(v) { eGeo.setDrawRange(0, Math.min(EN, Math.round(EBASE * v))); embers.material.size = 0.2 * (0.8 + 0.2 * Math.min(v, 2)); },
    setHaze(v) { if (v < 0.01) { fog.near = 1e4; fog.far = 2e4; } else { fog.near = 26 / v; fog.far = 150 / v; } },
    live: false,                                       // true: the horde keeps swarming (re-simulated every frame)
    /* height of the ground under a world-space point (the title's falling guns and debris land on it) */
    floorAt(x, z) { return gAt(x - IG.position.x, z - IG.position.z) + IG.position.y; },
    t: 0,
    tick(dt, cam) {
      api.t += dt; const t = api.t;
      const cx = cam.position.x - IG.position.x, cz = cam.position.z - IG.position.z;
      skyMat.uniforms.uT.value = t; sky.position.set(cx, cam.position.y - IG.position.y, cz);
      for (const f of FLAMES) { f.material.uniforms.uT.value = t; f.rotation.y = Math.atan2(cx - f.position.x, cz - f.position.z); }
      if (!dt) return;
      for (let i = 0; i < EN; i++) {
        eLife[i] -= dt; if (eLife[i] <= 0) emberSpawn(i);
        eVel[i * 3] += Math.sin(t * 1.3 + i) * 0.6 * dt;
        ePos[i * 3] += eVel[i * 3] * dt; ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt; ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
      }
      eGeo.attributes.position.needsUpdate = true;
      backGlow.intensity = (4.6 + Math.sin(t * 5.1) * 0.9 + Math.sin(t * 13.7) * 0.4) * FIRE.bri;
      mesaGlow.intensity = (2.8 + Math.sin(t * 4.3 + 1) * 0.6) * FIRE.bri;
      groundGlow.intensity = (1.5 + Math.sin(t * 6.7 + 2) * 0.3) * FIRE.bri;
      DRONES.forEach((d, i) => { d.position.y = d.userData.base + Math.sin(t * 1.7 + i * 2) * 0.25; });
      if (api.live) { stepPile(Math.min(dt, 1 / 30), liveRng); syncHorde(); }
      tickLive(dt);
    },
  };
  buildTerrain(opts.terrainSeed || 20261108);
  pile(opts.count || 300, opts.pileSeed || 1108);
  return api;
}
