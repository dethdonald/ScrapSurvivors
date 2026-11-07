'use strict';
/* ============================================================
   SYMBOLS: a small icon for every recurring stat, ability and perk, used in the menus instead of words.
   Hover (or focus with a gamepad) anything with a data-tip and a little label tells you what it is.
   ============================================================ */
const SYM = {
  // ---- stats ----
  hp:      ['Health',        '<path d="M12 21 3.5 12.6A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.6z"/>'],
  shield:  ['Shield',        '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/>'],
  jump:    ['Jump height',   '<path d="M12 2 5 9h4v6h6V9h4z"/><rect x="4" y="18" width="16" height="3"/>'],
  speed:   ['Move speed',    '<path d="M3 5l7 7-7 7V5zm9 0 7 7-7 7V5z"/>'],
  reload:  ['Reload speed',  '<path d="M12 4a8 8 0 1 0 7.7 10h-3.1A5 5 0 1 1 12 7v3l5-4.5L12 1z"/>'],
  rate:    ['Fire rate',     '<path d="M3 9h10l3 3-3 3H3zM3 3h6l2 2-2 2H3zM3 17h6l2 2-2 2H3z"/><rect x="18" y="10" width="3" height="4"/>'],
  crit:    ['Critical hits (double damage)', '<path d="M12 1l2.6 6.6L21 5l-3 6.2L23 13l-6.4 1.6L18 21l-6-3.6L6 21l1.4-6.4L1 13l5-1.8L3 5l6.4 2.6z"/>'],
  slot:    ['Storage slots', '<path d="M3 7l9-5 9 5v10l-9 5-9-5z" fill-opacity=".35"/><path d="M3 7l9 5 9-5M12 12v10" stroke="currentColor" stroke-width="2" fill="none"/>'],
  multi:   ['Extra projectile chance', '<circle cx="5" cy="12" r="3"/><path d="M8 11h4l7-6v3l-5 4 5 4v3l-7-6H8z"/>'],
  luck:    ['Luck',          '<circle cx="8.5" cy="8.5" r="4"/><circle cx="15.5" cy="8.5" r="4"/><circle cx="8.5" cy="15.5" r="4"/><circle cx="15.5" cy="15.5" r="4"/><rect x="11" y="15" width="2" height="8"/>'],
  dmg:     ['Damage',        '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>'],
  xp:      ['Experience',    '<path d="M12 2l7 10-7 10-7-10z"/>'],
  circuits: ['Circuits (kept between runs)', '<rect x="5" y="5" width="14" height="14" rx="1.5"/><rect x="9" y="9" width="6" height="6" fill="#0b0e10"/><path d="M8 1h2v4H8zM14 1h2v4h-2zM8 19h2v4H8zM14 19h2v4h-2zM1 8h4v2H1zM1 14h4v2H1zM19 8h4v2h-4zM19 14h4v2h-4z"/>'],
  bolts:   ['Bolts',         '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><circle cx="12" cy="12" r="3.5" fill="#0b0e10"/>'],
  magnet:  ['Pickup range',  '<path d="M4 3h5v9a3 3 0 0 0 6 0V3h5v9a8 8 0 0 1-16 0z"/><rect x="4" y="3" width="5" height="3" fill="#e8ecee"/><rect x="15" y="3" width="5" height="3" fill="#e8ecee"/>'],
  radar:   ['Radar range',   '<circle cx="12" cy="13" r="2.5"/><path d="M6.3 7.3a8 8 0 0 0 0 11.4l1.7-1.7a5.6 5.6 0 0 1 0-8zM17.7 7.3a8 8 0 0 1 0 11.4L16 17a5.6 5.6 0 0 0 0-8z"/><path d="M3.5 4.5a12 12 0 0 0 0 17l1.4-1.4a10 10 0 0 1 0-14.2zM20.5 4.5a12 12 0 0 1 0 17l-1.4-1.4a10 10 0 0 0 0-14.2z" opacity=".55"/>'],
  dash:    ['Dash charges',  '<path d="M13 2 4 14h6l-2 8 10-13h-6z"/>'],
  airjump: ['Air jumps',     '<path d="M12 1 6 7h4v3h4V7h4zM12 11l-6 6h4v5h4v-5h4z"/>'],
  weight:  ['Weight',        '<path d="M9 3h6l1 4h3l2 14H3L5 7h3z"/><circle cx="12" cy="5" r="1.4" fill="#0b0e10"/>'],
  jet:     ['Jetpack thrust', '<rect x="7" y="2" width="10" height="11" rx="2"/><path d="M8 14h3l-1.5 8zM13 14h3l-1.5 8z"/>'],
  step:    ['Step-up height', '<path d="M2 20h6v-5h6v-5h6V4h2v18H2z"/>'],
  slip:    ['Slippery wheels', '<circle cx="9" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="3"/><path d="M19 4c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z"/>'],
  auto:    ['Aims itself',   '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.5"/><path d="M11 1h2v5h-2zM11 18h2v5h-2zM1 11h5v2H1zM18 11h5v2h-5z"/>'],
  manual:  ['You aim it',    '<path d="M5 2l14 9-6 1.5 4 7.5-3 1.5-4-7.5L5 18z"/>'],
  twin:    ['Twin mount: alternates guns', '<path d="M2 6h14l3 2-3 2H2zM2 14h14l3 2-3 2H2z"/>'],
  fixed:   ['Bolted on: fires forward on its own, less damage', '<rect x="3" y="9" width="12" height="6"/><path d="M15 10h5l2 2-2 2h-5z"/><circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/>'],
  lock:    ['Locked',        '<path d="M7 10V7a5 5 0 0 1 10 0v3h-2.5V7a2.5 2.5 0 0 0-5 0v3z"/><rect x="4" y="10" width="16" height="12" rx="1.5"/><rect x="11" y="13.5" width="2" height="5" fill="#0b0e10"/>'],
  warn:    ['Problem',       '<path d="M12 2 1 21h22z"/><rect x="11" y="8" width="2" height="7" fill="#0b0e10"/><rect x="11" y="17" width="2" height="2" fill="#0b0e10"/>'],
  // ---- run stats ----
  time:    ['Time survived', '<circle cx="12" cy="13" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11 7h2v6l4 2-1 2-5-3z"/><rect x="9" y="1" width="6" height="2"/>'],
  stage:   ['Stage',         '<path d="M5 2h2v20H5zM8 3h12l-3 4 3 4H8z"/>'],
  level:   ['Pilot level',   '<path d="M12 2l3 6 6 1-4.5 4.3 1 6.2L12 16.6 6.5 19.5l1-6.2L3 9l6-1z"/>'],
  kills:   ['Enemies scrapped', '<path d="M12 2a9 9 0 0 0-9 9c0 3 1.5 5 3 6v4h12v-4c1.5-1 3-3 3-6a9 9 0 0 0-9-9z"/><circle cx="8.5" cy="11" r="2.2" fill="#0b0e10"/><circle cx="15.5" cy="11" r="2.2" fill="#0b0e10"/><rect x="9" y="17" width="2" height="4" fill="#0b0e10"/><rect x="13" y="17" width="2" height="4" fill="#0b0e10"/>'],
  biggest: ['Biggest hit',   '<path d="M14 1 5 13h6l-1 10 9-13h-6z"/>'],
  taken:   ['Damage taken',  '<path d="M12 21 3.5 12.6A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.6z"/><path d="M13 5l-3 6h3l-2 6" stroke="#0b0e10" stroke-width="1.8" fill="none"/>'],
  blocked: ['Blocked by shield', '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/><path d="M8 12l3 3 5-6" stroke="#0b0e10" stroke-width="2.2" fill="none"/>'],
  peak:    ['Most enemies at once', '<circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><circle cx="12" cy="7" r="3.4"/><path d="M2 20c0-4 2.5-6 5-6s5 2 5 6zM12 20c0-4 2.5-6 5-6s5 2 5 6z"/><path d="M6 21c0-5 3-7.5 6-7.5s6 2.5 6 7.5z"/>'],
  dist:    ['Distance',      '<circle cx="5" cy="18" r="3"/><circle cx="19" cy="6" r="3"/><path d="M5 18c4-1 3-6 7-6s3-5 7-6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="3 2"/>'],
  parts:   ['Parts found',   '<path d="M10 2h4l.6 2.6 2.4 1 2.2-1.5 2.8 2.8-1.5 2.2 1 2.4L24 12v0l-2.6.6-1 2.4 1.5 2.2-2.8 2.8-2.2-1.5-2.4 1L14 22h-4l-.6-2.6-2.4-1-2.2 1.5-2.8-2.8 1.5-2.2-1-2.4L0 12l2.6-.6 1-2.4-1.5-2.2 2.8-2.8 2.2 1.5 2.4-1z" transform="translate(1 1) scale(.92)"/><circle cx="12" cy="12" r="3.5" fill="#0b0e10"/>'],
  gems:    ['Gems found',    '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12" stroke="#0b0e10" stroke-width="1.2" fill="none"/>'],
  rerolls: ['Rerolls left',  '<path d="M12 4a8 8 0 1 0 7.7 10h-3.1A5 5 0 1 1 12 7v3l5-4.5L12 1z"/>'],
  // ---- stage perks ----
  overclock: ['Overclock: +25% fire rate', '<path d="M12 4a10 10 0 0 0-10 10h3a7 7 0 0 1 14 0h3A10 10 0 0 0 12 4z"/><path d="M11 14 17 7l1 1-5.6 7.4z"/><circle cx="12" cy="15" r="2"/>'],
  titan:   ['Titan Plating: +60 max hull', '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="6" cy="7" r="1.2" fill="#0b0e10"/><circle cx="18" cy="7" r="1.2" fill="#0b0e10"/><circle cx="6" cy="17" r="1.2" fill="#0b0e10"/><circle cx="18" cy="17" r="1.2" fill="#0b0e10"/><path d="M12 8v8M8 12h8" stroke="#0b0e10" stroke-width="2.4"/>'],
  grav:    ['Grav Boots: +1.5 m jump', '<path d="M6 2h7v11l6 3v4H4l2-6z"/><path d="M3 22h18" stroke="currentColor" stroke-width="2"/>'],
  leech:   ['Leech Rounds: each kill heals 1', '<path d="M12 2c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M9 14h6M12 11v6" stroke="#0b0e10" stroke-width="2"/>'],
  aegis:   ['Aegis Lattice: +40 shield, faster recharge', '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" fill-opacity=".4"/><path d="M12 2v20M4 8h16M5 14h14" stroke="currentColor" stroke-width="1.6"/>'],
  skyfall: ['Skyfall: big landings blast enemies', '<circle cx="15" cy="16" r="5"/><path d="M2 2l9 9M6 2l7 7M2 6l7 7" stroke="currentColor" stroke-width="2"/>'],
  payload: ['Heavy Payload: +20% damage', '<circle cx="11" cy="14" r="8"/><path d="M15 7l3-3M18 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>'],
  scav:    ['Scavenger: +30% experience', '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 14l7 7" stroke="currentColor" stroke-width="3.5"/><path d="M10 6l3 4-3 4-3-4z"/>'],
  chest:   ['Frame Body: a new main body block', '<path d="M3 7l9-5 9 5v10l-9 5-9-5z"/><circle cx="12" cy="12" r="3" fill="#0b0e10"/>'],
  refit:   ['Full Refit: start repaired', '<path d="M21 6.5a5 5 0 0 1-6.6 4.7L6 19.6 4.4 18l8.4-8.4A5 5 0 0 1 17.5 3l-3 3 1 2.5 2.5 1z"/>'],
};
// what each level-up stat is called in SYM
const STAT_SYM = { hp: 'hp', shield: 'shield', jump: 'jump', speed: 'speed', reload: 'reload', rate: 'rate', crit: 'crit', slot: 'slot', multi: 'multi', luck: 'luck' };

