'use strict';
/* ============================================================
   SKY + GRADE
   The arena's sky used to be scene.background: one flat colour, edge to edge, so distance resolved
   into a painted wall rather than into air. This is a dome instead - a vertical gradient, a bright
   band of haze piled up on the horizon, and a broad glow where the sun is - plus the per-level
   colour grade that rides on the final composite.

   It costs one draw call of a shader with no texture lookups. The dome follows the camera, draws
   first with no depth test and no depth write, and everything in the arena paints over it.

   The colours are read back out of scene.background every frame rather than being set once. That is
   deliberate: the atmospheric entry sequence (game.js) lerps the background towards a hot orange
   while the heat shield burns, and doing it this way means the sky glows along with it for free.
   ============================================================ */
const SKYD = { mesh: null, u: null, grade: null };

/* Neutral grade: what every scene that is not the arena gets (title screen, hangar, the cinematic). */
const SKY_GRADE0 = { uContrast: 1, uBlack: 0, uWhite: 1, uSat: 1, uWarm: 0, uVig: 0.35 };

function skyInit() {
  if (SKYD.mesh) return;
  const u = SKYD.u = {
    uZenith: { value: new THREE.Color(0x27323c) }, uHorizon: { value: new THREE.Color(0x6a7a86) },
    uGround: { value: new THREE.Color(0x10151a) }, uSunDir: { value: new THREE.Vector3(0.6, 0.5, 0.3) },
    uSunCol: { value: new THREE.Color(0xffe3b8) }, uGlow: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunCol; uniform float uGlow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
                           : mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.5));
        col += uHorizon * 0.35 * exp(-abs(h) * 14.0);                // haze stacked up along the horizon
        // the sun itself: a wide glow and a tighter core, but no hard disc - the arena's outer wall
        // hides anything near the horizon anyway, and a white dot peeking over it reads as a bug
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(s, 7.0) * 0.5 + pow(s, 48.0) * 0.85) * uGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1000; m.userData.noShadow = true;
  m.castShadow = m.receiveShadow = false;
  scene.add(m); SKYD.mesh = m;
}

/* Called once a stage, from setLevelPalette. Points the sun glow and works out this level's grade. */
function skyApply() {
  skyInit();
  SKYD.u.uSunDir.value.copy(SUN_OFF).normalize();
  SKYD.u.uSunCol.value.copy(sun.color).multiplyScalar(0.55);
  /* The grade comes off the level's own hue, so it is the same every time that palette comes up:
     warm hues get pushed warmer and crushed a little, cold hues get cooled and opened up. This is
     what stops the stages reading as the same arena with the colour wheel spun. */
  const h = LEVEL_PAL.hue, warm = Math.cos(h * Math.PI * 2) * 0.45;
  SKYD.grade = {
    uWarm: warm,
    uContrast: 1.06 + Math.abs(warm) * 0.1,
    uBlack: 0.012 + Math.max(0, warm) * 0.02,
    uWhite: 1,
    uSat: 1.08 - Math.abs(warm) * 0.12,
    uVig: 0.34 + Math.abs(warm) * 0.12,
  };
}

/* Called from renderFrame for every scene. Puts the dome on the camera, re-reads the sky colour,
   and swaps the grade in and out so only the arena is graded. */
function skyTick(sc, cam) {
  const g = (sc === scene && SKYD.grade) ? SKYD.grade : SKY_GRADE0;
  for (const k in SKY_GRADE0) { const un = MAT_OUT.uniforms[k]; if (un) un.value = g[k]; }
  if (!SKYD.mesh || sc !== scene) return;
  SKYD.mesh.position.copy(cam.position);
  const b = scene.background;
  if (b && b.isColor) {
    SKYD.u.uZenith.value.copy(b).multiplyScalar(0.62);
    SKYD.u.uHorizon.value.copy(b).lerp(SKY_WHITE, 0.3).multiplyScalar(1.2);
    SKYD.u.uGround.value.copy(b).multiplyScalar(0.3);
  }
}
const SKY_WHITE = new THREE.Color(0xffffff);
