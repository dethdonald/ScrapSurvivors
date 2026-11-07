'use strict';
/* ============================================================
   TITLE SCREEN
   A randomly built frame strikes poses on the right while slowly turning. A hover-style window points
   at one of its parts at a time. Every so often it blows apart and a new random frame drops in.
   ============================================================ */
const TITLE = { scene: null, cam: null, robot: null, L: null, t: 0, life: 0, pieces: [], tipT: 0, tipPart: null, pose: 0, poseT: 0, fromOptions: false };
const VERSION = '0.34.0 · BUILD NOV 6';

function setupTitleScene() {
  if (TITLE.scene) return;
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x2c3136);
  s.fog = new THREE.Fog(0x2c3136, 18, 40);
  s.add(new THREE.HemisphereLight(0xdfe8ee, 0x30282a, 0.8));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.9); sun.position.set(-4, 9, 7); s.add(sun); setupShadowLight(sun, 6, 40); s.add(sun.target);
  const rim = new THREE.DirectionalLight(0xff9a50, 0.35); rim.position.set(6, 3, -6); s.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.3, 8), M(0x262b30)); floor.position.y = -0.15; s.add(floor);
  const ringM = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ringM.scale.setScalar(3); ringM.position.y = 0.01; s.add(ringM);
  const grid = new THREE.GridHelper(60, 30, 0x3a4249, 0x30373d); grid.position.y = -0.3; s.add(grid);
  TITLE.scene = s; s.environment = ENV.base; TITLE.lights = [sun]; applyGfx();
  TITLE.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
}
/* A random but valid frame: one or two bodies, two legs, a weapon or three, sometimes extras. */
function randomTitleLoadout() {
  const F = f => FACE_ORDER.indexOf(f), lv = () => 1 + Math.floor(Math.pow(Math.random(), 1.6) * 90);
  if (BUILD_V2) {
    const guns = Object.keys(WEAPONS), gun = () => mkItem('weapon', pick(guns.filter(g => g !== 'knife' || Math.random() < 0.3)), lv());
    const TL = { body: mkItem('lower', pick(['standard', 'standard', 'spider', 'treads', 'wheels'])) };
    const top = mkItem('block', pick(['upper_scout', 'upper_brawler', 'upper_carrier'])); TL.body.slots[F('top')] = top;
    BLOCKS[top.type].sockets.forEach((sk, i) => {
      if (sk.accepts === 'arm') { if (Math.random() < 0.9) { const a = mkItem('arm', pick(['sentry', 'basic', 'basic', 'double']), lv()); a.weapon = gun(); if ('weapon2' in a) a.weapon2 = gun(); if (a.gems && a.gems.length && Math.random() < 0.4) a.gems[0] = mkGem(); top.slots[i] = a; } }
      else if (Math.random() < 0.6) top.slots[i] = mkItem('module', pick(Object.keys(MODULES)), lv());
    });
    return TL;
  }
  const TL = { body: mkItem('block', 'body') };
  const legType = Math.random() < 0.35 ? 'tread' : 'basic';
  TL.body.slots[F('left')] = mkItem('leg', legType, lv()); TL.body.slots[F('right')] = mkItem('leg', legType, lv());
  let top = TL.body;
  if (Math.random() < 0.75) { top = mkItem('block', 'body'); TL.body.slots[F('top')] = top; }
  const guns = Object.keys(WEAPONS);
  const gun = () => mkItem('weapon', pick(guns.filter(g => g !== 'knife' || Math.random() < 0.3)), lv());
  // a single-body frame keeps its legs on the sides, so its arms go front and back
  for (const side of top === TL.body ? ['front', 'back'] : ['left', 'right']) {
    if (Math.random() < 0.85) {
      const a = mkItem('arm', pick(['sentry', 'basic', 'basic', 'double']), lv()); a.weapon = gun(); if ('weapon2' in a) a.weapon2 = gun();
      if (a.gems && a.gems.length && Math.random() < 0.4) a.gems[0] = mkGem();
      top.slots[F(side)] = a;
    }
    else top.slots[F(side)] = gun();
  }
  const r = top === TL.body ? 1 : Math.random();   // extras only when there's a chest to put them on
  if (r < 0.25) top.slots[F('back')] = mkItem('module', 'jetpack', lv());
  else if (r < 0.45) top.slots[F('front')] = mkItem('module', pick(['pods', 'radar', 'magnet']), lv());
  else if (r < 0.7) top.slots[F('front')] = gun();
  if (top !== TL.body && Math.random() < 0.5) top.slots[F('top')] = gun();
  return TL;
}
function spawnTitleRobot() {
  if (TITLE.robot) TITLE.scene.remove(TITLE.robot);
  TITLE.L = randomTitleLoadout();
  const m = buildRobot(TITLE.L);
  m.position.set(0, 7, 0); m.userData.vy = 0; m.userData.landed = false;
  TITLE.scene.add(m); TITLE.robot = m;
  TITLE.life = 0; TITLE.tipT = 1.6; TITLE.tipPart = null; hideTitleTip();
  // arms aim at points that change with each pose
  TITLE.poseT = 0; TITLE.pose = 0;
}
const TITLE_POSES = [
  { name: 'ready',  aims: [[-2, 1.5, 4], [2, 1.5, 4]], crouch: 0,    twist: 0 },
  { name: 'flex',   aims: [[-3, 4, 1], [3, 4, 1]],     crouch: 0.15, twist: 0 },
  { name: 'aim L',  aims: [[-4, 1.8, 2], [-4, 2, 2.5]], crouch: 0.25, twist: -0.6 },
  { name: 'aim R',  aims: [[4, 1.8, 2.5], [4, 2, 2]],  crouch: 0.25, twist: 0.6 },
  { name: 'skyward', aims: [[-1, 8, 1], [1, 8, 1]],    crouch: 0.35, twist: 0 },
  { name: 'guard',  aims: [[-1, 0.5, 4], [1, 0.5, 4]], crouch: 0.45, twist: 0.2 },
];
function updateTitleRobot(dt) {
  const m = TITLE.robot; if (!m) return;
  const ud = m.userData;
  // drop in, land with a bounce
  if (!ud.landed) {
    ud.vy -= 30 * dt; m.position.y += ud.vy * dt;
    if (m.position.y <= 0) { m.position.y = 0; ud.landed = true; ud.dip = -0.35; ud.dipV = 0; titleBurst(new THREE.Vector3(0, 0.1, 0), 0x8a8270, 10); sfx('thud', 0.3); }
  }
  ud.dipV = (ud.dipV || 0) + (-120 * (ud.dip || 0) - 9 * (ud.dipV || 0)) * dt; ud.dip = (ud.dip || 0) + ud.dipV * dt;
  TITLE.poseT -= dt;
  if (TITLE.poseT <= 0) { TITLE.pose = (TITLE.pose + 1 + Math.floor(Math.random() * (TITLE_POSES.length - 1))) % TITLE_POSES.length; TITLE.poseT = rand(1.6, 2.6); }
  const still = S.mode === 'custom';         // Customize: stand still in a neutral stance so cosmetics are easy to place
  let P = still ? TITLE_POSES[0] : TITLE_POSES[TITLE.pose];
  // hit by falling guns: arms up over its head, a crouch and a dazed wobble
  TITLE.hurtT = Math.max(0, (TITLE.hurtT || 0) - dt);
  const hurt = Math.min(1, TITLE.hurtT / 0.9);
  if (hurt > 0.05) P = { aims: [[-1.1, 4.6, 0.9], [1.1, 4.6, 0.9]], crouch: 0.3, twist: Math.sin(TITLE.t * 9) * 0.35 };
  if (S.mode !== 'custom') m.rotation.y += dt * 0.35;      // slow turntable (in Customize you turn it yourself)
  const tw = (ud.twist || 0) + (P.twist - (ud.twist || 0)) * Math.min(1, dt * 5); ud.twist = tw;
  const cr = (ud.crouch || 0) + (P.crouch - (ud.crouch || 0)) * Math.min(1, dt * 5); ud.crouch = cr;
  const breathe = still ? 0 : Math.sin(TITLE.t * 2.2) * 0.03;
  if (ud.hips) ud.hips.position.y = -cr + (ud.dip || 0) + breathe;
  const sway = still ? 0 : 1;
  if (ud.torso) ud.torso.rotation.set(Math.sin(TITLE.t * 1.3) * 0.04 * sway + Math.sin(TITLE.t * 31) * 0.14 * hurt, tw, Math.sin(TITLE.t * 0.9) * 0.05 * sway + Math.sin(TITLE.t * 23) * 0.18 * hurt);
  for (const sp of ud.spinners) sp.anchor.rotation.z += dt * BLOCKS[sp.item.type].spinRate(sp.item.lvl);
  m.updateMatrixWorld(true);
  // feet stay planted on the floor whatever the hips do
  for (const lg of ud.legs) {
    const ik = lg.userData.ik;
    if (ik) {
      const rest = lg.localToWorld(ik.restV.clone()); rest.y = ik.footH;
      legPose(ik, lg.worldToLocal(rest));
    }
    const sh = lg.userData.shock; if (sh) setShock(sh, clamp(cr * 0.6 - (ud.dip || 0) * 0.5, -0.2, 0.28));
  }
  // arms swing to the pose's aim points (in the robot's own frame, so they turn with it)
  const arms = [];
  (function walk(it) { if (!it) return; if (it.kind === 'arm') arms.push(it); (it.slots || []).forEach(walk); })(TITLE.L.body);
  arms.forEach((it, i) => {
    const ag = ud.partOf.get(it); if (!ag) return;
    const a = P.aims[i % 2], tgt = m.localToWorld(new THREE.Vector3(a[0] + (still ? 0 : Math.sin(TITLE.t * 1.7 + i) * 0.3), a[1], a[2]));
    const cur = ag.userData.q || ag.quaternion.clone();
    ag.lookAt(tgt.x, tgt.y, tgt.z);
    cur.rotateTowards(ag.quaternion, (hurt > 0.05 ? 14 : ARMS[it.type].auto ? 3 : 7) * dt);
    ag.quaternion.copy(cur); ag.userData.q = cur;
  });
  // jets flicker on the skyward pose
  for (const j of ud.jets) for (const f of j.userData.jet.flames) { f.visible = P.name === 'skyward'; if (f.visible) f.scale.set(1.2, 1.2 + Math.random() * 0.8, 1.2); }
}
/* ---------- the info window that points at a part ---------- */
function titleTipPick() {
  const parts = TITLE.robot.userData.parts.filter(p => { const it = p.userData.item; return it && it.kind !== 'block'; });
  const prev = TITLE.tipPart;
  let p = pick(parts); if (parts.length > 1) while (p === prev) p = pick(parts);
  TITLE.tipPart = p;
  const it = p.userData.item, r = rarityOf(it.lvl);
  $('#ttName').innerHTML = partIcon(it, 'picon tipicon') + itemName(it) + ' ' + attrTag(it);
  partView($('#ttView'), it);
  $('#ttRar').innerHTML = `<span style="color:${r.css}">${r.name}</span> · Lv ${it.lvl} · ${itemSub(it)}`;
  $('#ttStats').innerHTML = partInfo(it).slice(0, 5).map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  const tip = $('#titleTip'), line = $('#ttLine');
  tip.style.setProperty('--rar', r.css);
  tip.hidden = false; line.removeAttribute('hidden');
  tip.classList.remove('on', 'off'); line.classList.remove('on', 'off'); void tip.offsetWidth;
  tip.classList.add('on'); line.classList.add('on');
}
function hideTitleTip() {
  const tip = $('#titleTip'), line = $('#ttLine'); if (!tip || tip.hidden) return;
  tip.classList.remove('on'); tip.classList.add('off'); line.classList.remove('on'); line.classList.add('off');
  setTimeout(() => { if (!TITLE.tipPart) { tip.hidden = true; line.setAttribute('hidden', ''); } }, 95);
}
const _ttb = new THREE.Box3(), _ttv = new THREE.Vector3();
function placeTitleTip() {
  const p = TITLE.tipPart; if (!p || $('#titleTip').hidden) return;
  _ttb.setFromObject(p); _ttb.getCenter(_ttv).project(TITLE.cam);
  const W = innerWidth, Hh = innerHeight, ax = (_ttv.x + 1) / 2 * W, ay = (1 - _ttv.y) / 2 * Hh;
  const tip = $('#titleTip'), tw = tip.offsetWidth * UIZ.z, th = tip.offsetHeight * UIZ.z;
  // the window stays put, between the menu and the frame; only its line follows the part as the robot turns
  const x = Math.round(W * 0.43), y = Math.round(Hh * 0.4);
  tip.style.transform = `translate(${x}px, ${y}px) scale(${UIZ.z})`;
  const ex = ax > x + tw ? x + tw : ax < x ? x : x + tw / 2, ey = ay < y ? y : ay > y + th ? y + th : y + th / 2;
  $('#ttL').setAttribute('x1', ex); $('#ttL').setAttribute('y1', ey); $('#ttL').setAttribute('x2', ax); $('#ttL').setAttribute('y2', ay);
  $('#ttDot').setAttribute('x', ax - 3.5); $('#ttDot').setAttribute('y', ay - 3.5);
}
/* ---------- blow it apart ---------- */
function explodeTitleRobot() {
  const m = TITLE.robot; if (!m) return;
  TITLE.tipPart = null; hideTitleTip();
  m.updateMatrixWorld(true);
  const parts = m.userData.parts.slice(), set = new Set(parts);
  const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  for (const p of parts) TITLE.scene.attach(p);
  TITLE.scene.remove(m); TITLE.robot = null;
  TITLE.pieces = parts.map(p => {
    const pc = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3());
    const dir = pc.clone().sub(c); dir.y = Math.max(dir.y, 0.3); dir.normalize();
    return { obj: p, vel: dir.multiplyScalar(rand(5, 10)).add(new THREE.Vector3(0, rand(3, 6), 0)), w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), r: 0.3 };
  });
  titleFlash(c); titleBurst(c, ORANGE, 14); titleBurst(c, COL.dark, 12);
  sfx('boom', 0.22);
  TITLE.shake = 0.6;
  TITLE.respawnT = 2.4;
}
const titleFx = [];
function titleFlash(p) {
  for (const [r, col, life] of [[2.6, 0xffe2a0, 0.35], [1.5, 0xffffff, 0.2], [3.4, ORANGE, 0.45]]) {
    const m = new THREE.Mesh(geoBlast, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 })); m.position.copy(p);
    TITLE.scene.add(m); titleFx.push({ obj: m, life, max: life, upd: (f) => { const k = 1 - f.life / f.max; f.obj.scale.setScalar(r * (0.3 + 0.7 * k)); f.obj.material.opacity = 0.7 * (1 - k); } });
  }
}
function titleBurst(p, color, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geoBox, M(color)), s = rand(0.1, 0.28); m.scale.setScalar(s); m.position.copy(p);
    const v = new THREE.Vector3(rand(-6, 6), rand(2, 9), rand(-6, 6));
    TITLE.scene.add(m); titleFx.push({ obj: m, life: rand(0.5, 1), max: 1, upd: (f, dt) => { v.y -= 28 * dt; f.obj.position.addScaledVector(v, dt); f.obj.rotation.x += dt * 8; if (f.obj.position.y < 0.05) { f.obj.position.y = 0.05; v.y *= -0.3; v.x *= 0.7; v.z *= 0.7; } } });
  }
}
function stepTitlePieces(dt) {
  for (const pc of TITLE.pieces) {
    pc.vel.y -= 24 * dt; pc.obj.position.addScaledVector(pc.vel, dt);
    pc.obj.rotation.x += pc.w.x * dt; pc.obj.rotation.y += pc.w.y * dt; pc.obj.rotation.z += pc.w.z * dt;
    if (pc.obj.position.y < pc.r) { pc.obj.position.y = pc.r; pc.vel.y *= -0.35; pc.vel.x *= 0.75; pc.vel.z *= 0.75; pc.w.multiplyScalar(0.7); }
  }
  for (const f of titleFx) { f.life -= dt; f.upd(f, dt); }
  for (let i = titleFx.length - 1; i >= 0; i--) if (titleFx[i].life <= 0) { TITLE.scene.remove(titleFx[i].obj); titleFx.splice(i, 1); }
}
function clearTitlePieces() { TITLE.pieces.forEach(p => TITLE.scene.remove(p.obj)); TITLE.pieces = []; }

