'use strict';
/* ============================================================
   BOX ART DIORAMA RIG: a standalone scene, not part of the game proper.
   Built from the game's own pieces so it looks like the game:
     terrain.js + worlddetail.js  the real terraced block terrain (a hand-made heightmap) with its weathering and debris
     robot.js                     the robot (the classic two-cube frame from the box art sketch)
     combat.js makeEnemyMesh()    the real crawler / elite / drone models
     post.js renderFrame()        the game's HDR + bloom + ACES pipeline
   Enemies are dropped in and run through a small ball-physics settle (gravity, ball-ball and ball-terrain contacts,
   steering toward the robot, little hop-ups when blocked), so they heap up against the pillar and over each other the
   way they do in a run.
   Controls: drag = orbit, wheel = zoom, shift/right-drag = pan, Space = freeze time, H = hide the panel.
   ============================================================ */
let player = null;                       // post.js / worlddetail.js check this gameplay global
const S = { shop: null, stage: 1, t: 0 }; // worlddetail.js keep-out check reads S.shop

(function () {
const $id = id => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- palette & atmosphere ---------------- */
LEVEL_PAL.lo.setHSL(0.045, 0.42, 0.13);
LEVEL_PAL.mid.setHSL(0.055, 0.40, 0.25);
LEVEL_PAL.hi.setHSL(0.07, 0.36, 0.42);
LEVEL_PAL.sky.setHex(0x6a1206);
scene.background = new THREE.Color(0x5a0c06);
scene.fog = new THREE.Fog(0x8a2410, 26, 150);
scene.environment = makeEnv(0x9a3010);
camera.near = 0.05; camera.far = 900; camera.fov = 50; camera.updateProjectionMatrix();

/* ---------------- terrain: a hand-made heightmap fed to the game's own terrain builder ---------------- */
const C0 = 42, K0 = C0 * GRID + C0, RX = cellX(K0), RZ = cellZ(K0);   // the robot's pillar cell
const PILLAR = 5;
const hAt = (di, dj) => H[(C0 + dj) * GRID + (C0 + di)];
function setH(di, dj, h) { H[(C0 + dj) * GRID + (C0 + di)] = h; }
function buildTerrain(seed) {
  const rng = mulberry32(seed), n1 = makeNoise(rng), n2 = makeNoise(rng);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const k = j * GRID + i, di = i - C0, dj = j - C0, d = Math.hypot(di, dj);
    if (!inner(k)) { H[k] = 0; continue; }
    let h = 0;
    const b = n1(i / 4.5, j / 4.5);
    if (b > 0.58) h = 1; if (b > 0.72) h = 2;
    // a skyline of mesas and spires further out, mostly behind the robot
    const far = d > 7 ? Math.min(1, (d - 7) / 6) : 0, behind = dj < -3 ? 1 : 0.55;
    if (far > 0 && n2(i / 3.2, j / 3.2) > 0.6 - 0.12 * behind) h = Math.round(6 + n2(i / 2 + 50, j / 2) * 16 * behind + far * 4);
    // keep the foreground (between the camera and the robot) low so the horde reads
    if (dj > 0 && dj < 9 && Math.abs(di) < 6) h = Math.min(h, b > 0.66 ? 1 : 0);
    H[k] = h;
  }
  // the robot's pillar and the steps around it
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (Math.hypot(di, dj) < 2.5) setH(di, dj, Math.min(hAt(di, dj), 1));
  setH(0, 0, PILLAR);
  setH(1, -1, 2); setH(0, -1, 3); setH(-1, -1, 1); setH(-1, 0, 1); setH(1, 0, 2); setH(1, 1, 1);
  // the big left mesa (enemies on top, a drone overhead) and the tall right pillar, as in the sketch
  for (const [di, dj, h] of [[-4, -3, 11], [-3, -3, 11], [-4, -2, 10], [-3, -2, 11], [-5, -3, 9], [-4, -4, 12], [-3, -4, 12],
                             [4, -2, 13], [4, -3, 14], [5, -3, 12], [5, -2, 9], [3, -4, 10]]) setH(di, dj, h);
  // remove whatever the previous build left
  wdClear();
  buildTerrainMesh();
  wdBuildStage();
}

/* ---------------- fire: a burning sky all round, and flame walls ---------------- */
const NOISE_GLSL = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }`;
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 } }, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: NOISE_GLSL + `
  varying vec3 vDir; uniform float uT;
  void main(){
    vec3 d = normalize(vDir); float e = d.y;
    vec3 col = mix(vec3(1.0, 0.28, 0.07), vec3(0.52, 0.05, 0.03), smoothstep(-0.05, 0.28, e));
    col = mix(col, vec3(0.17, 0.01, 0.015), smoothstep(0.3, 0.95, e));
    float smoke = fbm3(vec3(d.x * 2.2 + uT * 0.02, e * 2.6 - uT * 0.05, d.z * 2.2));
    col *= 0.45 + 1.15 * smoke;
    float tall = fbm3(vec3(d.x * 1.4, 3.0, d.z * 1.4));
    float hgt = 0.08 + 0.6 * tall * tall;
    float n = fbm3(vec3(d.x * 5.0, e * 5.0 - uT * 0.7, d.z * 5.0));
    float f = n * 1.3 - max(e, 0.0) / hgt * 0.6 - 0.12;
    float fl = smoothstep(0.0, 0.6, f);
    vec3 fc = mix(vec3(0.95, 0.14, 0.03), vec3(1.7, 0.7, 0.12), smoothstep(0.15, 0.55, fl));
    fc = mix(fc, vec3(3.2, 2.4, 1.4), smoothstep(0.65, 1.0, fl));
    col = mix(col, fc, smoothstep(0.02, 0.3, fl) * smoothstep(-0.12, 0.0, e));
    gl_FragColor = vec4(col, 1.0);
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
sky.renderOrder = -1000; sky.frustumCulled = false; sky.userData.noShadow = true; scene.add(sky);

const flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.translate(0, 0.5, 0);
const FLAMES = [];
function flame(x, y, z, w, h, inten = 1) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSeed: { value: Math.random() * 50 }, uI: { value: inten } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE_GLSL + `
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
  const mesh = new THREE.Mesh(flameGeo, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, 1); mesh.userData.noShadow = true;
  scene.add(mesh); FLAMES.push(mesh); return mesh;
}
function placeFlames() {
  FLAMES.forEach(f => { scene.remove(f); f.material.dispose(); }); FLAMES.length = 0;
  flame(RX + 3, 0, RZ - 13, 11, 19, 0.75);         // the blaze behind the robot (its backlight), a little off to the side so the robot still reads
  flame(RX - 3.5, 0, RZ - 12, 8, 12, 0.6);
  flame(RX - 6, 2, RZ - 15, 12, 17, 0.9);
  flame(RX + 9, 1, RZ - 16, 12, 15, 0.9);
  flame(RX - 12, 10, RZ - 13, 10, 14, 1.0);        // over the left mesa
  flame(RX - 20, 0, RZ - 30, 22, 34, 0.85);        // the towering one up in the top-left of the sketch
  flame(RX + 15, 13, RZ - 11, 6, 9, 0.9);          // on the right pillar
  const rng = mulberry32(911);
  for (let i = 0; i < 16; i++) {                   // more all round, for any camera angle
    const a = rng() * Math.PI * 2, r = 30 + rng() * 40;
    flame(RX + Math.cos(a) * r, 0, RZ + Math.sin(a) * r, 14 + rng() * 14, 18 + rng() * 22, 0.75);
  }
}

/* ---------------- lights ---------------- */
scene.children.forEach(o => { if (o.isHemisphereLight) { o.color.setHex(0xff9a60); o.groundColor.setHex(0x2a0804); o.intensity = 0.4; } });
sun.color.setHex(0xff8a3a); sun.intensity = 1.3;              // from behind, out of the fire: rim light + long shadows toward the camera
sun.position.set(RX + 8, 34, RZ - 32); sun.target.position.set(RX, PILLAR, RZ);
bsun.intensity = 0;
const fill = new THREE.DirectionalLight(0xffd2b0, 0.7); fill.position.set(RX + 10, 12, RZ + 18); fill.target.position.set(RX, PILLAR, RZ);
scene.add(fill); scene.add(fill.target);
const backGlow = new THREE.PointLight(0xff6a18, 5, 26, 1.6); backGlow.position.set(RX, PILLAR + 4, RZ - 6); scene.add(backGlow);
const mesaGlow = new THREE.PointLight(0xff7a20, 3, 22, 1.6); mesaGlow.position.set(RX - 11, 13, RZ - 10); scene.add(mesaGlow);
const groundGlow = new THREE.PointLight(0xff4a10, 1.6, 18, 1.8); groundGlow.position.set(RX - 4, 1.2, RZ - 3); scene.add(groundGlow);

/* ---------------- the robot: two stacked Frame Bodies, Frame Legs, Frame Arms, a gun in each hand ---------------- */
const F = f => FACE_ORDER.indexOf(f);
const GUN_TYPES = Object.keys(WEAPONS).filter(t => !['knife', 'katana', 'chainsaw', 'whirl', 'blades', 'field'].includes(t));
let robot = null, armNeg = null, armPos = null, gunNeg = null, gunPos = null, muzNeg = null, muzPos = null;
const ROBOT_YAW = 0.18;
function buildTheRobot(typeNeg, typePos) {
  const lv = 45;
  const body = mkItem('block', 'body');
  body.slots[F('left')] = mkItem('leg', 'basic', lv); body.slots[F('right')] = mkItem('leg', 'basic', lv);
  const top = mkItem('block', 'body'); body.slots[F('top')] = top;
  const aN = mkItem('arm', 'basic', lv), aP = mkItem('arm', 'basic', lv);
  aN.weapon = mkItem('weapon', typeNeg, lv); aP.weapon = mkItem('weapon', typePos, lv);
  top.slots[F('left')] = aN; top.slots[F('right')] = aP;
  const L = { body };
  const sb = [BUILD_ROOT, ROOT_BARE, BODY_IDX];
  const m = buildRobot(L, { stand: false });
  BUILD_ROOT = sb[0]; ROOT_BARE = sb[1]; BODY_IDX = sb[2];
  if (robot) scene.remove(robot);
  robot = m; scene.add(robot);
  robot.position.set(RX, PILLAR, RZ); robot.rotation.y = ROBOT_YAW;
  const reg = robot.userData;
  let A = reg.partOf.get(aN), B = reg.partOf.get(aP);
  robot.updateMatrixWorld(true);
  // which arm ended up on which side of the screen (the 'left' face is -x in the robot's frame)
  if (A.getWorldPosition(V3()).x > B.getWorldPosition(V3()).x) { [A, B] = [B, A]; [aN.weapon, aP.weapon] = [aP.weapon, aN.weapon]; }
  armNeg = A; armPos = B; gunNeg = aN.weapon; gunPos = aP.weapon;
  muzNeg = reg.muzzleOf.get(aN.weapon) || null; muzPos = reg.muzzleOf.get(aP.weapon) || null;
  // a wide, planted stance
  for (const p of reg.legs) {
    const ik = p.userData.ik; if (!ik) continue;
    const s = Math.sign(p.userData.out.x) || 1;
    legPose(ik, V3(s * 0.58, -1.13, 0.1));
  }
  robot.updateMatrixWorld(true);
  let minY = 1e9;
  for (const p of reg.legs) if (p.userData.ik) minY = Math.min(minY, p.userData.ik.foot.getWorldPosition(V3()).y - p.userData.ik.footH);
  if (minY < 1e8) robot.position.y += PILLAR - minY;
  applyPose($id('poseSel').value);
  buildFlashes();
}

/* arm aims, in the robot's own frame (x = screen right when it faces the camera, y up, z toward the camera) */
const POSES = {
  boxart: { neg: [-0.8, -0.55, 0.5], pos: [0.62, 0.78, 0.12] },     // the sketch: one thrust down-left, one flung up-right
  raisedR: { neg: [-0.25, -0.1, 1], pos: [0.3, 1, 0.12] },
  raisedL: { neg: [-0.3, 1, 0.12], pos: [0.25, -0.1, 1] },
  both: { neg: [-0.5, 1, 0.1], pos: [0.5, 1, 0.1] },
  wide: { neg: [-1, 0.05, 0.35], pos: [1, 0.05, 0.35] },
  forward: { neg: [-0.12, -0.05, 1], pos: [0.12, -0.05, 1] },
};
function aimArm(arm, d) {
  if (!arm) return;
  arm.quaternion.identity(); robot.updateMatrixWorld(true);
  const p = arm.getWorldPosition(V3()), dir = V3(d[0], d[1], d[2]).normalize().applyQuaternion(robot.quaternion);
  const t = p.addScaledVector(dir, 6);
  arm.lookAt(t.x, t.y, t.z);
}
function applyPose(mode) {
  const P = POSES[mode] || POSES.boxart;
  aimArm(armNeg, P.neg); aimArm(armPos, P.pos);
  robot.updateMatrixWorld(true);
}

/* ---------------- enemies: dropped in, then settled with simple ball physics ---------------- */
const ENEMY_RED = 0xc4262e;
const tplCache = {};
function enemyTemplate(shape, elite) {
  const key = shape + (elite ? 'E' : '');
  if (!tplCache[key]) tplCache[key] = makeEnemyMesh('crawler', elite ? ELITE.color : ENEMY_RED, shape);
  return tplCache[key];
}
const HORDE = new THREE.Group(); scene.add(HORDE);
let balls = [];
const GRAV = 34;
function makeBalls(count, seed) {
  const rng = mulberry32(seed); balls = [];
  const add = (x, z, tx, tz, y) => {
    const elite = rng() < 0.055, shape = rng() < 0.5 ? 'sphere' : (rng() < 0.85 ? 'cube' : 'dome');
    const r = ETYPES.crawler.r * (elite ? ELITE.sizeMul : 1);
    const gy = groundAt(x, z);
    const b = { x, y: (y != null ? y : gy + r + rng() * 6), z, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, r, elite, shape, tx, tz, spd: 4.6 * (0.85 + rng() * 0.3), up: false, spin: rng() * 6.28, tilt: (rng() - 0.5) * 0.7, roll: (rng() - 0.5) * 0.7 };
    b.px = b.x; b.py = b.y; b.pz = b.z; balls.push(b);
  };
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, rr = 2.2 + Math.sqrt(rng()) * 15;
    const x = RX + Math.cos(a) * rr, z = RZ + Math.sin(a) * rr;
    if (groundAt(x, z) > 3.5) { i--; continue; }                     // not inside the tall blocks
    add(x, z, RX, RZ);
  }
  // a few up on the left mesa, as in the sketch
  const mx = cellX(K0 - 3 * GRID - 4) + 1.5, mz = cellZ(K0 - 3 * GRID - 4) + 1.5;
  for (let i = 0; i < 4; i++) add(mx + (rng() - 0.5) * 3, mz + (rng() - 0.5) * 3, mx + 2, mz + 3, groundAt(mx, mz) + 1 + i);
}
function collideTerrain(b) {
  const i0 = Math.floor((b.x + HALF) / CELL), j0 = Math.floor((b.z + HALF) / CELL);
  let up = false;
  for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
    const k = j * GRID + i, h = H[k], cx = cellX(k), cz = cellZ(k);
    const qx = clamp(b.x, cx - CELL / 2, cx + CELL / 2), qy = clamp(b.y, -10, h), qz = clamp(b.z, cz - CELL / 2, cz + CELL / 2);
    let dx = b.x - qx, dy = b.y - qy, dz = b.z - qz; const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= b.r * b.r) continue;
    if (d2 < 1e-10) { b.y = h + b.r; up = true; continue; }
    const d = Math.sqrt(d2), k2 = (b.r - d) / d;
    b.x += dx * k2; b.y += dy * k2; b.z += dz * k2;
    if (dy / d > 0.5) up = true;
  }
  return up;
}
function keepOffRobot(b) {
  // the robot and the top of its pillar stay clear
  // (in the sketch the horde surges up to the pillar's lip but the robot stands clear above it)
  if (b.y < PILLAR - 0.5) return;
  const dx = b.x - RX, dz = b.z - RZ, d = Math.hypot(dx, dz), R = 2.1 + b.r;
  if (d >= R) return;
  const s = d > 1e-6 ? R / d : 0; b.x = RX + (s ? dx * s : R); b.z = RZ + (s ? dz * s : 0);
}
const hash = new Map();
function stepPile(dt, steer, rng) {
  // integrate
  for (const b of balls) {
    b.px = b.x; b.py = b.y; b.pz = b.z;
    if (steer) {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz) || 1;
      const want = d > 1.4 ? b.spd : 0;
      b.vx += (dx / d * want - b.vx) * Math.min(1, dt * 5); b.vz += (dz / d * want - b.vz) * Math.min(1, dt * 5);
      // blocked against the pile or a ledge: hop up onto it, like the game's crawlers do
      if (b.up && Math.hypot(b.vx, b.vz) < 1.4 && rng() < dt * 0.9) b.vy = 5.5 + rng() * 2;
    } else { b.vx *= 0.9; b.vz *= 0.9; }
    b.vy -= GRAV * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.up = false;
  }
  // contacts (a few relaxation passes)
  const CS = 2.0;
  for (let it = 0; it < 3; it++) {
    hash.clear();
    for (let n = 0; n < balls.length; n++) {
      const b = balls[n], key = (Math.floor(b.x / CS) + 500) * 100000 + (Math.floor(b.z / CS) + 500);
      let a = hash.get(key); if (!a) hash.set(key, a = []); a.push(n);
    }
    for (let n = 0; n < balls.length; n++) {
      const b = balls[n], gx = Math.floor(b.x / CS), gz = Math.floor(b.z / CS);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = hash.get((gx + ox + 500) * 100000 + (gz + oz + 500)); if (!a) continue;
        for (const m of a) {
          if (m <= n) continue;
          const c = balls[m], dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z, rr = b.r + c.r, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), pen = (rr - d) / d;
          const wb = c.elite && !b.elite ? 0.7 : b.elite && !c.elite ? 0.3 : 0.5, wc = 1 - wb;
          b.x -= dx * pen * wb; b.y -= dy * pen * wb; b.z -= dz * pen * wb;
          c.x += dx * pen * wc; c.y += dy * pen * wc; c.z += dz * pen * wc;
          if (dy / d < -0.45) b.up = true; else if (dy / d > 0.45) c.up = true;
          // pushing into someone in front also counts as blocked
          if (Math.abs(dy / d) < 0.5) { b.up = b.up || true; c.up = c.up || true; }
        }
      }
    }
    for (const b of balls) { if (collideTerrain(b)) b.up = true; keepOffRobot(b); }
  }
  // velocities from what actually happened (position-based dynamics), with a little contact friction
  for (const b of balls) {
    const vy = (b.y - b.py) / dt;
    b.vx = (b.x - b.px) / dt; b.vz = (b.z - b.pz) / dt; b.vy = Math.min(vy, b.vy > 0 ? b.vy : vy);
    if (b.up) { b.vx *= 0.92; b.vz *= 0.92; }
    // a big positional correction must never turn into a launch
    b.vx = clamp(b.vx, -12, 12); b.vy = clamp(b.vy, -30, 12); b.vz = clamp(b.vz, -12, 12);
  }
}
let meshes = [];
function makeMeshes() {
  meshes.forEach(m => HORDE.remove(m)); meshes = [];
  for (const b of balls) {
    const m = enemyTemplate(b.shape, b.elite).clone();
    if (b.elite) m.scale.setScalar(ELITE.sizeMul);
    HORDE.add(m); meshes.push(m);
  }
  syncMeshes();
}
function syncMeshes() {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i], m = meshes[i]; if (!m) continue;
    m.position.set(b.x, b.y, b.z);
    // eyes on the robot; tumbled a little from being climbed over
    const yaw = Math.atan2(b.tx - b.x, b.tz - b.z);
    m.rotation.set(b.tilt, yaw, b.roll, 'YXZ');
  }
}
function pile(count, seed) {
  makeBalls(count, seed);
  const rng = mulberry32(seed * 7 + 1), dt = 1 / 60;
  for (let s = 0; s < 720; s++) stepPile(dt, true, rng);
  makeMeshes();
}
const pileRng = mulberry32(5);

/* drones circling overhead */
const DRONES = [];
function placeDrones() {
  DRONES.forEach(d => scene.remove(d)); DRONES.length = 0;
  const tpl = makeEnemyMesh('drone', 0xb43cc0);
  for (const [x, y, z] of [[RX - 7.5, 13.2, RZ - 7], [RX + 9, 15.5, RZ - 4], [RX - 2, 17, RZ - 14]]) {
    const d = tpl.clone(); d.position.set(x, y, z); d.rotation.set(0.2, Math.atan2(RX - x, RZ - z), -0.25); d.userData.base = y;
    scene.add(d); DRONES.push(d);
  }
}

/* ---------------- guns: held muzzle bursts + live shots ---------------- */
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,200,120,0.7)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const GLOW = glowTex();
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
let fxScale = 1.4;

/* the held burst: a glow, a fan of short rays (the claw-shaped blast in the sketch) and a light, riding on the muzzle */
const flashes = [];
function makeFlash(muz, type) {
  if (!muz) return null;
  const F = fxOf(type), g = new THREE.Group();
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: F.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(spr);
  const rayMat = new THREE.MeshBasicMaterial({ color: F.color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const piv = new THREE.Group(), ray = new THREE.Mesh(geoBox, rayMat);
    const a = (i / 8 - 0.5) * 1.1, b = (Math.random() - 0.5) * 0.5;
    piv.rotation.set(b, a, 0); piv.add(ray); g.add(piv); rays.push({ ray, k: 0.6 + Math.random() * 0.6 });
  }
  const light = new THREE.PointLight(F.color, 1.5, 7, 1.8); g.add(light);
  muz.add(g);
  const f = { g, spr, rays, light, type }; flashes.push(f); return f;
}
function buildFlashes() {
  flashes.forEach(f => f.g.parent && f.g.parent.remove(f.g)); flashes.length = 0;
  makeFlash(muzNeg, gunNeg.type); makeFlash(muzPos, gunPos.type);
  syncFlashVis();
}
function syncFlashVis() { const on = $id('holdFlash').checked; flashes.forEach(f => f.g.visible = on); }
function tickFlashes(t) {
  for (const f of flashes) {
    const s = fxScale, fl = 0.85 + 0.3 * Math.sin(t * 37 + f.rays.length) * Math.sin(t * 23);
    f.spr.scale.setScalar(1.3 * s * fl);
    f.rays.forEach((r, i) => {
      const len = (0.55 + 0.6 * r.k * (0.7 + 0.3 * Math.sin(t * 29 + i * 2.1))) * s;
      r.ray.scale.set(0.035 * s, 0.035 * s, len); r.ray.position.set(0, 0, len / 2 + 0.05);
    });
    f.light.intensity = 1.5 * fl * s;
  }
}

/* live shots */
const live = [];
const _p = V3(0, 0, 0), _d = V3(0, 0, 0), _q = new THREE.Quaternion();
function spawnFlash(p, hex, s, life) {
  const m = new THREE.SpriteMaterial({ map: GLOW, color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(s); scene.add(sp); live.push({ o: sp, m, life, max: life, kind: 'flash', s });
}
const streakMats = {};
function spawnStreak(p, d, len, speed, hex, thick, life) {
  const m = streakMats[hex] || (streakMats[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const mesh = new THREE.Mesh(geoBox, m.clone()); mesh.scale.set(thick, thick, len); mesh.position.copy(p).addScaledVector(d, len / 2); mesh.lookAt(mesh.position.clone().add(d)); scene.add(mesh);
  live.push({ o: mesh, m: mesh.material, life, max: life, kind: 'streak', v: d.clone().multiplyScalar(speed) });
}
function spawnArc(p, d) {
  const pts = [], tgt = p.clone().addScaledVector(d, 4 + Math.random() * 2);
  for (let i = 0; i <= 10; i++) { const k = i / 10, q = p.clone().lerp(tgt, k); if (i && i < 10) { q.x += (Math.random() - 0.5) * 0.5; q.y += (Math.random() - 0.5) * 0.5; q.z += (Math.random() - 0.5) * 0.3; } pts.push(q); }
  const g = new THREE.BufferGeometry().setFromPoints(pts), m = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, blending: THREE.AdditiveBlending });
  const l = new THREE.Line(g, m); scene.add(l); live.push({ o: l, m, g, life: 0.1, max: 0.1, kind: 'fade' });
}
function spawnRing(p, d, hex) {
  const g = new THREE.RingGeometry(0.5, 0.58, 36), m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const r = new THREE.Mesh(g, m); r.position.copy(p).addScaledVector(d, 0.4); r.lookAt(r.position.clone().add(d)); scene.add(r);
  live.push({ o: r, m, g, life: 0.5, max: 0.5, kind: 'ring', r0: 0.6, r1: 3.2, v: d.clone().multiplyScalar(6) });
}
function spawnMissile(p, d) {
  const g = new THREE.Group(); g.add(bx(0.1, 0.1, 0.34, 0xe2465c, 0, 0, 0, 0xff3a28));
  const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); tail.position.z = -0.3; tail.scale.setScalar(0.7); g.add(tail);
  g.position.copy(p); g.lookAt(p.clone().add(d)); scene.add(g);
  live.push({ o: g, life: 1.4, max: 1.4, kind: 'move', v: d.clone().multiplyScalar(16) });
}
function fireMuzzle(muz, type) {
  if (!muz) return;
  muz.updateWorldMatrix(true, false); muz.getWorldPosition(_p); muz.getWorldQuaternion(_q);
  _d.set(0, 0, 1).applyQuaternion(_q);
  const F = fxOf(type), p = _p.clone(), d = _d.clone(), s = fxScale;
  if (F.missile) { spawnMissile(p, d); spawnFlash(p, 0xffa040, 1.2 * s, 0.14); return; }
  if (F.arc) { spawnArc(p, d); spawnFlash(p, 0x58cfd6, 0.8 * s, 0.08); return; }
  if (F.ring) { spawnRing(p, d, F.color); spawnFlash(p, F.color, 1.1 * s, 0.18); return; }
  if (F.flame) {
    for (let i = 0; i < 4; i++) {
      const v = d.clone().multiplyScalar(6 + Math.random() * 3); v.x += (Math.random() - 0.5) * 1.4; v.y += (Math.random() - 0.5) * 1.4 + 0.4; v.z += (Math.random() - 0.5) * 1.4;
      const m = new THREE.SpriteMaterial({ map: GLOW, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(0.5 * s); scene.add(sp);
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
    if (f.life <= 0) { scene.remove(f.o); if (f.m && f.kind !== 'move') f.m.dispose(); if (f.g) f.g.dispose(); live.splice(i, 1); }
  }
}

/* ---------------- embers ---------------- */
const EN = 260, ePos = new Float32Array(EN * 3), eVel = new Float32Array(EN * 3), eLife = new Float32Array(EN);
const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.2, map: GLOW, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
embers.frustumCulled = false; embers.userData.noShadow = true; scene.add(embers);
function emberSpawn(i, first) {
  const a = Math.random() * Math.PI * 2, r = Math.random() * 18;
  ePos[i * 3] = RX + Math.cos(a) * r; ePos[i * 3 + 1] = first ? Math.random() * 16 : Math.random() * 2; ePos[i * 3 + 2] = RZ + Math.sin(a) * r - 4;
  eVel[i * 3] = (Math.random() - 0.5) * 0.6 + 0.3; eVel[i * 3 + 1] = 1 + Math.random() * 2; eVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  eLife[i] = 3 + Math.random() * 5;
}
for (let i = 0; i < EN; i++) emberSpawn(i, true);
function tickEmbers(dt, t) {
  for (let i = 0; i < EN; i++) {
    eLife[i] -= dt; if (eLife[i] <= 0) emberSpawn(i);
    eVel[i * 3] += Math.sin(t * 1.3 + i) * 0.6 * dt;
    ePos[i * 3] += eVel[i * 3] * dt; ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt; ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
  }
  eGeo.attributes.position.needsUpdate = true;
}

/* ---------------- camera: orbit / zoom / pan, a portrait box-art crop guide, hi-res export ---------------- */
const CAM0 = { target: V3(RX, PILLAR + 1.35, RZ), yaw: 0.22, pitch: 0.03, dist: 8.2, fov: 50 };
const cam = { target: CAM0.target.clone(), yaw: CAM0.yaw, pitch: CAM0.pitch, dist: CAM0.dist };
function updateCamera() {
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.target);
}
const cv = $id('c'); let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2, yaw: cam.yaw, pitch: cam.pitch, t: cam.target.clone() }; cv.classList.add('dragging'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', () => { drag = null; cv.classList.remove('dragging'); });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / innerHeight, dy = (e.clientY - drag.y) / innerHeight;
  if (drag.pan) {
    const right = V3(0, 0, 0).setFromMatrixColumn(camera.matrixWorld, 0), up = V3(0, 0, 0).setFromMatrixColumn(camera.matrixWorld, 1);
    cam.target.copy(drag.t).addScaledVector(right, -dx * cam.dist * 0.9).addScaledVector(up, dy * cam.dist * 0.9);
  } else { cam.yaw = drag.yaw - dx * 4; cam.pitch = clamp(drag.pitch + dy * 3, -1.2, 1.45); }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 1.5, 80); }, { passive: false });

const FRAMES = { portrait: 1053 / 1494, landscape: 16 / 9, full: 0 };
function frameRect() {
  const a = FRAMES[$id('frameSel').value], W = innerWidth, Hh = innerHeight;
  if (!a) return { x: 0, y: 0, w: W, h: Hh, a: W / Hh };
  let h = Hh, w = h * a; if (w > W) { w = W; h = w / a; }
  return { x: (W - w) / 2, y: (Hh - h) / 2, w, h, a };
}
function layoutFrame() {
  const r = frameRect(), el = $id('frame');
  el.hidden = $id('frameSel').value === 'full';
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
addEventListener('resize', layoutFrame);
function savePNG() {
  const r = frameRect(), longSide = 2600;
  const W = r.a >= 1 ? longSide : Math.round(longSide * r.a), Hh = r.a >= 1 ? Math.round(longSide / r.a) : longSide;
  const pr = renderer.getPixelRatio(), fov0 = camera.fov;
  // the crop shows r.h of the window's height: export with the field of view that crop actually covers
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov0) / 2) * r.h / innerHeight));
  renderer.setPixelRatio(1); renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.updateProjectionMatrix();
  renderFrame(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  camera.fov = fov0; renderer.setPixelRatio(pr); resize(); renderFrame(scene, camera);
  const a = document.createElement('a'); a.download = `scrap-survivors-boxart-${W}x${Hh}.png`; a.href = url; a.click();
}

/* ---------------- UI ---------------- */
const selNeg = $id('gunL'), selPos = $id('gunR');
for (const t of GUN_TYPES) { const n = WEAPONS[t].name || t; selNeg.add(new Option(n, t)); selPos.add(new Option(n, t)); }
selNeg.value = 'shotgun'; selPos.value = 'shotgun';
const rebuild = () => buildTheRobot(selNeg.value, selPos.value);
selNeg.onchange = rebuild; selPos.onchange = rebuild;
$id('poseSel').onchange = e => { applyPose(e.target.value); };
$id('holdFlash').onchange = syncFlashVis;
$id('fxSize').oninput = e => { fxScale = +e.target.value; $id('fxOut').textContent = fxScale.toFixed(2) + '×'; }; $id('fxOut').textContent = fxScale.toFixed(2) + '×';
let firing = true;
const fireBtn = $id('fireBtn');
const setFiring = on => { firing = on; fireBtn.classList.toggle('on', on); fireBtn.textContent = on ? 'Shooting · click to stop' : 'Start shooting'; };
fireBtn.onclick = () => setFiring(!firing); setFiring(true);
let frozen = false;
const freezeBtn = $id('freezeBtn');
const setFrozen = on => { frozen = on; freezeBtn.classList.toggle('on', on); freezeBtn.textContent = on ? 'Frozen · Space to resume' : 'Freeze time (Space)'; };
freezeBtn.onclick = () => setFrozen(!frozen);
$id('countIn').oninput = e => { $id('countOut').textContent = e.target.value; };
$id('repileBtn').onclick = () => { pile(+$id('countIn').value, (pileRng() * 1e9) | 0); };
$id('terrainBtn').onclick = () => { buildTerrain((Math.random() * 1e9) | 0); pile(+$id('countIn').value, (pileRng() * 1e9) | 0); };
$id('fovIn').oninput = e => { camera.fov = +e.target.value; camera.updateProjectionMatrix(); $id('fovOut').textContent = e.target.value + '°'; };
$id('frameSel').onchange = layoutFrame;
$id('expIn').oninput = e => { MAT_OUT.uniforms.exposure.value = +e.target.value; $id('expOut').textContent = (+e.target.value).toFixed(2); };
MAT_OUT.uniforms.exposure.value = +$id('expIn').value;
$id('snapBtn').onclick = savePNG;
$id('resetCamBtn').onclick = () => { cam.target.copy(CAM0.target); cam.yaw = CAM0.yaw; cam.pitch = CAM0.pitch; cam.dist = CAM0.dist; camera.fov = CAM0.fov; camera.updateProjectionMatrix(); $id('fovIn').value = CAM0.fov; $id('fovOut').textContent = CAM0.fov + '°'; };
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) { if (e.code !== 'Space') return; }
  if (e.code === 'Space') { e.preventDefault(); setFrozen(!frozen); }
  else if (e.key.toLowerCase() === 'h') { const hide = $id('panel').style.display !== 'none'; $id('panel').style.display = hide ? 'none' : ''; $id('hint').style.display = hide ? 'none' : ''; }
});

/* ---------------- boot ---------------- */
buildTerrain(20261108);
placeFlames();
placeDrones();
buildTheRobot(selNeg.value, selPos.value);
pile(+$id('countIn').value, 1108);
layoutFrame();
window.__boxart = { cam, applyPose, robot: () => robot, setFrozen, POSES, pile, balls: () => balls };

let last = performance.now(), simT = 0, acc = { neg: 0, pos: 0 };
const swarmRng = mulberry32(77);
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), rdt = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = frozen ? 0 : rdt; simT += dt;
  skyMat.uniforms.uT.value = simT; FLAMES.forEach(f => { f.material.uniforms.uT.value = simT; f.rotation.y = Math.atan2(camera.position.x - f.position.x, camera.position.z - f.position.z); });
  sky.position.copy(camera.position);
  if (dt) {
    tickEmbers(dt, simT); tickLive(dt); tickFlashes(simT);
    backGlow.intensity = 4.6 + Math.sin(simT * 5.1) * 0.9 + Math.sin(simT * 13.7) * 0.4;
    mesaGlow.intensity = 2.8 + Math.sin(simT * 4.3 + 1) * 0.6;
    groundGlow.intensity = 1.5 + Math.sin(simT * 6.7 + 2) * 0.3;
    DRONES.forEach((d, i) => { d.position.y = d.userData.base + Math.sin(simT * 1.7 + i * 2) * 0.25; });
    if ($id('swarmLive').checked) { stepPile(dt, true, swarmRng); syncMeshes(); }
    const style = $id('fireStyle').value;
    if (firing && style !== 'off') {
      for (const [side, muz, gun] of [['neg', muzNeg, gunNeg], ['pos', muzPos, gunPos]]) {
        if (!gun) continue;
        acc[side] += dt;
        const period = style === 'single' ? 0.9 : Math.max(0.05, fxOf(gun.type).rate);
        if (acc[side] >= period) { acc[side] = 0; fireMuzzle(muz, gun.type); }
      }
    }
  }
  updateCamera();
  renderFrame(scene, camera);
}
requestAnimationFrame(frame);
})();
