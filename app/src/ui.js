'use strict';
/* HUD, banners, level-up and perk picks, pause menu, game over. */
/* "no": a quick shake and red flash on whatever was refused, instead of a sentence explaining why */
function denyFx(el) {
  if (!el) return;
  el.classList.remove('denyfx'); void el.offsetWidth; el.classList.add('denyfx');
  clearTimeout(el._denyT); el._denyT = setTimeout(() => el.classList.remove('denyfx'), 360);
}
function banner(h, s, color, dur) {
  $('#bannerH').textContent = h; $('#bannerS').textContent = s; $('#bannerS').hidden = !s; $('#bannerH').style.color = color;
  $('#banner').hidden = false; S.bannerT = dur;
}
/* ---------- UI scale: picked from the window size, plus your own adjustment in Options ----------
   standard  ~1080p: 1x · hi: 1440p / 4K windows scale the UI up with the window (the crosshair and reload
   readout get a bit extra) · deck: Steam Deck (1280x800, 7"), larger and tighter · small: short windows shrink a little */
const UIZ = { z: 1, auto: 1, mode: 'standard' };
function detectUI() {
  const W = innerWidth, Hh = innerHeight;
  const deck = /[?&]deck=1/.test(location.search) || (screen.width === 1280 && screen.height === 800 && /Linux/.test(navigator.userAgent) && !/Headless/.test(navigator.userAgent));
  let mode = 'standard', auto = 1, xh = 1;
  if (deck) { mode = 'deck'; auto = 1.1; xh = 1.2; }
  else if (Hh >= 1300 || W >= 2300) { mode = 'hi'; auto = clamp(Math.min(Hh / 1080, W / 1920), 1.15, 2.6); xh = 1.2; }
  else if (Hh < 720) { mode = 'small'; auto = clamp(Hh / 820, 0.72, 1); }
  UIZ.mode = mode; UIZ.auto = auto; UIZ.z = +(auto * (SETTINGS.uiScale || 1)).toFixed(3);
  const r = document.documentElement.style; r.setProperty('--uiz', UIZ.z); r.setProperty('--xhz', xh);
  document.body.dataset.res = mode;
  if (typeof syncUIScaleLabel === 'function') syncUIScaleLabel();
}
const RES_NAMES = { standard: 'standard', hi: 'high-res', deck: 'Steam Deck', small: 'small window' };
function syncUIScaleLabel() { const v = $('#uiScaleVal'); if (v) v.textContent = `${Math.round((SETTINGS.uiScale || 1) * 100)}% · ${RES_NAMES[UIZ.mode]} ×${UIZ.auto.toFixed(2)}`; }
addEventListener('resize', detectUI);
const fmt = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
let hitT = 0;
const XH = { bloom: 0 };   // reticle flare from firing
function hitMarker() { hitT = 0.09; }

