/* Chroma Tilt - 3D front end (Three.js) + game flow.
   Rules engine: js/engine.js (unchanged). Levels: js/levels.js (unchanged).
   Save format: same key as v2 so existing progress carries over. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import jss from 'jss';
import jssPreset from 'jss-preset-default';

/* ================= CONSTANTS ================= */
const E = window.ChromaEngine;
const LEVELS = window.CHROMA_LEVELS;
const WORLDS = ['Sunny Slope', 'Loose Marbles', 'Painted Halls', 'Crooked Corridors', 'Conveyor Coast',
  'Spinning Yards', 'Gatekeepers', 'Prism Peaks', 'Chromatic Caves', 'The Last Tilt', 'Glass Forest', 'Neon Harbor',
  'Mirror Lake', 'Velvet Vaults', 'Storm Ridge', 'Ember Mines', 'Frost Garden', 'Clockwork City', 'Aurora Bay', 'Infinity Tilt'];
const COLORS = ['#ff5d73', '#3ddcff', '#ffc83d'];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 up, 1 right, 2 down, 3 left
const DIR_NAMES = ['up', 'right', 'down', 'left'];
const STAR_COINS = [0, 2, 3, 5];
const STORE = [
  { id: 'hint1', kind: 'hint', n: 1, name: '1 Hint', desc: 'Shows the next best tilt on the board.', price: 15, ico: '💡', c1: '#ffc83d', c2: '#e0860b' },
  { id: 'hint5', kind: 'hint', n: 5, name: '5 Hints', desc: 'Five hints for the tough boards.', price: 60, ico: '✨', c1: '#ffd76a', c2: '#c97b00' },
  { id: 'skin_glass', kind: 'skin', skin: 'glass', name: 'Glass Marbles', desc: 'Translucent glass balls with bright rims.', price: 60, ico: '🔮', c1: '#8fe9ff', c2: '#2b6cb0' },
  { id: 'skin_gem', kind: 'skin', skin: 'gem', name: 'Gem Marbles', desc: 'Faceted gemstones that catch the light.', price: 90, ico: '💎', c1: '#c39bff', c2: '#5b2bb8' },
  { id: 'skin_candy', kind: 'skin', skin: 'candy', name: 'Candy Marbles', desc: 'Striped sweets in bold colours.', price: 120, ico: '🍬', c1: '#ffb3d1', c2: '#d1336f' },
  { id: 'aurora', kind: 'theme', theme: 'aurora', name: 'Aurora Theme', desc: 'Northern-lights background and aqua board.', price: 80, ico: '🌌', c1: '#5cffc8', c2: '#0b7a66' },
  { id: 'sunset', kind: 'theme', theme: 'sunset', name: 'Sunset Theme', desc: 'Warm dusk colours with a coral glow.', price: 80, ico: '🌅', c1: '#ff8a4c', c2: '#a3264b' },
];
const THEMES = {
  midnight: { bg: '#060912', plate: '#15203f', tileA: '#1d2a52', tileB: '#22325e', wallA: '#4a5a8a', accent: '#3ddcff' },
  aurora: { bg: '#030f0e', plate: '#0b2b28', tileA: '#11403a', tileB: '#15504a', wallA: '#2f7a6e', accent: '#5cffc8' },
  sunset: { bg: '#120713', plate: '#2a1224', tileA: '#3c1a33', tileB: '#4a2040', wallA: '#8a4a6e', accent: '#ff8a4c' },
};
const TUT = [
  { title: 'Tilt the board', text: 'Swipe any direction. Every marble rolls that way at once, until it hits a wall, the edge, or another marble.',
    lv: { w: 5, h: 3, walls: [9], marbles: [{ i: 5, c: 1 }], holes: [], arrows: [], gates: [], gateOpen: false }, moves: [1, 3] },
  { title: 'Marbles push each other', text: 'A blocked marble stops right behind the one in front. Plan the order of your tilts.',
    lv: { w: 5, h: 3, walls: [], marbles: [{ i: 0, c: 0 }, { i: 3, c: 1 }], holes: [], arrows: [], gates: [], gateOpen: false }, moves: [1] },
  { title: 'Match the colour', text: 'A marble only drops into the hole of its own colour. Other holes are safe to roll over.',
    lv: { w: 5, h: 3, walls: [], marbles: [{ i: 10, c: 0 }], holes: [{ i: 12, c: 1 }, { i: 14, c: 0 }], arrows: [], gates: [], gateOpen: false }, moves: [1] },
  { title: 'Arrows & gates', text: 'Arrows turn a marble. Purple gates flip after every swipe, so timing matters. Clear every marble to win!',
    lv: { w: 5, h: 3, walls: [], marbles: [{ i: 0, c: 0 }], holes: [], arrows: [{ i: 2, d: 2 }], gates: [], gateOpen: false }, moves: [1] },
];
const INTRO_MS = 6200;
const MR = 0.34;            // marble radius
const BASE_Y = 0.06 + MR;   // marble rests on tile top

/* ================= SAVE ================= */
const SAVE_KEY = 'chromatilt.v2';
let save = { stars: {}, best: {}, rewarded: {}, coins: 0, hints: 0, owned: { midnight: true, orb: true }, theme: 'midnight', skin: 'orb', sound: true, lastLevel: 1 };
try { save = Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* private mode: play without saving */ }
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
function isUnlocked(id) { return id >= 1 && id <= LEVELS.length; }
function highestUnlocked() { let h = 1; while (h < LEVELS.length && save.stars[h]) h++; return Math.min(h, LEVELS.length); }


