'use strict';
/* ============================================================
   CATALOG (main menu): every limb, weapon, part, gem, gem combo and enemy in the game.
   Each entry is a dark silhouette with a "?" until you discover it:
     parts, limbs, weapons, gems - the first time you pick one up (or launch with it mounted)
     gem combos                  - the first time you socket that pair of gems into one arm
     enemies                     - the first time you kill one; bosses the first time they show up
   Discoveries are saved with the rest of your progress (META.disc).
   ============================================================ */
META.disc = META.disc || {};
const CAT = { tab: 'limbs', sel: null, thumbs: new Map(), r: null, scene: null, cam: null, sil: null };

const CAT_TABS = [
  ['limbs', 'Limbs'], ['weapons', 'Weapons'], ['parts', 'Parts'], ['gems', 'Gems'], ['combos', 'Combos'], ['powers', 'Power-ups'], ['enemies', 'Enemies'],
];
const ENEMY_NAMES = { crawler: 'Crawler', drone: 'Drone', spitter: 'Spitter', bomber: 'Bomber', splitter: 'Splitter', splitling: 'Splitling', brute: 'Brute', warden: 'The Warden', robovac: 'RoboVac', pig: 'Golden Pig', magnetron: 'Magnetron', smelter: 'Smelter', hivemother: 'Hive Mother', sac: 'Egg Sac' };
const ENEMY_NOTES = {
  crawler: 'The basic swarm. Comes in cube, sphere and dome shapes. Some are elites: bigger, tougher, always worth killing.',
  drone: 'Flies straight at you over any terrain. Crashes and tumbles when shot down.',
  spitter: 'Stops at range and lobs acid at you.',
  bomber: 'Rolls up to you, lights its fuse and blows up, hurting everything nearby.',
  splitter: 'Bursts into a spray of splitlings when it dies.',
  splitling: 'Small, fast and bouncy. Born from splitters.',
  brute: 'A hardened crawler that breaks through now and then. Mini-boss.',
  robovac: 'Not an enemy: a cleaning bot that roams the level hoovering up the mess. Never attacks, never targeted by lock-on. Shoot it for a big xp drop (another one drops in).',
  warden: 'Boss. Grabs a handful of nearby enemies (it glows and rings first), holds them over its head, then hurls the survivors at you in a spread. Hurt it hard while it holds them to interrupt the throw. Also fires volleys and slams.',
  magnetron: 'Boss. A hovering disc with three coil pylons. Blue arcs and a ring warn of its magnetic pull; run, dash, jet away or duck behind terrain to break line of sight, then dodge the shockwave slam.',
  smelter: 'Boss. A slow tracked furnace that lobs slag onto red circles (they leave fire pools for 4 s). Every 12 s it vents: while the vent glows it takes double damage.',
  hivemother: 'Boss. A giant spider with three egg sacs on its back. Each sac pulses, then releases a wave of drones and splitlings. Shoot a sac to stop its spawns.',
  pig: 'Very rare boss. Passive and harmless. Your first hit starts a short escape timer; further hits shake bolts out of it (capped at the price of a weapon case). Then it leaps away. The exit is open from the start.',
  sac: 'A Hive Mother egg sac. Destroy it to stop that sac spawning enemies.',
};

/* every entry: { key, tab, name, kind, type } */
function catEntries() {
  const out = [];
  for (const t of Object.keys(ARMS)) out.push({ key: 'arm:' + t, tab: 'limbs', kind: 'arm', type: t, name: ARMS[t].name });
  if (BUILD_V2) for (const t of Object.keys(LOWERS)) out.push({ key: 'lower:' + t, tab: 'limbs', kind: 'lower', type: t, name: LOWERS[t].name });
  else for (const t of Object.keys(LEGS)) out.push({ key: 'leg:' + t, tab: 'limbs', kind: 'leg', type: t, name: LEGS[t].name });
  for (const t of Object.keys(WEAPONS)) out.push({ key: 'weapon:' + t, tab: 'weapons', kind: 'weapon', type: t, name: WEAPONS[t].name });
  for (const t of Object.keys(BLOCKS)) if (!BUILD_V2 || BLOCKS[t].upper) out.push({ key: 'block:' + t, tab: 'parts', kind: 'block', type: t, name: BLOCKS[t].name });
  if (BUILD_V2) for (const t of Object.keys(ADAPTERS)) out.push({ key: 'adapter:' + t, tab: 'parts', kind: 'adapter', type: t, name: ADAPTERS[t].name });
  for (const t of Object.keys(MODULES)) out.push({ key: 'module:' + t, tab: 'parts', kind: 'module', type: t, name: MODULES[t].name });
  for (const t of ATTR_KEYS) out.push({ key: 'gem:' + t, tab: 'gems', kind: 'gem', type: t, name: GEMS[t].name });
  for (const k of Object.keys(COMBOS)) out.push({ key: 'combo:' + k, tab: 'combos', kind: 'combo', type: k, name: COMBOS[k][0] });
  for (const t of Object.keys(POWER_NAMES)) out.push({ key: 'power:' + t, tab: 'powers', kind: 'power', type: t, name: POWER_NAMES[t] });
  for (const t of Object.keys(ETYPES)) out.push({ key: 'enemy:' + t, tab: 'enemies', kind: 'enemy', type: t, name: ENEMY_NAMES[t] || t });
  return out;
}
const catKnown = key => !!META.disc[key];

