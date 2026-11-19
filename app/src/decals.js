/* ---------- bullet marks ----------
   Every round that ends on the arena leaves a mark where it hit - on the floor, and on the side of a
   wall, which the old ground-only stains could never do. One instanced quad per mark, pooled in a ring
   buffer, tinted from the surface it lands on so it reads as a hole burned into that material rather
   than a sticker laid on top.

   The surface normal comes from the same two probes the ricochet code uses: if the ground is higher at
   (new x, old z) than the round was, it ran into a wall facing x, and the same for z. */
/* Bullet marks are blended quads with depthWrite off, so each one costs fill rate wherever it lands -
   they are dearer per pixel than the ground stains even though there are far fewer of them. The cap
   follows the graphics preset, and a mark that would land on top of one already there is dropped:
   emptying a magazine into one spot used to stack a dozen quads inside half a metre. */
const DEC_MAX = 320;                                      // hard allocation; the live cap is per preset
const DEC_CAP = { low: 130, medium: 220, high: 320 };
const decalCap = () => DEC_CAP[SETTINGS.gfx] || DEC_MAX;
const DEC_AT = new Float32Array(DEC_MAX * 3);             // where each slot's mark sits, for the check below
const DEC = { mesh: null, n: 0, geo: null, mat: null };

/* Is there already a mark within half a mark's width of here? Only the most recent 32 are checked:
   older ones are almost never in the same place, and this runs on every round that lands. */
function decalCrowded(p, size) {
  const look = Math.min(DEC.n, 32), r = size * 0.55, r2 = r * r;
  for (let k = 1; k <= look; k++) {
    const o = (((DEC.n - k) % DEC_MAX + DEC_MAX) % DEC_MAX) * 3;
    const dx = DEC_AT[o] - p.x, dy = DEC_AT[o + 1] - p.y, dz = DEC_AT[o + 2] - p.z;
    if (dx * dx + dy * dy + dz * dz < r2) return true;
  }
  return false;
}

const _dcM = new THREE.Matrix4(), _dcQ = new THREE.Quaternion(), _dcP = new THREE.Vector3(),
      _dcS = new THREE.Vector3(1, 1, 1), _dcC = new THREE.Color(), _dcN = new THREE.Vector3(),
      _dcF = new THREE.Vector3(0, 0, 1);

/* The mark itself: a dark pit with a chipped, slightly brighter rim and a soft edge. A flat square
   reads as a sticker; the rim is what makes it look like something was knocked out of the surface. */
function decalTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const rim = g.createRadialGradient(32, 32, 11, 32, 32, 21);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(0.18, 'rgba(236,228,214,0.5)');      // a tight lip, not a halo
  rim.addColorStop(0.6, 'rgba(236,228,214,0.16)');
  rim.addColorStop(1, 'rgba(236,228,214,0)');
  g.fillStyle = rim; g.beginPath(); g.arc(32, 32, 21, 0, 6.3); g.fill();
  const pit = g.createRadialGradient(31, 31, 0, 32, 32, 13);
  pit.addColorStop(0, 'rgba(0,0,0,1)');
  pit.addColorStop(0.75, 'rgba(0,0,0,0.95)');
  pit.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pit; g.beginPath(); g.arc(32, 32, 13, 0, 6.3); g.fill();
  g.globalCompositeOperation = 'destination-out';       // a few chips out of the edge, so it is not a disc
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * 6.3, r = 14 + Math.random() * 6;
    g.beginPath(); g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 3 + Math.random() * 4, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
  return t;
}

function decalInit() {
  if (DEC.mesh) return;
  DEC.geo = new THREE.PlaneGeometry(1, 1);
  /* Unlit on purpose. A lit decal takes the shading of the face it is on, and most of these land on
     walls that are in shadow - the mark then goes as dark as the wall and cannot be seen at all. Being
     unlit, the pit reads on bright surfaces and the chipped lip reads on dark ones. */
  DEC.mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, map: decalTex(), transparent: true, opacity: 0.82, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const im = new THREE.InstancedMesh(DEC.geo, DEC.mat, DEC_MAX);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEC_MAX * 3).fill(1), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.userData.noShadow = true;
  scene.add(im); DEC.mesh = im; DEC.n = 0;
}

function decalClear() {
  if (!DEC.mesh) return;
  DEC.mesh.count = 0; DEC.n = 0;
}

/* Which way the surface a round just hit is facing. s.last is where it was a step ago. */
function decalNormal(s, out) {
  const ly = s.last ? s.last.y : s.pos.y;
  const wallX = groundAt(s.pos.x, s.last ? s.last.z : s.pos.z) > ly;
  const wallZ = groundAt(s.last ? s.last.x : s.pos.x, s.pos.z) > ly;
  if (wallX && wallZ) {                               // an inside corner: go with whichever it was moving into harder
    if (Math.abs(s.vel.x) >= Math.abs(s.vel.z)) return out.set(s.vel.x > 0 ? -1 : 1, 0, 0);
    return out.set(0, 0, s.vel.z > 0 ? -1 : 1);
  }
  if (wallX) return out.set(s.vel.x > 0 ? -1 : 1, 0, 0);
  if (wallZ) return out.set(0, 0, s.vel.z > 0 ? -1 : 1);
  return out.set(0, 1, 0);
}

/* Put a mark on the surface. n is the surface normal, size the width in metres.

   The round is almost never standing on the surface when it stops: at 40 m/s a step carries it the
   best part of a metre, so the impact point usually sits inside the block it just hit. The mark has to
   be pulled back out to the face of that block or it is buried in solid geometry and never seen. */