/* ---------- screen flow ---------- */
function openTitle() {
  setupTitleScene();
  S.mode = 'title';
  ['#hud', '#inv', '#over', '#pause', '#levelup', '#perk', '#shop'].forEach(s => { const e = $(s); if (e) e.hidden = true; });
  $('#title').hidden = false;
  $('#verTxt').textContent = 'VERSION ' + VERSION;
  clearTitlePieces();
  spawnTitleRobot();
  focusFirst();
}
function renderTitle(dt) {
  TITLE.t += dt; TITLE.life += dt;
  const W = innerWidth, Hh = innerHeight;
  TITLE.cam.aspect = W / Hh; TITLE.cam.updateProjectionMatrix();
  // the frame stands right of centre; the menu sits on the left
  const off = Math.min(4.6, 2.2 * W / Hh);
  TITLE.cam.position.set(-off + Math.sin(TITLE.t * 0.15) * 0.3, 3.0, 10.5);
  TITLE.cam.lookAt(-off, 2.3, 0);
  if (TITLE.shake > 0) { TITLE.cam.position.x += rand(-1, 1) * TITLE.shake * 0.3; TITLE.cam.position.y += rand(-1, 1) * TITLE.shake * 0.3; TITLE.shake -= dt * 1.5; }
  updateTitleRobot(dt);
  cosmeticTick(TITLE.robot, dt);
  titleGunTick(dt);
  stepTitlePieces(dt);
  if (TITLE.robot && TITLE.robot.userData.landed) {
    TITLE.tipT -= dt;
    if (TITLE.tipT <= 0 && S.mode === 'title') { TITLE.tipT = 2.8; titleTipPick(); }
    if (S.mode === 'custom') TITLE.life = 0;          // hold still while you're customising it
    else if (TITLE.life > 15) explodeTitleRobot();
  }
  if (TITLE.respawnT > 0) { TITLE.respawnT -= dt; if (TITLE.respawnT <= 0) { clearTitlePieces(); spawnTitleRobot(); } }
  thrownTick(dt);
  renderFrame(TITLE.scene, TITLE.cam);
  placeTitleTip();
}
function leaveTitle() {
  $('#title').hidden = true;
  TITLE.tipPart = null; $('#titleTip').hidden = true; $('#ttLine').setAttribute('hidden', '');
}
$('#tStart').addEventListener('click', () => { ensureAudio(); leaveTitle(); freshHangarLoadout(); openInventory(true); });
$('#tOptions').addEventListener('click', () => {
  ensureAudio();
  TITLE.fromOptions = true; S.prevMode = 'title'; S.mode = 'pause';
  $('#title').hidden = true;
  $('#pause').classList.add('fromTitle'); $('#pause').hidden = false; showOptions(true);
});
$('#tQuit').addEventListener('click', () => { if (window.desktop) window.desktop.quit(); else window.close(); });

