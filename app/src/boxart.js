'use strict';
/* ============================================================
   BOX ART DIORAMA RIG — standalone scene (not part of the game proper).
   Reuses the real asset pipeline (gfx.js materials, robot.js buildRobot, combat.js makeEnemyMesh,
   post.js's HDR/bloom/ACES render path) to pose the player's robot on a mound of crawlers with guns
   firing, matching the hand-drawn box art mockup: warm red/orange sky, embers, robot with an arm
   raised standing triumphant on a pile of round red enemies.
   Camera: left-drag to orbit, wheel to zoom, shift-drag (or right-drag) to pan. "Save PNG" grabs a frame.
   ============================================================ */

/* post.js's renderFrame() checks `player` (the live gameplay singleton, not used here) to follow the sun shadow box */
let player = null;

/* ---------- scene dressing: warm box-art sky instead of the game's cool arena sky ---------- */
scene.background = new THREE.Color(0x3a1206);
scene.fog = new THREE.Fog(0x4a1808, 10, 55);
scene.environment = ENV.base = (function () { const t = makeEnv(0x6a2208); return t; })();
sun.color.setHex(0xff8a3a); sun.intensity = 1.8; sun.position.set(-14, 22, -10); sun.target.position.set(0, 2, 0);
sun.castShadow = true;
bsun.intensity = 0; // unused build-preview sun, keep dark
scene.children.forEach(o => { if (o.isHemisphereLight) { o.color.setHex(0xffb37a); o.groundColor.setHex(0x1a0803); o.intensity = 0.85; } });
const emberLight = new THREE.PointLight(0xff5a1a, 4.0, 22, 2); emberLight.position.set(0, 1.6, 2.2); scene.add(emberLight);
const rimLight = new THREE.DirectionalLight(0xffcf9a, 0.55); rimLight.position.set(10, 14, -16); scene.add(rimLight);

/* ---------- ground ---------- */
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c0d06, roughness: 0.95, metalness: 0.05 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = 0; scene.add(ground);
// cracked-earth rings, lit from below by the embers
for (let i = 0; i < 3; i++) {
  const r = new THREE.Mesh(new THREE.RingGeometry(3.2 + i * 2.6, 3.5 + i * 2.6, 48),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.22 - i * 0.06, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; r.position.y = 0.02 + i * 0.002; scene.add(r);
}

/* ---------- a mound of crawlers (red round "blob" enemies from the mockup) ---------- */
const MOUND = new THREE.Group(); scene.add(MOUND);
const crawlerR = ETYPES.crawler.r, crawlerColor = ETYPES.crawler.color;
const moundTop = (function buildMound() {
  // layered rings of sphere-shape crawlers, shrinking toward the top, like a pile of scrap enemies
  const layers = [
    { n: 14, r: 2.3, y: crawlerR * 0.55 },
    { n: 10, r: 1.7, y: crawlerR * 1.65 },
    { n: 7, r: 1.1, y: crawlerR * 2.75 },
    { n: 3, r: 0.5, y: crawlerR * 3.7 },
  ];
  let topY = 0;
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * Math.PI * 2 + L.y * 1.7, rr = L.r * (0.82 + Math.random() * 0.22);
      const m = makeEnemyMesh('crawler', crawlerColor, 'sphere');
      m.position.set(Math.cos(a) * rr, L.y + (Math.random() - 0.5) * 0.08, Math.sin(a) * rr);
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      const s = 0.85 + Math.random() * 0.3; m.scale.setScalar(s);
      MOUND.add(m);
      topY = Math.max(topY, L.y + crawlerR * s);
    }
  }
  return topY;
})();

/* ---------- the robot: lower(standard) + scout torso + two basic arms, one gun in each hand ---------- */
const GUN_TYPES = Object.keys(WEAPONS).filter(t => !WEAPONS[t].melee && !['knife', 'katana', 'chainsaw', 'whirl', 'blades'].includes(t));
const F = f => FACE_ORDER.indexOf(f);
let L, robot, leftArm, rightArm, leftGun, rightGun, leftMuzzle, rightMuzzle;

function freshLoadout(leftType, rightType) {
  const lv = 45;
  const body = mkItem('lower', 'standard');
  const top = mkItem('block', 'upper_scout');
  body.slots[F('top')] = top;
  let la = null, ra = null;
  BLOCKS.upper_scout.sockets.forEach((sk, i) => {
    if (sk.accepts !== 'arm') return;
    const a = mkItem('arm', 'basic', lv);
    a.weapon = mkItem('weapon', sk.face === 'left' ? leftType : rightType, lv);
    top.slots[i] = a;
    if (sk.face === 'left') la = a; else ra = a;
  });
  return { L: { body }, la, ra };
}

