'use strict';
/* ============================================================
   WEAPON MODEL TIERS (chunk 14)
   Three procedural looks per weapon, chosen from the part level only (visual, never gameplay):
     MK I   L1-2   crude: the original model (L2 gets one small extra detail)
     MK II  L3-4   armored: more barrels/coils/tanks, plates (L4 adds an extra detail)
     MK III L5     absurdly overengineered
   Extra visible barrels NEVER create extra shots: fire() in data.js is untouched.
   Everything reuses the shared geometry/material caches (bx, M, one cached cylinder per size), so a
   weapon costs about the same number of draw calls as before.
   MK II panels "unfold" (about 1 s, sparks, mechanical sound) when an upgrade crosses L2 -> L3.
   The L5 reveal is only HOOKED here (WMOD.hooks.mk3); chunk 15 plugs the cinematic in.
   ============================================================ */
const WMOD = { hooks: { mk3: [] }, pending: new WeakMap(), active: [], geo: new Map(), UNFOLD: 1.0 };
const wmTier = l => (l || 1) >= 5 ? 3 : (l || 1) >= 3 ? 2 : 1;
const WM_ARM = 0x5b6772, WM_STEEL = 0x8c96a0, WM_BRASS = 0xb59a52, WM_DK2 = 0x2e353c;
function wmCyl(r0, r1, len, seg) {                       // one cached geometry per size, already pointing down +z
  const k = r0 + '_' + r1 + '_' + len + '_' + seg; let g = WMOD.geo.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r0, r1, len, seg); g.rotateX(Math.PI / 2); WMOD.geo.set(k, g); }
  return g;
}
function wmKit(g, o) {
  const ox = o[0], oy = o[1], panels = g.userData.panels || (g.userData.panels = []);
  const k = {
    g, ox, oy,
    a(w, h, d, c, x, y, z, em) { const m = bx(w, h, d, c, ox + x, oy + y, z, em); g.add(m); return m; },
    // a plate that unfolds into place from (dx,dy,dz) away
    p(w, h, d, c, x, y, z, dx, dy, dz, em) { const m = k.a(w, h, d, c, x, y, z, em); panels.push({ m, p: m.position.clone(), s: m.scale.clone(), d: new THREE.Vector3(dx, dy, dz) }); return m; },
    c(r0, r1, len, c, x, y, z, seg = 8, em) { const m = new THREE.Mesh(wmCyl(r0, r1, len, seg), M(c, em)); m.position.set(ox + x, oy + y, z); g.add(m); return m; },
    ball(r, c, x, y, z, em) { const m = new THREE.Mesh(ballGeo, M(c, em)); m.scale.setScalar(r); m.position.set(ox + x, oy + y, z); g.add(m); return m; },
  };
  return k;
}
/* ---- the designs: each builder returns { muzzle:[x,y,z] (relative to the mount offset), ...extras } ---- */
const WM_BUILD = {
  /* PISTOL: small boxy -> heavy revolver -> triple-barrel hand cannon */
  pistol: {
    2(k) { const { a, p, c } = k;
      a(0.17, 0.19, 0.4, WM_DK2, 0, 0.02, 0.3); c(0.07, 0.07, 0.2, WM_STEEL, 0, 0.0, 0.38, 10);   // cylinder (revolver drum)
      a(0.09, 0.07, 0.4, COL.joint, 0, 0.1, 0.62); a(0.08, 0.22, 0.12, 0x3a3128, 0, -0.14, 0.12);
      p(0.2, 0.05, 0.3, WM_ARM, 0, 0.14, 0.38, 0, -0.1, 0); p(0.04, 0.16, 0.32, WM_ARM, 0.11, 0.0, 0.36, -0.1, 0, 0); p(0.04, 0.16, 0.32, WM_ARM, -0.11, 0.0, 0.36, 0.1, 0, 0);
      a(0.05, 0.05, 0.06, ORANGE, 0, 0.17, 0.52);
      return { muzzle: [0, 0.1, 0.84] }; },
    3(k) { const { a, p, c } = k;
      a(0.3, 0.26, 0.5, WM_DK2, 0, 0.02, 0.32); c(0.1, 0.1, 0.26, WM_STEEL, 0, -0.02, 0.38, 12);
      for (const x of [-0.09, 0, 0.09]) { c(0.04, 0.04, 0.5, COL.joint, x, 0.1, 0.82, 8); c(0.055, 0.055, 0.06, COL.dark, x, 0.1, 1.08, 8); }
      a(0.3, 0.05, 0.5, WM_ARM, 0, 0.22, 0.62); a(0.1, 0.26, 0.14, 0x3a3128, 0, -0.2, 0.12);
      p(0.05, 0.22, 0.46, WM_ARM, 0.17, 0.0, 0.4, -0.12, 0, 0); p(0.05, 0.22, 0.46, WM_ARM, -0.17, 0.0, 0.4, 0.12, 0, 0); p(0.28, 0.05, 0.3, WM_ARM, 0, -0.12, 0.5, 0, 0.1, 0);
      for (const z of [0.5, 0.7, 0.9]) a(0.28, 0.04, 0.05, ORANGE, 0, 0.26, z);
      a(0.04, 0.1, 0.04, COL.red, 0.18, 0.22, 0.2, 0x601020); a(0.2, 0.05, 0.05, WM_BRASS, 0, 0.32, 0.5);
      return { muzzle: [0, 0.1, 1.12] }; },
  },
  /* AUTOGUN: single -> twin drum -> four-barrel belt-fed */
  autogun: {
    2(k) { const { a, p, c } = k;
      a(0.26, 0.22, 0.5, COL.dark, 0, 0.02, 0.28);
      c(0.1, 0.1, 0.18, 0x3a3128, -0.2, -0.06, 0.26, 12); c(0.1, 0.1, 0.18, 0x3a3128, 0.2, -0.06, 0.26, 12);          // twin drums
      for (const x of [-0.06, 0.06]) { a(0.06, 0.06, 0.34, COL.joint, x, 0.05, 0.7); a(0.09, 0.09, 0.05, COL.dark, x, 0.05, 0.86); }
      p(0.3, 0.05, 0.32, WM_ARM, 0, 0.16, 0.36, 0, -0.1, 0); p(0.04, 0.18, 0.34, WM_ARM, 0.14, 0.02, 0.34, -0.1, 0, 0); p(0.04, 0.18, 0.34, WM_ARM, -0.14, 0.02, 0.34, 0.1, 0, 0);
      a(0.1, 0.22, 0.1, COL.dark, 0, -0.18, 0.3); a(0.24, 0.05, 0.06, ORANGE, 0, 0.2, 0.2);
      return { muzzle: [0, 0.05, 0.92] }; },
    3(k) { const { a, p, c } = k;
      a(0.34, 0.28, 0.6, COL.dark, 0, 0.02, 0.3);
      for (const x of [-0.05, 0.05]) for (const y of [0.0, 0.1]) { c(0.035, 0.035, 0.5, COL.joint, x, y, 0.88, 8); c(0.05, 0.05, 0.08, COL.dark, x, y, 1.14, 8); }
      a(0.3, 0.2, 0.18, WM_ARM, 0, 0.05, 0.72);                                                                      // barrel shroud
      a(0.3, 0.3, 0.3, 0x3a3128, 0.3, -0.04, 0.22);                                                                  // belt box
      for (let i = 0; i < 6; i++) a(0.14, 0.05, 0.05, WM_BRASS, 0.17 - i * 0.003, 0.1 - i * 0.04, 0.34 - i * 0.02);   // belt links feeding in
      p(0.36, 0.05, 0.4, WM_ARM, 0, 0.21, 0.38, 0, -0.1, 0); p(0.05, 0.22, 0.44, WM_ARM, -0.19, 0.02, 0.34, 0.12, 0, 0); p(0.34, 0.05, 0.3, WM_ARM, 0, -0.14, 0.44, 0, 0.1, 0);
      a(0.1, 0.22, 0.12, COL.dark, 0, -0.2, 0.18); a(0.3, 0.05, 0.08, ORANGE, 0, 0.26, 0.2);
      return { muzzle: [0.0, 0.05, 1.2] }; },
  },
  /* SHOTGUN: double -> quad -> eight-barrel breacher with recoil pistons */
  shotgun: {
    2(k) { const { a, p, c } = k;
      a(0.3, 0.24, 0.58, 0x3a3128, 0, 0.02, 0.32);
      for (const x of [-0.065, 0.065]) for (const y of [0.0, 0.13]) c(0.05, 0.05, 0.32, COL.dark, x, y, 0.74, 8);        // four barrels
      a(0.3, 0.1, 0.22, WM_STEEL, 0, -0.05, 0.56);                                                                    // pump
      a(0.1, 0.22, 0.12, 0x3a3128, 0, -0.16, 0.16); a(0.3, 0.05, 0.14, ORANGE, 0, 0.17, 0.42);
      p(0.36, 0.05, 0.3, WM_ARM, 0, 0.22, 0.5, 0, -0.1, 0); p(0.05, 0.22, 0.34, WM_ARM, 0.18, 0.04, 0.46, -0.1, 0, 0); p(0.05, 0.22, 0.34, WM_ARM, -0.18, 0.04, 0.46, 0.1, 0, 0);
      return { muzzle: [0, 0.07, 0.92] }; },
    3(k) { const { a, p, c } = k;
      a(0.5, 0.3, 0.62, 0x3a3128, 0, 0.04, 0.34);
      for (let i = 0; i < 4; i++) for (const y of [0.02, 0.15]) { const x = (i - 1.5) * 0.115; c(0.05, 0.05, 0.42, COL.dark, x, y, 0.86, 8); c(0.062, 0.062, 0.05, WM_STEEL, x, y, 1.08, 8); }   // eight barrels
      for (const x of [-0.27, 0.27]) { c(0.05, 0.05, 0.34, WM_STEEL, x, 0.02, 0.66, 8); c(0.07, 0.07, 0.12, COL.dark, x, 0.02, 0.5, 8); }   // recoil pistons
      a(0.56, 0.1, 0.14, WM_ARM, 0, 0.0, 0.7);                                                                         // breaching clamp
      a(0.4, 0.1, 0.22, WM_STEEL, 0, -0.14, 0.58); a(0.1, 0.24, 0.12, 0x3a3128, 0, -0.2, 0.14);
      p(0.54, 0.05, 0.4, WM_ARM, 0, 0.23, 0.5, 0, -0.12, 0); p(0.05, 0.28, 0.5, WM_ARM, 0.28, 0.04, 0.4, -0.12, 0, 0); p(0.05, 0.28, 0.5, WM_ARM, -0.28, 0.04, 0.4, 0.12, 0, 0);
      for (const z of [0.4, 0.6, 0.8]) a(0.5, 0.04, 0.05, ORANGE, 0, 0.27, z);
      a(0.06, 0.1, 0.06, COL.red, 0.2, 0.3, 0.2, 0x601020);
      return { muzzle: [0, 0.085, 1.14] }; },
  },
  /* SNIPER: slim scope -> heavy precision -> giant rail rifle */
  sniper: {
    2(k) { const { a, p, c } = k;
      a(0.16, 0.2, 0.74, 0x3a4436, 0, 0.02, 0.32); a(0.07, 0.07, 0.7, COL.joint, 0, 0.04, 1.0); a(0.13, 0.12, 0.08, COL.dark, 0, 0.04, 1.34);
      c(0.065, 0.065, 0.42, COL.dark, 0, 0.19, 0.34, 10); c(0.085, 0.085, 0.07, COL.dark, 0, 0.19, 0.56, 10); a(0.04, 0.04, 0.02, 0x58cfd6, 0, 0.19, 0.6, 0x1b6a70);
      p(0.2, 0.05, 0.4, WM_ARM, 0, 0.14, 0.2, 0, -0.1, 0); p(0.04, 0.16, 0.4, WM_ARM, 0.1, 0.0, 0.32, -0.1, 0, 0); a(0.1, 0.18, 0.1, COL.dark, 0, -0.2, 0.46); a(0.04, 0.16, 0.04, COL.joint, 0.06, -0.15, 0.7);   // bipod
      return { muzzle: [0, 0.04, 1.38] }; },
    3(k) { const { a, p, c } = k;
      a(0.22, 0.26, 0.9, 0x3a4436, 0, 0.02, 0.36);
      for (const x of [-0.07, 0.07]) a(0.045, 0.08, 1.0, WM_STEEL, x, 0.04, 1.28);                                      // twin rails
      for (let i = 0; i < 6; i++) a(0.22, 0.02, 0.04, 0x58cfd6, 0, 0.1, 0.9 + i * 0.16, 0x1b6a70);                      // glowing coil rungs
      a(0.16, 0.14, 0.16, COL.dark, 0, 0.04, 1.82); a(0.16, 0.05, 0.3, WM_ARM, 0, 0.14, 1.6);
      c(0.08, 0.08, 0.6, COL.dark, 0, 0.26, 0.44, 12); c(0.11, 0.11, 0.1, COL.dark, 0, 0.26, 0.76, 12); c(0.11, 0.11, 0.08, COL.dark, 0, 0.26, 0.12, 12); a(0.05, 0.05, 0.02, 0x58cfd6, 0, 0.26, 0.82, 0x1b6a70);   // giant scope
      a(0.3, 0.3, 0.2, COL.dark, 0, 0.0, 0.0); a(0.12, 0.26, 0.12, COL.dark, 0, -0.2, 0.56);
      p(0.28, 0.05, 0.6, WM_ARM, 0, 0.17, 0.36, 0, -0.1, 0); p(0.05, 0.26, 0.6, WM_ARM, 0.14, 0.0, 0.42, -0.12, 0, 0); p(0.05, 0.26, 0.6, WM_ARM, -0.14, 0.0, 0.42, 0.12, 0, 0);
      a(0.04, 0.24, 0.04, COL.joint, 0.1, -0.2, 1.0); a(0.04, 0.24, 0.04, COL.joint, -0.1, -0.2, 1.0);                    // bipod
      return { muzzle: [0, 0.04, 1.92] }; },
  },
  /* ROCKET: single -> twin -> four-tube launcher (the real rocket still flies from one muzzle) */
  rocket: {
    2(k) { const { a, p, c } = k;
      for (const x of [-0.17, 0.17]) { c(0.14, 0.14, 0.9, 0x4a5a3a, x, 0.06, 0.32, 10); a(0.36, 0.1, 0.1, COL.dark, x, 0.06, 0.78); a(0.34, 0.34, 0.08, COL.dark, x, 0.06, -0.12); }
      a(0.5, 0.1, 0.3, WM_ARM, 0, -0.12, 0.3); a(0.1, 0.22, 0.12, COL.dark, 0, -0.26, 0.2); a(0.06, 0.1, 0.22, COL.red, 0, 0.24, 0.4, 0x601020);
      p(0.5, 0.05, 0.5, WM_ARM, 0, 0.26, 0.3, 0, -0.1, 0);
      return { muzzle: [0, 0.06, 0.86] }; },
    3(k) { const { a, p, c } = k;
      for (const x of [-0.19, 0.19]) for (const y of [-0.12, 0.2]) { c(0.14, 0.14, 1.0, 0x4a5a3a, x, y, 0.32, 10); c(0.17, 0.17, 0.08, COL.dark, x, y, 0.84, 10); a(0.04, 0.04, 0.04, COL.red, x, y + 0.12, 0.82, 0x601020); }
      a(0.7, 0.08, 0.7, WM_ARM, 0, 0.04, 0.3); a(0.1, 0.5, 0.1, COL.dark, 0, 0.04, 0.0); a(0.12, 0.3, 0.14, COL.dark, 0, -0.34, 0.2);
      a(0.2, 0.2, 0.22, WM_DK2, 0, 0.04, -0.18);                                                                           // fire-control box
      p(0.78, 0.05, 0.7, WM_ARM, 0, 0.4, 0.3, 0, -0.14, 0); p(0.05, 0.5, 0.7, WM_ARM, 0.4, 0.04, 0.3, -0.14, 0, 0); p(0.05, 0.5, 0.7, WM_ARM, -0.4, 0.04, 0.3, 0.14, 0, 0);
      a(0.5, 0.05, 0.05, ORANGE, 0, 0.43, 0.7); a(0.06, 0.1, 0.2, COL.red, 0, 0.46, 0.2, 0x601020);
      return { muzzle: [0, 0.06, 0.9] }; },
  },
  /* ARC CASTER: small coils -> capacitors and rings -> six-coil Tesla engine */
  lightning: {
    2(k) { const { a, p, c } = k;
      a(0.24, 0.24, 0.5, 0x2e3a44, 0, 0.02, 0.28);
      for (let i = 0; i < 4; i++) a(0.3, 0.3, 0.04, COL.cyan, 0, 0.02, 0.36 + i * 0.1, 0x1b6a70);
      for (const x of [-0.18, 0.18]) c(0.05, 0.05, 0.3, WM_BRASS, x, 0.0, 0.3, 8);                                         // capacitors
      a(0.07, 0.07, 0.3, COL.joint, 0, 0.02, 0.72); a(0.16, 0.16, 0.04, COL.joint, 0, 0.02, 0.86);
      p(0.28, 0.05, 0.3, WM_ARM, 0, 0.17, 0.3, 0, -0.1, 0); p(0.04, 0.2, 0.3, WM_ARM, 0.15, 0.0, 0.26, -0.1, 0, 0);
      return { muzzle: [0, 0.02, 0.9] }; },
    3(k) { const { a, p, c, ball } = k;
      a(0.34, 0.3, 0.5, 0x2e3a44, 0, 0.0, 0.24);
      for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; const x = Math.cos(ang) * 0.17, y = Math.sin(ang) * 0.17;
        c(0.035, 0.035, 0.62, WM_BRASS, x, y, 0.72, 6); for (let r = 0; r < 2; r++) a(0.085, 0.085, 0.03, COL.cyan, x, y, 0.56 + r * 0.26, 0x1b6a70); ball(0.06, 0x9feaff, x, y, 1.05, 0x9feaff); }   // six Tesla coils
      c(0.05, 0.05, 0.7, COL.joint, 0, 0, 0.74, 8); ball(0.12, 0x9feaff, 0, 0, 1.12, 0x9feaff);
      for (const x of [-0.22, 0.22]) c(0.07, 0.07, 0.3, WM_DK2, x, -0.2, 0.2, 8);                                          // capacitor banks
      a(0.1, 0.2, 0.12, COL.dark, 0, -0.22, 0.12);
      p(0.4, 0.05, 0.4, WM_ARM, 0, 0.22, 0.24, 0, -0.1, 0); p(0.05, 0.22, 0.4, WM_ARM, 0.19, 0.0, 0.24, -0.12, 0, 0); p(0.05, 0.22, 0.4, WM_ARM, -0.19, 0.0, 0.24, 0.12, 0, 0);
      return { muzzle: [0, 0, 1.18] }; },
  },
  /* FLAMETHROWER: pipe -> triple nozzle with tanks -> giant furnace */
  flamer: {
    2(k) { const { a, p, c } = k;
      for (const x of [-0.16, 0.16]) c(0.1, 0.1, 0.42, 0xb8322c, x, -0.13, 0.22, 10);                                      // twin tanks
      a(0.2, 0.2, 0.5, COL.dark, 0, 0.06, 0.34);
      for (const x of [-0.07, 0, 0.07]) { c(0.045, 0.07, 0.18, WM_STEEL, x, 0.06, 0.68, 8); a(0.03, 0.03, 0.03, 0x58a8ff, x, 0.0, 0.78); }   // triple nozzle
      a(0.3, 0.05, 0.1, WM_BRASS, 0, 0.0, 0.5);
      p(0.26, 0.05, 0.3, WM_ARM, 0, 0.19, 0.34, 0, -0.1, 0); p(0.04, 0.2, 0.32, WM_ARM, 0.12, 0.06, 0.34, -0.1, 0, 0);
      return { muzzle: [0, 0.06, 0.82] }; },
    3(k) { const { a, p, c, ball } = k;
      c(0.3, 0.26, 0.72, 0x3a3128, 0, 0.02, 0.36, 12);                                                                       // furnace barrel
      c(0.22, 0.3, 0.14, WM_ARM, 0, 0.02, 0.8, 12); c(0.16, 0.16, 0.04, 0xff7a1a, 0, 0.02, 0.9, 12, 0xff4a0a);              // glowing mouth
      for (let i = 0; i < 4; i++) c(0.31, 0.31, 0.04, WM_BRASS, 0, 0.02, 0.1 + i * 0.2, 12);                                // hoops
      for (const x of [-0.34, 0.34]) { c(0.12, 0.12, 0.62, 0xb8322c, x, -0.04, 0.3, 10); ball(0.12, 0xb8322c, x, -0.04, 0.62); ball(0.12, 0xb8322c, x, -0.04, -0.02); }
      c(0.05, 0.05, 0.4, WM_STEEL, 0, 0.36, 0.3, 8); a(0.12, 0.12, 0.12, COL.dark, 0, 0.36, 0.52); a(0.08, 0.3, 0.1, WM_STEEL, 0.14, 0.32, 0.0); // vent stack, chimney
      a(0.1, 0.24, 0.12, COL.dark, 0, -0.32, 0.2); a(0.04, 0.04, 0.04, 0x58a8ff, 0.1, -0.04, 0.96, 0x58a8ff);
      p(0.1, 0.2, 0.5, WM_ARM, 0.3, 0.34, 0.3, -0.1, -0.1, 0); p(0.1, 0.2, 0.5, WM_ARM, -0.3, 0.34, 0.3, 0.1, -0.1, 0);
      return { muzzle: [0, 0.02, 0.98] }; },
  },
  /* GATLING: compact six-barrel -> heavy drum -> twin rotating banks. Banks use the shared spinMesh turning. */
  gatling: {
    2(k, g) { const { a, p } = k;
      a(0.3, 0.28, 0.4, COL.dark, 0, 0.02, 0.24); a(0.26, 0.26, 0.26, 0x3a3128, 0.22, -0.08, 0.2); a(0.3, 0.05, 0.1, ORANGE, 0, 0.19, 0.2);
      const spin = wmBank(g, k, 0, 0.02, 0.68, 0.56, 0.095, 6);
      p(0.34, 0.05, 0.34, WM_ARM, 0, 0.2, 0.26, 0, -0.1, 0); p(0.05, 0.22, 0.36, WM_ARM, -0.17, 0.02, 0.24, 0.1, 0, 0);
      return { muzzle: [0, 0.02, 1.0], spin }; },
    3(k, g) { const { a, p } = k;
      a(0.6, 0.3, 0.44, COL.dark, 0, 0.02, 0.24); a(0.34, 0.34, 0.3, 0x3a3128, 0, -0.26, 0.2); a(0.5, 0.05, 0.1, ORANGE, 0, 0.2, 0.2);
      const s1 = wmBank(g, k, -0.16, 0.02, 0.76, 0.66, 0.085, 6), s2 = wmBank(g, k, 0.16, 0.02, 0.76, 0.66, 0.085, 6);
      a(0.5, 0.08, 0.1, WM_ARM, 0, 0.02, 1.12);
      p(0.6, 0.05, 0.4, WM_ARM, 0, 0.21, 0.26, 0, -0.12, 0); p(0.05, 0.24, 0.4, WM_ARM, 0.32, 0.02, 0.24, -0.12, 0, 0); p(0.05, 0.24, 0.4, WM_ARM, -0.32, 0.02, 0.24, 0.12, 0, 0);
      return { muzzle: [0, 0.02, 1.12], spin: s1, spin2: s2 }; },
  },
  /* KATANA: simple -> segmented -> giant actuated blade */
  katana: {
    2(k, g) { const { a } = k;
      a(0.09, 0.1, 0.36, 0x1c1a20, 0, 0, 0.2); for (let i = 0; i < 4; i++) a(0.1, 0.11, 0.03, 0xd8d4c8, 0, 0, 0.07 + i * 0.09);
      a(0.26, 0.05, 0.26, ORANGE, 0, 0, 0.4); a(0.22, 0.03, 0.1, WM_BRASS, 0, 0, 0.5);
      let z = 0.44, y = 0; for (let i = 0; i < 5; i++) { const s = a(0.032, 0.085, 0.3, 0xe4ebef, 0, y, z + 0.15); s.rotation.x = -0.04 * i; a(0.04, 0.092, 0.02, WM_STEEL, 0, y, z + 0.01); z += 0.3; y += 0.018 * (i + 1); }
      return { muzzle: [0, y, z + 0.05], base: [0, 0, 0.46] }; },
    3(k, g) { const { a, p } = k;
      a(0.12, 0.14, 0.46, 0x1c1a20, 0, 0, 0.22); for (let i = 0; i < 4; i++) a(0.14, 0.15, 0.04, WM_BRASS, 0, 0, 0.06 + i * 0.12);
      a(0.34, 0.08, 0.3, ORANGE, 0, 0, 0.46); a(0.12, 0.3, 0.2, WM_ARM, 0, 0, 0.52);                                       // guard + actuator block
      let z = 0.58, y = 0; for (let i = 0; i < 6; i++) { const s = a(0.05, 0.17, 0.34, 0xe4ebef, 0, y, z + 0.17); s.rotation.x = -0.03 * i; a(0.06, 0.2, 0.025, WM_STEEL, 0, y, z + 0.01); a(0.07, 0.025, 0.3, 0x58cfd6, 0, y + 0.1, z + 0.17, 0x1b6a70); z += 0.34; y += 0.02 * (i + 1); }
      for (let i = 0; i < 3; i++) { const z0 = 0.7 + i * 0.5; a(0.04, 0.04, 0.34, WM_STEEL, 0.06, 0.16 + i * 0.03, z0); a(0.05, 0.05, 0.1, COL.dark, 0.06, 0.16 + i * 0.03, z0 - 0.15); }   // spine actuators
      p(0.05, 0.2, 0.3, WM_ARM, 0.11, 0.0, 0.5, -0.1, 0, 0); p(0.05, 0.2, 0.3, WM_ARM, -0.11, 0.0, 0.5, 0.1, 0, 0);
      return { muzzle: [0, y, z + 0.05], base: [0, 0, 0.58] }; },
  },
  /* CHAINSAW: small -> geared heavy -> double-chain shredder (the saw rig still jitters as one) */
  chainsaw: {
    2(k, g, ctx) { const { a, c } = k; const L = ctx.L, rig = new THREE.Group(); rig.position.set(k.ox, k.oy, 0); g.add(rig);
      const ra = (w, h, d, col, x, y, z) => { const m = bx(w, h, d, col, x, y, z); rig.add(m); return m; };
      ra(0.32, 0.28, 0.4, 0xc0562a, 0, 0.02, 0.2); ra(0.1, 0.06, 0.24, COL.dark, 0, 0.2, 0.16); ra(0.34, 0.05, 0.14, ORANGE, 0, -0.1, 0.2);
      const gr = new THREE.Mesh(wmCyl(0.1, 0.1, 0.06, 10), M(WM_STEEL)); gr.position.set(0.17, 0.02, 0.3); gr.rotation.y = Math.PI / 2; rig.add(gr);   // gear
      ra(0.1, 0.16, 0.06, 0x3a3128, 0.1, 0.14, 0.04);
      ra(0.07, 0.16, L, 0xb8bec4, 0, 0, 0.42 + L / 2); ra(0.1, 0.1, 0.06, WM_ARM, 0, 0, 0.46 + L);
      for (let i = 0; i < Math.round(L * 5); i++) ra(0.09, 0.03, 0.07, COL.dark, 0, i % 2 ? 0.1 : -0.1, 0.46 + i / 5);
      return { muzzle: [0, 0, 0.42 + L], base: [0, 0, 0.44], saw: rig, exhaust: [0.1, 0.2, 0.04] }; },
    3(k, g, ctx) { const { a, c } = k; const L = ctx.L, rig = new THREE.Group(); rig.position.set(k.ox, k.oy, 0); g.add(rig);
      const ra = (w, h, d, col, x, y, z) => { const m = bx(w, h, d, col, x, y, z); rig.add(m); return m; };
      ra(0.5, 0.34, 0.5, 0xc0562a, 0, 0.02, 0.24); ra(0.12, 0.06, 0.3, COL.dark, 0, 0.24, 0.2); ra(0.52, 0.05, 0.16, ORANGE, 0, -0.14, 0.24);
      for (const x of [-0.27, 0.27]) { const gr = new THREE.Mesh(wmCyl(0.14, 0.14, 0.07, 12), M(WM_STEEL)); gr.position.set(x, 0.04, 0.34); gr.rotation.y = Math.PI / 2; rig.add(gr); }
      ra(0.1, 0.1, 0.5, WM_STEEL, 0.1, 0.24, 0.1); ra(0.1, 0.2, 0.08, 0x3a3128, 0.2, 0.2, 0.02);
      for (const x of [-0.14, 0.14]) {                                                                                        // two bars, two chains
        ra(0.06, 0.16, L, 0xb8bec4, x, 0, 0.5 + L / 2); ra(0.1, 0.1, 0.06, WM_ARM, x, 0, 0.52 + L);
        for (let i = 0; i < Math.round(L * 5); i++) ra(0.09, 0.03, 0.07, COL.dark, x, i % 2 ? 0.1 : -0.1, 0.52 + i / 5);
      }
      ra(0.4, 0.06, 0.08, WM_ARM, 0, 0.1, 0.5 + L * 0.5);                                                                     // cross-brace
      return { muzzle: [0, 0, 0.5 + L], base: [0, 0, 0.5], saw: rig, exhaust: [0.18, 0.26, 0.02] }; },
  },
  /* KNIFE: improvised -> serrated -> oscillating motorized cleaver */
  knife: {
    2(k) { const { a } = k;
      a(0.11, 0.13, 0.32, 0x3a3128, 0, 0, 0.18); a(0.3, 0.07, 0.07, ORANGE, 0, 0, 0.36); a(0.12, 0.05, 0.05, WM_BRASS, 0, 0, 0.1);
      a(0.03, 0.14, 0.62, 0xd6dde2, 0, 0.0, 0.7);
      for (let i = 0; i < 6; i++) a(0.034, 0.05, 0.05, 0xd6dde2, 0, -0.095, 0.5 + i * 0.1);                                      // serrations
      a(0.03, 0.05, 0.22, 0xd6dde2, 0, 0.05, 1.12);
      return { muzzle: [0, 0, 1.12], base: [0, 0, 0.4] }; },
    3(k, g) { const { a, p } = k;
      a(0.16, 0.16, 0.4, 0x2e2a28, 0, 0, 0.2); a(0.36, 0.1, 0.1, ORANGE, 0, 0, 0.42);
      a(0.22, 0.24, 0.3, WM_ARM, 0, 0, 0.58); a(0.1, 0.1, 0.1, 0xff7a1a, 0, 0.14, 0.58, 0xff4a0a);                               // motor housing
      a(0.04, 0.34, 0.82, 0xd6dde2, 0, 0.0, 1.06); a(0.05, 0.06, 0.8, WM_STEEL, 0, 0.19, 1.06);                                    // wide cleaver + spine
      for (let i = 0; i < 8; i++) a(0.045, 0.06, 0.06, 0xd6dde2, 0, -0.2, 0.7 + i * 0.1);                                           // teeth
      a(0.05, 0.03, 0.7, 0x58cfd6, 0, -0.16, 1.06, 0x1b6a70);
      p(0.05, 0.28, 0.3, WM_ARM, 0.13, 0, 0.58, -0.1, 0, 0); p(0.05, 0.28, 0.3, WM_ARM, -0.13, 0, 0.58, 0.1, 0, 0);
      return { muzzle: [0, 0, 1.5], base: [0, 0, 0.5] }; },
  },
  /* GRAVITY GUN: two prongs -> four -> six, with a floating sphere */
  gravity: {
    2(k) { const { a, p, c, ball } = k;
      a(0.28, 0.26, 0.5, 0x3a3f4a, 0, 0, 0.24);
      for (let i = 0; i < 4; i++) { const sx = i % 2 ? 1 : -1, sy = i < 2 ? 1 : -1; a(0.05, 0.05, 0.3, WM_STEEL, 0.13 * sx, 0.13 * sy, 0.66); }
      for (let q = 0; q < 3; q++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.17 - q * 0.02, 0.025, 6, 16), M(COL.cyan, 0x1b6a70)); r.position.set(k.ox, k.oy, 0.46 + q * 0.08); k.g.add(r); }
      ball(0.08, 0x8a5cff, 0, 0, 0.82, 0x8a5cff);
      p(0.32, 0.05, 0.3, WM_ARM, 0, 0.18, 0.26, 0, -0.1, 0); p(0.05, 0.2, 0.3, WM_ARM, 0.15, 0, 0.26, -0.1, 0, 0);
      return { muzzle: [0, 0, 0.9] }; },
    3(k) { const { a, p, ball } = k;
      a(0.34, 0.3, 0.56, 0x3a3f4a, 0, 0, 0.26);
      for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2 + 0.52; const x = Math.cos(ang) * 0.2, y = Math.sin(ang) * 0.2; a(0.05, 0.05, 0.5, WM_STEEL, x, y, 0.78); a(0.07, 0.07, 0.05, COL.cyan, x, y, 1.03, 0x1b6a70); }   // six prongs
      for (let q = 0; q < 4; q++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 - q * 0.015, 0.025, 6, 18), M(COL.cyan, 0x1b6a70)); r.position.set(k.ox, k.oy, 0.54 + q * 0.1); k.g.add(r); }
      ball(0.12, 0x8a5cff, 0, 0, 1.16, 0x8a5cff);                                                                               // the floating sphere
      for (let i = 0; i < 3; i++) { const ang = i / 3 * Math.PI * 2; ball(0.03, 0xd6c4ff, Math.cos(ang) * 0.2, Math.sin(ang) * 0.2, 1.16, 0xd6c4ff); }
      a(0.1, 0.22, 0.12, COL.dark, 0, -0.22, 0.14);
      p(0.4, 0.05, 0.4, WM_ARM, 0, 0.21, 0.26, 0, -0.1, 0); p(0.05, 0.24, 0.4, WM_ARM, 0.19, 0, 0.26, -0.12, 0, 0); p(0.05, 0.24, 0.4, WM_ARM, -0.19, 0, 0.26, 0.12, 0, 0);
      return { muzzle: [0, 0, 1.22] }; },
  },
  /* FORCEFIELD emitter: small emitter -> three antennae -> rotating concentric rings */
  field: {
    2(k) { const { a, p, ball } = k;
      a(0.26, 0.26, 0.32, 0x3a4048, 0, 0, 0.16);
      for (let i = 0; i < 3; i++) { const ang = i / 3 * Math.PI * 2 + Math.PI / 2; const x = Math.cos(ang) * 0.14, y = Math.sin(ang) * 0.14; a(0.035, 0.035, 0.4, WM_STEEL, x, y, 0.5); ball(0.04, 0x9feaff, x, y, 0.72, 0x9feaff); }
      for (let q = 0; q < 3; q++) a(0.32 - q * 0.05, 0.32 - q * 0.05, 0.04, COL.cyan, 0, 0, 0.36 + q * 0.08, 0x1b6a70);
      ball(0.09, 0x9feaff, 0, 0, 0.6, 0x9feaff);
      p(0.3, 0.05, 0.26, WM_ARM, 0, 0.17, 0.16, 0, -0.1, 0); p(0.05, 0.2, 0.26, WM_ARM, 0.15, 0, 0.16, -0.1, 0, 0);
      return { muzzle: [0, 0, 0.7] }; },
    3(k, g) { const { a, p, ball } = k;
      a(0.34, 0.34, 0.36, 0x3a4048, 0, 0, 0.18); a(0.12, 0.12, 0.5, WM_STEEL, 0, 0, 0.5);
      const spin = new THREE.Group(); spin.position.set(k.ox, k.oy, 0.78); spin.rotation.x = Math.PI / 2;                       // rotating concentric rings (turned by the shared spinMesh update)
      for (let q = 0; q < 3; q++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.16 + q * 0.1, 0.022, 6, 22), M(COL.cyan, 0x1b6a70)); r.rotation.x = Math.PI / 2; r.position.y = (q - 1) * 0.06; spin.add(r);
        const nub = bx(0.06, 0.06, 0.06, 0x9feaff, 0.16 + q * 0.1, (q - 1) * 0.06, 0, 0x9feaff); spin.add(nub);                      // a marker so you can see it turn
      }
      g.add(spin);
      ball(0.1, 0x9feaff, 0, 0, 0.78, 0x9feaff);
      for (let i = 0; i < 3; i++) { const ang = i / 3 * Math.PI * 2 + Math.PI / 2; a(0.04, 0.04, 0.5, WM_STEEL, Math.cos(ang) * 0.2, Math.sin(ang) * 0.2, 0.4); }
      p(0.4, 0.05, 0.3, WM_ARM, 0, 0.21, 0.18, 0, -0.1, 0); p(0.05, 0.24, 0.3, WM_ARM, 0.19, 0, 0.18, -0.12, 0, 0); p(0.05, 0.24, 0.3, WM_ARM, -0.19, 0, 0.18, 0.12, 0, 0);
      return { muzzle: [0, 0, 0.92], spin }; },
  },
};
/* a bank of barrels that turns about its own axis (same layout as the original Gatling) */
function wmBank(g, k, x, y, z, len, rad, n) {
  const spin = new THREE.Group(); spin.position.set(k.ox + x, k.oy + y, z); spin.rotation.x = Math.PI / 2;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spin.add(bx(0.045, len, 0.045, COL.joint, Math.cos(a) * rad, 0, Math.sin(a) * rad)); }
  spin.add(bx(rad * 2.6, 0.04, rad * 2.6, COL.dark, 0, len / 2 - 0.06, 0)); spin.add(bx(rad * 2.6, 0.04, rad * 2.6, COL.dark, 0, -len / 2 + 0.06, 0));
  const wrap = new THREE.Group(); wrap.add(spin); g.add(wrap);
  return spin;
}
const WM_MOUNT = { shotgun: [0.22, 0.12], autogun: [0.22, 0.12], pistol: [0.22, 0.12], lightning: [0.22, 0.12], rocket: [0.24, 0.13], flamer: [0.22, 0.12], sniper: [0.22, 0.12],
  gatling: [0.22, 0.13], katana: [0.2, 0.11], chainsaw: [0.22, 0.12], knife: [0.2, 0.11], gravity: [0.22, 0.12], field: [0.22, 0.12] };
