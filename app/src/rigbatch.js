'use strict';
/* ============================================================
   RIG BATCH: the player's robot in a handful of draw calls.
   A frame is built out of hundreds of little boxes (a four-armed loadout is ~280 meshes), and every one of them was its
   own draw call, twice over because each also goes into the shadow map: the robot alone was two thirds of all the draw
   calls in a busy frame. Nearly all of those boxes share one geometry and a few cached materials, so each frame the
   world matrix of every such mesh is copied into an instanced batch per (geometry, material) and the mesh itself is
   parked on a layer no camera looks at. Nothing about the model changes: every joint, recoil, spin and walk cycle
   still animates the real meshes, the batch just draws them. Meshes that are see-through, mirrored, one of a kind or
   otherwise special are left alone and draw as before.
   ============================================================ */
const RIGB = { root: null, items: [], batches: new Map(), scanT: 0, meshCount: -1, dirty: true };
const RIG_LAYER = 7, RIG_MIN = 3;
function rigRestore() { for (const it of RIGB.items) it.o.layers.set(0); RIGB.items = []; }
function rigHideAll() { for (const b of RIGB.batches.values()) { b.im.count = 0; b.im.visible = false; } }
function rigCountMeshes(root) { let n = 0; root.traverse(o => { if (o.isMesh) n++; }); return n; }
function rigScan(root) {
  rigRestore();
  root.updateMatrixWorld(true);
  const groups = new Map(); let count = 0;
  root.traverse(o => {
    if (!o.isMesh) return; count++;
    if (o.isInstancedMesh || o.isSkinnedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent || o.renderOrder !== 0 || o.userData.noBatch || o.morphTargetInfluences) return;
    if (o.matrixWorld.determinant() < 0) return;                 // mirrored: an instance can't flip its winding
    const key = o.geometry.uuid + '|' + m.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(o);
  });
  RIGB.meshCount = count;
  const live = new Set();
  for (const [key, list] of groups) {
    if (list.length < RIG_MIN) continue;
    let b = RIGB.batches.get(key);
    if (!b || b.cap < list.length) {
      if (b) { scene.remove(b.im); b.im.dispose && b.im.dispose(); }
      let cap = 16; while (cap < list.length) cap *= 2;
      const o0 = list[0], im = new THREE.InstancedMesh(o0.geometry, o0.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0;
      scene.add(im); im.castShadow = o0.castShadow; im.receiveShadow = o0.receiveShadow;
      b = { im, cap, n: 0 }; RIGB.batches.set(key, b);
    }
    live.add(key);
    for (const o of list) { o.layers.set(RIG_LAYER); RIGB.items.push({ o, b, geo: o.geometry, mat: o.material, cs: o.castShadow }); }
  }
  for (const [key, b] of RIGB.batches) if (!live.has(key)) { scene.remove(b.im); b.im.dispose && b.im.dispose(); RIGB.batches.delete(key); }
}
function rigBatchSync(root) {
  if (root !== RIGB.root) { rigRestore(); rigHideAll(); RIGB.root = root; RIGB.dirty = true; }
  if (!root) return;
  if (--RIGB.scanT <= 0) { RIGB.scanT = 20; if (rigCountMeshes(root) !== RIGB.meshCount) RIGB.dirty = true; }
  for (let pass = 0; pass < 2; pass++) {
    if (RIGB.dirty) { rigScan(root); RIGB.dirty = false; }
    else root.updateMatrixWorld();
    for (const b of RIGB.batches.values()) b.n = 0;
    let stale = false;
    const items = RIGB.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], o = it.o;
      if (o.geometry !== it.geo || o.material !== it.mat || o.castShadow !== it.cs || o.material.transparent) { stale = true; break; }
      let vis = true, p = o;
      for (; p; p = p.parent) { if (!p.visible) { vis = false; } if (p === root) break; }
      if (!p) { stale = true; break; }                         // no longer part of this robot (blown off, swapped out)
      if (!vis) continue;
      const b = it.b; b.im.instanceMatrix.array.set(o.matrixWorld.elements, b.n++ * 16);
    }
    if (!stale) break;
    RIGB.dirty = true;                                         // something changed under us: rebuild the lists and go again
  }
  for (const b of RIGB.batches.values()) {
    const im = b.im; im.count = b.n; im.visible = b.n > 0;
    if (b.n) { im.instanceMatrix.updateRange.offset = 0; im.instanceMatrix.updateRange.count = b.n * 16; im.instanceMatrix.needsUpdate = true; }
  }
}