function renderLoadoutHUD() {
  const rows = [];
  const held = new Set(mountedArms().flatMap(armGuns));
  for (const it of mountedItems()) {
    if (it.kind === 'arm') {
      const auto = ARMS[it.type].auto;
      const gs = armGuns(it);
      if (!gs.length) rows.push(`<div>${partIcon(it)} ${sym(auto ? 'auto' : 'manual')}</div>`);
      for (const g of gs) rows.push(`<div>${wsym(g)} ${mkTag(g.lvl)} ${sym(gs.length > 1 ? 'twin' : auto ? 'auto' : 'manual')}${ammoTag(g)}</div>`);
    } else if (it.kind === 'weapon' && !held.has(it)) rows.push(`<div>${wsym(it)} ${mkTag(it.lvl)} ${sym('fixed', `Bolted on: fires forward on its own at ${Math.round(FIXED_DMG * 100)}% damage`)}${ammoTag(it)}</div>`);
    else if (it.kind === 'module') rows.push(`<div><i class="wsym" data-tip="${itemName(it)}">${partIcon(it)}</i> ${mkTag(it.lvl)}</div>`);
  }
  renderXhLeft();
  if (stats && stats.misLegs) rows.unshift(`<div class="misleg">${sym('warn', 'Misplaced legs: slowed')} ×${stats.misLegs}</div>`);
  $('#loadout').innerHTML = rows.join('');
}
/* a new gem slot opened: a little dialog pops up to say so */
let slotDlgT = null;
function gemSlotDialog(it, added) {
  let el = $('#slotDialog');
  if (!el) { el = document.createElement('div'); el.id = 'slotDialog'; el.className = 'slotdlg'; document.body.appendChild(el); el.addEventListener('click', () => el.classList.remove('on')); }
  const n = (it.gems || []).length, mark = it.kind === 'arm' || it.kind === 'leg' ? `Mk ${ROMAN[it.lvl]}` : `Lv ${it.lvl}`;
  el.innerHTML = `<div class="ic">${ICONS_GEM}</div><div><div class="eyebrow">+1 gem slot</div><b>${itemName(it)} · ${mark}</b><p>${'◆'.repeat(n)}${S.inRun ? ' · Enter' : ''}</p></div>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  sfx('levelup', 0.6);
  clearTimeout(slotDlgT); slotDlgT = setTimeout(() => el.classList.remove('on'), 4800);
}
const ICONS_GEM = '<svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12"/></svg>';
/* part levels, listed to the left of the crosshair (with a thin xp bar under each) */
let xhLeftT = 0;
function renderXhLeft() {
  // the part bar along the top of the screen, split either side of the timer: each part's icon and its level bar
  const order = { weapon: 0, arm: 1, leg: 2, module: 3, block: 4 };
  const its = mountedItems().filter(it => upgradeable(it)).sort((a, b) => order[a.kind] - order[b.kind]);
  const chip = it => { const mx = it.lvl >= maxLvlOf(it), f = it.lvl / maxLvlOf(it);
    return `<div class="pchip${mx ? ' max' : ''}" title="${itemName(it)}">${it.kind === 'weapon' ? weaponIcon(it.type) : partIcon(it)}<em><i style="width:${(f * 100).toFixed(1)}%"></i></em></div>`; };
  const half = Math.ceil(its.length / 2);
  const html = `<div class="pbl">${its.slice(0, half).map(chip).join('')}</div><div class="pbgap"></div><div class="pbr">${its.slice(half).map(chip).join('')}</div>`;
  const el = $('#xhLeft'); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  el.hidden = !SETTINGS.xhParts;
}
const ammoTag = w => WEAPONS[w.type].mag ? `<span class="ammo" data-w="${w.id}"><b></b><i><i></i></i></span>` : '';
function updateAmmo() {
  for (const el of $$('#loadout .ammo')) {
    const w = mountedWeapons().find(x => x.id === +el.dataset.w); if (!w) continue;
    const W = WEAPONS[w.type], mag = W.mag(w.lvl), ammo = w.ammo ?? mag;
    const rl = w.reloadT > 0;
    el.classList.toggle('rl', rl);
    el.firstChild.textContent = rl ? 'RELOAD' : `${ammo}/${mag}`;
    el.lastChild.firstChild.style.transform = `scaleX(${rl ? 1 - w.reloadT / (W.reload(w.lvl) / (stats.reload || 1)) : ammo / mag})`;
  }
}
/* ammo by the crosshair: one row per magazine-fed gun, its drawing, a bar and the count; the bar refills orange while reloading */
const xhRows = new Map();
function updateReloadMarkers() {
  const box = $('#xhAmmo'), seen = new Set();
  if (S.mode === 'play' || S.mode === 'pause') for (const w of mountedWeapons()) {
    const W = WEAPONS[w.type]; if (!W.mag) continue;
    let el = xhRows.get(w.id);
    if (!el) { el = document.createElement('div'); el.className = 'xrow'; el.innerHTML = `${weaponIcon(w.type)}<i><i></i></i><b></b><em></em>`; box.appendChild(el); xhRows.set(w.id, el); }
    el.children[3].textContent = 'Lv ' + w.lvl;
    const mag = W.mag(w.lvl), ammo = w.ammo ?? mag, rl = w.reloadT > 0;
    const k = rl ? clamp(1 - w.reloadT / (W.reload(w.lvl) / (stats.reload || 1)), 0, 1) : ammo / mag;
    el.classList.toggle('rl', rl); el.classList.toggle('low', !rl && ammo / mag <= 0.25);
    el.children[1].firstChild.style.transform = `scaleX(${k})`;
    el.children[2].textContent = rl ? 'RLD' : ammo;
    seen.add(w.id);
  }
  for (const [id, el] of xhRows) if (!seen.has(id)) { el.remove(); xhRows.delete(id); }
  const bo = $('#xhBolts'), show = S.mode === 'play' || S.mode === 'pause' || S.mode === 'drop';
  const txt = show ? String(S.bolts || 0) : '';
  if (bo.dataset.v !== txt) { bo.dataset.v = txt; bo.innerHTML = show ? `<i></i>${txt} bolts` : ''; }
}
/* homing shots: a red square locks onto every enemy they're chasing */
const lockEls = [];
function updateLockMarkers() {
  const lay = $('#reloadLayer'), tgts = new Set();
  if (S.mode === 'play') for (const s of shots) if (s.homing && s.target && !s.target.dead && s.life > 0) tgts.add(s.target);
  let i = 0;
  for (const e of tgts) {
    const c = aimPt(e).project(camera); if (c.z > 1) continue;
    let el = lockEls[i]; if (!el) { el = document.createElement('div'); el.className = 'lockbox'; lay.appendChild(el); lockEls.push(el); }
    const size = clamp(e.r * 160 / Math.max(2, camera.position.distanceTo(e.pos)), 18, 90);
    el.style.display = ''; el.style.width = el.style.height = size + 'px';
    el.style.transform = `translate(${(c.x + 1) / 2 * innerWidth - size / 2}px, ${(1 - c.y) / 2 * innerHeight - size / 2}px)`;
    i++;
  }
  for (; i < lockEls.length; i++) lockEls[i].style.display = 'none';
}
/* ---------- XP bar along the very bottom: calm when empty, glowing, shaking and sparking as it nears a level ---------- */
const XPL = { shown: 0, sparkT: 0, lastLevel: 1 };
function updateXpLine(dt) {
  const f = clamp(S.xp / S.need, 0, 1);
  XPL.shown += (f - XPL.shown) * Math.min(1, dt * 10);
  const el = $('#xpline'), k = XPL.shown;
  $('#xpFill').style.transform = `scaleX(${k})`;
  $('#xpEdge').style.left = (k * 100) + '%';
  // colour climbs from cyan through green and gold; glow and height grow with it
  const hue = 185 - 140 * Math.pow(k, 1.4);
  el.style.setProperty('--xc', `hsl(${hue},90%,${55 + 10 * k}%)`);
  el.style.setProperty('--glow', (k * k * 26).toFixed(1) + 'px');
  el.style.height = (6 + 6 * k * k) + 'px';
  $('#xpPct').textContent = k > 0.55 ? Math.floor(k * 100) + '%' : '';
  // the last stretch: it trembles, harder the closer it gets
  const sh = k > 0.75 ? (k - 0.75) * 4 : 0;
  el.style.transform = sh ? `translate(${rand(-1, 1) * sh * 2.5}px, ${rand(-1, 1) * sh * 3}px)` : '';
  // sparks fly off the leading edge
  XPL.sparkT -= dt;
  if (k > 0.5 && XPL.sparkT <= 0) {
    XPL.sparkT = 0.25 / (1 + (k - 0.5) * 18);
    const sp = document.createElement('i');
    sp.style.left = (k * 100) + '%';
    sp.style.setProperty('--dx', rand(-60, 30) + 'px'); sp.style.setProperty('--dy', -rand(20, 70 + 80 * k) + 'px');
    sp.style.background = `hsl(${hue + rand(-20, 30)},100%,${60 + rand(0, 25)}%)`;
    $('#xpSparks').appendChild(sp);
    setTimeout(() => sp.remove(), 650);
  }
  if (S.level !== XPL.lastLevel) { XPL.lastLevel = S.level; XPL.shown = 0; el.classList.remove('burst'); void el.offsetWidth; el.classList.add('burst'); }
}
/* ---------- small damage numbers that pop off what you hit ---------- */
const DMG = [], DMG_POOL = [];
function dmgNumber(pos, amt, crit) {
  if (S.mode !== 'play') return;
  if (DMG.length > 70) { const o = DMG.shift(); o.el.style.display = 'none'; DMG_POOL.push(o.el); }
  let el = DMG_POOL.pop();
  if (!el) { el = document.createElement('div'); $('#dmgLayer').appendChild(el); }
  el.className = 'dmg' + (crit ? ' crit' : ''); el.style.display = '';
  el.textContent = amt >= 10 ? Math.round(amt) : amt.toFixed(1).replace(/\.0$/, '');
  DMG.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.3, rand(-0.3, 0.3))), t: 0, vx: rand(-0.6, 0.6) });
}
const _dv3 = new THREE.Vector3();
function updateDmgNumbers(dt) {
  for (let i = DMG.length - 1; i >= 0; i--) {
    const d = DMG[i]; d.t += dt;
    if (d.t > 0.7) { d.el.style.display = 'none'; DMG_POOL.push(d.el); DMG.splice(i, 1); continue; }
    d.pos.y += dt * (2.2 - d.t * 2.5); d.pos.x += d.vx * dt;
    _dv3.copy(d.pos).project(camera);
    if (_dv3.z > 1) { d.el.style.opacity = 0; continue; }
    d.el.style.opacity = d.t < 0.45 ? 1 : 1 - (d.t - 0.45) / 0.25;
    d.el.style.transform = `translate(${(_dv3.x + 1) / 2 * innerWidth}px, ${(1 - _dv3.y) / 2 * innerHeight}px) translate(-50%,-50%) scale(${d.t < 0.08 ? 1.4 - d.t * 5 : 1})`;
  }
}
/* ---------- Radar module: screen markers for cases, the store, elites, power-ups and parts in range ---------- */
const radarEls = [];
function updateRadar() {
  const lay = $('#reloadLayer'), R = (stats && stats.radar) || 0, P = player.pos, list = [];
  if (R && S.mode === 'play') {
    const add = (x, y, z, icon, cls) => { const d = Math.hypot(x - P.x, z - P.z); if (d <= R && d > 4) list.push({ x, y, z, icon, cls, d }); };
    for (const c of cases) if (!c.open) add(c.x, c.y + 1.2, c.z, '▣', 'case');
    if (S.shop) add(S.shop.x, S.shop.y + 3, S.shop.z, '$', 'store');
    for (const e of enemies) if (!e.dead && (e.elite || e.mini)) add(e.pos.x, e.pos.y + e.r * 2 + 0.6, e.pos.z, '!', 'elite');
    for (const g of gems) if (g.kind === 'loot' || g.kind === 'vacuum' || g.kind === 'nuke' || g.kind === 'health') add(g.pos.x, g.pos.y + 0.8, g.pos.z, g.kind === 'loot' ? '◆' : g.kind === 'health' ? '+' : '★', g.kind === 'loot' ? 'part' : 'power');
  }
  list.sort((a, b) => a.d - b.d);
  let i = 0;
  for (const t of list.slice(0, 14)) {
    const p = new THREE.Vector3(t.x, t.y, t.z).project(camera);
    let x = p.x, y = p.y;
    if (p.z > 1) { x = -x; y = -y; const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x /= m; y = -1; }
    x = clamp(x, -0.95, 0.95); y = clamp(y, -0.88, 0.88);
    let el = radarEls[i]; if (!el) { el = document.createElement('div'); lay.appendChild(el); radarEls.push(el); }
    el.className = 'radar ' + t.cls; el.style.display = '';
    el.innerHTML = `<b>${t.icon}</b><small>${Math.round(t.d)}m</small>`;
    el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px) translate(-50%,-50%)`;
    i++;
  }
  for (; i < radarEls.length; i++) radarEls[i].style.display = 'none';
}
function updateHUD(dt) {
  const P = player;
  updateDmgNumbers(dt); updateRadar();
  updateAmmo(); updateReloadMarkers(); updateLockMarkers();
  // boss bar (bottom of the screen): the Warden, or the brute that turns up every 5 minutes
  const bossE = S.boss || (S.mini && !S.mini.dead ? S.mini : null);
  $('#bossbar').hidden = !bossE;
  if (bossE) {
    $('#bossFill').style.transform = `scaleX(${clamp(bossE.hp / bossE.maxHp, 0, 1)})`;
    $('#bossName').textContent = bossE === S.boss ? `THE WARDEN · STAGE ${S.stage}` : `BRUTE CRAWLER · ${fmt(S.t)}`;
  }
  $('#hpBar').style.transform = `scaleX(${clamp(P.hp / stats.maxHp, 0, 1)})`;
  $('#shBar').style.transform = `scaleX(${stats.maxShield ? clamp(P.shield / stats.maxShield, 0, 1) : 0})`;
  $('#hpTxt').textContent = Math.ceil(Math.max(0, P.hp));
  $('#shTxt').textContent = Math.ceil(Math.max(0, P.shield));
  const pips = (n, m) => '◆'.repeat(n) + '◇'.repeat(Math.max(0, m - n));
  let mob = '';
  if (stats.airJumps) mob += `<span>Air <b>${pips(P.airJumps, stats.airJumps)}</b></span>`;
  if (stats.dashes) mob += `<span>Dash <b>${pips(P.dashCharges, stats.dashes)}</b></span>`;
  if (stats.thrust) mob += `<span>Fuel <i class="fuel"><i style="transform:scaleX(${clamp(P.fuel / stats.fuel, 0, 1)})"></i></i></span>`;
  if (stats.load > 1.2) mob += `<span style="color:var(--hostile)">Overloaded</span>`;
  if (stats.legs < 2) mob += `<span style="color:var(--hostile)">Unstable</span>`;
  $('#mobility').innerHTML = mob;
  $('#timer').textContent = fmt(S.t); clockHeat(dt);
  $('#lvlTxt').textContent = 'LV ' + S.level;
  $('#killTxt').textContent = S.kills;
  $('#boltTxt').textContent = S.bolts; $('#circTxt').textContent = META.circuits;
  updateXpLine(dt);
  let obj;
  if (S.mode === 'drop') obj = 'Drop';
  else if (S.bossDead) obj = 'Exit open';
  else if (S.boss) obj = overtime() > 0 ? 'OVERTIME · kill the boss' : 'Kill the boss';
  else obj = `Boss ${fmt(BOSS_AT - S.t)}`;
  if (S.test && !S.boss && !S.bossDead) obj = `Test · ${enemies.filter(e => !e.dead).length} enemies`;
  $('#objective').textContent = obj;
  hitT -= dt;
  const ch = $('#crosshair');
  ch.className = 'xh' + (hitT > 0 ? ' hit' : aim.enemy ? ' on' : '');
  XH.bloom = Math.max(0, XH.bloom - dt * (1.6 + XH.bloom * 2));
  if ((xhLeftT -= dt) <= 0) { xhLeftT = 0.5; if (SETTINGS.xhParts && L && L.body) renderXhLeft(); }
  ch.style.transform = `translate(-50%, -50%) scale(${(1 + XH.bloom * 0.85).toFixed(3)})`;
  ch.style.filter = XH.bloom > 0.02 ? `drop-shadow(0 0 ${(XH.bloom * 6).toFixed(1)}px rgba(255,190,120,${(XH.bloom * 0.9).toFixed(2)}))` : '';
  ch.hidden = S.mode !== 'play';
  const mk = $('#marker');
  if (S.gate && S.mode === 'play') {
    const p = new THREE.Vector3(S.gate.x, S.gate.y + 6, S.gate.z).project(camera);
    let x = p.x, y = p.y;
    if (p.z > 1) { x = -x; y = -y; const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x /= m; y = -1; }
    x = clamp(x, -0.92, 0.92); y = clamp(y, -0.85, 0.8);
    mk.hidden = false; mk.style.left = ((x + 1) / 2 * innerWidth) + 'px'; mk.style.top = ((1 - y) / 2 * innerHeight) + 'px';
    const d = Math.hypot(S.gate.x - P.pos.x, S.gate.z - P.pos.z);
    const st = S.gate.state;
    $('#markerTxt').textContent = `${st === 'exit' ? 'EXIT' : st === 'sealed' ? 'SEALED' : 'GATE'} ${Math.round(d)}m`;
    $('#markerTxt').style.color = st === 'exit' ? 'var(--orange)' : st === 'sealed' ? 'var(--hostile)' : 'var(--xp)';
  } else mk.hidden = true;
  // store marker
  const sm = $('#shopMarker');
  if (S.shop && S.mode === 'play') {
    const p = new THREE.Vector3(S.shop.x, S.shop.y + 4, S.shop.z).project(camera);
    let x = p.x, y = p.y;
    if (p.z > 1) { x = -x; y = -y; const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x /= m; y = -1; }
    x = clamp(x, -0.92, 0.92); y = clamp(y, -0.85, 0.8);
    sm.hidden = false; sm.style.left = ((x + 1) / 2 * innerWidth) + 'px'; sm.style.top = ((1 - y) / 2 * innerHeight) + 'px';
    $('#shopMarkerTxt').textContent = `STORE ${Math.round(Math.hypot(S.shop.x - P.pos.x, S.shop.z - P.pos.z))}m`;
  } else sm.hidden = true;
}
function keyHint(k, b) { return IN.device === 'pad' ? `<kbd>${b}</kbd>` : `<kbd>${k}</kbd>`; }

