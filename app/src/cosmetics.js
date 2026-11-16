'use strict';
/* ============================================================
   COSMETICS: purely for looks. Dragged out of the Customize menu and stuck anywhere on the frame
   (they don't use part sockets). Each remembers which part it sits on (the n-th arm, the bottom body...)
   and where on it, so it follows that part on every frame you build, in the hangar and in the field.
   Two are secrets, found by clicking the title robot quickly: 5 clicks lights a cigarette, 15 a joint. Finding one
   unlocks it for good: from then on it sits in the Cosmetics shelf with the others.
   ============================================================ */
const COSMETICS = {
  santa:  { name: 'Santa hat',    icon: '<svg viewBox="0 0 24 24"><path d="M4 18 Q8 4 17 6 L20 13" fill="#d8302c"/><circle cx="20" cy="14" r="2.4" fill="#fff"/><rect x="2" y="17" width="15" height="4" rx="2" fill="#fff"/></svg>', up: true },
  pumpkin:{ name: 'Pumpkin',      icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="9" ry="7" fill="#f07818"/><path d="M12 7v-4" stroke="#3a7a2a" stroke-width="2.4"/><path d="M8 12l2 2H6zM16 12l2 2h-4zM8 17h8l-2 1-2-1-2 1z" fill="#2a1408"/></svg>', up: true },
  badge:  { name: 'Police badge', icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z" fill="#e2b030"/><path d="M12 7l1.5 3.2 3.4.4-2.5 2.3.7 3.4L12 14.6 8.9 16.3l.7-3.4-2.5-2.3 3.4-.4z" fill="#8a5a10"/></svg>', up: false },
  cig:    { name: 'Cigarette',    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="13" width="5" height="4" fill="#d88a3a"/><rect x="7" y="13" width="12" height="4" fill="#f2efe6"/><rect x="19" y="13" width="2.5" height="4" fill="#ff5a1a"/><path d="M20 10c-2-2 2-3 0-5M17 10c-1.5-1.500 1.500-2.500 0-4" stroke="#b8bcbc" stroke-width="1.300" fill="none"/></svg>', up: false, secret: true, clicks: 5 },
  joint:  { name: 'Joint',        icon: '<svg viewBox="0 0 24 24"><path d="M2 14l4-0.600v4.200L2 17z" fill="#c9b58a"/><path d="M6 13.400l13-1.400v6L6 17.600z" fill="#ece6d2"/><path d="M19 12l2.500 1.200v3.600L19 18z" fill="#7a8a4a"/><path d="M21.500 13.200l1 1.800-1 1.800z" fill="#ff7a2a"/><path d="M21 9c-2.500-2 2.500-3.500 0-6M17.500 9c-2-1.500 2-3 0-5" stroke="#a8c0a0" stroke-width="1.400" fill="none"/></svg>', up: false, secret: true, clicks: 15 },
  /* ---------- the store's stock: everything below is bought with circuits in the title screen's Store ---------- */
  crap:   { name: 'Crap',         icon: '<svg viewBox="0 0 24 24"><path d="M6 20h12c1.6 0 2.4-2.4 0-3H6c-2.4.6-1.6 3 0 3z" fill="#6a4a28"/><path d="M8 17h8c1.4 0 2-2.2 0-2.8H8c-2 .6-1.4 2.8 0 2.8z" fill="#7a5630"/><path d="M10 14.2h4c1.2 0 1.7-2 0-2.6h-4c-1.7.6-1.2 2.6 0 2.6z" fill="#8a6238"/><path d="M12 11.6c1.4-1.2.6-2.6-.6-3.2" stroke="#8a6238" stroke-width="1.6" fill="none"/><circle cx="10.4" cy="18" r="0.9" fill="#f4f1ea"/><circle cx="13.6" cy="18" r="0.9" fill="#f4f1ea"/><circle cx="10.4" cy="18.2" r="0.4" fill="#15181c"/><circle cx="13.6" cy="18.2" r="0.4" fill="#15181c"/></svg>', up: true, secret: true },
  clerkcap:{ name: 'Clerk cap',   icon: '<svg viewBox="0 0 24 24"><path d="M5 15a7 7 0 0 1 14 0z" fill="#2f6f52"/><rect x="3" y="15" width="18" height="2.6" rx="1.3" fill="#275c44"/><path d="M12 5v3" stroke="#ffd23a" stroke-width="1.6"/><circle cx="12" cy="4.4" r="1.4" fill="#ffd23a"/></svg>', up: true, secret: true },
  party:  { name: 'Party hat',    icon: '<svg viewBox="0 0 24 24"><path d="M12 2l6 16H6z" fill="#e2465c"/><path d="M8 13h8l.7 2H7.3zM9 8h6l.7 2H8.3z" fill="#ffd23a"/><circle cx="12" cy="2" r="2" fill="#58cfd6"/></svg>', up: true },
  crown:  { name: 'Crown',        icon: '<svg viewBox="0 0 24 24"><path d="M3 9l3.5 4L12 6l5.5 7L21 9v9H3z" fill="#e2b030"/><rect x="3" y="18" width="18" height="3" fill="#c08f1c"/><circle cx="12" cy="13" r="1.6" fill="#e2465c"/></svg>', up: true },
  tophat: { name: 'Top hat',      icon: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="13" fill="#15181c"/><rect x="7" y="11" width="10" height="3" fill="#8a1a2a"/><rect x="3" y="16" width="18" height="3" rx="1.5" fill="#15181c"/></svg>', up: true },
  fedora: { name: 'Fedora',       icon: '<svg viewBox="0 0 24 24"><path d="M7 14V8c0-3 2-4 5-4s5 1 5 4v6z" fill="#6a4a2a"/><path d="M7 11h10v3H7z" fill="#2e2118"/><ellipse cx="12" cy="15.5" rx="10" ry="3" fill="#6a4a2a"/></svg>', up: true },
  spinner:{ name: 'Spinner cap',  icon: '<svg viewBox="0 0 24 24"><path d="M4 16a8 8 0 0 1 16 0z" fill="#3a8cff"/><rect x="4" y="16" width="16" height="2.4" fill="#e2465c"/><rect x="3" y="4" width="18" height="2" rx="1" fill="#ffd23a"/><circle cx="12" cy="5" r="2" fill="#8a8f96"/></svg>', up: true },
  brolly: { name: 'Umbrella hat', icon: '<svg viewBox="0 0 24 24"><path d="M2 14a10 10 0 0 1 20 0z" fill="#e2465c"/><path d="M8.7 14a10 10 0 0 1 2-10 10 10 0 0 1 2 10z" fill="#f4f1ea"/><rect x="11.2" y="14" width="1.6" height="7" fill="#8a8f96"/></svg>', up: true },
  cone:   { name: 'Traffic cone', icon: '<svg viewBox="0 0 24 24"><path d="M12 3l6 15H6z" fill="#f07818"/><path d="M9 12h6l.8 2.4H8.2zM10 8h4l.8 2.2H9.2z" fill="#f4f1ea"/><rect x="3" y="18" width="18" height="3" rx="1" fill="#e06a10"/></svg>', up: true },
  halo:   { name: 'Halo',         icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="#ffe066" stroke-width="3"/></svg>', up: true },
  horns:  { name: 'Devil horns',  icon: '<svg viewBox="0 0 24 24"><path d="M4 20c0-7 1-12 5-15-1 5-1 9 1 12z" fill="#c8323c"/><path d="M20 20c0-7-1-12-5-15 1 5 1 9-1 12z" fill="#c8323c"/></svg>', up: true },
  duck:   { name: 'Rubber duck',  icon: '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="15" rx="8" ry="5" fill="#ffd23a"/><circle cx="16" cy="9" r="4" fill="#ffd23a"/><path d="M20 9h4l-4 2.5z" fill="#f07818"/><circle cx="17" cy="8" r="0.9" fill="#15181c"/></svg>', up: true },
  cowboy: { name: 'Cowboy hat',   icon: '<svg viewBox="0 0 24 24"><path d="M7 13V9c0-3 2-5 5-5s5 2 5 5v4z" fill="#8a5a2a"/><path d="M2 14c3 3 17 3 20 0-1 3-4 4.5-10 4.5S3 17 2 14z" fill="#6a4420"/><path d="M7 11h10v2H7z" fill="#3a2410"/></svg>', up: true },
  dish:   { name: 'Satellite dish', icon: '<svg viewBox="0 0 24 24"><path d="M3 17a11 11 0 0 1 14-12z" fill="#b8c0c8"/><rect x="9" y="14" width="2" height="7" fill="#8a8f96"/><circle cx="12" cy="10" r="1.6" fill="#e2465c"/></svg>', up: true },
  tie:    { name: 'Tie',          icon: '<svg viewBox="0 0 24 24"><path d="M9 2h6l-1.5 3h-3z" fill="#8a1a2a"/><path d="M10.5 6h3l1.8 10-3.3 5-3.3-5z" fill="#c8323c"/></svg>' },
  bowtie: { name: 'Bow tie',      icon: '<svg viewBox="0 0 24 24"><path d="M2 7l8 5-8 5zM22 7l-8 5 8 5z" fill="#c8323c"/><rect x="9.5" y="9" width="5" height="6" rx="1" fill="#8a1a2a"/></svg>' },
  nametag:{ name: 'Name tag',     icon: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="1" fill="#f4f1ea"/><rect x="2" y="5" width="20" height="4" fill="#c8323c"/><path d="M5 13h14M5 16h9" stroke="#15181c" stroke-width="1.6"/></svg>' },
  splat:  { name: 'Brown splat',  icon: '<svg viewBox="0 0 24 24"><path d="M6 12c-2-3 1-6 4-5 1-3 6-3 7 1 3 0 4 4 1 6 1 3-3 6-6 4-3 2-7-1-6-4z" fill="#6a4a28"/><circle cx="19" cy="17" r="1.6" fill="#6a4a28"/><circle cx="4" cy="17" r="1.1" fill="#6a4a28"/></svg>' },
  kickme: { name: 'Kick me sign', icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" fill="#f4f1ea"/><path d="M5 10h3M5 13h5M12 10h7M12 13h4" stroke="#c8323c" stroke-width="1.8"/></svg>' },
  eyes:   { name: 'Googly eyes',  icon: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="5" fill="#f4f1ea"/><circle cx="16" cy="12" r="5" fill="#f4f1ea"/><circle cx="9" cy="13" r="2.2" fill="#15181c"/><circle cx="15" cy="11" r="2.2" fill="#15181c"/></svg>' },
  tache:  { name: 'Moustache',    icon: '<svg viewBox="0 0 24 24"><path d="M12 10c2-3 6-4 9-2-2 5-6 7-9 4-3 3-7 1-9-4 3-2 7-1 9 2z" fill="#2e2118"/></svg>' },
  plunger:{ name: 'Plunger',      icon: '<svg viewBox="0 0 24 24"><path d="M6 16a6 4 0 0 1 12 0z" fill="#c8323c"/><rect x="11" y="2" width="2.4" height="14" fill="#9a6a3a"/></svg>' },
};
const COSMETIC_PRICE = 400;        // circuits · about two stages' worth (see the store in title.js)
for (const [k, c] of Object.entries(COSMETICS)) { c.key = k; if (!c.secret) c.price = COSMETIC_PRICE; }
if (!Array.isArray(META.cosOwned)) META.cosOwned = [];
if (!Array.isArray(CUSTOM.cosmetics)) CUSTOM.cosmetics = [];
if (!Array.isArray(CUSTOM.cosUnlocked)) CUSTOM.cosUnlocked = [];
for (const c of CUSTOM.cosmetics) if (COSMETICS[c.type] && COSMETICS[c.type].secret && !CUSTOM.cosUnlocked.includes(c.type)) CUSTOM.cosUnlocked.push(c.type);   // one already worn from an older version counts as found
/* A cosmetic is yours if you bought it (circuits, in the Store) or found it (the two secrets). */
const cosOwned = type => META.cosOwned.includes(type);
const cosUnlocked = type => COSMETICS[type] && (COSMETICS[type].secret ? CUSTOM.cosUnlocked.includes(type) : cosOwned(type));
function buyCosmetic(type) {
  const c = COSMETICS[type];
  if (!c || c.secret || cosOwned(type)) return 'owned';
  if ((META.circuits || 0) < c.price) return 'poor';
  META.circuits -= c.price; META.cosOwned.push(type); saveMeta();
  return 'bought';
}
function unlockCosmetic(type) { if (COSMETICS[type] && !CUSTOM.cosUnlocked.includes(type)) { CUSTOM.cosUnlocked.push(type); return true; } return false; }

/* ---------- the models (each faces +Y = away from the surface it's stuck to) ---------- */
function cosmeticModel(type) {
  const g = new THREE.Group();
  const mat = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, emissive: e || 0x000000 });
  if (type === 'santa') {
    const red = mat(0xc8242a), white = mat(0xf4f1ea);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 8, 20), white); brim.rotation.x = Math.PI / 2; brim.position.y = 0.05; g.add(brim);
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.32, 16), red); c1.position.y = 0.2; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 14), red); c2.position.set(0.1, 0.48, 0); c2.rotation.z = -0.55; g.add(c2);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), white); pom.position.set(0.24, 0.62, 0); g.add(pom);
  } else if (type === 'pumpkin') {
    const skin = mat(0xf07818, 0x2a0e00);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, r = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
      r.scale.set(0.75, 1, 1); r.position.set(Math.cos(a) * 0.14, 0.24, Math.sin(a) * 0.14); r.rotation.y = -a; g.add(r);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), skin); core.scale.y = 0.85; core.position.y = 0.24; g.add(core);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 6), mat(0x4a7a2a)); stem.position.set(0, 0.5, 0); stem.rotation.z = 0.25; g.add(stem);
    // a jack-o'-lantern face, glowing from inside
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd040 });
    const tri = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.05, -0.035), new THREE.Vector2(0.05, -0.035), new THREE.Vector2(0, 0.05)]));
    for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(tri, glow); e.position.set(x, 0.3, 0.28); g.add(e); }
    const mouth = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.13, 0.02), new THREE.Vector2(-0.06, -0.02), new THREE.Vector2(0, 0.015), new THREE.Vector2(0.06, -0.02), new THREE.Vector2(0.13, 0.02), new THREE.Vector2(0, -0.07)])), glow);
    mouth.position.set(0, 0.17, 0.28); g.add(mouth);
  } else if (type === 'badge') {
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2b030, roughness: 0.3, metalness: 0.85 });
    const s = new THREE.Shape(); s.moveTo(0, 0.2); s.lineTo(0.16, 0.14); s.lineTo(0.16, 0.0); s.quadraticCurveTo(0.15, -0.14, 0, -0.21); s.quadraticCurveTo(-0.15, -0.14, -0.16, 0); s.lineTo(-0.16, 0.14); s.closePath();
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1 }), gold);
    const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.035 : 0.085; if (i) st.lineTo(Math.cos(a) * r, Math.sin(a) * r); else st.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: 0.02, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x8a5a10, roughness: 0.4, metalness: 0.7 }));
    star.position.z = 0.045;
    const face = new THREE.Group(); face.add(shield, star);
    face.rotation.x = -Math.PI / 2; face.position.y = 0.005;            // lies flat, facing out of the surface (+Y)
    g.add(face);
  } else if (type === 'cig' || type === 'joint') {
    // sticks out of the surface and droops a little; smoke curls up from the lit end
    const J = type === 'joint';
    const body = new THREE.Group(); body.rotation.x = J ? 0.28 : 0.35;
    let tipY;
    if (J) {
      // hand-rolled: a cardboard tip, a cone that fattens toward the lit end, a twist of paper burnt down to the ember
      const paperM = mat(0xece6d2);
      const crutch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 10), mat(0xc9b58a)); crutch.position.y = 0.0; body.add(crutch);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.031, 0.4, 12), paperM); cone.position.y = 0.245; body.add(cone);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.38, 0.012), mat(0xd6cfb6)); seam.position.set(0.046, 0.25, 0); seam.rotation.z = -0.078; body.add(seam);
      const char = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.03, 12), mat(0x4a4436)); char.position.y = 0.46; body.add(char);
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.035, 12), new THREE.MeshBasicMaterial({ color: 0xff6a1a })); ember.position.y = 0.492; body.add(ember);
      const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.025, 10), mat(0x8a8a86)); ash.position.y = 0.52; body.add(ash);
      g.userData.ember = ember; tipY = 0.54;
    } else {
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), mat(0xf2efe6)); paper.position.y = 0.22; body.add(paper);
      const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.11, 10), mat(0xd88a3a)); filter.position.y = 0.0; body.add(filter);
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xff5a1a })); ember.position.y = 0.405; body.add(ember);
      const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.034, 0.02, 10), mat(0x8a8a86)); ash.position.y = 0.42; body.add(ash);
      g.userData.ember = ember; tipY = 0.43;
    }
    g.add(body);
    g.userData.tip = new THREE.Vector3(0, tipY, 0); g.userData.tipObj = body;
    g.userData.smoke = []; g.userData.smokeK = J ? 1.7 : 1;                 // the joint's smoke is thicker and hangs about
    const smokeMat = () => new THREE.SpriteMaterial({ color: J ? 0xc8d8c4 : 0xd8dcdc, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < (J ? 14 : 10); i++) { const p = new THREE.Sprite(smokeMat()); p.userData.t = i / (J ? 14 : 10); p.userData.noShadow = true; g.add(p); g.userData.smoke.push(p); }
  }
  else if (COS_BUILD[type]) COS_BUILD[type](g, mat);
  const inner = new THREE.Group(); inner.add(...g.children); inner.scale.setScalar(COS_SCALE[type] || 1); g.add(inner);
  if (g.userData.tipObj) g.userData.tipScale = inner.scale.x;
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = o.material && o.material.isMeshBasicMaterial; });
  g.userData.cosmetic = type;
  return g;
}

