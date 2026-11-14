'use strict';
/* ============================================================
   WEAPON CASES: tougher enemies drop one now and then, the Warden always does. Walk into it and it opens
   into a three-slot roulette of PARTS: each slot spins and lands on a limb, a weapon or a gem, with a rarer
   chance of a module. Take one and it goes to your storage. Each stage gives you 3 rerolls; a reroll re-spins one slot.
   (Locked cases you pay bolts for are different: those give level-up upgrades. See shop.js.)
   ============================================================ */
const WC = { items: [], spin: [], lock: 0, orbRolled: false };

/* ---- what a case can hold ----
   Each slot is one part: a weapon (most often), a gem, a module, an occasional limb, and now and then an adapter. Parts you already
   carry come up more often (a duplicate can be merged), but never exclusively. The roulette is honest: what you see land is what was
   rolled, and the cards it flickers through are drawn from the very same odds. */
const CASE_KIND_ODDS = [['module', 0.14], ['gem', 0.18], ['weapon', 0.50], ['arm', 0.12], ['adapter', 0.06]];
const CASE_DUP_BIAS = 0.35;           // chance a weapon/arm slot picks one you already have equipped (when you have any)
const ORB_CHANCE = 0.05;              // evaluated once per case, replaces one of its three choices
/* a case's weapon level: much stingier than field loot, and scaled by your luck stat.
   Each step up needs its own roll: the first is 8% at 0 luck (+0.4% per luck, up to 50%), every further one 25% (+0.3% per luck, up to 50%).
   At 0 luck: ~92% Lv1, ~6% Lv2, ~1.5% Lv3, under 0.5% Lv4-5. Arms always come at Lv1 (they level by merging). */
function rollCaseLevel() {
  const luck = Math.max(0, (stats && stats.luck) || 0);
  const first = Math.min(0.5, 0.08 + luck * 0.004), next = Math.min(0.5, 0.25 + luck * 0.003);
  let lvl = 1; if (Math.random() < first) { lvl = 2; while (lvl < MAX_LVL && Math.random() < next) lvl++; }
  return lvl;
}
function rollCasePart() {
  const luck = (stats && stats.luck || 0) + 6;
  let r = Math.random(), kind = 'weapon';
  for (const [k, w] of CASE_KIND_ODDS) { if (r < w) { kind = k; break; } r -= w; }
  if (kind === 'gem') return mkGem();
  if (kind === 'module') return rollLootOf(['module'], luck);
  if (kind === 'adapter') return BUILD_V2 ? rollLootOf(['adapter'], luck) : rollLootOf(['weapon'], luck);
  if ((kind === 'weapon' || kind === 'arm') && Math.random() < CASE_DUP_BIAS) {
    const own = kind === 'weapon' ? mountedWeapons().map(w => w.type) : mountedArms().map(a => a.type);
    if (own.length) return mkItem(kind, pick(own), kind === 'arm' ? 1 : rollCaseLevel());
  }
  const it = rollLootOf([kind === 'arm' ? 'arm' : 'weapon'], luck);
  return kind === 'arm' ? mkItem('arm', it.type, 1) : mkItem('weapon', it.type, rollCaseLevel());
}
/* one that isn't already showing in another slot */
function rollCaseOffer(except = []) {
  for (let t = 0; t < 20; t++) { const o = rollCasePart(); if (!except.includes(o.kind + ':' + o.type)) return o; }
  return rollCasePart();
}
const caseKey = o => o.kind + ':' + o.type;
/* the three choices of one case; the orb roll happens here, once */
function rollCase() {
  const items = [];
  for (let i = 0; i < 3; i++) items.push(rollCaseOffer(items.map(caseKey)));
  WC.orbRolled = Math.random() < ORB_CHANCE;
  if (WC.orbRolled) items[Math.floor(Math.random() * 3)] = mkItem('orb', 'universal', 1);
  return items;
}
/* the card for a part: rarity, its icon big, its name, level and what kind of part it is, plus whether you own it / it will auto-upgrade */
function ownBadge(it) {
  if (it.kind === 'orb') return '<span class="own orb">+1 LEVEL</span>';
  const own = allItems().filter(o => o.kind === it.kind && o.type === it.type);
  const auto = own.some(o => o.autoUp && canCombine(o, it));
  return (own.length ? `<span class="own">OWNED ×${own.length}</span>` : '') + (auto ? '<span class="own auto">AUTO-UPGRADES</span>' : '');
}
function partCardHTML(it) {
  const R = rarityOf(it.lvl || 1), gem = it.kind === 'gem', orb = it.kind === 'orb', col = partColor(it);
  return `<div class="tag"><b style="color:${col}">${orb ? 'Orb' : gem ? 'Gem' : R.name}</b></div>
    <div class="bigsym partbig" style="color:${col}">${partIcon(it)}</div>
    <div class="nm sm">${itemName(it)}</div>
    <div class="ft">${KIND_LABEL[it.kind]}${gem || orb ? '' : ' · ' + mkTag(it.lvl)}</div>
    <div class="owns">${ownBadge(it)}</div>`;
}
const partTip = it => `${itemName(it)}: ${itemDef(it).desc || (it.kind === 'gem' ? ATTRS[it.type].desc : '')}`;
/* hands the player a reward: merged/stored if there's room, otherwise it drops beside the robot as a pickup, never lost */
function awardPart(it) {
  const auto = allItems().some(o => o.autoUp && canCombine(o, it));
  if (!auto && storeFull()) {
    const a = player.legYaw || 0, p = player.pos.clone(); p.x += Math.sin(a) * 2.6; p.z += Math.cos(a) * 2.6; p.y = groundAt(p.x, p.z) + 1;
    dropLoot(p, it);
    banner(itemName(it).toUpperCase(), 'Storage full · dropped beside you', partColor(it), 2.4);
    return 'dropped';
  }
  const fits = receiveItem(it);
  if (!auto) banner(itemName(it).toUpperCase(), fits ? 'In storage' : 'Storage full · recycle at the workbench', partColor(it), 2);
  return auto ? 'merged' : 'stored';
}

