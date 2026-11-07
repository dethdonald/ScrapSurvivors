'use strict';
/* ============================================================
   SCRAP INK (chunk 16): an optional art-style post pass inspired by the concept image.
   Flat cel-like lighting BANDS (luminance posterised, hue kept), dark mechanical OUTLINES, restrained ordered
   DITHER in the shadows, a little CONTRAST, optional PIXELATION and subtle CRT SCANLINES, all mixed with a master INTENSITY.
   Pipeline: scene -> HDR target -> bloom -> tone-map (MAT_OUT) -> [INK pass] -> screen. The HUD is DOM, so text stays sharp.
   When the style is off nothing changes: MAT_OUT draws straight to the screen exactly as before (zero extra passes).
   Outlines come from a colour/luminance Roberts-cross on the tone-mapped image (no extra geometry/normal/depth pass, so no extra
   scene render): silhouettes and strong lighting creases get lines, they fade out in dark areas (dark robots are not crushed) and are
   capped (hordes don't turn into black soup). True depth/normal outlines would need a second scene render: documented upgrade path.
   Protected: bright effects/glow (highlight bypass), saturated pixels get a lighter touch (player accent colour, enemy tints),
   the MK III cinematic is never inked, and the part-viewer canvases are separate and untouched.
   Developer Mode first: the controls live in Options -> Developer and the effect only runs while Developer mode is on
   (INK_PUBLIC = true would let anyone use it). Defaults to OFF; preferences are saved in SETTINGS.ink.
   ============================================================ */
const INK_PUBLIC = false;
const INK_PRESETS = {
  off:   { bands: 4, outline: 0,    dither: 0,    contrast: 0,    pixel: 0,    scan: 0,    intensity: 1 },
  scrap: { bands: 4, outline: 0.35, dither: 0.15, contrast: 0.12, pixel: 0,    scan: 0.05, intensity: 1 },
  light: { bands: 6, outline: 0.20, dither: 0.08, contrast: 0.06, pixel: 0,    scan: 0.03, intensity: 0.7 },
  heavy: { bands: 3, outline: 0.60, dither: 0.25, contrast: 0.20, pixel: 0.25, scan: 0.10, intensity: 1 },
};
const INK_NAMES = { off: 'Off', scrap: 'SCRAP INK', light: 'Light', heavy: 'Heavy', custom: 'Custom' };
const INK_KEYS = [['bands', 'Posterize bands', 2, 8, 1, v => v + ' bands'], ['outline', 'Outline strength', 0, 1, 0.01, v => Math.round(v * 100) + '%'], ['dither', 'Shadow dithering', 0, 0.5, 0.01, v => Math.round(v * 100) + '%'],
  ['contrast', 'Contrast', 0, 0.4, 0.01, v => '+' + Math.round(v * 100) + '%'], ['pixel', 'Pixelation', 0, 1, 0.01, v => Math.round(v * 100) + '%'], ['scan', 'CRT scanlines', 0, 0.3, 0.01, v => Math.round(v * 100) + '%'], ['intensity', 'Master intensity', 0, 1, 0.01, v => Math.round(v * 100) + '%']];
if (!SETTINGS.ink || typeof SETTINGS.ink !== 'object' || !INK_NAMES[SETTINGS.ink.preset]) SETTINGS.ink = { preset: 'off', custom: { ...INK_PRESETS.scrap } };
if (!SETTINGS.ink.custom) SETTINGS.ink.custom = { ...INK_PRESETS.scrap };
const inkVals = () => SETTINGS.ink.preset === 'custom' ? SETTINGS.ink.custom : (INK_PRESETS[SETTINGS.ink.preset] || INK_PRESETS.off);
function inkActive() {
  if (!(SETTINGS.dev || INK_PUBLIC) || SETTINGS.ink.preset === 'off') return false;
  if (typeof S !== 'undefined' && S.mode === 'cine') return false;            // the golden reveal stays untouched
  const v = inkVals(); return v.intensity > 0.001;
}
const MAT_INK = shader(`uniform sampler2D tex; uniform vec2 res; uniform float bands, outline, dither, contrast, pixel, scan, intensity; varying vec2 vUv;
  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); float x = q.x, y = q.y;       // 4x4 ordered dither matrix, 0..1
    float b = mod(x * 4.0 + y * 7.0 + (mod(x, 2.0) * 2.0 + mod(y, 2.0)) * 5.0, 16.0); return (b + 0.5) / 16.0; }
  void main(){
    vec2 uv = vUv;
    float ps = 1.0 + floor(pixel * 5.0 + 0.5);                                       // 1..6 px blocks
    if (ps > 1.5) uv = (floor(uv * res / ps) + 0.5) * ps / res;
    vec2 px = ps / res;
    vec3 base = texture2D(tex, vUv).rgb;
    vec3 c = texture2D(tex, uv).rgb;
    float l = lum(c), mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = (mx - mn) / max(mx, 1e-3);
    // contrast around mid grey, but less in the darks so dark robots are not crushed
    float ck = contrast * smoothstep(0.05, 0.4, l);
    vec3 o = clamp((c - 0.5) * (1.0 + ck) + 0.5, 0.0, 1.0);
    // cel bands on luminance (hue preserved); bright glows and saturated effects bypass it
    float lo = lum(o);
    float d = (bayer(gl_FragCoord.xy) - 0.5) * dither * (1.0 - smoothstep(0.18, 0.55, lo));
    float q = (floor(lo * bands + 0.5 + d * bands)) / bands;
    float keep = smoothstep(0.82, 0.98, lo) * 0.9 + smoothstep(0.6, 0.95, sat) * smoothstep(0.45, 0.8, lo) * 0.55;
    vec3 banded = o * (max(q, 0.025) / max(lo, 0.02));
    o = mix(banded, o, clamp(keep, 0.0, 1.0));
    // outlines: Roberts cross on luminance with a small chroma term, thin, faded in the darks, capped
    float a = lum(texture2D(tex, uv).rgb), b = lum(texture2D(tex, uv + vec2(px.x, 0.0)).rgb), e = lum(texture2D(tex, uv + vec2(0.0, px.y)).rgb), f = lum(texture2D(tex, uv + px).rgb);
    float g = length(vec2(a - f, b - e));
    float edge = smoothstep(0.07, 0.24, g) * smoothstep(0.05, 0.22, max(max(a, b), max(e, f)));
    o = mix(o, vec3(0.02, 0.025, 0.03), clamp(edge * outline * 1.6, 0.0, 0.8));
    // scanlines
    o *= 1.0 - scan * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159265));
    gl_FragColor = vec4(mix(base, o, intensity), 1.0);
  }`, { tex: { value: null }, res: { value: new THREE.Vector2(1, 1) }, bands: { value: 4 }, outline: { value: 0 }, dither: { value: 0 }, contrast: { value: 0 }, pixel: { value: 0 }, scan: { value: 0 }, intensity: { value: 1 } });