/* ---------- discovering things ---------- */
function discover(key, name) {
  if (!key || META.disc[key]) return false;
  META.disc[key] = 1; saveMeta();
  // a small "new in the catalog" note during a run
  if (S.inRun && !$('#hud').hidden && typeof rewardPop === 'function') {
    rewardPop([{ css: '#7fe0ff', icon: sym('stage', ''), text: name || key, sub: 'Catalog' }], 'NEW');
    sfxP('tick', 0.5, 1.4);
  }
  return true;
}
function discoverItem(it) {
  if (!it) return;
  discover(it.kind + ':' + it.type, itemName(it).replace(/ [IV]+$/, ''));
  if (it.kind === 'arm') { for (const g of armGuns(it)) discoverItem(g); discoverCombo(it); }
  for (const g of (it.gems || [])) if (g) discoverItem(g);
}
function discoverCombo(arm) {
  const ck = arm && arm.kind === 'arm' ? armCombo(arm) : null;
  if (ck && COMBOS[ck]) discover('combo:' + ck, COMBOS[ck][0]);
}
/* everything on the frame right now (launching a run, changing the loadout) */
function discoverLoadout() {
  if (!L || !L.body) return;
  for (const it of mountedItems()) { discoverItem(it); if (it.kind === 'arm') discoverCombo(it); }
}
function discoverEnemy(type, elite) { discover('enemy:' + type, ENEMY_NAMES[type] || type); }

/* ---------- thumbnails: each entry rendered once to a little picture (a dark silhouette until discovered) ---------- */
function catRenderer() {
  if (CAT.r) return;
  const cv = document.createElement('canvas');
  CAT.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  CAT.r.setPixelRatio(1); CAT.r.setSize(192, 144, false); CAT.r.setClearColor(0x000000, 0);
  CAT.scene = new THREE.Scene();
  CAT.scene.add(new THREE.HemisphereLight(0xe0ecf2, 0x2a2420, 0.95));
  const k = new THREE.DirectionalLight(0xfff0d8, 1.0); k.position.set(2, 3, 2.5); CAT.scene.add(k);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 0.5); rim.position.set(-3, 1, -2); CAT.scene.add(rim);
  try { CAT.scene.environment = makeEnv(0x2c3136, new THREE.PMREMGenerator(CAT.r)); } catch (e) {}
  CAT.cam = new THREE.PerspectiveCamera(28, 192 / 144, 0.05, 200);
  CAT.sil = new THREE.MeshBasicMaterial({ color: 0x3a434b });
}
const POWER_NOTES = {
  vacuum: 'Every bit of scrap on the field lifts up and drifts in to you.',
  nuke: 'A warhead whistles down and scraps everything that isn\'t a boss.',
  frenzy: '15 seconds where every kill pays out bolts, and bolts rain from the sky.',
  berserk: 'Brief, furious: every weapon fires twice as fast and never reloads. Only turns up when the field is swarming.',
  health: 'Patches up part of your hull.',
  case: 'Dropped by tougher enemies and always by the Warden. Opens into a roulette of parts.',
};
function catObject(e) {
  if (e.kind === 'power') return powerMesh(e.type);
  if (e.kind === 'enemy') {
    const g = makeEnemyMesh(e.type, new THREE.Color(ETYPES[e.type].color), e.type === 'crawler' ? 'dome' : null);
    return g;
  }
  const it = mkItem(e.kind, e.type, 1);
  const out = e.kind === 'block' || e.kind === 'gem' || e.kind === 'lower' ? new THREE.Vector3(0, 1, 0) : e.kind === 'weapon' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  return buildPart(it, out, null);
}
function catThumb(e, known) {
  const id = e.key + (known ? '' : '?');
  if (CAT.thumbs.has(id)) return CAT.thumbs.get(id);
  let url = '';
  try {
    catRenderer();
    const g = catObject(e), holder = new THREE.Group(); holder.add(g);
    holder.rotation.y = e.kind === 'weapon' ? -1.25 : e.kind === 'enemy' ? 0.5 : -0.6; holder.rotation.x = 0.15;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), r = Math.max(0.15, box.getSize(new THREE.Vector3()).length() / 2);
    holder.position.sub(c);
    CAT.scene.add(holder);
    const d = r / Math.sin(THREE.MathUtils.degToRad(14)) * 0.78;
    CAT.cam.position.set(0, d * 0.25, d); CAT.cam.lookAt(0, 0, 0);
    CAT.scene.overrideMaterial = known ? null : CAT.sil;
    CAT.r.render(CAT.scene, CAT.cam);
    url = CAT.r.domElement.toDataURL('image/png');
    CAT.scene.overrideMaterial = null;
    CAT.scene.remove(holder);
  } catch (err) { console.warn('catalog thumb', e.key, err); }
  CAT.thumbs.set(id, url);
  return url;
}