/* ---------- the case on the ground: a hard-shell case with latches, glowing in your accent colour ---------- */
/* the case itself (also drawn in the catalog) */
function caseMesh() {
  const spin = new THREE.Group();
  spin.add(bx(1.15, 0.42, 0.78, 0x24292e));
  spin.add(bx(1.19, 0.06, 0.82, 0xff7a1a, 0, 0, 0, 0x5a2000));                     // the seam
  for (const x of [-0.36, 0.36]) spin.add(bx(0.12, 0.14, 0.06, 0xb8bec4, x, 0.02, 0.42));      // latches
  spin.add(bx(0.4, 0.06, 0.08, 0x111416, 0, 0.27, 0)); spin.add(bx(0.06, 0.12, 0.08, 0x111416, -0.18, 0.22, 0)); spin.add(bx(0.06, 0.12, 0.08, 0x111416, 0.18, 0.22, 0));   // handle
  for (const x of [-0.5, 0.5]) for (const z of [-0.33, 0.33]) spin.add(bx(0.1, 0.44, 0.1, 0xff7a1a, x, 0, z, 0x5a2000));   // corner guards
  return spin;
}
function dropCase(p) {
  const g = new THREE.Group(), spin = caseMesh(); g.add(spin);
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.4, depthWrite: false }));
  beam.scale.set(0.16, 7, 0.16); beam.position.y = 3; g.add(beam);
  const halo = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  halo.scale.setScalar(1.1); halo.position.y = -0.55; g.add(halo);
  applySecondary(g);
  const pos = p.clone(); g.position.copy(pos); scene.add(g);
  gems.push({ kind: 'case', mesh: g, spin, pos, vel: new THREE.Vector3(rand(-2, 2), 8, rand(-2, 2)), val: 0, pull: false });
  sfx('loot', 0.7);
}