/* ---------- the store's models ----------
   Each is built facing +Y, i.e. straight out of whatever surface it is stuck to. Hats and the like are
   marked `up` in the table above, so they stay upright wherever they are placed; the flat ones (tie, sign,
   splat) lie against the panel they are stuck to. */
const COS_SCALE = { clerkcap: 0.85, crap: 0.9, santa: 0.72, pumpkin: 0.66, badge: 0.9, cig: 1, joint: 1, party: 0.8, crown: 0.85, tophat: 0.8, fedora: 0.85, spinner: 0.85, brolly: 0.9, cone: 0.85, halo: 0.9, horns: 0.85, duck: 0.8, cowboy: 0.9, dish: 0.8, tie: 0.9, bowtie: 0.9, nametag: 0.9, splat: 1, kickme: 0.9, eyes: 0.85, tache: 0.9, plunger: 0.85 };
const COS_BUILD = {
  /* the store's own cap: a soft green cap with a stiff peak and a little gold button */
  clerkcap(g, mat) {
    const green = mat(0x2f6f52), dark = mat(0x275c44);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), green);
    dome.scale.y = 0.75; g.add(dome);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.302, 0.305, 0.07, 16), dark); band.position.y = 0.035; g.add(band);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 18, 1, false, -0.7, 1.4), dark);
    peak.position.set(0, 0.04, 0.16); peak.scale.z = 1.25; g.add(peak);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xe2b030, 0x3a2a00)); btn.position.y = 0.23; g.add(btn);
  },
  /* the swirl: three squashed spheres stacked smallest-on-top, with a little curl and two eyes */
  crap(g, mat) {
    const brown = mat(0x5a3c1e), light = mat(0x6d4a26);
    const tiers = [[0.3, 0.0, brown], [0.23, 0.17, light], [0.155, 0.3, brown]];
    for (const [r, y, m] of tiers) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
      ball.scale.y = 0.62; ball.position.y = y + r * 0.5; g.add(ball);
    }
    const curl = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 10), light);
    curl.position.set(0.03, 0.47, 0); curl.rotation.z = -0.5; g.add(curl);
    for (const sgn of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat(0xf4f1ea));
      w.position.set(sgn * 0.1, 0.24, 0.2); g.add(w);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0x15181c));
      pu.position.set(sgn * 0.1, 0.24, 0.255); g.add(pu);
    }
  },
  party(g, mat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.62, 14), mat(0xd8384c)); cone.position.y = 0.31; g.add(cone);
    for (const [y, c] of [[0.18, 0xffd23a], [0.34, 0x58cfd6], [0.48, 0xf4f1ea]]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.26 * (1 - y / 0.72), 0.022, 6, 16), mat(c)); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
    }
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0x58cfd6)); pom.position.y = 0.66; g.add(pom);
  },
  crown(g, mat) {
    const gold = mat(0xe2b030, 0x3a2a00);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 16, 1, true), gold); band.position.y = 0.07; band.material.side = THREE.DoubleSide; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a2 = i / 6 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), gold);
      sp.position.set(Math.cos(a2) * 0.24, 0.23, Math.sin(a2) * 0.24); g.add(sp);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(i % 2 ? 0xc8323c : 0x3a8cff, 0x200810));
      jewel.position.set(Math.cos(a2) * 0.25, 0.1, Math.sin(a2) * 0.25); g.add(jewel);
    }
  },
  tophat(g, mat) {
    const blk = mat(0x15181c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 20), blk); brim.position.y = 0.02; g.add(brim);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.52, 18), blk); tube.position.y = 0.3; g.add(tube);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.26, 0.1, 18), mat(0x8a1a2a)); band.position.y = 0.11; g.add(band);
  },
  fedora(g, mat) {
    const tan = mat(0x6a4a2a);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.035, 20), tan); brim.position.y = 0.02; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.3, 16), tan); crown.position.y = 0.18; g.add(crown);
    const pinch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), mat(0x55381f)); pinch.position.y = 0.33; g.add(pinch);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 16), mat(0x2e2118)); band.position.y = 0.08; g.add(band);
  },
  spinner(g, mat) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a6ea8)); g.add(cap);
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6, i / 4 * Math.PI * 2, Math.PI / 2 * 0.5, 0, Math.PI / 2), mat(i % 2 ? 0xd8384c : 0xffd23a));
      g.add(w);
    }
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), mat(0xd8384c)); brim.position.y = 0.01; g.add(brim);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8), mat(0x8a8f96)); stem.position.y = 0.3; g.add(stem);
    const spin = new THREE.Group(); spin.position.y = 0.35; g.add(spin);
    for (const sgn of [-1, 1]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.08), mat(sgn > 0 ? 0xffd23a : 0xf07818)); bl.position.x = sgn * 0.17; bl.rotation.z = sgn * 0.3; spin.add(bl); }
    g.userData.spin = spin;
  },
  brolly(g, mat) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(0xd8384c));
    dome.position.y = 0.06; dome.material.side = THREE.DoubleSide; g.add(dome);
    for (let i = 0; i < 4; i++) {
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.502, 10, 6, i / 4 * Math.PI * 2 + 0.2, 0.5, 0, Math.PI / 2.6), mat(0xf4f1ea));
      p2.position.y = 0.06; p2.material.side = THREE.DoubleSide; g.add(p2);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), mat(0x8a8f96)); stem.position.y = 0.1; g.add(stem);
  },
  cone(g, mat) {
    const o = mat(0xf07818, 0x200800);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), o); base.position.y = 0.025; g.add(base);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 14), o); body.position.y = 0.33; g.add(body);
    for (const [y, r] of [[0.28, 0.13], [0.42, 0.09]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.03, 0.09, 14), mat(0xf4f1ea)); b.position.y = y; g.add(b); }
  },
  halo(g) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 8, 22), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.55; g.add(ring);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = Math.PI / 2; glow.position.y = 0.55; g.add(glow);
    g.userData.bob = ring; g.userData.bob2 = glow;
  },
  horns(g, mat) {
    for (const sgn of [-1, 1]) {
      const horn = new THREE.Group(); horn.position.set(sgn * 0.17, 0.02, 0);
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.ConeGeometry(0.075 - i * 0.016, 0.14, 8), mat(0xc8323c, 0x2a0408));
        seg.position.set(sgn * i * 0.035, 0.07 + i * 0.115, 0); seg.rotation.z = -sgn * (0.12 + i * 0.12); horn.add(seg);
      }
      g.add(horn);
    }
  },
  duck(g, mat) {
    const y = mat(0xffd23a, 0x3a2a00);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), y); body.scale.set(1.25, 0.9, 1); body.position.y = 0.2; g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 8), y); tail.position.set(-0.26, 0.28, 0); tail.rotation.z = 1.1; g.add(tail);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), y); head.position.set(0.19, 0.42, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), mat(0xf07818)); beak.position.set(0.33, 0.4, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    for (const sgn of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mat(0x15181c)); e.position.set(0.25, 0.46, sgn * 0.1); g.add(e); }
  },
  cowboy(g, mat) {
    const br = mat(0x8a5a2a);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), br); crown.scale.y = 1.15; crown.position.y = 0.04; g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.03, 20), mat(0x6a4420)); brim.position.y = 0.02; g.add(brim);
    for (const sgn of [-1, 1]) { const curl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.4), mat(0x6a4420)); curl.position.set(sgn * 0.42, 0.06, 0); curl.rotation.z = -sgn * 0.5; g.add(curl); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.06, 16), mat(0x3a2410)); band.position.y = 0.07; g.add(band);
  },
  dish(g, mat) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), mat(0x8a8f96)); pole.position.y = 0.15; g.add(pole);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xc8ccd0));
    d.material.side = THREE.DoubleSide; d.rotation.x = -0.9; d.position.y = 0.42; g.add(d);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), mat(0x8a8f96)); arm.position.set(0, 0.5, 0.12); arm.rotation.x = -0.9; g.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xc8323c, 0x400000)); tip.position.set(0, 0.57, 0.21); g.add(tip);
  },
  tie(g, mat) {
    const red = mat(0xc8323c, 0x200004);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.07), red); knot.position.y = 0.04; g.add(knot);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.5, 0.05), red); blade.position.set(0, -0.26, 0.01); g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 4), red); tip.position.set(0, -0.56, 0.01); tip.rotation.y = Math.PI / 4; tip.rotation.x = Math.PI; g.add(tip);
  },
  bowtie(g, mat) {
    const red = mat(0xc8323c, 0x200004);
    for (const sgn of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 4), red);
      w.position.set(sgn * 0.17, 0.02, 0); w.rotation.z = sgn * Math.PI / 2; w.rotation.y = Math.PI / 4; g.add(w);
    }
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.09), mat(0x8a1a2a)); knot.position.y = 0.02; g.add(knot);
  },
  nametag(g, mat) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.03), mat(0xf4f1ea)); plate.rotation.x = -Math.PI / 2; plate.position.y = 0.015; g.add(plate);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.035), mat(0xc8323c)); bar.rotation.x = -Math.PI / 2; bar.position.set(0, 0.02, -0.15); g.add(bar);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3 - i * 0.07, 0.035, 0.01), mat(0x5a6168)); l.rotation.x = -Math.PI / 2; l.position.set(-0.08 + i * 0.03, 0.025, 0.02 + i * 0.1); g.add(l); }
  },
  splat(g, mat) {
    const brown = mat(0x5a3c1e);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), brown); blob.scale.set(1, 0.28, 1); blob.position.y = 0.03; g.add(blob);
    for (let i = 0; i < 7; i++) {
      const a2 = Math.random() * Math.PI * 2, r = 0.22 + Math.random() * 0.26, s2 = 0.05 + Math.random() * 0.07;
      const d = new THREE.Mesh(new THREE.SphereGeometry(s2, 8, 6), brown); d.scale.y = 0.35;
      d.position.set(Math.cos(a2) * r, 0.02, Math.sin(a2) * r); g.add(d);
    }
  },
  kickme(g, mat) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.02), mat(0xf4f1ea)); card.rotation.x = -Math.PI / 2; card.rotation.z = 0.08; card.position.y = 0.012; g.add(card);
    const red = mat(0xc8323c);
    const word = (x, z, w) => { const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, 0.008), red); l.rotation.x = -Math.PI / 2; l.rotation.z = 0.08; l.position.set(x, 0.022, z); g.add(l); };
    word(-0.08, -0.08, 0.34); word(0.1, 0.06, 0.26);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), mat(0xd8d2c0)); tape.rotation.x = -Math.PI / 2; tape.position.set(-0.28, 0.02, 0); g.add(tape);
  },
  eyes(g, mat) {
    for (const sgn of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat(0xf4f1ea)); w.scale.z = 0.7; w.position.set(sgn * 0.19, 0.08, 0); g.add(w);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0x15181c));
      pupil.position.set(sgn * 0.19 + rand(-0.04, 0.04), 0.08 + rand(-0.03, 0.05), 0.09); g.add(pupil);
    }
  },
  tache(g, mat) {
    const dark = mat(0x2e2118);
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.018, 10, 7), dark);
        seg.scale.set(1, 0.6, 0.7);
        seg.position.set(sgn * (0.06 + i * 0.1), 0.03 + i * i * 0.012, 0); g.add(seg);
      }
    }
  },
  plunger(g, mat) {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb02a34));
    cup.scale.y = 1.1; cup.material.side = THREE.DoubleSide; g.add(cup);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 18), mat(0x8a1a22)); lip.rotation.x = Math.PI / 2; lip.position.y = 0.02; g.add(lip);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.66, 10), mat(0x9a6a3a)); stick.position.y = 0.55; g.add(stick);
  },
};

