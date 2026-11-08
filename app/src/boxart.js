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

/* ---------------- the scene: the shared Inferno diorama (inferno.js), with the pillar top at the origin ---------------- */
scene.children.slice().forEach(o => { if (o.isLight) o.visible = false; });      // gfx.js's arena lights: the diorama brings its own
bsun.intensity = 0;
const INF = makeInferno({ fxScene: scene });
scene.add(INF.group);
scene.background = INF.bg; scene.fog = INF.fog; scene.environment = INF.env;
camera.near = 0.05; camera.far = 900; camera.fov = 50; camera.updateProjectionMatrix();
const fill = INF.fill, GLOW = INF.glowTex, fxOf = INF.fxOf;
let fxScale = 1.4;

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
  robot.position.set(0, 0, 0); robot.rotation.y = ROBOT_YAW;
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
  if (minY < 1e8) robot.position.y -= minY;
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

/* ---------------- camera: orbit / zoom / pan, a portrait box-art crop guide, hi-res export ---------------- */
const CAM0 = { target: V3(0, 1.35, 0), yaw: 0.22, pitch: 0.03, dist: 8.2, fov: 50 };
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


/* ---------------- look & fire controls ----------------
   The game's final pass (post.js MAT_OUT: HDR -> bloom -> ACES) is extended here, for this page only, with a grade
   after the tone map: black/white points, contrast, saturation, warmth and vignette. Glare = the bloom's strength and
   threshold. Fire = the sky's flame height, the flame walls' size, all the fire's brightness (lights too), smoke, embers
   and haze. Settings are remembered in this browser. */
MAT_OUT.fragmentShader = `uniform sampler2D tex; uniform sampler2D bloom; uniform float useBloom, strength, exposure;
  uniform float uContrast, uBlack, uWhite, uSat, uWarm, uVig; varying vec2 vUv;
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main(){
    vec3 c = texture2D(tex, vUv).rgb;
    vec3 lin = pow(max(c, vec3(0.0)), vec3(2.2));
    if (useBloom > 0.5) lin += pow(max(texture2D(bloom, vUv).rgb, vec3(0.0)), vec3(2.2)) * strength;
    vec3 o = pow(aces(lin * exposure), vec3(1.0 / 2.2));
    o = clamp((o - uBlack) / max(uWhite - uBlack, 0.02), 0.0, 1.0);
    o = clamp((o - 0.5) * uContrast + 0.5, 0.0, 1.0);
    float l = dot(o, vec3(0.2126, 0.7152, 0.0722)); o = max(mix(vec3(l), o, uSat), 0.0);
    o *= vec3(1.0 + uWarm * 0.14, 1.0 + uWarm * 0.02, 1.0 - uWarm * 0.16);
    vec2 d = vUv - 0.5; o *= 1.0 - dot(d, d) * uVig;
    gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
  }`;
Object.assign(MAT_OUT.uniforms, { uContrast: { value: 1 }, uBlack: { value: 0 }, uWhite: { value: 1 }, uSat: { value: 1 }, uWarm: { value: 0 }, uVig: { value: 0.35 } });
MAT_OUT.needsUpdate = true;