/* ================= SOUND (WebAudio, no files) ================= */
let actx = null, tapCtx = null;
function beep(f, d, type, v) {
  if (!save.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.value = v || 0.07; g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
  } catch (e) { /* audio unavailable */ }
}
const sfxRoll = () => beep(170 + Math.random() * 40, 0.07, 'triangle', 0.04);
const sfxDock = c => beep(560 + c * 160, 0.28, 'sine', 0.09);
const sfxCoin = () => beep(980, 0.12, 'square', 0.04);
const sfxWin = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.35, 'sine', 0.09), i * 120));
const sfxNo = () => beep(180, 0.2, 'sawtooth', 0.05);
function tapSfx() { // always on for UI taps
  try {
    tapCtx = tapCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (tapCtx.state === 'suspended') tapCtx.resume();
    const t = tapCtx.currentTime, o = tapCtx.createOscillator(), g = tapCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(980, t); o.frequency.exponentialRampToValueAtTime(460, t + 0.06);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(tapCtx.destination); o.start(t); o.stop(t + 0.1);
  } catch (e) { /* ignore */ }
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('button, .tile, .item, .game-modal')) tapSfx();
}, true);

/* ================= JSS: component styles built from design tokens ================= */
jss.setup(jssPreset());
const ui = jss.createStyleSheet({
  tile: {
    position: 'relative', aspectRatio: '1 / 1', minHeight: 44, borderRadius: 12,
    border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)',
    color: '#eef3ff', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 17,
    cursor: 'pointer', padding: 0,
    transition: 'transform .2s ease, background .2s ease, border-color .2s ease',
    '&:hover': { transform: 'scale(1.06)', background: 'rgba(61,220,255,.16)', borderColor: '#3ddcff' },
    '&:active': { transform: 'scale(.96)' },
    '&:focus-visible': { outline: '2px solid #3ddcff', outlineOffset: 2 },
  },
  tileDone: { borderColor: '#ffc83d', background: 'rgba(255,200,61,.12)' },
  tileLocked: {
    opacity: 0.32, cursor: 'not-allowed',
    '&:hover': { transform: 'none', background: 'rgba(255,255,255,.05)', borderColor: 'rgba(255,255,255,.14)' },
  },
  tileStars: { position: 'absolute', left: 0, right: 0, bottom: 3, textAlign: 'center', fontSize: 9, color: '#ffc83d', letterSpacing: 1 },
  item: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', marginBottom: 10,
    borderRadius: 18, background: 'rgba(14,22,44,.62)', border: '1px solid rgba(255,255,255,.12)',
    backdropFilter: 'blur(10px)', animation: 'rise .5s cubic-bezier(.22,1,.36,1) both',
  },
  itemIco: {
    flex: '0 0 52px', width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 26,
    boxShadow: '0 6px 18px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.35)',
  },
  itemTxt: {
    flex: '1 1 auto', minWidth: 0,
    '& b': { display: 'block', fontFamily: 'Audiowide, sans-serif', fontWeight: 400, fontSize: 15, color: '#eef3ff' },
    '& small': { display: 'block', color: '#93a0c8', fontSize: 14, lineHeight: 1.3 },
  },
  buy: {
    flex: '0 0 auto', minWidth: 92, height: 40, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
    fontFamily: 'Audiowide, sans-serif', fontSize: 13, color: '#140a10',
    background: 'linear-gradient(135deg,#ffd76a,#ffb13d)', boxShadow: '0 6px 16px rgba(255,180,60,.25)',
    transition: 'transform .15s, filter .2s',
    '&:hover': { filter: 'brightness(1.08)' },
    '&:active': { transform: 'scale(.97)' },
    '&:focus-visible': { outline: '2px solid #3ddcff', outlineOffset: 2 },
  },
  buyOwned: { background: 'rgba(255,255,255,.12)', color: '#eef3ff', border: '1px solid rgba(255,255,255,.2)', boxShadow: 'none' },
  shake: { animation: 'shake .4s' },
}).attach();
const CL = ui.classes;

/* ================= THREE.JS STAGE ================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(THEMES.midnight.bg);
scene.fog = new THREE.Fog(new THREE.Color(THEMES.midnight.bg), 16, 40);
// Procedural studio reflections (no HDR file needed, works offline)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
}

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 150);
const camCtl = { mode: 'ambient', dist: 11, yaw: 0, parX: 0, parY: 0 };

// Lights
scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x0a0d1c, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(4, 10, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
key.shadow.bias = -0.0008;
key.shadow.normalBias = 0.02;
scene.add(key);
const rimLight = new THREE.PointLight(0x3ddcff, 22, 34, 2); rimLight.position.set(-6, 5, -5); scene.add(rimLight);
const warmLight = new THREE.PointLight(0xff5d73, 14, 30, 2); warmLight.position.set(6, 4, -4); scene.add(warmLight);

// Starfield (always on)
const stars = (() => {
  const n = 1600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40, s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(t); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(t);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9d6ff, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true }));
  scene.add(p); return p;
})();

// Post-processing: soft neon bloom
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---- shared geometry & materials ---- */
const GEO = {
  tile: new RoundedBoxGeometry(0.9, 0.12, 0.9, 3, 0.1),
  wall: new RoundedBoxGeometry(0.92, 0.7, 0.92, 4, 0.16),
  gate: new RoundedBoxGeometry(0.78, 0.5, 0.78, 3, 0.12),
  disc: new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40),
  ring: new THREE.TorusGeometry(0.3, 0.045, 16, 56).rotateX(Math.PI / 2),
  arrow: new THREE.ConeGeometry(0.16, 0.42, 20).rotateZ(-Math.PI / 2),
  sphere: new THREE.SphereGeometry(MR, 40, 28),
  gem: new THREE.IcosahedronGeometry(MR * 1.08, 1),
  shock: new THREE.RingGeometry(0.3, 0.36, 48).rotateX(-Math.PI / 2),
  ambient: new THREE.IcosahedronGeometry(1.15, 1),
};
const HOLE_RING_MATS = COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.3 }));
const MAT = {
  disc: new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.6 }),
  arrow: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 }),
  gate: new THREE.MeshStandardMaterial({ color: 0x9b7bff, emissive: 0x9b7bff, emissiveIntensity: 0.7, roughness: 0.3, transparent: true, opacity: 0.95 }),
  hint: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe9ff, emissiveIntensity: 1.3, transparent: true, opacity: 0.95 }),
};
const marbleMatCache = new Map();
function candyTexture(c) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = COLORS[c];
  for (let k = -2; k < 10; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64 + 32, 0); x.lineTo(k * 64 + 288, 256); x.lineTo(k * 64 + 256, 256); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function marbleMat(c, skin) {
  const key = skin + c;
  if (marbleMatCache.has(key)) return marbleMatCache.get(key);
  const col = new THREE.Color(COLORS[c]); let m;
  if (skin === 'glass') m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.04, transparent: true, opacity: 0.76, clearcoat: 1, clearcoatRoughness: 0, emissive: col, emissiveIntensity: 0.25, ior: 1.45, specularIntensity: 1 });
  else if (skin === 'gem') m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.12, metalness: 0.2, flatShading: true, clearcoat: 1, emissive: col, emissiveIntensity: 0.18 });
  else if (skin === 'candy') m = new THREE.MeshPhysicalMaterial({ map: candyTexture(c), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  else m = new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.42, roughness: 0.16, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 });
  marbleMatCache.set(key, m);
  return m;
}
const currentSkin = () => save.skin || 'orb';
const marbleGeo = () => (currentSkin() === 'gem' ? GEO.gem : GEO.sphere);