/* ---------- where one sits: the n-th part of a kind, a path down to the sub-part, a point and a normal ---------- */
function cosmeticTargets(L) { return L && L.body ? [L.body, ...childrenOf(L.body)] : []; }
function cosmeticPart(L, reg, c) {
  const its = cosmeticTargets(L).filter(it => it.kind === c.kind);
  const it = its[c.idx] || null;
  let g = it && reg.partOf.get(it);
  if (!g) { g = L && L.body && reg.partOf.get(L.body); return g ? { g, exact: false } : null; }
  // follow the path down to the exact sub-part (an arm's forearm, a leg's shin) when this part is the same type
  let node = g;
  if (it.type === c.ptype && Array.isArray(c.path)) for (const k of c.path) { if (!node.children[k]) { node = g; break; } node = node.children[k]; }
  return { g: node, exact: it.type === c.ptype };
}
function placeCosmetic(obj, c) {
  obj.position.set(c.p[0], c.p[1], c.p[2]);
  const n = new THREE.Vector3(c.n[0], c.n[1], c.n[2]).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  if (c.spin) obj.rotateY(c.spin);
  obj.scale.setScalar(c.s || 1);
}
/* called at the end of buildRobot */
function attachCosmetics(root, L, reg) {
  root.userData.cosmetics = [];
  for (const c of CUSTOM.cosmetics) {
    const at = cosmeticPart(L, reg, c); if (!at) continue;
    const obj = cosmeticModel(c.type);
    obj.userData.cdata = c;
    if (at.exact) { placeCosmetic(obj, c); at.g.add(obj); }
    else cosmeticAuto(root, obj, c, at.g);                 // its part isn't on this frame: find it a sensible spot on this one
    root.userData.cosmetics.push(obj);
  }
}
/* A cosmetic remembers the part it was stuck to on the robot you dressed (the title robot, which is a random build).
   On a frame without that part it used to be dropped at a fixed point "on top of the bottom body", which on most
   builds is INSIDE the robot, under the torso: that was the cigarette clipping into the player in the hangar and in
   a run. Now a ray is cast at the finished model instead (straight down for hats and pumpkins, at the upper front
   for everything else) and the cosmetic goes exactly where it lands, on whatever part that is. */
