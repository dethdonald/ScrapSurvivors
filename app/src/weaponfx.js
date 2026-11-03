'use strict';
/* ============================================================
   WEAPON EFFECTS: every gun has its own look, sound and feel.
   pistol "reliable snap" · autogun "the hose" · shotgun "door kicker" · sniper "the event" · rocket "the spectacle"
   arc caster "the storm" · flamethrower "the hazard" · gravity gun "the anomaly" · missile pods "the swarm"
   Everything is generated here; particles use shared materials so they draw instanced (see batchFx).
   ============================================================ */
let CUR_WTYPE = null;          // which weapon is firing right now (set in fireW / podTick)
let SFX_PITCH = 1;             // read by sfx(): shifts the pitch of the next sound
const WFX_SHARED = new Set();  // extra materials that are safe to batch
const shareMat = m => { WFX_SHARED.add(m); return m; };
function sfxP(kind, vol, pitch) { SFX_PITCH = pitch; sfx(kind, vol); SFX_PITCH = 1; }

/* shared, batchable materials */
const WM = {
  smoke: [0x2b2f33, 0x3a3f44, 0x24272a].map(c => shareMat(new THREE.MeshBasicMaterial({ color: c }))),
  ember: shareMat(new THREE.MeshBasicMaterial({ color: 0xffa83a })),
  dust: shareMat(new THREE.MeshBasicMaterial({ color: 0x8a8270 })),
  white: shareMat(new THREE.MeshBasicMaterial({ color: 0xfff6e0 })),
  pistol: shareMat(new THREE.MeshBasicMaterial({ color: 0xfff0c8 })),
  auto: shareMat(new THREE.MeshBasicMaterial({ color: 0xffa040 })),
  autoHot: shareMat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
  pellet: shareMat(new THREE.MeshBasicMaterial({ color: 0xffd890 })),
  purple: shareMat(new THREE.MeshBasicMaterial({ color: 0xa47cff })),
  blue: shareMat(new THREE.MeshBasicMaterial({ color: 0x9fe6ff })),
};
/* a cube of smoke that grows, drifts and shrinks away (opaque + shared so hundreds cost one draw call) */
function puff(p, s, life = 1.1, drift) {
  const m = new THREE.Mesh(geoBox, WM.smoke[(Math.random() * 3) | 0]); m.position.copy(p); m.rotation.set(rand(0, 3), rand(0, 3), 0);
  const v = drift ? drift.clone() : new THREE.Vector3(rand(-0.6, 0.6), rand(0.8, 1.8), rand(-0.6, 0.6)); const w = rand(-2, 2);
  addFx(m, life * rand(0.8, 1.2), (f, dt) => { const k = 1 - f.life / f.max; f.obj.position.addScaledVector(v, dt); v.multiplyScalar(1 - dt * 1.5); f.obj.rotation.y += w * dt; f.obj.scale.setScalar(s * Math.sin(Math.min(1, k * 1.6 + 0.15) * Math.PI) * (0.6 + k * 0.6)); });
}
function mote(p, mat, v, life, s = 0.08, grav = 0) {
  const m = new THREE.Mesh(geoBox, mat); m.position.copy(p); m.scale.setScalar(s);
  addFx(m, life, (f, dt) => { v.y -= grav * dt; f.obj.position.addScaledVector(v, dt); f.obj.scale.setScalar(s * Math.max(0.1, f.life / f.max)); });
}
/* a second pooled light for heavy impacts (explosions, sniper hits) */
const IMPACT_LIGHT = new THREE.PointLight(0xffb060, 0, 16, 2); scene.add(IMPACT_LIGHT);
function impactLight(p, k = 1, col = 0xffb060) { IMPACT_LIGHT.position.copy(p); IMPACT_LIGHT.color.setHex(col); IMPACT_LIGHT.intensity = Math.max(IMPACT_LIGHT.intensity, 3 * k); }

