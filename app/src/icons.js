'use strict';
/* ============================================================
   ICON REGISTRY (Chunk 13): one place to ask for any icon, at the four standard sizes (16, 24, 32, 48 px).
   ICON.html(kind, key, px) -> markup.   kinds: weapon, arm, lower, block, leg, module, gem, adapter, orb, power, stat, status
   The drawings themselves live next to the gear they show (WEAPON_ICONS / PART_ICONS in data.js, SYM in symbols.js);
   gems, power-ups and status effects are drawn here. Anything unknown gets a plain placeholder, never an empty hole.
   ============================================================ */
const ICON = (() => {
  const SIZES = [16, 24, 32, 48];
  /* gem: the same cut stone for all, with a mark inside for what it does */
  const GEM_MARK = {
    bounce:    '<path d="M5 19c3-12 6-12 7-3 1-9 4-9 7 3" stroke="#000" stroke-opacity=".55" stroke-width="2" fill="none"/>',
    homing:    '<circle cx="12" cy="13" r="4.5" stroke="#000" stroke-opacity=".55" stroke-width="1.6" fill="none"/><path d="M12 6v14M5 13h14" stroke="#000" stroke-opacity=".55" stroke-width="1.4"/>',
    orbit:     '<ellipse cx="12" cy="13" rx="7.5" ry="3.5" stroke="#000" stroke-opacity=".55" stroke-width="1.6" fill="none"/><circle cx="12" cy="13" r="2" fill="#000" fill-opacity=".55"/>',
    lightning: '<path d="M13.5 5 7 14h4l-1 6 7-10h-4z" fill="#000" fill-opacity=".55"/>',
    explode:   '<path d="M12 5l1.6 4.2L18 8l-2 4 3.5 2.5-4.4.5L13.5 19 12 15l-1.5 4-1.6-4-4.4-.5L8 12 6 8l4.4 1.2z" fill="#000" fill-opacity=".55"/>',
    split:     '<path d="M12 19v-6M12 13L7 7M12 13l5-6" stroke="#000" stroke-opacity=".55" stroke-width="2" fill="none"/>',
    fire:      '<path d="M12 5c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 .5 2 1.5 2C11 9 11 7 12 5z" fill="#000" fill-opacity=".55"/>',
    ice:       '<path d="M12 5v14M6 8l12 8M18 8L6 16" stroke="#000" stroke-opacity=".55" stroke-width="1.8" fill="none"/>',
    lifesteal: '<path d="M12 19l-5-5a3 3 0 0 1 5-3 3 3 0 0 1 5 3z" fill="#000" fill-opacity=".55"/>',
    poison:    '<path d="M12 5c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" fill="#000" fill-opacity=".55"/>',
  };
  const POWER = {
    vacuum:  ['Magnet',       '<path fill-rule="evenodd" d="M3 2h6v10a3 3 0 0 0 6 0V2h6v10a9 9 0 0 1-18 0z"/>'],
    nuke:    ['Nuke',         '<circle cx="12" cy="12" r="2.4"/><path d="M12 3a9 9 0 0 1 7.8 4.5l-5.6 3.2a2.5 2.5 0 0 0-2.2-1.2zM20.8 12a9 9 0 0 1-4.5 7.8l-3.2-5.6a2.5 2.5 0 0 0 1.2-2.2zM12 21a9 9 0 0 1-7.8-4.5l5.6-3.2a2.5 2.5 0 0 0 2.2 1.2zM3.2 12a9 9 0 0 1 4.5-7.8l3.2 5.6A2.5 2.5 0 0 0 9.7 12z"/>'],
    frenzy:  ['Coin Frenzy',  '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M12 6v12M9 9h5a2 2 0 0 1 0 3h-4a2 2 0 0 0 0 3h5" stroke="#000" stroke-opacity=".6" stroke-width="1.6" fill="none"/>'],
    berserk: ['Berserk',      '<path d="M12 1c2 5 7 6 7 12a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2 1 3 2.5 3.5C10 8 11 5 12 1z"/>'],
    health:  ['Repair Kit',   '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/>'],
    case:    ['Weapon Case',  '<path d="M3 7h18v13H3z"/><path d="M8 7V4h8v3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M3 12h18M11 11h2v3h-2z" stroke="#000" stroke-opacity=".55" stroke-width="1.4" fill="none"/>'],
  };
  const STATUS = {
    burn:      ['Burning',   '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5.3 2 1 3 2.5 3.5C10 8 11 5 12 2z"/>'],
    chill:     ['Chilled',   '<path d="M11 1h2v22h-2zM3 6l1-1.7 18 10.4-1 1.7zM21 6l-1-1.7L2 14.7l1 1.7z"/>'],
    freeze:    ['Frozen',    '<path d="M12 1l3 5h-6zM12 23l-3-5h6zM1 12l5-3v6zM23 12l-5 3V9z"/><circle cx="12" cy="12" r="4"/>'],
    poison:    ['Poisoned',  '<path d="M12 2c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z"/>'],
    stun:      ['Staggered', '<path d="M12 2l2.4 6.4L21 9l-5 4.3L17.5 20 12 16.5 6.5 20 8 13.3 3 9l6.6-.6z"/>'],
    shielded:  ['Shielded',  '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/>'],
    resist:    ['Resistant', '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/><path d="M8 12l3 3 5-6" stroke="#000" stroke-opacity=".6" stroke-width="2" fill="none"/>'],
  };
  const NAMES = { weapon: k => (WEAPONS[k] || {}).name, arm: k => (ARMS[k] || {}).name, leg: k => (LEGS[k] || {}).name, lower: k => (LOWERS[k] || {}).name, block: k => (BLOCKS[k] || {}).name, module: k => (MODULES[k] || {}).name,
    gem: k => ATTRS[k] && ATTRS[k].name, adapter: k => (ADAPTERS[k] || {}).name, orb: () => 'Upgrade Orb' };
  const frame = (px, vb, inner, color, cls) => `<svg class="ic-svg ${cls || ''}" width="${px}" height="${px}" viewBox="${vb}" fill="currentColor" ${color ? `style="color:${color}"` : ''} aria-hidden="true">${inner}</svg>`;
  /* returns { vb, inner, color, name } or null */
  function draw(kind, key) {
    if (kind === 'weapon') return WEAPON_ICONS[key] ? { vb: '0 0 32 14', inner: WEAPON_ICONS[key], name: NAMES.weapon(key), wide: true } : null;
    if (kind === 'gem') return ATTRS[key] ? { vb: '0 0 24 24', inner: PART_ICONS.gem + (GEM_MARK[key] || ''), color: ATTRS[key].color, name: NAMES.gem(key) } : null;
    if (kind === 'power') return POWER[key] ? { vb: '0 0 24 24', inner: POWER[key][1], name: POWER[key][0], color: key === 'health' ? '#4fd06b' : key === 'nuke' ? '#ffa21a' : key === 'frenzy' ? '#e8c35a' : key === 'berserk' ? '#e2465c' : '' } : null;
    if (kind === 'status') return STATUS[key] ? { vb: '0 0 24 24', inner: STATUS[key][1], name: STATUS[key][0], color: ({ burn: '#ff7a2a', chill: '#9fd8ff', freeze: '#bfe9ff', poison: '#58d62a', stun: '#ffd23a', shielded: '#6fa6ff', resist: '#bfe9ff' })[key] } : null;
    if (kind === 'stat') return SYM[key] ? { vb: '0 0 24 24', inner: SYM[key][1], name: SYM[key][0] } : null;
    const k2 = kind === 'orb' ? 'orb:universal' : kind + ':' + key;
    return PART_ICONS[k2] ? { vb: '0 0 24 24', inner: PART_ICONS[k2], name: (NAMES[kind] && NAMES[kind](key)) || key } : null;
  }
  const PLACEHOLDER = '<path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="1.2" fill="none"/>';
  function html(kind, key, px = 24, tip) {
    px = SIZES.includes(px) ? px : SIZES.reduce((a, b) => Math.abs(b - px) < Math.abs(a - px) ? b : a);
    const d = draw(kind, key), w = d && d.wide ? px : px, h = d && d.wide ? Math.round(px * 14 / 32 * 10) / 10 : px;
    const inner = d ? d.inner : PLACEHOLDER, vb = d ? d.vb : '0 0 24 24';
    const svg = `<svg class="ic-svg" width="${w}" height="${h}" viewBox="${vb}" fill="currentColor" ${d && d.color ? `style="color:${d.color}"` : ''} aria-hidden="true">${inner}</svg>`;
    const name = tip || (d && d.name) || key;
    return `<span class="ic ic${px}${d && d.wide ? ' wide' : ''}${d ? '' : ' missing'}" data-tip="${String(name).replace(/"/g, '&quot;')}">${svg}</span>`;
  }
  /* icon for an inventory item (any kind) */
  const forItem = (it, px = 24) => it ? html(it.kind === 'leg' ? 'leg' : it.kind, it.type, px) : '';
  /* every key the game has, for tests and the catalog */
  function all() {
    const out = [];
    for (const k in WEAPONS) out.push(['weapon', k]); for (const k in ARMS) out.push(['arm', k]); for (const k in LEGS) out.push(['leg', k]);
    for (const k in LOWERS) out.push(['lower', k]); for (const k in BLOCKS) out.push(['block', k]); for (const k in MODULES) out.push(['module', k]);
    for (const k in ATTRS) out.push(['gem', k]); for (const k in ADAPTERS) out.push(['adapter', k]); out.push(['orb', 'universal']);
    for (const k in POWER) out.push(['power', k]); for (const k in STATUS) out.push(['status', k]); for (const k in SYM) out.push(['stat', k]);
    return out;
  }
  return { SIZES, html, forItem, draw, all, has: (kind, key) => !!draw(kind, key) };
})();
