'use strict';
/* ============================================================
   MK III CINEMATIC REVEAL (chunk 15)
   The first time each weapon TYPE reaches L5 (a merge, an orb, an auto-upgrade: anything that goes through
   upgradeItem) a skippable ~9 s reveal plays. Later L5 upgrades of the same type play a ~1.5 s version.
     0-1.5   isolated weapon on a platform, dim, slow zoom, drone + ticking, APEX CONFIGURATION DETECTED
     1.5-3.5 rising music, golden seams and rays, the parts fly apart and lock back together, sparks
     3.5-5   final lock: gold flash, rays, impact, "MK III - APEX" + the weapon's name
     5-7.5   cut to your actual robot (frame, colours, attachments), weapon raised toward the camera, ~1 s demo
     7.5-9   hero shot, rays, resolution chord, real L5 stats, MAXIMUM UPGRADE ACHIEVED
   It runs in its OWN scene (S.mode = 'cine'), so gameplay and the stage clock stand still (simStep never runs) and
   nothing it shows is real: demo shots are cosmetic meshes/particles, no ammo, cooldowns, damage, XP or bolts.
   Skip: any key, click, tap or controller button. Settings: SETTINGS.cine = 'full' | 'short' | 'off'; the OS
   reduced-motion flag plays the short version without flashes or shake. Seen types are saved in META.mk3Seen.
   Music: soft synthesised pads (no harsh beeps). To use a real track set CINE_MUSIC_URL to a file path/URL.
   ============================================================ */
const CINE = { on: false, q: [], delay: 0, t: 0, dur: 9, manual: false, prevMode: 'play', full: true, endT: -1, ready: false };
const CINE_MUSIC_URL = null;                    // asset hook: e.g. 'assets/mk3_reveal.ogg'; null = the built-in synth bed
const CINE_REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
if (!META.mk3Seen) META.mk3Seen = {};
if (!SETTINGS.cine) SETTINGS.cine = 'full';
const CINE_GOLD = 0xffc24a;                            // legendary gold
const CINE_T = { explode: [1.5, 2.0], lock: [2.1, 3.4], impact: 3.5, robot: 5.0, raise: [5.2, 5.95], demo: 6.0, hero: 7.5 };
const CINE_TS = { explode: [0, 0.05], lock: [0.08, 0.42], impact: 0.45 };      // the short version

/* ---------- queue: hooked to WMOD.hooks.mk3 (weaponmodels.js) ---------- */
function cineQueue(it, replay) {
  if (!replay && SETTINGS.cine === 'off') return;
  if (CINE.q.some(e => e.item === it)) return;
  CINE.q.push({ item: it, type: it.type, first: !META.mk3Seen[it.type], replay: !!replay }); CINE.delay = 0.45;
}
WMOD.hooks.mk3.push(it => cineQueue(it, false));
function cineBusy() { const d = document.getElementById('slotDialog'); return !!(INV && INV.drag) || !!(d && d.classList.contains('on')); }
function cineTick(dt) {                                  // called every frame from game.js; true = the cinematic owns this frame
  if (CINE.on) { if (!CINE.manual) cineFrame(dt); return true; }
  if (!CINE.q.length) return false;
  if (!['play', 'inv', 'hangar'].includes(S.mode) || cineBusy()) { CINE.delay = Math.max(CINE.delay, 0.2); return false; }
  CINE.delay -= dt; if (CINE.delay > 0) return false;
  cineStart(CINE.q.shift());
  return CINE.on;
}