/* ---------- firing: muzzle extras per weapon ---------- */
function wfxFire(c, W, dir) {
  const t = c.w.type, o = c.o, P = player;
  if (t === 'shotgun') {
    for (let i = 0; i < 3; i++) puff(o.clone().addScaledVector(dir, 0.6 + i * 0.35), 0.5 + i * 0.12, 0.9, dir.clone().multiplyScalar(1.4 - i * 0.3).add(new THREE.Vector3(0, 0.4, 0)));
    muzzleFlash(o, dir, 3.2);
    // pump: chk... chk
    setTimeout(() => { sfx('pump', 0.5); c.w.slideV = (c.w.slideV || 0) - 3.2; }, 230);
    setTimeout(() => { sfx('pump2', 0.45); c.w.slideV = (c.w.slideV || 0) + 4; }, 330);
  } else if (t === 'sniper') {
    ring(new THREE.Vector3(P.pos.x, groundAt(P.pos.x, P.pos.z), P.pos.z), 3.2, 0.4, 0xb8b09a); dust(P.pos, 6);
    muzzleFlash(o, dir, 2.6); impactLight(o, 0.6, 0xffe0b0);
    setTimeout(() => sfx('bolt', 0.5), 380);
  } else if (t === 'rocket') {
    for (let i = 0; i < 4; i++) puff(o.clone().addScaledVector(dir, -0.8 - i * 0.4), 0.55, 1.3, dir.clone().multiplyScalar(-rand(2, 4)).add(new THREE.Vector3(rand(-0.5, 0.5), 0.5, rand(-0.5, 0.5))));
    sfx('whistle', 0.3);
  } else if (t === 'autogun') {
    c.w.heat = Math.min(1, (c.w.heat || 0) + 0.035); c.w.hissDue = true;
  } else if (t === 'flamer') {
    if (S.t - (c.w.flameAt || -9) > 0.35) sfx('fwoomp', 0.6);
    c.w.flameAt = S.t;
  } else if (t === 'gravity') {
    ring(o, 1.4, 0.35, 0xa47cff); ring(o, 0.8, 0.25, 0xe0d0ff);
    humSound(2.6);
  }
}
/* pitch and look of the gunshot itself (called just before the gun's sound) */
function wfxShotPitch(c) { return c.w.type === 'autogun' ? 1 + (c.w.heat || 0) * 0.18 : 1; }