/* ---------- the pick screen: three part cards ---------- */
function openWeaponCase() {
  S.prevMode = S.mode === 'wcase' ? S.prevMode : S.mode; S.mode = 'wcase'; unlockPointer();
  WC.items = rollCase();
  const wrap = $('#wcCards'); wrap.innerHTML = '';
  WC.items.forEach((o, i) => {
    const col = document.createElement('div'); col.className = 'wccol';
    col.innerHTML = `<button class="card nav rar wcard" data-take="${i}"></button><button class="btn ghost nav wreroll" data-reroll="${i}">Reroll</button>`;
    wrap.appendChild(col);
  });
  $('#wcase').hidden = false; $('#banner').hidden = true; sfx('celebrate', 0.6);
  WC.items.forEach((o, i) => wcSpin(i, 650 + i * 320));
  syncRerolls();
  setTimeout(focusFirst, 50);
}
/* a slot flickers through random parts, slowing down, then lands on what's really in it */
function wcSpin(i, dur) {
  const card = $(`#wcCards [data-take="${i}"]`); if (!card) return;
  WC.spin[i] = true;
  WC.lock = Math.max(WC.lock, performance.now() + dur + 350);
  twirlSound(dur / 1000 + 0.1, 0.8);
  let t = 0;
  const show = o => { const t = o.kind === 'orb' ? 5 : tierOf(o.lvl || 1); card.innerHTML = partCardHTML(o); card.dataset.tip = partTip(o); card.className = `card nav rar wcard symcard r${t}` + (WC.spin[i] ? ' spinning' : ' landed'); card.style.setProperty('--rar', o.kind === 'orb' ? ORB_COLOR : RARITY[t].css); };
  const step = () => {
    if ($('#wcase').hidden) return;
    if (t >= dur) { WC.spin[i] = false; show(WC.items[i]); sfx('sparks', 0.7); const orbL = WC.items[i].kind === 'orb', tr = orbL ? 5 : tierOf(WC.items[i].lvl || 1); sparkBurst(card, orbL ? ORB_COLOR : RARITY[tr].css, tr >= 4 ? 40 : 24); if (tr >= 4 || WC.items[i].kind === 'module') sfx('jackpot', 0.5); syncRerolls(); return; }
    const gap = 45 + 260 * (t / dur) ** 2;
    show(rollCasePart()); sfx('tick', 0.07);
    t += gap; setTimeout(step, gap);
  };
  step();
}
function syncRerolls() {
  const n = S.rerolls || 0;
  $('#wcRerolls').innerHTML = `${sym('rerolls', 'Rerolls left this stage')} ${n}`;
  $$('#wcCards .wreroll').forEach(b => { b.disabled = n <= 0 || WC.spin[+b.dataset.reroll]; b.innerHTML = sym('rerolls', n > 0 ? `Reroll this slot (${n} left this stage)` : 'No rerolls left'); });
}
function closeWeaponCase() {
  $('#wcase').hidden = true;
  S.mode = S.prevMode === 'drop' ? 'drop' : 'play'; lockPointer();
}
$('#wcCards').addEventListener('click', e => {
  const take = e.target.closest('[data-take]'), rr = e.target.closest('[data-reroll]');
  if (rr) {
    const i = +rr.dataset.reroll;
    if ((S.rerolls || 0) <= 0 || WC.spin[i]) { sfx('deny', 0.4); denyFx(rr); return; }
    S.rerolls--; WC.items[i] = rollCaseOffer(WC.items.filter((o, j) => j !== i).map(caseKey)); wcSpin(i, 900); syncRerolls(); sfx('swish', 0.5);
    return;
  }
  if (take) {
    if (performance.now() < WC.lock || WC.spin.some(Boolean)) { sfx('deny', 0.3); return; }
    const it = WC.items[+take.dataset.take];
    closeWeaponCase();
    awardPart(it);
    sfx('loot', 0.7);
  }
});
$('#wcSkip').addEventListener('click', () => {
  if (performance.now() < WC.lock) { sfx('deny', 0.3); return; }
  S.bolts = (S.bolts || 0) + 6; if (S.st) S.st.bolts += 6; sfx('coin', 0.6);
  closeWeaponCase(); banner('CASE RECYCLED', '+6 bolts', '#e8c35a', 1.6);
});
