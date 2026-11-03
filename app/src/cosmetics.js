'use strict';
/* ============================================================
   COSMETICS: purely for looks. Dragged out of the Customize menu and stuck anywhere on the frame
   (they don't use part sockets). Each remembers which part it sits on (the n-th arm, the bottom body...)
   and where on it, so it follows that part on every frame you build, in the hangar and in the field.
   The cigarette is a secret: click the robot five times quickly to give it one (and five again to take it).
   ============================================================ */
const COSMETICS = {
  santa:  { name: 'Santa hat',    icon: '<svg viewBox="0 0 24 24"><path d="M4 18 Q8 4 17 6 L20 13" fill="#d8302c"/><circle cx="20" cy="14" r="2.4" fill="#fff"/><rect x="2" y="17" width="15" height="4" rx="2" fill="#fff"/></svg>', up: true },
  pumpkin:{ name: 'Pumpkin',      icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="9" ry="7" fill="#f07818"/><path d="M12 7v-4" stroke="#3a7a2a" stroke-width="2.4"/><path d="M8 12l2 2H6zM16 12l2 2h-4zM8 17h8l-2 1-2-1-2 1z" fill="#2a1408"/></svg>', up: true },
  badge:  { name: 'Police badge', icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z" fill="#e2b030"/><path d="M12 7l1.5 3.2 3.4.4-2.5 2.3.7 3.4L12 14.6 8.9 16.3l.7-3.4-2.5-2.3 3.4-.4z" fill="#8a5a10"/></svg>', up: false },
  cig:    { name: 'Cigarette',    hidden: true, up: false },
};
if (!Array.isArray(CUSTOM.cosmetics)) CUSTOM.cosmetics = [];

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
  } else if (type === 'cig') {
    // sticks out of the surface and droops a little; smoke curls up from the lit end
    const body = new THREE.Group(); body.rotation.x = 0.35;
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), mat(0xf2efe6)); paper.position.y = 0.22; body.add(paper);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.11, 10), mat(0xd88a3a)); filter.position.y = 0.0; body.add(filter);
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xff5a1a })); ember.position.y = 0.405; body.add(ember);
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.034, 0.02, 10), mat(0x8a8a86)); ash.position.y = 0.42; body.add(ash);
    g.add(body);
    g.userData.ember = ember; g.userData.tip = new THREE.Vector3(0, 0.43, 0); g.userData.tipObj = body;
    g.userData.smoke = [];
    const smokeMat = () => new THREE.SpriteMaterial({ color: 0xd8dcdc, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 10; i++) { const p = new THREE.Sprite(smokeMat()); p.userData.t = i / 10; p.userData.noShadow = true; g.add(p); g.userData.smoke.push(p); }
  }
  const inner = new THREE.Group(); inner.add(...g.children); inner.scale.setScalar({ santa: 0.72, pumpkin: 0.66, badge: 0.9, cig: 1 }[type] || 1); g.add(inner);
  if (g.userData.tipObj) g.userData.tipScale = inner.scale.x;
  g.traverse(o => { if (o.isMesh) o.userData.noShadow = o.material && o.material.isMeshBasicMaterial; });
  g.userData.cosmetic = type;
  return g;
}

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
    if (at.exact) placeCosmetic(obj, c);
    else { placeCosmetic(obj, { p: [0, 0.6, 0], n: [0, 1, 0], s: c.s }); }      // its part isn't on this frame: it sits on top of the bottom body
    obj.userData.cdata = c;
    at.g.add(obj); root.userData.cosmetics.push(obj);
  }
}

/* ---------- animation: the ember flickers, smoke drifts up (in world space) and fades ---------- */
const _cosQ = new THREE.Quaternion(), _cosV = new THREE.Vector3(), _cosU = new THREE.Vector3();
function cosmeticTick(root, dt) {
  if (!root || !root.userData.cosmetics) return;
  const t = performance.now() * 0.001;
  for (const obj of root.userData.cosmetics) {
    const ud = obj.userData; if (!ud.smoke) continue;
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
      const s = (0.05 + k * 0.28) / ws; p.scale.set(s, s, s);
      p.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.4 * (1 - k * 0.5);
    }
  }
}