/* ---------- small helpers ---------- */
const _cnP = new THREE.Vector3(), _cnD = new THREE.Vector3(), _cnQ = new THREE.Quaternion();
const cease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3), csm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
let CINE_GLOW = null;
function cineGlowTex() {
  if (CINE_GLOW) return CINE_GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.65)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); CINE_GLOW = new THREE.CanvasTexture(c); return CINE_GLOW;
}
/* a small additive particle system: one draw call */
class CinePS {
  constructor(n, size) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.base = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.g = new Float32Array(n);
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size, map: cineGlowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.pts = new THREE.Points(this.geo, this.mat); this.pts.frustumCulled = false;
    for (let k = 0; k < n; k++) this.pos[k * 3 + 1] = -999;
  }
  spawn(p, v, life, hex, grav = 0) {
    const k = this.i = (this.i + 1) % this.n, c = new THREE.Color(hex);
    this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z; this.vel[k * 3] = v.x; this.vel[k * 3 + 1] = v.y; this.vel[k * 3 + 2] = v.z;
    this.base[k * 3] = c.r; this.base[k * 3 + 1] = c.g; this.base[k * 3 + 2] = c.b; this.life[k] = this.max[k] = life; this.g[k] = grav;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

/* ---------- audio: soft synth bed (or CINE_MUSIC_URL) ---------- */
function cineAudio(full) {
  const A = CINE.aud = { nodes: [], el: null, out: null };
  if (!actx || SETTINGS.music <= 0 && false) return;
  try {
    const c = actx, t0 = c.currentTime + 0.06, out = A.out = c.createGain(); out.gain.value = 0.55 * Math.max(0.35, SETTINGS.music); out.connect(c.destination);
    const reg = n => { A.nodes.push(n); return n; };
    const env = (g, pts) => { g.gain.setValueAtTime(pts[0][1], t0 + pts[0][0]); for (let i = 1; i < pts.length; i++) g.gain.linearRampToValueAtTime(pts[i][1], t0 + pts[i][0]); };
    const tone = (type, f0, f1, at, dur, g, lp, dest) => {
      const o = reg(c.createOscillator()), e = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0 + at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
      e.gain.setValueAtTime(0.0001, t0 + at); e.gain.linearRampToValueAtTime(g, t0 + at + Math.min(0.03, dur * 0.2)); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      let d = e; if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; e.connect(f); d = f; }
      o.connect(e); d.connect(dest || out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); return o;
    };
    const noise = (at, dur, g, type, f) => {
      if (typeof sfxNoiseBuf !== 'function') return;
      const s = reg(c.createBufferSource()), fl = c.createBiquadFilter(), e = c.createGain(); s.buffer = sfxNoiseBuf(dur); fl.type = type; fl.frequency.value = f;
      e.gain.setValueAtTime(g, t0 + at); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); s.connect(fl); fl.connect(e); e.connect(out); s.start(t0 + at);
    };
    const chord = (at, dur, notes, g, type) => notes.forEach((f, i) => { tone(type || 'triangle', f, f, at + i * 0.015, dur, g, 2400); tone('sine', f / 2, f / 2, at, dur, g * 0.6); });
    const kick = (at, g) => { tone('sine', 130, 46, at, 0.2, g); noise(at, 0.04, g * 0.25, 'lowpass', 900); };
    const bell = (at, f, g) => { tone('sine', f, f, at, 1.8, g); tone('sine', f * 2.01, f * 2.01, at, 1.0, g * 0.35); };
    const pad = (at, dur, notes, g) => notes.forEach(f => { for (const dc of [-6, 6]) { const o = reg(c.createOscillator()), e = c.createGain(), lp = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dc; lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
      e.gain.setValueAtTime(0.0001, t0 + at); e.gain.linearRampToValueAtTime(g, t0 + at + dur * 0.3); e.gain.linearRampToValueAtTime(0.0001, t0 + at + dur); o.connect(lp); lp.connect(e); e.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); } });
    if (!full) {                                         // the short sting
      tone('sawtooth', 110, 330, 0, 0.42, 0.05, 1200); kick(0.38, 0.4);
      tone('sine', 62, 30, 0.45, 0.7, 0.5); noise(0.45, 0.35, 0.18, 'lowpass', 1400);
      chord(0.45, 1.3, [261.6, 329.6, 392, 523.3], 0.05); bell(0.5, 1046.5, 0.05); return;
    }
    if (CINE_MUSIC_URL) { try { const a = A.el = new Audio(CINE_MUSIC_URL); a.volume = clamp(SETTINGS.music, 0.15, 1); a.play().catch(() => { A.el = null; }); } catch (e) { A.el = null; } }
    if (!A.el) {
      // drone: two soft low tones that swell in, hold, and settle under the robot scene
      for (const [type, f, g] of [['sine', 55, 0.22], ['triangle', 82.4, 0.12]]) { const o = reg(c.createOscillator()), e = c.createGain(), lp = c.createBiquadFilter(); o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 260;
        env(e, [[0, 0.0001], [1.2, g], [3.4, g * 1.1], [3.6, g * 0.5], [7.4, g * 0.45], [9.2, 0.0001]]); o.connect(e); e.connect(lp); lp.connect(out); o.start(t0); o.stop(t0 + 9.3); }
      // 0-1.5: soft ticking, speeding up
      [0.2, 0.55, 0.85, 1.1, 1.3, 1.45].forEach(at => tone('sine', 1500, 1100, at, 0.05, 0.05, 3000));
      // 1.5-3.5: a rising saw pad with percussion
      for (const dc of [-8, 0, 8]) { const o = reg(c.createOscillator()), e = c.createGain(), lp = c.createBiquadFilter(); o.type = 'sawtooth'; o.detune.value = dc; o.frequency.setValueAtTime(110, t0 + 1.5); o.frequency.exponentialRampToValueAtTime(330, t0 + 3.4); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0 + 1.5); lp.frequency.exponentialRampToValueAtTime(4200, t0 + 3.45);
        env(e, [[1.5, 0.0001], [3.4, 0.06], [3.5, 0.0001]]); o.connect(lp); lp.connect(e); e.connect(out); o.start(t0 + 1.5); o.stop(t0 + 3.6); }
      [1.5, 1.75, 2.0, 2.2, 2.4, 2.55, 2.7, 2.82, 2.94, 3.05, 3.15, 3.24, 3.32, 3.4].forEach((at, i) => { kick(at, 0.18 + 0.01 * i); if (i > 4) noise(at + 0.05, 0.04, 0.05, 'highpass', 6000); });
      // 3.5: the impact
      tone('sine', 70, 28, 3.5, 1.1, 0.6); noise(3.5, 0.6, 0.25, 'lowpass', 1500); chord(3.5, 3.2, [130.8, 196, 261.6, 329.6, 392, 523.3], 0.05); bell(3.55, 1568, 0.045);
      // 5-7.5: a steady pulse with a gentle arpeggio under the robot
      [5, 5.5, 6, 6.5, 7].forEach((at, i) => { kick(at, 0.22); tone('sine', 65.4, 65.4, at, 0.45, 0.2); });
      [261.6, 329.6, 392, 523.3, 392, 329.6, 261.6, 329.6, 392, 523.3].forEach((f, i) => tone('sine', f, f, 5.1 + i * 0.25, 0.3, 0.05, 3000));
      // 7.5: resolution
      pad(7.4, 1.9, [261.6, 329.6, 392, 493.9], 0.012); chord(7.5, 2.2, [261.6, 329.6, 392, 493.9, 784], 0.04, 'sine'); bell(7.5, 1046.5, 0.06); bell(7.8, 1318.5, 0.035);
    }
  } catch (e) { console.warn('cine audio', e); }
}
function cineAudioStop(fast) {
  const A = CINE.aud; if (!A) return;
  try { if (A.out && actx) { A.out.gain.cancelScheduledValues(actx.currentTime); A.out.gain.setTargetAtTime(0, actx.currentTime, fast ? 0.05 : 0.15); } } catch (e) {}
  const nodes = A.nodes, out = A.out, el = A.el; CINE.aud = null;
  setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} } try { out && out.disconnect(); } catch (e) {} if (el) { try { el.pause(); } catch (e) {} } }, fast ? 160 : 500);
}