/* ---------- details for the side panel ---------- */
function catStats(e) {
  if (e.kind === 'enemy') {
    const d = ETYPES[e.type], hpMul = d.boss || d.mini ? 1 : 0.45;
    const rows = [['Health', Math.round(d.hp * hpMul)], ['Speed', `${d.speed} m/s`], ['Damage', d.dmg || '—'], ['Size', `${(d.r * 2).toFixed(1)} m`]];
    if (d.fly) rows.push(['Moves', 'Flies']);
    if (d.ranged) rows.push(['Attack', 'Ranged']);
    if (d.bomb) rows.push(['Blast', `${d.bomb.radius} m`]);
    if (d.split) rows.push(['Splits into', `${d.split} splitlings`]);
    if (d.boss) rows.push(['Type', 'Boss']); else if (d.mini) rows.push(['Type', 'Mini-boss']);
    return { desc: ENEMY_NOTES[e.type] || '', rows: rows.concat([['Stats', 'Stage 1 base']]) };
  }
  if (e.kind === 'power') return { desc: POWER_NOTES[e.type] || '', rows: e.type === 'berserk' ? [['Lasts', `${BERSERK_T} s`], ['Fire rate', '×2'], ['Reload', 'none'], ['Drops when', `${BERSERK_CROWD}+ enemies are out`]] : [] };
  if (e.kind === 'combo') {
    const [a, b] = e.type.split('+');
    return { desc: COMBOS[e.type][1], rows: [['Gems', `${ATTRS[a].name} + ${ATTRS[b].name}`], ['Where', 'Both in one arm']] };
  }
  if (e.kind === 'gem') return { desc: '', rows: [['In an arm', ATTRS[e.type].desc], ['In a leg', LEG_GEM[e.type]], ['Tiers', `I–${ROMAN[GEM_MAX]}`]] };
  const it = mkItem(e.kind, e.type, 1), d = itemDef(it);
  return { desc: d.desc || '', rows: partInfo(it).filter(([a]) => !['Gems', 'Gem', 'Wrist', 'Wrist 2', 'Combo'].includes(a)) };
}
function catHint(e) {
  if (e.kind === 'power') return 'Pick one up to discover it.';
  return e.kind === 'combo' ? 'Socket these two gems into one arm to discover it.'
    : e.kind === 'enemy' ? (ETYPES[e.type].boss || ETYPES[e.type].mini ? 'Encounter it to discover it.' : 'Destroy one to discover it.')
    : 'Pick one up to discover it.';
}
function catComboIcon(k, known) {
  const [a, b] = k.split('+');
  const gem = t => `<svg viewBox="0 0 24 24" class="cgem" style="color:${known ? ATTRS[t].color : '#3a434b'}" fill="currentColor">${PART_ICONS.gem}</svg>`;
  return `<span class="ccombo">${gem(a)}<b>+</b>${gem(b)}</span>`;
}

