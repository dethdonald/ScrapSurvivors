'use strict';
/* ============================================================
   DYNAMIC MUSIC: a generative ambient score built live with WebAudio (no audio files).
   Calm, slow pads by default. As more enemies close in the score builds: a plucked arpeggio,
   then a bass line, ticking hats, a kick and finally a snare, and the tempo creeps up.
   When your health runs low a heartbeat and a dissonant high drone creep in over the top.
   intensity I (0..1): how many enemies are around you (plus bosses, hordes and the drop)
   danger    D (0..1): how hurt you are
   ============================================================ */
const MUSIC = {
  ready: false, step: 0, nextT: 0, bpm: 84, I: 0, D: 0, targetI: 0, targetD: 0, chord: 0, vol: 1,
  out: null, comp: null, verb: null, delay: null, bus: {}, padVoices: [],
};
if (typeof SETTINGS.music !== 'number') SETTINGS.music = 0.6;

/* A minor-ish, slowly turning progression: Am9 · Fmaj9 · Cmaj9 · Em9 (two bars each) */
const PROG = [
  { root: 45, tones: [0, 7, 10, 14, 15] },
  { root: 41, tones: [0, 7, 11, 14, 16] },
  { root: 48, tones: [0, 7, 11, 14, 16] },
  { root: 40, tones: [0, 7, 10, 14, 15] },
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function musicInit() {
  if (MUSIC.ready || !actx) return;
  const A = actx;
  MUSIC.out = A.createGain(); MUSIC.out.gain.value = 0;
  MUSIC.comp = A.createDynamicsCompressor(); MUSIC.comp.threshold.value = -18; MUSIC.comp.ratio.value = 3;
  MUSIC.out.connect(MUSIC.comp); MUSIC.comp.connect(A.destination);
  // a long, soft reverb (generated impulse) and a dotted-eighth echo
  MUSIC.verb = A.createConvolver();
  const len = A.sampleRate * 3.2, ir = A.createBuffer(2, len, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  MUSIC.verb.buffer = ir;
  const verbGain = A.createGain(); verbGain.gain.value = 0.55; MUSIC.verb.connect(verbGain); verbGain.connect(MUSIC.out);
  MUSIC.delay = A.createDelay(2); const fb = A.createGain(); fb.gain.value = 0.38; const dlp = A.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
  MUSIC.delay.connect(dlp); dlp.connect(fb); fb.connect(MUSIC.delay); dlp.connect(MUSIC.verb);
  const dGain = A.createGain(); dGain.gain.value = 0.35; dlp.connect(dGain); dGain.connect(MUSIC.out);
  // one bus per layer, each faded in and out by the intensity
  for (const name of ['pad', 'arp', 'bass', 'hat', 'kick', 'snare', 'heart', 'drone', 'fz']) {
    const g = A.createGain(); g.gain.value = name === 'pad' ? 1 : 0; g.connect(MUSIC.out);
    const send = A.createGain(); send.gain.value = { pad: 0.6, arp: 0.5, bass: 0.1, hat: 0.15, kick: 0.05, snare: 0.3, heart: 0.2, drone: 0.7, fz: 0.25 }[name];
    g.connect(send); send.connect(MUSIC.verb);
    MUSIC.bus[name] = g;
  }
  const arpEcho = A.createGain(); arpEcho.gain.value = 0.5; MUSIC.bus.arp.connect(arpEcho); arpEcho.connect(MUSIC.delay);
  // the tension drone: two high sines a tritone apart, slowly beating, with a wobbling filter
  const dr = A.createBiquadFilter(); dr.type = 'bandpass'; dr.frequency.value = 1400; dr.Q.value = 3; dr.connect(MUSIC.bus.drone);
  for (const f of [mtof(81), mtof(87) * 1.004, mtof(75)]) { const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = A.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(dr); o.start(); }
  const lfo = A.createOscillator(), lfoG = A.createGain(); lfo.frequency.value = 0.18; lfoG.gain.value = 500; lfo.connect(lfoG); lfoG.connect(dr.frequency); lfo.start();
  MUSIC.nextT = A.currentTime + 0.1; MUSIC.ready = true;
}

/* ---------- instruments ---------- */
function padChord(t, ch, dur) {
  const A = actx, cut = 500 + 1600 * MUSIC.I - 250 * MUSIC.D;
  for (const n of ch.tones) {
    const f = mtof(ch.root + 12 + n);
    const filt = A.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(cut * 0.6, t); filt.frequency.linearRampToValueAtTime(cut, t + dur * 0.5); filt.Q.value = 0.7;
    const env = A.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.045, t + 1.8); env.gain.setValueAtTime(0.045, t + dur - 0.2); env.gain.linearRampToValueAtTime(0, t + dur + 2.4);
    for (const [type, det] of [['sawtooth', -7], ['triangle', 6], ['sine', 0]]) {
      const o = A.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det + (Math.random() - 0.5) * 4;
      o.connect(filt); o.start(t); o.stop(t + dur + 2.6);
    }
    filt.connect(env); env.connect(MUSIC.bus.pad);
  }
  // a soft root an octave below
  const sub = A.createOscillator(), sg = A.createGain(); sub.type = 'sine'; sub.frequency.value = mtof(ch.root);
  sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.06, t + 2); sg.gain.linearRampToValueAtTime(0, t + dur + 2);
  sub.connect(sg); sg.connect(MUSIC.bus.pad); sub.start(t); sub.stop(t + dur + 2.2);
}
function pluck(t, midi, vel, dur = 0.35) {
  const A = actx, o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
  o.type = 'triangle'; o2.type = 'square'; o.frequency.value = o2.frequency.value = mtof(midi); o2.detune.value = 5;
  f.type = 'lowpass'; f.frequency.setValueAtTime(3200 + 2000 * MUSIC.I, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
  const g2 = A.createGain(); g2.gain.value = 0.25;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08 * vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(MUSIC.bus.arp);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function bassNote(t, midi, dur) {
  const A = actx, o = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = mtof(midi);
  f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur); f.Q.value = 4;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(MUSIC.bus.bass); o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function noiseSrc(t, dur) {
  const A = actx;
  if (!noiseBuf) { noiseBuf = A.createBuffer(1, A.sampleRate, A.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = A.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); return s;
}
function hat(t, vel) {
  const A = actx, s = noiseSrc(t, 0.06), f = A.createBiquadFilter(), g = A.createGain();
  f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(0.06 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  s.connect(f); f.connect(g); g.connect(MUSIC.bus.hat);
}
function kick(t) {
  const A = actx, o = A.createOscillator(), g = A.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(g); g.connect(MUSIC.bus.kick); o.start(t); o.stop(t + 0.35);
}
function snare(t) {
  const A = actx, s = noiseSrc(t, 0.2), f = A.createBiquadFilter(), g = A.createGain();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.connect(f); f.connect(g); g.connect(MUSIC.bus.snare);
  const o = A.createOscillator(), og = A.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  og.gain.setValueAtTime(0.1, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(og); og.connect(MUSIC.bus.snare); o.start(t); o.stop(t + 0.12);
}
function heartbeat(t) {
  // lub-dub: two muffled low thumps
  for (const [dt, v] of [[0, 1], [0.16, 0.7]]) {
    const A = actx, o = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
    f.type = 'lowpass'; f.frequency.value = 220;
    g.gain.setValueAtTime(0.55 * v, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
    o.connect(f); f.connect(g); g.connect(MUSIC.bus.heart); o.start(t + dt); o.stop(t + dt + 0.25);
  }
}

function deathSting(t) {
  // a deep, slow minor swell and a flatline tone that fades into the reverb
  const A = actx;
  for (const m of [33, 40, 45, 48, 52]) {
    const o = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = (Math.random() - 0.5) * 10;
    f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1100, t + 2.5); f.frequency.linearRampToValueAtTime(250, t + 7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 1.5); g.gain.linearRampToValueAtTime(0, t + 7.5);
    o.connect(f); f.connect(g); g.connect(MUSIC.bus.pad); o.start(t); o.stop(t + 7.6);
  }
  const fl = A.createOscillator(), fg = A.createGain(); fl.type = 'sine'; fl.frequency.value = 1000;
  fg.gain.setValueAtTime(0, t + 0.3); fg.gain.linearRampToValueAtTime(0.03, t + 0.35); fg.gain.setValueAtTime(0.03, t + 2.2); fg.gain.linearRampToValueAtTime(0, t + 3.2);
  fl.connect(fg); fg.connect(MUSIC.bus.pad); fl.start(t + 0.3); fl.stop(t + 3.3);
}

/* ---------- the sequencer: 16th-note steps, 2 bars per chord ---------- */
/* ---------- COIN FRENZY: a bouncy, bright major-key tune (C G Am F) that takes over while it lasts ---------- */
function fzLead(t, midi, dur = 0.16, vel = 1) {
  const A = actx, o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
  o.type = 'square'; o2.type = 'triangle'; o.frequency.value = mtof(midi); o2.frequency.value = mtof(midi + 12); o.detune.value = 6;
  f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1400, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const g2 = A.createGain(); g2.gain.value = 0.35;
  o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(MUSIC.bus.fz);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function fzBass(t, midi, dur) {
  const A = actx, o = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter();
  o.type = 'square'; o.frequency.value = mtof(midi);
  f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(240, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(MUSIC.bus.fz); o.start(t); o.stop(t + dur + 0.05);
}
const FZ_ROOTS = [60, 55, 57, 53];
// melody: steps through the chord (index into root, 3rd, 5th, octave, 10th); null = rest
const FZ_MEL = [[3, 0, null, 2, null, 3, 4, null, 3, null, 2, 1, 2, null, 0, null], [4, null, 3, 2, null, 3, null, 4, 5, null, 4, 3, 2, null, 1, null]];
function frenzyStep(st, t) {
  const s16 = st % 16, bar = Math.floor(st / 16), r = FZ_ROOTS[bar % 4], minor = bar % 4 === 2;
  const tones = minor ? [0, 3, 7, 12, 15, 19] : [0, 4, 7, 12, 16, 19];
  const mel = FZ_MEL[Math.floor(bar / 4) % 2][s16];
  if (mel !== null) fzLead(t, r + 12 + tones[mel], s16 % 4 === 0 ? 0.22 : 0.13, s16 % 4 === 0 ? 1 : 0.8);
  if (s16 % 2 === 1 && Math.random() < 0.6) fzLead(t, r + 24 + tones[(s16 * 3 + bar) % 4], 0.07, 0.35);     // a sparkly counter-line
  if (s16 % 4 === 0) fzBass(t, r - 12, 0.16); else if (s16 % 4 === 2) fzBass(t, r, 0.12);
  if (s16 % 4 === 0) kick(t);
  if (s16 === 4 || s16 === 12) snare(t);
  if (s16 % 2 === 0) hat(t, s16 % 4 === 2 ? 1 : 0.6); else if (Math.random() < 0.4) hat(t, 0.35);
}
function scheduleStep(st, t) {
  if (MUSIC.fz) { frenzyStep(st, t); return; }
  const I = MUSIC.I, D = MUSIC.D, s16 = st % 16, bar = Math.floor(st / 16);
  const ch = PROG[Math.floor(bar / 2) % PROG.length], beat = s16 % 4 === 0;
  if (st % 32 === 0) padChord(t, ch, 60 / MUSIC.bpm * 8);
  // arpeggio: busier as intensity grows (rolled chord tones, up and down two octaves)
  if (I > 0.12) {
    const dens = 0.18 + 0.7 * I, on = s16 % 2 === 0 ? dens : dens * 0.6 * I;
    if (Math.random() < on) {
      const seq = [0, 1, 2, 3, 4, 3, 2, 1], k = seq[(st + bar) % seq.length], oct = s16 >= 8 && I > 0.5 ? 24 : 12;
      pluck(t, ch.root + 12 + oct + ch.tones[k % ch.tones.length], 0.6 + 0.4 * Math.random(), 0.25 + 0.3 * (1 - I));
    }
  }
  // bass: quarter notes, then a driving eighth-note line
  if (I > 0.3 && (beat || (I > 0.6 && s16 % 2 === 0))) bassNote(t, ch.root - 12 + (s16 === 14 && I > 0.6 ? 7 : 0), I > 0.6 ? 0.22 : 0.45);
  if (I > 0.42 && s16 % 2 === 1) hat(t, 0.5 + 0.5 * Math.random());
  if (I > 0.7 && s16 % 4 === 2 && Math.random() < 0.5) hat(t, 0.4);
  if (I > 0.58 && (s16 === 0 || s16 === 8 || (I > 0.8 && s16 === 10))) kick(t);
  if (I > 0.78 && (s16 === 4 || s16 === 12)) snare(t);
  // low health: a heartbeat that quickens as you get closer to death
  if (D > 0.15) { const every = D > 0.7 ? 8 : 16; if (st % every === 0) heartbeat(t); }
}

/* ---------- per frame: read the game, steer the mix, keep the sequencer fed ---------- */
function musicTick(dt) {
  if (!actx) return;
  if (!MUSIC.ready) musicInit();
  if (!MUSIC.ready || actx.state !== 'running') return;
  const inRun = S.inRun && ['play', 'drop', 'levelup', 'perk', 'pause', 'inv', 'shop', 'terminal', 'countdown', 'dying'].includes(S.mode);
  let ti = 0.05, td = 0;
  if (inRun && player && player.pos) {
    let near = 0, close = 0;
    for (const e of enemies) { if (e.dead) continue; const d2 = (e.pos.x - player.pos.x) ** 2 + (e.pos.z - player.pos.z) ** 2; if (d2 < 35 * 35) near++; if (d2 < 12 * 12) close++; }
    ti = clamp(0.12 + near / 70 + close / 25, 0, 1);
    if ((S.boss && !S.boss.dead) || (S.mini && !S.mini.dead)) ti = Math.max(ti, 0.82);
    if (S.mode === 'drop') ti = Math.max(ti, 0.45);
    if (S.mode === 'countdown') ti = 0.2;
    if (stats && stats.maxHp) td = clamp((0.6 - player.hp / stats.maxHp) / 0.45, 0, 1);
  }
  // death: the music falls silent the moment the frame goes down and stays silent on the game over screen;
  // it comes back in calm from the hangar
  const dead = S.mode === 'dying' || S.mode === 'over';
  if (dead) { ti = 0.05; td = 0; MUSIC.I = 0.05; MUSIC.D = 0; }
  if (dead && !MUSIC.silent) MUSIC.out.gain.cancelScheduledValues(actx.currentTime);
  MUSIC.silent = dead;
  if (!isFinite(ti)) ti = 0.05; if (!isFinite(td)) td = 0;
  if (!isFinite(MUSIC.I)) MUSIC.I = 0.05; if (!isFinite(MUSIC.D)) MUSIC.D = 0;
  MUSIC.targetI = ti; MUSIC.targetD = td;
  // build up over a few seconds, settle down more slowly
  MUSIC.I += (ti - MUSIC.I) * Math.min(1, dt * (ti > MUSIC.I ? 0.35 : 0.15));
  MUSIC.D += (td - MUSIC.D) * Math.min(1, dt * (td > MUSIC.D ? 1.2 : S.mode === 'dying' ? 3 : 0.4));
  MUSIC.fz = inRun && !dead && (S.frenzyT || 0) > 0;
  MUSIC.bpm = MUSIC.fz ? 148 : 84 + 22 * MUSIC.I;
  const now = actx.currentTime, I = MUSIC.I, D = MUSIC.D, B = MUSIC.bus, k = 0.4;
  const set = (g, v) => g.gain.setTargetAtTime(v, now, k);
  set(B.fz, MUSIC.fz ? 1 : 0);
  if (MUSIC.fz) { for (const n of ['pad', 'arp', 'bass', 'heart', 'drone']) B[n].gain.setTargetAtTime(0, now, 0.15); for (const n of ['hat', 'kick', 'snare']) B[n].gain.setTargetAtTime(0.9, now, 0.1); MUSIC.out.gain.setTargetAtTime(SETTINGS.music * 0.9, now, 0.3); musicPump(); return; }
  set(B.pad, 1 - 0.25 * I);
  set(B.arp, smooth(0.1, 0.35, I));
  set(B.bass, smooth(0.28, 0.5, I));
  set(B.hat, smooth(0.4, 0.6, I));
  set(B.kick, smooth(0.55, 0.75, I));
  set(B.snare, smooth(0.75, 0.9, I));
  set(B.heart, smooth(0.1, 0.5, D));
  set(B.drone, 0.9 * D * D);
  const duck = S.mode === 'pause' || S.mode === 'inv' || S.mode === 'shop' || S.mode === 'terminal' ? 0.45 : 1;
  MUSIC.out.gain.setTargetAtTime(dead ? 0 : SETTINGS.music * duck * 0.9, now, dead ? 0.08 : 0.6);
  musicPump();
}
/* the sequencer runs on its own timer as well, so a slow or hidden frame never makes the music stutter */
function musicPump() {
  if (actx && !MUSIC.ready) musicInit();
  if (!MUSIC.ready || !actx) return;
  if (actx.state !== 'running') { try { actx.resume(); } catch (e) {} return; }
  const now = actx.currentTime;
  if (!isFinite(MUSIC.bpm) || MUSIC.bpm < 40) MUSIC.bpm = 84;
  if (S.mode !== 'dying' && S.mode !== 'over' && MUSIC.silent) musicTick(0);   // coming back from the game over screen
  if (MUSIC.silent) { MUSIC.nextT = now + 0.05; return; }          // nothing new while you're dead
  if (!(MUSIC.nextT >= now - 1)) MUSIC.nextT = now + 0.05;          // after a long stall, pick up from now
  // half a second of notes queued ahead, so a heavy frame (an explosion, the robot falling apart) never leaves a gap
  while (MUSIC.nextT < now + 0.5) {
    try { scheduleStep(MUSIC.step, MUSIC.nextT); } catch (e) { console.warn('music step', e); }
    MUSIC.nextT += 60 / MUSIC.bpm / 4; MUSIC.step++;
  }
}
setInterval(() => { try { musicPump(); } catch (e) {} }, 40);

// start the score on the very first click or key press (browsers block audio until then)
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => ensureAudio(), { capture: true });
