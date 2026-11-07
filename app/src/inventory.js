'use strict';
/* ============================================================
   WORKBENCH (hangar + field inventory)
   Drag parts out of the Parts list onto the orange socket holes. Near a socket the part is pulled in,
   and on release it presses in with a click. Grab a mounted part to pull it off. Parts you let go of
   anywhere else fall, bounce and can be thrown. Drop a part back on the list to put it away.
   ============================================================ */
const INV = {
  hangar: false, bodies: [], drag: null, incoming: [], shelf: [], msg: '', msgT: 0, orbit: null,
  yaw: 0.55, pitch: 0.22, dist: 8, wobble: 0, cursor: { x: 0, y: 0, shown: false }, bounds: [],
};
let previewModel = null;
const bcam = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const raycaster = new THREE.Raycaster();
const BENCH_TARGET = new THREE.Vector3(0, 1.55, 0);
const PEDESTAL_R = 3.0;
const bfx = [];
let dashLine = null;

/* ---------- sockets ----------
   A socket is addressed by a ref: { owner, key, i? }.
   { owner: L, key: 'body' } the stand · { owner: block, key: 'slots', i } a block face (i = FACE_ORDER index) ·
   { owner: arm, key: 'weapon' } wrist · { owner: L, key: 'store', i } storage */
function refGet(r) { return r.i !== undefined ? r.owner[r.key][r.i] : r.owner[r.key]; }
function refSet(r, v) { if (r.i !== undefined) r.owner[r.key][r.i] = v; else r.owner[r.key] = v; }
function refAccepts(r, it) {
  if (BUILD_V2) {
    // V2: the stand takes a lower half, the lower half's top takes a torso, torso sockets take only what their connector says
    if (r.key === 'body') return it.kind === 'lower';
    if (it.kind === 'gem') return r.key === 'gems' || r.key === 'store';
    if (r.key === 'gems') return false;
    if (r.key === 'weapon' || r.key === 'weapon2') return it.kind === 'weapon';
    if (r.key === 'store') return true;
    if (r.key === 'slots') {
      const o = r.owner;
      if (o.kind === 'lower') return it.kind === 'block' && !!BLOCKS[it.type].upper && r.i === FACE_ORDER.indexOf('top');
      if (o.kind === 'block' && BLOCKS[o.type].upper) { const want = BLOCKS[o.type].sockets[r.i].accepts; return it.kind === want || (it.kind === 'adapter' && ADAPTERS[it.type].from === want); }
      if (o.kind === 'adapter') return it.kind === ADAPTERS[o.type].to;           // adapters hold only their own kind of part, never another adapter
      return it.kind !== 'lower' && !(it.kind === 'block' && BLOCKS[it.type].upper);     // an old brick from a save still works
    }
    return false;
  }
  if (r.key === 'body') return it.kind === 'block' && BLOCKS[it.type].body;
  if (it.kind === 'gem') return r.key === 'gems' || r.key === 'store';
  if (r.key === 'gems') return false;
  if (r.key === 'weapon' || r.key === 'weapon2') return it.kind === 'weapon';
  if (r.key === 'store') return true;
  if (r.key === 'slots') return true;          // block holes take anything: legs, arms, weapons, modules, more blocks
  return false;
}
const COMBINABLE = ['leg', 'arm', 'weapon', 'module', 'lower', 'adapter'];
/* Two parts merge when they are the same kind and type AND the same level, below the cap (L1+L1 -> L2 ... L4+L4 -> L5). */
const canCombine = (a, b) => sameLevelPair(a, b) && (COMBINABLE.includes(a.kind) || a.kind === 'gem' || (a.kind === 'block' && BLOCKS[a.type].upgradable)) && upgradeCheck(a).ok;
function combineInto(t, h) {
  if (!canCombine(t, h)) return h;              // refused: nothing changes and the duplicate is handed back
  const r = upgradeItem(t, 1); if (!r.ok) return h;
  if (t.kind === 'gem') return null;
  if (h.kind === 'adapter') {                      // the duplicate's contents move into the new free sockets (both adapters hold at most one each)
    let left = null;
    for (const c of (h.slots || [])) if (c) { const k = t.slots.indexOf(null); if (k >= 0) t.slots[k] = c; else left = c; }
    return left;
  }
  // the duplicate's gems fill empty gem slots; the rest go to storage
  for (const gm of armGems(h)) { const k = (t.gems || []).indexOf(null); if (k >= 0) t.gems[k] = gm; else storePut(gm); }
  if (h.kind === 'arm') {
    // the duplicate's guns move into empty wrists; any that don't fit come back out
    let left = null;
    for (const g of armGuns(h)) { const k = WRISTS.find(k => k in t && !t[k]); if (k) t[k] = g; else left = g; }
    return left;
  }
  return null;
}
/* Empty sockets on the robot, with the face name for blocks */
function openSockets() {
  const out = [];
  for (const it of mountedItems()) {
    if (it.kind === 'lower') { const ti = FACE_ORDER.indexOf('top'); if (!it.slots[ti]) out.push({ owner: it, key: 'slots', i: ti, face: 'top' }); }
    if (it.kind === 'block') blockOpenFaces(it).forEach((ok, i) => { if (ok && !it.slots[i]) out.push({ owner: it, key: 'slots', i, face: FACE_ORDER[i] }); });
    if (it.kind === 'arm') for (const k of WRISTS) if (k in it && !it[k]) out.push({ owner: it, key: k });
    (it.gems || []).forEach((g, i) => { if (!g) out.push({ owner: it, key: 'gems', i }); });
  }
  return out;
}
function firstFree(it) {
  const open = openSockets(), top = mountedBodies().find(b => b !== L.body);
  const pickBy = (...tests) => { for (const t of tests) { const f = open.find(t); if (f) return f; } return null; };
  let f = null;
  if (BUILD_V2) { f = open.find(r => refAccepts(r, it)); return f || { owner: L, key: 'store', i: L.store.length }; }
  if (it.kind === 'leg') f = pickBy(r => r.owner === L.body && (r.face === 'left' || r.face === 'right'), r => r.key === 'slots' && r.face !== 'top');
  else if (it.kind === 'weapon') f = pickBy(r => r.key === 'weapon' || r.key === 'weapon2', r => r.owner === top && r.face === 'front', r => r.key === 'slots' && r.owner !== L.body);
  else if (it.kind === 'arm') f = pickBy(r => r.owner === top && (r.face === 'left' || r.face === 'right'), r => r.key === 'slots' && r.owner !== L.body);
  else if (it.kind === 'module') f = pickBy(r => r.owner === top && r.face === 'back', r => r.key === 'slots' && r.owner !== L.body);
  else if (it.kind === 'block') f = pickBy(r => r.key === 'slots' && r.owner !== L.body);
  else if (it.kind === 'gem') f = pickBy(r => r.key === 'gems');
  if (f) return f;
  return { owner: L, key: 'store', i: L.store.length };
}
function findCombineTarget(it) {
  let best = null;
  for (const o of allItems()) if (canCombine(o, it) && !best) best = o;
  return best;
}
/* New parts from a level-up: empty mount first, then combine with a duplicate, then storage, then the workbench. */
function freeMount(it) { const f = firstFree(it); return f && f.key !== 'store' ? f : null; }
function refLabel(r) {
  if (r.key === 'store') return `storage S${r.i + 1}`;
  if (r.key === 'weapon' || r.key === 'weapon2') return `the wrist of your ${itemName(r.owner)}`;
  if (r.key === 'slots') return `the ${FACE_ORDER[r.i]} of your ${r.owner === L.body ? 'bottom body' : itemName(r.owner)}`;
  return r.key;
}
function predictReceive(it) {
  return { how: 'store', text: 'Goes to storage' };
  const m = freeMount(it);
  if (m) return { how: 'place', text: `Mounts on ${refLabel(m)}` };
  const t = findCombineTarget(it);
  if (t) return { how: 'combine', text: `Combines with your ${itemName(t)}` };
  const f = firstFree(it);
  if (f) return { how: 'place', text: `Goes to ${refLabel(f)}` };
  return { how: 'hand', text: 'No room · it lands on your workbench' };
}
/* Put a part in storage. An arm and the gun in its wrist are stored as two separate parts.
   Returns whatever did not fit (storage holds storeCap() parts). */
function storePut(it) {
  // always goes in, even past capacity; you just can't leave the workbench while storage is over its limit
  const items = [it];
  if (it.kind === 'arm') for (const k of WRISTS) if (it[k]) { items.push(it[k]); it[k] = null; }
  for (const x of items) L.store.push(x);
  return [];
}
const storeOver = () => Math.max(0, storeCount() - storeCap());
function receiveItem(it) {
  discoverItem(it);
  if (S.st && S.inRun) { if (it.kind === 'gem') S.st.gemsFound++; else S.st.partsFound++; }
  // a matching part set to auto-upgrade takes it in straight away
  const auto = allItems().find(o => o.autoUp && canCombine(o, it));
  if (auto) {
    const left = combineInto(auto, it);
    if (left) storePut(left);
    banner('AUTO-UPGRADE', `${itemName(auto)}${auto.kind === 'gem' ? '' : ` · Lv ${auto.lvl}`}`, 'var(--xp)', 2); sfx('combine');
    if (S.inRun && stats) { stats = computeStats(); syncCaps(); renderLoadoutHUD(); }
    if (!$('#inv').hidden) renderBench();
    return true;
  }
  storePut(it);
  if (!$('#inv').hidden) renderBench();
  return storeOver() === 0;
}
/* What changed between the old and new level, read straight off the hover-window rows. */
function upgradeText(it) {
  const from = it.prevLvl || it.lvl;
  const a = partInfo({ ...it, lvl: from }), b = partInfo(it);
  const diff = b.filter((r, i) => a[i] && String(a[i][1]) !== String(r[1]) && r[0] !== 'Weight').map((r, i) => `${r[0].toLowerCase()} ${r[1]}`);
  return diff.length ? diff.slice(0, 3).join(', ') : 'stronger';
}
function scrapValue(it) { return Math.max(1, Math.round([it, ...childrenOf(it)].reduce((v, x) => v + x.lvl * 0.8 + 1, 0))); }

