'use strict';
/* Run flow, fixed-timestep simulation and the frame loop. */
const S = {
  mode: 'hangar', inRun: false, stage: 1, t: 0, total: 0, kills: 0, level: 1, xp: 0, need: xpNeed(0), pendingLv: 0,
  spawnAcc: 0, flowT: 0, gate: null, gateOpen: false, bossSpawned: false, bossDead: false, boss: null,
  nextMini: 300, hordes: [], hordeIdx: 0, bannerT: 0, prevMode: 'play',
};

/* The hangar starts with an empty stand and the starter parts on the shelf. */
function freshHangarLoadout() {
  // a ready-to-go frame on the stand: two bodies stacked, two legs, two arms with a pistol each
  L = newLoadout();
  const F = f => FACE_ORDER.indexOf(f);
  if (BUILD_V2) {
    // V2 starter: walker legs, a scout torso, two arms; only the first carries a pistol (the hangar allows 1 pistol until it's mastered)
    L.body = mkItem('lower', 'standard');
    const top = mkItem('block', 'upper_scout'); L.body.slots[F('top')] = top;
    for (let i = 0; i < 2; i++) { const a = mkItem('arm', 'basic'); if (i === 0) a.weapon = mkItem('weapon', 'pistol'); top.slots[i] = a; }
    INV.shelf = []; stats = null; refreshLoadout(); return;
  }
  L.body = mkItem('block', 'body'); L.body.plug = 'bottom';
  L.body.slots[F('left')] = mkItem('leg', 'basic'); L.body.slots[F('right')] = mkItem('leg', 'basic');
  const top = mkItem('block', 'body'); L.body.slots[F('top')] = top;
  for (const side of ['left', 'right']) { const a = mkItem('arm', 'basic'); a.weapon = mkItem('weapon', 'pistol'); top.slots[F(side)] = a; }
  INV.shelf = [];
  stats = null;
  refreshLoadout();
}

