'use strict';
/* ============================================================
   TEST RANGE (developer mode only): a quiet arena with no drop, no timer and no automatic spawns.
   Press F1 (or `) for the dev panel: spawn any enemy in any number, make them stand still, turn on
   god mode, change the difficulty stage, drop pickups and parts, max out or reset part levels.
   V spawns the chosen enemies at the crosshair. Enter opens the build with every part available.
   ============================================================ */
const DEV = { god: true, hold: false, type: 'crawler', count: 5 };
const DEV_ENEMIES = [
  ['crawler', 'Crawler'], ['elite', 'Elite crawler'], ['drone', 'Drone'], ['spitter', 'Spitter'], ['bomber', 'Bomber'],
  ['splitter', 'Splitter'], ['splitling', 'Splitling'], ['brute', 'Brute · mini-boss'], ['warden', 'Warden · boss'],
];
const DEV_COUNTS = [1, 5, 10, 25, 50, 100, 250];

function startTestRange() {
  if (INV.drag) endDrag(INV.cursor.x, INV.cursor.y, true);
  const need = buildProblems();
  if (need.length) { say(`Needs: ${need.join(', ')}`, true); sfx('deny'); return; }
  stowLoose();
  $('#inv').hidden = true;
  newRun();
  S.test = true;
  // no drop: straight onto the ground
  player.pos.y = groundAt(player.pos.x, player.pos.z); player.vel.set(0, 0, 0);
  $('#countdown').hidden = true;
  land();
  banner('TEST RANGE', 'F1 · dev panel', 'var(--xp)', 3);
  $('#hint').innerHTML = '';
  $('#devHint').hidden = false;
  $('#stageTxt').textContent = S.stage;
}

/* ---------- the panel ---------- */
const devPanel = document.createElement('section');
devPanel.id = 'devPanel'; devPanel.className = 'overlay devpanel'; devPanel.hidden = true;
document.body.appendChild(devPanel);

function devRender() {
  const on = b => b ? ' on' : '';
  devPanel.innerHTML = `<div class="dpanel">
    <div class="dhead"><div class="eyebrow">Developer</div><h2>Test range</h2></div>
    <div class="dsec"><h3>Spawn enemies</h3>
      <div class="dgrid">${DEV_ENEMIES.map(([k, n]) => `<button class="btn ghost nav dbtn${on(DEV.type === k)}" data-type="${k}">${n}</button>`).join('')}</div>
      <div class="drow"><span>How many</span>${DEV_COUNTS.map(c => `<button class="btn ghost nav dchip${on(DEV.count === c)}" data-count="${c}">${c}</button>`).join('')}</div>
      <button class="btn nav" data-act="spawn">Spawn in front of you</button>
      <small>Or press <kbd>V</kbd> in play to spawn them at the crosshair. Bosses spawn one at a time.</small>
    </div>
    <div class="dsec"><h3>Rules</h3>
      <div class="dgrid two">
        <button class="btn ghost nav dbtn${on(DEV.god)}" data-act="god">God mode: ${DEV.god ? 'on' : 'off'}</button>
        <button class="btn ghost nav dbtn${on(DEV.hold)}" data-act="hold">Enemies: ${DEV.hold ? 'stand still' : 'attack'}</button>
      </div>
      <div class="drow"><span>Difficulty stage</span><button class="btn ghost nav dchip" data-act="stage-">−</button><b class="mono">${S.stage}</b><button class="btn ghost nav dchip" data-act="stage+">+</button></div>
    </div>
    <div class="dsec"><h3>Actions</h3>
      <div class="dgrid two">
        <button class="btn ghost nav dbtn" data-act="kill">Kill all enemies</button>
        <button class="btn ghost nav dbtn" data-act="clear">Remove all (no drops)</button>
        <button class="btn ghost nav dbtn" data-act="heal">Full heal</button>
        <button class="btn ghost nav dbtn" data-act="bolts">+500 bolts</button>
        <button class="btn ghost nav dbtn" data-act="level">Level up</button>
        <button class="btn ghost nav dbtn" data-act="stains">Clean the ground</button>
        <button class="btn ghost nav dbtn" data-act="maxparts">Max out my parts</button>
        <button class="btn ghost nav dbtn" data-act="resetparts">Reset my parts to Mk I</button>
      </div>
    </div>
    <div class="dsec"><h3>Drop next to you</h3>
      <div class="dgrid three">
        ${[['weapon', 'Weapon'], ['arm', 'Arm'], ['leg', 'Leg'], ['module', 'Module'], ['gem', 'Gem'], ['health', 'Health'], ['vacuum', 'Magnet'], ['nuke', 'Nuke'], ['frenzy', 'Coin frenzy'], ['xp', 'XP pile']]
          .map(([k, n]) => `<button class="btn ghost nav dbtn" data-drop="${k}">${n}</button>`).join('')}
      </div>
    </div>
    <div class="dsec dfoot">
      <button class="btn nav" data-act="close">Back to testing</button>
      <button class="btn ghost nav" data-act="build">Open build (every part)</button>
      <button class="btn ghost nav" data-act="hangar">Back to hangar</button>
    </div>
  </div>`;
  if (typeof makeWin === 'function') makeWin(devPanel.querySelector('.dpanel'), 'devpanel', { minW: 320, minH: 240 });
}
function devPanelToggle() { if (S.mode === 'devpanel') devPanelClose(); else devPanelOpen(); }
function devPanelOpen() {
  if (!S.test || S.mode !== 'play') return;
  S.mode = 'devpanel'; unlockPointer();
  $('#pause').hidden = true;
  devRender(); devPanel.hidden = false; focusFirst();
}
function devPanelClose(silent) {
  devPanel.hidden = true;
  if (!silent && S.mode === 'devpanel') { S.mode = 'play'; lockPointer(); }
  if (silent) $('#devHint').hidden = true;
}