/* <i class="sym" data-tip="Name">svg</i> */
function sym(key, tip, cls = '') {
  const s = SYM[key]; if (!s) return '';
  const t = tip === '' ? '' : ` data-tip="${(tip || s[0]).replace(/"/g, '&quot;')}"`;     // '' = no label of its own (its parent has one)
  return `<i class="sym ${cls}"${t}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${s[1]}</svg></i>`;
}
const symName = key => (SYM[key] || [''])[0];
/* a weapon as its side-view drawing, named on hover */
const wsym = (it, extra = '') => `<i class="wsym" data-tip="${itemName(it)}${it.lvl ? ' · Lv ' + it.lvl : ''}${extra ? ' · ' + extra : ''}">${weaponIcon(it.type)}</i>`;

/* ---------- the hover label ---------- */
const symTip = document.createElement('div'); symTip.id = 'symTip'; symTip.hidden = true; document.body.appendChild(symTip);
let symTipFor = null;
function showSymTip(el, x, y) {
  const t = el.dataset.tip; if (!t) return;
  if (symTipFor !== el || symTip.textContent !== t) { symTip.textContent = t; symTipFor = el; }
  symTip.hidden = false;
  const w = symTip.offsetWidth, h = symTip.offsetHeight;
  symTip.style.transform = `translate(${Math.round(clamp(x + 14, 6, innerWidth - w - 6))}px, ${Math.round(clamp(y + 18, 6, innerHeight - h - 6))}px)`;
}
function hideSymTip() { symTip.hidden = true; symTipFor = null; }
addEventListener('pointermove', e => {
  const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el) showSymTip(el, e.clientX, e.clientY); else if (!symTip.hidden) hideSymTip();
}, { passive: true });
addEventListener('focusin', e => {
  const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el) { const r = el.getBoundingClientRect(); showSymTip(el, r.left, r.bottom - 10); } else hideSymTip();
});
addEventListener('pointerdown', hideSymTip, { passive: true });