/* ---- camera helpers ---- */
function fitDist(W, H) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const pad = 1.3;
  const need = Math.max(((W + pad) / 2) / (t * camera.aspect), ((H + pad) / 2) / t);
  return need * 1.08 + 0.5;
}

/* ================= BOARD VIEW (one per on-screen board) ================= */
class BoardView {
  constructor() {
    this.root = new THREE.Group();           // visibility + stage position (never tilts)
    this.tilt = new THREE.Group();           // whole board tilts on swipe
    this.root.add(this.tilt);
    this.root.visible = false;
    scene.add(this.root);
    this.mat = {
      plate: new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 }),
      tile: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 }),
    };
    this.hintMesh = new THREE.Mesh(GEO.arrow, MAT.hint);
    this.hintMesh.scale.setScalar(2.2); this.hintMesh.position.set(0, 2.3, 0);
    this.hintMesh.visible = false; this.root.add(this.hintMesh);
    this.level = null; this.W = 0; this.H = 0;
    this.objs = []; this.ownGeo = []; this.marbles = []; this.gates = []; this.fx = [];
    this.tiles = null; this.walls = null;
    this.anim = null; this.busyUntil = 0; this.tiltDir = null; this.tiltT = 0;
    this.hintUntil = 0;
  }
  pos(i) { return new THREE.Vector3((i % this.W) - (this.W - 1) / 2, 0, ((i / this.W) | 0) - (this.H - 1) / 2); }
  add(o) { this.tilt.add(o); this.objs.push(o); return o; }
  clear() {
    this.marbles.forEach(m => this.tilt.remove(m));
    this.marbles = [];
    this.objs.forEach(o => { this.tilt.remove(o); if (o.dispose) o.dispose(); });
    this.objs = [];
    this.fx.forEach(f => { this.tilt.remove(f.obj); f.obj.material.dispose(); if (f.own) f.obj.geometry.dispose(); });
    this.fx = [];
    this.ownGeo.forEach(g => g.dispose()); this.ownGeo = [];
    this.gates = []; this.tiles = null; this.walls = null;
    this.anim = null; this.hintUntil = 0; this.hintMesh.visible = false;
  }
  setLevel(level) {
    this.clear();
    this.level = level; this.g = E.parse(level); this.state = E.initial(level);
    this.W = level.w; this.H = level.h;
    this.busyUntil = 0; this.tilt.rotation.set(0, 0, 0); this.tiltDir = null;
    const W = this.W, H = this.H, g = this.g;

    // Glass plate under the board
    const plateGeo = new RoundedBoxGeometry(W + 0.7, 0.34, H + 0.7, 5, 0.26);
    this.ownGeo.push(plateGeo);
    const plate = new THREE.Mesh(plateGeo, this.mat.plate);
    plate.position.y = -0.2; plate.receiveShadow = true;
    this.add(plate);

    // Tiles (instanced)
    const tileCells = []; const wallCells = [];
    for (let i = 0; i < W * H; i++) (g.wall[i] ? wallCells : tileCells).push(i);
    const m4 = new THREE.Matrix4();
    this.tiles = new THREE.InstancedMesh(GEO.tile, this.mat.tile, tileCells.length);
    this.tiles.receiveShadow = true; this.tiles.userData.cells = tileCells;
    tileCells.forEach((cell, n) => { const p = this.pos(cell); m4.makeTranslation(p.x, 0, p.z); this.tiles.setMatrixAt(n, m4); });
    this.add(this.tiles);

    // Walls (instanced, tall and cast shadows)
    this.walls = new THREE.InstancedMesh(GEO.wall, this.mat.wall, Math.max(1, wallCells.length));
    this.walls.castShadow = true; this.walls.receiveShadow = true; this.walls.userData.cells = wallCells;
    wallCells.forEach((cell, n) => { const p = this.pos(cell); m4.makeTranslation(p.x, 0.41, p.z); this.walls.setMatrixAt(n, m4); });
    this.walls.count = wallCells.length;
    this.add(this.walls);
    this.paint();

    // Holes: dark well + glowing coloured rim
    for (let i = 0; i < W * H; i++) {
      if (g.hole[i] < 0) continue;
      const p = this.pos(i), c = g.hole[i];
      const disc = new THREE.Mesh(GEO.disc, MAT.disc); disc.position.set(p.x, 0.065, p.z);
      const ring = new THREE.Mesh(GEO.ring, HOLE_RING_MATS[c]); ring.position.set(p.x, 0.1, p.z);
      this.add(disc); this.add(ring);
    }
    // Conveyor arrows (lying on the tile, pointing the way)
    for (let i = 0; i < W * H; i++) {
      if (g.arrow[i] < 0) continue;
      const p = this.pos(i), [dx, dy] = DIRS[g.arrow[i]];
      const a = new THREE.Mesh(GEO.arrow, MAT.arrow);
      a.position.set(p.x, 0.22, p.z); a.rotation.y = Math.atan2(-dy, dx);
      this.add(a);
    }
    // Gates (purple; they shrink when open)
    for (let i = 0; i < W * H; i++) {
      if (!g.gate[i]) continue;
      const p = this.pos(i);
      const gm = new THREE.Mesh(GEO.gate, MAT.gate); gm.position.set(p.x, 0.31, p.z); gm.castShadow = true;
      this.add(gm);
      this.gates.push({ mesh: gm, s: this.state.go ? 0.12 : 1 });
    }
    this.makeMarbles();
  }
  // Colour the tiles and walls from the active theme
  paint() {
    if (!this.level) return;
    const T = THEMES[save.theme] || THEMES.midnight, W = this.W;
    this.mat.plate.color.set(T.plate);
    const ca = new THREE.Color(T.tileA), cb = new THREE.Color(T.tileB), cw = new THREE.Color(T.wallA);
    this.tiles.userData.cells.forEach((cell, n) => {
      const x = cell % W, y = (cell / W) | 0;
      this.tiles.setColorAt(n, ((x + y) % 2) ? cb : ca);
    });
    this.tiles.instanceColor.needsUpdate = true;
    if (this.walls.userData.cells.length) {
      this.walls.userData.cells.forEach((_, n) => this.walls.setColorAt(n, cw));
      this.walls.instanceColor.needsUpdate = true;
    }
  }
  makeMarbles() {
    this.marbles.forEach(m => this.tilt.remove(m));
    this.marbles = this.state.ms.map(m => {
      const mesh = new THREE.Mesh(marbleGeo(), marbleMat(m.c, currentSkin()));
      mesh.castShadow = true;
      const p = this.pos(m.p >= 0 ? m.p : 0);
      mesh.position.set(p.x, BASE_Y, p.z);
      this.tilt.add(mesh);
      return mesh;
    });
  }
  busy(now) { return now < this.busyUntil; }
  reset(state) {
    this.state = state; this.anim = null; this.busyUntil = 0;
    this.makeMarbles(); this.hideHint();
    this.gates.forEach(gt => { gt.s = this.state.go ? 0.12 : 1; });
  }
  // Apply one swipe. Returns null if the swipe changes nothing.
  step(d, now) {
    const ns = E.move(this.g, this.state, d);
    if (E.key(ns) === E.key(this.state)) return null;
    let dur = 0;
    const items = ns.ms.map(m => {
      if (!m.trail || m.trail.length < 2) return null;
      const dd = Math.max(180, (m.trail.length - 1) * 95);
      dur = Math.max(dur, dd);
      return { trail: m.trail.map(i => this.pos(i)), dur: dd, fell: m.fell, c: m.c, spawned: false };
    });
    this.anim = { t0: now, items, dur };
    this.busyUntil = now + dur + 60;
    this.state = ns;
    this.tiltStart(d);
    return { dur, fellColors: ns.ms.filter(m => m.fell).map(m => m.c), moved: items.some(Boolean) };
  }
  tiltStart(d) { this.tiltDir = d; this.tiltT = 0; }
  showHint(d, until) {
    this.hintMesh.rotation.y = Math.atan2(-DIRS[d][1], DIRS[d][0]);
    this.hintMesh.visible = true; this.hintUntil = until;
  }
  hideHint() { this.hintMesh.visible = false; this.hintUntil = 0; }
  spawnDock(p, hex) {
    const col = new THREE.Color(hex);
    // shock ring
    const rm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(GEO.shock, rm); ring.position.set(p.x, 0.12, p.z);
    this.tilt.add(ring);
    this.fx.push({ obj: ring, t0: performance.now(), dur: 480, own: false, update: q => { ring.scale.setScalar(1 + q * 2.6); rm.opacity = 1 - q; } });
    // sparks
    const n = 22, sp = new Float32Array(n * 3), vel = [];
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.2; vel.push([Math.cos(a) * s, 1.5 + Math.random() * 2.5, Math.sin(a) * s]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const pm = new THREE.PointsMaterial({ color: col, size: 0.13, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(geo, pm); pts.position.set(p.x, 0.25, p.z);

    this.tilt.add(pts);
    this.fx.push({
      obj: pts, t0: performance.now(), dur: 700, own: true, update: q => {
        pm.opacity = 1 - q;
        for (let k = 0; k < n; k++) { const v = vel[k]; sp[k * 3] = v[0] * q; sp[k * 3 + 1] = v[1] * q - 4 * q * q; sp[k * 3 + 2] = v[2] * q; }
        geo.attributes.position.needsUpdate = true;
      }
    });
  }
  update(now, dt) {
    if (!this.level || !this.root.visible) return;
    // Tilt: quick lean, then a damped wobble back to flat
    if (this.tiltDir !== null) {
      this.tiltT += dt;
      const T = this.tiltT, amt = 0.085;
      const a = T < 0.12 ? T / 0.12 : Math.cos((T - 0.12) * 15) * Math.exp(-(T - 0.12) * 7);
      const d = this.tiltDir;
      this.tilt.rotation.x = d === 0 ? -amt * a : d === 2 ? amt * a : 0;
      this.tilt.rotation.z = d === 1 ? -amt * a : d === 3 ? amt * a : 0;
      if (T > 1.2) { this.tiltDir = null; this.tilt.rotation.set(0, 0, 0); }
    }
    // Marbles: roll along the engine's trail, then drop into holes
    const a = this.anim, t = a ? now - a.t0 : 0;
    this.state.ms.forEach((m, k) => {
      const mesh = this.marbles[k]; if (!mesh) return;
      const it = a && a.items[k];
      if (it && t < it.dur) {
        const n = it.trail.length - 1, f = Math.max(0, (t / it.dur) * n), i0 = Math.max(0, Math.min(n - 1, Math.floor(f))), fr = Math.min(1, f - i0);
        const A = it.trail[i0], B = it.trail[i0 + 1];
        const prev = mesh.position.clone();
        mesh.position.lerpVectors(A, B, fr); mesh.position.y = BASE_Y;
        mesh.visible = true;
        const v = mesh.position.clone().sub(prev), s = Math.hypot(v.x, v.z);
        if (s > 1e-5) mesh.rotateOnWorldAxis(new THREE.Vector3(v.z, 0, -v.x).normalize(), s / MR); // rolling, not sliding
        const sc = it.fell && it.dur - t < 200 ? Math.max(0.001, (it.dur - t) / 200) : 1;
        mesh.scale.setScalar(sc);
      } else if (m.p >= 0) {
        const P = this.pos(m.p); mesh.position.set(P.x, BASE_Y, P.z);
        mesh.visible = true; mesh.scale.setScalar(1);
      } else mesh.visible = false;
    });
    if (a) a.items.forEach(it => {
      if (it && it.fell && t >= it.dur && !it.spawned) { it.spawned = true; this.spawnDock(it.trail[it.trail.length - 1], COLORS[it.c]); }
    });
    // Gates
    this.gates.forEach(gt => {
      const target = this.state.go ? 0.12 : 1;
      gt.s += (target - gt.s) * Math.min(1, dt * 10);
      gt.mesh.scale.y = gt.s; gt.mesh.position.y = 0.06 + 0.25 * gt.s;
    });
    // Effects
    this.fx = this.fx.filter(f => {
      const q = (now - f.t0) / f.dur;
      if (q >= 1) { this.tilt.remove(f.obj); f.obj.material.dispose(); if (f.own) f.obj.geometry.dispose(); return false; }
      f.update(Math.max(0, q)); return true;
    });
    // Hint
    if (this.hintMesh.visible) {
      this.hintMesh.position.y = 2.3 + Math.sin(now / 260) * 0.14;
      if (now > this.hintUntil) this.hideHint();
    }
  }
}
const boardView = new BoardView();
const demoView = new BoardView();

/* ---- marble skins: refresh every visible marble when the skin changes ---- */
function refreshSkins() {
  boardView.makeMarbles();
  demoView.makeMarbles();
  ambientRing.forEach(a => { a.mesh.geometry = marbleGeo(); a.mesh.material = marbleMat(a.c, currentSkin()); });
}

/* ================= AMBIENT MENU SCENE ================= */
const ambient = new THREE.Group(); scene.add(ambient);
const ambientRing = [];
for (let i = 0; i < 15; i++) {
  const c = i % 3;
  const mesh = new THREE.Mesh(marbleGeo(), marbleMat(c, currentSkin()));
  mesh.castShadow = true;
  ambient.add(mesh);
  ambientRing.push({
    mesh, c,
    r: 2.6 + (i % 4) * 0.8, a0: i * 2.399, speed: 0.1 + (i % 3) * 0.05,
    y0: ((i % 5) - 2) * 0.42,
    start: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 22),
  });
}
const ambientGem = new THREE.Mesh(GEO.ambient, new THREE.MeshBasicMaterial({ color: 0x3ddcff, wireframe: true, transparent: true, opacity: 0.18 }));
ambient.add(ambientGem);
const ambientPlate = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.02, 8, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3ddcff, transparent: true, opacity: 0.25 }));
ambient.add(ambientPlate);
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
let introT0 = performance.now();
function updateAmbient(now, dt, t) {
  const p = ease((now - introT0) / 2600);
  ambientRing.forEach((a, i) => {
    const ang = a.a0 + t * a.speed;
    const target = new THREE.Vector3(Math.cos(ang) * a.r, a.y0 + Math.sin(t * 0.8 + i) * 0.3, Math.sin(ang) * a.r);
    a.mesh.position.lerpVectors(a.start, target, p);
    a.mesh.rotation.y += dt * 0.6;
  });
  ambientGem.rotation.y = t * 0.15; ambientGem.rotation.x = t * 0.08;
}

