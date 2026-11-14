'use strict';
/* ============================================================
   LEVEL SHIFT: once a stage the arena rebuilds itself underneath you.
   A deep rumble, then a wave crosses the ground and every column rides up or down to the height it has in a
   freshly generated level. You are never hurt by it: ground rising under you simply carries you. Enemies are
   not so lucky — anything standing on a column that is coming up hard is thrown off it.
   Loose physics debris can't be carried (it would be swallowed by the ground), so it puffs into smoke as the
   wave reaches it and a fresh set drops out of the sky when the ground has settled. Weapon cases, crates,
   markers and jump pads go the same way, so the new level is properly stocked rather than holding the old
   level's furniture at the old level's heights.
   ============================================================ */
const LS = {
  on: false, phase: '', t: 0,
  H0: null, H1: null,
  pads: null, redPads: null,
  ax: 1, az: 0, span: 1, min: 0,
  colT: 0, flowT: 0, physT: 0, dustT: 0, roarT: 0,
  cases: 0,
};
const LS_WARN = 3.2;          // the rumble before anything moves
const LS_MOVE = 11.5;         // the wave crossing the arena
const LS_SETTLE = 1.2;        // everything eases into place
const LS_RISE = 2.6;          // how long one column takes to travel, once the wave reaches it

/* ---------- when ---------- */
function lsSchedule() {
  // one per stage, somewhere in the middle of it (never in the last minute before the boss)
  S.shiftAt = rand(110, 380);
  S.shifted = false;
}
function lsTimeline() {
  if (!S.inRun || S.test || LS.on || S.shifted) return;
  if (S.mode !== 'play' || !(S.shiftAt >= 0) || S.t < S.shiftAt || S.t > BOSS_AT - 40) return;
  lsStart();
}

/* ---------- start ---------- */
function lsStart() {
  if (LS.on) return;
  S.shifted = true;
  // the level we are heading for: genTerrain writes straight into H, so take a copy of the old one first
  LS.H0 = Float32Array.from(H);
  const oldPads = padSet, oldRed = redPads;
  genTerrain((Math.random() * 1e9) | 0);
  LS.H1 = Float32Array.from(H);
  LS.pads = padSet; LS.redPads = redPads;          // the new level's pads, held back until the ground settles
  H.set(LS.H0);                                     // back to the level we are standing on
  padSet = new Set(); redPads = new Set();          // no pads while the ground is moving
  padMeshes.forEach(m => scene.remove(m)); padMeshes.length = 0;
  redPadMeshes.forEach(m => scene.remove(m)); redPadMeshes.clear();
  for (const k of oldPads) lsPuff(cellX(k), H[k] + 0.3, cellZ(k), 0.7);
  for (const k of oldRed) lsPuff(cellX(k), H[k] + 0.3, cellZ(k), 0.9);

  // the direction the wave travels, and how far it has to go
  const a = Math.random() * Math.PI * 2;
  LS.ax = Math.cos(a); LS.az = Math.sin(a);
  const corners = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].map(([x, z]) => x * LS.ax + z * LS.az);
  LS.min = Math.min(...corners); LS.span = Math.max(...corners) - LS.min;

  LS.state = new Uint8Array(NC); LS.drawT = 0; LS.lo = NC; LS.hi = -1;
            // 0 waiting · 1 travelling · 2 arrived
  LS.on = true; LS.phase = 'warn'; LS.t = 0; LS.colT = 0; LS.flowT = 0; LS.physT = 0; LS.dustT = 0; LS.roarT = 0;
  LS.cases = cases.length;

  // everything that cannot ride the ground goes up in smoke (it comes back when the ground has settled)
  lsVanish();

  banner('LEVEL SHIFT', 'The arena is rebuilding', '#ffd23a', 3.4);
  sfx('roar', 0.9); sfx('thoom', 0.8);
  if (typeof say === 'function') say('Level shift', false);
}

