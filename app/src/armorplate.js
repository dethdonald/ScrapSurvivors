'use strict';
/* Armor reveal at max level, brought back for the current (procedural) arms and legs: each one carries a small
   armor plate — a shoulder plate on arms, thigh + shin plates on legs — built from the part's own bounding box
   (so it needs no per-model art and works for every current and future arm/leg) and folded down to nothing until
   the part hits LIMB_MAX_LVL, with a small spark + sfx the first time it bolts on, the same idea as the weapons'
   MK III reveal (weaponmodels.js), scaled down for something that can happen on every limb. */
const ARMOR = { pending: new WeakMap(), active: [] };
function armorInScene(o) { while (o) { if (o === scene) return true; o = o.parent; } return false; }
/* called from buildPart() right after an arm/leg's own model() has added its meshes to g */
function addArmorPlate(g, item, out) {
  if (item.kind !== 'arm' && item.kind !== 'leg') return;
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  if (!isFinite(bb.min.x)) return;           // an empty/placeholder model: nothing to wrap a plate around
  const size = bb.getSize(new THREE.Vector3()), center = bb.getCenter(new THREE.Vector3());
  const plateMat = M(0x5a6470, 0x15181c);
  const mkPlate = (w, h, d, x, y, z, ry) => {
    const m = new THREE.Mesh(geoBox, plateMat);
    m.scale.set(Math.max(0.05, w), Math.max(0.05, h), Math.max(0.05, d)); m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    g.add(m); return m;
  };
  const plates = [];
  if (item.kind === 'arm') {
    // flush against the shoulder/socket end, flared out the way the arm itself points
    const ox = out.x || 0, oz = out.z || 0, len = Math.hypot(ox, oz) || 1;
    plates.push(mkPlate(0.34, 0.1, 0.42, ox / len * 0.18, 0.16, oz / len * 0.18 + 0.1, Math.atan2(ox, oz)));
  } else {
    // thigh plate (upper third) and shin plate (lower third) of the leg's own bounding box
    const spanY = size.y || 0.6;
    plates.push(mkPlate(size.x * 0.75, spanY * 0.18, size.z * 0.6, center.x, bb.max.y - spanY * 0.22, center.z));
    plates.push(mkPlate(size.x * 0.55, spanY * 0.16, size.z * 0.5, center.x, bb.min.y + spanY * 0.22, center.z));
  }
  const maxed = (item.lvl || 1) >= LIMB_MAX_LVL;
  plates.forEach(m => { m.userData.rest = { s: m.scale.clone() }; if (!maxed) m.scale.setScalar(0.001); });
  g.userData.armorPlates = plates;
  armorMaybeReveal(g, item);
}
/* queues the bolt-on animation if this item just crossed into max level this session */
function armorMaybeReveal(g, item) {
  const pend = ARMOR.pending.get(item);
  if (!pend || (performance.now() - pend.t) > 4000) return;
  const plates = g.userData.armorPlates; if (!plates || !plates.length) return;
  ARMOR.pending.delete(item);
  ARMOR.active.push({ g, plates, t: 0, sp: false });
}
function armorTick(dt) {
  const A = ARMOR.active; if (!A.length) return;
  for (let i = A.length - 1; i >= 0; i--) {
    const u = A[i]; u.t += dt;
    const x = clamp(u.t / 0.5, 0, 1), e = x < 1 ? 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2) : 1;
    for (const m of u.plates) m.scale.copy(m.userData.rest.s).multiplyScalar(Math.max(0.001, e));
    if (x >= 1 && !u.sp) {
      u.sp = true;
      if (armorInScene(u.g) && u.g.parent !== null) {
        const w = u.g.getWorldPosition(new THREE.Vector3());
        if (typeof spark === 'function') { spark(w, 0xd7dde2); spark(w, 0x9aa4ad); }
        if (typeof sfx === 'function') sfx('tink', 0.6);
      }
    }
    if (u.t >= 0.5) { for (const m of u.plates) m.scale.copy(m.userData.rest.s); A.splice(i, 1); }
  }
}
/* an upgrade crossing into LIMB_MAX_LVL: queue the reveal */
(function () {
  const up = upgradeItem;
  upgradeItem = function (it, by) {
    const before = it.lvl || 1, c = up.apply(this, arguments);
    if (c && c.ok && (it.kind === 'arm' || it.kind === 'leg') && before < LIMB_MAX_LVL && (it.lvl || 1) >= LIMB_MAX_LVL) {
      ARMOR.pending.set(it, { t: performance.now() });
    }
    return c;
  };
})();