function buildTheRobot(leftType, rightType) {
  const prev = robot;
  const fresh = freshLoadout(leftType, rightType);
  L = fresh.L;
  const sb = [BUILD_ROOT, ROOT_BARE, BODY_IDX];
  robot = buildRobot(L, { stand: false });
  BUILD_ROOT = sb[0]; ROOT_BARE = sb[1]; BODY_IDX = sb[2];
  const reg = robot.userData;
  leftArm = reg.partOf.get(fresh.la); rightArm = reg.partOf.get(fresh.ra);
  leftGun = fresh.la.weapon; rightGun = fresh.ra.weapon;
  leftMuzzle = reg.muzzleOf.get(leftGun) || null;
  rightMuzzle = reg.muzzleOf.get(rightGun) || null;
  if (leftArm) leftArmRest = leftArm.quaternion.clone();
  if (rightArm) rightArmRest = rightArm.quaternion.clone();
  robot.position.set(0, moundTop, 0);
  if (prev) scene.remove(prev);
  scene.add(robot);
  applyPose(document.getElementById('poseSel').value);
}
let leftArmRest = null, rightArmRest = null;

/* ---------- pose: raise an arm by rotating it off its built rest orientation ---------- */
function applyPose(mode) {
  if (!leftArm || !rightArm || !leftArmRest || !rightArmRest) return;
  leftArm.quaternion.copy(leftArmRest); rightArm.quaternion.copy(rightArmRest);
  // rest already reads as "aiming forward"; swinging the forearm back by ~115° about its own local X raises it overhead
  const up = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.0, 0, 0));
  if (mode === 'raised') rightArm.quaternion.premultiply(up);
  else if (mode === 'raisedL') leftArm.quaternion.premultiply(up);
  else if (mode === 'both') { rightArm.quaternion.premultiply(up); leftArm.quaternion.premultiply(up); }
  // 'forward': both stay at rest, already aiming out in front
}

/* ---------- camera: manual orbit / zoom / pan (no OrbitControls import needed) ---------- */
const cam = { target: new THREE.Vector3(0, moundTop + 1.3, 0), yaw: 0.65, pitch: 0.28, dist: 9.5 };
function updateCamera() {
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.target);
}
updateCamera();
const cv = document.getElementById('c');
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2, yaw: cam.yaw, pitch: cam.pitch, t: cam.target.clone() }; cv.classList.add('dragging'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', e => { drag = null; cv.classList.remove('dragging'); });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / innerHeight, dy = (e.clientY - drag.y) / innerHeight;
  if (drag.pan) {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3(0, 1, 0);
    cam.target.copy(drag.t).addScaledVector(right, -dx * cam.dist * 0.9).addScaledVector(up, dy * cam.dist * 0.9);
  } else {
    cam.yaw = drag.yaw - dx * 4; cam.pitch = clamp(drag.pitch + dy * 3, -1.3, 1.45);
  }
  updateCamera();
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 2.2, 40); updateCamera(); }, { passive: false });
document.getElementById('resetCamBtn').onclick = () => { cam.yaw = 0.65; cam.pitch = 0.28; cam.dist = 9.5; cam.target.set(0, moundTop + 1.3, 0); updateCamera(); };

/* ---------- embers: a rising additive particle system ---------- */
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,190,110,0.7)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const EMBER_TEX = glowTex();
class Embers {
  constructor(n) {
    this.n = n; this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.22, map: EMBER_TEX, color: 0xff7a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.pts = new THREE.Points(this.geo, this.mat); this.pts.frustumCulled = false;
    for (let i = 0; i < n; i++) this.respawn(i, true);
    scene.add(this.pts);
  }
  respawn(i, first) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.5;
    this.pos[i * 3] = Math.cos(a) * r; this.pos[i * 3 + 1] = first ? Math.random() * 5 : 0; this.pos[i * 3 + 2] = Math.sin(a) * r;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.3; this.vel[i * 3 + 1] = 0.6 + Math.random() * 1.1; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    this.life[i] = this.max[i] = 2.5 + Math.random() * 3;
  }
  tick(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) this.respawn(i);
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] += Math.sin(performance.now() * 0.001 + i) * 0.01;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const embers = new Embers(140);