const fmt2 = v => (+v).toFixed(2), pct = v => Math.round(v * 100) + '%';
const CONTROLS = {
  look: [
    { k: 'exposure', label: 'Exposure', min: 0.4, max: 2.5, step: 0.05, def: 1.05, set: v => MAT_OUT.uniforms.exposure.value = v, f: fmt2 },
    { k: 'glare', label: 'Glare', min: 0, max: 1, step: 0.01, def: 0.35, set: v => MAT_OUT.uniforms.strength.value = v, f: fmt2 },
    { k: 'glareThr', label: 'Glare threshold (lower = more glows)', min: 0.3, max: 2.5, step: 0.05, def: 1.05, set: v => MAT_BRIGHT.uniforms.thr.value = v, f: fmt2 },
    { k: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.02, def: 1, set: v => MAT_OUT.uniforms.uContrast.value = v, f: fmt2 },
    { k: 'black', label: 'Black level (crush shadows)', min: 0, max: 0.35, step: 0.005, def: 0, set: v => MAT_OUT.uniforms.uBlack.value = v, f: fmt2 },
    { k: 'white', label: 'White level (lower = brighter)', min: 0.5, max: 1.3, step: 0.01, def: 1, set: v => MAT_OUT.uniforms.uWhite.value = v, f: fmt2 },
    { k: 'sat', label: 'Saturation', min: 0, max: 2, step: 0.02, def: 1, set: v => MAT_OUT.uniforms.uSat.value = v, f: fmt2 },
    { k: 'warm', label: 'Warmth', min: -1, max: 1, step: 0.02, def: 0, set: v => MAT_OUT.uniforms.uWarm.value = v, f: fmt2 },
    { k: 'vig', label: 'Vignette', min: 0, max: 1.6, step: 0.02, def: 0.35, set: v => MAT_OUT.uniforms.uVig.value = v, f: fmt2 },
    { k: 'front', label: 'Light on the robot', min: 0, max: 2.5, step: 0.05, def: 0.7, set: v => fill.intensity = v, f: fmt2 },
  ],
  fire: [
    { k: 'fireAmt', label: 'Fire amount', min: 0, max: 1.6, step: 0.02, def: 1, set: v => INF.setFire(v, null), f: pct },
    { k: 'fireBri', label: 'Fire brightness', min: 0, max: 2.5, step: 0.02, def: 1, set: v => INF.setFire(null, v), f: pct },
    { k: 'smoke', label: 'Smoke', min: 0, max: 2.5, step: 0.05, def: 1, set: v => INF.setSmoke(v), f: pct },
    { k: 'embers', label: 'Embers', min: 0, max: 3.4, step: 0.05, def: 1, set: v => INF.setEmbers(v), f: pct },
    { k: 'haze', label: 'Haze', min: 0, max: 3, step: 0.05, def: 1, set: v => INF.setHaze(v), f: pct },
  ],
};
const LOOK_KEY = 'scrapBoxartLook';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') || {}; } catch (e) { saved = {}; }
function persist() { try { const o = {}; for (const grp of Object.values(CONTROLS)) for (const c of grp) o[c.k] = c.v; localStorage.setItem(LOOK_KEY, JSON.stringify(o)); } catch (e) {} }
function buildLookUI() {
  for (const [grp, list] of Object.entries(CONTROLS)) {
    const box = $id(grp + 'Box');
    for (const c of list) {
      const lab = document.createElement('label'), out = document.createElement('span'), inp = document.createElement('input');
      out.className = 'val'; lab.textContent = c.label + ' '; lab.appendChild(out);
      Object.assign(inp, { type: 'range', min: c.min, max: c.max, step: c.step });
      const put = (v, save) => { c.v = v; inp.value = v; out.textContent = c.f(v); c.set(v); if (save) persist(); };
      inp.oninput = () => put(+inp.value, true);
      inp.ondblclick = () => put(c.def, true);                   // double-click a slider to reset just that one
      c.put = put;
      box.appendChild(lab); box.appendChild(inp);
      put(typeof saved[c.k] === 'number' ? saved[c.k] : c.def, false);
    }
    const rb = document.createElement('button'); rb.textContent = 'Reset ' + (grp === 'look' ? 'look' : 'fire');
    rb.onclick = () => { list.forEach(c => c.put(c.def, false)); persist(); };
    box.appendChild(rb);
  }
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
const pileRng = mulberry32(5);
$id('repileBtn').onclick = () => { INF.pile(+$id('countIn').value, (pileRng() * 1e9) | 0); };
$id('terrainBtn').onclick = () => { INF.buildTerrain((Math.random() * 1e9) | 0); INF.pile(+$id('countIn').value, (pileRng() * 1e9) | 0); };
$id('swarmLive').onchange = e => { INF.live = e.target.checked; };
$id('fovIn').oninput = e => { camera.fov = +e.target.value; camera.updateProjectionMatrix(); $id('fovOut').textContent = e.target.value + '°'; };
$id('frameSel').onchange = layoutFrame;
$id('snapBtn').onclick = savePNG;
$id('resetCamBtn').onclick = () => { cam.target.copy(CAM0.target); cam.yaw = CAM0.yaw; cam.pitch = CAM0.pitch; cam.dist = CAM0.dist; camera.fov = CAM0.fov; camera.updateProjectionMatrix(); $id('fovIn').value = CAM0.fov; $id('fovOut').textContent = CAM0.fov + '°'; };
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) { if (e.code !== 'Space') return; }
  if (e.code === 'Space') { e.preventDefault(); setFrozen(!frozen); }
  else if (e.key.toLowerCase() === 'h') { const hide = $id('panel').style.display !== 'none'; $id('panel').style.display = hide ? 'none' : ''; $id('hint').style.display = hide ? 'none' : ''; }
});

/* ---------------- boot ---------------- */
buildLookUI();
buildTheRobot(selNeg.value, selPos.value);
if (+$id('countIn').value !== 300) INF.pile(+$id('countIn').value, 1108);
layoutFrame();
window.__boxart = { cam, applyPose, robot: () => robot, setFrozen, POSES, INF };

let last = performance.now(), simT = 0, acc = { neg: 0, pos: 0 };
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), rdt = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = frozen ? 0 : rdt; simT += dt;
  INF.tick(dt, camera);
  if (dt) {
    tickFlashes(simT);
    const style = $id('fireStyle').value;
    if (firing && style !== 'off') {
      for (const [side, muz, gun] of [['neg', muzNeg, gunNeg], ['pos', muzPos, gunPos]]) {
        if (!gun) continue;
        acc[side] += dt;
        const period = style === 'single' ? 0.9 : Math.max(0.05, fxOf(gun.type).rate);
        if (acc[side] >= period) { acc[side] = 0; INF.fireMuzzle(muz, gun.type, fxScale); }
      }
    }
  }
  updateCamera();
  INF.tick(0, camera);       // keep the sky and flame billboards on the camera after it moved
  renderFrame(scene, camera);
}
requestAnimationFrame(frame);
})();
