'use strict';
/* ============================================================
   BOSSES (Chunk 08). One is picked at random at BOSS_AT (see BOSS_POOL in combat.js). All of them scale with the stage
   and clock the same way (spawnBoss), shrug off knockback/stun (knock/updateEnemies), and are not hit by freeze.
     Warden      volley, slam, drone summons and now GRAB: ring + glow (telegraph), holds up to 8 nearby enemies where you can
                 shoot them, then throws the survivors at you in a shotgun spread. Big damage while it holds interrupts it.
     Magnetron   magnetic pull (blue ring telegraph, only with line of sight) then a shockwave slam; slow orb spreads.
     Smelter     slag lobs on red telegraphed circles that leave fire pools; vents every 12 s (x2 damage while open).
     Hive Mother three egg sacs ride on its back (separate shootable targets); each pulses then spawns a wave until destroyed.
     Golden Pig  passive and harmless. First hit starts an escape timer, later hits shake out bolts (capped at the weapon-case
                 price captured at the first hit, one payout per 0.3 s), then it leaps out. The exit is open from the start.
   ============================================================ */
const BOSS_HINT = {
  warden: 'Kill it · exit opens', magnetron: 'Break line of sight when it hums', smelter: 'Dodge the red circles · shoot it when it vents',
  hivemother: 'Shoot the glowing sacs',
};
const GRAB = { max: 8, reach: 15, wind: 1.3, hold: 2.4, spreadDeg: 16, speed: 30, interrupt: 0.05, flight: 2.2 };
const losClear = (e, p) => {            // is the terrain between the boss and the player low enough to see across?
  const y0 = e.pos.y + 2.5, y1 = p.y + 1.3;
  for (let i = 1; i < 8; i++) { const k = i / 8, x = e.pos.x + (p.x - e.pos.x) * k, z = e.pos.z + (p.z - e.pos.z) * k; if (groundAt(x, z) > y0 + (y1 - y0) * k + 0.2) return false; }
  return true;
};
const dir2 = (e, p) => { const dx = p.x - e.pos.x, dz = p.z - e.pos.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
function shotAt(e, ang, dist = 20) { return { x: e.pos.x + Math.cos(ang) * dist, y: player.pos.y, z: e.pos.z + Math.sin(ang) * dist }; }

/* damage taken by a boss: Smelter vent doubles it, the Warden counts it towards interrupting a grab, the Pig pays out */
function bossHit(e, amt) {
  if (e.type === 'smelter' && (e.state.venting || 0) > 0) amt *= 2;
  if (e.type === 'warden' && e.state.grab) e.state.grab.dmg += amt;
  if (e.type === 'pig') pigHit(e, amt);
  return amt;
}

/* ---------------- Warden: grab and throw ---------------- */
const grabbable = o => !o.dead && !o.boss && !o.mini && !o.d.npc && !o.held && !o.attach && o.type !== 'sac';
function wardenGrab(e, dt) {
  const st = e.state;
  if (!st.grab) {
    st.grabCd = (st.grabCd ?? 7) - dt;
    if (st.grabCd > 0) return false;
    let n = 0; for (const o of enemies) if (grabbable(o) && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < GRAB.reach) n++;
    if (n < 3) { st.grabCd = 1.5; return false; }                     // nothing worth grabbing
    st.grab = { phase: 'wind', t: GRAB.wind, dmg: 0, held: [], pulse: 0 };
    banner('GRAB', 'It is gathering the swarm', '#ffd23a', 1.4); sfx('thoom', 0.6);
    return true;
  }
  const g = st.grab; g.t -= dt; e.stand = true;
  g.pulse -= dt; if (g.pulse <= 0) { g.pulse = 0.35; ring(e.pos, GRAB.reach * (g.phase === 'wind' ? 1 - g.t / GRAB.wind * 0.6 : 0.4), 0.35, 0xffd23a); }
  e.flash = Math.max(e.flash, Math.sin(performance.now() / 70) > 0 ? 0.03 : 0);
  if (g.phase === 'hold' || g.phase === 'wind') {
    if (g.dmg >= e.maxHp * GRAB.interrupt) {                           // interrupted: everything it held drops, it staggers
      for (const o of g.held) if (o.held) { o.held = null; o.stun = 1.2; o.vel.set(0, -4, 0); }
      st.grab = null; st.grabCd = 10; st.stagger = 1.8; banner('INTERRUPTED', '', '#9fe9ff', 1.6); sfx('thud', 0.8); cam.shake = Math.max(cam.shake, 0.5);
      return true;
    }
  }
  if (g.phase === 'wind') {
    if (g.t <= 0) {
      const near = enemies.filter(o => grabbable(o) && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < GRAB.reach)
        .sort((a, b) => a.pos.distanceToSquared(e.pos) - b.pos.distanceToSquared(e.pos)).slice(0, GRAB.max);
      near.forEach((o, i) => { o.held = { by: e, i, n: near.length }; o.stun = 99; o.vel.set(0, 0, 0); g.held.push(o); });
      g.phase = 'hold'; g.t = GRAB.hold; sfx('whistle', 0.5);
      if (!near.length) { st.grab = null; st.grabCd = 4; }
    }
  } else if (g.phase === 'hold') {
    g.held = g.held.filter(o => !o.dead && o.held);
    if (!g.held.length) { st.grab = null; st.grabCd = rand(9, 12); return true; }
    if (g.t <= 0) wardenThrow(e, g);
  }
  return true;
}
function wardenThrow(e, g) {
  const live = g.held, n = live.length, pp = player.pos;
  live.forEach((o, i) => {
    o.held = null;
    const base = Math.atan2(pp.z - o.pos.z, pp.x - o.pos.x), off = ((n > 1 ? i / (n - 1) : 0.5) - 0.5) * 2 * THREE.MathUtils.degToRad(GRAB.spreadDeg) + rand(-0.04, 0.04);
    const a = base + off, hd = Math.hypot(pp.x - o.pos.x, pp.z - o.pos.z);
    o.vel.set(Math.cos(a) * GRAB.speed, 5 + hd * 0.1, Math.sin(a) * GRAB.speed);
    o.stun = GRAB.flight; o.onGround = false; o.thrown = { t: GRAB.flight, hit: false, dmg: Math.max(14, e.dmg * 0.8) };
    o.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
  });
  e.state.grab = null; e.state.grabCd = rand(11, 14);
  cam.shake = Math.max(cam.shake, 0.4); sfx('swish', 0.9); ring(e.pos, 8, 0.3, 0xffd23a);
}
function heldTick(e, dt) {
  const w = e.held.by;
  if (!w || w.dead) { e.held = null; e.stun = 1; return; }
  const t = performance.now() / 1000, a = e.held.i / Math.max(1, e.held.n) * Math.PI * 2 + t * 1.6;
  const tx = w.pos.x + Math.cos(a) * 4.4, ty = w.pos.y + 9 + Math.sin(t * 3 + e.held.i) * 0.5, tz = w.pos.z + Math.sin(a) * 4.4;
  const k = Math.min(1, dt * 8);
  e.pos.x += (tx - e.pos.x) * k; e.pos.y += (ty - e.pos.y) * k; e.pos.z += (tz - e.pos.z) * k;
  e.vel.set(0, 0, 0); e.onGround = false; e.spin.y += dt * 6;
  if (Math.sin(t * 14 + e.held.i) > 0.6) e.flash = Math.max(e.flash, 0.03);
}
function thrownTick(e, dt, dx, dy, dz) {
  const T = e.thrown; T.t -= dt;
  if (!T.hit && S.mode === 'play' && Math.hypot(dx, dy, dz) < e.r + 1.5) {
    T.hit = true; hurt(T.dmg, e.pos); burst(ecenter(e).clone(), e.d.color, 8); sfx('boom', 0.35);
    e.thrown = null; envDmg(() => killEnemy(e)); return;
  }
  if (T.t <= 0 || (e.onGround && T.t < GRAB.flight - 0.35)) e.thrown = null;
}

/* ---------------- Hive Mother sacs ---------------- */
function attachTick(e, dt) {
  const m = e.attach.parent;
  if (!m || m.dead) { envDmg(() => killEnemy(e)); return; }
  e.pos.set(m.pos.x + e.attach.x, m.pos.y + 6.6, m.pos.z + e.attach.z); e.vel.set(0, 0, 0); e.onGround = true;
}
function hiveInit(e) {
  const st = e.state; st.sacs = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5, ox = Math.cos(a) * 1.4, oz = -4.6 * 0.55 + Math.sin(a) * 1.4;
    const s = spawnEnemy('sac', { x: e.pos.x + ox, y: e.pos.y + 6.6, z: e.pos.z + oz }, { hpMul: 1 });
    s.attach = { parent: e, x: ox, z: oz }; s.sacT = 3.5 + i * 3.2; s.color && 0; st.sacs.push(s);
  }
}
const BOSS_AI = {
  /* ---- Magnetron ---- */
  magnetron(e, dt, hd) {
    const st = e.state; e.stand = false;
    st.shot = (st.shot ?? 4) - dt;
    if (st.shot <= 0 && hd < 50) {                                      // slow spread of orbs
      st.shot = Math.max(3.2, 5 - S.stage * 0.3);
      const base = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
      for (let i = -2; i <= 2; i++) fireHostile(e, shotAt(e, base + i * 0.16), 11, 3);
    }
    let m = st.mag;
    if (!m) {
      st.magCd = (st.magCd ?? 6) - dt;
      if (st.magCd <= 0 && hd < 48) { st.mag = { phase: 'wind', t: 1.5, pulse: 0 }; banner('MAGNETIC PULL', 'Break line of sight or run', '#4ab8ff', 1.8); sfx('thoom', 0.7); }
      return;
    }
    m.t -= dt; e.stand = true; m.pulse -= dt;
    const c = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
    if (m.phase === 'wind') {
      if (m.pulse <= 0) { m.pulse = 0.3; ring(c, 26 * (m.t / 1.5) + 4, 0.3, 0x4ab8ff); }
      if (m.t <= 0) { m.phase = 'pull'; m.t = 1.7; sfx('vacuum', 0.7); }
    } else if (m.phase === 'pull') {
      if (m.pulse <= 0) { m.pulse = 0.12; spark(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0x4ab8ff); }
      if (hd < 26 && hd > 4 && S.mode === 'play' && losClear(e, player.pos)) {
        const [ux, uz] = dir2(player, e.pos), sp = 9.5 * dt, nx = player.pos.x + ux * sp, nz = player.pos.z + uz * sp;
        if (groundAt(nx, nz) <= player.pos.y + 0.6) { player.pos.x = nx; player.pos.z = nz; }
      }
      if (m.t <= 0) { m.phase = 'slam'; m.t = 0.9; }
    } else if (m.phase === 'slam') {
      if (m.pulse <= 0) { m.pulse = 0.25; ring(c, 10, 0.25, COL.red); }
      if (m.t <= 0) {
        cam.shake = 0.6; ring(c, 10, 0.5, COL.red); burst(c, 0x4ab8ff, 14); sfx('boom', 0.7);
        if (hd < 10 && player.onGround && player.pos.y - e.pos.y < 2.5) { hurt(e.dmg, e.pos); player.vel.y = jumpV(1.5); player.onGround = false; }
        st.mag = null; st.magCd = rand(9, 11);
      }
    }
  },
  /* ---- Smelter ---- */
  smelter(e, dt, hd) {
    const st = e.state; e.stand = false;
    st.slag = (st.slag ?? 3) - dt;
    if (st.slag <= 0 && hd < 48) {
      st.slag = Math.max(2.2, 3.6 - S.stage * 0.2);
      const lead = player.pos.clone(); lead.x += player.vel.x * 0.7; lead.z += player.vel.z * 0.7;
      addHazard(lead.x, lead.z, 3.4, 1.2);
      for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, r = rand(3, 9); addHazard(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r, 3.4, 1.2); }
      sfx('whistle', 0.4);
    }
    st.vent = (st.vent ?? 9) - dt;
    if (st.vent <= 0 && !(st.venting > 0)) { st.venting = 4; st.vent = 12; banner('VENT OPEN', 'Double damage', '#ff7a1a', 1.8); sfx('fwoomp', 0.8); }
    if (st.venting > 0) {
      st.venting -= dt; if (Math.random() < dt * 14) smokePuff(new THREE.Vector3(e.pos.x + rand(-1, 1), e.pos.y + 5 + rand(0, 2), e.pos.z + rand(-1, 1)), rand(0.5, 0.9));
      e.flash = Math.max(e.flash, Math.sin(performance.now() / 90) > 0 ? 0.03 : 0);
    }
  },
  /* ---- Hive Mother ---- */
  hivemother(e, dt, hd) {
    const st = e.state; if (!st.sacs) hiveInit(e);
    st.acid = (st.acid ?? 3) - dt;
    if (st.acid <= 0 && hd < 40) { st.acid = 5; const base = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x); for (let i = -1; i <= 1; i++) fireHostile(e, shotAt(e, base + i * 0.2), 13, 3); }
    let alive = 0;
    for (const s of st.sacs) {
      if (s.dead) continue; alive++;
      s.sacT -= dt;
      if (s.sacT < 1.1) s.flash = Math.max(s.flash, Math.sin(performance.now() / 60) > 0 ? 0.03 : 0);
      if (s.sacT <= 0) {
        s.sacT = Math.max(6, 9 - S.stage * 0.4);
        const n = 3 + S.stage;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, t = i % 2 ? 'splitling' : 'drone'; spawnEnemy(t, { x: e.pos.x + Math.cos(a) * 5, y: e.pos.y + 3, z: e.pos.z + Math.sin(a) * 5 }); }
        burst(s.pos, 0xb6e040, 12); sfx('pop2', 0.7);
      }
    }
    if (!alive && !st.enraged) { st.enraged = true; e.speed *= 1.35; banner('SACS DOWN', 'The Mother is furious', '#b6e040', 2); }
  },
  /* ---- Golden Pig ---- */
  pig(e, dt, hd) {
    const P = S.pig; if (!P) return;
    const [ax, az] = dir2(player, e.pos);                                  // direction from the player to the pig = away
    if (P.fleeT === null) {
      P.wanderT -= dt; if (P.wanderT <= 0) { P.wanderT = rand(2, 4); P.wa = Math.random() * Math.PI * 2; }
      let sx = Math.cos(P.wa), sz = Math.sin(P.wa);
      if (hd < 10) { sx = ax; sz = az; }                                   // shy: wanders, but backs off if you crowd it
      e.steer = [sx, sz]; e.steerSpd = e.speed;
    } else {
      P.fleeT -= dt; e.steer = [ax, az]; e.steerSpd = e.speed * 3.4;
      $('#bossName').textContent = `GOLDEN PIG · ${Math.max(0, Math.ceil(P.fleeT))}s`;
      if (P.fleeT <= 0) pigLeap(e);
    }
  },
};