/* ================= CAMERA ================= */
const camTarget = new THREE.Vector3();
const pointer = { x: 0, y: 0 };
function updateCamera(dt, t) {
  let want;
  if (camCtl.mode === 'ambient') {
    camCtl.yaw += dt * 0.1;
    want = new THREE.Vector3(Math.sin(camCtl.yaw) * 11, 5.2, Math.cos(camCtl.yaw) * 11);
    camTarget.set(0, 0.3, 0);
  } else {
    const d = camCtl.dist;
    camCtl.parX += ((pointer.x * 0.9) - camCtl.parX) * Math.min(1, dt * 4);
    camCtl.parY += ((pointer.y * 0.5) - camCtl.parY) * Math.min(1, dt * 4);
    want = new THREE.Vector3(camCtl.parX, d * 0.8 + camCtl.parY, d * 0.58);
    camTarget.set(0, 0, 0);
  }
  camera.position.lerp(want, Math.min(1, dt * 5));
  camera.lookAt(camTarget);
}

/* ================= CONFETTI (3D points) ================= */
const CONF_MAX = 240;
const confPos = new Float32Array(CONF_MAX * 3), confCol = new Float32Array(CONF_MAX * 3), confVel = new Float32Array(CONF_MAX * 3), confLife = new Float32Array(CONF_MAX);
let confCount = 0;
const confGeo = new THREE.BufferGeometry();
confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
confGeo.setDrawRange(0, 0);
const confPts = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
scene.add(confPts);
const CONF_PALETTE = [...COLORS, '#ffffff', '#9b7bff'].map(h => new THREE.Color(h));
function burst3D(x, y, z, n) {
  for (let k = 0; k < n && confCount < CONF_MAX; k++) {
    const i = confCount++;
    confPos.set([x, y, z], i * 3);
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    confVel.set([Math.cos(a) * s * 0.7, 3 + Math.random() * 5, Math.sin(a) * s * 0.7], i * 3);
    const c = CONF_PALETTE[k % CONF_PALETTE.length];
    confCol.set([c.r, c.g, c.b], i * 3);
    confLife[i] = 1;
  }
}
function updateConfetti(dt) {
  let i = 0;
  while (i < confCount) {
    confLife[i] -= dt * 0.45;
    if (confLife[i] <= 0) {
      confCount--;
      const j = confCount;
      confPos.copyWithin(i * 3, j * 3, j * 3 + 3); confVel.copyWithin(i * 3, j * 3, j * 3 + 3);
      confCol.copyWithin(i * 3, j * 3, j * 3 + 3); confLife[i] = confLife[j];
      continue;
    }
    confVel[i * 3 + 1] -= 9 * dt;
    for (let k = 0; k < 3; k++) confPos[i * 3 + k] += confVel[i * 3 + k] * dt;
    i++;
  }
  confGeo.setDrawRange(0, confCount);
  confGeo.attributes.position.needsUpdate = true;
  confGeo.attributes.color.needsUpdate = true;
}