/* ---------- Customize: paint colour + 20x20 patch, previewed live on the title robot ---------- */
const PAINTS = ['#4b5661', '#6b7680', '#2e3640', '#8a3a2e', '#c0562a', '#d89a2a', '#5f7a3a', '#2f6a5a', '#2f5a8a', '#4a3f7a', '#7a3a6a', '#d8d4c8'];
const BRUSHES = ['#16181a', '#f2f0e8', '#e2465c', '#ff7a1a', '#ffd23a', '#4fd06b', '#58cfd6', '#3f8cff', '#b45cff', '#8a5a3a', null];
let brush = '#ff7a1a', painting = 0;
function rebuildTitleRobot() {
  const old = TITLE.robot; if (!old) return;
  const m = buildRobot(TITLE.L);
  m.position.copy(old.position); m.rotation.copy(old.rotation);
  Object.assign(m.userData, { landed: true, vy: 0, dip: 0, dipV: 0, twist: old.userData.twist, crouch: old.userData.crouch });
  TITLE.scene.remove(old); TITLE.scene.add(m); TITLE.robot = m;
  if (TITLE.tipPart) { TITLE.tipPart = null; hideTitleTip(); }
}
function openCustomize() {
  ensureAudio();
  S.mode = 'custom';
  $('.tmain').hidden = true; $('#custPanel').hidden = false;
  TITLE.pieces.length && clearTitlePieces();
  if (!TITLE.robot || TITLE.respawnT > 0) { TITLE.respawnT = 0; spawnTitleRobot(); TITLE.robot.position.y = 0; TITLE.robot.userData.landed = true; }
  TITLE.tipPart = null; hideTitleTip();
  if (!CUSTOM.patch) CUSTOM.patch = new Array(PATCH_N * PATCH_N).fill(null);
  $('#swatches').innerHTML = PAINTS.map(c => `<button class="sw nav${c === CUSTOM.color ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  $('#colPick').value = CUSTOM.color;
  $('#swatches2').innerHTML = ACCENTS.map(c => `<button class="sw nav${c === CUSTOM.color2 ? ' on' : ''}" data-c2="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  $('#colPick2').value = CUSTOM.color2;
  for (const el of $$('#swatches2 .sw')) el.addEventListener('click', () => setAccent(el.dataset.c2));
  $('#brushes').innerHTML = BRUSHES.map(c => `<button class="br${c === brush ? ' on' : ''}" data-b="${c || ''}" style="${c ? `background:${c}` : ''}" title="${c ? c : 'Eraser'}">${c ? '' : '✕'}</button>`).join('');
  for (const el of $$('#swatches .sw')) el.addEventListener('click', () => setPaint(el.dataset.c));
  for (const el of $$('#brushes .br')) el.addEventListener('click', () => { brush = el.dataset.b || null; $$('#brushes .br').forEach(b => b.classList.toggle('on', b === el)); });
  drawPatchEditor(); renderPatchDir(); syncBomb();
  focusFirst();
}
/* ---------- drag stickers around on the robot (Customize) ---------- */
const _sray = new THREE.Raycaster(), _sv2 = new THREE.Vector2();
function stickerRay(e) { const r = canvas.getBoundingClientRect(); _sv2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); _sray.setFromCamera(_sv2, TITLE.cam); return _sray; }
function stickerAt(e) {
  if (!TITLE.robot) return null;
  const hit = stickerRay(e).intersectObject(TITLE.robot, true).find(h => h.object.visible);
  return hit && hit.object.userData.patch ? hit.object : null;
}
const stickerOk = e => S.mode === 'custom' && !(e.target.closest && e.target.closest('.custpanel, button, input, .tip'));
addEventListener('pointerdown', e => {
  if (!stickerOk(e) || (e.button !== 0 && e.button !== 2)) return;
  if (e.button === 0) TITLE.clickDown = { x: e.clientX, y: e.clientY, hit: robotHit(e) };
  const cm = e.button === 0 ? cosmeticAt(e) : null;
  if (cm) { TITLE.cosMove = { obj: cm, moved: false }; e.preventDefault(); return; }
  const m = e.button === 0 ? stickerAt(e) : null;
  if (m) { TITLE.stickerDrag = m; m.userData.z0 = m.userData.z0 ?? m.position.z; m.userData.rz0 = m.userData.rz0 ?? m.rotation.z; e.preventDefault(); sfx('tick'); return; }
  TITLE.rotDrag = { x: e.clientX, y: e.clientY };                                  // drag empty space to turn the robot
});
addEventListener('pointermove', e => {
  if (S.mode !== 'custom') return;
  if (flingMove(e)) return;
  if (cosmeticPointerMove(e)) return;
  if (TITLE.rotDrag && TITLE.robot) { TITLE.robot.rotation.y += (e.clientX - TITLE.rotDrag.x) * 0.012; TITLE.rotDrag.x = e.clientX; document.body.style.cursor = 'grabbing'; return; }
  const m = TITLE.stickerDrag;
  if (!m) { document.body.style.cursor = stickerOk(e) && stickerAt(e) ? 'grab' : ''; return; }
  document.body.style.cursor = 'grabbing';
  // slide it over the face it's stuck to
  const fg = m.parent; fg.updateMatrixWorld(true);
  const n = new THREE.Vector3(0, 0, 1).transformDirection(fg.matrixWorld), p0 = new THREE.Vector3().setFromMatrixPosition(fg.matrixWorld);
  const hit = stickerRay(e).ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), new THREE.Vector3()); if (!hit) return;
  const loc = fg.worldToLocal(hit), { fw, fh, s } = m.userData, hx = (fw - s) / 2, hy = (fh - s) / 2;
  m.position.x = clamp(loc.x, -hx, hx); m.position.y = clamp(loc.y, -hy, hy);
  // dragged past the edge of its face: it starts to peel up, curling toward the cursor; far enough and it comes off
  const ox = loc.x - m.position.x, oy = loc.y - m.position.y, over = Math.hypot(ox, oy), need = s * 1.1 + 0.18;
  const k = Math.min(1, over / need);
  m.position.z = m.userData.z0 + k * 0.12;
  m.rotation.set(over > 1e-4 ? -oy / over * k * 1.1 : 0, over > 1e-4 ? ox / over * k * 1.1 : 0, m.userData.rz0);
  if (k > 0.05 && !m.userData.peeling) { m.userData.peeling = true; sfx('peel', 0.35); }
  if (k <= 0.05) m.userData.peeling = false;
  if (k >= 1) {
    // off! it's in your hand now: fling it away to get rid of it
    TITLE.stickerDrag = null;
    CUSTOM.stickers[m.userData.skey] = { off: true }; saveCustom(); syncBomb();
    const free = m.clone(); free.material = m.material.clone(); free.material.side = THREE.DoubleSide;
    m.getWorldPosition(free.position); m.getWorldQuaternion(free.quaternion); m.getWorldScale(free.scale);
    m.parent.remove(m); TITLE.scene.add(free);
    startFling(free, e, null);
    sfx('peel', 0.8);
  }
});
addEventListener('pointerup', e => {
  if (S.mode === 'custom') cosmeticPointerUp(e);
  if (TITLE.rotDrag) { TITLE.rotDrag = null; document.body.style.cursor = ''; }
  if (flingRelease(e)) return;
  const m = TITLE.stickerDrag; if (!m) return;
  TITLE.stickerDrag = null; document.body.style.cursor = '';
  // let go before it came off: it smooths back down
  m.position.z = m.userData.z0 ?? m.position.z; m.rotation.set(0, 0, m.userData.rz0 ?? m.rotation.z); m.userData.peeling = false;
  CUSTOM.stickers[m.userData.skey] = { u: +m.position.x.toFixed(3), v: +m.position.y.toFixed(3) };
  saveCustom(); sfx('tick');
});
$('#stickerReset').addEventListener('click', () => { CUSTOM.stickers = {}; CUSTOM.layout = (Math.random() * 1e9) | 0; saveCustom(); rebuildTitleRobot(); sfx('tick'); });
/* ---------- patch directory: saved designs you can pick, save over, duplicate and delete ---------- */
let patchUnsaved = false;
function patchThumb(px) {
  const cv = document.createElement('canvas'); cv.width = cv.height = PATCH_N; const c = cv.getContext('2d');
  c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, PATCH_N, PATCH_N);
  (px || []).forEach((col, i) => { if (col) { c.fillStyle = col; c.fillRect(i % PATCH_N, (i / PATCH_N) | 0, 1, 1); } });
  return cv.toDataURL();
}
function renderPatchDir() {
  $('#patchDir').innerHTML = CUSTOM.patches.map((p, i) => `<button class="pd nav${i === CUSTOM.cur ? ' on' : ''}" data-pi="${i}" title="${p.name}"><img src="${patchThumb(i === CUSTOM.cur ? CUSTOM.patch : p.px)}" alt=""><span>${p.name}${i === CUSTOM.cur && patchUnsaved ? ' •' : ''}</span></button>`).join('');
  for (const el of $$('#patchDir .pd')) el.addEventListener('click', () => selectPatch(+el.dataset.pi));
  $('#patchSave').textContent = patchUnsaved ? 'Save •' : 'Saved';
  $('#patchDel').disabled = CUSTOM.patches.length < 2;
}
function commitPatch() { CUSTOM.patches[CUSTOM.cur].px = CUSTOM.patch ? CUSTOM.patch.slice() : null; patchUnsaved = false; saveCustom(); }
function selectPatch(i) {
  if (patchUnsaved) commitPatch();               // never lose a drawing when switching
  CUSTOM.cur = i; const px = CUSTOM.patches[i].px;
  CUSTOM.patch = px ? px.slice() : new Array(PATCH_N * PATCH_N).fill(null);
  saveCustom(); drawPatchEditor(); renderPatchDir(); rebuildTitleRobot(); sfx('tick');
}
const nextPatchName = () => { let n = CUSTOM.patches.length + 1; while (CUSTOM.patches.some(p => p.name === 'Patch ' + n)) n++; return 'Patch ' + n; };
$('#patchSave').addEventListener('click', () => { commitPatch(); renderPatchDir(); rebuildTitleRobot(); sfx('tick'); });
$('#patchNew').addEventListener('click', () => { if (patchUnsaved) commitPatch(); CUSTOM.patches.push({ name: nextPatchName(), px: null }); selectPatch(CUSTOM.patches.length - 1); });
$('#patchDup').addEventListener('click', () => { commitPatch(); CUSTOM.patches.splice(CUSTOM.cur + 1, 0, { name: CUSTOM.patches[CUSTOM.cur].name + ' copy', px: CUSTOM.patch ? CUSTOM.patch.slice() : null }); selectPatch(CUSTOM.cur + 1); });
$('#patchDel').addEventListener('click', () => {
  if (CUSTOM.patches.length < 2) return;
  CUSTOM.patches.splice(CUSTOM.cur, 1); patchUnsaved = false;
  selectPatch(Math.min(CUSTOM.cur, CUSTOM.patches.length - 1)); sfx('scrap', 0.5);
});
/* sticker bomb: no numbers, just a bar; all the way up shows the peace sign */
/* the bar shows how many bomb stickers are actually still on: peel one off and it drops */
function bombLive() {
  const b = CUSTOM.bomb || 0; if (!b) return 0;
  const offs = Object.entries(CUSTOM.stickers || {}).filter(([k, v]) => v && v.off && !k.endsWith(':p')).length;
  let bodies = 0; if (TITLE.L && TITLE.L.body) { (function walk(it) { if (!it) return; if (it.kind === 'block' && BLOCKS[it.type].body) bodies++; (it.slots || []).forEach(walk); })(TITLE.L.body); }
  const total = Math.round(b) * 2 * Math.max(1, bodies);
  return Math.max(0, b * (1 - Math.min(offs, total) / total));
}
function syncBomb() { const v = bombLive(); $('#bombAmt').value = v; $('#bombPeace').classList.toggle('on', v >= BOMB_MAX - 0.01); }
$('#bombAmt').addEventListener('input', e => {
  // dragging the bar sets a fresh amount: every bomb sticker goes back on
  CUSTOM.bomb = Math.round(+e.target.value);
  for (const k of Object.keys(CUSTOM.stickers || {})) if (!k.endsWith(':p') && CUSTOM.stickers[k] && CUSTOM.stickers[k].off) delete CUSTOM.stickers[k];
  syncBomb(); saveCustom(); rebuildTitleRobot();
});
/* randomize: blow up the robot on the stand right away and build a fresh one */
$('#tRandom').addEventListener('click', () => {
  ensureAudio();
  if (TITLE.robot) { explodeTitleRobot(); TITLE.respawnT = 0.45; }
  else TITLE.respawnT = Math.min(TITLE.respawnT || 0.05, 0.05);
});
const ACCENTS = ['#ff7a1a', '#ffd23a', '#ff4a5e', '#4fd06b', '#58cfd6', '#3f8cff', '#b45cff', '#f2f0e8', '#c6ff3a', '#ff5ac8', '#ffa23a', '#7fe0a0'];     // bright only
function setAccent(c) {
  c = brightAccent(c);
  CUSTOM.color2 = c; saveCustom();
  $$('#swatches2 .sw').forEach(b => b.classList.toggle('on', b.dataset.c2 === c)); $('#colPick2').value = c;
  rebuildTitleRobot(); sfx('tick');
}
$('#colPick2').addEventListener('input', e => setAccent(e.target.value));
function setPaint(c) {
  CUSTOM.color = c; saveCustom();
  $$('#swatches .sw').forEach(b => b.classList.toggle('on', b.dataset.c === c)); $('#colPick').value = c;
  rebuildTitleRobot(); sfx('tick');
}
function drawPatchEditor() {
  const cv = $('#patchCv'), c = cv.getContext('2d'), s = cv.width / PATCH_N;
  c.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < PATCH_N; y++) for (let x = 0; x < PATCH_N; x++) {
    const col = CUSTOM.patch[y * PATCH_N + x];
    c.fillStyle = col || (((x + y) & 1) ? '#20262b' : '#272e34');       // checkerboard = transparent
    c.fillRect(x * s, y * s, s, s);
  }
  c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
  for (let i = 1; i < PATCH_N; i++) { c.beginPath(); c.moveTo(i * s + 0.5, 0); c.lineTo(i * s + 0.5, cv.height); c.moveTo(0, i * s + 0.5); c.lineTo(cv.width, i * s + 0.5); c.stroke(); }
}
let patchDirty = false, lastCell = null;
function paintAt(e) {
  const cv = $('#patchCv'), r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * PATCH_N), y = Math.floor((e.clientY - r.top) / r.height * PATCH_N);
  const col = painting === 2 ? null : brush;
  // fill every cell along the stroke since the last event, so fast strokes leave no gaps
  const from = lastCell || [x, y], n = Math.max(Math.abs(x - from[0]), Math.abs(y - from[1]), 1);
  for (let k = 0; k <= n; k++) {
    const cx = Math.round(from[0] + (x - from[0]) * k / n), cy = Math.round(from[1] + (y - from[1]) * k / n);
    if (cx < 0 || cy < 0 || cx >= PATCH_N || cy >= PATCH_N) continue;
    const i = cy * PATCH_N + cx;
    if (CUSTOM.patch[i] !== col) { CUSTOM.patch[i] = col; patchDirty = true; }
  }
  lastCell = [x, y];
  if (patchDirty) { drawPatchEditor(); if (!patchUnsaved) { patchUnsaved = true; renderPatchDir(); } }
}
$('#patchCv').addEventListener('pointerdown', e => { painting = e.button === 2 ? 2 : 1; lastCell = null; $('#patchCv').setPointerCapture(e.pointerId); paintAt(e); });
$('#patchCv').addEventListener('pointermove', e => { if (painting) paintAt(e); });
const endPaint = () => { if (!painting) return; painting = 0; if (patchDirty) { patchDirty = false; patchUnsaved = true; CUSTOM.rev++; rebuildTitleRobot(); renderPatchDir(); } };
$('#patchCv').addEventListener('pointerup', endPaint); $('#patchCv').addEventListener('pointercancel', endPaint);
$('#patchCv').addEventListener('contextmenu', e => e.preventDefault());
$('#colPick').addEventListener('input', e => setPaint(e.target.value));
$('#patchClear').addEventListener('click', () => { CUSTOM.patch = new Array(PATCH_N * PATCH_N).fill(null); patchUnsaved = true; CUSTOM.rev++; drawPatchEditor(); renderPatchDir(); rebuildTitleRobot(); });
$('#custDone').addEventListener('click', () => {
  if (patchUnsaved) commitPatch(); $('#custPanel').hidden = true; $('.tmain').hidden = false; S.mode = 'title'; TITLE.life = 0; focusFirst(); });