/* ---------------- Golden Pig ---------------- */
function pigStart(e) {
  S.pig = { e, fleeT: null, wanderT: 0, wa: Math.random() * 6.28, cap: 0, paid: 0, last: -9 };
  if (!S.gate) placeGate();
  setGateState('exit'); S.bossDead = true;                                 // optional bonus boss: the exit is open from the start
}
function pigHit(e, amt) {
  const P = S.pig; if (!P || e.leap || e.dead) return;
  if (P.fleeT === null) {                                                  // first hit: start the timer, capture the payout cap, pay nothing yet
    P.fleeT = 18; P.cap = casePrice(); P.paid = 0; P.last = S.t;
    banner('GOLDEN PIG', 'Keep hitting it · 18s', '#f2c230', 2); sfx('jackpot', 0.5); return;
  }
  if (amt < 1 || S.t - P.last < 0.3 || P.paid >= P.cap) return;           // one payout per 0.3 s no matter how fast you fire
  P.last = S.t;
  const give = Math.min(P.cap - P.paid, Math.max(1, Math.ceil(P.cap / 12)));
  P.paid += give; pigCoin(e, give);
}
function pigCoin(e, val) {
  dropBolt(e.pos.clone().setY(e.pos.y + 2.4), val); const g = gems[gems.length - 1];
  if (g) { g.vel.set(rand(-6, 6), rand(6, 10), rand(-6, 6)); g.mesh.scale.setScalar(1 + Math.min(1.2, val / 20)); }
  sfx('coin', 0.5);
}
function pigLeap(e) {
  e.leap = { t: 0 }; e.state.dead = true;
  banner('IT LEAPS AWAY', 'The pig escaped', '#f2c230', 2); sfx('whistle', 0.7);
}
function pigLeapTick(e, dt) {
  e.leap.t += dt; e.pos.y += (14 + e.leap.t * 40) * dt; e.vel.set(0, 0, 0); e.onGround = false; e.spin.y += dt * 8;
  if (Math.random() < dt * 20) spark(e.pos.clone().setY(e.pos.y + 1), 0xf2c230);
  if (e.leap.t > 1.6) { e.dead = true; scene.remove(e.mesh); if (e.bar) { scene.remove(e.bar); e.bar = null; } pigEnd(); }
}
function pigDown(e) {                                                       // killed: the unpaid rest of the cap spills out (never more than the cap)
  const P = S.pig; if (P && P.cap > P.paid) { const rest = P.cap - P.paid; P.paid = P.cap; for (let i = 0; i < 4; i++) pigCoin(e, Math.max(1, Math.round(rest / 4))); }
  banner('GOLDEN PIG DOWN', '', '#f2c230', 2); pigEnd();
}
function pigEnd() { S.pig = null; S.boss = null; $('#bossbar').hidden = true; }