function decalAt(p, n, size, tint) {
  decalInit();
  if (decalCrowded(p, size)) return;
  const i = DEC.n % decalCap(); DEC.n++;
  DEC_AT[i * 3] = p.x; DEC_AT[i * 3 + 1] = p.y; DEC_AT[i * 3 + 2] = p.z;
  _dcN.copy(n).normalize();
  _dcSurf.copy(p);
  if (_dcN.y > 0.5) _dcSurf.y = groundAt(p.x, p.z);
  else {
    const k = idxOf(p.x, p.z);
    if (k >= 0) {
      if (Math.abs(_dcN.x) > 0.5) _dcSurf.x = cellX(k) + _dcN.x * CELL / 2;
      else _dcSurf.z = cellZ(k) + _dcN.z * CELL / 2;
      _dcSurf.y = Math.min(_dcSurf.y, H[k] - size * 0.4);    // never hanging off the top of the wall
    }
  }
  p = _dcSurf;
  _dcQ.setFromUnitVectors(_dcF, _dcN);
  // a random roll about the normal, so repeated hits on one wall do not line up
  _dcQ.multiply(new THREE.Quaternion().setFromAxisAngle(_dcF, Math.random() * Math.PI * 2));
  const w = size * rand(0.85, 1.25);
  // 2 cm off the surface, plus a hair per slot so overlapping marks do not fight each other
  _dcP.copy(p).addScaledVector(_dcN, 0.02 + (i % 12) * 0.0015);
  _dcM.compose(_dcP, _dcQ, _dcS.set(w, w, 1));
  DEC.mesh.setMatrixAt(i, _dcM);

  /* Darker than whatever it landed on, with a hint of the round that made it. The colour has to come
     from the right mesh and the right cell: a wall hit sits on the face of the column BEHIND it, which
     is shaded well below the pale cap tile that idxOf would otherwise pick out of the empty cell in
     front. Sampling the wrong one made marks come out lighter than the wall they were on. */
  const k = idxOf(p.x - _dcN.x * CELL * 0.4, p.z - _dcN.z * CELL * 0.4);
  const flat = _dcN.y > 0.5;
  if (k >= 0 && flat && typeof tileMesh !== 'undefined' && tileMesh) tileMesh.getColorAt(k, _dcC);
  else if (k >= 0 && typeof terrainMesh !== 'undefined' && terrainMesh) terrainMesh.getColorAt(k, _dcC);
  else _dcC.setRGB(0.3, 0.3, 0.3);
  if (tint !== undefined) _dcC.lerp(_dcTint.setHex(tint), 0.22);
  // keep a hint of the material, but hold it near the middle of the range: an unlit mark tinted all
  // the way down to a shadowed wall's colour is invisible again
  _dcC.lerp(_dcMid, 0.55).multiplyScalar(rand(0.85, 1.05));
  DEC.mesh.setColorAt(i, _dcC);

  DEC.mesh.count = Math.min(decalCap(), Math.max(DEC.mesh.count, i + 1));
  DEC.mesh.instanceMatrix.needsUpdate = true;
  if (DEC.mesh.instanceColor) DEC.mesh.instanceColor.needsUpdate = true;
}
const _dcSurf = new THREE.Vector3();
const _dcTint = new THREE.Color(), _dcMid = new THREE.Color(0.62, 0.6, 0.57);

/* What a shot leaves behind: the mark, a few sparks off the surface, and a puff of grit.
   Called for every round that ends on the arena, whatever the weapon. */
const DEC_SIZE = { pistol: 0.34, autogun: 0.26, shotgun: 0.2, sniper: 0.6, gatling: 0.26, arc: 0.38, rocket: 0.8 };
function decalShot(s) {
  if (!s || s.flame) return;
  if (typeof pfxInit === 'function') pfxInit();
  const n = decalNormal(s, _dcN2);
  decalAt(s.pos, n, DEC_SIZE[s.wk] || 0.3, s.hostile ? 0xff5a4a : undefined);
  // sparks come off the surface, not out of the ground: they bounce away along the normal
  const col = s.hostile ? COL.red : 0xffd79a;
  const many = 2 + Math.round(Math.min(4, (s.wt || 0.6) * 2));
  for (let i = 0; i < many; i++) {
    const v = _dcV.copy(n).multiplyScalar(rand(2.5, 7))
      .add(_dcV2.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).multiplyScalar(rand(1.5, 5)));
    if (PFX.add) PFX.add.add(s.pos.x, s.pos.y, s.pos.z, v.x, v.y, v.z, rand(0.1, 0.26), rand(0.04, 0.09), col, 16, 0, 0, 0, 0, 0, 0, 0.9);
  }
  if (PFX.lit && Math.random() < 0.7) {
    const v = _dcV.copy(n).multiplyScalar(rand(1, 2.5));
    PFX.lit.add(s.pos.x, s.pos.y, s.pos.z, v.x, v.y + 1.5, v.z, rand(0.35, 0.7), rand(0.06, 0.13), 0x8d8276, 22);
  }
}
const _dcN2 = new THREE.Vector3(), _dcV = new THREE.Vector3(), _dcV2 = new THREE.Vector3();

/* an explosion scorches whatever it went off against */
function decalBlast(p, radius) {
  decalInit();
  const g = groundAt(p.x, p.z);
  if (p.y - g > radius) return;                       // went off in mid-air, nothing to scorch
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.5;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    decalAt(_dcP2.set(x, groundAt(x, z), z), _dcUp, radius * rand(0.5, 0.9), 0x1a1210);
  }
}
const _dcP2 = new THREE.Vector3(), _dcUp = new THREE.Vector3(0, 1, 0);