/* ---------- start ---------- */
function cineStart(entry) {
  const it = entry.item, W = itemDef(it); if (!W) return;
  CINE.entry = entry; CINE.prevMode = S.mode; S.mode = 'cine'; unlockPointer();
  CINE.full = (entry.first || entry.replay) && SETTINGS.cine === 'full' && !CINE_REDUCED;
  CINE.soft = CINE_REDUCED;                        // no flashes / shake
  if (!entry.replay) { META.mk3Seen[entry.type] = true; saveMeta(); }
  CINE.t = 0; CINE.dur = CINE.full ? 9.0 : 1.5; CINE.endT = -1; CINE.fired = new Set(); CINE.disp = []; CINE.streaks = []; CINE.flashes = []; CINE.locked = 0; CINE.robotBuilt = false; CINE.clicks = 0;
  const sc = CINE.scene = new THREE.Scene(); sc.background = new THREE.Color(0x04060a); sc.fog = new THREE.Fog(0x04060a, 14, 44);
  CINE.hemi = new THREE.HemisphereLight(0x9fb4c8, 0x1a1410, 0.3); sc.add(CINE.hemi);
  CINE.key = new THREE.DirectionalLight(0xfff0d8, 0.35); CINE.key.position.set(3, 6, 4); sc.add(CINE.key);
  CINE.rim = new THREE.DirectionalLight(0xffc24a, 0); CINE.rim.position.set(-4, 3, -3); sc.add(CINE.rim);
  CINE.gold = new THREE.PointLight(CINE_GOLD, 0, 16, 2); CINE.gold.position.set(0, 2, 1.5); sc.add(CINE.gold);
  CINE.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  const own = o => { CINE.disp.push(o); return o; };
  // the platform
  const pf = new THREE.Group();
  pf.add(new THREE.Mesh(own(new THREE.CylinderGeometry(2.6, 2.8, 0.3, 40)), own(new THREE.MeshStandardMaterial({ color: 0x2a313a, roughness: 0.6, metalness: 0.6 }))));
  const ringM = own(new THREE.MeshBasicMaterial({ color: CINE_GOLD })); CINE.ringM = ringM;
  for (const r of [2.35, 1.7]) { const tr = new THREE.Mesh(own(new THREE.TorusGeometry(r, 0.035, 6, 56)), ringM); tr.rotation.x = Math.PI / 2; tr.position.y = 0.16; pf.add(tr); }
  pf.position.y = -0.15; sc.add(pf); CINE.platform = pf;
  // the weapon, alone: its materials are cloned so the golden glow never touches the shared ones
  const wg = buildPart(it, new THREE.Vector3(0, 0, 1), null); CINE.mats = [];
  wg.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.emissive) { const m = o.material.clone(); m.userData.e0 = m.emissive.clone(); o.material = m; CINE.mats.push(m); own(m); } });
  wg.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(wg), cen = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), mx = Math.max(sz.x, sz.y, sz.z, 0.1);
  CINE.wscale = clamp(2.0 / mx, 0.9, 3.2); CINE.wmax = mx;
  CINE.parts = [];
  wg.children.forEach((ch, i) => {
    if (!ch.isMesh && !ch.children.length) return;
    const b = new THREE.Box3().setFromObject(ch), c = b.getCenter(new THREE.Vector3()).sub(cen), dir = c.lengthSq() > 1e-4 ? c.normalize() : new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    dir.x += (Math.random() - 0.5) * 0.5; dir.y += (Math.random() - 0.5) * 0.5; dir.z += (Math.random() - 0.5) * 0.5; dir.normalize();
    CINE.parts.push({ o: ch, p: ch.position.clone(), q: ch.quaternion.clone(), s: ch.scale.clone(), dir, amt: mx * (0.55 + Math.random() * 0.5), ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), ang: (Math.random() - 0.5) * 2.4, k: Math.random(), done: false });
  });
  CINE.parts.forEach((p, i) => { p.lockT = i / Math.max(1, CINE.parts.length - 1); });
  wg.position.copy(cen).multiplyScalar(-1);
  const holder = CINE.holder = new THREE.Group(); holder.add(wg); holder.scale.setScalar(CINE.wscale); holder.position.y = 1.55; sc.add(holder); CINE.wg = wg; CINE.cen = cen;
  // rays: a fan of thin additive triangles that always faces the camera (one draw call)
  const N = 16, pos = [], col = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, w = 0.07 + (i % 3) * 0.03, R = 9; pos.push(0, 0, 0, Math.cos(a - w) * R, Math.sin(a - w) * R, 0, Math.cos(a + w) * R, Math.sin(a + w) * R, 0); col.push(1, 0.78, 0.3, 0, 0, 0, 0, 0, 0); }
  const rg = own(new THREE.BufferGeometry()); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  CINE.rayM = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  CINE.rays = new THREE.Mesh(rg, CINE.rayM); CINE.rays.frustumCulled = false; sc.add(CINE.rays);
  CINE.glowM = own(new THREE.SpriteMaterial({ map: cineGlowTex(), color: CINE_GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  CINE.glow = new THREE.Sprite(CINE.glowM); sc.add(CINE.glow);
  CINE.sparks = own(new CinePS(220, 0.11)); sc.add(CINE.sparks.pts);
  CINE.fire = own(new CinePS(160, 0.38)); sc.add(CINE.fire.pts);
  // DOM
  const el = CINE.el = document.getElementById('cine'); el.hidden = false; document.body.classList.add('cine');
  const q = s => el.querySelector(s);
  q('.cApex b').textContent = 'MK III — APEX'; q('.cApex em').textContent = (W.name || it.type).toUpperCase();
  q('.cTitle').textContent = 'APEX CONFIGURATION DETECTED';
  const rows = (partInfo(it) || []).filter(r => r[0] !== 'Weight').slice(0, 5);
  q('.cHero h3').textContent = (W.name || it.type).toUpperCase() + ' · MK III';
  q('.cRows').innerHTML = rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  q('.cSkip').style.opacity = 0; q('.cDip').style.opacity = 1; q('.cFlash').style.opacity = 0;
  CINE.el_ = { title: q('.cTitle'), apex: q('.cApex'), hero: q('.cHero'), flash: q('.cFlash'), dip: q('.cDip'), skip: q('.cSkip'), bars: el.querySelectorAll('.cBar') };
  CINE.born = performance.now();
  if (CINE.full) cineBuildRobot(it);
  cineAudio(CINE.full);
  cineResize(); CINE.on = true; CINE.ready = true;
  cineFrame(0.0001);
}
function cineResize() { const c = CINE.cam; if (c) { const w = innerWidth || 1280, h = innerHeight || 720; c.aspect = w / h; c.fov = w / h < 1.2 ? 52 : 36; c.updateProjectionMatrix(); } }
addEventListener('resize', cineResize);

/* ---------- the real, current robot (built now, shown from 5 s) ---------- */
function cineBuildRobot(it) {
  const sb = [BUILD_ROOT, ROOT_BARE, BODY_IDX];
  let rb = null; try { rb = buildRobot(L, { stand: true }); } catch (e) { console.warn('cine robot', e); }
  BUILD_ROOT = sb[0]; ROOT_BARE = sb[1]; BODY_IDX = sb[2];
  if (!rb) { CINE.robot = null; return; }
  rb.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(rb), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  rb.position.set(-c.x, -b.min.y, -c.z); rb.visible = false; CINE.scene.add(rb); rb.updateMatrixWorld(true);
  CINE.robot = rb; CINE.H = Math.max(s.y, 1.2); CINE.R = Math.max(s.x, s.y, s.z, 2);
  const ud = rb.userData; let part = ud.partOf && ud.partOf.get(it); CINE.float = null;
  CINE.arm = null; CINE.armSide = 1;
  if (part) {
    const arm = (ud.partOf ? [...ud.partOf.keys()] : []).find(k => k.kind === 'arm' && typeof armGuns === 'function' && armGuns(k).includes(it));
    if (arm) { const ag = ud.partOf.get(arm); CINE.arm = ag; CINE.armRest = ag.quaternion.clone(); CINE.armSide = ag.getWorldPosition(new THREE.Vector3()).x >= 0 ? 1 : -1; }
  } else {
    // the upgraded weapon isn't mounted (it sits in storage): it hovers beside the robot instead
    part = buildPart(it, new THREE.Vector3(0, 0, 1), null); const fl = new THREE.Group(); fl.add(part); fl.position.set(0.7 * CINE.R * 0.5, CINE.H * 0.55, CINE.R * 0.25); fl.visible = false; CINE.scene.add(fl); CINE.float = fl; CINE.armSide = 1; fl.updateMatrixWorld(true);
  }
  CINE.wpart = part; CINE.muz = (part && part.userData.muzzle) || part; CINE.D = { fired: new Set(), acc: 0, k: 0, kick: 0, sw: 0 };
}

/* ---------- camera ---------- */
function cineCamera(t) {
  const c = CINE.cam, F = CINE.full, ti = CINE.full ? t : t / 1.5 * 9 * 0 + t;
  if (!F || t < CINE_T.robot) {
    const T = F ? t : t * 2.2, zoom = F ? csm(0, 3.6, T) : csm(0, 1.5, t), d = 8.4 - 2.8 * zoom + (F && T > 3.5 ? 0.6 * csm(3.5, 5, T) : 0);
    const yaw = 0.35 + 0.25 * Math.sin(T * 0.35), y = 2.0 - 0.3 * zoom;
    c.position.set(Math.sin(yaw) * d, y, Math.cos(yaw) * d); c.lookAt(0, 1.45, 0);
    if (!CINE.soft && F && t > CINE_T.impact && t < CINE_T.impact + 0.5) { const k = (1 - (t - CINE_T.impact) / 0.5) * 0.08; c.position.x += (Math.random() - 0.5) * k; c.position.y += (Math.random() - 0.5) * k; }
  } else {
    const R = CINE.R || 3, H = CINE.H || 3, sx = CINE.armSide, tg = new THREE.Vector3(0, H * 0.52, 0);
    const k = csm(CINE_T.robot, CINE_T.hero, t), h = csm(CINE_T.hero, 9.0, t);
    c.fov = (innerWidth / innerHeight < 1.2 ? 52 : 36) - 4 * h;
    const px = sx * (1.25 - 0.25 * k - 0.15 * h) * R, py = (0.2 + 0.03 * k + 0.08 * h) * R, pz = (2.25 - 0.3 * k - 0.1 * h) * R;
    c.position.set(px, py, pz); c.lookAt(tg.x, tg.y + 0.0, tg.z); c.updateProjectionMatrix();
  }
}

/* ---------- the weapon assembling ---------- */
function cineAssemble(t) {
  const F = CINE.full, E = F ? CINE_T : CINE_TS;
  const apartK = F ? (t < E.explode[0] ? 0 : cease((t - E.explode[0]) / (E.explode[1] - E.explode[0]))) : 1;
  for (const p of CINE.parts) {
    const lt0 = E.lock[0] + (E.lock[1] - E.lock[0] - 0.35 * (F ? 1 : 0.3)) * p.lockT, lw = F ? 0.35 : 0.14;
    const u = clamp((t - lt0) / lw, 0, 1), amt = apartK * (1 - u * u * (3 - 2 * u));
    const wob = amt > 0.02 && u < 1 ? Math.sin(t * 7 + p.k * 6) * 0.04 : 0;
    p.o.position.copy(p.p).addScaledVector(p.dir, p.amt * amt + wob * p.amt);
    _cnQ.setFromAxisAngle(p.ax, p.ang * amt); p.o.quaternion.copy(p.q).premultiply(_cnQ);
    p.o.scale.copy(p.s).multiplyScalar(1 - 0.2 * amt);
    if (u >= 1 && !p.done) {
      p.done = true; CINE.locked++;
      p.o.updateWorldMatrix(true, false); p.o.getWorldPosition(_cnP);
      for (let i = 0; i < 4; i++) CINE.sparks.spawn(_cnP, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 3), 0.5 + Math.random() * 0.4, i % 2 ? 0xffd27a : 0xffffff, 6);
      if (F && CINE.clicks < 10 && CINE.clicks++ % 2 === 0 && actx && CINE.aud) { try { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = 1800 + Math.random() * 600; g.gain.setValueAtTime(0.05 * Math.max(0.35, SETTINGS.music), actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.06); o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.08); } catch (e) {} }
    }
  }
  // the golden glow in the seams
  const glow = F ? csm(1.5, 3.45, t) * (t < E.impact ? 1 : 0) + (t >= E.impact ? 0.9 * (1 - csm(E.impact, E.impact + 1.6, t)) + 0.1 : 0) : (t < E.impact ? 0.6 : 0.8 * (1 - csm(E.impact, 1.4, t)) + 0.1);
  for (const m of CINE.mats) { m.emissive.copy(m.userData.e0).lerp(_cnGold.set(0xffb030), clamp(glow * 0.5, 0, 0.55)); }
}
const _cnGold = new THREE.Color();