/* ---------- the projectile's look in flight ---------- */
function wfxStyleBullet(s, m, wt) {
  const t = s.wk;
  if (t === 'pistol') { m.material = WM.pistol; m.scale.set(0.5, 0.5, 2.6); }
  else if (t === 'autogun') {
    const w = DMG_SRC; const n = w ? (w.shotN = (w.shotN || 0) + 1) : 0;
    const hot = n % 4 === 0;
    m.material = hot ? WM.autoHot : WM.auto; m.scale.set(hot ? 0.42 : 0.3, hot ? 0.42 : 0.3, hot ? 5.5 : 3.6);
  } else if (t === 'shotgun') { m.material = WM.pellet; m.scale.set(0.95, 0.95, 1.5); }
  else if (t === 'sniper') { m.material = WM.white; }
}
/* per frame in flight */
function wfxShotTick(s, dt) {
  if (s.rocket && !s.pod) {
    // a thick, slightly wobbling smoke trail and a flickering exhaust
    s.trailT = (s.trailT || 0) - dt;
    if (s.trailT <= 0) { s.trailT = 0.025; puff(s.pos.clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.15, 0.15), rand(-0.15, 0.15))), rand(0.45, 0.7), 1.6, new THREE.Vector3(rand(-0.4, 0.4), rand(0.2, 0.7), rand(-0.4, 0.4))); }
    if (s.flameMesh) s.flameMesh.scale.set(0.8, 0.8, 0.7 + Math.random() * 0.9);
    return true;
  }
  if (s.pod) {
    // thin curly trails
    s.trailT = (s.trailT || 0) - dt; s.age2 = (s.age2 || 0) + dt;
    if (s.trailT <= 0) { s.trailT = 0.03; const a = s.age2 * 22; puff(s.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.2, Math.sin(a) * 0.2, Math.sin(a) * 0.2)), 0.22, 0.9, new THREE.Vector3(0, 0.3, 0)); }
    if (!(s.climb > 0) && !s.dove) { s.dove = true; sfxP('whistle', 0.12, rand(1.1, 1.5)); }
    return true;
  }
  return false;
}
/* ---------- hits ---------- */
const HIT_SND = { pistol: 'hitL', autogun: 'hitL', shotgun: 'hitH', sniper: 'hitH', pods: 'hitL' };
function wfxHitEnemy(s, e, wasAlive) {
  const t = s.wk, c = aimPt(e);
  if (HIT_SND[t]) sfxP(HIT_SND[t], t === 'sniper' ? 0.6 : 0.3, rand(0.9, 1.15));
  if (t === 'shotgun' && s.o0 && s.o0.distanceTo(c) < 3.2 && !e.dead) {
    // point blank: extra damage and a door-kicking blowback
    damage(e, s.dmg * 0.6, s.manual);
    if (!e.dead) { knock(e, s.vel.clone().normalize(), 6, 6); e.onGround = false; }
    for (let i = 0; i < 3; i++) spark(c, 0xffe0a0);
  }
  if (t === 'sniper') { burst(c, 0xfff0d0, 8); impactLight(c, 0.8, 0xfff0d0); if (wasAlive && e.dead) { S.slowT = 0.25; cam.fovPunch = -7; } }
  if (t === 'pistol' && wasAlive && e.dead) { for (let i = 0; i < 6; i++) mote(c, WM.pistol, new THREE.Vector3(rand(-2, 2), rand(5, 9), rand(-2, 2)), 0.5, 0.12, 22); }
}
function wfxHitGround(s) {
  const t = s.wk, p = s.pos;
  if (t === 'pistol') { stain(p.x, p.z, 0.22, new THREE.Color(0x1c1a18)); }
  else if (t === 'autogun') { dust(p, 1); }
  else if (t === 'shotgun') { dust(p, 2); stain(p.x, p.z, 0.18, new THREE.Color(0x1c1a18)); }
  else if (t === 'sniper') { dust(p, 4); for (let i = 0; i < 4; i++) spark(p, 0xffe6a0); impactLight(p, 0.5); stain(p.x, p.z, 0.4, new THREE.Color(0x141210)); }
}
/* rocket impact: a fireball that swells then collapses, a shockwave, a scorch and flying chunks */
function wfxRocketBoom(p, radius) {
  const gy = groundAt(p.x, p.z);
  const fb = new THREE.Mesh(geoBlast, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  fb.position.copy(p);
  addFx(fb, 0.55, f => { const k = 1 - f.life / f.max, sz = radius * (k < 0.3 ? k / 0.3 * 0.9 : 0.9 - (k - 0.3) * 0.9); f.obj.scale.setScalar(Math.max(0.05, sz)); f.obj.material.color.setHSL(0.09 - k * 0.07, 1, 0.6 - k * 0.35); f.obj.material.opacity = 0.95 * (1 - k * k); });
  ring(new THREE.Vector3(p.x, gy, p.z), radius * 1.6, 0.45, 0xffd0a0);
  for (let i = 0; i < 5; i++) stain(p.x + rand(-1, 1) * radius * 0.4, p.z + rand(-1, 1) * radius * 0.4, rand(0.5, 1) * radius * 0.4, new THREE.Color(0x100c0a));
  for (let i = 0; i < 8; i++) { const v = new THREE.Vector3(rand(-6, 6), rand(6, 12), rand(-6, 6)); const m = new THREE.Mesh(geoBox, WM.smoke[2]); m.position.copy(p); const s = rand(0.12, 0.28); m.scale.setScalar(s); addFx(m, rand(0.7, 1.1), (f, dt) => { v.y -= 24 * dt; f.obj.position.addScaledVector(v, dt); f.obj.rotation.x += dt * 9; if (f.obj.position.y < groundAt(f.obj.position.x, f.obj.position.z)) v.set(0, 0, 0); }); }
  for (let i = 0; i < 6; i++) puff(p.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), rand(0.9, 1.5), 1.8);
  impactLight(p, 1.4, 0xffa040);
}
/* ---------- Arc Caster: the bolt re-forks a few times while it's alive, and zapped enemies twitch ---------- */
function wfxArcEcho(pts, power) {
  for (const dl of [35, 70]) setTimeout(() => {
    if (!S.inRun) return;
    const M_ = arcMats(), w = 0.04 + 0.035 * power;
    for (let i = 0; i < pts.length - 1; i++) { const path = arcPath(pts[i], pts[i + 1], 0.45 + 0.3 * power); for (let k = 0; k < path.length - 1; k++) arcSeg(path[k], path[k + 1], w * 0.8, M_.core, 0.06); }
  }, dl);
  // each jump along the chain snaps a little higher
  for (let i = 1; i < pts.length; i++) {
    setTimeout(() => sfxP('snapZ', 0.35, 1 + i * 0.12), i * 28);
    for (const e of enemies) if (!e.dead && aimPt(e).distanceToSquared(pts[i]) < 1.2) e.zapT = 0.45;
  }
}
/* ---------- per frame: idle effects on mounted guns ---------- */
function wfxTick(dt) {
  const ud = player.model && player.model.userData; if (!ud) return;
  for (const w of mountedWeapons()) {
    const mz = ud.muzzleOf.get(w);
    if (w.type === 'autogun') {
      // the barrel heats with sustained fire and cools when you stop (a hiss when you let go hot)
      const firing = S.t - (w.lastShot || -9) < 0.15;
      if (!firing) { if (w.hissDue && (w.heat || 0) > 0.35) sfx('hiss', 0.25 + w.heat * 0.3); w.hissDue = false; w.heat = Math.max(0, (w.heat || 0) - dt * 0.35); }
      const g = ud.partOf.get(w);
      if (g) {
        if (!g.userData.heatMats) { g.userData.heatMats = []; g.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.material.transparent) { o.material = o.material.clone(); g.userData.heatMats.push(o.material); } }); }
        const h = Math.max(0, (w.heat || 0) - 0.25) / 0.75;
        for (const m of g.userData.heatMats) m.emissive.setRGB(0.9 * h, 0.18 * h * h, 0.02 * h);
        if (h > 0.5 && mz && Math.random() < dt * 8) { const o = mz.getWorldPosition(new THREE.Vector3()); puff(o, 0.18, 0.7, new THREE.Vector3(0, 1.2, 0)); }
      }
    } else if (w.type === 'lightning' && mz && Math.random() < dt * 10) {
      // crackling charge round the coils
      const o = mz.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2)));
      mote(o, WM.blue, new THREE.Vector3(rand(-1.5, 1.5), rand(-0.5, 2), rand(-1.5, 1.5)), 0.18, 0.05);
    } else if (w.type === 'flamer' && mz) {
      // a little blue pilot light at the nozzle
      if (!mz.userData.pilot) { const pl = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); pl.scale.set(0.07, 0.07, 0.14); pl.position.z = 0.06; mz.add(pl); mz.userData.pilot = pl; }
      mz.userData.pilot.scale.z = 0.1 + Math.random() * 0.08;
    }
  }
  // burning patches on the ground
  for (const fp of FIRE_PATCHES) {
    fp.t -= dt; fp.tick -= dt;
    if (Math.random() < dt * 14) mote(new THREE.Vector3(fp.x + rand(-fp.r, fp.r), fp.y + 0.1, fp.z + rand(-fp.r, fp.r)), WM.ember, new THREE.Vector3(rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4)), rand(0.3, 0.6), 0.09);
    fp.mesh.scale.setScalar(fp.r * Math.min(1, fp.t) * (0.9 + 0.1 * Math.random()));
    if (fp.tick <= 0) { fp.tick = 0.3; for (const e of enemies) if (!e.dead && !e.d.fly && Math.hypot(e.pos.x - fp.x, e.pos.z - fp.z) < fp.r + e.r && Math.abs(e.pos.y - fp.y) < 1.5) ignite(e, fp.dmg); }
    if (fp.t <= 0) scene.remove(fp.mesh);
  }
  for (let i = FIRE_PATCHES.length - 1; i >= 0; i--) if (FIRE_PATCHES[i].t <= 0) FIRE_PATCHES.splice(i, 1);
  IMPACT_LIGHT.intensity *= Math.exp(-dt * 14); if (IMPACT_LIGHT.intensity < 0.02) IMPACT_LIGHT.intensity = 0;
}
/* ---------- flamethrower: colour-aging flames, embers, burning ground ---------- */
const FIRE_PATCHES = [];
const FIRE_GEO = new THREE.CircleGeometry(1, 10), FIRE_MAT = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
/* flames age through a few shared looks (so a full stream still draws in a handful of calls):
   bright orange, yellow-orange, red, dark red, then sooty smoke */