/* ---------- level-up offers ---------- */
/* Level-up: three different stat upgrades, each with its own random rarity (luck helps). */
function makeOffers() {
  // weighted pick of three different upgrades (Cargo Racks are rarer)
  const pool = Object.keys(STAT_UPGRADES).map(k => [k, STAT_UPGRADES[k].weight ?? 1]), keys = [];
  while (keys.length < 3 && pool.length) {
    let x = Math.random() * pool.reduce((a, p) => a + p[1], 0), i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i][1]; if (x <= 0) break; }
    keys.push(pool.splice(i, 1)[0][0]);
  }
  return keys.map(k => { const r = rollRarity(stats.luck || 0); return { key: k, rarity: r, value: STAT_UPGRADES[k].v[r] }; });
}
function celebrate() {
  // a burst of colour around the frame and a little fanfare
  sfx('celebrate');
  const c = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z);
  const cols = [0xff5a7a, 0xffd23a, 0x4fd06b, 0x3f8cff, 0xb45cff, 0x58cfd6, ORANGE];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(geoBox, B(pick(cols))), s = rand(0.08, 0.2); m.scale.set(s, s * 0.4, s); m.position.copy(c);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.4, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(5, 11));
    const w = new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12));
    addFx(m, rand(1, 1.6), (f, dt) => { v.y -= 14 * dt; v.multiplyScalar(1 - 1.4 * dt); f.obj.position.addScaledVector(v, dt); f.obj.rotation.x += w.x * dt; f.obj.rotation.z += w.z * dt; if (f.life < 0.3) f.obj.scale.multiplyScalar(0.9); });
  }
  ring(player.pos, 6, 0.6, 0xffd23a); ring(player.pos, 4, 0.45, 0xb45cff);
}
function openLevelUp(chained) {
  S.mode = 'levelup'; unlockPointer(); S.pendingLv--;
  $('#hud').hidden = false;
  if (!chained) celebrate(); else sfx('levelup');
  // the cards can't be picked for a moment, so a held fire button or a mashed key can't choose for you
  S.luLock = performance.now() + 750;
  luBadge(S.pendingLv + 1, !chained);
  const wrap = $('#luCards'); wrap.innerHTML = '';
  for (const c of makeOffers()) {
    const U = STAT_UPGRADES[c.key], R = RARITY[c.rarity];
    const b = document.createElement('button');
    b.className = `card nav rar symcard r${c.rarity}`;
    b.dataset.tip = `${U.name}: +${c.value}${U.unit}`;
    b.innerHTML = upgradeCardHTML(c);
    b.addEventListener('click', () => {
      if (performance.now() < S.luLock) { sfx('deny', 0.4); return; }
      $('#levelup').hidden = true;
      L.bonus[c.key] = (L.bonus[c.key] || 0) + c.value;
      const shBefore = stats.maxShield;
      refreshLoadout();
      if (c.key === 'shield') player.shield += stats.maxShield - shBefore;
      if (S.pendingLv > 0) openLevelUp(true); else { S.mode = 'play'; lockPointer(); }
    });
    wrap.appendChild(b);
  }
  $('#levelup').hidden = false;
  wrap.classList.remove('armed'); void wrap.offsetWidth; wrap.classList.add('locked');
  setTimeout(() => { wrap.classList.remove('locked'); wrap.classList.add('armed'); }, 750);
  focusFirst();
}
function openPerk() {
  S.mode = 'perk'; unlockPointer();
  const pool = PERKS.filter(p => !L.perks.has(p.id)), picks = [];
  // one reward is always a fresh main body (chest) part
  picks.push({ id: 'chest', name: 'Frame Body', desc: `A new main body block: +${BLOCKS.body.hp} health, +${BLOCKS.body.shield} shield and five more sockets once mounted. Goes to storage.`, chest: true });
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!picks.length) picks.push({ id: 'none', name: 'Full Refit', desc: 'Every perk claimed. Start the next stage fully repaired.' });
  const wrap = $('#perkCards'); wrap.innerHTML = '';
  picks.forEach(p => {
    const b = document.createElement('button'); b.className = 'card nav combine symcard';
    const key = p.chest ? 'chest' : p.id === 'none' ? 'refit' : p.id;
    b.dataset.tip = `${p.name}: ${p.desc}`;
    b.innerHTML = `<div class="tag"><b>${p.chest ? 'Part' : 'Perk'}</b></div><div class="bigsym">${sym(key, `${p.name}: ${p.desc}`)}</div><div class="nm sm">${p.name}</div>`;
    b.addEventListener('click', () => {
      if (p.chest) receiveItem(mkItem('block', 'body'));
      else if (p.id !== 'none') L.perks.add(p.id);
      refreshLoadout();
      $('#perk').hidden = true;
      S.total += S.t; S.stage++;
      startStage(); lockPointer();
    });
    wrap.appendChild(b);
  });
  $('#perk').hidden = false; focusFirst();
}