/* ---------- open / close ---------- */
function openInventory(hangar) {
  INV.hangar = hangar; INV.msg = ''; INV.msgT = 0;
  if (!hangar) { if (S.mode !== 'inv') S.prevMode = S.mode; S.mode = 'inv'; unlockPointer(); }
  else S.mode = 'hangar';
  $('#hud').hidden = true;
  $('#inv').hidden = false;
  $('#toast').hidden = true;
  // a quick wipe across the screen as the storage window opens mid-run
  if (!hangar) { const inv = $('#inv'); inv.classList.remove('wipe'); void inv.offsetWidth; inv.classList.add('wipe'); sfx('swish', 0.4); }
  rebuildPreview();
  renderBench();

  INV.cursor.x = innerWidth * 0.4; INV.cursor.y = innerHeight * 0.5;
  focusFirst();
}
function stowLoose() {
  // Loose parts go back on the shelf (hangar) or into storage (run); returns how many could not fit.
  let left = 0;
  for (const b of INV.bodies.slice()) {
    if (INV.hangar) { if (!CFG.unlimitedParts) INV.shelf.push(b.item); removeBody(b); continue; }
    removeBody(b); storePut(b.item);
  }
  return storeOver();
}
function closeInventory() {
  if (INV.hangar) { launchRun(); return; }
  if (INV.drag) endDrag(INV.cursor.x, INV.cursor.y, true);
  const need = buildProblems();
  if (need.length) { say(`Needs: ${need.join(', ')}`, true); sfx('deny'); return; }
  const left = stowLoose();
  if (left) { say(`Storage full · mount or recycle ${left}`, true); sfx('deny'); renderBench(); return; }
  $('#inv').hidden = true; setTip(null);
  $('#hud').hidden = false;
  refreshLoadout();
  S.mode = S.prevMode === 'drop' ? 'drop' : 'play';
  if (S.mode === 'play' && S.pendingLv > 0) openLevelUp(); else lockPointer();
}
function invBack() {
  if (INV.drag) { endDrag(INV.cursor.x, INV.cursor.y, true); return; }
  if (!INV.hangar) closeInventory();
}
function launchRun() {
  if (INV.drag) endDrag(INV.cursor.x, INV.cursor.y, true);
  const need = buildProblems();
  if (need.length) { say(`Needs: ${need.join(', ')}`, true); sfx('deny'); return; }
  stowLoose();
  $('#inv').hidden = true;
  discoverLoadout();          // launching with a part counts as having it
  newRun();
}
function benchReset() { INV.bodies.slice().forEach(removeBody); INV.drag = null; INV.incoming = []; }
function say(msg, warn) { INV.msg = msg; INV.msgT = 4; const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (warn ? ' warn' : ''); t.hidden = false; }
function cycleChassis() {}   // chassis are draggable parts now
function changed() { refreshLoadout(); renderBench(); }