const FLAME_MATS = [[0xff7a1a, 0.85, 1], [0xffc04a, 0.85, 1], [0xff4a12, 0.7, 1], [0xa01a08, 0.55, 1], [0x2a2420, 0.45, 0], [0x1a1816, 0.25, 0]]
  .map(([c, o, add]) => shareMat(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })));
function wfxFlameTick(s, k) {
  // orange -> red -> sooty black as the flame ages
  const b = k < 0.25 ? (s.mesh.material === FLAME_MATS[1] ? 1 : 0) : k < 0.5 ? 2 : k < 0.7 ? 3 : k < 0.88 ? 4 : 5;
  s.mesh.material = FLAME_MATS[b];
  if (Math.random() < 0.04) mote(s.pos, WM.ember, new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), rand(0.4, 0.8), 0.06, 4);
}
function wfxFlameGround(s) {
  if (FIRE_PATCHES.length > 8 || Math.random() > 0.08) return;
  const x = s.pos.x, z = s.pos.z, y = groundAt(x, z);
  for (const fp of FIRE_PATCHES) if (Math.hypot(fp.x - x, fp.z - z) < 1.2) { fp.t = Math.max(fp.t, 1.6); return; }
  const mesh = new THREE.Mesh(FIRE_GEO, FIRE_MAT);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y + 0.04, z); mesh.scale.setScalar(rand(0.8, 1.2)); scene.add(mesh);
  FIRE_PATCHES.push({ x, y, z, r: mesh.scale.x, t: rand(1.2, 2), tick: 0, dmg: s.dmg * 1.4, mesh });
  stain(x, z, 0.6, new THREE.Color(0x120e0c));
}
function wfxClear() { for (const fp of FIRE_PATCHES) scene.remove(fp.mesh); FIRE_PATCHES.length = 0; }

