'use strict';
/* Renderer, scenes, shared geometry and small helpers. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

const SKY = 0x27323c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 60, 180);
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 600);
scene.add(new THREE.HemisphereLight(0xd3e2ea, 0x2b2420, 0.78));
const sun = new THREE.DirectionalLight(0xfff0d8, 0.85);
sun.position.set(40, 90, 25);
scene.add(sun);

// Hangar / inventory preview scene
const buildScene = new THREE.Scene();
buildScene.background = new THREE.Color(0x141b21);
buildScene.add(new THREE.HemisphereLight(0xd3e2ea, 0x2b2420, 0.8));
const bsun = new THREE.DirectionalLight(0xfff0d8, 0.9); bsun.position.set(5, 10, 6); buildScene.add(bsun);
{
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.4, 8), SM(0x2a343d));
  ped.position.y = -0.2; buildScene.add(ped);
  const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.42, 8), SM(0x2f3a44));
  ped2.position.y = -0.17; buildScene.add(ped2);
  const grid = new THREE.GridHelper(80, 40, 0x24303a, 0x1c252d); grid.position.y = -0.4; buildScene.add(grid);
  // arrow on the pedestal showing which way the robot faces (+z is forward)
  const sh = new THREE.Shape();
  sh.moveTo(-0.22, 0); sh.lineTo(0.22, 0); sh.lineTo(0.22, 0.75); sh.lineTo(0.5, 0.75); sh.lineTo(0, 1.25); sh.lineTo(-0.5, 0.75); sh.lineTo(-0.22, 0.75); sh.lineTo(-0.22, 0);
  const ag = new THREE.ShapeGeometry(sh); ag.rotateX(Math.PI / 2); ag.rotateY(Math.PI);
  const arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  arrow.position.set(0, 0.07, 1.25); arrow.rotation.y = Math.PI; buildScene.add(arrow);
  buildScene.userData.arrow = arrow;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const ORANGE = 0xff7a1a;
const COL = { chassis: 0x4b5661, dark: 0x222a31, joint: 0x8c96a0, cyan: 0x58cfd6, shield: 0x6fa6ff, red: 0xe2465c, bone: 0xe4ddc8, amber: 0xf0a03c };
const geoBox = new THREE.BoxGeometry(1, 1, 1);
const geoBullet = new THREE.IcosahedronGeometry(0.16, 0);
const geoOrb = new THREE.IcosahedronGeometry(0.38, 0);
const geoShell = new THREE.IcosahedronGeometry(0.32, 0);
const geoGem = new THREE.OctahedronGeometry(0.3, 0);
const geoBlast = new THREE.IcosahedronGeometry(1, 1);
const geoRing = new THREE.RingGeometry(0.85, 1, 40); geoRing.rotateX(-Math.PI / 2);

const matCache = {}, basicCache = {};
/* Surface finish from the colour: bare greys are polished metal, dark parts are rubbery, coloured parts are painted. */
function surfaceOf(color) {
  const c = new THREE.Color(color), hsl = c.getHSL({}), lum = (c.r + c.g + c.b) / 3;
  if (lum < 0.17) return { roughness: 0.72, metalness: 0.35 };
  if (hsl.s < 0.2) return { roughness: 0.36, metalness: 0.7 };
  return { roughness: 0.42, metalness: 0.25 };
}
function SM(color, em, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, emissive: em || 0, envMapIntensity: 1 }, surfaceOf(color), extra || {})); }
function M(color, em) { const k = color + '_' + (em || 0); return matCache[k] || (matCache[k] = SM(color, em)); }
function B(color, opts) { const k = color + JSON.stringify(opts || {}); return basicCache[k] || (basicCache[k] = new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {}))); }
function isShared(mat) { return Object.values(matCache).includes(mat) || Object.values(basicCache).includes(mat); }
function bx(w, h, d, color, x = 0, y = 0, z = 0, em) { const m = new THREE.Mesh(geoBox, M(color, em)); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
