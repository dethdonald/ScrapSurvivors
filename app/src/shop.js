'use strict';
/* ============================================================
   STORE: a Scrap Dealer on every stage. After each deal it shrinks away and pops up somewhere else
   on the map 30 s later, and every deal you make (this run) puts its prices up a little:
     Slot machine   - cheap spin, a chance at a rare part.
     Attribute      - add a random attribute to one of your weapons or arms.
     Buy            - one high-rarity part, on offer once.
   ============================================================ */
const SHOP_COST = { slot: 12, attr: 35 };
const SHOP_REROLL = 50;                                // fixed price: never scales with deals made
const SHOP_MOVE_T = 30, SHOP_PRICE_UP = 0.12;          // seconds before it reappears · +12% on every price per deal
const shopMul = () => 1 + SHOP_PRICE_UP * (S.shopBuys || 0);
const shopCost = k => Math.round(SHOP_COST[k] * shopMul());
const offerPrice = off => Math.round(off.price * shopMul());
function placeShop() {
  let k = -1;
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(30, 70);
    const c = idxOf(player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d);
    if (c >= 0 && inner(c)) { k = c; break; }
  }
  if (k < 0) return;
  const x = cellX(k), z = cellZ(k), y = H[k];
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(bx(2.6, 0.25, 1.6, COL.dark, 0, 0.12, 0));                         // base
  g.add(bx(2.4, 1.1, 1.0, 0x3b4650, 0, 0.8, -0.2));                        // counter
  g.add(bx(2.5, 0.12, 1.1, 0xe8c35a, 0, 1.4, -0.2, 0x4a3608));             // gold trim
  g.add(bx(0.18, 2.6, 0.18, COL.dark, -1.15, 1.3, -0.65)); g.add(bx(0.18, 2.6, 0.18, COL.dark, 1.15, 1.3, -0.65));
  const sign = bx(2.6, 0.55, 0.12, 0x1a2026, 0, 2.75, -0.65); g.add(sign);
  g.add(bx(2.2, 0.32, 0.14, 0xe8c35a, 0, 2.75, -0.58, 0x6a4a10));           // lit sign strip
  for (let i = 0; i < 6; i++) g.add(bx(0.44, 0.08, 1.4, i % 2 ? 0xe8c35a : 0x3b4650, -1.1 + i * 0.44, 2.35, -0.05));   // striped awning
  const screen = bx(0.8, 0.5, 0.06, COL.cyan, 0.5, 1.75, -0.45, 0x1b6a70); g.add(screen);
  const bolt = new THREE.Mesh(geoBolt, M(0xe8c35a, 0x6a4a10)); bolt.scale.setScalar(2.2); bolt.position.set(-0.55, 1.85, -0.3); g.add(bolt);
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xe8c35a, transparent: true, opacity: 0.14, depthWrite: false }));
  beam.scale.set(1.1, 120, 1.1); beam.position.y = 62; g.add(beam);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  S.shop = { group: g, bolt, beam, x, y, z, used: false, offers: rollShopOffers() };
}
/* the one part for sale: always Epic or Legendary */
/* three parts for sale: a Rare, an Epic, and an Epic-or-Legendary; restocked after every deal */
function rollShopOffers() { return [3, 4, Math.random() < 0.3 ? 5 : 4].map(rollShopOffer); }
function rollShopOffer(tier) {
  let it;
  for (let i = 0; i < 20; i++) { it = rollLoot((stats && stats.luck || 0) + 40); if (it.kind !== 'block') break; }
  if (!isLimb(it.kind)) it.lvl = TIER_START[tier];          // limbs always come at level 1
  return { item: it, price: Math.round(30 + TIER_START[tier] * 0.9) };
}
function clearShop() { if (S.shop) { scene.remove(S.shop.group); S.shop = null; } }
function shopTick(dt) {
  // packed up after a deal: count down, then set up shop somewhere else
  if (!S.shop) {
    if (S.shopAwayT > 0 && playing()) { S.shopAwayT -= dt; if (S.shopAwayT <= 0) { placeShop(); if (S.shop) { S.shop.grow = 0; S.shop.group.scale.setScalar(0.001); } } }
    return;
  }
  const sh = S.shop;
  if (sh.leaving) {
    // shrink and spin away into the ground
    sh.leaveT = (sh.leaveT || 0) + dt; const k = Math.min(1, sh.leaveT / 0.7);
    sh.group.scale.setScalar(Math.max(0.001, 1 - k * k)); sh.group.rotation.y += dt * (4 + k * 14);
    if (k >= 1) { clearShop(); S.shopAwayT = SHOP_MOVE_T; }
    return;
  }
  if (sh.grow !== undefined && sh.grow < 1) {
    // popping up somewhere new: overshoot then settle
    sh.grow = Math.min(1, sh.grow + dt / 0.6); const g = sh.grow, s = 1 + Math.sin(g * Math.PI) * 0.25 * (1 - g) + (g < 1 ? -(1 - g) * (1 - g) : 0);
    sh.group.scale.setScalar(Math.max(0.001, s));
    if (g >= 1) sh.group.scale.setScalar(1);
  }
  S.shop.bolt.rotation.y += dt * 2;
  S.shop.beam.material.opacity = 0.1 + 0.06 * Math.sin(performance.now() / 260);
}
function shopPrompt() {
  const sh = S.shop; if (!sh || sh.used || sh.leaving || (sh.grow !== undefined && sh.grow < 1)) return '';
  const d = Math.hypot(sh.x - player.pos.x, sh.z - player.pos.z);
  if (d > 4 || Math.abs(sh.y - player.pos.y) > 3) return '';
  if (IN.interactP) { IN.interactP = false; openShop(); return ''; }
  return `${keyHint('E', 'X')}Store`;
}