/* ================= THEME ================= */
function applyTheme() {
  const T = THEMES[save.theme] || THEMES.midnight;
  document.body.dataset.theme = save.theme || 'midnight';
  scene.background.set(T.bg);
  scene.fog.color.set(T.bg);
  boardView.paint(); demoView.paint();
  rimLight.color.set(T.accent);
}

/* ================= SCENE MODE ================= */
function syncScene() {
  const boardOn = current === 'game', demoOn = current === 'tutorial';
  boardView.root.visible = boardOn;
  demoView.root.visible = demoOn;
  ambient.visible = !boardOn && !demoOn;
  camCtl.mode = (boardOn || demoOn) ? 'board' : 'ambient';
  if (boardOn && boardView.level) camCtl.dist = fitDist(boardView.W, boardView.H);
  if (demoOn && demoView.level) camCtl.dist = fitDist(demoView.W, demoView.H);
}

/* ================= SCREENS / UI ================= */
const $ = id => document.getElementById(id);
let current = 'intro';
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  current = id;
  if (id !== 'tutorial') stopDemo();
  syncScene();
  if (id === 'levels') buildLevelList();
  if (id === 'store') buildStore();
  if (id === 'tutorial') showTutorial(0);
  if (id === 'menu') { updateCoins(); updatePlayLabel(); }
  if (id === 'game') { updateCoins(); }
}
let toastT = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000);
}
function updateCoins() {
  document.querySelectorAll('.coinsTxt').forEach(e => e.textContent = save.coins);
  $('coinsMenu').textContent = save.coins;
}
function bumpCoins() { document.querySelectorAll('.pill').forEach(p => { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }); }
function updatePlayLabel() { $('btnPlay').textContent = 'CONTINUE · LEVEL ' + resumeTarget(); }