/* ---------- panels ---------- */
const ICONS = {
  leg: '<svg viewBox="0 0 24 24"><circle cx="7" cy="5" r="3"/><path d="M9 7l3 6"/><circle cx="12" cy="14" r="2"/><path d="M12 16l-2 5h6"/></svg>',
  arm: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="3"/><path d="M8 12h6"/><circle cx="15" cy="12" r="2"/><path d="M16 10l3-4"/><rect x="17" y="3" width="5" height="4"/></svg>',
  weapon: '<svg viewBox="0 0 24 24"><path d="M3 9h16v4H9l-1 6H5l1-6H3z"/><path d="M19 10h3"/></svg>',
  module: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/><circle cx="12" cy="12" r="3"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/><path d="M5 21h14"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
};
/* Hangar stock with developer mode off: what you can pick and how many of each kind */
const HANGAR_RULES = BUILD_V2 ? {
  lower:  { max: 1 },
  adapter: { max: 0 },
  block:  { max: 1, types: ['upper_scout', 'upper_brawler', 'upper_carrier'] },
  leg:    { max: 0 },
  arm:    { max: 2, types: ['basic', 'sentry'] },
  weapon: { max: 2 },
  module: { max: 0 },
  gem:    { max: 0 },
} : {
  adapter: { max: 0 },
  block:  { max: 2, types: ['body'] },
  leg:    { max: 2, types: ['basic'] },
  arm:    { max: 2, types: ['basic', 'sentry'] },
  weapon: { max: 2 },
  module: { max: 0 },
  gem:    { max: 0 },          // gems are found in the field (developer mode can still place them here)
};
function hangarCount(kind) {
  const loose = INV.bodies.flatMap(b => [b.item, ...childrenOf(b.item)]);
  return [...allItems(), ...loose].filter(it => it && it.kind === kind).length;
}
const hangarAllows = (k, t) => SETTINGS.dev || ((HANGAR_RULES[k].max > 0) && (!HANGAR_RULES[k].types || HANGAR_RULES[k].types.includes(t)));
function hangarLeft(k) { return SETTINGS.dev ? Infinity : HANGAR_RULES[k].max - hangarCount(k); }
const CAT_LABEL = { adapter: 'Adapters', lower: 'Lower half', block: BUILD_V2 ? 'Torso' : 'Body parts', leg: 'Legs', arm: 'Arms', weapon: 'Weapons', module: 'Modules', gem: 'Gems' };
function catalog() {
  const rows = [];
  if (BUILD_V2) {
    for (const [kind, table] of [['lower', LOWERS], ['block', BLOCKS], ['arm', ARMS], ['adapter', ADAPTERS], ['weapon', WEAPONS], ['module', MODULES], ['gem', GEMS]])
      for (const t of Object.keys(table)) if (kind !== 'block' || table[t].upper || SETTINGS.dev) rows.push([kind, t]);
    return rows;
  }
  for (const [kind, table] of [['block', BLOCKS], ['leg', LEGS], ['arm', ARMS], ['weapon', WEAPONS], ['module', MODULES], ['gem', GEMS]])
    for (const t of Object.keys(table)) rows.push([kind, t]);
  return rows;
}
const previewItems = {};
function mkPreviewItem(k, t) { return previewItems[k + t] || (previewItems[k + t] = mkItem(k, t)); }
function partRow(it, attrs, tag) {
  const extra = childrenOf(it).length;
  const sub = itemSub(it) + (it.kind === 'arm' && armGuns(it).length ? ' · ' + armGuns(it).map(itemName).join(' + ') : extra ? ` · +${extra} part${extra > 1 ? 's' : ''}` : '');
  const icon = partIcon(it) || ICONS[it.kind] || ICONS.box;
  const xp = '';
  void sub;
  const wpn = it.kind === 'weapon', armGunIcons = it.kind === 'arm' ? armGuns(it).map(g => weaponIcon(g.type)).join('') : '';
  return `<div class="prow${wpn ? ' wrow' : ''}" ${attrs}><i>${icon}</i><span><b>${itemName(it)} ${it.kind === 'gem' || it.kind === 'orb' ? '' : mkTag(it.lvl)} ${attrTag(it)}${armGunIcons ? `<em class="rowguns">${armGunIcons}</em>` : ''}${extra && it.kind !== 'arm' ? `<em class="rowx">+${extra}</em>` : ''}</b>${xp}</span>${it.autoUp ? '<span class="tagS auto">AUTO</span>' : ''}${tag ? `<span class="tagS">${tag}</span>` : ''}</div>`;
}
function xpBarHTML(it) {
  if (!upgradeable(it) || it.kind === 'gem') return '';
  const mx = levelCap(it);
  if (it.lvl >= mx) return `<span class="xpbar"><i style="width:100%"></i></span><small class="xpTxt">MAX LEVEL</small>`;
  return `<span class="xpbar"><i style="width:${(it.lvl / mx * 100).toFixed(0)}%"></i></span><small class="xpTxt">Level ${it.lvl} / ${mx} · merge an identical Lv ${it.lvl} to reach Lv ${it.lvl + 1}</small>`;
}
function renderBench() {
  if ($('#inv').hidden) return;
  const st = stats;
  $('#benchEyebrow').textContent = INV.hangar ? 'Hangar' : `Workbench · Stage ${S.stage}`;
  $('#bHp').textContent = st.maxHp; $('#bSh').textContent = st.maxShield;
  $('#bHpBar').style.width = Math.min(100, st.maxHp / 3) + '%';
  $('#bShBar').style.width = Math.min(100, st.maxShield / 1.5) + '%';
  // abilities: a row of symbol chips; hover one for what it means
  const ab = [];
  const chip = (icon, val, tip, bad) => ab.push(`<li class="${bad ? 'bad' : ''}" data-tip="${String(tip).replace(/"/g, '&quot;')}">${icon}${val !== '' ? `<b>${val}</b>` : ''}</li>`);
  const need = buildProblems();
  if (need.length) chip(sym('warn', ''), '', `Not ready: needs ${need.join(', ')}`, true);
  if (st.misLegs) chip(sym('warn', ''), `×${st.misLegs}`, `${st.misLegs} misplaced leg${st.misLegs > 1 ? 's' : ''}: not touching the ground (shown in red), about half speed each. Put legs on the sides or bottom of the lowest body.`, true);
  if (L.body) {
    const dangling = st.legsMounted - st.legs;
    chip(sym('speed', ''), st.speed.toFixed(1), `Run speed ${st.speed.toFixed(1)} m/s · ${st.legs} leg${st.legs === 1 ? '' : 's'} on the ground${dangling ? ` · ${dangling} dangling` : ''}${st.legs < 2 ? ' · unstable' : ''}`, st.legs < 2);
    chip(sym('weight', ''), st.mass.toFixed(1) + 't', `Weight ${st.mass.toFixed(1)} t · ${st.legs ? (st.load > 1.2 ? 'overloaded: slow and heavy' : st.load > LOAD_REF * 1.15 ? 'heavy' : st.load < LOAD_REF * 0.85 ? 'light and quick' : 'balanced') : 'nothing to stand on'}`, st.load > 1.2);
    if (st.thrust) chip(sym('jet', ''), (st.thrust / st.mass).toFixed(0), `Jetpack ${(st.thrust / st.mass).toFixed(0)} m/s² · ${st.fuel.toFixed(1)} s fuel · hold jump in the air${st.thrust / st.mass < CFG.gravityUp ? ' · too heavy to hover' : ''}`);
    chip(sym('jump', ''), st.jump.toFixed(1) + 'm', `Jump ${st.jump.toFixed(1)} m · about ${(st.jump + CFG.mantleHeight).toFixed(1)} m with a ledge pull-up`);
  }
  if (st.airJumps) chip(sym('airjump', ''), '×' + st.airJumps, `Air jumps ×${st.airJumps}`);
  if (!INV.hangar && st.multi) chip(sym('multi', ''), `+${Math.round(st.multi * 100)}%`, `Split Chamber: +${Math.round(st.multi * 100)}% chance of an extra shot`);
  if (!INV.hangar && st.luck) chip(sym('luck', ''), st.luck, `Luck ${st.luck}: better rarity rolls and drops`);
  if (st.dashes) chip(sym('dash', ''), '×' + st.dashes, `Dash ×${st.dashes} · Q / RB bursts the way you steer`);
  if (st.magnet > 4.5) chip(sym('magnet', ''), st.magnet.toFixed(0) + 'm', `Pickup range ${st.magnet.toFixed(0)} m (Magnet Coil)`);
  if (st.radar) chip(sym('radar', ''), st.radar.toFixed(0) + 'm', `Radar ${st.radar.toFixed(0)} m: marks cases, the store, elites, parts and power-ups`);
  if (st.stepUp > CFG.stepHeight) chip(sym('step', ''), st.stepUp.toFixed(1) + 'm', `Steps up ${st.stepUp.toFixed(1)} m ledges (spider legs)`);
  if (st.grip < 1) chip(sym('slip', ''), '', 'Slippery: wheels take longer to grip and turn', true);
  const held = new Set(mountedArms().flatMap(armGuns));
  for (const it of mountedItems()) {
    if (it.kind === 'arm') {
      const A = ARMS[it.type], gs = armGuns(it);
      chip(gs.length ? gs.map(g => weaponIcon(g.type)).join('') : partIcon(it), sym(A.auto ? 'auto' : 'manual', ''), `${itemName(it)} Mk ${ROMAN[it.lvl]}: ${gs.length ? gs.map(g => `${itemName(g)} Lv ${g.lvl}`).join(' + ') : 'empty wrist socket (optional)'} · ${A.auto ? 'aims itself' : 'you aim it'}`);
    } else if (it.kind === 'weapon' && !held.has(it)) chip(weaponIcon(it.type), sym('fixed', ''), `${itemName(it)} Lv ${it.lvl}: bolted on, fires forward on its own at ${Math.round(FIXED_DMG * 100)}% damage`);
    else if (it.kind === 'module' && it.type !== 'jetpack') chip(partIcon(it), '', `${itemName(it)} Lv ${it.lvl}: ${itemDef(it).desc}`);
  }
  $('#abil').innerHTML = ab.join('');
  $('#chassisRows').innerHTML = '';
  // parts list
  let html = '';
  if (INV.hangar) {
    html = CFG.unlimitedParts
      ? catalog().filter(([k, t]) => hangarAllows(k, t)).map(([k, t], i, all) => {
          const left = hangarLeft(k), head = i === 0 || all[i - 1][0] !== k;
          const sep = head ? `<div class="psep"><span>${CAT_LABEL[k]}${SETTINGS.dev ? '' : ` · ${Math.max(0, left)}/${HANGAR_RULES[k].max}`}</span></div>` : '';
          return sep + partRow(mkPreviewItem(k, t), `data-cat="${k}:${t}"${left <= 0 ? ' data-capped="1"' : ''}`, SETTINGS.dev ? '∞' : left > 0 ? '' : 'max').replace('class="prow"', left <= 0 ? 'class="prow capped"' : 'class="prow"');
        }).join('')
      : INV.shelf.map((it, i) => partRow(it, `data-shelf="${i}"`)).join('') || '<div class="phint">—</div>';
  } else {
    const cap = storeCap();
    html = L.store.map((it, i) => partRow(it, `data-store="${i}"${i >= cap ? ' data-over="1"' : ''}`, i >= cap ? 'over' : '')).join('');
    if (storeCount() > cap) html = `<div class="overwarn">${sym('warn', '')} Over by ${storeCount() - cap}</div>` + html;
    for (let i = storeCount(); i < cap; i++) html += `<div class="prow empty"><i>${ICONS.box}</i><span><b>Empty</b></span></div>`;
    // developer mode: every part, unlimited, right here in the field too
    if (SETTINGS.dev) html += catalog().map(([k, t], i, all) => (i === 0 || all[i - 1][0] !== k ? `<div class="psep"><span>Dev · ${CAT_LABEL[k]}</span></div>` : '') + partRow(mkPreviewItem(k, t), `data-cat="${k}:${t}"`, '∞')).join('');
  }
  $('#partList').innerHTML = html;
  // build checklist: body, arm, legs required; a weapon is optional
  {
    const bodies = mountedBodies().length, arms = mountedArms().length, legs = stats ? stats.legs : 0, w = mountedWeapons().length;
    const row = (ok, label, opt) => `<span class="${ok ? 'ok' : opt ? 'opt' : ''}">${label}</span>`;
    if (BUILD_V2) {
      const lo = !!(L.body && L.body.kind === 'lower');
      $('#checklist').innerHTML = row(lo, 'Legs') + row(bodies > 0, 'Torso') + row(arms > 0, 'Arm') + row(w > 0, 'Weapon?', true);
      $('#readyCheck').classList.toggle('ready', lo && bodies > 0 && arms > 0);
    } else {
      $('#checklist').innerHTML = row(bodies > 0, 'Body') + row(arms > 0, 'Arm') + row(legs >= 2, `Legs ${Math.min(2, legs)}/2`) + row(w > 0, 'Weapon?', true);
      $('#readyCheck').classList.toggle('ready', bodies > 0 && arms > 0 && legs >= 2);
    }
  }
  $('#partsHead').textContent = INV.hangar ? 'Parts' : `Storage ${storeCount()}/${storeCap()}`;
  $('#partsHint').textContent = INV.hangar ? 'Drag to socket · Click: turn · Twin: upgrade' : 'Drag out: mount · Twin: upgrade · Bin: bolts';
  $('#scrapZone').hidden = INV.hangar;
  $('#invDoneBtn').textContent = INV.hangar ? 'Launch' : 'Fight';
  $('#invMenuBtn').hidden = !INV.hangar;
  $('#invTestBtn').hidden = !(INV.hangar && SETTINGS.dev);
  $('#invDoneBtn').classList.toggle('ghost', need.length > 0);
}
function overPanel(x, y) { const r = $('#partsPanel').getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
function overScrap(x, y) { const z = $('#scrapZone'); if (z.hidden) return false; const r = z.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

/* ---------- preview robot ---------- */
function rebuildPreview() {
  if (previewModel) buildScene.remove(previewModel);
  previewModel = buildRobot(L, { stand: true });
  buildScene.add(previewModel);
  previewModel.updateMatrixWorld(true);
  INV.bounds = previewModel.userData.blocks.map(b => new THREE.Box3().setFromObject(b));
}

/* ---------- physics bodies (loose parts) ---------- */
function setBodyModel(b, out) {
  if (b.model) b.obj.remove(b.model);
  b.model = buildPart(b.item, out, null);
  greyOut(b.model);                               // loose parts are plain grey until they're plugged into the robot
  b.out = out.clone();
  const holder = new THREE.Group(); holder.add(b.model); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(b.model);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  holder.remove(b.model);
  b.model.position.copy(c).negate();             // body origin = visual centre
  b.center = c;                                    // the ball joint sits at -center from the body origin
  b.r = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.42);
  b.obj.add(b.model);
}
const GREY_MAT = SM(0x8a9096, 0, { roughness: 0.55, metalness: 0.5 }), GREY_DARK = SM(0x5c6268, 0, { roughness: 0.6, metalness: 0.45 });
function greyOut(m) {
  m.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (o.material.transparent || o.material.blending === THREE.AdditiveBlending) { o.visible = false; return; }
    const pick = mt => { const c = mt.color ? mt.color : null; const l = c ? (c.r + c.g + c.b) / 3 : 0.5; return l < 0.22 ? GREY_DARK : GREY_MAT; };
    o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
  });
}
function spawnBody(item, pos, vel, out) {
  const b = { item, obj: new THREE.Group(), model: null, pos: pos.clone(), vel: (vel || new THREE.Vector3()).clone(), q: new THREE.Quaternion(), w: new THREE.Vector3(), state: 'loose', target: null };
  setBodyModel(b, out || defaultOut(item));
  b.obj.position.copy(b.pos);
  buildScene.add(b.obj);
  INV.bodies.push(b);
  return b;
}
function defaultOut(it) { return it.kind === 'block' || it.kind === 'lower' ? new THREE.Vector3(0, 1, 0) : it.kind === 'weapon' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0); }
function removeBody(b) { buildScene.remove(b.obj); const i = INV.bodies.indexOf(b); if (i >= 0) INV.bodies.splice(i, 1); if (INV.drag && INV.drag.body === b) INV.drag = null; }
function ballWorld(b) { return b.center.clone().negate().applyQuaternion(b.q).add(b.pos); }
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), QID = new THREE.Quaternion();