/* where "in front of you" is: along the camera's view, on the ground */
function devFront(dist) {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  const p = player.pos.clone().addScaledVector(f, dist); p.y = groundAt(p.x, p.z); return p;
}
function devSpawn(at) {
  if (!at) at = devFront(18);
  const boss = DEV.type === 'warden' || DEV.type === 'brute', n = boss ? 1 : DEV.count;
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const r = n === 1 ? 0 : 1.2 + Math.sqrt(made) * 1.4, a = Math.random() * Math.PI * 2;
    const x = clamp(at.x + Math.cos(a) * r, -HALF + 3, HALF - 3), z = clamp(at.z + Math.sin(a) * r, -HALF + 3, HALF - 3), k = idxOf(x, z);
    if (k < 0 || !inner(k)) continue;
    const p = { x, z, y: H[k] + (made % 3) * 0.3 };
    if (DEV.type === 'elite') spawnEnemy('crawler', p, { elite: true });
    else if (DEV.type === 'crawler') spawnEnemy('crawler', p);
    else if (DEV.type === 'brute') {
      const e = spawnEnemy('brute', p); e.mini = true; S.mini = e;
      banner('BRUTE', '', 'var(--hostile)', 1.5);
    } else if (DEV.type === 'warden') {
      if (S.boss && !S.boss.dead) { say('Warden already out', true); sfx('deny'); return; }
      const e = spawnEnemy('warden', p);
      e.pos.y += 30; e.boss = true; e.state = { volley: 4, slam: 8, summon: 12, slamming: true };
      e.maxHp = e.hp = ETYPES.warden.hp * (1 + (S.stage - 1) * 0.9);
      S.boss = e; S.bossSpawned = true;
      $('#bossbar').hidden = false; $('#bossName').textContent = `THE WARDEN · STAGE ${S.stage}`;
    } else spawnEnemy(DEV.type, p);
    made++;
  }
  ring(at, 3 + Math.sqrt(n), 0.5, 0xd2435a); sfx('beep', 0.4);
}
function devDrop(kind) {
  const p = devFront(4);
  if (kind === 'health') dropHealth(p);
  else if (kind === 'vacuum' || kind === 'nuke' || kind === 'frenzy') dropPower(p, kind);
  else if (kind === 'xp') { for (let i = 0; i < 25; i++) dropGem(p, 3); }
  else { const [k, t] = pick(catalog().filter(r => r[0] === kind)); dropLoot(p, mkItem(k, t, 1)); }
}
function devSetLevels(max) {
  for (const it of allItems()) {
    if (!upgradeable(it) && it.kind !== 'gem') continue;
    it.lvl = max ? maxLvlOf(it) : 1; delete it.xp;
    syncGemSlots(it);
    // fewer slots after a reset: gems that no longer fit go to storage
    if (it.gems) { const n = gemSlotsFor(it); while (it.gems.length > n) { const g = it.gems.pop(); if (g) L.store.push(g); } }
  }
  refreshLoadout();
}
function devClearEnemies() {
  enemies.forEach(e => { scene.remove(e.mesh); if (e.bar) scene.remove(e.bar); });
  enemies = []; S.boss = null; S.mini = null; $('#bossbar').hidden = true;
}