const _caRay = new THREE.Raycaster(), _caBox = new THREE.Box3(), _caQ = new THREE.Quaternion();
function cosmeticAuto(root, obj, c, fallbackG) {
  const up = COSMETICS[c.type] && COSMETICS[c.type].up;
  root.updateMatrixWorld(true);
  _caBox.makeEmpty(); root.traverse(o => { if (o.isMesh && o.visible && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _caBox.union(new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
  const bb = _caBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, h = bb.max.y - bb.min.y;
  const front = new THREE.Vector3(0, 0, -1).transformDirection(root.matrixWorld);          // the robot faces -Z
  const ok = hh => { if (!hh.object.visible || hh.object.isSprite || !hh.face) return false; let n = hh.object; while (n) { if (n.userData && n.userData.cosmetic) return false; n = n.parent; } return true; };
  let hit = null;
  // a few tries: the centre line first, then a little to each side / lower, in case the ray slips between parts
  const tries = up ? [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]] : [[0, 0.74], [0, 0.66], [0.12, 0.7], [-0.12, 0.7], [0, 0.56], [0, 0.82]];
  for (const [a, b] of tries) {
    if (up) _caRay.set(new THREE.Vector3(cx + a, bb.max.y + 2, cz + b), new THREE.Vector3(0, -1, 0));
    else _caRay.set(new THREE.Vector3(cx + a, bb.min.y + h * b, cz).addScaledVector(front, 6), front.clone().negate());
    _caRay.far = 40;
    hit = _caRay.intersectObject(root, true).find(ok);
    if (hit) break;
  }
  if (!hit) { placeCosmetic(obj, { p: [0, 0.6, 0], n: [0, 1, 0], s: c.s }); fallbackG.add(obj); return; }
  const target = hit.object.parent || root;
  const nw = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (up) { nw.y += 1.3; nw.normalize(); }
  const nl = nw.applyQuaternion(target.getWorldQuaternion(_caQ).invert()), p = target.worldToLocal(hit.point.clone());
  const ws = target.getWorldScale(new THREE.Vector3()).x / (root.getWorldScale(new THREE.Vector3()).x || 1);
  placeCosmetic(obj, { p: [p.x, p.y, p.z], n: [nl.x, nl.y, nl.z], s: (c.s || 1) / (ws || 1) * 1, spin: c.spin });
  target.add(obj);
}

/* ---------- animation: the ember flickers, smoke drifts up (in world space) and fades ---------- */
const _cosQ = new THREE.Quaternion(), _cosV = new THREE.Vector3(), _cosU = new THREE.Vector3();
function cosmeticTick(root, dt) {
  if (!root || !root.userData.cosmetics) return;
  const t = performance.now() * 0.001;
  for (const obj of root.userData.cosmetics) {
    const ud = obj.userData;
    if (ud.spin) ud.spin.rotation.y += dt * 7;                                  // the propeller beanie
    if (ud.bob) { const y = 0.55 + Math.sin(t * 1.6) * 0.04; ud.bob.position.y = y; if (ud.bob2) ud.bob2.position.y = y; }   // the halo drifts
    if (!ud.smoke) continue;
    ud.ember.material.color.setHSL(0.04, 1, 0.45 + 0.12 * Math.sin(t * 9) + 0.06 * Math.sin(t * 23));
    // world "up" expressed in the cigarette's own space, so the smoke always rises
    obj.getWorldQuaternion(_cosQ).invert();
    const ws = obj.getWorldScale(_cosV).x || 1;
    _cosU.set(0, 1, 0).applyQuaternion(_cosQ).divideScalar(ws);
    const tip = ud.tip.clone().applyEuler(ud.tipObj.rotation).multiplyScalar(ud.tipScale || 1);
    for (const p of ud.smoke) {
      p.userData.t += dt * 0.32; if (p.userData.t > 1) p.userData.t -= 1;
      const k = p.userData.t, rise = k * 1.1;
      p.position.copy(tip).addScaledVector(_cosU, rise);
      p.position.x += Math.sin(k * 7 + p.id) * 0.05 * k; p.position.z += Math.cos(k * 5 + p.id) * 0.05 * k;
      const sk = ud.smokeK || 1, s = (0.05 + k * 0.28) * (0.75 + 0.25 * sk) / ws; p.scale.set(s, s, s);
      p.material.opacity = Math.min(0.75, Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.4 * (1 - k * 0.5) * sk);
    }
  }
}