/* a puff of smoke where something used to be */
function lsPuff(x, y, z, s = 1) {
  pfxInit();
  if (PFX.glow.n > 9500) return;
  for (let i = 0; i < 5; i++)
    PFX.glow.add(x + rand(-0.4, 0.4), y + rand(0, 0.8), z + rand(-0.4, 0.4), rand(-0.8, 0.8), rand(0.6, 1.8), rand(-0.8, 0.8),
      rand(1.1, 2.1), rand(0.5, 1.1) * s, 0x6a6257, 0, 1.4, 2, rand(0, 3), rand(0, 3), 0, rand(-0.5, 0.5), 0.9);
}
/* smoke out the things the moving ground would otherwise swallow */
function lsVanish() {
  for (const p of props) { const t = p.body ? p.body.translation() : p.group.position; lsPuff(t.x, t.y, t.z, 1.1); }
  clearProps();
  for (const c of cases) lsPuff(c.x, c.y + 0.5, c.z, 1.2);
  clearCases();
  for (const t of targets) lsPuff(t.mesh.position.x, t.mesh.position.y, t.mesh.position.z, 0.9);
  targets.forEach(t => scene.remove(t.mesh)); targets = [];
  if (typeof wdClear === 'function') wdClear();
  if (typeof clearSpectators === 'function') clearSpectators();
}

/* ---------- the shape of the wave ----------
   0 where the wave has not arrived, 1 where that column has finished moving. */
