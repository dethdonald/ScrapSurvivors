'use strict';
/* ============================================================
   WEAPON CASES: tougher enemies drop one now and then, the Warden always does. Walk into it and it opens
   into a three-slot roulette of PARTS: each slot spins and lands on a limb, a weapon or a gem, with a rarer
   chance of a module. Take one and it goes to your storage. Each stage gives you 3 rerolls; a reroll re-spins one slot.
   (Locked cases you pay bolts for are different: those give level-up upgrades. See shop.js.)
   ============================================================ */
const WC = { items: [], spin: [], lock: 0, teased: [] };
/* a tempting part for the near miss: a top-mark weapon or limb, or a module */
function caseTease() { const it = rollLootOf(Math.random() < 0.4 ? ['module'] : ['weapon'], 60); it.lvl = Math.max(it.lvl, Math.min(TIER_START[5], maxLvlOf(it))); return it; }

/* one part: limb, weapon or gem, sometimes a module; cases roll with a little extra luck */
function rollCasePart() {
  const luck = (stats && stats.luck || 0) + 6, r = Math.random();
  if (r < 0.14) return rollLootOf(['module'], luck);
  if (r < 0.32) return mkGem();
  if (r < 0.62) return rollLootOf(['weapon'], luck);
  return rollLootOf(['arm', 'leg'], luck);
}
/* one that isn't already showing in another slot */
function rollCaseOffer(except = []) {
  for (let t = 0; t < 20; t++) { const o = rollCasePart(); if (!except.includes(o.kind + ':' + o.type)) return o; }
  return rollCasePart();
}
const caseKey = o => o.kind + ':' + o.type;
/* the card for a part: rarity, its icon big, its name, Mk level and what kind of part it is */
function partCardHTML(it) {
  const R = rarityOf(it.lvl || 1), gem = it.kind === 'gem';
  return `<div class="tag"><b style="color:${gem ? ATTRS[it.type].color : R.css}">${gem ? 'Gem' : R.name}</b></div>
    <div class="bigsym partbig" style="color:${gem ? ATTRS[it.type].color : R.css}">${partIcon(it)}</div>
    <div class="nm sm">${itemName(it)}</div>
    <div class="ft">${KIND_LABEL[it.kind]}${gem ? '' : ' · ' + mkTag(it.lvl)}</div>`;
}
const partTip = it => `${itemName(it)}: ${itemDef(it).desc || (it.kind === 'gem' ? ATTRS[it.type].desc : '')}`;

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
  WC.items = [];
  for (let i = 0; i < 3; i++) WC.items.push(rollCaseOffer(WC.items.map(caseKey)));
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
  WC.spin[i] = true; WC.teased[i] = false;
  WC.lock = Math.max(WC.lock, performance.now() + dur + 350);
  twirlSound(dur / 1000 + 0.1, 0.8);
  let t = 0;
  const show = o => { const t = tierOf(o.lvl || 1); card.innerHTML = partCardHTML(o); card.dataset.tip = partTip(o); card.className = `card nav rar wcard symcard r${t}` + (WC.spin[i] ? ' spinning' : ' landed'); card.style.setProperty('--rar', RARITY[t].css); };
  const step = () => {
    if ($('#wcase').hidden) return;
    if (t >= dur) { WC.spin[i] = false; show(WC.items[i]); sfx('sparks', 0.7); const tr = tierOf(WC.items[i].lvl || 1); sparkBurst(card, RARITY[tr].css, tr >= 4 ? 40 : 24); if (tr >= 4 || WC.items[i].kind === 'module') sfx('jackpot', 0.5); syncRerolls(); return; }
    const gap = 45 + 260 * (t / dur) ** 2;
    // near miss: the flicker just before it lands is often something much better (a high-mark part or a module)
    if (t + gap >= dur && !WC.teased[i] && tierOf(WC.items[i].lvl || 1) < 4 && Math.random() < 0.55) {
      WC.teased[i] = true; show(caseTease()); sfxP('tick', 0.2, 1.3);
      t += gap; setTimeout(step, gap + 260); return;          // hang on it a moment longer
    }
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
    const auto = allItems().some(o => o.autoUp && canCombine(o, it));   // a part set to auto-upgrade takes it in (with its own banner)
    const fits = receiveItem(it);
    if (!auto) banner(itemName(it).toUpperCase(), fits ? 'In storage' : 'Storage full · recycle at the workbench', it.kind === 'gem' ? ATTRS[it.type].color : rarityOf(it.lvl).css, 2);
    sfx('loot', 0.7);
  }
});
$('#wcSkip').addEventListener('click', () => {
  if (performance.now() < WC.lock) { sfx('deny', 0.3); return; }
  S.bolts = (S.bolts || 0) + 6; if (S.st) S.st.bolts += 6; sfx('coin', 0.6);
  closeWeaponCase(); banner('CASE RECYCLED', '+6 bolts', '#e8c35a', 1.6);
});