/* called at the end of renderFrame: true = the ink pass drew to the screen */
function inkFinish() {
  if (!inkActive()) return false;
  const w = POST.w, h = POST.h;
  if (!POST.ldr || POST.ldr.width !== w || POST.ldr.height !== h) { if (POST.ldr) POST.ldr.dispose(); POST.ldr = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }
  blit(MAT_OUT, POST.ldr);
  const v = inkVals(), u = MAT_INK.uniforms;
  u.tex.value = POST.ldr.texture; u.res.value.set(w, h); u.bands.value = v.bands; u.outline.value = v.outline; u.dither.value = v.dither; u.contrast.value = v.contrast; u.pixel.value = v.pixel; u.scan.value = v.scan; u.intensity.value = v.intensity;
  blit(MAT_INK, null); return true;
}
/* ---------- Options -> Developer UI (built here, shown in Developer mode) ---------- */
(function () {
  const sec = [...document.querySelectorAll('.optsec')].find(s => s.querySelector('#devBtn')); if (!sec) return;
  const box = document.createElement('div'); box.id = 'inkBox'; box.hidden = true;
  box.innerHTML = `<button class="btn ghost nav" id="inkBtn">Scrap Ink: off</button><div id="inkSliders">${INK_KEYS.map(k => `<label class="setting"><span>${k[1]} <b class="mono" id="inkV_${k[0]}"></b></span><input class="nav" data-ink="${k[0]}" type="range" min="${k[2]}" max="${k[3]}" step="${k[4]}"></label>`).join('')}</div>`;
  sec.insertBefore(box, sec.querySelector('#skipBtn'));
  $('#inkBtn').addEventListener('click', () => { const order = ['off', 'scrap', 'light', 'heavy', 'custom']; const i = order.indexOf(SETTINGS.ink.preset); inkSet(order[(i + 1) % order.length]); });
  box.querySelectorAll('[data-ink]').forEach(inp => inp.addEventListener('input', () => {
    if (SETTINGS.ink.preset !== 'custom') { SETTINGS.ink.custom = { ...inkVals() }; SETTINGS.ink.preset = 'custom'; }
    SETTINGS.ink.custom[inp.dataset.ink] = +inp.value; saveSettings(); inkSyncUI();
  }));
})();
function inkSet(p) { if (p === 'custom' && SETTINGS.ink.preset !== 'custom') SETTINGS.ink.custom = { ...inkVals(), ...(SETTINGS.ink.custom && SETTINGS.ink.preset === 'custom' ? SETTINGS.ink.custom : {}) }; SETTINGS.ink.preset = p; if (p !== 'off' && p !== 'custom') SETTINGS.ink.custom = { ...INK_PRESETS[p] }; saveSettings(); inkSyncUI(); }
function inkSyncUI() {
  const box = $('#inkBox'); if (!box) return; box.hidden = !(SETTINGS.dev || INK_PUBLIC);
  $('#inkBtn').textContent = 'Scrap Ink: ' + INK_NAMES[SETTINGS.ink.preset]; const v = inkVals();
  INK_KEYS.forEach(k => { const inp = box.querySelector(`[data-ink="${k[0]}"]`); if (document.activeElement !== inp) inp.value = v[k[0]]; $('#inkV_' + k[0]).textContent = k[5](v[k[0]]); });
  $('#inkSliders').style.opacity = SETTINGS.ink.preset === 'off' ? 0.5 : 1;
}