function stepBodies(dt) {
  for (const b of INV.bodies.slice()) {
    if (b.state === 'snap') { stepSnap(b, dt); continue; }
    if (b.state === 'drag') continue;
    b.vel.y -= 18 * dt;
    b.pos.addScaledVector(b.vel, dt);
    const wl = b.w.length();
    if (wl > 1e-4) { _q.setFromAxisAngle(_v.copy(b.w).divideScalar(wl), wl * dt); b.q.premultiply(_q); }
    b.w.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
    // floor: pedestal top, or the hangar floor beyond it
    const horiz = Math.hypot(b.pos.x, b.pos.z);
    const floorY = horiz < PEDESTAL_R ? 0 : -0.4;
    if (b.pos.y - b.r < floorY) {
      b.pos.y = floorY + b.r;
      if (b.vel.y < -2.5) sfx('thud', Math.min(1, -b.vel.y / 10));
      b.vel.y = b.vel.y < -0.8 ? -b.vel.y * 0.35 : 0;
      const f = Math.max(0, 1 - 5 * dt); b.vel.x *= f; b.vel.z *= f;
      b.w.set(b.vel.z, 0, -b.vel.x).multiplyScalar(1 / Math.max(0.3, b.r));   // roll along the floor
      if (b.vel.lengthSq() < 0.05) b.q.slerp(QID, dt * 2.5);                 // settle upright when resting
    }
    // bounce off the robot's chassis
    for (const box of INV.bounds) {
      const cp = box.clampPoint(b.pos, new THREE.Vector3());
      const d = cp.distanceTo(b.pos);
      if (d < b.r) {
        const n = d > 1e-4 ? b.pos.clone().sub(cp).divideScalar(d) : new THREE.Vector3(Math.sign(b.pos.x) || 1, 0, 0);
        b.pos.addScaledVector(n, b.r - d);
        const vn = b.vel.dot(n);
        if (vn < 0) { b.vel.addScaledVector(n, -1.4 * vn); b.w.add(new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4))); if (vn < -3) sfx('thud', 0.5); }
      }
    }
    // thrown off the pedestal: it vanishes and goes back to the list
    if (horiz > PEDESTAL_R + 0.1 && b.pos.y - b.r < -0.2) { poof(b.pos); returnToPanel(b, true); continue; }
    if (b.pos.y < -8 || horiz > 16) { returnToPanel(b, true); continue; }
  }
  // part vs part
  for (let i = 0; i < INV.bodies.length; i++) for (let j = i + 1; j < INV.bodies.length; j++) {
    const a = INV.bodies[i], c = INV.bodies[j];
    if (a.state === 'snap' || c.state === 'snap') continue;
    const d = a.pos.distanceTo(c.pos), rr = a.r + c.r;
    if (d < rr && d > 1e-4) {
      const n = c.pos.clone().sub(a.pos).divideScalar(d), push = (rr - d) / 2;
      if (a.state !== 'drag') a.pos.addScaledVector(n, -push);
      if (c.state !== 'drag') c.pos.addScaledVector(n, push);
      const rv = c.vel.clone().sub(a.vel).dot(n);
      if (rv < 0) { if (a.state !== 'drag') a.vel.addScaledVector(n, rv * 0.7); if (c.state !== 'drag') c.vel.addScaledVector(n, -rv * 0.7); }
    }
  }
  for (const b of INV.bodies) if (b.state !== 'snap') { b.obj.position.copy(b.pos); b.obj.quaternion.copy(b.q); }
}

/* ---------- snapping ---------- */
/* An orb's targets: every mounted part that can still go up a level (the orb is used where it lands, only if the upgrade succeeds) */
function orbTargets(item) {
  const out = [];
  for (const sk of previewModel.userData.sockets) {
    const cur = refGet(sk.ref);
    if (!cur || cur === item || !upgradeCheck(cur).ok) continue;
    const p = new THREE.Vector3(); sk.anchor.getWorldPosition(p);
    out.push({ ref: sk.ref, anchor: sk.anchor, combine: false, orb: true, pos: p, out: sk.anchor.userData.out.clone() });
  }
  return out;
}
function snapTargets(item) {
  if (item.kind === 'orb') return orbTargets(item);
  const out = [];
  for (const sk of previewModel.userData.sockets) {
    const cur = refGet(sk.ref);
    let combine = false;
    if (!cur && refAccepts(sk.ref, item)) combine = false;
    else if (cur && canCombine(cur, item)) combine = true;
    else continue;
    const p = new THREE.Vector3(); sk.anchor.getWorldPosition(p);
    out.push({ ref: sk.ref, anchor: sk.anchor, combine, pos: p, out: sk.anchor.userData.out.clone() });
  }
  return out;
}
/* Snap to the compatible socket closest to the cursor on screen (depth doesn't matter). */
function nearestTarget(b) {
  const d = INV.drag; if (!d) return null;
  const r = canvas.getBoundingClientRect(), v = new THREE.Vector3();
  const reach = 90 * Math.max(0.75, innerHeight / 800);   // pixels
  let best = null, bd = reach;
  for (const t of snapTargets(b.item)) {
    v.copy(t.pos).project(bcam);
    if (v.z > 1) continue;
    const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
    const dd = Math.hypot(sx - d.x, sy - d.y);
    if (dd < bd) { bd = dd; best = t; }
  }
  return best;
}
function showHalos(item) {
  for (const sk of previewModel.userData.sockets) if (sk.anchor.userData.halo) sk.anchor.userData.halo.visible = false;
  // an orb in hand also lights up the stored parts it could upgrade
  $$('#partList [data-store]').forEach(r => { const it = item && item.kind === 'orb' ? L.store[+r.dataset.store] : null; r.classList.toggle('orbok', !!(it && upgradeCheck(it).ok)); });
  if (!item) return;
  for (const t of snapTargets(item)) if (t.anchor.userData.halo) t.anchor.userData.halo.visible = true;
}
function beginSnap(b, t) {
  b.state = 'snap'; b.target = t; b.snapT = 0;
  if (!b.out.equals(t.out)) setBodyModel(b, t.out);
  // pose that puts the ball in the hole (the bench robot is never rotated, so the part ends upright)
  b.endPos = t.pos.clone().add(b.center);
  b.prePos = b.endPos.clone().addScaledVector(t.out, 0.45);
  b.startPos = b.pos.clone(); b.startQ = b.q.clone();
}
const easeOutBack = x => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function stepSnap(b, dt) {
  b.snapT += dt;
  const A = 0.1, Bd = 0.12;
  if (b.snapT < A) {
    const k = b.snapT / A, e = k * k * (3 - 2 * k);
    b.pos.lerpVectors(b.startPos, b.prePos, e);
    b.q.copy(b.startQ).slerp(QID, e);
  } else {
    const k = Math.min(1, (b.snapT - A) / Bd);
    b.pos.lerpVectors(b.prePos, b.endPos, easeOutBack(k));   // press in, overshoot, settle
    b.q.identity();
    if (k >= 1) { commitSnap(b); return; }
  }
  b.obj.position.copy(b.pos); b.obj.quaternion.copy(b.q);
}
function orbDone(target, r, pos) {
  say(`${itemName(target)} ▲ Lv ${r.to}`); sfx('combine'); sfx('levelup', 0.4);
  if (S.inRun && stats) partLeveled(target);
  if (pos) snapBurst(pos, UP);
  changed();
}
function commitSnap(b) {
  const t = b.target, it = b.item;
  removeBody(b);
  const cur = refGet(t.ref);
  if (it.kind === 'orb') {      // consumed only when the upgrade really happens
    const r = cur ? useOrb(it, cur) : { ok: false };
    if (r.ok) orbDone(cur, r, t.pos); else { storePut(it); say('That can’t be upgraded', true); sfx('deny'); renderBench(); }
    return;
  }
  if (t.combine && cur && canCombine(cur, it)) {
    const left = combineInto(cur, it);
    say(cur.kind === 'gem' ? `${itemName(cur)} ${cur.lvl >= GEM_MAX ? '· MAX' : '▲'}` : `${itemName(cur)} ▲ Lv ${cur.lvl}`);
    if (S.inRun && stats) partLeveled(cur);
    if (left) spawnBody(left, t.pos.clone().addScaledVector(t.out, 0.8), t.out.clone().multiplyScalar(3));
    sfx('combine');
  } else if (!cur && refAccepts(t.ref, it)) {
    refSet(t.ref, it);
    if (it.kind === 'block') {
      // the face pointing back at the socket becomes the plug; anything mounted there pops off
      it.plug = OPPOSITE[faceOfDir(t.out)];
      const open = blockOpenFaces(it);
      it.slots.forEach((c, i) => { if (c && !open[i]) { it.slots[i] = null; spawnBody(c, t.pos.clone().addScaledVector(t.out, 1.2).add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(rand(-2, 2), 3, rand(-2, 2))); } });
    }
    sfx('snap');
  } else {
    spawnBody(it, t.pos.clone().addScaledVector(t.out, 0.8), t.out.clone().multiplyScalar(3)); sfx('deny'); return;
  }
  INV.wobble = 1;
  snapBurst(t.pos, t.out);
  changed();
}
function poof(p) {
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(geoBox, B(0x8b9ba5)); const s = rand(0.08, 0.16); m.scale.setScalar(s); m.position.copy(p);
    buildScene.add(m); bfx.push({ m, v: new THREE.Vector3(rand(-2, 2), rand(0.5, 2.5), rand(-2, 2)), life: rand(0.25, 0.4), s });
  }
}
function snapBurst(p, n) {
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(geoBox, B(i % 3 ? ORANGE : 0xffd0a0)); const s = rand(0.04, 0.09); m.scale.setScalar(s); m.position.copy(p);
    const v = n.clone().multiplyScalar(rand(1.5, 3.5)).add(new THREE.Vector3(rand(-2, 2), rand(-1, 2.5), rand(-2, 2)));
    buildScene.add(m); bfx.push({ m, v, life: rand(0.3, 0.5), s });
  }
  const ring = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.copy(p).addScaledVector(n, 0.03); ring.quaternion.setFromUnitVectors(UP, n);
  buildScene.add(ring); bfx.push({ m: ring, ring: true, life: 0.25, max: 0.25 });
}
function stepBfx(dt) {
  for (const f of bfx) {
    f.life -= dt;
    if (f.ring) { const k = 1 - f.life / f.max; f.m.scale.setScalar(0.2 + k * 0.6); f.m.material.opacity = 0.9 * (1 - k); }
    else { f.v.y -= 9 * dt; f.m.position.addScaledVector(f.v, dt); f.m.scale.setScalar(f.s * Math.max(0, f.life * 3)); }
  }
  for (let i = bfx.length - 1; i >= 0; i--) if (bfx[i].life <= 0) { buildScene.remove(bfx[i].m); if (bfx[i].ring) bfx[i].m.material.dispose(); bfx.splice(i, 1); }
}

