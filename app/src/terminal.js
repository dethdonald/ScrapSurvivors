'use strict';
/* ============================================================
   SERVICE TERMINAL: a rare industrial console out in the arena. Deposit one part from your STORAGE (weapon, arm,
   lower half, gem or module) and pay a fixed 100 bolts: it is swapped for a RANDOM part of the SAME level (so the same
   rarity) from any of those five categories. Adapters are excluded (they have their own level cap).
   Rules: at most one terminal at a time · a successful use removes it · at least 60 s between spawns ·
   it only appears on flat, reachable ground · cancelling costs nothing · nothing happens without an explicit Confirm.
   Parts that hold other parts (gems, guns, attachments) are refused, so a swap can never lose anything.
   Run state is not saved, so there is nothing to corrupt in a save file.
   ============================================================ */
const TERMINAL_COST = 100, TERMINAL_GAP = 60, TERMINAL_CHECK = 10, TERMINAL_CHANCE = 0.05;
const TERM_KINDS = ['weapon', 'arm', 'lower', 'gem', 'module'];
const TERM = { sel: -1, nextAt: 0, checkT: 0 };

function termRefusal(it) {
  if (!it || !TERM_KINDS.includes(it.kind)) return 'Not accepted';
  if (it.kind === 'arm' && armGuns(it).length) return 'Take its gun off first';
  if ((it.gems || []).some(Boolean) || (it.slots || []).some(Boolean)) return 'Take its gems off first';
  return '';
}
/* the pool a replacement is drawn from: every type in the five categories (never an adapter) */
function termPool() {
  const p = [];
  for (const t of Object.keys(WEAPONS)) if (weaponLootUnlocked(t)) p.push(['weapon', t]);
  for (const t of Object.keys(ARMS)) p.push(['arm', t]);
  for (const t of Object.keys(LOWERS)) p.push(['lower', t]);
  for (const t of Object.keys(MODULES)) p.push(['module', t]);
  for (const t of Object.keys(GEMS)) p.push(['gem', t]);
  return p;
}
/* random replacement: same level as the deposit, never the identical kind+type (unless nothing else exists) */
function termRoll(it) {
  const pool = termPool().filter(([k, t]) => !(k === it.kind && t === it.type));
  const [k, t] = pool[Math.floor(Math.random() * pool.length)];
  const n = mkItem(k, t, 1); n.lvl = it.lvl; if (typeof syncGemSlots === 'function') syncGemSlots(n);
  if (k === 'module') n.autoUp = it.kind === 'module' ? !!it.autoUp : n.autoUp;
  return n;
}