$('#tCustom').addEventListener('click', openCustomize);

/* ---------- cosmetics in Customize: drag them out of the shelf onto the frame, slide them around, drop them back to remove ---------- */
function robotHit(e) {
  if (!TITLE.robot) return null;
  return stickerRay(e).intersectObject(TITLE.robot, true).find(h => {
    if (!h.object.visible || h.object.isSprite || !h.face) return false;
    let o = h.object; while (o) { if (o.userData && o.userData.cosmetic) return false; o = o.parent; } return true;
  }) || null;
}
function cosmeticAt(e) {
  if (!TITLE.robot || !TITLE.robot.userData.cosmetics) return null;
  const hit = stickerRay(e).intersectObjects(TITLE.robot.userData.cosmetics, true).find(h => !h.object.isSprite);
  if (!hit) return null;
  let o = hit.object; while (o && !(o.userData && o.userData.cosmetic)) o = o.parent; return o;
}
/* turn a point on the robot into "the n-th <kind>, this sub-part, here, facing out this way" */
function hitToCosmetic(hit, type) {
  const R = TITLE.robot, rev = new Map(); R.userData.partOf.forEach((g, it) => rev.set(g, it));
  let part = hit.object; while (part && part !== R && !rev.has(part)) part = part.parent;
  if (!part || part === R) return null;
  const it = rev.get(part), idx = cosmeticTargets(TITLE.L).filter(x => x.kind === it.kind).indexOf(it);
  let target = hit.object.parent, chain = [], n = target;
  while (n && n !== part) { chain.push(n); n = n.parent; }
  if (n !== part) { target = part; chain = []; }
  const path = []; let cur = part; for (const c of chain.reverse()) { path.push(cur.children.indexOf(c)); cur = c; }
  const nw = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (COSMETICS[type].up) { nw.y += 1.3; nw.normalize(); }                     // hats and pumpkins stay fairly upright
  const nl = nw.applyQuaternion(target.getWorldQuaternion(new THREE.Quaternion()).invert());
  const p = target.worldToLocal(hit.point.clone());
  const ws = target.getWorldScale(new THREE.Vector3()).x / (R.scale.x || 1);
  const r3 = v => +v.toFixed(4);
  return { type, kind: it.kind, idx, ptype: it.type, path, p: [r3(p.x), r3(p.y), r3(p.z)], n: [r3(nl.x), r3(nl.y), r3(nl.z)], s: r3(1 / (ws || 1)) };
}
function setCosmetic(type, data) {
  CUSTOM.cosmetics = CUSTOM.cosmetics.filter(c => c.type !== type);
  if (data) CUSTOM.cosmetics.push(data);
  saveCustom(); rebuildTitleRobot(); renderCosShelf();
}
function renderCosShelf() {
  const el = $('#cosShelf'); if (!el) return;
  el.innerHTML = Object.entries(COSMETICS).filter(([, c]) => !c.hidden).map(([k, c]) =>
    `<button class="cos nav${CUSTOM.cosmetics.some(x => x.type === k) ? ' on' : ''}" data-cos="${k}" title="${c.name}">${c.icon}<span>${c.name}</span></button>`).join('');
}
renderCosShelf();
const overCustPanel = e => { const r = $('#custPanel').getBoundingClientRect(); return !$('#custPanel').hidden && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
$('#cosShelf').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-cos]'); if (!b || e.button !== 0) return;
  e.preventDefault();
  const gh = document.createElement('div'); gh.className = 'cosghost'; gh.innerHTML = COSMETICS[b.dataset.cos].icon; document.body.appendChild(gh);
  gh.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  TITLE.cosNew = { type: b.dataset.cos, ghost: gh, x: e.clientX, y: e.clientY, moved: false };
  sfx('grab', 0.5);
});
function cosmeticPointerMove(e) {
  const N = TITLE.cosNew;
  if (N) {
    N.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    if (Math.hypot(e.clientX - N.x, e.clientY - N.y) > 6) N.moved = true;
    N.ghost.classList.toggle('ok', !!robotHit(e));
    document.body.style.cursor = 'grabbing'; return true;
  }
  const C = TITLE.cosMove; if (!C) return false;
  const d = TITLE.clickDown; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) C.moved = true;
  if (!C.moved) return true;
  document.body.style.cursor = 'grabbing';
  const hit = robotHit(e), data = hit && hitToCosmetic(hit, C.obj.userData.cosmetic);
  if (data) {
    // slide it over the frame: it re-sticks to whatever part is under the cursor
    const at = cosmeticPart(TITLE.L, TITLE.robot.userData, data);
    if (at) { at.g.add(C.obj); placeCosmetic(C.obj, data); C.data = data; C.anchor = { x: e.clientX, y: e.clientY }; C.base = C.obj.position.clone(); if (C.peeling) { C.peeling = false; } }
    return true;
  }
  // off the frame: it's still stuck, so it stretches toward the cursor... then tears free
  const an = C.anchor || TITLE.clickDown || { x: e.clientX, y: e.clientY };
  if (!C.base) C.base = C.obj.position.clone();
  const pull = Math.hypot(e.clientX - an.x, e.clientY - an.y), k = Math.min(1, pull / 90);
  if (k > 0.1 && !C.peeling) { C.peeling = true; sfx('peel', 0.3); }
  const tgt = stickerRay(e).ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(TITLE.cam.getWorldDirection(new THREE.Vector3()).negate(), C.obj.parent.localToWorld(C.base.clone())), new THREE.Vector3());
  C.obj.position.copy(C.base);
  if (tgt) { const w0 = C.obj.parent.localToWorld(C.base.clone()), off = tgt.sub(w0).clampLength(0, 0.28 * k); C.obj.position.copy(C.obj.parent.worldToLocal(w0.add(off))); }
  C.obj.rotation.z = Math.sin(performance.now() * 0.05) * 0.06 * k;
  if (k >= 1) {
    TITLE.cosMove = null;
    const type = C.obj.userData.cosmetic;
    CUSTOM.cosmetics = CUSTOM.cosmetics.filter(c => c.type !== type); saveCustom(); renderCosShelf();
    TITLE.robot.userData.cosmetics = TITLE.robot.userData.cosmetics.filter(o => o !== C.obj);
    TITLE.scene.attach(C.obj);
    startFling(C.obj, e, type);
    sfx('peel', 0.8);
  }
  return true;
}
function cosmeticPointerUp(e) {
  const N = TITLE.cosNew;
  if (N) {
    TITLE.cosNew = null; N.ghost.remove(); document.body.style.cursor = '';
    const hit = robotHit(e);
    if (hit) { const data = hitToCosmetic(hit, N.type); if (data) { setCosmetic(N.type, data); sfx('snap', 0.6); } }
    else if (!N.moved) {
      // a plain click on the shelf: put it on (on top of the frame) or take it off
      if (CUSTOM.cosmetics.some(c => c.type === N.type)) { setCosmetic(N.type, null); sfx('pop', 0.5); }
      else {
        const R = TITLE.robot; R.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(R), c = bb.getCenter(new THREE.Vector3());
        if (COSMETICS[N.type].up) _sray.set(new THREE.Vector3(c.x, bb.max.y + 2, c.z), new THREE.Vector3(0, -1, 0));
        else { c.y = bb.min.y + (bb.max.y - bb.min.y) * 0.62; _sray.set(TITLE.cam.position.clone(), c.clone().sub(TITLE.cam.position).normalize()); }   // badges go on the side facing you
        const hit2 = _sray.intersectObject(R, true).find(h => h.object.visible && !h.object.isSprite && h.face);
        const data = hit2 && hitToCosmetic(hit2, N.type);
        if (data) { setCosmetic(N.type, data); sfx('snap', 0.6); } else sfx('deny', 0.4);
      }
    } else sfx('deny', 0.4);
    return;
  }
  const C = TITLE.cosMove;
  if (C) {
    TITLE.cosMove = null; document.body.style.cursor = '';
    if (C.moved) {
      const type = C.obj.userData.cosmetic;
      if (C.data) { setCosmetic(type, C.data); sfx('snap', 0.5); } else rebuildTitleRobot();     // let go before it tore free: it springs back
      TITLE.clickDown = null; return;
    }
  }
  // five quick clicks on the robot: light one up (or put it out)
  const d = TITLE.clickDown; TITLE.clickDown = null;
  if (!d || !d.hit || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
  const now = performance.now();
  TITLE.clicks = (TITLE.clicks || []).filter(t => now - t < 1800); TITLE.clicks.push(now);
  if (TITLE.clicks.length < 5) return;
  TITLE.clicks = [];
  if (CUSTOM.cosmetics.some(c => c.type === 'cig')) { setCosmetic('cig', null); sfx('pop', 0.5); }
  else { const data = hitToCosmetic(d.hit, 'cig'); if (data) { setCosmetic('cig', data); sfx('fuse', 0.5); } }
}

/* ---------- Customize tabs ---------- */
function custTab(name) {
  $$('#custPanel .ctab').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('#custPanel .cpage').forEach(p => { p.hidden = p.dataset.page !== name; });
  TITLE.custTab = name;
}
$$('#custPanel .ctab').forEach(b => b.addEventListener('click', () => { custTab(b.dataset.tab); sfx('tick', 0.3); }));

/* ---------- peeled things in your hand, and thrown away ---------- */
TITLE.thrown = [];
function startFling(obj, e, cosType) {
  TITLE.fling = { obj, cosType, hist: [], plane: new THREE.Plane().setFromNormalAndCoplanarPoint(TITLE.cam.getWorldDirection(new THREE.Vector3()).negate(), obj.getWorldPosition(new THREE.Vector3())) };
  flingMove(e);
}
function flingMove(e) {
  const F = TITLE.fling; if (!F) return false;
  document.body.style.cursor = 'grabbing';
  const p = stickerRay(e).ray.intersectPlane(F.plane, new THREE.Vector3());
  if (p) { F.obj.position.lerp(p, 0.7); F.hist.push({ t: performance.now(), p: F.obj.position.clone() }); if (F.hist.length > 8) F.hist.shift(); }
  F.obj.rotation.z += 0.02;
  // a peeled cosmetic dragged back onto the frame sticks again
  if (F.cosType) {
    const hit = robotHit(e), data = hit && hitToCosmetic(hit, F.cosType);
    if (data) { TITLE.fling = null; TITLE.scene.remove(F.obj); setCosmetic(F.cosType, data); sfx('snap', 0.5); TITLE.clickDown = null; }
  }
  return true;
}
function flingRelease() {
  const F = TITLE.fling; if (!F) return false;
  TITLE.fling = null; document.body.style.cursor = '';
  // throw velocity from the last few moves
  const h = F.hist, now = performance.now(), recent = h.filter(q => now - q.t < 120);
  const v = new THREE.Vector3();
  if (recent.length >= 2) { const a = recent[0], b = recent[recent.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000); v.subVectors(b.p, a.p).divideScalar(dt); }
  v.clampLength(0, 26); v.y += 2.5;
  TITLE.thrown.push({ obj: F.obj, v, w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: 1.8 });
  sfx(v.length() > 8 ? 'swish' : 'pop', 0.5);
  return true;
}
function thrownTick(dt) {
  for (const T of TITLE.thrown) {
    T.life -= dt; T.v.y -= 16 * dt;
    T.obj.position.addScaledVector(T.v, dt);
    T.obj.rotation.x += T.w.x * dt; T.obj.rotation.y += T.w.y * dt; T.obj.rotation.z += T.w.z * dt;
    if (T.life < 0.4) T.obj.scale.multiplyScalar(0.88);
    if (T.life <= 0) TITLE.scene.remove(T.obj);
  }
  TITLE.thrown = TITLE.thrown.filter(T => T.life > 0);
}

/* ---------- now and then a pile of guns falls out of the sky onto the title robot ---------- */
TITLE.guns = []; TITLE.gunT = rand(10, 20);
function spawnGunPile() {
  const R = TITLE.robot; if (!R) return;
  R.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(R), c = bb.getCenter(new THREE.Vector3()), n = 5 + Math.floor(Math.random() * 5);
  const types = Object.keys(WEAPONS);
  for (let i = 0; i < n; i++) {
    const it = mkItem('weapon', pick(types), 1);
    const model = buildPart(it, new THREE.Vector3(1, 0, 0), null);
    const box = new THREE.Box3().setFromObject(model), mc = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    model.position.copy(mc).negate();
    const g = new THREE.Group(); g.add(model);
    g.position.set(c.x + rand(-0.9, 0.9), bb.max.y + 5 + i * 0.9, c.z + rand(-0.9, 0.9));
    g.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    TITLE.scene.add(g);
    TITLE.guns.push({ g, v: new THREE.Vector3(rand(-0.5, 0.5), rand(-3, -1), rand(-0.5, 0.5)), w: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)), r: clamp(Math.max(sz.x, sz.y, sz.z) * 0.4, 0.2, 0.55), rest: 0, bonkT: 0, life: 1 });
  }
  sfx('swish', 0.4);
}
const _tgp = new THREE.Vector3(), _tgn = new THREE.Vector3();
function titleGunTick(dt) {
  const R = TITLE.robot;
  if (S.mode === 'title' && R && R.userData.landed && !(TITLE.respawnT > 0)) { TITLE.gunT -= dt; if (TITLE.gunT <= 0) { TITLE.gunT = rand(22, 40); spawnGunPile(); } }
  if (!TITLE.guns.length) return;
  // the robot as a capsule for the guns to bounce off
  let seg = null;
  if (R) { R.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(R), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()); const rad = Math.max(0.5, Math.min(sz.x, sz.z) * 0.42); seg = { x: c.x, z: c.z, y0: bb.min.y + rad, y1: Math.max(bb.min.y + rad, bb.max.y - rad * 0.6), rad }; }
  for (const G of TITLE.guns) {
    G.bonkT -= dt;
    G.v.y -= 22 * dt;
    G.g.position.addScaledVector(G.v, dt);
    G.g.rotation.x += G.w.x * dt; G.g.rotation.y += G.w.y * dt; G.g.rotation.z += G.w.z * dt;
    const p = G.g.position;
    if (seg) {
      _tgp.set(seg.x, clamp(p.y, seg.y0, seg.y1), seg.z); _tgn.subVectors(p, _tgp);
      const d = _tgn.length(), min = seg.rad + G.r;
      if (d < min) {
        if (d < 1e-4) _tgn.set(rand(-1, 1), 1, rand(-1, 1)); _tgn.normalize();
        p.copy(_tgp).addScaledVector(_tgn, min);
        const vn = G.v.dot(_tgn);
        if (vn < 0) {
          G.v.addScaledVector(_tgn, -1.5 * vn); G.v.x += _tgn.x * 1.5; G.v.z += _tgn.z * 1.5;
          G.w.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
          if (-vn > 2 && G.bonkT <= 0) {
            G.bonkT = 0.12; sfx('bonk', Math.min(0.8, 0.25 + -vn * 0.05));
            TITLE.hurtT = 0.9; R.userData.dipV = (R.userData.dipV || 0) - Math.min(3, -vn * 0.25);
          }
        }
      }
    }
    // the floor: the round stage, then the grid below it
    const fy = (Math.hypot(p.x, p.z) < 3.4 ? 0 : -0.3) + G.r * 0.5;
    if (p.y < fy) {
      p.y = fy;
      if (G.v.y < -2.5 && G.bonkT <= 0) { G.bonkT = 0.1; sfx('thud', Math.min(0.5, -G.v.y * 0.04)); }
      G.v.y = -G.v.y * 0.3; G.v.x *= 0.7; G.v.z *= 0.7; G.w.multiplyScalar(0.6);
      if (Math.abs(G.v.y) < 0.6) G.v.y = 0;
    }
    // lying still for a few seconds: shrink away
    const still = G.v.length() < 0.4 && p.y <= fy + 0.02;
    G.rest = still ? G.rest + dt : 0;
    if (G.rest > 2.6) { G.life -= dt * 2.5; G.g.scale.setScalar(Math.max(0.001, G.life)); }
  }
  TITLE.guns = TITLE.guns.filter(G => { if (G.life <= 0) { TITLE.scene.remove(G.g); return false; } return true; });
}
$('#tStore').addEventListener('click', e => { const b = e.currentTarget; sfx('deny'); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); });