/* ================= GAME ================= */
let levelId = 1, history = [], winPending = false, queued = [], hintDir = null;
const packS = s => ({ p: s.ms.map(m => m.p), go: !!s.go });
const unpackS = (lv, o) => ({ ms: lv.marbles.map((m, k) => ({ p: o.p[k], c: m.c })), go: !!o.go });
function persistRun() {
  if (current !== 'game' || winPending || !boardView.state) return;
  save.run = { id: levelId, cur: packS(boardView.state), hist: history.map(packS) };
  writeSave();
}
function resumeTarget() { return Math.min(Math.max(1, save.lastLevel || 1), highestUnlocked()); }
function startLevel(id) {
  if (!isUnlocked(id)) { sfxNo(); toast('Solve the previous level first'); return; }
  levelId = id; const lv = LEVELS[id - 1];
  boardView.setLevel(lv); history = []; winPending = false; queued = []; hintDir = null;
  if (save.run && save.run.id === id) {
    try { boardView.reset(unpackS(lv, save.run.cur)); history = save.run.hist.map(o => unpackS(lv, o)); }
    catch (e) { boardView.reset(E.initial(lv)); history = []; }
  }
  $('gLevel').textContent = id; $('gPar').textContent = lv.par; $('gMoves').textContent = history.length; $('hintCount').textContent = save.hints;
  $('winOv').classList.remove('on');
  save.lastLevel = id; writeSave();
  show('game');
}
function attemptMove(d) {
  if (current !== 'game' || winPending) return;
  const now = performance.now();
  if (boardView.busy(now)) { if (queued.length < 4) queued.push(d); return; }
  const prev = boardView.state;
  const r = boardView.step(d, now);
  if (!r) return;                       // blocked swipe: nothing happens, nothing recorded
  history.push(prev);
  hintDir = null; boardView.hideHint();
  $('gMoves').textContent = history.length;
  if (r.moved) { sfxRoll(); }
  r.fellColors.forEach(c => setTimeout(() => sfxDock(c), 60));
  if (E.isSolved(boardView.state.ms)) { winPending = true; setTimeout(winLevel, r.dur + 280); }
  else persistRun();
}
function undo() {
  if (current !== 'game' || boardView.busy(performance.now()) || winPending || !history.length) return;
  boardView.reset(history.pop()); $('gMoves').textContent = history.length; hintDir = null;
  persistRun();
}
function restart() {
  if (current !== 'game') return;
  queued = []; boardView.reset(E.initial(LEVELS[levelId - 1])); history = []; winPending = false;
  save.run = null; writeSave();
  $('gMoves').textContent = 0; $('winOv').classList.remove('on'); hintDir = null;
}
function useHint() {
  if (current !== 'game' || winPending || boardView.busy(performance.now())) return;
  if (save.hints <= 0) { sfxNo(); toast('No hints left. Buy some in the Store'); return; }
  const s = E.solve(LEVELS[levelId - 1], 150000, boardView.state);
  if (!s || !s.path.length) { toast('No hint for this position, try Reset'); return; }
  save.hints--; writeSave(); $('hintCount').textContent = save.hints; sfxCoin();
  hintDir = s.path[0];
  boardView.showHint(hintDir, performance.now() + 3500);
  toast('Hint: swipe ' + DIR_NAMES[hintDir]);
}
const starsFor = (m, par) => (m <= par ? 3 : (m <= par + 2 ? 2 : 1));
function flyCoins(n) {
  const pill = document.querySelector('#game .pill, #menu .pill, #levels .pill, #store .pill') || $('coinPillMenu');
  const target = pill.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const f = document.createElement('div'); f.className = 'flycoin';
    f.style.left = (innerWidth / 2 - 8) + 'px'; f.style.top = (innerHeight * 0.45 - 8) + 'px';
    document.body.appendChild(f);
    setTimeout(() => { f.style.left = (target.right - 20) + 'px'; f.style.top = (target.top + target.height / 2 - 8) + 'px'; f.style.opacity = 0.2; f.style.transform = 'scale(.6)'; }, 60 + i * 110);
    setTimeout(() => { f.remove(); sfxCoin(); }, 900 + i * 110);
  }
}
function winLevel() {
  const lv = LEVELS[levelId - 1], m = history.length, st = starsFor(m, lv.par);
  save.run = null;
  if (st > (save.stars[levelId] || 0)) save.stars[levelId] = st;
  if (!save.best[levelId] || m < save.best[levelId]) save.best[levelId] = m;
  let earned = 0; const bonus = [];
  if (!save.rewarded[levelId]) {
    save.rewarded[levelId] = true; earned = STAR_COINS[st];
    if (levelId % 5 === 0) { save.hints += 1; bonus.push('+1 free hint'); }
    if (levelId % 10 === 0) { earned += 20; bonus.push('+20 milestone coins'); }
    if (levelId % 50 === 0) { earned += 100; bonus.push('+100 world bonus'); }
    save.coins += earned;
  }
  writeSave(); sfxWin();
  $('winTitle').textContent = m <= lv.par ? 'Perfect tilt!' : 'Solved!';
  $('winStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= st ? '' : 'off'}">★</span>`).join('');
  $('winText').textContent = `Solved in ${m} moves · par ${lv.par}`;
  $('earnLine').style.display = earned ? '' : 'none';
  $('earnLine').innerHTML = `<span class="coin"></span>+${earned} coins${bonus.length ? `<br><small style="font-size:12px;opacity:.85">${bonus.join(' · ')}</small>` : ''}`;
  $('btnNext').style.display = levelId < LEVELS.length ? '' : 'none';
  const nxt = levelId + 1;
  $('btnNext').textContent = 'NEXT LEVEL';
  $('winOv').classList.add('on');
  burst3D(0, 2.5, 0, 120);
  if (earned) { flyCoins(Math.min(earned, 12)); setTimeout(() => { updateCoins(); bumpCoins(); }, 1000); }
  else updateCoins();
}

/* ================= INPUT ================= */
let pd = null;
addEventListener('pointerdown', e => {
  if (current !== 'game' || (e.target.closest && e.target.closest('button, .overlay, .game-modal'))) return;
  pd = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', e => {
  if (!pd) return;
  const dx = e.clientX - pd.x, dy = e.clientY - pd.y; pd = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  if (Math.abs(dx) > Math.abs(dy)) attemptMove(dx > 0 ? 1 : 3); else attemptMove(dy > 0 ? 2 : 0);
});
addEventListener('pointercancel', () => { pd = null; });
addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth - 0.5) * 2;
  pointer.y = (e.clientY / innerHeight - 0.5) * 2;
});
const KEYS = { ArrowUp: 0, w: 0, W: 0, ArrowRight: 1, d: 1, D: 1, ArrowDown: 2, s: 2, S: 2, ArrowLeft: 3, a: 3, A: 3 };
// Share button
$('btnShare').onclick = async () => {
  const data = { title: 'Chroma Tilt', text: `${$('winTitle').textContent} ${$('winText').textContent} on Chroma Tilt. Can you beat it?` };
  try { if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(data.text); toast('Copied to clipboard'); } catch (e) { /* cancelled */ }
};