/* static labels in the page marked data-sym="key" become their symbol */
for (const el of document.querySelectorAll('[data-sym]')) el.innerHTML = sym(el.dataset.sym);
/* short unit for a level-up value: the symbol already says what it is */
const statShort = k => { const u = STAT_UPGRADES[k].unit; return u.trim().startsWith('%') ? '%' : / m /.test(u + ' ') && k === 'jump' ? ' m' : ''; };
/* a level-up / case reward card: the stat's symbol, how much, and the rarity colour (the name is on hover) */
/* plain words for what each level-up upgrade does, shown on its card */
const STAT_PLAIN = { hp: 'Health', shield: 'Shield', jump: 'Jump height', speed: 'Move speed', reload: 'Reload speed', rate: 'Fire rate', crit: 'Crit chance', slot: 'Storage slot', multi: 'Extra shot chance', luck: 'Luck' };
function upgradeCardHTML(c) {
  const U = STAT_UPGRADES[c.key], R = RARITY[c.rarity], now = L.bonus[c.key] || 0;
  return `<div class="tag"><b style="color:${R.css}">${R.name}</b></div>
    <div class="bigsym" style="color:${R.css}">${sym(STAT_SYM[c.key], `${U.name}: +${c.value}${U.unit}`)}</div>
    <div class="nm sm">${STAT_PLAIN[c.key] || U.name}</div>
    <div class="ds big upv" style="color:${R.css}">+${c.value}${statShort(c.key)}</div>
    ${now ? `<div class="ft" data-tip="Run total so far">Σ +${+now.toFixed(2)}${statShort(c.key)}</div>` : ''}`;
}