function newRun() {
  // an incomplete build can never enter combat (lower half, torso and an arm are all required)
  { const need = typeof buildProblems === 'function' ? buildProblems() : []; if (need.length) { if (typeof say === 'function') say(`Needs: ${need.join(', ')}`, true); return false; } }
  Object.assign(S, { inRun: true, test: false, stage: 1, shopBuys: 0, total: 0, kills: 0, level: 1, xp: 0, need: xpNeed(0), pendingLv: 0, bolts: 0, caseCount: 0 });
  S.st = newRunStats();
  stats = null; refreshLoadout();
  player.hp = stats.maxHp; player.shield = stats.maxShield;
  $('#hud').hidden = false;
  startStage();
  lockPointer();
}
function clearWorld() {
  enemies.forEach(e => { scene.remove(e.mesh); if (e.bar) scene.remove(e.bar); });
  targets.forEach(t => scene.remove(t.mesh)); targets = []; shots.forEach(s => scene.remove(s.mesh)); gems.forEach(g => scene.remove(g.mesh)); fx.forEach(f => scene.remove(f.obj));
  CULL.q = []; enemies = []; shots = []; gems = []; fx = []; egReset(); pfxClear(); WRECKS = 0; clearSkyRings(); wdClear(); wfxClear(); S.streak = 0; S.streakT = 0; $('#killMul').hidden = true; S.frenzyT = 0; $('#fzBar').hidden = true;
  if (S.gate) { scene.remove(S.gate.group); S.gate = null; }
  clearSpectators(); clearShop(); clearTerminal(); clearHazards(); TERM.nextAt = 0; TERM.checkT = 0; clearCases(); clearLegTrail(); clearStains();
  if (S.nuke) { scene.remove(S.nuke.obj); S.nuke = null; }
  physDestroyRobot();
  clearRagdoll();
  if (DR.active) { DR.pieces.forEach(p => scene.remove(p.obj)); DR.pieces = []; DR.active = false; }
  endAtmos(); if (pickRing) pickRing.visible = false; $('#qrIntro').hidden = true;
  $('#countdown').hidden = true;
}
function startStage() {
  clearWorld();
  genTerrain((Math.random() * 1e9) | 0);
  setLevelPalette(); _skyCol.copy(LEVEL_PAL.sky);
  buildTerrainMesh(); mmBuild();
  physResetWorld();
  Object.assign(S, {
    t: 0, spawnAcc: 0, flowT: 0, rerolls: 3, shopAwayT: 0, berserkT: 0, berserkLast: -999, vacSeeded: false, vacT: 0, gateOpen: false, bossSpawned: false, bossDead: false, boss: null, mini: null, nextMini: 200, hordeIdx: 0,
    hordes: [{ t: rand(140, 170) / TIME_K }, { t: rand(400, 440) / TIME_K }, { t: rand(640, 690) / TIME_K }],
  });
  const P = player;
  P.pos.set(rand(-25, 25), DROP_HEIGHT, rand(-25, 25)); P.prev.copy(P.pos); P.vel.set(0, -18, 0);
  placeTargets();
  placeSkyLoot(P.pos);
  placeShop();
  placeCases();
  placeProps();
  wdBuildStage(); buildSpectators();
  P.onGround = false; P.visY = P.pos.y; P.camY = P.pos.y + CFG.camHeight;
  P.hp = stats.maxHp; P.shield = stats.maxShield; P.slideT = P.dashT = 0;
  cam.pitch = 1.2; cam.dist = 30;
  scene.fog.near = 220; scene.fog.far = 520;
  S.mode = 'countdown'; S.countT = 3.99; S.countShown = -1;
  drawLevelQR();
  $('#stageTxt').textContent = S.stage; $('#bossbar').hidden = true;
  if (player.model) { scene.remove(player.model); }
  player.model = buildRobot(L); scene.add(player.model); rebuildWeaponProps(); renderLoadoutHUD();
  banner(`STAGE ${S.stage}`, 'Hit the rings', 'var(--orange)', 2);
  $('#hint').innerHTML = 'Steer with WASD / left stick · fly through the floating scrap';
}
function land() {
  const P = player;
  endDropRag(); endAtmos(); $('#qrIntro').hidden = true;
  P.pos.y = groundAt(P.pos.x, P.pos.z); P.vel.set(0, 0, 0); P.onGround = true; P.peak = P.pos.y;
  if (S.megaLand) {
    // coming down from a mega jump: the impact wipes out everything nearby (bosses just take a hit)
    S.megaLand = false;
    const R = 16;
    MASS_KILL = true;
    for (const e of enemies.slice()) {
      if (e.dead || Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > R) continue;
      if (e.boss || e.mini) damage(e, e.maxHp * 0.15); else { damage(e, e.hp + 1); }
    }
    MASS_KILL = false;
    blast(P.pos.clone().setY(P.pos.y + 1), 6, 0xff5a3a); ring(P.pos, R, 0.8, 0xff3a3a); ring(P.pos, R * 0.6, 0.6, ORANGE); dust(P.pos, 20);
    propsBlast(P.pos.clone(), R, 8); sfx('boom', 1); cam.shake = 1;
    enemies = enemies.filter(e => !e.dead);
  }
  S.mode = 'play'; cam.shake = 0.7; cam.pitch = 0.25; cam.bobV -= 4;
  gems.filter(g => g.sky).forEach(g => { g.done = true; scene.remove(g.mesh); }); gems = gems.filter(g => !g.done);
  ring(P.pos, 10, 0.6, ORANGE); dust(P.pos, 14);
  computeFlow(P.pos.x, P.pos.z);
  $('#hint').innerHTML = `${keyHint('LMB', 'RT')}fire ${stats.canSprint ? keyHint('Shift', 'LB') + 'boost ' : ''}${keyHint('C', 'B')}slide ${keyHint('Enter', 'View')}inventory`;
  setTimeout(() => { if (S.mode === 'play') $('#hint').innerHTML = ''; }, 9000);
  banner('TOUCHDOWN', S.t < 1 ? 'Boss at 8:30' : '', 'var(--orange)', 2.2);
}
function toHangar() {
  flushMeta();
  ['#over', '#pause', '#levelup', '#perk'].forEach(s => { $(s).hidden = true; });
  $('#hud').hidden = true;
  clearWorld();
  if (player.model) { scene.remove(player.model); player.model = null; }
  player.props.forEach(o => scene.remove(o)); player.props = [];
  S.inRun = false; S.test = false; devPanelClose(true); benchReset();
  freshHangarLoadout();
  openInventory(true);
}