addEventListener('keydown', e => {
  if (KEYS[e.key] !== undefined && current === 'game') { e.preventDefault(); attemptMove(KEYS[e.key]); }
  if ((e.key === 'z' || e.key === 'Backspace') && current === 'game') undo();
  if (e.key === 'h' && current === 'game') useHint();
  if (e.key === 'Escape' && current === 'game') show('menu');
});

/* ================= LEVELS / STORE ================= */
function buildLevelList() {
  const box = $('levelList'); box.innerHTML = '';
  for (let w = 0; w < 20; w++) {
    const col = document.createElement('div'); col.className = 'col-12 col-lg-6';
    const card = document.createElement('section'); card.className = 'glass world-card';
    const done = [...Array(50)].filter((_, i) => save.stars[w * 50 + i + 1]).length;
    card.innerHTML = `<div class="world-head"><h3>${WORLDS[w]}</h3><span>${done}/50</span></div>`;
    const grid = document.createElement('div'); grid.className = 'tile-grid';
    for (let i = 1; i <= 50; i++) {
      const id = w * 50 + i, b = document.createElement('button');
      b.type = 'button'; b.className = CL.tile; b.setAttribute('aria-label', `Level ${id}`);
      b.style.animation = `fadeUp .4s ease ${i * 8}ms both`;
      b.textContent = id;
      if (save.stars[id]) { b.classList.add(CL.tileDone); b.insertAdjacentHTML('beforeend', `<span class="${CL.tileStars}">${'★'.repeat(save.stars[id])}</span>`); }
      b.onclick = () => startLevel(id);
      grid.appendChild(b);
    }
    card.appendChild(grid); col.appendChild(card); box.appendChild(col);
  }
}
function isOwned(key) { return key === 'midnight' || key === 'orb' || !!save.owned[key]; }
function buildStore() {
  const box = $('storeList'); box.innerHTML = '';
  STORE.forEach((it, i) => {
    const key = it.kind === 'theme' ? it.theme : it.kind === 'skin' ? it.id : null;
    const owned = key ? isOwned(key) : false;
    const equipped = (it.kind === 'theme' && save.theme === it.theme) || (it.kind === 'skin' && save.skin === it.skin);
    const row = document.createElement('div');
    row.className = CL.item; row.style.animationDelay = (i * 70 + 120) + 'ms';
    const label = key ? (owned ? (equipped ? 'EQUIPPED' : 'EQUIP') : `💰 ${it.price}`) : `💰 ${it.price}`;
    row.innerHTML = `<div class="${CL.itemIco}" style="background:linear-gradient(145deg,${it.c1},${it.c2})">${it.ico}</div>
      <div class="${CL.itemTxt}"><b>${it.name}</b><small>${it.desc}${it.kind === 'hint' ? ` You have <b style="display:inline;font-family:Rajdhani,sans-serif;font-size:14px;color:#ffc83d">${save.hints}</b>.` : ''}</small></div>
      <button class="${CL.buy} ${key && owned ? CL.buyOwned : ''}">${label}</button>`;
    row.querySelector('button').onclick = () => buyItem(it, row);
    box.appendChild(row);
  });
}
function buyItem(it, row) {
  const key = it.kind === 'theme' ? it.theme : it.kind === 'skin' ? it.id : null;
  const failShake = () => { row.classList.remove(CL.shake); void row.offsetWidth; row.classList.add(CL.shake); sfxNo(); toast('Not enough coins. Clear more levels!'); };
  if (key && isOwned(key)) {
    if (it.kind === 'theme') { save.theme = it.theme; applyTheme(); }
    else { save.skin = it.skin; refreshSkins(); }
    writeSave(); buildStore(); toast(it.name + ' equipped'); return;
  }
  if (save.coins < it.price) return failShake();
  save.coins -= it.price;
  if (key) {
    save.owned[key] = true;
    if (it.kind === 'theme') { save.theme = it.theme; applyTheme(); }
    else { save.skin = it.skin; refreshSkins(); }
  } else save.hints += it.n;
  writeSave(); updateCoins(); bumpCoins(); sfxCoin();
  burst3D(0, 2.5, 0, 40);
  buildStore(); toast('Purchased ' + it.name + ' ✓');
}

