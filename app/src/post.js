'use strict';
/* Graphics: sun shadows, metal + reflections, filmic (ACES) tone mapping and bloom.
   Every scene is drawn into an HDR buffer, glowing things are pushed above white,
   the bright parts are blurred into a bloom, and the composite tone-maps it all to the screen. */

const GFX_PRESETS = {
  low:    { shadow: 0,    bloom: false, msaa: 2, dpr: 1 },
  medium: { shadow: 1024, bloom: true,  msaa: 4, dpr: 1 },
  high:   { shadow: 2048, bloom: true,  msaa: 4, dpr: 1.5 },
};
if (!GFX_PRESETS[SETTINGS.gfx]) SETTINGS.gfx = 'high';
const GFX = { exposure: 1.25, bloomStrength: 0.35, threshold: 1.05, glowGain: 1.5, emissiveGain: 1.5 };

/* --- glow: unlit (basic) materials and emissive light are pushed past white so they bloom --- */
THREE.ShaderLib.basic.fragmentShader = THREE.ShaderLib.basic.fragmentShader.replace(
  'vec3 outgoingLight = reflectedLight.indirectDiffuse;', `vec3 outgoingLight = reflectedLight.indirectDiffuse * ${GFX.glowGain.toFixed(2)};`);
THREE.ShaderChunk.emissivemap_fragment += `\ntotalEmissiveRadiance *= ${GFX.emissiveGain.toFixed(2)};\n`;

/* --- shadows: solid meshes cast and receive; glows, flames and see-through things don't --- */
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function markShadow(o) {
  if (!o.isMesh || o.userData.noShadow) return;
  const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m) return;
  const unlit = m.isMeshBasicMaterial || m.isShaderMaterial;
  o.castShadow = !unlit && !m.transparent && m.visible !== false;
  o.receiveShadow = !unlit;
}
{
  const add = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    const r = add.apply(this, objs);
    for (const o of objs) if (o && o.traverse) o.traverse(markShadow);
    return r;
  };
}
function setupShadowLight(light, half, far) {
  light.castShadow = true;
  const c = light.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 0.5; c.far = far; c.updateProjectionMatrix();
  light.shadow.bias = -0.0004; light.shadow.normalBias = 0.03;
  light.userData.shadowHalf = half;
  if (!light.target.parent && light.parent) light.parent.add(light.target);
}
setupShadowLight(sun, 34, 260); scene.add(sun.target);
setupShadowLight(bsun, 7, 40);
const SUN_OFF = new THREE.Vector3(40, 90, 25);
function followSun(p) {
  // move the shadow box with the player, snapped to whole shadow-map texels so edges don't crawl
  const size = sun.shadow.mapSize.x || 2048, step = (2 * sun.userData.shadowHalf) / size;
  const x = Math.round(p.x / step) * step, y = Math.round(p.y / step) * step, z = Math.round(p.z / step) * step;
  sun.target.position.set(x, y, z); sun.position.set(x + SUN_OFF.x, y + SUN_OFF.y, z + SUN_OFF.z);
}

/* --- reflections: a soft studio sky the metal parts reflect (re-tinted to each level's sky) --- */
const pmrem = new THREE.PMREMGenerator(renderer);
function makeEnv(skyHex, gen = pmrem) {
  const es = new THREE.Scene();
  const sky = new THREE.Color(skyHex);
  const top = new THREE.Color(0xd8e4ec).lerp(sky, 0.25), hor = new THREE.Color(0x8b949b).lerp(sky, 0.45), bot = new THREE.Color(0x231f1c);
  // gradient dome from vertex colours (a basic material, so it writes the encoding PMREM expects)
  const dg = new THREE.SphereGeometry(40, 32, 16), pos = dg.attributes.position, cols = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 40;
    if (h > 0) c.copy(hor).lerp(top, Math.pow(h, 0.6)); else c.copy(hor).lerp(bot, Math.pow(-h, 0.4));
    c.multiplyScalar(1 / GFX.glowGain); cols.push(c.r, c.g, c.b);
  }
  dg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }));
  es.add(dome);
  // a few bright soft-boxes so metal gets crisp highlights
  const panel = (w, h, x, y, z, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.96), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  panel(30, 12, 12, 28, 10, 2.4); panel(14, 20, -30, 8, -6, 1.3); panel(20, 6, 0, 10, -32, 1.0);
  const t = gen.fromScene(es, 0.03).texture;
  dome.geometry.dispose(); dome.material.dispose();
  return t;
}
const ENV = { base: makeEnv(0x2c3136), level: null };
scene.environment = ENV.base; buildScene.environment = ENV.base;
function setLevelEnv(skyColor) {
  if (ENV.level) ENV.level.dispose();
  ENV.level = makeEnv(skyColor.getHex()); scene.environment = ENV.level;
}

