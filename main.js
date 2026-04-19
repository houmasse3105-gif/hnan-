"use strict";

/* ════════════════════════════════════════════════
   1. الإعدادات
   ════════════════════════════════════════════════ */

const CONFIG = {
  images: {
    before: "./before.jpg",
    after:  "./after.jpg",
  },

  // 🔥 تم ضبطها حسب الصورة الفعلية
  hutZone: { x: 0.33, y: 0.64, width: 0.22, height: 0.22 },
  windowBox: { x: 0.52, y: 0.42, width: 0.28, height: 0.3 },

  particleCount: 24,

  timing: {
    imageTransition: { start: 1, end: 3 },
    warmOverlay:     { start: 3, end: 6 },
    flowerReveal:    { start: 6, end: 10 },
    windIn:          { start: 10, end: 11.4 },
    windOut:         { start: 13.1, end: 14.4 },
    silhouette:      { start: 14, end: 17 },
    finalGlow:       { start: 17, end: 20 },
    message:         { start: 17, end: 18.5 },
    particlesIn:     { start: 3, end: 6 },
    particlesOut:    { start: 20, end: 24 },
    silhouetteStop:  { start: 20, end: 23 },
  },

  audio: {
    masterVolume: 0.86,
    musicMaxGain: 0.40,
    tones: [174.61, 220.0, 261.63],
    gainValues: [0.028, 0.022, 0.017],
    lfoRates: [0.040, 0.058, 0.076],
    lfoDepths: [0.003, 0.0045, 0.006],
  },
};


/* ════════════════════════════════════════════════
   2. الحالة
   ════════════════════════════════════════════════ */

const state = {
  active: false,
  startTime: 0,
  lastNow: performance.now(),
  audio: null,
  particles: [],
  imageRect: { x: 0, y: 0, width: innerWidth, height: innerHeight },
  windowRect: {},
};


/* ════════════════════════════════════════════════
   3. DOM
   ════════════════════════════════════════════════ */

const beforeImage  = document.getElementById("before-image");
const afterImage   = document.getElementById("after-image");
const flowerReveal = document.getElementById("flower-reveal");

const camera      = document.getElementById("camera");
const warmOverlay = document.getElementById("warm-overlay");
const finalGlow   = document.getElementById("final-glow");
const hutFlicker  = document.getElementById("hut-flicker");
const windowGlow  = document.getElementById("window-glow");
const silhouette  = document.getElementById("silhouette");
const dustLayer   = document.getElementById("dust-layer");

const windLayer = document.getElementById("wind-layer");
const windGroup = document.getElementById("wind-group");
const windPaths = Array.from(document.querySelectorAll(".wind-path"));

const hotspot = document.getElementById("hut-hotspot");
const message = document.getElementById("message");

/* تحميل الصور (بدون تكرار) */
beforeImage.src = CONFIG.images.before;
afterImage.src  = CONFIG.images.after;
flowerReveal.style.backgroundImage = `url("${CONFIG.images.after}")`;


/* ════════════════════════════════════════════════
   4. Math helpers
   ════════════════════════════════════════════════ */

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const mix   = (a, b, t) => a + (b - a) * t;
const range = (v, a, b) => clamp((v - a) / (b - a || 1));

const smoothstep = (v, a, b) => {
  const t = range(v, a, b);
  return t * t * (3 - 2 * t);
};

const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);

const pulse = (t, c, w, s = 1) =>
  s * Math.exp(-Math.pow((t - c) / w, 2));

const rand = (a, b) => a + Math.random() * (b - a);


/* ════════════════════════════════════════════════
   5. Layout
   ════════════════════════════════════════════════ */

function getCoverRect(img) {
  const vw = innerWidth, vh = innerHeight;
  const iw = img.naturalWidth || vw;
  const ih = img.naturalHeight || vh;
  const scale = Math.max(vw / iw, vh / ih);
  return {
    x: (vw - iw * scale) / 2,
    y: (vh - ih * scale) / 2,
    width: iw * scale,
    height: ih * scale
  };
}

function layoutScene() {
  state.imageRect = getCoverRect(beforeImage);
  const r = state.imageRect;

  const hutW = r.width * CONFIG.hutZone.width;
  const hutH = r.height * CONFIG.hutZone.height;

  const hutX = r.x + r.width * CONFIG.hutZone.x - hutW / 2;
  const hutY = r.y + r.height * CONFIG.hutZone.y - hutH / 2;

  hotspot.style.left = hutX + "px";
  hotspot.style.top  = hutY + "px";
  hotspot.style.width  = hutW + "px";
  hotspot.style.height = hutH + "px";

  const winW = hutW * CONFIG.windowBox.width;
  const winH = hutH * CONFIG.windowBox.height;

  const cx = hutX + hutW * CONFIG.windowBox.x;
  const cy = hutY + hutH * CONFIG.windowBox.y;

  state.windowRect = { centerX: cx, centerY: cy, width: winW, height: winH };

  windowGlow.style.left = cx + "px";
  windowGlow.style.top  = cy + "px";

  hutFlicker.style.left = cx + "px";
  hutFlicker.style.top  = cy + "px";

  silhouette.style.left = cx + "px";
  silhouette.style.top  = cy + "px";
}


/* ════════════════════════════════════════════════
   6. التفعيل
   ════════════════════════════════════════════════ */

async function activateScene() {
  if (state.active) return;

  state.active = true;
  state.startTime = performance.now();

  hotspot.style.pointerEvents = "none";
  document.body.style.cursor = "default";

  playClickSound();

  const audio = initAudio();
  if (audio) {
    try { await audio.context.resume(); } catch {}
  }
}

hotspot.style.cursor = "pointer";
hotspot.addEventListener("click", activateScene);


/* ════════════════════════════════════════════════
   7. Animation
   ════════════════════════════════════════════════ */

function updateScene(now) {
  const t = state.active ? (now - state.startTime) / 1000 : 0;

  const afterOpacity = smoothstep(t, 1, 3);
  afterImage.style.opacity = afterOpacity;

  const bloom = smoothstep(t, 6, 10);
  flowerReveal.style.opacity = bloom;

  /* 🔥 توهج معدل */
  const glow = clamp(afterOpacity * 0.45);
  windowGlow.style.opacity = glow;

  warmOverlay.style.opacity = smoothstep(t, 3, 6) * 0.08;
  finalGlow.style.opacity  = smoothstep(t, 17, 20) * 0.10;

  message.style.opacity = smoothstep(t, 17, 18.5);

  requestAnimationFrame(updateScene);
}


/* ════════════════════════════════════════════════
   8. صوت
   ════════════════════════════════════════════════ */

function initAudio() {
  if (state.audio) return state.audio;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  const ctx = new AC();
  const master = ctx.createGain();
  master.connect(ctx.destination);

  state.audio = { context: ctx, master };
  return state.audio;
}

function playClickSound() {
  const audio = initAudio();
  if (!audio) return;

  const ctx = audio.context;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = 600;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}


/* ════════════════════════════════════════════════
   9. Init
   ════════════════════════════════════════════════ */

window.addEventListener("resize", layoutScene);
beforeImage.addEventListener("load", layoutScene);

layoutScene();
requestAnimationFrame(updateScene);