/* ================= NAV WIRING ================= */
$('btnPlay').onclick = () => startLevel(resumeTarget());
addEventListener('pagehide', persistRun);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistRun(); });
$('btnLevels').onclick = () => show('levels');
$('btnStore').onclick = () => show('store');
$('btnTutorial').onclick = () => show('tutorial');
$('btnSound').onclick = () => { save.sound = !save.sound; writeSave(); $('btnSound').textContent = 'SOUND: ' + (save.sound ? 'ON' : 'OFF'); };
$('btnSound').textContent = 'SOUND: ' + (save.sound ? 'ON' : 'OFF');
$('btnMenu').onclick = () => show('menu');
$('btnUndo').onclick = undo;
$('btnRestart').onclick = restart;
$('btnHint').onclick = useHint;
$('btnNext').onclick = () => {
  $('winOv').classList.remove('on');
  startLevel(levelId + 1);
};
$('btnReplay').onclick = () => { $('winOv').classList.remove('on'); restart(); };
$('btnWinLevels').onclick = () => { $('winOv').classList.remove('on'); show('levels'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('menu'));
$('intro').addEventListener('click', endIntro);

/* ================= TUTORIAL (live demos on the real engine) ================= */
let tIdx = 0, demoTimer = null;
function stopDemo() { clearTimeout(demoTimer); demoTimer = null; }
function showTutorial(i) {
  tIdx = i; const T = TUT[i];
  $('tTitle').textContent = T.title; $('tText').textContent = T.text;
  $('tDots').innerHTML = TUT.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('tPrev').disabled = i === 0; $('tNext').textContent = i === TUT.length - 1 ? 'Got it' : 'Next';
  demoView.setLevel(T.lv);
  if (current === 'tutorial') { demoView.root.visible = true; camCtl.dist = fitDist(demoView.W, demoView.H); }
  stopDemo();
  let k = 0;
  const loop = () => {
    if (current !== 'tutorial') return;
    const now = performance.now();
    if (demoView.busy(now)) { demoTimer = setTimeout(loop, 60); return; }
    if (k >= T.moves.length) { demoView.reset(E.initial(T.lv)); k = 0; demoTimer = setTimeout(loop, 1100); return; }
    demoView.step(T.moves[k++], now); demoTimer = setTimeout(loop, 1000);
  };
  demoTimer = setTimeout(loop, 500);
}
$('tPrev').onclick = () => showTutorial(Math.max(0, tIdx - 1));
$('tNext').onclick = () => (tIdx < TUT.length - 1 ? showTutorial(tIdx + 1) : show('menu'));

/* ================= INTRO ================= */
function endIntro() {
  if (current !== 'intro') return;
  show('menu');
}
setTimeout(endIntro, INTRO_MS);

/* ================= RENDER LOOP ================= */
let last = performance.now(), clockT = 0;
function frame() {
  // Read the clock here, not the rAF timestamp: moves are stamped with performance.now(), which can be later than the rAF time.
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clockT += dt;
  if (current === 'game') {
    boardView.update(now, dt);
    if (queued.length && !boardView.busy(now)) attemptMove(queued.shift());
  }
  if (current === 'tutorial') demoView.update(now, dt);
  if (current === 'intro' || current === 'menu' || current === 'levels' || current === 'store') updateAmbient(now, dt, clockT);
  stars.rotation.y += dt * 0.01;
  updateConfetti(dt);
  updateCamera(dt, clockT);
  composer.render();
  requestAnimationFrame(frame);
}

/* ================= RESIZE ================= */
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (current === 'game' && boardView.level) camCtl.dist = fitDist(boardView.W, boardView.H);
  if (current === 'tutorial' && demoView.level) camCtl.dist = fitDist(demoView.W, demoView.H);
});

/* ================= BOOT ================= */
applyTheme();
updateCoins(); updatePlayLabel();
syncScene();
requestAnimationFrame(frame);
window.__chroma = { show, startLevel, get state() { return { current, levelId, save }; } }; // debugging hook