function updateTimeline() {
  if (S.test) return;      // no hordes, brutes, gate or Warden timer on the test range
  if (S.t >= S.nextMini && S.t < BOSS_AT - 20) { spawnMini(); S.nextMini += 200; } else if (S.t >= S.nextMini) S.nextMini += 200;
  const h = S.hordes[S.hordeIdx];
  if (h) {
    if (!h.warned && S.t >= h.t - 6) { h.warned = true; h.ang = Math.random() * Math.PI * 2; banner('HORDE', `${dirName(h.ang).toUpperCase()} · 6s`, 'var(--hostile)', 3); }
    if (S.t >= h.t) { spawnHorde(h); S.hordeIdx++; if (S.hordeIdx >= S.hordes.length) S.hordes.push({ t: S.t + rand(150, 200) / TIME_K }); }
  }
  if (!S.bossSpawned && S.t >= BOSS_AT) { if (!S.gate) placeGate(); spawnBoss(); setGateState('sealed'); }
}
function updateInteract() {
  let prompt = shopPrompt() || casePrompt() || terminalPrompt();
  if (S.mode !== 'play') return;
  const P = player;
  if (S.gate) {
    const d = Math.hypot(S.gate.x - P.pos.x, S.gate.z - P.pos.z), dy = Math.abs(S.gate.y - P.pos.y);
    if (d < 4.5 && dy < 4) {
      const k = keyHint('E', 'X');
      if (S.gate.state === 'exit') { prompt = `${k}Exit`; if (IN.interactP) { IN.interactP = false; $('#prompt').hidden = true; nextStage(); return; } }
      else prompt = `${sym('warn', '')} Sealed`;
    }
  }
  IN.interactP = false;
  $('#prompt').hidden = !prompt; if (prompt) $('#prompt').innerHTML = prompt;
}

const SIM_DT = 1 / CFG.simHz;
function simStep(dt) {
  const P = player;
  P.prev.copy(P.pos);
  if (S.mode === 'drop') { dropStep(dt); return; }
  const sub = dt / CFG.playerSubsteps;
  for (let i = 0; i < CFG.playerSubsteps; i++) playerStep(sub);
  physStep(dt);
  P.shieldT -= dt; if (P.shieldT <= 0) P.shield = Math.min(stats.maxShield, P.shield + stats.shieldRate * dt);
  S.t += dt;
  runStatTick(dt);
  updateTimeline();
  S.flowT -= dt; if (S.flowT <= 0) { S.flowT = 0.35; computeFlow(P.pos.x, P.pos.z); }
  updateAim();
  spawnTick(dt);
  updateEnemies(dt);
  hazardTick(dt); gemComboTick(dt);
  if (S.mode !== 'play') return;
  updateWeapons(dt);
  updateShots(dt);
  wfxTick(dt);
  legGemTick(dt);
  skyBarrelTick(dt);
  frenzyTick(dt);
  berserkTick(dt);
  vacTick(dt);
  streakTick(dt);
  nukeTick(dt);
  podTick(dt);
  whirlTick(dt);
  bladeTick(dt);
  updateGems(dt);
  updateInteract();
  if (S.mode === 'play' && S.pendingLv > 0) openLevelUp();
}

/* at most 3 logic steps per drawn frame: a slow frame used to trigger up to 8 catch-up steps, which made the next frame
   slower still (a spiral). Now a very heavy moment runs slightly slow-motion instead of tanking the framerate. */