/* --- post: HDR scene buffer -> bloom chain -> ACES composite --- */
const POST = { w: 0, h: 0, rt: null, down: [], up: [], samples: -1 };
const FSQ = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); FSQ.frustumCulled = false;
const FSS = new THREE.Scene(); FSS.add(FSQ);
const FSC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const shader = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
const MAT_BRIGHT = shader(`uniform sampler2D tex; uniform vec2 px; uniform float thr; varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tex, vUv + o * px).rgb; }
  void main(){
    vec3 c = (s(vec2(-1.0,-1.0)) + s(vec2(1.0,-1.0)) + s(vec2(-1.0,1.0)) + s(vec2(1.0,1.0))) * 0.25;
    float l = max(c.r, max(c.g, c.b)), soft = clamp(l - thr + 0.25, 0.0, 0.5); soft = soft * soft / 0.5 * 0.5;   // soft knee
    float k = max(soft, l - thr) / max(l, 1e-4);
    gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0);
  }`, { tex: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: GFX.threshold } });
const MAT_DOWN = shader(`uniform sampler2D tex; uniform vec2 px; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tex, vUv).rgb * 4.0;
    c += texture2D(tex, vUv + vec2(-1.0,-1.0) * px).rgb + texture2D(tex, vUv + vec2(1.0,-1.0) * px).rgb;
    c += texture2D(tex, vUv + vec2(-1.0, 1.0) * px).rgb + texture2D(tex, vUv + vec2(1.0, 1.0) * px).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }`, { tex: { value: null }, px: { value: new THREE.Vector2() } });
const MAT_UP = shader(`uniform sampler2D tex; uniform sampler2D cur; uniform vec2 px; varying vec2 vUv;
  void main(){
    vec3 c = vec3(0.0);
    c += texture2D(tex, vUv + vec2(-2.0, 0.0) * px).rgb + texture2D(tex, vUv + vec2(2.0, 0.0) * px).rgb;
    c += texture2D(tex, vUv + vec2(0.0, -2.0) * px).rgb + texture2D(tex, vUv + vec2(0.0, 2.0) * px).rgb;
    c += (texture2D(tex, vUv + vec2(-1.0,-1.0) * px).rgb + texture2D(tex, vUv + vec2(1.0,-1.0) * px).rgb
        + texture2D(tex, vUv + vec2(-1.0, 1.0) * px).rgb + texture2D(tex, vUv + vec2(1.0, 1.0) * px).rgb) * 2.0;
    gl_FragColor = vec4(c / 12.0 + texture2D(cur, vUv).rgb, 1.0);
  }`, { tex: { value: null }, cur: { value: null }, px: { value: new THREE.Vector2() } });
const MAT_OUT = shader(`uniform sampler2D tex; uniform sampler2D bloom; uniform float useBloom, strength, exposure; varying vec2 vUv;
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main(){
    vec3 c = texture2D(tex, vUv).rgb;
    // the game's colours are authored as screen colours: treat them as such, roll the highlights off filmically
    vec3 lin = pow(max(c, vec3(0.0)), vec3(2.2));
    if (useBloom > 0.5) lin += pow(max(texture2D(bloom, vUv).rgb, vec3(0.0)), vec3(2.2)) * strength;
    vec3 o = pow(aces(lin * exposure), vec3(1.0 / 2.2));
    vec2 d = vUv - 0.5; o *= 1.0 - dot(d, d) * 0.35;                    // light vignette
    gl_FragColor = vec4(o, 1.0);
  }`, { tex: { value: null }, bloom: { value: null }, useBloom: { value: 1 }, strength: { value: GFX.bloomStrength }, exposure: { value: GFX.exposure } });

function postTargets() {
  const Q = GFX_PRESETS[SETTINGS.gfx], v = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(1, v.x | 0), h = Math.max(1, v.y | 0);
  if (POST.rt && POST.w === w && POST.h === h && POST.samples === Q.msaa) return;
  if (POST.rt) POST.rt.dispose(); POST.down.forEach(r => r.dispose()); POST.up.forEach(r => r.dispose());
  const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const isGL2 = renderer.capabilities.isWebGL2;
  POST.rt = isGL2 ? new THREE.WebGLMultisampleRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat }) : new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
  if (isGL2) POST.rt.samples = Q.msaa;
  POST.down = []; POST.up = [];
  // the bloom chain starts at quarter resolution (it's a blur anyway): about 4x cheaper than starting at half
  let bw = w >> 2, bh = h >> 2;
  for (let i = 0; i < 5 && bw > 2 && bh > 2; i++) { POST.down.push(new THREE.WebGLRenderTarget(bw, bh, opt)); POST.up.push(new THREE.WebGLRenderTarget(bw, bh, opt)); bw >>= 1; bh >>= 1; }
  POST.w = w; POST.h = h; POST.samples = Q.msaa;
}
function blit(mat, target) { FSQ.material = mat; renderer.setRenderTarget(target); renderer.render(FSS, FSC); }