function openShop() {
  if (S.mode !== 'play') return;
  $('#prompt').hidden = true;
  S.prevMode = 'play'; S.mode = 'shop'; unlockPointer();
  $('#shopSub').innerHTML = ''; $('#shopSub').hidden = true;
  renderShop();
  $('#shop').hidden = false; focusFirst();
}
function closeShop() { $('#shop').hidden = true; S.mode = 'play'; lockPointer(); }
function shopDone(msg) {
  // the deal is made: prices go up a notch, and the store shrinks away to pop up somewhere else in 30 s
  const sh = S.shop; if (!sh) return;
  S.shopBuys = (S.shopBuys || 0) + 1;
  sh.leaving = true; sh.leaveT = 0;
  const p = sh.group.position.clone().setY(sh.y + 1.2);
  burst(p, 0xe8c35a, 14); ring(p, 4, 0.6, 0xe8c35a); sfx('whistle', 0.5);
  if (msg) banner(msg.h, msg.s, msg.c || '#e8c35a', 2.2);
}
function renderShop() {
  const sh = S.shop, b = S.bolts || 0;
  $('#shopBolts').textContent = b;
  const card = (id, cost, tag, name, desc, foot) => `<button class="card nav shopcard${b < cost ? ' poor' : ''}" data-act="${id}" data-tip="${String(desc + (foot ? ' · ' + foot : '')).replace(/<[^>]+>/g, '').replace(/"/g, '&quot;')}" ${b < cost ? 'aria-disabled="true"' : ''}>
    <div class="tag"><span>${tag}</span><b class="price">${sym('bolts', '')} ${cost}</b></div><div class="nm">${name}</div>${b < cost ? `<div class="ft">−${cost - b} ${sym('bolts', '')}</div>` : ''}</button>`;
  $('#shopCards').innerHTML = `<div class="shopsep"><span>Services</span></div>` +
    card('slot', shopCost('slot'), 'Gamble', 'Slots', 'Three of a kind: rare part · Pair: +8 bolts', '') +
    card('attr', shopCost('attr'), 'Gem', 'Random gem', 'Socket into an arm · changes its gun', '') +
    `<div class="shopsep"><span>Parts</span></div>` +
    card('reroll', SHOP_REROLL, 'Restock', 'Reroll parts', 'Replace the three parts on offer · fixed price', '') +
    sh.offers.map((off, i) => { const it = off.item, r = rarityOf(it.lvl); return card('buy' + i, offerPrice(off), `<span style="color:${r.css}">${r.name}</span>`, `${partIcon(it)}${itemName(it)} ${mkTag(it.lvl)}`, `${itemName(it)}: ${itemDef(it).desc || ''}`, KIND_LABEL[it.kind]); }).join('');
  for (const el of $$('#shopCards .card')) el.addEventListener('click', () => { if (el.classList.contains('poor')) { sfx('deny'); denyFx(el); return; } shopAction(el.dataset.act); });
}
function shopAction(act) {
  const sh = S.shop;
  if (act.startsWith('buy')) {
    const off = sh.offers[+act.slice(3)];
    S.bolts -= offerPrice(off);
    const it = off.item, stored = receiveItem(it); sfx('loot');
    closeShop();
    shopDone({ h: itemName(it).toUpperCase(), s: `Lv ${it.lvl}${stored ? '' : ' · storage full'}`, c: rarityOf(it.lvl).css });
  } else if (act === 'reroll') {
    if ((S.bolts || 0) < SHOP_REROLL) return;
    S.bolts -= SHOP_REROLL; sh.offers = rollShopOffers(); sfx('swish', 0.6); renderShop(); focusFirst();
  } else if (act === 'slot') spinSlot();
  else if (act === 'attr') pickAttrPart();
}
/* ---- slot machine ---- */
const REEL = ['■', '▲', '◆', '●', '✚'];
function spinSlot() {
  S.bolts -= shopCost('slot'); $('#shopBolts').textContent = S.bolts;
  const luck = stats.luck || 0, x = Math.random();
  // three of a kind: 10% (+luck) · two of a kind: 30%
  const tri = x < 0.1 + luck * 0.002, two = !tri && x < 0.4;
  const sym = pick(REEL), res = tri ? [sym, sym, sym] : two ? [sym, sym, pick(REEL.filter(s => s !== sym))] : (() => { const r = REEL.slice().sort(() => Math.random() - 0.5); return r.slice(0, 3); })();
  // near miss: on a pair the first two reels match and the last one crawls past the third symbol, one notch too far.
  // On a loss it sometimes shows the jackpot symbol on the last reel a beat before settling on a dud.
  const tease = two || Math.random() < 0.3, last = 8 + 2 * 5, extra = tease ? 7 : 0;
  const teaseSym = two ? sym : res[0];
  const sub = $('#shopSub'); sub.hidden = false;
  sub.innerHTML = `<div class="reels">${[0, 1, 2].map(i => `<div class="reel" id="reel${i}">?</div>`).join('')}</div><div class="slotmsg" id="slotMsg">Spinning…</div>`;
  $$('#shopCards .card').forEach(c => c.classList.add('poor'));
  twirlSound(1.35, 0.8);
  let t = 0;
  const iv = setInterval(() => {
    t++;
    for (let i = 0; i < 3; i++) {
      const stopT = 8 + i * 5 + (i === 2 ? extra : 0);
      if (i === 2 && tease && t >= last && t < stopT) {
        // the slow crawl: every other tick, ending on the symbol you wanted, then one past it
        if ((t - last) % 2 === 0) { $('#reel2').textContent = t >= stopT - 2 ? teaseSym : pick(REEL); sfxP('slot', 0.6, 0.8 + (t - last) * 0.03); }
        $('#reel2').classList.toggle('tease', t >= stopT - 2);
      } else if (t < stopT) { $('#reel' + i).textContent = pick(REEL); if (i === 0) sfx('slot', 0.5); }
      else { $('#reel' + i).textContent = res[i]; $('#reel' + i).classList.remove('tease'); if (t === stopT) { sfx('sparks', 0.55); sparkBurst($('#reel' + i), '#e8c35a', 16); if (i === 2 && tease && !tri) sfxP('whoops', 0.4, 0.9); } }
    }
    if (t >= last + extra) {
      clearInterval(iv);
      let msg;
      if (tri) {
        const it = rollLoot(luck + 30); if (it.kind !== 'block' && !isLimb(it.kind) && tierOf(it.lvl) < 3) it.lvl = TIER_START[3];
        const stored = receiveItem(it); sfx('jackpot');
        $('#slotMsg').innerHTML = `JACKPOT · ${itemName(it)} ${mkTag(it.lvl)} ${attrTag(it)}`;
        msg = { h: 'JACKPOT', s: `${itemName(it)} · Lv ${it.lvl}${stored ? '' : ' · storage full'}`, c: rarityOf(it.lvl).css };
      } else if (two) { S.bolts += 8; $('#shopBolts').textContent = S.bolts; sfx('coin'); $('#slotMsg').textContent = 'PAIR · +8'; msg = { h: 'PAIR', s: '+8 bolts' }; }
      else { sfx('deny'); $('#slotMsg').textContent = 'NO LUCK'; msg = { h: 'NO LUCK', s: '' }; }
      setTimeout(() => { closeShop(); shopDone(msg); }, 1300);
    }
  }, 70);
}
/* ---- buy a gem ---- */
function pickAttrPart() {
  const g = mkGem(), A = ATTRS[g.type];
  S.bolts -= shopCost('attr'); $('#shopBolts').textContent = S.bolts;
  receiveItem(g); sfx('levelup');
  const sub = $('#shopSub'); sub.hidden = false;
  sub.innerHTML = `<div class="slotmsg" style="color:${A.color}">◆ ${GEMS[g.type].name}<br><small>${A.desc}</small></div>`;
  setTimeout(() => { closeShop(); shopDone({ h: `◆ ${A.name.toUpperCase()} GEM`, s: 'In storage', c: A.color }); }, 1400);
}
$('#shopLeave').addEventListener('click', closeShop);