/* ---------- pointer interaction (mouse and the gamepad cursor) ---------- */
function screenRay(x, y) {
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera({ x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 }, bcam);
  return raycaster.ray;
}
function pointOnDragPlane(x, y, through) {
  const ray = screenRay(x, y);
  const n = bcam.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
  const p = new THREE.Vector3();
  return ray.intersectPlane(plane, p) ? p : through.clone();
}
function pickAt(x, y) {
  screenRay(x, y);
  const loose = raycaster.intersectObjects(INV.bodies.filter(b => b.state === 'loose').map(b => b.obj), true)[0];
  const mounted = raycaster.intersectObjects(previewModel.userData.parts, true)[0];
  const findBody = o => INV.bodies.find(b => { let p = o; while (p) { if (p === b.obj) return true; p = p.parent; } return false; });
  const findSlot = o => { let p = o; while (p) { if (p.userData && p.userData.ref) return p; p = p.parent; } return null; };
  if (loose && (!mounted || loose.distance <= mounted.distance)) return { body: findBody(loose.object) };
  if (mounted) return { part: findSlot(mounted.object) };
  return null;
}
function startDrag(b, x, y) {
  setTip(null);
  b.state = 'drag';
  INV.drag = { body: b, plane: b.pos.clone(), cand: null, x, y };
  showHalos(b.item);
  sfx('grab');
}
function benchDown(x, y, button) {
  ensureAudio();
  if (button === 2) {
    // right-click a part (on the frame, loose, or in storage) to toggle auto-upgrade; right-drag still turns the view
    const el2 = document.elementFromPoint(x, y), row = el2 && el2.closest && el2.closest('[data-store]');
    let it = row ? L.store[+row.dataset.store] : null;
    if (!it && !overPanel(x, y)) { const h = pickAt(x, y); it = h && h.body ? h.body.item : h && h.part ? refGet(h.part.userData.ref) : null; }
    INV.rclick = it ? { it, x, y } : null;
    INV.orbit = { x, y }; return;
  }
  const el = document.elementFromPoint(x, y);
  const sh = el && el.closest && el.closest('[data-shelf]');
  const cat = el && el.closest && el.closest('[data-cat]');
  if (cat) {
    const [k, t] = cat.dataset.cat.split(':');
    if (INV.hangar && hangarLeft(k) <= 0) { say(`Hangar limit: ${HANGAR_RULES[k].max} ${CAT_LABEL[k].toLowerCase()}`, true); sfx('deny'); return; }
    startDrag(spawnBody(mkItem(k, t), pointOnDragPlane(x, y, BENCH_TARGET)), x, y);
    return;
  }
  const st = el && el.closest && el.closest('[data-store]');
  if (sh) {
    const it = INV.shelf.splice(+sh.dataset.shelf, 1)[0];       // it leaves the list
    renderBench();
    if (it) startDrag(spawnBody(it, pointOnDragPlane(x, y, BENCH_TARGET)), x, y);
    return;
  }
  if (st) {
    const i = +st.dataset.store, it = L.store[i];
    if (!it) return;
    L.store.splice(i, 1); renderBench();
    startDrag(spawnBody(it, pointOnDragPlane(x, y, BENCH_TARGET)), x, y);
    return;
  }
  if (overPanel(x, y)) return;
  const hit = pickAt(x, y);
  if (hit && hit.body) { startDrag(hit.body, x, y); return; }
  if (hit && hit.part) { INV.press = { part: hit.part, x, y }; return; }   // click = rotate, drag = pull off
  INV.orbit = { x, y };
}
/* Pull a mounted part off, with everything plugged into it */
function pullOff(part, x, y) {
  {
    const ref = part.userData.ref, out = part.userData.out.clone();
    const it = refGet(ref);
    const wp = new THREE.Vector3(); part.getWorldPosition(wp);
    refSet(ref, null);
    // the lower half comes off on its own: the torso (and everything on it) is set down beside it, nothing is lost
    if (ref.key === 'body' && it.kind === 'lower') {
      const ti = FACE_ORDER.indexOf('top'), torso = it.slots[ti];
      if (torso) {
        it.slots[ti] = null;
        const tb = spawnBody(torso, wp.clone().add(new THREE.Vector3(1.6, 1.2, 0.4)), new THREE.Vector3(2.5, 3, 0));
        tb.state = 'loose';
      }
    }
    changed();
    const b = spawnBody(it, new THREE.Vector3(), null, out);
    b.pos.copy(wp).add(b.center).addScaledVector(out, 0.15);
    b.vel.copy(out).multiplyScalar(4);
    b.obj.position.copy(b.pos);
    sfx('pop');
    startDrag(b, x, y);
  }
}
const ROT_NAMES = ['its starting direction', '90°', '180°', '270°'];
function rotatePart(part) {
  const it = refGet(part.userData.ref);
  if (!it) return;
  if (!ROTATABLE.includes(it.kind)) { say(it.kind === 'leg' ? 'Legs can’t turn' : 'Blocks can’t turn'); sfx('deny'); return; }
  it.rot = ((it.rot || 0) + 1) % 4;
  say(`${itemName(it)} → ${ROT_NAMES[it.rot]}`);
  sfx('tick'); INV.wobble = 0.5;
  changed();
}
function benchMove(x, y, dx, dy) {
  INV.cursor.x = x; INV.cursor.y = y;
  if (INV.press && Math.hypot(x - INV.press.x, y - INV.press.y) > 7) { const p = INV.press.part; INV.press = null; pullOff(p, x, y); return; }
  if (INV.orbit) { INV.yaw -= dx * 0.008; INV.pitch = clamp(INV.pitch + dy * 0.006, -0.25, 1.1); return; }
  if (INV.drag) { INV.drag.x = x; INV.drag.y = y; }
}
function endDrag(x, y, putAway) {
  const d = INV.drag; if (!d) return;
  INV.drag = null;
  const b = d.body;
  showHalos(null);
  if (dashLine) dashLine.visible = false;
  $('#partsPanel').classList.remove('drop'); $('#scrapZone').classList.remove('hot');
  if (overScrap(x, y) && !INV.hangar && !putAway) { scrapBody(b); return; }
  if (b.item.kind === 'orb' && !putAway) {
    const el = document.elementFromPoint(x, y), row = el && el.closest && el.closest('[data-store]'), tgt = row ? L.store[+row.dataset.store] : null;
    if (tgt && upgradeCheck(tgt).ok) { const r = useOrb(b.item, tgt); if (r.ok) { removeBody(b); orbDone(tgt, r); return; } }
  }
  if (putAway || overPanel(x, y)) { returnToPanel(b, false); return; }
  if (d.cand) { beginSnap(b, d.cand); return; }
  b.state = 'loose';
  b.w.set(b.vel.z, rand(-2, 2), -b.vel.x).multiplyScalar(0.6);   // a little spin in the throw direction
}
function benchUp(x, y) {
  if (INV.press) { const p = INV.press.part; INV.press = null; rotatePart(p); return; }
  if (INV.orbit) {
    INV.orbit = null;
    const rc = INV.rclick; INV.rclick = null;
    if (rc && Math.hypot(x - rc.x, y - rc.y) < 6) {
      if (canAutoUp(rc.it)) { toggleAutoUp(rc.it); say(`AUTO ${rc.it.autoUp ? 'on' : 'off'} · ${itemName(rc.it)}`); renderBench(); }
      else { sfx('deny'); say(`Can’t upgrade`, true); }
    }
    return;
  }
  endDrag(x, y, false);
}
function returnToPanel(b, fell) {
  // the first time a dropped gem bounces off the bench and comes back: whoopsies
  if (fell && b.item.kind === 'gem' && !INV.whoopsed) { INV.whoopsed = true; setTimeout(() => sfx('whoops', 0.8), 60); }
  if (INV.hangar) { if (!CFG.unlimitedParts) INV.shelf.push(b.item); removeBody(b); renderBench(); if (!fell) sfx('pop'); return; }
  removeBody(b); storePut(b.item);
  renderBench(); sfx('pop');
}
/* recycling: the bolts burst out of the bin and stream into the robot on the stand */
function flyBolts(n) {
  const from = $('#scrapZone').getBoundingClientRect(), fx = from.left + from.width * 0.25, fy = from.top + from.height / 2;
  const c = new THREE.Vector3(0, 2.2, 0); if (previewModel) { const bb = new THREE.Box3().setFromObject(previewModel); bb.getCenter(c); }
  c.project(bcam);
  const r = canvas.getBoundingClientRect(), tx = r.left + (c.x + 1) / 2 * r.width, ty = r.top + (1 - c.y) / 2 * r.height;
  const count = Math.min(24, 4 + n * 2);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div'); el.className = 'flybolt'; document.body.appendChild(el);
    const sx = fx + rand(-20, 20), sy = fy + rand(-8, 8), up = rand(60, 140), side = rand(-90, 90), d = 520 + rand(0, 260), delay = i * 28;
    const mx = (sx + tx) / 2 + side, my = Math.min(sy, ty) - up;
    el.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.4) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${sx + side * 0.3}px,${sy - up * 0.6}px) scale(1.15) rotate(120deg)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mx}px,${my}px) scale(1) rotate(260deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx + rand(-14, 14)}px,${ty + rand(-14, 14)}px) scale(.5) rotate(400deg)`, opacity: 0.9 },
    ], { duration: d, delay, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'forwards' }).onfinish = () => { el.remove(); sfx('coin', 0.25); };
  }
}
function scrapBody(b) {
  const v = scrapValue(b.item);
  removeBody(b); S.bolts = (S.bolts || 0) + v; sfx('scrap'); sfx('coin', 0.6); flyBolts(v);
  say(`Recycled · +${v} bolts`);
}

function stepDrag(dt) {
  const d = INV.drag; if (!d) return;
  const b = d.body;
  const target = pointOnDragPlane(d.x, d.y, d.plane);
  const cand = nearestTarget(b);
  const same = (a, c) => a && c && a.anchor === c.anchor;
  if (!same(cand, d.cand)) {
    if (cand) { sfx('tick'); if (!b.out.equals(cand.out)) setBodyModel(b, cand.out); if (cand.orb) { const cur = refGet(cand.ref), pv = cur && orbPreview(cur); if (pv) say(pv); } }
    d.cand = cand;
  }
  if (d.cand) target.lerp(d.cand.pos.clone().add(b.center).addScaledVector(d.cand.out, 0.35), 0.6);   // magnet
  // spring toward the cursor: a little lag and swing
  const k = 220, c = 24;
  b.vel.addScaledVector(target.sub(b.pos), k * dt).addScaledVector(b.vel, -c * dt);
  b.pos.addScaledVector(b.vel, dt);
  const floorY = Math.hypot(b.pos.x, b.pos.z) < PEDESTAL_R ? 0 : -0.4;
  if (b.pos.y - b.r < floorY) b.pos.y = floorY + b.r;
  // tilt in the direction of travel, like something dangling from your fingers
  const sp = b.vel.length();
  const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x);
  const tilt = axis.lengthSq() > 1e-6 ? new THREE.Quaternion().setFromAxisAngle(axis.normalize(), Math.min(0.7, sp * 0.05)) : new THREE.Quaternion();
  b.q.slerp(tilt, Math.min(1, dt * 12));
  b.obj.position.copy(b.pos); b.obj.quaternion.copy(b.q);
  if (!dashLine) {
    dashLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: ORANGE, dashSize: 0.08, gapSize: 0.06 }));
    buildScene.add(dashLine);
  }
  if (d.cand) { dashLine.geometry.setFromPoints([ballWorld(b), d.cand.pos]); dashLine.computeLineDistances(); dashLine.visible = true; }
  else dashLine.visible = false;
  $('#partsPanel').classList.toggle('drop', overPanel(d.x, d.y) && !overScrap(d.x, d.y));
  $('#scrapZone').classList.toggle('hot', overScrap(d.x, d.y));
}

const benchActive = () => S.mode === 'hangar' || S.mode === 'inv';
canvas.addEventListener('pointerdown', e => { if (!benchActive()) return; IN.device = 'kbm'; benchDown(e.clientX, e.clientY, e.button); });
$('#partsPanel').addEventListener('pointerdown', e => {
  if (!benchActive() || e.target.closest('button')) return;
  IN.device = 'kbm'; e.preventDefault(); benchDown(e.clientX, e.clientY, e.button);
});
addEventListener('pointermove', e => { if (benchActive()) benchMove(e.clientX, e.clientY, e.movementX, e.movementY); });
addEventListener('pointerup', e => { if (benchActive()) benchUp(e.clientX, e.clientY); });
canvas.addEventListener('wheel', e => { if (benchActive()) INV.dist = clamp(INV.dist * (1 + Math.sign(e.deltaY) * 0.1), 4.5, 13); }, { passive: true });
$('#chassisRows').addEventListener('click', e => { const c = e.target.closest('[data-cycle]'); if (c) cycleChassis(c.dataset.cycle, 1); });
$('#invDoneBtn').addEventListener('click', closeInventory);
// only before the first drop: leave the build bay for the title screen
$('#invMenuBtn').addEventListener('click', () => {
  if (!INV.hangar) return;
  if (INV.drag) endDrag(INV.cursor.x, INV.cursor.y, true);
  setTip(null); $('#inv').hidden = true; sfx('pop2', 0.4);
  openTitle();
});

/* Gamepad: left stick moves a cursor, hold A to grab and release to drop, right stick turns the view,
   B puts a held part away (or closes), Start / View closes. */
function benchPad(dt, pressed, released) {
  const c = INV.cursor;
  const ax = gp.axes[0], ay = gp.axes[1];
  if (ax || ay || pressed(0)) c.shown = true;
  c.x = clamp(c.x + ax * 900 * dt, 0, innerWidth); c.y = clamp(c.y + ay * 900 * dt, 0, innerHeight);
  if (ax || ay) { benchMove(c.x, c.y, 0, 0); updateHover(c.x, c.y); }
  INV.yaw -= gp.axes[2] * 2.2 * dt; INV.pitch = clamp(INV.pitch + gp.axes[3] * 1.5 * dt, -0.25, 1.1);
  if (pressed(0)) {
    const el = document.elementFromPoint(c.x, c.y);
    const btn = el && el.closest && el.closest('button');
    if (btn) btn.click(); else benchDown(c.x, c.y, 0);
  }
  if (released(0)) benchUp(c.x, c.y);
  if (pressed(1)) invBack();
  if (pressed(8) || pressed(9) || pressed(3)) closeInventory();
  const vc = $('#vcursor');
  vc.hidden = !(c.shown && IN.device === 'pad');
  vc.style.transform = `translate(${c.x}px, ${c.y}px)`;
}

/* ---------- per frame ---------- */
function updateBenchCamera() {
  bcam.aspect = innerWidth / innerHeight;
  if (innerWidth > 900) bcam.setViewOffset(innerWidth, innerHeight, innerWidth * 0.14, 0, innerWidth, innerHeight); else bcam.clearViewOffset();
  const cp = Math.cos(INV.pitch);
  bcam.position.set(BENCH_TARGET.x + Math.sin(INV.yaw) * cp * INV.dist, BENCH_TARGET.y + Math.sin(INV.pitch) * INV.dist, BENCH_TARGET.z + Math.cos(INV.yaw) * cp * INV.dist);
  bcam.lookAt(BENCH_TARGET);
  bcam.updateProjectionMatrix();
  bcam.updateMatrixWorld();
}
function renderPreview(dt) {
  if (typeof previewModel !== 'undefined') cosmeticTick(previewModel, dt);
  updateBenchCamera();
  // fixed small steps keep the springs and bounces stable at any frame rate
  const n = Math.min(12, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) { stepDrag(dt / n); stepBodies(dt / n); }
  stepBfx(dt);
  // the robot shivers a little when a part clicks in
  INV.wobble = Math.max(0, INV.wobble - dt * 4);
  const s = 1 + Math.sin(performance.now() / 22) * 0.025 * INV.wobble;
  previewModel.scale.set(s, 1 + (1 - s) * 0.6, s);
  // pulse the sockets a held part can go into
  const t = performance.now() / 1000;
  for (const sk of previewModel.userData.sockets) {
    const a = sk.anchor, h = a.userData.halo;
    if (!h || !h.visible) continue;
    const hot = INV.drag && INV.drag.cand && INV.drag.cand.anchor === a;
    h.material.opacity = hot ? 1 : 0.45 + 0.35 * Math.sin(t * 7);
    h.scale.setScalar(a.userData.r * (hot ? 1.3 : 1));
  }
  if (INV.msgT > 0) { INV.msgT -= dt; if (INV.msgT <= 0) $('#toast').hidden = true; }
  renderFrame(buildScene, bcam);
  renderTip();
}

/* ---------- sound (synthesised, no files) ---------- */
let actx = null;
/* the roulette whirr: a buzzy rattle whose pitch and flutter wind down with the spin */
function twirlSound(dur, vol = 1) {
  if (!actx) return;
  try {
    const t = actx.currentTime, out = actx.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.16 * vol, t + 0.06);
    out.gain.setValueAtTime(0.16 * vol, t + dur * 0.75); out.gain.linearRampToValueAtTime(0, t + dur);
    out.connect(actx.destination);
    const o = actx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(130, t + dur);
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const trem = actx.createGain(); trem.gain.value = 0.55;
    const lfo = actx.createOscillator(), lg = actx.createGain(); lg.gain.value = 0.45;
    lfo.frequency.setValueAtTime(30, t); lfo.frequency.exponentialRampToValueAtTime(3.5, t + dur);
    lfo.connect(lg); lg.connect(trem.gain);
    o.connect(f); f.connect(trem); trem.connect(out);
    // and a soft airy whoosh underneath
    const n = actx.createBufferSource(), buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * dur), actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf; const nf = actx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.2;
    nf.frequency.setValueAtTime(3000, t); nf.frequency.exponentialRampToValueAtTime(900, t + dur);
    const ng = actx.createGain(); ng.gain.value = 0.35; n.connect(nf); nf.connect(ng); ng.connect(trem);
    o.start(t); lfo.start(t); n.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  } catch (e) {}
}
/* a burst of sparks flying out of a spot on screen (where a roulette lands) */
function sparkBurst(el, color = '#ffd27a', n = 26) {
  if (!el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const fl = document.createElement('div'); fl.className = 'spkflash'; fl.style.cssText = `left:${cx}px;top:${cy}px;--c:${color}`; document.body.appendChild(fl);
  fl.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => fl.remove();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div'); s.className = 'spk'; s.style.cssText = `left:${cx}px;top:${cy}px;--c:${i % 3 ? color : '#fff6d0'}`;
    document.body.appendChild(s);
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * Math.max(90, r.width * 0.7), dx = Math.cos(a) * d, dy = Math.sin(a) * d, deg = a * 180 / Math.PI;
    s.animate([
      { transform: `translate(-50%,-50%) rotate(${deg}deg) scaleX(1.6)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) rotate(${deg}deg) scaleX(1.2)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 40}px)) rotate(${deg + 40}deg) scaleX(.3)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 380, easing: 'cubic-bezier(.15,.8,.4,1)' }).onfinish = () => s.remove();
  }
}
function ensureAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
const sfxGap = { tink: 0.04, squeak: 0.035, hurt: 0.09,  flame: 0.07, roar: 0.1, slash: 0.05, swish: 0.08, zap: 0.06, slot: 0.05, reload: 0.08, reloaded: 0.08, jet: 0.07, autogun: 0.055, step: 0.07, hit: 0.045, kill: 0.04, xp: 0.03, coin: 0.04, pistol: 0.03, shotgun: 0.05 };
const sfxLast = {};
const GUN_LAYERS = { pistol: { crack: 0.8, thump: 0.5 }, autogun: { crack: 0.6, thump: 0.35 }, shotgun: { crack: 1, thump: 1.1 }, sniper: { crack: 1.2, thump: 1.2 }, rocket: { crack: 0.5, thump: 0.9 }, zap: { crack: 0.5, thump: 0.25 } };
const TAILS = { boom: 1, shotgun: 0.45, sniper: 0.6, rocket: 0.5, nukefall: 0.4 };
function sfx(kind, vol = 1) {
  if (!actx) return;
  const now = actx.currentTime;
  if (sfxGap[kind] && now - (sfxLast[kind] || 0) < sfxGap[kind]) return;
  sfxLast[kind] = now;
  try {
    const t = actx.currentTime, out = actx.createGain(); out.gain.value = 0.35 * vol; out.connect(actx.destination);
    // guns: every shot is pitched a touch differently so automatic fire doesn't sound like one sample on repeat
    const gun = GUN_LAYERS[kind], pv = (gun ? 1 + (Math.random() - 0.5) * 0.12 : 1) * (typeof SFX_PITCH === 'number' ? SFX_PITCH : 1);
    // big bangs ring off the arena walls: a couple of darker, later echoes
    const tail = TAILS[kind];
    if (tail) {
      for (const [dl, g] of [[0.16, 0.34 * tail], [0.29, 0.22 * tail], [0.47, 0.12 * tail]]) {
        const d = actx.createDelay(1), lp = actx.createBiquadFilter(), eg = actx.createGain();
        d.delayTime.value = dl * (0.9 + Math.random() * 0.2); lp.type = 'lowpass'; lp.frequency.value = 1100 - dl * 1200; eg.gain.value = g;
        out.connect(d); d.connect(lp); lp.connect(eg); eg.connect(actx.destination);
      }
    }
    const tone = (f0, f1, dur, type = 'sine', g = 1, at = 0) => {
      const o = actx.createOscillator(), e = actx.createGain();
      f0 *= pv; f1 *= pv;
      o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      e.gain.setValueAtTime(g, t + at); e.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(e); e.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    const noise = (dur, g, hp, at = 0) => {
      const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * dur), actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const s = actx.createBufferSource(), f = actx.createBiquadFilter(), e = actx.createGain();
      s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; e.gain.value = g;
      s.connect(f); f.connect(e); e.connect(out); s.start(t + at);
    };
    // layered gunshot: a sharp crack on top and a low thump under the gun's own sound
    if (gun) { noise(0.012, 1.1 * gun.crack, 5200); tone(110, 42, 0.07 + 0.06 * gun.thump, 'sine', 0.9 * gun.thump); if (gun.thump > 0.8) noise(0.08, 0.5 * gun.thump, 120, 0.005); }
    if (kind === 'pump') { noise(0.03, 0.9, 1800); tone(220, 160, 0.06, 'square', 0.25); }
    if (kind === 'pump2') { noise(0.035, 1, 2200); tone(300, 200, 0.05, 'square', 0.25); tone(90, 60, 0.06, 'sine', 0.4); }
    if (kind === 'bolt') { noise(0.03, 0.8, 2500); tone(500, 380, 0.05, 'square', 0.2); noise(0.04, 0.7, 1600, 0.12); tone(260, 200, 0.05, 'square', 0.2, 0.12); }
    if (kind === 'hiss') { noise(0.45, 0.35, 4500); }
    if (kind === 'whistle') { tone(900, 2200, 0.7, 'sine', 0.12); tone(905, 2210, 0.7, 'triangle', 0.05); }
    if (kind === 'fwoomp') { noise(0.3, 1.2, 200); tone(90, 160, 0.25, 'sine', 0.6); }
    if (kind === 'thoom') { tone(70, 30, 0.9, 'sine', 1.3); noise(0.5, 0.8, 60); tone(140, 50, 0.4, 'sawtooth', 0.2); }
    if (kind === 'snapZ') { noise(0.03, 0.9, 4000); tone(2400, 900, 0.05, 'square', 0.15); }
    if (kind === 'hitL') { tone(1500, 1100, 0.04, 'triangle', 0.25); noise(0.015, 0.4, 3000); }
    if (kind === 'hitH') { tone(240, 90, 0.1, 'sine', 0.6); noise(0.05, 0.8, 900); tone(1200, 700, 0.06, 'triangle', 0.2); }
    if (kind === 'bonk') { const p = 0.85 + Math.random() * 0.35; tone(820 * p, 560 * p, 0.12, 'square', 0.22); tone(2100 * p, 1700 * p, 0.08, 'triangle', 0.25); tone(260 * p, 140 * p, 0.16, 'sine', 0.7); noise(0.025, 0.6, 2200); }
    if (kind === 'tink') { tone(3100, 2900, 0.09, 'triangle', 0.5); tone(4700, 4500, 0.06, 'sine', 0.3, 0.008); tone(6200, 6000, 0.04, 'sine', 0.15, 0.02); }
    if (kind === 'snap') { noise(0.035, 1.2, 2500); tone(180, 55, 0.12, 'sine', 0.9); noise(0.02, 0.6, 4000, 0.045); }
    if (kind === 'combine') { noise(0.04, 1, 2500); tone(300, 600, 0.12, 'triangle', 0.6); tone(450, 900, 0.16, 'triangle', 0.5, 0.08); }
    if (kind === 'pop') tone(260, 620, 0.07, 'sine', 0.6);
    if (kind === 'grab') tone(900, 700, 0.03, 'square', 0.12);
    if (kind === 'tick') tone(1400, 1300, 0.02, 'square', 0.1);
    if (kind === 'deny') tone(140, 110, 0.18, 'square', 0.25);
    if (kind === 'thud') { tone(110, 50, 0.1, 'sine', 0.7); noise(0.03, 0.3, 800); }
    if (kind === 'pistol') { noise(0.06, 0.9, 1800); tone(420, 140, 0.08, 'square', 0.35); }
    if (kind === 'shotgun') { noise(0.22, 1.4, 300); tone(140, 40, 0.2, 'sine', 0.9); noise(0.05, 0.6, 3000, 0.03); }
    if (kind === 'autogun') { noise(0.035, 0.6, 2400); tone(320, 180, 0.04, 'square', 0.2); }
    if (kind === 'hit') tone(1600, 1100, 0.03, 'triangle', 0.4);
    if (kind === 'kill') { noise(0.08, 0.7, 900); tone(240, 90, 0.09, 'triangle', 0.4); }
    if (kind === 'xp') tone(1200 + Math.random() * 300, 1800, 0.05, 'sine', 0.25);
    if (kind === 'coin') { tone(1800, 1800, 0.05, 'square', 0.15); tone(2400, 2400, 0.08, 'square', 0.12, 0.05); }
    if (kind === 'loot') { tone(520, 780, 0.14, 'triangle', 0.5); tone(780, 1170, 0.18, 'triangle', 0.45, 0.1); tone(1040, 1560, 0.3, 'triangle', 0.4, 0.2); }
    if (kind === 'levelup') { tone(440, 440, 0.12, 'triangle', 0.4); tone(660, 660, 0.12, 'triangle', 0.4, 0.1); tone(880, 880, 0.25, 'triangle', 0.4, 0.2); }
    if (kind === 'step') tone(90, 50, 0.06, 'sine', 0.5);
    if (kind === 'whoops') { tone(720, 300, 0.22, 'triangle', 0.6); tone(420, 640, 0.14, 'triangle', 0.5, 0.24); tone(640, 560, 0.1, 'sine', 0.3, 0.38); }
    if (kind === 'hurt') { tone(320, 120, 0.16, 'square', 0.35); noise(0.08, 0.5, 900); tone(90, 50, 0.18, 'sine', 0.8); }            // a dull clank + buzz
    if (kind === 'squeak') { const f = 900 + Math.random() * 500; tone(f, f * 1.9, 0.06, 'triangle', 0.5); tone(f * 1.9, f * 1.4, 0.05, 'sine', 0.3, 0.05); }
    if (kind === 'nukefall') { tone(2200, 160, 2.3, 'sine', 0.55); tone(2240, 170, 2.3, 'triangle', 0.18); }                      // the long falling 'zoooooo'
    if (kind === 'vacuum') { tone(180, 900, 1.1, 'sine', 0.4); tone(270, 1350, 1.1, 'triangle', 0.15); }
    if (kind === 'fuse') { tone(1800, 1800, 0.05, 'square', 0.25); tone(1800, 1800, 0.05, 'square', 0.25, 0.12); tone(2200, 2200, 0.08, 'square', 0.25, 0.24); }
    if (kind === 'jet') noise(0.12, 0.45, 300);
    if (kind === 'flame') noise(0.09, 0.55, 400);
    if (kind === 'sniper') { noise(0.12, 1.4, 900); tone(200, 50, 0.3, 'sawtooth', 0.5); noise(0.4, 0.4, 3000, 0.08); }
    if (kind === 'beep') tone(880, 880, 0.12, 'square', 0.3);
    if (kind === 'launch') { tone(1320, 1320, 0.25, 'square', 0.3); noise(0.8, 0.9, 80, 0.05); }
    if (kind === 'roar') noise(0.16, 0.9, 60);
    if (kind === 'celebrate') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.45, i * 0.07));
      tone(1568, 2093, 0.4, 'sine', 0.3, 0.38); noise(0.5, 0.25, 5000, 0.35);
      [0.42, 0.5, 0.58, 0.66].forEach(t => tone(2600 + Math.random() * 1200, 2600, 0.05, 'sine', 0.15, t));
    }
    if (kind === 'zap') { noise(0.12, 0.9, 3000); tone(1800, 400, 0.12, 'sawtooth', 0.25); tone(90, 60, 0.1, 'square', 0.2); }
    if (kind === 'rocket') { noise(0.5, 1.1, 150); tone(220, 70, 0.4, 'sawtooth', 0.3); }
    if (kind === 'swish') noise(0.12, 0.5, 1500);
    if (kind === 'sparks') { noise(0.14, 0.9, 700); tone(160, 60, 0.18, 'sine', 0.5); for (let i = 0; i < 11; i++) noise(0.025 + Math.random() * 0.03, 0.25 + Math.random() * 0.5, 2500 + Math.random() * 5000, 0.03 + Math.random() * 0.42); tone(1900, 3400, 0.16, 'triangle', 0.12, 0.02); tone(2600, 4600, 0.22, 'sine', 0.08, 0.07); }
    if (kind === 'peel') { noise(0.16, 0.55, 2400); noise(0.1, 0.35, 5000, 0.06); tone(900, 1700, 0.12, 'sawtooth', 0.04); }
    if (kind === 'slash') { noise(0.06, 0.8, 2500); tone(500, 180, 0.07, 'square', 0.25); }
    if (kind === 'slot') tone(700 + Math.random() * 500, 700, 0.04, 'square', 0.15);
    if (kind === 'jackpot') { [0, 0.08, 0.16, 0.24, 0.32].forEach((t, i) => tone(600 + i * 200, 600 + i * 200, 0.1, 'triangle', 0.4, t)); }
    if (kind === 'reload') { tone(600, 380, 0.05, 'square', 0.25); noise(0.04, 0.4, 2000, 0.06); }
    if (kind === 'reloaded') { noise(0.03, 0.6, 2500); tone(900, 1200, 0.05, 'square', 0.2, 0.03); }
    if (kind === 'boom') { noise(1.1, 1.8, 40); tone(110, 28, 0.9, 'sine', 1.2); noise(0.25, 1, 1400); tone(70, 30, 1.2, 'sawtooth', 0.25, 0.05); }
    if (kind === 'pop2') { noise(0.3, 1, 200); tone(160, 40, 0.25, 'sine', 0.8); }
    if (kind === 'scrap') { noise(0.25, 0.8, 600); tone(200, 60, 0.25, 'sawtooth', 0.2); }
  } catch (e) {}
}