function clearTerminal() { if (S.terminal) { scene.remove(S.terminal.group); S.terminal = null; } }
function termSpot() {
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(22, 60);
    const x = player.pos.x + Math.cos(a) * d, z = player.pos.z + Math.sin(a) * d, k = idxOf(x, z);
    if (k < 0 || !inner(k)) continue;
    const y = H[k]; let flat = true;
    for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) { const j = idxOf(x + dx, z + dz); if (j < 0 || !inner(j) || Math.abs(H[j] - y) > 0.8) { flat = false; break; } }
    if (!flat) continue;
    if (S.shop && Math.hypot(S.shop.x - x, S.shop.z - z) < 10) continue;
    if (S.gate && Math.hypot(S.gate.x - x, S.gate.z - z) < 10) continue;
    return { x: cellX(k), z: cellZ(k), y };
  }
  return null;
}
function placeTerminal() {
  const p = termSpot(); if (!p) return false;
  const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
  g.add(bx(2.4, 0.3, 1.8, COL.dark, 0, 0.15, 0));
  for (let i = 0; i < 6; i++) g.add(bx(0.4, 0.06, 1.8, i % 2 ? 0xf2c230 : 0x1a2026, -1.0 + i * 0.4, 0.32, 0));    // hazard-striped base
  g.add(bx(1.7, 1.6, 0.9, 0x4a545c, 0, 1.1, 0));
  const screen = bx(1.3, 0.8, 0.08, 0xff7a1a, 0, 1.45, 0.47, 0x7a3408); g.add(screen);
  g.add(bx(1.0, 0.18, 0.5, 0x2b3238, 0, 0.72, 0.5));
  g.add(bx(0.08, 1.2, 0.08, COL.dark, 0.7, 2.5, 0)); g.add(bx(0.4, 0.05, 0.05, 0xf2c230, 0.7, 3.1, 0, 0x5a4008));
  const beam = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.12, depthWrite: false }));
  beam.scale.set(1.0, 90, 1.0); beam.position.y = 46; g.add(beam);
  g.rotation.y = Math.random() * Math.PI * 2; scene.add(g);
  S.terminal = { group: g, screen, beam, x: p.x, y: p.y, z: p.z };
  banner('SERVICE TERMINAL', 'Somewhere in the arena', '#ff7a1a', 2.4);
  return true;
}
/* called every frame; the spawn clock only runs while the game is actually being played */
function terminalTick(dt) {
  if (S.terminal) { S.terminal.screen.material.opacity = 1; S.terminal.beam.material.opacity = 0.09 + 0.05 * Math.sin(performance.now() / 280); return; }
  if (!playing() || S.test || S.mode === 'drop') return;
  TERM.checkT -= dt;
  if (TERM.checkT > 0) return;
  TERM.checkT = TERMINAL_CHECK;
  if (S.t < TERM.nextAt || S.t < 45) return;                       // at least 60 s since the last one appeared
  if (Math.random() < TERMINAL_CHANCE && placeTerminal()) TERM.nextAt = S.t + TERMINAL_GAP;
}
function terminalPrompt() {
  const T = S.terminal; if (!T) return '';
  const d = Math.hypot(T.x - player.pos.x, T.z - player.pos.z);
  if (d > 4 || Math.abs(T.y - player.pos.y) > 3) return '';
  if (IN.interactP) { IN.interactP = false; openTerminal(); return ''; }
  return `${keyHint('E', 'X')}Service Terminal`;
}
function openTerminal() {
  if (S.mode !== 'play' || !S.terminal) return;
  $('#prompt').hidden = true; S.prevMode = 'play'; S.mode = 'terminal'; unlockPointer();
  TERM.sel = -1; renderTerminal(); $('#terminal').hidden = false; focusFirst();
}
function closeTerminal() { $('#terminal').hidden = true; S.mode = 'play'; lockPointer(); }
function renderTerminal() {
  const b = S.bolts || 0, el = $('#termBody');
  $('#termBolts').textContent = b;
  if (TERM.sel < 0) {
    const rows = L.store.map((it, i) => ({ it, i, why: termRefusal(it) })).filter(r => TERM_KINDS.includes(r.it.kind));
    el.innerHTML = `<p class="termnote">Pick a part from storage. It is swapped for a random part of the same level for <b>${TERMINAL_COST}</b> bolts.</p>` +
      (rows.length ? rows.map(r => `<button class="btn ghost nav termrow" data-i="${r.i}" ${r.why ? 'aria-disabled="true" data-why="' + r.why + '"' : ''}>${partIcon(r.it)} ${itemName(r.it)} · Lv ${r.it.lvl}${r.why ? ' <em>' + r.why + '</em>' : ''}</button>`).join('') : '<p class="termnote">Nothing in storage can be deposited.</p>');
    $$('#termBody .termrow').forEach(bn => bn.addEventListener('click', () => { if (bn.getAttribute('aria-disabled')) { sfx('deny'); denyFx(bn); return; } TERM.sel = +bn.dataset.i; renderTerminal(); focusFirst(); }));
  } else {
    const it = L.store[TERM.sel]; if (!it) { TERM.sel = -1; return renderTerminal(); }
    const poor = b < TERMINAL_COST;
    el.innerHTML = `<p class="termnote">Deposit <b>${itemName(it)} · Lv ${it.lvl}</b> and pay <b>${TERMINAL_COST}</b> bolts for a random replacement of the same level?</p>` +
      (poor ? `<p class="termnote">Not enough bolts (−${TERMINAL_COST - b}).</p>` : '') +
      `<div class="termbtns"><button class="btn nav" id="termYes" ${poor ? 'aria-disabled="true"' : ''}>Confirm</button><button class="btn ghost nav" id="termNo">Cancel</button></div>`;
    $('#termNo').addEventListener('click', () => { TERM.sel = -1; renderTerminal(); focusFirst(); });
    $('#termYes').addEventListener('click', () => { if (poor) { sfx('deny'); denyFx($('#termYes')); return; } terminalConfirm(); });
  }
}
/* the single transaction: all checks first, then pay + swap in place + despawn together */
function terminalConfirm() {
  const it = L.store[TERM.sel];
  if (!S.terminal || !it || termRefusal(it) || (S.bolts || 0) < TERMINAL_COST) { TERM.sel = -1; renderTerminal(); return; }
  const n = termRoll(it);
  S.bolts -= TERMINAL_COST;
  L.store[TERM.sel] = n;                       // same slot: never lost, never duplicated, storage size unchanged
  if (typeof discoverItem === 'function') discoverItem(n);
  const p = S.terminal.group.position.clone().setY(S.terminal.y + 1.5);
  burst(p, 0xff7a1a, 18); ring(p, 4, 0.6, 0xff7a1a); sfx('loot'); sfx('combine', 0.6);
  clearTerminal(); closeTerminal();
  banner(itemName(n).toUpperCase(), `Lv ${n.lvl} · swapped`, rarityOf(n.lvl).css, 2.4);
}
$('#termLeave').addEventListener('click', closeTerminal);
