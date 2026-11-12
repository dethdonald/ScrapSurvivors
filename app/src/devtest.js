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
const DEV_COUNTS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

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
    <div class="dsec"><h3>Stress test</h3>
      <button class="btn nav" data-act="stress">Run the horde stress test</button>
      <small>Fills the range with a bigger and bigger horde while your guns fire, and reports how many enemies this machine holds at 60 and at 30 frames a second. Takes a minute or two.${STRESS.last ? '<br><b>Last run:</b> ' + stressLine(STRESS.last) : ''}</small>
    </div>
    <div class="dsec"><h3>Unlocks</h3>
      <div class="dgrid two">
        <button class="btn ghost nav dbtn" data-act="unlockall">Unlock all (weapons, chests, legs, arms)</button>
        <button class="btn ghost nav dbtn" data-act="resetunlocks">Reset all unlocks</button>
      </div>
      <small>${devUnlockStatus()}</small>
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
/* a quick line in the dev panel showing where real (non-dev) unlock progress stands */
function devUnlockStatus() {
  const nextI = WEAPON_CHAIN.findIndex(t => !weaponUnlocked(t));
  const nextW = nextI > 0 ? `${WEAPONS[WEAPON_CHAIN[nextI]].name}: ${META.unlock.weaponKills[WEAPON_CHAIN[nextI - 1]] || 0}/${UNLOCK_KILL_GOAL} ${WEAPONS[WEAPON_CHAIN[nextI - 1]].name} kills` : 'all weapons unlocked';
  const bosses = Object.keys(BOSS_UNLOCKS).filter(b => META.unlock.bosses[b]).length;
  return `Next weapon: ${nextW} · Bosses defeated: ${bosses}/${Object.keys(BOSS_UNLOCKS).length} · Elite kills: ${Math.min(META.unlock.eliteKills || 0, ELITE_KILLS_FOR_TWIN_ARM)}/${ELITE_KILLS_FOR_TWIN_ARM} (Twin Arm) · Limb maxed: ${META.unlock.limbMaxed ? 'yes (Sentry Arm)' : 'no'}`;
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
      updateBossBars();
    } else spawnEnemy(DEV.type, p);
    made++;
  }
  ring(at, 3 + Math.sqrt(n), 0.5, 0xd2435a); sfx('beep', 0.4);
}
function devDrop(kind) {
  const p = devFront(4);
  if (kind === 'health') dropHealth(p);
  else if (kind === 'vacuum' || kind === 'nuke' || kind === 'frenzy') dropPower(p, kind, true);
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
    case 'unlockall': unlockAll(); say('Everything unlocked'); break;
    case 'resetunlocks': resetUnlocks(); say('All unlocks reset'); break;
    case 'stress': devPanelClose(); stressStart(); return;
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


/* ---------- horde stress test: how many enemies does THIS machine hold at 60 and at 30 frames a second? ----------
   Runs in the test range with the real renderer, your real build firing non-stop, and a mixed horde (the same blend a
   late run throws at you) kept topped up at each size: 200, 400 ... up to 4,000. Each size settles for 1.5 s, then 3 s of
   frames are timed. It stops at the first size that falls under 24 fps. The 60 and 30 figures are read off the curve
   between the two sizes either side of the line. Screens faster than 60 Hz are fine (we look at frame time, and a
   60 Hz screen simply shows "60+" for everything it keeps up with).
   Also runs unattended: launch with --stress and the result is written to stress-result.json next to the game. */
const STRESS = { on: false, steps: [200, 400, 600, 800, 1000, 1300, 1600, 2000, 2500, 3000, 4000], i: 0, t: 0, ft: [], rows: [], last: null, el: null, lastNow: 0, auto: false };
const STRESS_MIX = [['crawler', 0.74], ['drone', 0.12], ['spitter', 0.08], ['bomber', 0.03], ['splitter', 0.03]];
function stressLine(r) { return `60 fps up to ~${r.at60 ?? '?'} enemies · 30 fps up to ~${r.at30 ?? '?'}${r.capped ? ' (hit the top of the test)' : ''}`; }
function stressFill(n) {
  let guard = 0;
  while (enemies.length < n && guard++ < 600) {
    let r = Math.random(), type = 'crawler'; for (const [t, w] of STRESS_MIX) { if ((r -= w) < 0) { type = t; break; } }
    const p = spawnPoint(10, 46);
    if (type === 'crawler') spawnPack(p, Math.min(6, n - enemies.length)); else spawnEnemy(type, p);
  }
}
function stressStart(auto) {
  if (!S.test || STRESS.on) return;
  devClearEnemies(); DEV.god = true; DEV.hold = false;
  Object.assign(STRESS, { on: true, i: 0, t: 0, ft: [], rows: [], lastNow: 0, auto: !!auto });
  if (!STRESS.el) { STRESS.el = document.createElement('div'); STRESS.el.id = 'stressHud'; document.body.appendChild(STRESS.el); }
  STRESS.el.hidden = false; STRESS.el.textContent = 'Stress test…';
}
function stressStop(why) {
  STRESS.on = false; mouseFire = false;
  const rows = STRESS.rows, ms = r => r.ms;
  // where the frame-time curve crosses a line (16.9 ms = 59 fps, 33.9 ms = 29.5 fps: a hair of slack for timer jitter)
  const cross = lim => {
    if (!rows.length) return null;
    if (ms(rows[0]) > lim) return 0;
    for (let k = 1; k < rows.length; k++) if (ms(rows[k]) > lim) { const a = rows[k - 1], b = rows[k]; return Math.round((a.n + (b.n - a.n) * (lim - a.ms) / Math.max(0.01, b.ms - a.ms)) / 10) * 10; }
    return rows[rows.length - 1].n;
  };
  const top = rows.length ? rows[rows.length - 1] : null;
  const res = { why, at60: cross(16.9), at30: cross(33.9), capped: !!top && top.ms <= 33.9, rows, gfx: SETTINGS.gfx, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, when: new Date().toISOString(), version: typeof VERSION === 'string' ? VERSION : '' };
  STRESS.last = res;
  devClearEnemies();
  STRESS.el.innerHTML = `<b>Stress test done</b><br>${stressLine(res)}<br><table>${rows.map(r => `<tr><td>${r.n}</td><td>${r.fps.toFixed(0)} fps</td><td>low ${r.low.toFixed(0)}</td><td>${r.ms.toFixed(1)} ms</td></tr>`).join('')}</table><small>graphics: ${res.gfx} · ${res.w}×${res.h} · click to close</small>`;
  STRESS.el.style.pointerEvents = 'auto'; STRESS.el.onclick = () => { STRESS.el.hidden = true; STRESS.el.style.pointerEvents = ''; };
  console.log('STRESS_RESULT ' + JSON.stringify(res));
}
/* called once per drawn frame (game.js) */
function stressTick(now) {
  if (!STRESS.on) return;
  if (!S.test || S.mode !== 'play') { if (S.mode === 'levelup' || S.mode === 'perk' || S.mode === 'countdown') return; stressStop('left the test range'); return; }
  const dtMs = STRESS.lastNow ? now - STRESS.lastNow : 0; STRESS.lastNow = now;
  const n = STRESS.steps[STRESS.i];
  mouseFire = true; S.pendingLv = 0;                  // every gun firing; no level-up screens in the way
  player.hp = stats.maxHp;
  stressFill(n);
  STRESS.t += dtMs / 1000;
  if (STRESS.t > 1.5 && dtMs > 0) STRESS.ft.push(dtMs);
  STRESS.el.textContent = `Stress test · ${n} enemies · ${dtMs > 0 ? (1000 / dtMs).toFixed(0) : '–'} fps · step ${STRESS.i + 1}/${STRESS.steps.length}`;
  // a step ends after 3 s of timed frames (longer only if the machine is crawling and has barely drawn any)
  if (STRESS.t < 4.5 || (STRESS.ft.length < 4 && STRESS.t < 12)) return;
  const f = STRESS.ft.slice().sort((a, b) => a - b), med = f[f.length >> 1] || 999, p95 = f[Math.min(f.length - 1, Math.floor(f.length * 0.95))] || 999;
  STRESS.rows.push({ n, ms: +med.toFixed(2), fps: +(1000 / med).toFixed(1), low: +(1000 / p95).toFixed(1), alive: enemies.length });
  STRESS.i++; STRESS.t = 0; STRESS.ft = [];
  if (1000 / med < 24) stressStop('under 24 fps'); else if (STRESS.i >= STRESS.steps.length) stressStop('finished every size');
}
/* unattended run: `electron . --stress` (main.js adds ?stress=1, saves the STRESS_RESULT line to stress-result.json and quits) */
if (location.search.includes('stress=1')) addEventListener('load', () => setTimeout(() => {
  try {
    startTestRange();
    if (!S.test) { console.log('STRESS_RESULT ' + JSON.stringify({ why: 'could not start the test range (the saved build is missing something)', rows: [] })); return; }
    setTimeout(() => stressStart(true), 2500);
  } catch (e) { console.log('STRESS_RESULT ' + JSON.stringify({ why: 'error: ' + (e && e.message), rows: [] })); }
}, 4000));