/* ============================================================
   LOCKED CASES: scattered around every stage. Pay bolts to open one and it rolls 1, 2 or 3 level-up upgrades.
   Each case you open (over the whole run) makes the next one more expensive.
   ============================================================ */
const casePrice = () => Math.round(10 * Math.pow(1.45, S.caseCount || 0));
let cases = [];
function placeCases() {
  clearCases();
  const n = 18 + Math.min(8, S.stage * 2);
  for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
    const k = (Math.random() * NC) | 0;
    if (!inner(k)) continue;
    const x = cellX(k), z = cellZ(k);
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 20 || cases.some(c => Math.hypot(c.x - x, c.z - z) < 14)) continue;
    const g = new THREE.Group(); g.position.set(x, H[k], z); g.rotation.y = Math.random() * Math.PI * 2;
    g.add(bx(1.5, 0.75, 1.0, 0x2e363e, 0, 0.375, 0));
    for (const sx of [-0.62, 0.62]) g.add(bx(0.12, 0.8, 1.04, 0xe8c35a, sx, 0.4, 0, 0x3a2808));   // gold banding
    const lid = new THREE.Group(); lid.position.set(0, 0.75, -0.5); g.add(lid);
    lid.add(bx(1.52, 0.18, 1.02, 0x39434c, 0, 0.09, 0.5));
    lid.add(bx(0.5, 0.06, 0.5, ORANGE, 0, 0.2, 0.5, 0x5a2a08));
    const lock = new THREE.Group(); lock.position.set(0, 0.62, 0.53); g.add(lock);
    lock.add(bx(0.24, 0.22, 0.08, 0xe8c35a, 0, 0, 0, 0x6a4a10));
    lock.add(bx(0.16, 0.14, 0.04, 0x1a2026, 0, 0.17, 0));
    const glow = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xe8c35a, transparent: true, opacity: 0.18, depthWrite: false }));
    glow.scale.set(0.5, 9, 0.5); glow.position.y = 5; g.add(glow);
    scene.add(g);
    const holo = makeHolo(); holo.position.set(0, 2.1, 0); g.add(holo);
    cases.push({ group: g, lid, lock, glow, holo, x, z, y: H[k], open: false, t: 0 });
    i++;
  }
}
function clearCases() { cases.forEach(c => scene.remove(c.group)); cases = []; }
/* the price floats over each locked case as a flickering cyan hologram */
function makeHolo() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.scale.set(2.8, 1.4, 1); sp.userData = { cv, tex, val: -1 };
  return sp;
}
function drawHolo(sp, price, afford) {
  const { cv, tex } = sp.userData, c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const col = afford ? '#7fefff' : '#ff7a8a';
  c.strokeStyle = col; c.globalAlpha = 0.5; c.lineWidth = 3; c.strokeRect(20, 18, 216, 92);
  c.globalAlpha = 0.12; c.fillStyle = col; c.fillRect(20, 18, 216, 92);
  c.globalAlpha = 1; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '600 22px "JetBrains Mono", monospace'; c.fillText('LOCKED', 128, 42);
  c.font = '700 40px "JetBrains Mono", monospace'; c.fillText(`${price} B`, 128, 82);
  c.globalAlpha = 0.18; c.fillStyle = '#000'; for (let y = 0; y < cv.height; y += 4) c.fillRect(0, y, cv.width, 2);   // scanlines
  tex.needsUpdate = true;
}
function caseTick(dt) {
  const price = casePrice(), have = S.bolts || 0, t = performance.now() / 1000;
  for (const c of cases) {
    if (c.holo) {
      c.holo.visible = !c.open;
      if (!c.open) {
        const key = price * 2 + (have >= price ? 1 : 0);
        if (c.holo.userData.val !== key) { c.holo.userData.val = key; drawHolo(c.holo, price, have >= price); }
        c.holo.position.y = 2.1 + Math.sin(t * 2 + c.x) * 0.08;
        c.holo.material.opacity = (0.75 + 0.2 * Math.sin(t * 13 + c.z)) * (Math.random() < 0.03 ? 0.3 : 1);   // a little hologram flicker
      }
    }
    if (!c.open) { c.glow.material.opacity = 0.12 + 0.08 * Math.sin(performance.now() / 300 + c.x); continue; }
    if (c.t < 1) { c.t = Math.min(1, c.t + dt * 3); c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.t, 3)); }
  }
}
function casePrompt() {
  const P = player;
  for (const c of cases) {
    if (c.open || Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 3 || Math.abs(c.y - P.pos.y) > 2.5) continue;
    const price = casePrice(), have = S.bolts || 0, k = keyHint('E', 'X');
    if (IN.interactP) {
      IN.interactP = false;
      if (have < price) { sfx('deny'); denyFx($('#prompt')); return casePromptHTML(k, price, false); }
      S.bolts -= price; S.caseCount = (S.caseCount || 0) + 1;
      c.open = true; c.t = 0; c.group.remove(c.lock); c.group.remove(c.glow);
      const p = new THREE.Vector3(c.x, c.y + 1.4, c.z);
      burst(p, 0xe8c35a, 10); ring(new THREE.Vector3(c.x, c.y, c.z), 3, 0.45, 0xe8c35a); sfx('coin'); sfx('loot');
      startRoulette(c, p);
      return '';
    }
    return casePromptHTML(k, price, have >= price);
  }
  return '';
}