devPanel.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.type) { DEV.type = d.type; sfx('tick', 0.3); }
  else if (d.count) { DEV.count = +d.count; sfx('tick', 0.3); }
  else if (d.drop) { devDrop(d.drop); devPanelClose(); return; }
  else switch (d.act) {
    case 'spawn': devPanelClose(); devSpawn(); return;
    case 'god': DEV.god = !DEV.god; break;
    case 'hold': DEV.hold = !DEV.hold; break;
    case 'stage-': S.stage = Math.max(1, S.stage - 1); $('#stageTxt').textContent = S.stage; break;
    case 'stage+': S.stage = Math.min(10, S.stage + 1); $('#stageTxt').textContent = S.stage; break;
    case 'kill': enemies.slice().forEach(o => { if (!o.dead) killEnemy(o); }); enemies = enemies.filter(o => !o.dead); break;
    case 'clear': devClearEnemies(); break;
    case 'heal': player.hp = stats.maxHp; player.shield = stats.maxShield; break;
    case 'bolts': S.bolts = (S.bolts || 0) + 500; break;
    case 'level': S.pendingLv++; devPanelClose(); return;
    case 'stains': clearStains(); break;
    case 'maxparts': devSetLevels(true); say('All parts maxed'); break;
    case 'resetparts': devSetLevels(false); say('All parts Lv 1'); break;
    case 'close': devPanelClose(); return;
    case 'build': devPanelClose(true); $('#devHint').hidden = false; S.mode = 'play'; openInventory(false); return;
    case 'hangar': devPanelClose(true); toHangar(); return;
  }
  const keep = document.activeElement && document.activeElement.dataset ? Object.entries(document.activeElement.dataset)[0] : null;
  devRender();
  // keep focus on the same button after re-rendering (gamepad / keyboard navigation)
  if (keep) { const f = devPanel.querySelector(`[data-${keep[0]}="${keep[1]}"]`); if (f) f.focus(); }
});
$('#invTestBtn').addEventListener('click', startTestRange);
$('#devPanelBtn').addEventListener('click', () => { $('#pause').hidden = true; S.mode = 'play'; devPanelOpen(); });

/* ---------- performance readout (developer mode, in the field): find where the frame time goes ---------- */
const PERF = { el: null, t: 0, fps: 60, ms: 0, sim: 0, ren: 0, worst: 0 };
function perfTick(dt, total, sim, ren) {
  if (!PERF.el) { PERF.el = document.createElement('div'); PERF.el.id = 'perfHud'; document.body.appendChild(PERF.el); }
  const k = 0.1;
  PERF.fps += ((dt > 0 ? 1 / dt : 60) - PERF.fps) * k; PERF.ms += (total - PERF.ms) * k; PERF.sim += (sim - PERF.sim) * k; PERF.ren += (ren - PERF.ren) * k;
  PERF.worst = Math.max(PERF.worst * 0.995, dt * 1000);
  PERF.t -= dt; if (PERF.t > 0) return; PERF.t = 0.25;
  const show = S.inRun && !$('#hud').hidden;
  PERF.el.hidden = !show; if (!show) return;
  let alive = 0; for (const e of enemies) if (!e.dead) alive++;
  const I = renderer.info.render, col = PERF.fps >= 55 ? 'ok' : PERF.fps >= 40 ? 'meh' : 'bad';
  PERF.el.className = col;
  PERF.el.innerHTML = `<b>${PERF.fps.toFixed(0)} fps</b> · worst ${PERF.worst.toFixed(0)} ms<br>game logic ${PERF.sim.toFixed(1)} ms · draw ${PERF.ren.toFixed(1)} ms<br>${alive} enemies · ${I.calls} draw calls · ${(I.triangles / 1000).toFixed(0)}k tris`;
}