function lsColumnK(k, front) {
  const d = front - (cellX(k) * LS.ax + cellZ(k) * LS.az - LS.min);
  if (d <= 0) return 0;
  const u = d / LS_RISE;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/* ---------- every frame while it runs ---------- */
const _lsM = new THREE.Matrix4(), _lsC = new THREE.Color();
function lsTick(dt) {
  if (!LS.on) return;
  LS.t += dt;
  const warn = LS.phase === 'warn';
  if (warn && LS.t >= LS_WARN) { LS.phase = 'move'; LS.t = 0; sfx('thoom', 1); }
  if (warn) {
    // the rumble: the ground is not moving yet, but everything is shaking
    cam.shake = Math.max(cam.shake || 0, 0.12 + 0.25 * (LS.t / LS_WARN));
    LS.dustT -= dt;
    if (LS.dustT <= 0) { LS.dustT = 0.1; const p = player.pos; lsPuff(p.x + rand(-26, 26), groundAt(p.x, p.z), p.z + rand(-26, 26), 0.6); }
    LS.roarT -= dt; if (LS.roarT <= 0) { LS.roarT = 0.5; sfx('roar', 0.35); }
    return;
  }
  const k01 = clamp(LS.t / LS_MOVE, 0, 1);
  const front = k01 * (LS.span + LS_RISE);
  const done = LS.t >= LS_MOVE + LS_SETTLE;

  /* Only the columns the wave is passing are rewritten each frame: the ones it has not reached yet and the
     ones it has finished with already hold the right value, and rewriting all 7,056 of them every frame was
     most of the cost of the whole event. */
  const H0 = LS.H0, H1 = LS.H1, st = LS.state;
  let lo = LS.lo, hi = LS.hi;      // (carries over the band from any frame whose redraw was skipped)
  for (let k = 0; k < NC; k++) {
    if (st[k] === 2) continue;
    const a = H0[k], b = H1[k];
    const f = done ? 1 : lsColumnK(k, front);
    if (f <= 0) continue;
    if (a !== b) H[k] = a + (b - a) * f;
    st[k] = f >= 1 ? 2 : 1;
    if (k < lo) lo = k; if (k > hi) hi = k;
  }
  // the meshes are rewritten about 30 times a second rather than every frame: the movement is slow enough that
  // nobody can tell, and it halves what the GPU has to re-read while the wave is crossing
  LS.drawT -= dt;
  if (hi >= lo && (done || LS.drawT <= 0)) { LS.drawT = 1 / 30; lsWriteTerrain(lo, hi, done); LS.lo = NC; LS.hi = -1; }
  else if (hi >= lo) { LS.lo = Math.min(LS.lo, lo); LS.hi = Math.max(LS.hi, hi); }

  // the ground shakes hardest where the wave is passing you
  const pd = (player.pos.x * LS.ax + player.pos.z * LS.az - LS.min);
  const near = clamp(1 - Math.abs(front - pd) / 14, 0, 1);
  cam.shake = Math.max(cam.shake || 0, 0.1 + 0.4 * near);
  LS.roarT -= dt; if (LS.roarT <= 0) { LS.roarT = 0.45; sfx('roar', 0.3 + 0.4 * near); }

  // dust along the line the wave is crossing
  LS.dustT -= dt;
  if (LS.dustT <= 0 && !done) {
    LS.dustT = 0.11;
    for (let i = 0; i < 2; i++) {
      const s = rand(-HALF, HALF), fx2 = LS.min + front;
      const x = LS.ax * fx2 - LS.az * s, z = LS.az * fx2 + LS.ax * s;
      if (Math.abs(x) < HALF && Math.abs(z) < HALF) lsPuff(x, groundAt(x, z), z, 1);
    }
  }

  // enemies standing on ground that is coming up hard get thrown off it
  lsThrow(dt, front);

  // the colliders under the frame follow the new heights, a few times a second
  LS.physT -= dt;
  if (LS.physT <= 0 && typeof physStreamTerrain === 'function' && PHYS.world) {
    LS.physT = 0.25;
    for (const [k, c] of PHYS.cells) PHYS.world.removeCollider(c, false);
    PHYS.cells.clear(); PHYS.cellAt = -1;
    physStreamTerrain();
  }
  // the flow field the ground enemies walk on
  LS.flowT -= dt;
  if (LS.flowT <= 0) { LS.flowT = 0.5; computeFlow(player.pos.x, player.pos.z); }

  // anything that sits on the ground rides it up and down
  lsCarry();

  if (done) lsFinish();
}

/* write the live heights into the two instanced meshes the arena is drawn with */
function lsWriteTerrain(lo, hi, colours) {
  if (!terrainMesh || !tileMesh) return;
  const base = -10;
  const doCol = colours || (LS.colT -= 1) <= 0;
  if (doCol) LS.colT = 5;                      // the shading only needs refreshing now and then
  const lo3 = LEVEL_PAL.lo, mid = LEVEL_PAL.mid, hi3 = LEVEL_PAL.hi, st = LS.state;
  for (let k = lo; k <= hi; k++) {
    if (!st[k]) continue;                       // the wave has not reached this one yet
    const h = H[k], top = h - 0.12;
    _lsM.makeScale(CELL, top - base, CELL);
    _lsM.setPosition(cellX(k), (top + base) / 2, cellZ(k));
    terrainMesh.setMatrixAt(k, _lsM);
    _lsM.makeTranslation(cellX(k), h, cellZ(k));
    tileMesh.setMatrixAt(k, _lsM);
    if (doCol && inner(k)) {
      const t = clamp(h / 26, 0, 1);
      if (t < 0.5) _lsC.copy(lo3).lerp(mid, t * 2); else _lsC.copy(mid).lerp(hi3, (t - 0.5) * 2);
      const i = k % GRID, j = (k / GRID) | 0;
      _lsC.multiplyScalar(((i + j) & 1) ? 1 : 0.92);
      tileMesh.setColorAt(k, _lsC);
      terrainMesh.setColorAt(k, _lsC.multiplyScalar(0.62));
    }
  }
  // tell the GPU to re-read only the slice that changed, not all 7,056 columns
  for (const im of [terrainMesh, tileMesh]) {
    im.instanceMatrix.updateRange.offset = lo * 16; im.instanceMatrix.updateRange.count = (hi - lo + 1) * 16;
    im.instanceMatrix.needsUpdate = true;
    if (doCol && im.instanceColor) { im.instanceColor.updateRange.offset = lo * 3; im.instanceColor.updateRange.count = (hi - lo + 1) * 3; im.instanceColor.needsUpdate = true; }
  }
}
/* ---------- enemies thrown by rising ground ---------- */
function lsThrow(dt, front) {
  for (const e of enemies) {
    if (e.dead || e.d.fly || e.boss) continue;
    const k = idxOf(e.pos.x, e.pos.z); if (k < 0) continue;
    const rise = (LS.H1[k] - LS.H0[k]);
    if (rise <= 2) continue;
    const f = lsColumnK(k, front);
    if (f <= 0.02 || f >= 0.85) continue;                 // only while that column is actually travelling
    if (e.pos.y > H[k] + 1.6) continue;                   // already in the air
    if (e.lsThrown) continue;
    e.lsThrown = true;
    e.vel.y = Math.max(e.vel.y, 7 + Math.min(14, rise * 0.8));
    e.vel.x += rand(-4, 4); e.vel.z += rand(-4, 4);
    e.stun = Math.max(e.stun || 0, 0.9);
    if (Math.random() < 0.3) spark(new THREE.Vector3(e.pos.x, H[k], e.pos.z), 0xffc46a);
  }
}

/* ---------- things that sit on the ground ride it ---------- */
function lsCarry() {
  if (S.shop) { S.shop.y = groundAt(S.shop.x, S.shop.z); S.shop.group.position.y = S.shop.y; }
  if (S.gate) { S.gate.y = groundAt(S.gate.x, S.gate.z); S.gate.group.position.y = S.gate.y; }
  if (S.terminal) { const g = S.terminal.group; S.terminal.y = groundAt(g.position.x, g.position.z); g.position.y = S.terminal.y; }
}

/* ---------- settled ---------- */
function lsFinish() {
  H.set(LS.H1);
  padSet = LS.pads; redPads = LS.redPads;
  buildTerrainMesh();                       // one clean rebuild: pads, colours and weathering all come back properly
  computeFlow(player.pos.x, player.pos.z);
  if (PHYS.world) { for (const [, c] of PHYS.cells) PHYS.world.removeCollider(c, false); PHYS.cells.clear(); PHYS.cellAt = -1; physStreamTerrain(); }
  // the frame and everything alive settle onto the new ground
  const P = player;
  P.pos.y = Math.max(P.pos.y, groundAt(P.pos.x, P.pos.z));
  for (const e of enemies) { e.lsThrown = false; const g = groundAt(e.pos.x, e.pos.z); if (!e.d.fly && e.pos.y < g) { e.pos.y = g; e.vel.y = Math.max(e.vel.y, 0); } }
  // and the new level is stocked: crates, markers, cases and a fresh drop of debris out of the sky
  if (typeof placeTargets === 'function') placeTargets();
  if (typeof wdBuildStage === 'function') wdBuildStage();
  if (typeof buildSpectators === 'function') buildSpectators();
  if (typeof placeCases === 'function') placeCases();
  lsRainProps();
  LS.on = false; LS.phase = ''; LS.H0 = LS.H1 = null;
  cam.shake = Math.max(cam.shake || 0, 0.5);
  sfx('thoom', 0.9); sfx('land', 0.7);
  banner('SETTLED', 'New ground', 'var(--orange)', 2);
}
/* fresh debris falls in from above once the ground has stopped moving */
function lsRainProps() {
  if (typeof placeProps !== 'function') return;
  placeProps();
  for (const p of props) {
    if (!p.body) continue;
    const t = p.body.translation();
    p.body.setTranslation({ x: t.x, y: t.y + rand(18, 34), z: t.z }, true);
    p.body.setLinvel({ x: 0, y: -2, z: 0 }, true);
    p.body.setAngvel({ x: rand(-3, 3), y: rand(-3, 3), z: rand(-3, 3) }, true);
  }
}