/* ---------- demo shots on the robot (cosmetic only) ---------- */
function cineFlash(p, hex, s, life) { const m = new THREE.SpriteMaterial({ map: cineGlowTex(), color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }), sp = new THREE.Sprite(m); sp.position.copy(p); sp.scale.setScalar(s); CINE.scene.add(sp); CINE.flashes.push({ sp, m, life, max: life, s }); }
function cineStreak(p, d, len, speed, hex, thick, life) {
  const mk = CINE.streakMats || (CINE.streakMats = {}); let m = mk[hex]; if (!m) { m = mk[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }); CINE.disp.push(m); }
  const mesh = new THREE.Mesh(geoBox, m); mesh.scale.set(thick, thick, len); mesh.position.copy(p); mesh.lookAt(p.clone().add(d)); CINE.scene.add(mesh);
  CINE.streaks.push({ mesh, v: d.clone().multiplyScalar(speed), life, max: life });
}
function cineMuz() { const m = CINE.muz; if (!m) return null; m.updateWorldMatrix(true, false); m.getWorldPosition(_cnP); m.getWorldQuaternion(_cnQ); _cnD.set(0, 0, 1).applyQuaternion(_cnQ); return { p: _cnP.clone(), d: _cnD.clone() }; }
function cineKick(v) { CINE.D.kick = Math.max(CINE.D.kick, v); }
function cineSnd(kind, v) { try { if (kind) sfx(kind, v || 0.7); } catch (e) {} }
const cRange = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-6; x += s) r.push(+x.toFixed(3)); return r; };
function cineShot(len, speed, hex, thick, spread, life) { const m = cineMuz(); if (!m) return; const d = m.d.clone(); d.x += (Math.random() - 0.5) * spread; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread; d.normalize(); cineStreak(m.p, d, len, speed, hex, thick, life || 0.35); cineFlash(m.p, 0xffe2a0, 0.55 + thick * 6, 0.07); }
function cineMissile(m, v, delay, target) {
  const mesh = new THREE.Group(); mesh.add(bx(0.09, 0.09, 0.28, 0xe2465c, 0, 0, 0, 0xff3a28)); mesh.position.copy(m.p); CINE.scene.add(mesh);
  CINE.streaks.push({ mesh, rocket: true, v: v.clone(), life: 1.5, max: 1.5, target, delay, t: 0, home: 0 });
}
const CDEMO = {
  pistol: { times: [0, 0.3, 0.6, 0.9], fire() { cineShot(0.9, 38, 0xffe9b0, 0.05, 0.02); cineKick(0.55); cineSnd('pistol', 0.6); } },
  autogun: { times: cRange(0, 0.95, 0.075), fire() { cineShot(0.7, 40, 0xffe0a0, 0.045, 0.05); cineKick(0.22); cineSnd('autogun', 0.5); } },
  shotgun: { times: [0.1], fire() { for (let i = 0; i < 9; i++) cineShot(0.5, 34, 0xffd890, 0.05, 0.3); cineKick(1.1); cineSnd('shotgun', 0.8); const m = cineMuz(); if (m) cineFlash(m.p, 0xffc070, 1.1, 0.1); } },
  sniper: { times: [0.15], fire() { const m = cineMuz(); if (!m) return; cineStreak(m.p, m.d, 7, 90, 0xffffff, 0.07, 0.4); cineStreak(m.p, m.d, 5, 90, 0x9fe6ff, 0.16, 0.3); cineFlash(m.p, 0xffffff, 1.5, 0.14); cineKick(1.3); cineSnd('sniper', 0.9); } },
  rocket: { times: [0.15], fire() { const m = cineMuz(); if (!m) return; cineMissile(m, m.d.clone().multiplyScalar(16), 0, null); cineFlash(m.p, 0xffa040, 1.3, 0.14); for (let i = 0; i < 14; i++) CINE.fire.spawn(m.p, m.d.clone().multiplyScalar(-2).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)), 0.7, 0x887766); cineKick(1.4); cineSnd('rocket', 0.8); } },
  lightning: { times: [0.1], cont: true, fire() { cineSnd('zap', 0.7); }, tick(dt, u) { if (u < 0.1 || u > 1.15) return; CINE.D.acc += dt; if (CINE.D.acc < 0.05) return; CINE.D.acc = 0; const m = cineMuz(); if (!m) return; cineArc(m); cineKick(0.15); } },
  flamer: { cont: true, times: [0.05], fire() { cineSnd('flame', 0.7); }, tick(dt, u) { if (u < 0.05 || u > 1.2) return; const m = cineMuz(); if (!m) return; for (let i = 0; i < 3; i++) { const v = m.d.clone().multiplyScalar(5 + Math.random() * 3); v.x += (Math.random() - 0.5) * 1.3; v.y += (Math.random() - 0.5) * 1.3 + 0.4; v.z += (Math.random() - 0.5) * 1.3; CINE.fire.spawn(m.p, v, 0.55 + Math.random() * 0.3, i % 2 ? 0xff7a1a : 0xffc040, -1.2); } if (Math.random() < 0.3) cineSnd('flame', 0.4); } },
  gatling: { times: cRange(0.3, 1.3, 0.055), spin: true, fire() { cineShot(0.55, 42, 0xffe0a0, 0.04, 0.06); cineKick(0.12); cineSnd('autogun', 0.4); } },
  katana: { melee: [[0.1, 0.4, -1], [0.62, 0.92, 1]] },
  knife: { melee: [[0.05, 0.25, -1], [0.35, 0.55, 1], [0.65, 0.85, -1], [0.95, 1.15, 1]] },
  chainsaw: { cont: true, saw: true, times: [0.05], fire() { cineSnd('saw', 0.6); }, tick(dt, u) { if (u < 0.05 || u > 1.25) return; const m = cineMuz(); if (!m) return; for (let i = 0; i < 2; i++) CINE.sparks.spawn(m.p, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.2) * 4), 0.4, 0xffd27a, 9); } },
  gravity: { times: [0.2, 0.8], fire() { const m = cineMuz(); if (!m) return; cineRing(m.p, m.d, 0xa070ff, 0.2, 3.2, 0.55); cineFlash(m.p, 0xb890ff, 1.4, 0.2); cineKick(0.7); cineSnd('zap', 0.7); } },
  field: { times: [0.2, 0.8], fire() { const r = CINE.robot, H = CINE.H || 3; cineShell(new THREE.Vector3(0, H * 0.5, 0), 0x6fe8ff, H * 0.5, H * 1.5, 0.7); cineSnd('shield', 0.5); } },
  pods: { times: [0.1, 0.18, 0.26, 0.34, 0.42, 0.5], fire(i) { const m = cineMuz(); if (!m) return; const R = CINE.R || 3, tgt = new THREE.Vector3(CINE.armSide * R * 0.25 + (Math.random() - 0.5) * R * 0.8, R * 0.1, R * (2.0 + Math.random()));
    cineMissile(m, new THREE.Vector3((Math.random() - 0.5) * 2.5, 9, (Math.random() - 0.3) * 2.5), 0, tgt); cineFlash(m.p, 0xffa040, 0.9, 0.1); cineSnd('launch', 0.35); } },
};
function cineArc(m) {
  const pts = [], tgt = m.p.clone().addScaledVector(m.d, 3.2 + Math.random() * 1.5); tgt.x += (Math.random() - 0.5) * 1.6; tgt.y += (Math.random() - 0.5) * 1.2;
  for (let i = 0; i <= 9; i++) { const k = i / 9, p = m.p.clone().lerp(tgt, k); if (i && i < 9) { p.x += (Math.random() - 0.5) * 0.45; p.y += (Math.random() - 0.5) * 0.45; p.z += (Math.random() - 0.5) * 0.3; } pts.push(p); }
  const g = new THREE.BufferGeometry().setFromPoints(pts), l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9feaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })); CINE.scene.add(l);
  CINE.flashes.push({ line: l, sp: l, m: l.material, g, life: 0.08, max: 0.08, s: 1 }); cineFlash(m.p, 0x58cfd6, 0.9, 0.06);
}
function cineRing(p, d, hex, r0, r1, life) { const g = new THREE.RingGeometry(0.9, 1.0, 40), m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), r = new THREE.Mesh(g, m); r.position.copy(p).addScaledVector(d, 0.6); r.lookAt(r.position.clone().add(d)); CINE.scene.add(r); CINE.flashes.push({ ring: r, sp: r, m, g, life, max: life, r0, r1, s: 1 }); }
function cineShell(p, hex, r0, r1, life) { const g = new THREE.SphereGeometry(1, 20, 14), m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), r = new THREE.Mesh(g, m); r.position.copy(p); CINE.scene.add(r); CINE.flashes.push({ ring: r, sp: r, m, g, life, max: life, r0, r1, s: 1, shell: true }); }
function cineSlash(side) {
  const m = cineMuz(); if (!m) return;
  const R = CINE.R || 3, g = new THREE.RingGeometry(R * 0.28, R * 0.34, 28, 1, 0, 2.3), mt = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), r = new THREE.Mesh(g, mt);
  r.position.copy(m.p).addScaledVector(m.d, -R * 0.1); r.lookAt(r.position.clone().add(new THREE.Vector3(side * 0.4, 1, 0.3).normalize())); r.rotateZ(side > 0 ? 0.3 : 2.6); CINE.scene.add(r);
  CINE.flashes.push({ ring: r, sp: r, m: mt, g, life: 0.22, max: 0.22, s: 1, slash: true }); cineSnd('slash', 0.7);
  for (let i = 0; i < 6; i++) CINE.sparks.spawn(m.p, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.4, 0xffffff, 6);
}
function cineDemo(dt, t) {
  const D = CINE.D, spec = CDEMO[CINE.entry.type]; if (!D || !spec || !CINE.muz) return;
  const u = t - CINE_T.demo; D.u = u;
  if (u >= 0) {
    (spec.times || []).forEach((tm, i) => { const key = 't' + i; if (u >= tm && !D.fired.has(key)) { D.fired.add(key); spec.fire && spec.fire.call(spec, i); } });
    (spec.melee || []).forEach((w, i) => { const key = 'm' + i; if (u >= w[0] && !D.fired.has(key)) { D.fired.add(key); cineSlash(w[2]); } });
    if (spec.tick) spec.tick(dt, u);
    const p = CINE.wpart;
    if (spec.spin && p) { D.k = Math.min(1, D.k + dt * 3); const sp = dt * 34 * D.k; if (p.userData.spinMesh) p.userData.spinMesh.rotation.y += sp; if (p.userData.spinMesh2) p.userData.spinMesh2.rotation.y -= sp; }
    if (spec.saw && p && p.userData.saw) { p.userData.saw.position.x = (Math.random() - 0.5) * 0.03; p.userData.saw.position.y = (Math.random() - 0.5) * 0.03; }
  }
  // melee: the arm swings across
  let sw = 0; if (spec.melee) for (const w of spec.melee) if (u >= w[0] && u <= w[1]) { const k = (u - w[0]) / (w[1] - w[0]); sw = w[2] * (-1 + 2 * k) * -0.95; }
  D.sw += (sw - D.sw) * Math.min(1, dt * 22);
  if (CINE.arm && u > -0.1) {
    const ag = CINE.arm; _cnQ.setFromEuler(new THREE.Euler(-D.kick * 0.45, D.sw, 0)); ag.quaternion.multiply(_cnQ);
  }
  D.kick = Math.max(0, D.kick - dt * 5);
}
function cineArmPose(t) {
  const ag = CINE.arm; if (!ag) return;
  const k = csm(CINE_T.raise[0], CINE_T.raise[1], t);
  ag.updateMatrixWorld(true);
  const ap = ag.getWorldPosition(new THREE.Vector3()), s = CINE.armSide, T = ap.clone().add(new THREE.Vector3(s * 0.45, 0.14, 1).normalize().multiplyScalar(6));
  ag.quaternion.copy(CINE.armRest); const rest = CINE.armRest.clone(); ag.lookAt(T.x, T.y, T.z); const tq = ag.quaternion.clone(); ag.quaternion.copy(rest).slerp(tq, k);
  if (CINE.float) return;
}