/* ---------- case roulette: a strip of prizes spins past a marker and stops on 1, 2 or 3 upgrades ---------- */
const ROUL_PRIZES = [{ n: 1, w: 62, css: '#b9c2c9', label: '1 UPGRADE' }, { n: 2, w: 29, css: '#3f8cff', label: '2 UPGRADES' }, { n: 3, w: 9, css: '#ffa21a', label: '3 UPGRADES' }];
function rollPrize() { let x = Math.random() * 100; for (const p of ROUL_PRIZES) { x -= p.w; if (x <= 0) return p; } return ROUL_PRIZES[0]; }
function startRoulette(c, at) {
  S.mode = 'roulette'; unlockPointer(); $('#prompt').hidden = true;
  const win = rollPrize(), N = 46, stop = 38;
  const tiles = [];
  for (let i = 0; i < N; i++) tiles.push(i === stop ? win : rollPrize());
  // near miss: when you didn't hit the top prize, it usually sits right next to the marker,
  // and the strip creeps to a stop at the very edge of your tile, a hair away from it
  const near = win.n < 3 && Math.random() < 0.6 ? (Math.random() < 0.65 ? 1 : -1) : 0;
  if (near) tiles[stop + near] = ROUL_PRIZES[2];
  const strip = $('#roulStrip');
  strip.innerHTML = tiles.map(t => `<div class="rtile" style="--rc:${t.css}"><b>${t.n}</b><span>${t.label}</span></div>`).join('');
  $('#roulette').hidden = false; $('#roulMsg').textContent = 'Spinning…';
  twirlSound(3.5, 0.8);
  const tileW = 120, view = $('#roulView').clientWidth, target = stop * tileW + tileW / 2 - view / 2 + (near ? near * rand(48, 56) : rand(-40, 40));
  const t0 = performance.now(), dur = near ? 4300 : 3400;
  let lastTile = -1;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, near ? 5 : 4);    // fast, then a long slow-down (longer still on a near miss)
    const x = target * e;
    strip.style.transform = `translateX(${-x}px)`;
    const under = Math.floor((x + view / 2) / tileW);
    if (under !== lastTile) { lastTile = under; sfx('slot', 0.6); }
    if (k < 1) { requestAnimationFrame(step); return; }
    strip.children[stop].classList.add('win'); sfx('sparks', 0.8); sparkBurst(strip.children[stop], win.css, win.n === 3 ? 44 : 28);
    $('#roulMsg').innerHTML = `<b style="color:${win.css}">${win.label}</b>` + (near ? ' <span class="nearTxt">SO CLOSE!</span>' : '');
    if (near) { const j = strip.children[stop + near]; j.classList.add('almost'); sfxP('whoops', 0.45, 0.9); }
    sfx(win.n === 3 ? 'jackpot' : 'loot');
    setTimeout(() => {
      $('#roulette').hidden = true; S.mode = 'play'; lockPointer();
      // straight to you: that many random level-up upgrades, with a little pop-up of what you got
      grantUpgrades(win.n, at);
    }, 1200);
  };
  requestAnimationFrame(step);
}