/* ---------- the screen ---------- */
function openCatalog() {
  ensureAudio();
  S.prevMode = S.mode; S.mode = 'catalog';
  $('.tmain').hidden = true; $('#catalog').hidden = false;
  TITLE.tipPart = null; hideTitleTip();
  renderCatalog(); focusFirst();
}
function closeCatalog() {
  $('#catalog').hidden = true; $('.tmain').hidden = false;
  S.mode = 'title'; sfx('tick'); focusFirst();
}
function renderCatalog() {
  const all = catEntries(), seen = all.filter(e => catKnown(e.key)).length;
  $('#catCount').textContent = `${seen}/${all.length}`;
  $('#catTabs').innerHTML = CAT_TABS.map(([k, n]) => {
    const list = all.filter(e => e.tab === k), got = list.filter(e => catKnown(e.key)).length;
    return `<button class="ctab nav${CAT.tab === k ? ' on' : ''}" data-cat="${k}">${n} <small>${got}/${list.length}</small></button>`;
  }).join('');
  const list = all.filter(e => e.tab === CAT.tab);
  $('#catGrid').innerHTML = list.map(e => {
    const known = catKnown(e.key);
    const pic = e.kind === 'combo' ? catComboIcon(e.type, known) : `<img alt="" src="${catThumb(e, known)}">`;
    return `<button class="catcard nav${known ? '' : ' unknown'}${CAT.sel === e.key ? ' on' : ''}" data-key="${e.key}">
      <span class="cpic">${pic}${known ? '' : '<i class="cq">?</i>'}</span><span class="cname">${known ? e.name : '???'}</span></button>`;
  }).join('');
  if (!CAT.sel || !list.some(e => e.key === CAT.sel)) CAT.sel = list[0] && list[0].key;
  renderCatDetail();
}
function renderCatDetail() {
  const e = catEntries().find(x => x.key === CAT.sel), el = $('#catDetail');
  $$('#catGrid .catcard').forEach(c => c.classList.toggle('on', c.dataset.key === CAT.sel));
  if (!e) { el.innerHTML = ''; return; }
  const known = catKnown(e.key);
  const pic = e.kind === 'combo' ? catComboIcon(e.type, known) : `<img alt="" src="${catThumb(e, known)}">`;
  if (!known) { el.innerHTML = `<div class="cdpic">${pic}<i class="cq">?</i></div><h3>???</h3><p class="cdhint">${catHint(e)}</p>`; return; }
  const st = catStats(e);
  const kindLbl = e.kind === 'power' ? 'Power-up' : e.kind === 'enemy' && ETYPES[e.type].npc ? 'Bystander' : e.kind === 'enemy' ? (ETYPES[e.type].boss ? 'Boss' : ETYPES[e.type].mini ? 'Mini-boss' : 'Enemy') : e.kind === 'combo' ? 'Gem combo' : KIND_LABEL[e.kind];
  el.innerHTML = `<div class="cdpic">${pic}</div><div class="eyebrow">${kindLbl}</div><h3>${e.name}</h3>${st.desc ? `<p>${st.desc}</p>` : ''}
    <div class="cdstats">${st.rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
}
$('#catTabs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cat]'); if (!b) return;
  CAT.tab = b.dataset.cat; CAT.sel = null; sfx('tick'); renderCatalog();
  const t = $(`#catTabs [data-cat="${CAT.tab}"]`); if (t) t.focus();
});
$('#catGrid').addEventListener('click', ev => { const c = ev.target.closest('[data-key]'); if (!c) return; CAT.sel = c.dataset.key; sfx('tick', 0.5); renderCatDetail(); });
$('#catGrid').addEventListener('focusin', ev => { const c = ev.target.closest('[data-key]'); if (!c || CAT.sel === c.dataset.key) return; CAT.sel = c.dataset.key; renderCatDetail(); });
$('#catGrid').addEventListener('mouseover', ev => { const c = ev.target.closest('[data-key]'); if (!c || CAT.sel === c.dataset.key) return; CAT.sel = c.dataset.key; renderCatDetail(); });
$('#catBack').addEventListener('click', closeCatalog);
$('#tCatalog').addEventListener('click', openCatalog);