/* ---------- gravity gun ---------- */
function wfxWellMake(g) {
  const acc = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: 0xc8a8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  acc.rotation.x = Math.PI / 2.4; g.add(acc); g.userData.acc = acc;
}
function wfxWellTick(s, dt) {
  const acc = s.mesh.userData.acc; if (acc) { acc.rotation.z += dt * 9; acc.scale.setScalar(1 + 0.12 * Math.sin(S.t * 14)); }
  // dust and debris spiral in
  if (Math.random() < dt * 30) {
    const a = rand(0, 6.3), r = s.well.radius * rand(0.6, 1), y = rand(-0.8, 1.2), start = s.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    const m = new THREE.Mesh(geoBox, Math.random() < 0.5 ? WM.purple : WM.dust); m.scale.setScalar(rand(0.06, 0.14)); m.position.copy(start);
    let ang = a, rr = r; const c0 = s.pos;
    addFx(m, rand(0.5, 0.9), (f, d) => { ang += d * (3 + 8 * (1 - rr / r)); rr = Math.max(0.05, rr - d * r * 1.6); f.obj.position.set(c0.x + Math.cos(ang) * rr, c0.y + y * rr / r, c0.z + Math.sin(ang) * rr); });
  }
}
function wfxWellCollapse(s) {
  // implosion flash, a beat of silence, then the thoom
  const p = s.pos.clone();
  blast(p, 1.4, 0xffffff); impactLight(p, 1, 0xb090ff);
  setTimeout(() => { if (!S.inRun) return; sfx('thoom', 0.8); ring(new THREE.Vector3(p.x, groundAt(p.x, p.z), p.z), s.well.radius * 2.2, 0.5, 0xa47cff); blast(p, s.well.radius * 0.8, 0x8a5cff); camKick(new THREE.Vector3(player.pos.x - p.x, 0.2, player.pos.z - p.z), 0.12); }, 140);
}
/* the gravity hum: a low drone that rises in pitch for as long as the well pulls */
function humSound(dur) {
  if (!actx) return;
  try {
    const t = actx.currentTime, o = actx.createOscillator(), o2 = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(140, t + dur); o2.frequency.setValueAtTime(110, t); o2.frequency.exponentialRampToValueAtTime(300, t + dur);
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.3); g.gain.setValueAtTime(0.08, t + dur - 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(actx.destination); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  } catch (e) {}
}