const MAX_CATCHUP = 3;
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const perfT0 = performance.now(); let perfSim = 0;
  pollInput(dt);
  try { musicTick(dt); } catch (e) { console.warn('music', e); }
  if (cineTick(dt)) { requestAnimationFrame(frame); return; }          // the MK III reveal owns the frame (gameplay and the stage clock stand still)
  if (S.mode === 'title' || S.mode === 'custom' || S.mode === 'catalog' || (S.mode === 'pause' && TITLE.fromOptions)) {
    renderTitle(dt);
  } else if (S.mode === 'hangar' || S.mode === 'inv') {
    renderPreview(dt);
  } else {
    let alpha = 1;
    if (playing()) {
      acc += dt; let n = 0;
      if (S.slowT > 0) { S.slowT -= dt; acc -= dt * 0.7; }          // a sniper kill: a beat of slow motion
      const st0 = performance.now();
      while (acc >= SIM_DT && n < MAX_CATCHUP && playing()) { simStep(SIM_DT); acc -= SIM_DT; n++; }
      perfSim = performance.now() - st0;
      if (n >= MAX_CATCHUP) acc = 0;     // too far behind: let the game slow down a touch rather than spiral
      alpha = clamp(acc / SIM_DT, 0, 1);
      updatePickRing(S.mode === 'drop', dt);
      if (S.mode === 'drop') {
        scene.fog.near = lerp(scene.fog.near, 60, dt * 0.4); scene.fog.far = lerp(scene.fog.far, 180, dt * 0.4);
        const alt = player.pos.y - groundAt(player.pos.x, player.pos.z);
        if (alt < 30) cam.pitch = lerp(cam.pitch, 0.35, dt * 1.5);
      }
    }
    updateFx(playing() || ['dying', 'over', 'levelup', 'countdown'].includes(S.mode) ? dt : 0);
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) $('#banner').hidden = true; }
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    padMeshes.forEach(m => m.material.emissive.setRGB(0.1, 0.35 + 0.25 * pulse, 0.38 + 0.25 * pulse));
    if (S.gate) S.gate.beam.material.opacity = 0.12 + 0.08 * pulse;
    weaponModelTick(dt); armorTick(dt); shopTick(dt); caseTick(dt); terminalTick(dt); if (S.inRun) updateSpectators(dt);
    if (S.mode === 'countdown') {
      // hanging at the top of the drop: 3, 2, 1...
      S.countT -= dt;
      // 3, 2, 1 over the QR; the fall starts as it dissolves, and the camera pulls out to catch the frame falling into view
      const n = Math.ceil(S.countT - 1.2);
      if (n !== S.countShown) {
        S.countShown = n;
        const el = $('#countdown'); el.hidden = false;
        el.textContent = n > 0 ? n : 'DROP';
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        if (n > 0) sfx('beep'); else sfx('launch');
      }
      if (S.countT <= 1.2) { setTimeout(() => { $('#countdown').hidden = true; }, 500); S.mode = 'drop'; startDropRag(); cam.shake = 0.35; INTRO.k = 0; }
      player.renderPos.copy(player.pos); player.visY = player.pos.y;
      if (player.model) { player.model.position.copy(player.pos); player.model.visible = S.mode !== 'countdown'; }
      updateCamera(dt); introCamera(dt); updateHUD(dt);
    } else if (DR.active) {
      // the limp frame tumbling through the atmosphere
      stepDropRag(dt);
      player.renderPos.copy(player.pos); player.visY = player.pos.y;
      updateAtmos(dt);
      updateCamera(dt);
      if (INTRO.k < 1) { INTRO.k = Math.min(1, INTRO.k + dt / 1.5); introCamera(dt); }       // still pulling out of the QR shot
      updateHUD(dt);
    } else if (RAG.active) {
      // dying / dead: the wreck tumbles, the camera circles it
      stepRagdoll(dt);
      const c = ragdollCenter();
      if (c) { player.renderPos.copy(c); player.visY = c.y - 0.8; }
      cam.yaw += dt * 0.35; cam.pitch = lerp(cam.pitch, 0.6, dt * 2);
      updateCamera(dt);
      if (S.mode === 'dying') {
        S.dieT -= dt;
        updateEnemies(dt * 0.5); updateShots(dt * 0.5);
        if (S.dieT <= 0) showGameOver();
      }
    } else if (player.model && S.inRun) {
      updatePlayerVisual(dt, playing() ? alpha : 1);
      physSync(playing() ? alpha : 1); syncProps();
      updateCamera(dt);
      updateHUD(dt);
    }
    if (SETTINGS.dev) { renderer.info.autoReset = false; renderer.info.reset(); }
    rigBatchSync(RAG.active || DR.active ? null : player.model);      // (the ragdolls move the pieces themselves: those draw as plain meshes)
    updateEnemyBatches(); batchFx();
    const rt0 = performance.now();
    renderFrame(scene, camera);
    if (SETTINGS.dev) perfTick(dt, performance.now() - perfT0, perfSim, performance.now() - rt0);
    if (STRESS.on) stressTick(now);
  }
  requestAnimationFrame(frame);
}