/* the one place every scene is drawn */
let _pvLast = performance.now();
function renderFrame(sc, cam) {
  const Q = GFX_PRESETS[SETTINGS.gfx];
  { const n = performance.now(); partViewTick(Math.min(0.1, (n - _pvLast) / 1000)); _pvLast = n; }
  if (sc === scene && player && player.pos) followSun(player.pos);
  postTargets();
  renderer.setRenderTarget(POST.rt);
  renderer.render(sc, cam);
  const bloom = Q.bloom && POST.down.length > 1;
  if (bloom) {
    const D = POST.down, U = POST.up;
    MAT_BRIGHT.uniforms.tex.value = POST.rt.texture; MAT_BRIGHT.uniforms.px.value.set(1 / POST.w, 1 / POST.h);      // 4 bilinear taps cover the 4x4 block each pixel stands for
    blit(MAT_BRIGHT, D[0]);
    for (let i = 1; i < D.length; i++) { MAT_DOWN.uniforms.tex.value = D[i - 1].texture; MAT_DOWN.uniforms.px.value.set(1 / D[i - 1].width, 1 / D[i - 1].height); blit(MAT_DOWN, D[i]); }
    let prev = D[D.length - 1];
    for (let i = D.length - 2; i >= 0; i--) {
      MAT_UP.uniforms.tex.value = prev.texture; MAT_UP.uniforms.cur.value = D[i].texture; MAT_UP.uniforms.px.value.set(0.5 / prev.width, 0.5 / prev.height);
      blit(MAT_UP, U[i]); prev = U[i];
    }
    MAT_OUT.uniforms.bloom.value = U[0].texture;
  }
  MAT_OUT.uniforms.tex.value = POST.rt.texture; MAT_OUT.uniforms.useBloom.value = bloom ? 1 : 0;
  blit(MAT_OUT, null);
}

/* quality preset: shadows, bloom, anti-aliasing and render resolution */
function applyGfx() {
  const Q = GFX_PRESETS[SETTINGS.gfx];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr)); resize();
  for (const l of [sun, bsun, ...(typeof TITLE !== 'undefined' && TITLE.lights ? TITLE.lights : [])]) {
    l.castShadow = Q.shadow > 0;
    if (Q.shadow && l.shadow.mapSize.x !== Q.shadow) { l.shadow.mapSize.set(Q.shadow, Q.shadow); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
  }
  POST.samples = -1;   // rebuild targets
}
applyGfx();

/* ---------- part viewer: a small spinning 3D model of a part inside the pop-up description boxes ----------
   Its own little WebGL canvas (so it can sit on top of the box's background), with its own reflections. */
const PV = { canvas: null, r: null, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(28, 1.4, 0.05, 60), obj: null, item: null, t: 0 };
function pvInit() {
  if (PV.r) return;
  PV.canvas = document.createElement('canvas'); PV.canvas.className = 'pv';
  PV.r = new THREE.WebGLRenderer({ canvas: PV.canvas, antialias: true, alpha: true });
  PV.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); PV.r.setSize(168, 120, false); PV.r.setClearColor(0x000000, 0);
  PV.scene.add(new THREE.HemisphereLight(0xe0ecf2, 0x2a2420, 0.95));
  const k = new THREE.DirectionalLight(0xfff0d8, 1.0); k.position.set(2, 3, 2.5); PV.scene.add(k);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 0.5); rim.position.set(-3, 1, -2); PV.scene.add(rim);
  PV.scene.environment = makeEnv(0x2c3136, new THREE.PMREMGenerator(PV.r));
}
/* show item in the given box (a .tipView element); null clears it */
function partView(el, item) {
  pvInit();
  if (PV.obj) { PV.scene.remove(PV.obj); PV.obj = null; }
  PV.item = item;
  if (!item || !el) return;
  if (PV.canvas.parentNode !== el) el.appendChild(PV.canvas);
  const out = item.kind === 'block' || item.kind === 'gem' ? new THREE.Vector3(0, 1, 0) : item.kind === 'weapon' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const g = buildPart(item, out, null);
  const holder = new THREE.Group(); holder.add(g); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), r = Math.max(0.15, box.getSize(new THREE.Vector3()).length() / 2);
  g.position.sub(c);
  PV.obj = holder; PV.scene.add(holder);
  const d = r / Math.sin(THREE.MathUtils.degToRad(14)) * 0.72;
  PV.cam.position.set(0, d * 0.32, d); PV.cam.lookAt(0, 0, 0);
  PV.t = 0;
}
function partViewTick(dt) {
  if (!PV.obj || !PV.canvas || !PV.canvas.isConnected) return;
  const host = PV.canvas.parentNode.closest('.tip'); if (!host || host.hidden) return;
  PV.t += dt; PV.obj.rotation.y += dt * 1.1; PV.obj.rotation.x = Math.sin(PV.t * 0.7) * 0.12;
  PV.r.render(PV.scene, PV.cam);
}