/* ============================================================
   HOVER WINDOW: name, rarity and stats, with a leader line to the part
   ============================================================ */
const TIP = { item: null, obj: null, row: null, key: null };
function tipItemFromRow(row) {
  if (row.dataset.cat) { const [k, t] = row.dataset.cat.split(':'); return mkPreviewItem(k, t); }
  if (row.dataset.store !== undefined) return L.store[+row.dataset.store] || null;
  if (row.dataset.shelf !== undefined) return INV.shelf[+row.dataset.shelf] || null;
  return null;
}
function updateHover(x, y) {
  if (INV.drag || INV.orbit || INV.press) { setTip(null); return; }
  const el = document.elementFromPoint(x, y);
  const row = el && el.closest && el.closest('.prow');
  if (el && el.closest && el.closest('#tip')) { TIP.grace = 0; return; }        // over the window itself: keep it (for its toggle)
  const off = () => { if (!TIP.item) return setTip(null); if (!TIP.grace) TIP.grace = performance.now(); if (performance.now() - TIP.grace > 380) { TIP.grace = 0; setTip(null); } };
  if (row) { TIP.grace = 0; const it = tipItemFromRow(row); setTip(it, null, row); return; }
  if (overPanel(x, y) || (el && el !== canvas)) { off(); return; }
  const hit = pickAt(x, y);
  if (hit && hit.part) { TIP.grace = 0; setTip(hit.part.userData.item, hit.part, null); }
  else if (hit && hit.body) { TIP.grace = 0; setTip(hit.body.item, hit.body.obj, null); }
  else off();
}
/* auto-upgrade: a part marked for it swallows any duplicate you pick up */
const ownedItem = it => it && (allItems().includes(it) || INV.bodies.some(b => b.item === it || childrenOf(b.item).includes(it)));
const canAutoUp = it => it && (upgradeable(it) || it.kind === 'gem') && ownedItem(it);
function toggleAutoUp(it) { if (!canAutoUp(it)) return; it.autoUp = !it.autoUp; sfx('tick'); TIP.key = null; if (TIP.item === it) setTip(it, TIP.obj, TIP.row); }
document.addEventListener('change', e => { if (e.target && e.target.id === 'autoUpChk' && TIP.item) { TIP.item.autoUp = e.target.checked; sfx('tick'); } });
addEventListener('keydown', e => { if (e.code === 'KeyU' && !$('#inv').hidden && TIP.item) toggleAutoUp(TIP.item); });
function setTip(item, obj, row) {
  const key = item ? item.id + ':' + item.lvl + ':' + armGems(item).map(g => g.id).join(',') + ':' + (item.weapon ? item.weapon.id + item.weapon.lvl : '') + (item.weapon2 ? ':' + item.weapon2.id + item.weapon2.lvl : '') + (item.attr || '') : null;
  TIP.obj = obj; TIP.row = row;
  if (key === TIP.key) return;
  TIP.key = key; TIP.item = item;
  if (item) partView($('#tipView'), item);
  const line = $('#tipLine'), tip = $('#tip');
  clearTimeout(TIP.offTimer);
  if (!item) {
    // snap the frame and line off, then hide
    if (tip.hidden) return;
    tip.classList.remove('on'); tip.classList.add('off');
    line.classList.remove('on'); line.classList.add('off');
    TIP.offTimer = setTimeout(() => { if (!TIP.item) { tip.hidden = true; line.setAttribute('hidden', ''); } }, 95);
    return;
  }
  const r = rarityOf(item.lvl || 1), showRar = item.kind !== 'block' || BLOCKS[item.type].upgradable;
  $('#tipName').innerHTML = partIcon(item, 'picon tipicon') + itemName(item) + armGems(item).map(g => ` <span class="tipAttr" style="color:${ATTRS[g.type].color}">✦ ${ATTRS[g.type].name}</span>`).join('');
  $('#tipRar').innerHTML = item.kind === 'orb' ? `<span style="color:${ORB_COLOR}">Upgrade orb</span> · drag onto a part` : item.kind === 'gem' ? `<span style="color:${ATTRS[item.type].color}">Tier ${ROMAN[item.lvl || 1]}</span> of V · ${itemSub(item)}` : showRar ? `<span style="color:${r.css}">${r.name}</span> · Lv ${item.lvl} · ${itemSub(item)}` + xpBarHTML(item) : itemSub(item);
  const cmp = compareTo(item), cmpRows = cmp ? new Map(partInfo(cmp)) : null;
  $('#tipStats').innerHTML = partInfo(item).map(([a, b]) => `<div><span>${a}</span><b>${b}${cmpRows ? statDelta(a, b, cmpRows.get(a)) : ''}</b></div>`).join('')
    + armGems(item).map(g => `<div class="tipDesc" style="color:${ATTRS[g.type].color}">✦ ${item.kind === 'leg' ? LEG_GEM[g.type] : ATTRS[g.type].desc}</div>`).join('')
    + (item.kind === 'arm' && armCombo(item) && COMBOS[armCombo(item)] ? `<div class="tipDesc combo">◆ Combo · <b>${COMBOS[armCombo(item)][0]}</b>: ${COMBOS[armCombo(item)][1]}</div>` : '')
    + (item.kind === 'arm' && armGems(item).length === 1 ? `<div class="tipDesc">+1 gem → combo</div>` : '')
    + (item.kind === 'leg' && misplacedLegs().includes(item) ? `<div class="tipDesc warn">Off the ground · slows you</div>` : '')
    + (item.kind === 'weapon' && WEAPONS[item.type].selfHurtNote !== false && item.type === 'rocket' ? `<div class="tipDesc warn">Blast hurts you</div>` : '')
    + (item.kind === 'weapon' && mountedWeapons().includes(item) && !isHeld(item) ? `<div class="tipDesc caution"><b class="bang">!</b> Bolted on · ${Math.round(FIXED_DMG * 100)}% damage · wrist = full</div>` : '')
    + (canAutoUp(item) ? `<label class="autoup"><input type="checkbox" id="autoUpChk"${item.autoUp ? ' checked' : ''}><span>Auto-upgrade <small>U · RMB</small></span></label>` : '');
  if (item.kind === 'weapon' && mountedWeapons().includes(item) && !isHeld(item)) $('#tipName').innerHTML += ' <b class="bang">!</b>';
  $('#tip').style.setProperty('--rar', showRar ? r.css : '#e6e9ea');
  tip.hidden = false; line.removeAttribute('hidden');   // SVG elements ignore the .hidden property
  // replay the draw-on every time the window shows a new part
  tip.classList.remove('on', 'off'); line.classList.remove('on', 'off');
  void tip.offsetWidth;
  tip.classList.add('on'); line.classList.add('on');
}
const _tb = new THREE.Box3(), _tv = new THREE.Vector3();
function renderTip() {
  if (!TIP.item) return;
  let ax, ay;
  if (TIP.row) {
    if (!document.body.contains(TIP.row)) { setTip(null); return; }
    const r = TIP.row.getBoundingClientRect(); ax = r.left; ay = r.top + r.height / 2;
  } else if (TIP.obj) {
    _tb.setFromObject(TIP.obj); if (_tb.isEmpty()) return;
    _tb.getCenter(_tv).project(bcam);
    if (_tv.z > 1) { setTip(null); return; }
    const c = canvas.getBoundingClientRect(); ax = c.left + (_tv.x + 1) / 2 * c.width; ay = c.top + (1 - _tv.y) / 2 * c.height;
  } else return;
  const tip = $('#tip'), w = tip.offsetWidth * UIZ.z, h = tip.offsetHeight * UIZ.z;
  const panelL = $('#partsPanel').getBoundingClientRect().left;
  let tx, ty, lx;
  if (TIP.row) { tx = panelL - w - 46; ty = ay - h / 2; lx = tx + w; }
  else {
    tx = ax + 110; ty = ay - h - 50;
    if (tx + w > panelL - 12) tx = ax - 110 - w;
    ty = clamp(ty, 12, innerHeight - h - 12);
    lx = tx > ax ? tx : tx + w;
  }
  tx = clamp(tx, 12, innerWidth - w - 12);
  tip.style.transform = `translate(${tx}px, ${ty}px) scale(${UIZ.z})`;
  const ly = clamp(ay, ty + 10, ty + h - 10);
  $('#tipL').setAttribute('x1', ax); $('#tipL').setAttribute('y1', ay); $('#tipL').setAttribute('x2', lx); $('#tipL').setAttribute('y2', TIP.row ? ay : ty + h - 12);
  $('#tipDot').setAttribute('x', ax - 3.5); $('#tipDot').setAttribute('y', ay - 3.5);
}
addEventListener('pointermove', e => { if (benchActive()) updateHover(e.clientX, e.clientY); });

/* ---------- hover compare: a spare part's stats against the one of its kind you have mounted ---------- */
function compareTo(it) {
  if (!it || !L || !L.body) return null;
  const mounted = mountedItems();
  if (mounted.includes(it)) return null;
  return mounted.find(o => o.kind === it.kind && o.type === it.type) || (['arm', 'leg', 'weapon'].includes(it.kind) ? mounted.find(o => o.kind === it.kind) : null) || null;
}
/* ▲ / ▼ beside a number that differs from the mounted part (less weight counts as better) */
function statDelta(label, a, b) {
  if (b === undefined) return '';
  const na = parseFloat(String(a).replace(/^[×+]/, '')), nb = parseFloat(String(b).replace(/^[×+]/, ''));
  if (!isFinite(na) || !isFinite(nb) || Math.abs(na - nb) < 1e-6) return '';
  const up = na > nb, good = label === 'Weight' ? !up : up, d = Math.abs(na - nb);
  return ` <i class="sdelta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'}${+d.toFixed(d < 1 ? 2 : 1)}</i>`;
}