/* ---------- per frame ---------- */
function cineFrame(dt) {
  if (!CINE.on) return;
  const F = CINE.full, E = F ? CINE_T : CINE_TS;
  CINE.t += dt; let t = CINE.t; const els = CINE.el_;
  // any controller button skips
  if (!CINE.manual && gp && gp.btn && performance.now() - CINE.born > 400) { for (let i = 0; i < gp.btn.length; i++) if (gp.btn[i] && !(gp.prev && gp.prev[i])) { cineSkip(); break; } }
  const tt = Math.min(t, CINE.dur);
  // intro / outro dip
  let dip = 0; if (t < 0.35) dip = 1 - t / 0.35; if (CINE.endT >= 0) dip = clamp((t - CINE.endT) / 0.25, 0, 1); else if (t > CINE.dur - 0.3) dip = clamp((t - (CINE.dur - 0.3)) / 0.3, 0, 1);
  els.dip.style.opacity = dip;
  // phases of the weapon scene / robot scene
  const inRobot = F && tt >= CINE_T.robot;
  if (CINE.holder) CINE.holder.visible = !inRobot;
  CINE.platform.visible = true;
  if (CINE.robot) { CINE.robot.visible = inRobot; if (CINE.float) CINE.float.visible = inRobot; }
  if (!inRobot) {
    const h = CINE.holder; h.rotation.y = -1.25 + 0.35 * clamp(tt / 5, 0, 1) + tt * 0.07; h.position.y = 1.55 + Math.sin(tt * 1.6) * 0.04;
    cineAssemble(F ? tt : tt);
  }
  // lights
  const dark = F ? 0.28 + 0.72 * csm(1.5, 3.5, tt) : 0.7;
  CINE.hemi.intensity = (inRobot ? 1.1 : 0.25 + 0.5 * dark); CINE.key.intensity = inRobot ? 1.7 : 0.3 + 0.9 * dark; CINE.rim.intensity = inRobot ? 0.8 : 1.3 * csm(E.impact - 1, E.impact, tt);
  const flashK = Math.exp(-Math.max(0, tt - E.impact) * 3) * (tt >= E.impact ? 1 : 0);
  CINE.gold.intensity = (F ? 1.6 * csm(1.5, 3.4, tt) : 1.0) + 7 * flashK + (inRobot ? 0.8 : 0); CINE.gold.position.set(0, inRobot ? CINE.H * 0.8 : 2.4, 2);
  CINE.ringM.color.setHex(CINE_GOLD).multiplyScalar(0.35 + 0.65 * (F ? csm(1.0, 3.4, tt) : 1));
  // rays + glow
  const rayK = F ? (tt < 1.5 ? 0 : tt < E.impact ? 0.04 + 0.16 * csm(1.5, 3.4, tt) : tt < CINE_T.robot ? 0.5 * (0.4 + 0.6 * flashK) + 0.1 : tt < CINE_T.hero ? 0 : 0.3 * csm(CINE_T.hero, CINE_T.hero + 0.5, tt)) : (tt < E.impact ? 0.05 : 0.5 * (0.4 + 0.6 * flashK));
  CINE.rayM.opacity = rayK * (CINE.soft ? 0.6 : 1);
  CINE.rays.visible = rayK > 0.001;
  if (inRobot) { CINE.rays.position.set(0, CINE.H * 0.55, -CINE.R * 0.5); CINE.rays.scale.setScalar(CINE.R * 0.5); } else { CINE.rays.position.set(0, 1.55, -0.6); CINE.rays.scale.setScalar(1); }
  CINE.rays.quaternion.copy(CINE.cam.quaternion); CINE.rays.rotateZ(tt * 0.18);
  CINE.glow.position.set(0, inRobot ? CINE.H * 0.8 : 1.55, 0); CINE.glowM.opacity = clamp(0.18 * (F ? csm(1.4, 3.4, tt) : 1) + 0.9 * flashK, 0, 1) * (inRobot ? 0 : 1); CINE.glow.scale.setScalar(2.2 + 4 * flashK + 1.0 * csm(1.5, 3.4, tt));
  // the impact: sparks + gold flash
  if (tt >= E.impact && !CINE.fired.has('impact')) {
    CINE.fired.add('impact');
    for (let i = 0; i < 80; i++) { const a = Math.random() * 6.28, b = (Math.random() - 0.3) * 2, sp = 3 + Math.random() * 6; CINE.sparks.spawn(new THREE.Vector3(0, 1.55, 0), new THREE.Vector3(Math.cos(a) * sp, b * sp * 0.6, Math.sin(a) * sp), 0.8 + Math.random() * 0.8, Math.random() < 0.5 ? 0xffd27a : 0xffffff, 5); }
  }
  // robot phase: pose, demo
  if (inRobot) {
    if (!CINE.fired.has('robot')) { CINE.fired.add('robot'); }
    cineArmPose(tt);
    cineDemo(dt, tt);
    if (CINE.float) { CINE.float.position.y = CINE.H * 0.55 + Math.sin(tt * 2) * 0.05; CINE.float.lookAt(CINE.float.position.x * 0.5, CINE.float.position.y, 5); }
  }
  // streaks, flashes, particles
  for (let i = CINE.streaks.length - 1; i >= 0; i--) {
    const s = CINE.streaks[i]; s.life -= dt;
    if (s.rocket) {
      s.t += dt; if (s.target && s.t > 0.35) { const to = s.target.clone().sub(s.mesh.position).normalize().multiplyScalar(16); s.v.lerp(to, Math.min(1, dt * 5)); }
      s.mesh.position.addScaledVector(s.v, dt); if (s.v.lengthSq() > 0.01) s.mesh.lookAt(s.mesh.position.clone().add(s.v));
      CINE.fire.spawn(s.mesh.position, new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)), 0.45, 0xffa040, 0); CINE.sparks.spawn(s.mesh.position, new THREE.Vector3(0, 0.2, 0), 0.3, 0xffe2a0, 0);
      if (s.life <= 0 || (s.target && s.mesh.position.distanceTo(s.target) < 0.6)) { cineFlash(s.mesh.position, 0xffb050, 2.0, 0.18); for (let k = 0; k < 10; k++) CINE.fire.spawn(s.mesh.position, new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.2) * 5, (Math.random() - 0.5) * 6), 0.5, 0xff8a30, 1); CINE.scene.remove(s.mesh); s.mesh.traverse(o => { if (o.isMesh && o.material && o.material.dispose && !isShared(o.material)) {} }); CINE.streaks.splice(i, 1); }
    } else {
      s.mesh.position.addScaledVector(s.v, dt); s.mesh.material.opacity = Math.max(0, s.life / s.max);
      if (s.life <= 0) { CINE.scene.remove(s.mesh); CINE.streaks.splice(i, 1); }
    }
  }
  for (let i = CINE.flashes.length - 1; i >= 0; i--) {
    const f = CINE.flashes[i]; f.life -= dt; const k = Math.max(0, f.life / f.max);
    if (f.ring) { const sc = f.r0 + (f.r1 - f.r0) * (1 - k); f.ring.scale.setScalar(f.slash ? 1 + 0.2 * (1 - k) : sc); f.m.opacity = (f.shell ? 0.35 : 0.9) * k; }
    else if (f.line) f.m.opacity = k; else { f.m.opacity = k; f.sp.scale.setScalar(f.s * (1.4 - 0.4 * k)); }
    if (f.life <= 0) { CINE.scene.remove(f.sp); f.m.dispose(); if (f.g) f.g.dispose(); CINE.flashes.splice(i, 1); }
  }
  cinePSUpdate(CINE.sparks, dt); cinePSUpdate(CINE.fire, dt);
  // text + overlays
  cineText(tt, F);
  cineCamera(tt);
  renderFrame(CINE.scene, CINE.cam);
  if (CINE.endT < 0 && t >= CINE.dur) cineEnd();
  else if (CINE.endT >= 0 && t >= CINE.endT + 0.25) cineEnd();
}
function cinePSUpdate(ps, dt) {
  for (let k = 0; k < ps.n; k++) {
    if (ps.life[k] <= 0) { ps.pos[k * 3 + 1] = -999; continue; }
    ps.life[k] -= dt; ps.vel[k * 3 + 1] -= ps.g[k] * dt; const f = Math.max(0, ps.life[k] / ps.max[k]); ps.col[k * 3] = ps.base[k * 3] * f; ps.col[k * 3 + 1] = ps.base[k * 3 + 1] * f; ps.col[k * 3 + 2] = ps.base[k * 3 + 2] * f;
    ps.pos[k * 3] += ps.vel[k * 3] * dt; ps.pos[k * 3 + 1] += ps.vel[k * 3 + 1] * dt; ps.pos[k * 3 + 2] += ps.vel[k * 3 + 2] * dt;
  }
  ps.geo.attributes.position.needsUpdate = true; ps.geo.attributes.color.needsUpdate = true;
}
function cineText(t, F) {
  const E = CINE.el_, lim = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  const bar = CINE.soft ? 0 : 1; E.bars.forEach(b => { b.style.transform = `scaleY(${F ? lim(0, 0.5, t) * (t > CINE_T.hero ? 1 : 1) : 1})`; });
  E.title.style.opacity = F ? (t < 0.3 ? 0 : t < 1.4 ? (0.7 + 0.3 * Math.sin(t * 16)) : t < 1.9 ? 1 - lim(1.4, 1.9, t) : 0) : 0;
  const a0 = F ? CINE_T.impact : CINE_TS.impact, a1 = F ? 5.0 : 1.5;
  E.apex.style.opacity = t < a0 ? 0 : F ? (t < a1 - 0.35 ? lim(a0, a0 + 0.12, t) : 1 - lim(a1 - 0.35, a1, t)) : lim(a0, a0 + 0.1, t);
  E.apex.style.transform = `scale(${1 + 0.16 * (1 - lim(a0, a0 + 0.5, t))})`;
  E.hero.style.opacity = F ? lim(CINE_T.hero, CINE_T.hero + 0.35, t) : 0;
  E.hero.classList.toggle('on', F && t >= CINE_T.hero);
  const fl = CINE.soft ? 0.25 : 0.85; E.flash.style.opacity = t >= a0 ? clamp(Math.exp(-(t - a0) * 7) * fl, 0, 1) : 0;
  E.skip.style.opacity = t > 0.6 && CINE.endT < 0 ? 0.85 : 0;
}