/* ---------- an upgrade pickup: a spinning glowing chip that grants a random level-up upgrade ---------- */
function dropUpgrade(p) {
  const offer = makeOffers()[0], R = RARITY[offer.rarity], col = new THREE.Color(R.css).getHex();
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  spin.add(bx(0.6, 0.6, 0.12, 0x1a1f24));
  spin.add(bx(0.66, 0.08, 0.14, col, 0, 0.3, 0, col)); spin.add(bx(0.66, 0.08, 0.14, col, 0, -0.3, 0, col));
  spin.add(bx(0.08, 0.66, 0.14, col, 0.3, 0, 0, col)); spin.add(bx(0.08, 0.66, 0.14, col, -0.3, 0, 0, col));
  spin.add(bx(0.12, 0.36, 0.16, 0xffffff, 0, 0, 0, 0xaaaaaa)); spin.add(bx(0.36, 0.12, 0.16, 0xffffff, 0, 0, 0, 0xaaaaaa));      // a plus sign
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
  beam.scale.set(0.14, 6, 0.14); beam.position.y = 2.6; g.add(beam);
  const pos = p.clone(); g.position.copy(pos); scene.add(g);
  gems.push({ kind: 'upgrade', offer, mesh: g, spin, pos, vel: new THREE.Vector3(rand(-2, 2), 7, rand(-2, 2)), val: 0, pull: false });
}
function claimUpgrade(c) {
  const U = STAT_UPGRADES[c.key], R = RARITY[c.rarity];
  L.bonus[c.key] = (L.bonus[c.key] || 0) + c.value;
  const shBefore = stats.maxShield;
  refreshLoadout();
  if (c.key === 'shield') player.shield += stats.maxShield - shBefore;
  banner((STAT_PLAIN[c.key] || U.name).toUpperCase(), `+${c.value}${statShort(c.key)}`, R.css, 1.8);
  sfx('levelup', 0.6); sfx('sparks', 0.5); ring(player.pos, 3, 0.4, new THREE.Color(R.css).getHex());
}