/* ---------- pause ---------- */
/* an options row: the name on the left, a switch (on/off) or the current value on the right */
function optRow(sel, label, v, tip) {
  const el = $(sel); el.classList.add('orow');
  el.innerHTML = `<span>${label}</span>` + (typeof v === 'boolean' ? `<i class="sw${v ? ' on' : ''}" aria-hidden="true"></i>` : `<b class="ov">${v}</b>`);
  el.setAttribute('aria-pressed', typeof v === 'boolean' ? String(v) : 'mixed');
  if (tip) el.dataset.tip = tip; else delete el.dataset.tip;
}
function syncSettingsUI() {
  $('#uiScale').value = SETTINGS.uiScale || 1; syncUIScaleLabel();
  $('#musicVol').value = SETTINGS.music ?? 0.6; $('#musicVal').textContent = Math.round((SETTINGS.music ?? 0.6) * 100) + '%';
  $('#sens').value = SETTINGS.sens; $('#sensVal').textContent = (+SETTINGS.sens).toFixed(1);
  optRow('#invertBtn', 'Invert look', !!SETTINGS.invertY);
  optRow('#assistBtn', 'Aim assist', !!SETTINGS.aimAssist, 'Gamepad only');
  optRow('#physBtn', 'Physics body', !!SETTINGS.physics, PHYS.ready ? '' : 'Loading…');
  optRow('#gfxBtn', 'Graphics', SETTINGS.gfx);
  optRow('#devBtn', 'Developer mode', !!SETTINGS.dev);
  optRow('#xhPartsBtn', 'Part level bar', !!SETTINGS.xhParts);
  optRow('#autoModBtn', 'Auto-upgrade new modules', SETTINGS.autoUpMods !== false);
  $('#xhLeft').hidden = !SETTINGS.xhParts;
  $('#skipBtn').hidden = !SETTINGS.dev || !!S.test;
  $('#devPanelBtn').hidden = !S.test;
  optRow('#detailBtn', 'World detail', SETTINGS.detail !== false);
  optRow('#xhStyleBtn', 'Style', SETTINGS.xhStyle);
  optRow('#xhColorBtn', 'Colour', SETTINGS.xhColor);
  optRow('#xhSizeBtn', 'Size', XH_SIZES.find(s => s[1] === SETTINGS.xhSize)[0]);
  applyCrosshair();
}
function openPause() {
  if (!playing()) return;
  S.prevMode = S.mode; S.mode = 'pause'; unlockPointer();
  showOptions(false); syncSettingsUI(); $('#pause').hidden = false; focusFirst();
}
/* the pause screen has two pages: the short pause menu, and Options (opened from it or from the title screen) */
function showOptions(on) {
  $('#pauseMain').hidden = on; $('#optMenu').hidden = !on;
  if (on) { syncSettingsUI(); $('#optMenu .optbody').scrollTop = 0; }
  if (!$('#pause').hidden) focusFirst();
}
const optionsOpen = () => !$('#optMenu').hidden;
function pauseBack() {
  if (optionsOpen() && !TITLE.fromOptions) { showOptions(false); sfx('tick'); return; }
  resume();
}
function resume() {
  $('#pause').hidden = true;
  if (TITLE.fromOptions) { TITLE.fromOptions = false; $('#pause').classList.remove('fromTitle'); showOptions(false); S.mode = 'title'; $('#title').hidden = false; focusFirst(); return; }
  S.mode = S.prevMode || 'play'; lockPointer();
}
$('#resumeBtn').addEventListener('click', resume);
$('#optBtn').addEventListener('click', () => { showOptions(true); sfx('tick'); });
$('#optBackBtn').addEventListener('click', pauseBack);
$('#invBtn').addEventListener('click', () => { if (S.prevMode !== 'play') { sfx('deny'); denyFx($('#invBtn')); return; } $('#pause').hidden = true; S.mode = 'play'; openInventory(false); });
$('#uiScale').addEventListener('input', e => { SETTINGS.uiScale = +e.target.value; saveSettings(); detectUI(); });
$('#musicVol').addEventListener('input', e => { SETTINGS.music = +e.target.value; saveSettings(); syncSettingsUI(); });
$('#sens').addEventListener('input', e => { SETTINGS.sens = +e.target.value; saveSettings(); syncSettingsUI(); });
$('#invertBtn').addEventListener('click', () => { SETTINGS.invertY = !SETTINGS.invertY; saveSettings(); syncSettingsUI(); });
$('#assistBtn').addEventListener('click', () => { SETTINGS.aimAssist = !SETTINGS.aimAssist; saveSettings(); syncSettingsUI(); });
/* ---------- crosshair looks ---------- */
const XH_STYLES = ['square', 'diamond', 'cross', 'circle', 'dot', 'brackets'];
const XH_COLORS = { white: '#e4e9e6', green: '#5dff8a', cyan: '#58cfd6', yellow: '#ffe14a', magenta: '#ff5ad1', orange: '#ff9a3c' };
const XH_SIZES = [['small', 0.75], ['medium', 1], ['large', 1.35]];
function applyCrosshair() {
  for (const el of [$('#crosshair'), $('#xhPreview')]) {
    if (!el) continue;
    el.dataset.style = SETTINGS.xhStyle;
    el.style.setProperty('--xc', XH_COLORS[SETTINGS.xhColor] || XH_COLORS.white);
    el.style.setProperty('--xs', (26 * SETTINGS.xhSize).toFixed(0) + 'px');
  }
}
const cycle = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
$('#xhStyleBtn').addEventListener('click', () => { SETTINGS.xhStyle = cycle(XH_STYLES, SETTINGS.xhStyle); saveSettings(); syncSettingsUI(); });
$('#xhColorBtn').addEventListener('click', () => { SETTINGS.xhColor = cycle(Object.keys(XH_COLORS), SETTINGS.xhColor); saveSettings(); syncSettingsUI(); });
$('#xhSizeBtn').addEventListener('click', () => { SETTINGS.xhSize = cycle(XH_SIZES.map(s => s[1]), SETTINGS.xhSize); saveSettings(); syncSettingsUI(); });
$('#autoModBtn').addEventListener('click', () => { SETTINGS.autoUpMods = !(SETTINGS.autoUpMods !== false); saveSettings(); syncSettingsUI(); });
$('#xhPartsBtn').addEventListener('click', () => { SETTINGS.xhParts = !SETTINGS.xhParts; saveSettings(); syncSettingsUI(); });
$('#devBtn').addEventListener('click', () => {
  SETTINGS.dev = !SETTINGS.dev; saveSettings(); syncSettingsUI();
  if (typeof INV !== 'undefined' && INV.hangar && !$('#inv').hidden) renderBench();
});
$('#gfxBtn').addEventListener('click', () => {
  const order = ['high', 'medium', 'low'];
  SETTINGS.gfx = order[(order.indexOf(SETTINGS.gfx) + 1) % order.length]; saveSettings(); applyGfx(); syncSettingsUI();
});
$('#physBtn').addEventListener('click', () => {
  SETTINGS.physics = !SETTINGS.physics; saveSettings(); syncSettingsUI();
  // switch over mid-run: build or tear down the physical body
  if (S.inRun && player.model && !DR.active) { if (SETTINGS.physics) { if (!PHYS.world) physResetWorld(); physBuildRobot(); } else physDestroyRobot(); }
});
$('#fsBtn').addEventListener('click', () => { if (window.desktop) window.desktop.toggleFullscreen(); else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
$('#skipBtn').addEventListener('click', () => { S.t += 60; resume(); });
$('#quitBtn').addEventListener('click', () => toHangar());
$('#exitBtn').addEventListener('click', () => { if (window.desktop) window.desktop.quit(); else window.close(); });
$('#againBtn').addEventListener('click', () => toHangar());

function gameOver() {
  // the frame falls apart first; the summary appears a moment later
  if (S.mode === 'dying' || S.mode === 'over') return;
  S.mode = 'dying'; S.dieT = 2.4; S.total += S.t;
  $('#crosshair').hidden = true; $('#prompt').hidden = true;
  banner('FRAME DOWN', '', 'var(--hostile)', 2.2);
  physDestroyRobot(true);
  startRagdoll();
}
/* ---------- run stats: everything the game over screen reports ---------- */
function newRunStats() { return { dealt: 0, biggest: 0, taken: 0, shielded: 0, bolts: 0, heals: 0, partsFound: 0, gemsFound: 0, dist: 0, peak: 0, kills: {}, byPart: {}, peakT: 0 }; }
function runStatDamage(src, dealt, raw) {
  const st = S.st; if (!st || !(dealt > 0)) return;
  st.dealt += dealt; if (raw > st.biggest) st.biggest = raw;
  const key = src && src.id ? src.id : 'other';
  const row = st.byPart[key] || (st.byPart[key] = { it: src && src.id ? src : null, dmg: 0 }); row.dmg += dealt;
}
function runStatKill(e) {
  const st = S.st; if (!st) return;
  const k = e.boss ? 'warden' : e.mini ? 'brute' : e.elite ? 'elite' : e.type;
  st.kills[k] = (st.kills[k] || 0) + 1;
}
function runStatTick(dt) {
  const st = S.st; if (!st) return;
  const d = Math.hypot(player.pos.x - player.prev.x, player.pos.z - player.prev.z); if (d < 5) st.dist += d;
  st.peakT -= dt; if (st.peakT <= 0) { st.peakT = 0.5; let n = 0; for (const e of enemies) if (!e.dead) n++; if (n > st.peak) st.peak = n; }
}
const KILL_NAMES = { crawler: 'Crawlers', elite: 'Elite crawlers', drone: 'Drones', spitter: 'Spitters', bomber: 'Bombers', splitter: 'Splitters', splitling: 'Splitlings', brute: 'Brutes', warden: 'Wardens' };
const big = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
function showGameOver() {
  S.mode = 'over'; unlockPointer(); $('#hud').hidden = true;
  const st = S.st || newRunStats();
  $('#overSub').textContent = S.test ? 'Test range' : 'Stage ' + S.stage; $('#overDetails').open = false;
  // headline tiles (the numbers count up)
  const tiles = [['time', S.total, fmt], ['kills', S.kills], ['level', S.level], ['bolts', st.bolts]];
  $('#recap').innerHTML = tiles.map(([a], i) => `<div class="otile" data-tip="${symName(a)}">${sym(a, '')}<b data-i="${i}">0</b></div>`).join('');
  const t0 = performance.now(), tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
    tiles.forEach(([, v, f], i) => { const el = $(`#recap [data-i="${i}"]`); if (el) el.textContent = (f || big)(v * e); });
    if (k < 1 && S.mode === 'over') requestAnimationFrame(tick);
  };
  tick(); setTimeout(() => tiles.forEach(([, v, f], i) => { const el = $(`#recap [data-i="${i}"]`); if (el) el.textContent = (f || big)(v); }), 1300);
  // combat numbers
  const kv = [['dmg', 'Damage dealt', big(st.dealt)], ['biggest', '', big(st.biggest)], ['taken', '', big(st.taken)], ['blocked', '', big(st.shielded)],
    ['peak', '', st.peak], ['kills', 'Best kill streak', '×' + (st.bestStreak || 0)], ['circuits', 'Circuits earned', st.circuits || 0], ['dist', '', `${big(st.dist)} m`], ['parts', '', st.partsFound], ['gems', '', st.gemsFound]];
  $('#overCombat').innerHTML = kv.map(([k, n, b]) => `<div class="okv" data-tip="${n || symName(k)}">${sym(k, '')}<b class="mono">${b}</b></div>`).join('');
  // kills by type
  const kills = Object.entries(st.kills).sort((a, b) => b[1] - a[1]), kmax = kills.length ? kills[0][1] : 1;
  $('#overKills').innerHTML = kills.length ? kills.map(([k, n]) => `<div class="obar"><span>${KILL_NAMES[k] || k}</span><i><em style="width:${(n / kmax * 100).toFixed(1)}%"></em></i><b class="mono">${n}</b></div>`).join('')
    : '<div class="onone">—</div>';
  // damage by part
  const rows = Object.values(st.byPart).sort((a, b) => b.dmg - a.dmg).slice(0, 7), dmax = rows.length ? rows[0].dmg : 1, tot = st.dealt || 1;
  $('#overParts').innerHTML = rows.length ? rows.map(r => `<div class="obar part" data-tip="${r.it ? itemName(r.it) : 'Blasts, falls and hazards'}">${r.it ? partIcon(r.it, 'picon') : sym('dmg', '')}<span>${r.it ? (r.it.kind === 'weapon' ? '' : itemName(r.it)) : ''}</span><i><em style="width:${(r.dmg / dmax * 100).toFixed(1)}%"></em></i><b class="mono">${big(r.dmg)} <small>${Math.round(r.dmg / tot * 100)}%</small></b></div>`).join('')
    : '<div class="onone">—</div>';
  // the frame you died in
  const parts = L && L.body ? mountedItems() : [];
  $('#overBuild').innerHTML = parts.map(it => `<div class="obuild" title="${itemName(it)}">${partIcon(it, 'picon')}<small>${it.kind === "gem" ? "" : lvTag(it)}</small></div>`).join('');
  $('#over').hidden = false; focusFirst();
}

applyCrosshair();

detectUI();

/* ---------- stacked level-ups: the LEVEL UP badge counts up ×2, ×3... as they stack, and back down as you pick ---------- */
let _luCount = null;
function luBadge(total, fresh) {
  const q = $('#luQueue'); clearInterval(_luCount);
  const show = n => {
    q.hidden = n < 2; q.textContent = '×' + n; q.dataset.tip = `${n} level-ups`;
    q.classList.remove('pop'); void q.offsetWidth; q.classList.add('pop');
  };
  if (total < 2) { q.hidden = true; return; }
  if (!fresh) { show(total); return; }
  // fresh stack: count up one at a time so you see them pile on
  let n = 2; show(n); sfxP('tick', 0.5, 1);
  if (n >= total) return;
  _luCount = setInterval(() => {
    n++; show(n); sfxP('tick', 0.55, 1 + (n - 2) * 0.12);
    if (n >= total) { clearInterval(_luCount); sfx('sparks', 0.4); sparkBurst(q, '#7fe0ff', 10 + total * 3); }
  }, 170);
}

/* ---------- reward pop-up: a small stack of what you just got, shown for a few seconds ---------- */
function rewardPop(rows, title) {
  const el = $('#rewardPop');
  el.innerHTML = (title ? `<div class="rpT">${title}</div>` : '') + rows.map((r, i) => `<div class="rpRow" style="--rc:${r.css};animation-delay:${i * 0.12}s">${r.icon}<b>${r.text}</b><span>${r.sub || ''}</span></div>`).join('');
  el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(el._t); el._t = setTimeout(() => { el.classList.add('out'); el._t = setTimeout(() => { el.hidden = true; }, 350); }, 2600 + rows.length * 300);
}

/* ---------- the run clock heats up: white to angry red over 10 minutes, then it catches fire (OVERTIME) ---------- */
const CLOCK = { lit: false, built: false };
function clockHeat(dt) {
  const box = $('.tc .tbox'); if (!box) return;
  if (!CLOCK.built) {
    CLOCK.built = true;
    const f = document.createElement('div'); f.className = 'clockfire'; f.setAttribute('aria-hidden', 'true');
    f.innerHTML = Array.from({ length: 11 }, (_, i) => `<i style="--x:${(i / 10 * 100).toFixed(0)}%;--d:${(0.45 + Math.random() * 0.35).toFixed(2)}s;--del:${(-Math.random()).toFixed(2)}s;--h:${(0.8 + Math.random() * 0.6).toFixed(2)}"></i>`).join('')
      + Array.from({ length: 8 }, (_, i) => `<b style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(1 + Math.random() * 1.2).toFixed(2)}s;--del:${(-Math.random() * 2).toFixed(2)}s;--dx:${(Math.random() * 40 - 20).toFixed(0)}px"></b>`).join('');
    box.appendChild(f);
  }
  const inRun = S.inRun && !S.test;
  const k = inRun ? clamp(S.t / OVERTIME_T, 0, 1) : 0, lit = inRun && overtime() > 0;
  // heat curve: barely there early, building hard in the last few minutes
  const h = Math.pow(k, 1.6);
  box.style.setProperty('--heat', h.toFixed(3));
  box.style.setProperty('--beat', (1.6 - 1.25 * h).toFixed(2) + 's');
  box.classList.toggle('hot', h > 0.35 && !lit);
  if (lit !== CLOCK.lit) {
    CLOCK.lit = lit; box.classList.toggle('onfire', lit);
    if (lit) { sfx('fwoomp', 0.9); sfx('thoom', 0.6); cam.shake = Math.max(cam.shake || 0, 0.6); banner('OVERTIME', 'They only get stronger', '#ff4a1a', 3); sparkBurst(box, '#ff7a1a', 40); }
  }
}