/* ---------- drop intro: looking straight down at the arena, which first shows as a QR code
   (drawn from the arena's own heightmap), match-cuts into the real 3D level, then the camera swoops up
   to your frame hanging at the top of the drop as the countdown hits zero ---------- */
const INTRO = { top: new THREE.Vector3(), tq: new THREE.Quaternion(), gy: 0, k: 1 };
function drawLevelQR() {
  /* The arena seen from straight above, printed as a QR code. It cheats to read as a real one: every terrain cell
     is one module, dithered by how high it sits (peaks almost always print black, crevasses white, the middle
     ground is speckled like data), and the real QR furniture is stamped on top: three finder eyes with white
     separators, the dotted timing lines, alignment squares, format and version bits and a white quiet zone. */
  const cv = $('#qrIntro'), Q = 4, N = GRID + Q * 2;
  cv.width = cv.height = N;
  const c = cv.getContext('2d'), W = '#f4f2ea', K = '#111416';
  c.fillStyle = W; c.fillRect(0, 0, N, N);
  const hs = Array.from(H).filter((h, k) => inner(k)).sort((a, b) => a - b), med = hs[(hs.length / 2) | 0] || 0;
  INTRO.gy = med;
  const bound = (h, up) => { let lo = 0, hi = hs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (up ? hs[m] <= h : hs[m] < h) lo = m + 1; else hi = m; } return lo; };
  const rank = h => hs.length ? (bound(h, false) + bound(h, true)) / 2 / hs.length : 0.5;     // ties (flat plateaus) share their middle rank
  const seed = (Math.random() * 1e9) | 0;
  const noise = (i, j) => { let x = (i * 374761393 + j * 668265263 + seed) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const mod = new Uint8Array(GRID * GRID);
  for (let k = 0; k < NC; k++) {
    const i = k % GRID, j = (k / GRID) | 0;
    const p = inner(k) ? rank(H[k]) : 1;                 // the outer walls are the highest ground: black
    // squeeze the height towards the middle, then dither: high ground is ~80% black, low ground ~20%, like QR data
    mod[k] = noise(i, j) < 0.5 + (p - 0.5) * 0.62 ? 1 : 0;
  }
  const set = (i, j, v) => { if (i >= 0 && j >= 0 && i < GRID && j < GRID) mod[j * GRID + i] = v; };
  const rect = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, v); };
  const finder = (x, y) => { rect(x - 1, y - 1, 9, 9, 0); rect(x, y, 7, 7, 1); rect(x + 1, y + 1, 5, 5, 0); rect(x + 2, y + 2, 3, 3, 1); };
  const align = (x, y) => { rect(x - 2, y - 2, 5, 5, 1); rect(x - 1, y - 1, 3, 3, 0); set(x, y, 1); };
  // timing lines between the eyes
  for (let t = 8; t < GRID - 8; t++) { set(t, 6, t % 2 ? 0 : 1); set(6, t, t % 2 ? 0 : 1); }
  // alignment squares on a regular lattice (not under the eyes)
  const al = [6, 28, 52, GRID - 7];
  for (const ax of al) for (const ay of al) {
    if ((ax < 10 && ay < 10) || (ax > GRID - 11 && ay < 10) || (ax < 10 && ay > GRID - 11)) continue;
    if (ax === 6 || ay === 6) continue;
    align(ax, ay);
  }
  // format bits along the eyes, version blocks by the top-right and bottom-left eyes
  for (let t = 0; t < 9; t++) { if (t !== 6) { set(t, 8, noise(t, 99) > 0.5 ? 1 : 0); set(8, t, noise(99, t) > 0.5 ? 1 : 0); } }
  for (let t = 0; t < 8; t++) { set(GRID - 1 - t, 8, noise(t, 77) > 0.5 ? 1 : 0); set(8, GRID - 1 - t, noise(77, t) > 0.5 ? 1 : 0); }
  set(8, GRID - 8, 1);                                     // the always-dark module
  for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { set(GRID - 11 + b, a, noise(a, b + 50) > 0.5 ? 1 : 0); set(a, GRID - 11 + b, noise(a + 50, b) > 0.5 ? 1 : 0); }
  finder(0, 0); finder(GRID - 7, 0); finder(0, GRID - 7);
  c.fillStyle = K;
  for (let k = 0; k < NC; k++) if (mod[k]) c.fillRect(Q + k % GRID, Q + ((k / GRID) | 0), 1, 1);
  cv.dataset.q = Q; cv.hidden = false; cv.style.opacity = 0;
}
function introCamera(dt) {
  const t = S.countT, cv = $('#qrIntro'), dropping = S.mode !== 'countdown';
  // the straight-down QR shot hangs high above the drop height (with a narrow lens so the whole arena still fits),
  // so the frame is already below it and falls away into view as the camera dives after it
  const chaseFov = camera.fov, topH = DROP_HEIGHT + 80 - INTRO.gy, ext = HALF * 1.12;
  const fovTop = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(ext / topH, ext / (topH * camera.aspect))));
  INTRO.top.set(0, INTRO.gy + topH, 0.001);
  const fp = camera.position.clone(), fq = camera.quaternion.clone();
  camera.up.set(0, 0, -1); camera.position.copy(INTRO.top); camera.lookAt(0, INTRO.gy, 0); INTRO.tq.copy(camera.quaternion); camera.up.set(0, 1, 0);
  const k = dropping ? INTRO.k : 0, e = k * k * k * (k * (k * 6 - 15) + 10);          // smootherstep: a slow start, a long ease into the chase
  camera.position.lerpVectors(INTRO.top, fp, e); camera.quaternion.slerpQuaternions(INTRO.tq, fq, e);
  camera.fov = lerp(fovTop, chaseFov, e); camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  scene.fog.near = lerp(1200, 220, e); scene.fog.far = lerp(2400, 520, e);
  // the QR: in fast, hold, then dissolve into the level underneath (it's the same layout, so it lines up)
  const a = dropping ? 0 : t > 3.6 ? (3.99 - t) / 0.39 : t > 2.5 ? 1 : clamp((t - 1.5) / 1.0, 0, 1);
  cv.style.opacity = a.toFixed(3);
  if (a <= 0 && dropping) cv.hidden = true;
  if (a > 0) {
    const Q = +cv.dataset.q, cell = CELL, ext2 = HALF + Q * cell;
    const p1 = new THREE.Vector3(-ext2, INTRO.gy, -ext2).project(camera), p2 = new THREE.Vector3(ext2, INTRO.gy, ext2).project(camera);
    const x1 = (p1.x + 1) / 2 * innerWidth, y1 = (1 - p1.y) / 2 * innerHeight, x2 = (p2.x + 1) / 2 * innerWidth, y2 = (1 - p2.y) / 2 * innerHeight;
    Object.assign(cv.style, { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px' });
  }
}
/* ---------- atmosphere entry: heat shield glow, fire trail, speed streaks and a burning sky up high ---------- */
const ATM = { shell: null, core: null, lines: [], on: false, roarT: 0 };
const _skyCol = new THREE.Color(SKY), _hotSky = new THREE.Color(0x6a2a18);
function startAtmos() {
  const shellGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
  ATM.shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ATM.core = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(ATM.shell); scene.add(ATM.core);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = rand(4, 16);
    m.userData = { a, r, y: rand(-30, 30), len: rand(2, 6) };
    m.scale.set(0.05, m.userData.len, 0.05); scene.add(m); ATM.lines.push(m);
  }
  ATM.on = true;
}
function updateAtmos(dt) {
  if (!ATM.on) startAtmos();
  const P = player, alt = P.pos.y - groundAt(P.pos.x, P.pos.z);
  const k = clamp((alt - 110) / 140, 0, 1), fl = 0.85 + Math.random() * 0.3;
  const c = new THREE.Vector3(P.pos.x, P.pos.y + 0.6, P.pos.z);
  ATM.shell.position.copy(c); ATM.shell.scale.set(2.9 * fl, 3.6 * fl, 2.9 * fl); ATM.shell.material.opacity = 0.55 * k;
  ATM.core.position.copy(c); ATM.core.scale.set(2.1, 2.4 * fl, 2.1); ATM.core.material.opacity = 0.45 * k;
  ATM.shell.visible = ATM.core.visible = k > 0.01;
  // flames peel off the heat shield and stream up past the frame
  for (let i = 0; i < Math.round(k * 5); i++) {
    const m = new THREE.Mesh(geoBox, B(Math.random() < 0.5 ? 0xff7a1a : 0xffc04a)), s = rand(0.15, 0.4);
    m.scale.setScalar(s); m.position.copy(c).add(new THREE.Vector3(rand(-1.6, 1.6), rand(-1.5, 0.5), rand(-1.6, 1.6)));
    const v = new THREE.Vector3(rand(-2, 2), P.vel.y + rand(22, 34), rand(-2, 2));
    addFx(m, rand(0.25, 0.5), (f, dt2) => { f.obj.position.addScaledVector(v, dt2); f.obj.scale.setScalar(s * f.life / f.max); });
  }
  // speed streaks rushing upward around the camera
  const sk = Math.max(0.3, k);
  for (const m of ATM.lines) {
    const u = m.userData; u.y += (24 + 50 * k) * dt;
    if (u.y > 30) { u.y = -30; u.a = Math.random() * Math.PI * 2; u.r = rand(4, 16); }
    m.position.set(camera.position.x + Math.cos(u.a) * u.r, camera.position.y + u.y, camera.position.z + Math.sin(u.a) * u.r);
    m.material.opacity = 0.35 * sk;
  }
  // the sky glows while the heat shield burns
  scene.background.copy(_skyCol).lerp(_hotSky, k * 0.75); scene.fog.color.copy(scene.background);
  cam.shake = Math.max(cam.shake, 0.08 + 0.3 * k);
  ATM.roarT -= dt; if (ATM.roarT <= 0) { ATM.roarT = 0.12; sfx('roar', 0.15 + 0.5 * k); }
}
function endAtmos() {
  if (!ATM.on) return;
  scene.remove(ATM.shell); scene.remove(ATM.core); ATM.lines.forEach(m => scene.remove(m)); ATM.lines = [];
  scene.background.copy(_skyCol); scene.fog.color.copy(_skyCol);
  ATM.on = false;
}

/* boot: the title screen (a loadout exists from the start so robot building has something to refer to) */
freshHangarLoadout();
$('#inv').hidden = true;
openTitle();
requestAnimationFrame(frame);

/* through the exit: no reward screen any more, straight on to the next stage */
function nextStage() {
  S.total += S.t; S.stage++;
  sfx('launch', 0.6);
  startStage(); lockPointer();
}