/* the locked-case prompt: key, lock, price; the price goes red when you can't afford it */
function casePromptHTML(k, price, ok) {
  return `${ok ? k : ''}${sym('lock', 'Locked case')} <b class="${ok ? '' : 'poorTxt'}">${price}</b>${sym('bolts', '')}`;
}

/* n random level-up upgrades applied at once, then listed in the reward pop-up */
function grantUpgrades(n, at) {
  const got = [], shBefore = stats.maxShield;
  for (let i = 0; i < n; i++) { const c = makeOffers()[0]; L.bonus[c.key] = (L.bonus[c.key] || 0) + c.value; got.push(c); }
  refreshLoadout();
  if (stats.maxShield > shBefore) player.shield += stats.maxShield - shBefore;
  rewardPop(got.map(c => { const R = RARITY[c.rarity]; return { css: R.css, icon: sym(STAT_SYM[c.key], ''), text: `+${c.value}${statShort(c.key)}`, sub: STAT_PLAIN[c.key] }; }), n > 1 ? `×${n}` : '');
  sfx('levelup', 0.6); sfx('sparks', 0.5);
  ring(player.pos, 3, 0.4, new THREE.Color(RARITY[Math.max(...got.map(c => c.rarity))].css).getHex());
  if (at) burst(at, 0xe8c35a, 10);
}