/* ---------- firing effects: a small per-weapon muzzle flash + tracer system ---------- */
const FX = {
  pistol: { color: 0xffe9b0, rate: 0.28, len: 3, thick: 0.05, spread: 0.02 },
  autogun: { color: 0xffe0a0, rate: 0.09, len: 2.4, thick: 0.045, spread: 0.05 },
  shotgun: { color: 0xffd890, rate: 0.55, len: 1.6, thick: 0.05, spread: 0.3, pellets: 7 },
  sniper: { color: 0xffffff, rate: 0.55, len: 5, thick: 0.07, spread: 0.01 },
  rocket: { color: 0xffa040, rate: 0.9, missile: true },
  lightning: { color: 0x9feaff, rate: 0.32, arc: true },
  flamer: { color: 0xff7a1a, rate: 0.02, flame: true },
  gatling: { color: 0xffe0a0, rate: 0.055, len: 2.2, thick: 0.04, spread: 0.06 },
  gravity: { color: 0xa070ff, rate: 0.6, ring: true },
  field: { color: 0x6fe8ff, rate: 1.4, shell: true },
  pods: { color: 0xffa040, rate: 0.3, missile: true },
};
function fxOf(type) { return FX[type] || { color: 0xffe0a0, rate: 0.3, len: 2, thick: 0.05, spread: 0.08 }; }
const _fxP = new THREE.Vector3(), _fxD = new THREE.Vector3(), _fxQ = new THREE.Quaternion();
const fxDisp = [];
function fxFlash(p, hex, s, life) {
  const m = new THREE.SpriteMaterial({ map: EMBER_TEX, color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(s); scene.add(sp); fxDisp.push({ sp, m, life, max: life, kind: 'flash', s });
}
const fxStreakMats = {};
function fxStreak(p, d, len, speed, hex, thick, life) {
  let m = fxStreakMats[hex]; if (!m) m = fxStreakMats[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(geoBox, m); mesh.scale.set(thick, thick, len); mesh.position.copy(p); mesh.lookAt(p.clone().add(d)); scene.add(mesh);
  fxDisp.push({ sp: mesh, m, life, max: life, kind: 'streak', v: d.clone().multiplyScalar(speed) });
}
function fxArc(p, d) {
  const pts = [], tgt = p.clone().addScaledVector(d, 3 + Math.random() * 1.5);
  for (let i = 0; i <= 9; i++) { const k = i / 9, pp = p.clone().lerp(tgt, k); if (i && i < 9) { pp.x += (Math.random() - 0.5) * 0.4; pp.y += (Math.random() - 0.5) * 0.4; } pts.push(pp); }
  const g = new THREE.BufferGeometry().setFromPoints(pts), m = new THREE.LineBasicMaterial({ color: 0x9feaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
  const l = new THREE.Line(g, m); scene.add(l); fxDisp.push({ sp: l, m, life: 0.08, max: 0.08, kind: 'flash', g, s: 1 });
  fxFlash(p, 0x58cfd6, 0.7, 0.07);
}
function fxRing(p, d, hex) {
  const g = new THREE.RingGeometry(0.5, 0.56, 36), m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const r = new THREE.Mesh(g, m); r.position.copy(p).addScaledVector(d, 0.4); r.lookAt(r.position.clone().add(d)); scene.add(r);
  fxDisp.push({ sp: r, m, life: 0.5, max: 0.5, kind: 'ring', g, r0: 0.5, r1: 3.0 });
}
function fxMissile(p, d) {
  const g = new THREE.Group(); g.add(bx(0.09, 0.09, 0.3, 0xe2465c, 0, 0, 0, 0xff3a28)); g.position.copy(p); scene.add(g);
  fxDisp.push({ sp: g, life: 1.2, max: 1.2, kind: 'rocket', v: d.clone().multiplyScalar(18) });
}
function fireMuzzle(muzzle, type) {
  if (!muzzle) return;
  muzzle.updateWorldMatrix(true, false); muzzle.getWorldPosition(_fxP); muzzle.getWorldQuaternion(_fxQ);
  _fxD.set(0, 0, 1).applyQuaternion(_fxQ);
  const F = fxOf(type), d = _fxD.clone();
  if (F.missile) { fxMissile(_fxP.clone(), d); fxFlash(_fxP, 0xffa040, 1.1, 0.12); return; }
  if (F.arc) { fxArc(_fxP.clone(), d); return; }
  if (F.ring) { fxRing(_fxP.clone(), d, F.color); fxFlash(_fxP, F.color, 1.0, 0.16); return; }
  if (F.shell) { fxFlash(_fxP, F.color, 1.6, 0.22); return; }
  if (F.flame) {
    for (let i = 0; i < 4; i++) {
      const v = d.clone().multiplyScalar(5 + Math.random() * 3); v.x += (Math.random() - 0.5) * 1.2; v.y += (Math.random() - 0.5) * 1.2 + 0.3; v.z += (Math.random() - 0.5) * 1.2;
      const m = new THREE.SpriteMaterial({ map: EMBER_TEX, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m); sp.position.copy(_fxP); sp.scale.setScalar(0.5); scene.add(sp);
      fxDisp.push({ sp, m, life: 0.5, max: 0.5, kind: 'flame', v });
    }
    return;
  }
  const n = F.pellets || 1;
  for (let i = 0; i < n; i++) {
    const dd = d.clone(); dd.x += (Math.random() - 0.5) * F.spread; dd.y += (Math.random() - 0.5) * F.spread; dd.z += (Math.random() - 0.5) * F.spread; dd.normalize();
    fxStreak(_fxP.clone(), dd, F.len, 34 + Math.random() * 8, F.color, F.thick, 0.4);
  }
  fxFlash(_fxP.clone(), 0xffe2a0, 0.5 + (F.thick || 0.05) * 6, 0.07);
}
function fxTick(dt) {
  for (let i = fxDisp.length - 1; i >= 0; i--) {
    const f = fxDisp[i]; f.life -= dt; const k = Math.max(0, f.life / f.max);
    if (f.kind === 'streak') { f.sp.position.addScaledVector(f.v, dt); f.m.opacity = k; }
    else if (f.kind === 'rocket') { f.sp.position.addScaledVector(f.v, dt); f.sp.lookAt(f.sp.position.clone().add(f.v)); embers.pts && null; }
    else if (f.kind === 'flame' || f.kind === 'flash') { f.m.opacity = k; if (f.v) f.sp.position.addScaledVector(f.v, dt); if (f.s) f.sp.scale.setScalar(f.s * (1.4 - 0.4 * k)); }
    else if (f.kind === 'ring') { f.sp.scale.setScalar(f.r0 + (f.r1 - f.r0) * (1 - k)); f.m.opacity = 0.9 * k; }
    if (f.life <= 0) { scene.remove(f.sp); if (f.m && f.m.dispose && f.kind !== 'streak') f.m.dispose(); if (f.g) f.g.dispose(); fxDisp.splice(i, 1); }
  }
}

/* ---------- UI wiring ---------- */
const leftSel = document.getElementById('leftWeapon'), rightSel = document.getElementById('rightWeapon');
for (const t of GUN_TYPES) { const n = WEAPONS[t].name || t; leftSel.innerHTML += `<option value="${t}">${n}</option>`; rightSel.innerHTML += `<option value="${t}">${n}</option>`; }
leftSel.value = 'autogun'; rightSel.value = 'autogun';
function rebuild() { buildTheRobot(leftSel.value, rightSel.value); }
leftSel.onchange = rebuild; rightSel.onchange = rebuild;
document.getElementById('poseSel').onchange = e => applyPose(e.target.value);

let firing = true;
const fireBtn = document.getElementById('fireBtn');
function setFiring(on) { firing = on; fireBtn.classList.toggle('on', on); fireBtn.textContent = on ? 'Stop Fire' : 'Hold Fire'; }
fireBtn.onclick = () => setFiring(!firing);
setFiring(true);

document.getElementById('snapBtn').onclick = () => {
  renderFrame(scene, camera);
  const a = document.createElement('a'); a.download = 'scrap-survivors-boxart.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click();
};

// H hides the panel for a clean screenshot (with the browser's own tools or the Save PNG button); H again brings it back
const panelEl = document.getElementById('panel'), hintEl = document.getElementById('hint');
addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'h') return;
  const hide = panelEl.style.display !== 'none';
  panelEl.style.display = hide ? 'none' : '';
  hintEl.style.display = hide ? 'none' : '';
});

/* ---------- boot + render loop ---------- */
buildTheRobot(leftSel.value, rightSel.value);
let acc = 0, last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  embers.tick(dt); fxTick(dt);
  emberLight.intensity = 3.4 + Math.sin(now * 0.004) * 0.6 + Math.random() * 0.3;
  const style = document.getElementById('fireStyle').value;
  if (firing && style !== 'off') {
    acc += dt;
    const period = style === 'single' ? 0.9 : 0.14;
    if (acc >= period) {
      acc = 0;
      if (leftMuzzle) fireMuzzle(leftMuzzle, leftGun.type);
      if (rightMuzzle) fireMuzzle(rightMuzzle, rightGun.type);
    }
  }
  updateCamera();
  renderFrame(scene, camera);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderFrame(scene, camera); });