/* ---------- skip / end ---------- */
function cineSkip() { if (!CINE.on || CINE.endT >= 0 || (!CINE.manual && performance.now() - CINE.born < 300)) return; CINE.endT = CINE.t; cineAudioStop(true); }
function cineEnd() {
  if (!CINE.on) return;
  CINE.on = false; cineAudioStop(false);
  document.body.classList.remove('cine'); const el = CINE.el; if (el) el.hidden = true;
  const sc = CINE.scene; if (sc) {
    CINE.streaks.forEach(s => sc.remove(s.mesh)); CINE.flashes.forEach(f => { sc.remove(f.sp); f.m && f.m.dispose && f.m.dispose(); f.g && f.g.dispose && f.g.dispose(); });
    sc.traverse(o => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });      // (a shared geometry just re-uploads the next time it is drawn)
    CINE.disp.forEach(d => { try { d.dispose(); } catch (e) {} });
    while (sc.children.length) sc.remove(sc.children[0]);
  }
  CINE.scene = null; CINE.robot = null; CINE.holder = null; CINE.wg = null; CINE.parts = []; CINE.mats = []; CINE.streaks = []; CINE.flashes = []; CINE.arm = null; CINE.float = null; CINE.muz = null; CINE.wpart = null; CINE.disp = [];
  S.mode = CINE.prevMode;
  if (S.mode === 'play') lockPointer();
  CINE.cooldown = 0.2;
}
/* skip input (capture phase, so Esc and friends don't also open the pause menu) */
addEventListener('keydown', e => { if (!CINE.on) return; if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) cineSkip(); }, true);
for (const ev of ['mousedown', 'pointerdown', 'touchstart', 'wheel']) addEventListener(ev, e => { if (!CINE.on) return; e.preventDefault && e.preventDefault(); e.stopImmediatePropagation(); if (ev !== 'wheel') cineSkip(); }, { capture: true, passive: false });
addEventListener('contextmenu', e => { if (CINE.on) e.preventDefault(); }, true);

/* ---------- replay from the parts list (L5 weapons and pods in storage) ---------- */
function cineReplay(it) { if (!it || (it.lvl || 1) < 5 || SETTINGS.cine === 'off' && false) return; if (!['play', 'inv', 'hangar'].includes(S.mode)) return; cineQueue(it, true); CINE.delay = 0.05; }
for (const ev of ['pointerdown', 'mousedown']) document.addEventListener(ev, e => { const b = e.target && e.target.closest && e.target.closest('.tagS.replay'); if (b) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
document.addEventListener('click', e => {
  const b = e.target && e.target.closest && e.target.closest('.tagS.replay'); if (!b) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const row = b.closest('.prow'); const it = row && typeof tipItemFromRow === 'function' ? tipItemFromRow(row) : null; if (it) cineReplay(it);
}, true);
