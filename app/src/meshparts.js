'use strict';
/* ============================================================
   MESHED PARTS (preview)
   Luke's modeled Arms/Chest/Waist pieces, added as NEW selectable options alongside the existing procedural ones —
   nothing default is overwritten. Packed in meshdata_*.js (tools/mesh_pack.py): one side's shape only, mirrored here
   at runtime (scale.x flip) to halve the vertex/index data shipped for arms and legs.
   Stats match the procedural part they sit beside, per Luke's "same stats, don't overwrite" ask.
   Armor pieces (Upper_Arm_Armor, Thigh_Armor, Shin_Armor, Lower_Leg_Armor) are built in but held back until the part
   reaches its max level (3, since arms/legs/waists only earn gem slots from levelling — see LIMB_MAX_LVL in data.js),
   with a small spark+flash+sfx the first time each one bolts on, the same idea as the weapons' MK III reveal, sized
   for something that can happen to every limb rather than a once-per-weapon-type event.
   ============================================================ */
const MESH_ARMOR_COLOR = ORANGE;     // one of the accent colours applySecondary() repaints with the player's secondary colour

function unpackMesh(piece) {
  if (piece._geo) return piece._geo;
  const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
  const pos = new Float32Array(b64(piece.p)), nb = new Int8Array(b64(piece.q));
  const nor = new Float32Array(nb.length); for (let i = 0; i < nb.length; i++) nor[i] = nb[i] / 127;
  const ind = new (piece.wide ? Uint32Array : Uint16Array)(b64(piece.i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(ind, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return piece._geo = g;
}
const meshMat = (hex) => M(hex);     // reuses the game's own cached-material helper (gfx.js), so these share materials with everything else

/* ---------- MK III-style reveal, scaled down for a limb (no cinematic scene, just a beat) ---------- */
const MESH_ARMOR_SEEN = new Set();   // item ids that have already played their armor reveal this session
function meshArmorReveal(item, worldPos) {
  if (MESH_ARMOR_SEEN.has(item.id)) return; MESH_ARMOR_SEEN.add(item.id);
  if (typeof titleBurst === 'function' && worldPos) titleBurst(worldPos, MESH_ARMOR_COLOR, 8);
  if (typeof sfx === 'function') sfx('unfold', 0.7);
}

/* ---------- Arms: Shoulder_Pivot at the origin, Upper_Arm to Elbow_Pivot, Lower_Arm from there to the wrist ---------- */
function meshArmModel(g, { out, item }) {
  const side = Math.sign(out.x) || 1, lvl = item.lvl || 1;
  g.scale.x = side;
  g.add(new THREE.Mesh(unpackMesh(MESH_ARM.upper), meshMat(COL.chassis)));
  if (lvl >= LIMB_MAX_LVL) { g.add(new THREE.Mesh(unpackMesh(MESH_ARM.armor), meshMat(MESH_ARMOR_COLOR))); meshArmorReveal(item, g.localToWorld(new THREE.Vector3(0.5, 0.2, 0))); }
  const lower = new THREE.Group(); lower.position.fromArray(MESH_ARM.elbow); g.add(lower);
  lower.add(new THREE.Mesh(unpackMesh(MESH_ARM.lower), meshMat(COL.chassis)));
  const wrist = MESH_ARM.wrist;
  return { weaponAnchor: socketBlock(g, 0.28, [wrist[0], wrist[1], wrist[2] + 0.12]), gemAt: MESH_ARM.gemAt };
}

/* ---------- Legs/waist: two-bone IK (see legPose in robot.js). thigh/shin/foot are siblings on g, exactly like LEGS.basic. ---------- */
function meshLegModelFor(MESH) {
  return function (g, { out, item }) {
    const side = Math.sign(out.x) || 1, lvl = item.lvl || 1;
    const thigh = new THREE.Group(); g.add(thigh); thigh.scale.x = side;
    thigh.add(new THREE.Mesh(unpackMesh(MESH.thigh), meshMat(COL.chassis)));
    if (MESH.thighArmor && lvl >= LIMB_MAX_LVL) { thigh.add(new THREE.Mesh(unpackMesh(MESH.thighArmor), meshMat(MESH_ARMOR_COLOR))); meshArmorReveal(item, thigh.localToWorld(new THREE.Vector3(0, -MESH.a * 0.5, 0.3))); }
    const shin = new THREE.Group(); g.add(shin); shin.scale.x = side;
    shin.add(new THREE.Mesh(unpackMesh(MESH.shin), meshMat(COL.chassis)));
    if (MESH.shinArmor && lvl >= LIMB_MAX_LVL) { shin.add(new THREE.Mesh(unpackMesh(MESH.shinArmor), meshMat(MESH_ARMOR_COLOR))); meshArmorReveal(item, shin.localToWorld(new THREE.Vector3(0, -MESH.b * 0.5, 0.3))); }
    const foot = new THREE.Group(); g.add(foot); foot.scale.x = side;
    foot.add(new THREE.Mesh(unpackMesh(MESH.foot), meshMat(COL.dark)));
    return { ik: { thigh, shin, foot, a: MESH.a, b: MESH.b, footH: MESH.footH, rest: [MESH.rest[0] * side, MESH.rest[1], MESH.rest[2]], hint: MESH.hint } };
  };
}

/* ---------- Chest: a drop-in replacement for the Scout Torso's visible shell; sockets/stats are unaffected ---------- */
function meshChestOverride() {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(unpackMesh(MESH_CHEST.mesh), meshMat(blockColor(BLOCKS.upper_mesh))));
  return grp;
}

/* ---------- new catalog entries: same stats as the part they sit beside, just a different look ---------- */
ARMS.basic_mesh = Object.assign({}, ARMS.basic, { name: 'Frame Arm (Mesh)', desc: ARMS.basic.desc + ' Modeled part (preview).', model: meshArmModel });

LEGS.basic_mesh = Object.assign({}, LEGS.basic, { name: 'Frame Leg (Mesh)', model: meshLegModelFor(MESH_LEG) });
LEGS.chicken = { name: 'Chicken Leg', speed: LEGS.basic.speed, jump: LEGS.basic.jump, carry: LEGS.basic.carry, mass: LEGS.basic.mass,
  desc: 'Reversed knees, like a bird’s. Modeled part (preview).', model: meshLegModelFor(MESH_CHICKEN) };

LOWERS.standard_mesh = Object.assign({}, LOWERS.standard, { name: 'Walker Legs (Mesh)', legType: 'basic_mesh', desc: LOWERS.standard.desc + ' Modeled part (preview).' });
LOWERS.chicken = Object.assign({}, LOWERS.standard, { name: 'Chicken Legs', legType: 'chicken', desc: 'Two reversed-knee legs, like a bird’s. Same balance as Walker Legs (preview).' });
/* the hip "shell" (the small platform the legs mount to, between the waist and the torso) is a separate table from
   LOWERS keyed the same way -- these two new types reuse the Walker shell/mounts/gem spots rather than modeling a
   new one, which keeps this preview scoped; say the word and I'll pack Luke's own "Waist" piece for it instead. */
LOWER_SHELLS.standard_mesh = LOWER_SHELLS.standard;
LOWER_SHELLS.chicken = LOWER_SHELLS.standard;

/* V2's torso is always one of the 'upper_*' blocks (the plain 'body' block is V1-only) -- clone Scout Torso's stats
   and sockets (two arms, one module on top), same "same stats" rule as the other new parts. */
BLOCKS.upper_mesh = Object.assign({}, BLOCKS.upper_scout, { name: 'Frame Torso (Mesh)', size: MESH_CHEST.size, meshOverride: meshChestOverride, desc: BLOCKS.upper_scout.desc + ' Modeled part (preview).' });

/* catalog.js lists every key of ARMS/LOWERS/BLOCKS automatically; HANGAR_RULES (inventory.js) is what actually gates
   which types show up in the normal (non-dev) hangar pick list, so the new keys also need adding there. */
HANGAR_RULES.arm.types.push('basic_mesh');
HANGAR_RULES.block.types.push('upper_mesh');