/* the small extra on L2 (MK I) and L4 (MK II): a brace and a rivet plate, so a level-up is visible even inside a tier */
function wmDetail(g, k, tier, lvl, ctx) {
  if (tier === 1 && lvl === 2) { g.add(bx(0.05, 0.05, 0.05, WM_BRASS, k.ox + 0.09, k.oy + 0.1, 0.16)); g.add(bx(0.07, 0.03, 0.12, WM_STEEL, k.ox, k.oy - 0.12, 0.1)); }
  if (tier === 2 && lvl === 4) { g.add(bx(0.06, 0.06, 0.06, WM_BRASS, k.ox - 0.1, k.oy + 0.12, 0.12)); g.add(bx(0.06, 0.06, 0.06, WM_BRASS, k.ox + 0.1, k.oy + 0.12, 0.12)); g.add(bx(0.12, 0.03, 0.14, ORANGE, k.ox, k.oy - 0.14, 0.08)); }
}
/* wrap the weapon models: MK I stays the original builder */
function wmInstall() {
  for (const type of Object.keys(WM_BUILD)) {
    const W = WEAPONS[type]; if (!W || !W.model || W.model.__wm) continue;
    const orig = W.model, F = WM_MOUNT[type];
    const wrapped = function (g, ctx) {
      const lvl = (ctx && ctx.lvl) || 1, tier = wmTier(lvl), out = ctx.out, solo = tier === 1;
      let res;
      if (solo) {
        res = orig.call(this, g, ctx);
        const o = out.z > 0.9 ? [0, 0] : [out.x * F[0], out.y * F[0]]; wmDetail(g, wmKit(g, o), 1, lvl, ctx);
      } else {
        const o = out.z > 0.9 ? [0, 0] : [out.x * F[0], out.y * F[0]];
        joint(g, [0, 0, 0], F[1], COL.dark);
        if (o[0] || o[1]) strut(g, [0, 0, 0], o, 0.1, COL.dark);
        const k = wmKit(g, o);
        const r = WM_BUILD[type][tier](k, g, { L: type === 'chainsaw' ? WEAPONS.chainsaw.reach(lvl) : 0, lvl });
        wmDetail(g, k, tier, lvl);
        res = { ...r, muzzle: [o[0] + r.muzzle[0], o[1] + r.muzzle[1], r.muzzle[2]] };
        if (r.base) res.base = [o[0] + r.base[0], o[1] + r.base[1], r.base[2]];
        if (r.exhaust) res.exhaust = [o[0] + r.exhaust[0], o[1] + r.exhaust[1], r.exhaust[2]];
        if (r.spin2) g.userData.spinMesh2 = r.spin2;
      }
      if (ctx.item && ctx.item.kind === 'weapon') wmMaybeUnfold(g, ctx.item, tier);
      return res;
    };
    wrapped.__wm = true; W.model = wrapped;
  }
  /* MISSILE POD module: 3 -> 6 -> 12 honeycomb tubes; the rear gem socket stays clear and in view */
  const P = MODULES.pods; if (P && !P.model.__wm) {
    const wrapped = function (g, { out, lvl, item }) {
      const tier = wmTier(lvl || 1), n = [0, 3, 6, 12][tier];
      joint(g, [0, 0, 0], 0.13, JOINT_COL);
      const c = [out.x * 0.3, out.y * 0.3, out.z * 0.3];
      strut(g, [0, 0, 0], c, 0.1, COL.dark);
      const cols = tier === 3 ? 4 : 3, rows = tier === 3 ? 3 : tier === 2 ? 2 : 1;
      const BOX = tier === 1 ? [0.5, 0.22, 0.34] : tier === 2 ? [0.52, 0.26, 0.42] : [0.66, 0.3, 0.58];
      g.add(bx(BOX[0], BOX[1], BOX[2], 0x46505a, c[0], c[1], c[2]));
      g.add(bx(BOX[0] + 0.02, 0.05, BOX[2] + 0.02, ORANGE, c[0], c[1] + BOX[1] / 2 + 0.02, c[2]));
      const top = c[1] + BOX[1] / 2 + 0.04, tg = new THREE.CylinderGeometry(0.06, 0.06, 0.2, tier === 3 ? 6 : 8), tm = M(COL.dark);
      let placed = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols && placed < n; i++, placed++) {
        const x = c[0] + (i - (cols - 1) / 2) * (tier === 3 ? 0.145 : 0.15) + (j % 2 && tier === 3 ? 0.07 : 0), z = c[2] + (j - (rows - 1) / 2) * (tier === 3 ? 0.14 : 0.18);
        const tube = new THREE.Mesh(tg, tm); tube.position.set(x, top + 0.08, z); g.add(tube);
        g.add(bx(0.06, 0.03, 0.06, 0xe2465c, x, top + 0.2, z, 0x601020));
      }
      if (tier >= 2) { g.add(bx(0.04, 0.2, BOX[2], WM_ARM, c[0] + BOX[0] / 2 + 0.02, c[1] + 0.02, c[2])); g.add(bx(0.04, 0.2, BOX[2], WM_ARM, c[0] - BOX[0] / 2 - 0.02, c[1] + 0.02, c[2])); }
      if (tier === 3) { g.add(bx(BOX[0] + 0.06, 0.04, 0.05, WM_BRASS, c[0], top + 0.1, c[2] - BOX[2] / 2 + 0.02)); g.add(bx(0.05, 0.05, 0.05, COL.red, c[0] + 0.28, c[1] + 0.22, c[2] + 0.2, 0x601020)); }
      if (lvl === 2) g.add(bx(0.05, 0.05, 0.05, WM_BRASS, c[0] + 0.2, c[1] + 0.15, c[2] + 0.1));
      if (lvl === 4) g.add(bx(0.05, 0.05, 0.05, WM_BRASS, c[0] - 0.2, c[1] + 0.15, c[2] + 0.1));
      if (item) wmMaybeUnfold(g, item, tier);
      // rear gem socket: on the back face (never covered by tubes); a pod on the back of the torso faces its socket sideways
      const rear = out.z < -0.5 ? 'right' : 'back', hx = BOX[0] / 2, hz = BOX[2] / 2;
      const gemSock = rear === 'back' ? { face: 'back', pos: [c[0], c[1], c[2] - hz - 0.03] } : { face: 'right', pos: [c[0] + hx + 0.03, c[1], c[2]] };
      return { muzzle: [c[0], top + 0.3, c[2]], gemSock };
    };
    wrapped.__wm = true; P.model = wrapped;
  }
}
/* ---- unfolding on an L2 -> L3 upgrade ---- */
function wmInScene(o) { while (o) { if (o === scene) return true; o = o.parent; } return false; }
function wmMaybeUnfold(g, item, tier) {
  const pend = WMOD.pending.get(item);
  if (!pend || tier !== 2 || pend.to !== 2 || pend.from >= 2 || (performance.now() - pend.t) > 4000) return;
  const panels = g.userData.panels; if (!panels || !panels.length) return;
  g.userData.unfolding = true;
  panels.forEach((q, i) => { q.m.scale.copy(q.s).multiplyScalar(0.04); q.m.position.copy(q.p).add(q.d); q.t0 = (i / panels.length) * 0.4; q.sp = false; });
  WMOD.active.push({ g, panels, t: 0, s0: false, ticks: 0 });
}
function weaponModelTick(dt) {
  const A = WMOD.active; if (!A.length) return;
  for (let i = A.length - 1; i >= 0; i--) {
    const u = A[i]; u.t += dt;
    const live = wmInScene(u.g) && (u.g.parent !== null);
    if (live && !u.s0) { u.s0 = true; if (typeof sfx === 'function') { sfx('unfold', 0.9); } }
    const wp = live ? u.g.getWorldPosition(new THREE.Vector3()) : null;
    for (const q of u.panels) {
      const x = clamp((u.t - q.t0) / (WMOD.UNFOLD * 0.55), 0, 1), e = x < 1 ? 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2) : 1;     // ease-out with a small overshoot
      q.m.scale.copy(q.s).multiplyScalar(0.04 + 0.96 * Math.max(0, e)); q.m.position.copy(q.p).addScaledVector(q.d, 1 - e);
      if (x >= 1 && !q.sp) { q.sp = true; if (wp && typeof spark === 'function') { const w = q.m.getWorldPosition(new THREE.Vector3()); spark(w, 0xffd27a); spark(w, 0xffa83a); } if (live && Math.random() < 0.6 && typeof sfx === 'function') sfx('tink', 0.5); }
    }
    if (u.t >= WMOD.UNFOLD) { for (const q of u.panels) { q.m.scale.copy(q.s); q.m.position.copy(q.p); } u.g.userData.unfolding = false; A.splice(i, 1); }
  }
}
/* an upgrade crossing a tier: queue the unfold (L2->L3) or the MK III reveal hook (L5) */
(function () {
  const up = upgradeItem;
  upgradeItem = function (it, by) {
    const before = it.lvl || 1, c = up.apply(this, arguments);
    if (c && c.ok && (it.kind === 'weapon' || (it.kind === 'module' && it.type === 'pods'))) {
      const a = wmTier(before), b = wmTier(it.lvl || 1);
      if (b > a) {
        WMOD.pending.set(it, { from: a, to: b, t: performance.now() });
        if (b === 3) WMOD.hooks.mk3.forEach(fn => { try { fn(it); } catch (e) { console.error(e); } });     // chunk 15 plugs the cinematic reveal in here
      }
    }
    return c;
  };
})();
wmInstall();