/* ---------------- Smelter hazards: telegraphed slag circles that become fire pools ---------------- */
const HAZ = [];
const hazGeo = new THREE.CircleGeometry(1, 20); hazGeo.rotateX(-Math.PI / 2);
function addHazard(x, z, r, warn) {
  const m = new THREE.Mesh(hazGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const y = groundAt(x, z) + 0.06; m.position.set(x, y, z); m.scale.setScalar(r); scene.add(m);
  HAZ.push({ m, x, z, y, r, t: warn, pool: false, tick: 0 });
}
function hazardTick(dt) {
  for (let i = HAZ.length - 1; i >= 0; i--) {
    const h = HAZ[i], pl = player.pos, inside = Math.hypot(pl.x - h.x, pl.z - h.z) < h.r && Math.abs(pl.y - h.y) < 2.5;
    h.t -= dt;
    if (!h.pool) {
      h.m.material.opacity = 0.25 + 0.2 * Math.sin(performance.now() / 70);
      if (h.t <= 0) {
        const c = new THREE.Vector3(h.x, h.y, h.z); ring(c, h.r * 1.3, 0.3, 0xff7a1a); burst(c, 0xff7a1a, 8); sfx('boom', 0.3);
        if (inside && S.mode === 'play') hurt((S.boss ? S.boss.dmg : 20) * 0.7, c);
        h.pool = true; h.t = 4; h.m.material.color.setHex(0xff7a1a);
      }
    } else {
      h.m.material.opacity = 0.5 + 0.2 * Math.sin(performance.now() / 120) * Math.min(1, h.t);
      h.tick -= dt;
      if (inside && h.tick <= 0 && S.mode === 'play') { h.tick = 0.5; hurt((S.boss ? S.boss.dmg : 20) * 0.18, new THREE.Vector3(h.x, h.y, h.z)); }
      if (Math.random() < dt * 4) spark(new THREE.Vector3(h.x + rand(-h.r, h.r) * 0.7, h.y + 0.2, h.z + rand(-h.r, h.r) * 0.7), 0xffa040);
      if (h.t <= 0) { scene.remove(h.m); h.m.material.dispose(); HAZ.splice(i, 1); }
    }
  }
}
function clearHazards() { for (const h of HAZ) { scene.remove(h.m); h.m.material.dispose(); } HAZ.length = 0; S.pig = null; }
