"use strict";

/* ════════════════════════════════════════════════
   1. الثوابت والإعدادات
   ════════════════════════════════════════════════ */

const CONFIG = {
  images: {
    before: "./before.jpg",
    after:  "./after.jpg",
  },
 hutZone: { x: 0.55, y: 0.6, width: 0.2, height: 0.25 },
windowBox: { x: 0.5, y: 0.4, width: 0.3, height: 0.35 },
  particleCount: 24,
  timing: {
    imageTransition: { start: 1,    end: 3    },
    warmOverlay:     { start: 3,    end: 6    },
    flowerReveal:    { start: 6,    end: 10   },
    windIn:          { start: 10,   end: 11.4 },
    windOut:         { start: 13.1, end: 14.4 },
    silhouette:      { start: 14,   end: 17   },
    finalGlow:       { start: 17,   end: 20   },
    message:         { start: 17,   end: 18.5 },
    particlesIn:     { start: 3,    end: 6    },
    particlesOut:    { start: 20,   end: 24   },
    silhouetteStop:  { start: 20,   end: 23   },
  },
  audio: {
    masterVolume: 0.86,
    musicMaxGain: 0.40,
    tones:      [174.61, 220.0, 261.63],
    gainValues: [0.028,  0.022, 0.017 ],
    lfoRates:   [0.040,  0.058, 0.076 ],
    lfoDepths:  [0.003,  0.0045, 0.006],
  },
};


/* ════════════════════════════════════════════════
   2. الحالة المشتركة
   ════════════════════════════════════════════════ */

const state = {
  active:    false,
  startTime: 0,
  lastNow:   performance.now(),
  audio:     null,
  particles: [],
  imageRect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
  windowRect: {
    left: window.innerWidth * 0.56, top: window.innerHeight * 0.44,
    width: 48, height: 36,
    centerX: window.innerWidth * 0.58, centerY: window.innerHeight * 0.48,
  },
};


/* ════════════════════════════════════════════════
   3. مراجع DOM
   ════════════════════════════════════════════════ */

const beforeImage  = document.getElementById("before-image");
const afterImage   = document.getElementById("after-image");
const flowerReveal = document.getElementById("flower-reveal");
beforeImage.onload = () => console.log("before OK");
beforeImage.onerror = () => console.log("before FAIL");

afterImage.onload = () => console.log("after OK");
afterImage.onerror = () => console.log("after FAIL");
beforeImage.src = "before.jpg";
afterImage.src = "after.jpg";
flowerReveal.style.backgroundImage = 'url("after.jpg")';
const camera       = document.getElementById("camera");
const warmOverlay  = document.getElementById("warm-overlay");
const finalGlow    = document.getElementById("final-glow");
const hutFlicker   = document.getElementById("hut-flicker");
const windowGlow   = document.getElementById("window-glow");
const silhouette   = document.getElementById("silhouette");
const dustLayer    = document.getElementById("dust-layer");
const windLayer    = document.getElementById("wind-layer");
const windGroup    = document.getElementById("wind-group");
const windPaths    = Array.from(document.querySelectorAll(".wind-path"));
const hotspot      = document.getElementById("hut-hotspot");
const message      = document.getElementById("message");

/* ضبط مسارات الصور */
beforeImage.src = CONFIG.images.before;
afterImage.src  = CONFIG.images.after;
flowerReveal.style.backgroundImage = `url("${CONFIG.images.after}")`;


/* ════════════════════════════════════════════════
   4. دوال رياضية مساعدة
   ════════════════════════════════════════════════ */

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const mix   = (a, b, t) => a + (b - a) * t;
const range = (v, a, b) => clamp((v - a) / (b - a || 1));

/* منحنى S ناعم */
const smoothstep = (v, a, b) => {
  const t = range(v, a, b);
  return t * t * (3 - 2 * t);
};

/* توقف سريع بعد البداية */
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);

/* نبضة غاوسية */
const pulse = (t, center, width, strength = 1) =>
  strength * Math.exp(-Math.pow((t - center) / width, 2));

const rand = (a, b) => a + Math.random() * (b - a);

/* أبعاد الصورة الفعلية مع object-fit:cover */
function getCoverRect(img) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const iw = img.naturalWidth  || vw;
  const ih = img.naturalHeight || vh;
  const scale  = Math.max(vw / iw, vh / ih);
  const width  = iw * scale;
  const height = ih * scale;
  return { x: (vw - width) / 2, y: (vh - height) / 2, width, height };
}


/* ════════════════════════════════════════════════
   5. التخطيط — مواضع عناصر الكوخ
   ════════════════════════════════════════════════ */

function layoutScene() {
  state.imageRect = getCoverRect(beforeImage);
  const rect = state.imageRect;

  const hutW    = rect.width  * CONFIG.hutZone.width;
  const hutH    = rect.height * CONFIG.hutZone.height;
  const hutLeft = rect.x + rect.width  * CONFIG.hutZone.x - hutW / 2;
  const hutTop  = rect.y + rect.height * CONFIG.hutZone.y - hutH / 2;

  hotspot.style.left   = hutLeft + "px";
  hotspot.style.top    = hutTop  + "px";
  hotspot.style.width  = hutW    + "px";
  hotspot.style.height = hutH    + "px";

  const winW   = hutW * CONFIG.windowBox.width;
  const winH   = hutH * CONFIG.windowBox.height;
  const winCX  = hutLeft + hutW * CONFIG.windowBox.x;
  const winCY  = hutTop  + hutH * CONFIG.windowBox.y;
  const winTop = winCY - winH / 2;

  state.windowRect = {
    left: winCX - winW / 2, top: winTop,
    width: winW, height: winH,
    centerX: winCX, centerY: winCY,
  };

  const flickerSize = Math.max(76, winW * 2.6);
  hutFlicker.style.left   = winCX + "px";
  hutFlicker.style.top    = winCY + "px";
  hutFlicker.style.width  = flickerSize + "px";
  hutFlicker.style.height = flickerSize + "px";

  const glowSize = Math.max(130, winW * 4.3);
  windowGlow.style.left   = winCX + "px";
  windowGlow.style.top    = winCY + "px";
  windowGlow.style.width  = glowSize + "px";
  windowGlow.style.height = glowSize + "px";

  silhouette.style.left   = winCX + "px";
  silhouette.style.top    = winTop + winH * 0.6 + "px";
  silhouette.style.width  = Math.max(26, winW * 0.62) + "px";
  silhouette.style.height = Math.max(42, winH * 0.96) + "px";

  updateWindPaths();
}


/* ════════════════════════════════════════════════
   6. الريح — خطوط SVG المتحركة
   ════════════════════════════════════════════════ */

function updateWindPaths() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ox = state.windowRect.centerX;
  const oy = state.windowRect.centerY + state.windowRect.height * 0.05;

  windLayer.setAttribute("viewBox", `0 0 ${vw} ${vh}`);

  const specs = [
    { endX: ox+vw*0.24, endY: oy-vh*0.20, cp1X: ox+vw*0.06, cp1Y: oy-vh*0.03, cp2X: ox+vw*0.16, cp2Y: oy-vh*0.22 },
    { endX: ox+vw*0.16, endY: oy-vh*0.28, cp1X: ox+vw*0.02, cp1Y: oy-vh*0.08, cp2X: ox+vw*0.10, cp2Y: oy-vh*0.25 },
    { endX: ox-vw*0.14, endY: oy-vh*0.12, cp1X: ox-vw*0.04, cp1Y: oy+vh*0.01, cp2X: ox-vw*0.10, cp2Y: oy-vh*0.12 },
    { endX: ox+vw*0.29, endY: oy-vh*0.06, cp1X: ox+vw*0.08, cp1Y: oy+vh*0.03, cp2X: ox+vw*0.19, cp2Y: oy-vh*0.08 },
  ];

  windPaths.forEach((path, i) => {
    const s = specs[i];
    path.setAttribute("d", [
      `M ${ox.toFixed(2)} ${oy.toFixed(2)}`,
      `C ${s.cp1X.toFixed(2)} ${s.cp1Y.toFixed(2)},`,
      `  ${s.cp2X.toFixed(2)} ${s.cp2Y.toFixed(2)},`,
      `  ${s.endX.toFixed(2)} ${s.endY.toFixed(2)}`,
    ].join(" "));
    path.setAttribute("stroke-width", Math.max(1.6, Math.min(vw, vh) * 0.0024));
    const len = path.getTotalLength();
    path.dataset.length = String(len);
    path.style.strokeDasharray = `${len * 0.26} ${len * 0.74}`;
  });
}

function updateWind(sceneTime) {
  const { windIn, windOut } = CONFIG.timing;
  const opacity = smoothstep(sceneTime, windIn.start, windIn.end) *
                  (1 - smoothstep(sceneTime, windOut.start, windOut.end));

  windLayer.style.opacity = opacity.toFixed(3);
  windGroup.setAttribute("transform",
    `translate(${(Math.sin(sceneTime * 0.78) * 4).toFixed(2)} ${(Math.cos(sceneTime * 0.48) * 2).toFixed(2)})`
  );

  windPaths.forEach((path, i) => {
    const len    = Number(path.dataset.length || 0);
    const travel = ((sceneTime - windIn.start) * 0.22 + i * 0.18) % 1.2;
    path.style.opacity          = (0.16 + opacity * (0.44 + i * 0.08)).toFixed(3);
    path.style.strokeDashoffset = String(len * (1 - travel));
  });
}


/* ════════════════════════════════════════════════
   7. الجسيمات
   ════════════════════════════════════════════════ */

function resetParticle(p, initial = false, sceneTime = 0) {
  const vw = window.innerWidth, vh = window.innerHeight;
  p.width       = rand(3, 10);
  p.height      = p.width * rand(0.8, 1.9);
  p.startX      = rand(vw * 0.14, vw * 0.86);
  p.startY      = rand(vh * 0.80, vh * 1.05);
  p.driftX      = rand(-24, 26);
  p.driftY      = rand(64, 156);
  p.life        = rand(8, 14);
  p.spawnAt     = initial ? rand(3.1, 6.8) : sceneTime + rand(0.3, 2.1);
  p.alpha       = rand(0.05, 0.20);
  p.blur        = rand(0.30, 2.20);
  p.phase       = rand(0, Math.PI * 2);
  p.wobbleAmp   = rand(5, 18);
  p.wobbleSpeed = rand(0.24, 0.56);
  p.scale       = rand(0.70, 1.18);
  p.rotate      = rand(-18, 18);
  p.el.style.width  = p.width  + "px";
  p.el.style.height = p.height + "px";
  p.el.style.filter = `blur(${p.blur}px)`;
}

function createParticles() {
  for (let i = 0; i < CONFIG.particleCount; i++) {
    const el = document.createElement("div");
    el.className = "dust";
    dustLayer.appendChild(el);
    const p = { el };
    state.particles.push(p);
    resetParticle(p, true, 0);
  }
}

function updateParticles(nowSec, sceneTime) {
  const { particlesIn, particlesOut } = CONFIG.timing;
  const stage = smoothstep(sceneTime, particlesIn.start, particlesIn.end) *
                (1 - smoothstep(sceneTime, particlesOut.start, particlesOut.end));

  state.particles.forEach((p) => {
    if (!state.active || stage <= 0.001 || sceneTime < p.spawnAt) {
      p.el.style.opacity = "0"; return;
    }
    let age = (sceneTime - p.spawnAt) / p.life;
    if (age >= 1) { resetParticle(p, false, sceneTime); age = 0; }

    const fade = Math.sin(Math.PI * clamp(age));
    const x    = p.startX + p.driftX * age + Math.sin(nowSec * p.wobbleSpeed + p.phase) * p.wobbleAmp;
    const y    = p.startY - p.driftY * age - Math.cos(nowSec * 0.25 + p.phase) * 4;

    p.el.style.opacity   = (fade * p.alpha * stage).toFixed(3);
    p.el.style.transform =
      `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) ` +
      `rotate(${(p.rotate + age * 14).toFixed(2)}deg) ` +
      `scale(${(p.scale * (0.72 + age * 0.4)).toFixed(3)})`;
  });
}


/* ════════════════════════════════════════════════
   8. الصوت — Web Audio API
   ════════════════════════════════════════════════ */

function initAudio() {
  if (state.audio) return state.audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  const ctx    = new AC();
  const master = ctx.createGain();
  master.gain.value = CONFIG.audio.masterVolume;
  master.connect(ctx.destination);

  const musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 780;
  filter.Q.value = 0.22;

  const delay    = ctx.createDelay(1.2);
  delay.delayTime.value = 0.34;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.16;
  delay.connect(feedback);
  feedback.connect(delay);
  filter.connect(musicGain);
  filter.connect(delay);
  delay.connect(musicGain);

  CONFIG.audio.tones.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    osc.type   = i === 1 ? "triangle" : "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = CONFIG.audio.gainValues[i];
    osc.connect(gain).connect(filter);
    osc.start();

    const lfo   = ctx.createOscillator();
    lfo.type    = "sine";
    lfo.frequency.value = CONFIG.audio.lfoRates[i];
    const depth = ctx.createGain();
    depth.gain.value = CONFIG.audio.lfoDepths[i];
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
  });

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseCh  = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseCh.length; i++) noiseCh[i] = (Math.random() * 2 - 1) * 0.18;
  const noise    = ctx.createBufferSource();
  noise.buffer   = noiseBuf;
  noise.loop     = true;
  const nFilt    = ctx.createBiquadFilter();
  nFilt.type     = "bandpass";
  nFilt.frequency.value = 960;
  nFilt.Q.value  = 0.36;
  const nGain    = ctx.createGain();
  nGain.gain.value = 0.01;
  noise.connect(nFilt).connect(nGain).connect(filter);
  noise.start();

  const shimmer  = ctx.createOscillator();
  shimmer.type   = "sine";
  shimmer.frequency.value = 523.25;
  const shGain   = ctx.createGain();
  shGain.gain.value = 0.0026;
  shimmer.connect(shGain).connect(filter);
  shimmer.start();
  const shLfo    = ctx.createOscillator();
  shLfo.type     = "sine";
  shLfo.frequency.value = 0.08;
  const shDepth  = ctx.createGain();
  shDepth.gain.value = 0.0018;
  shLfo.connect(shDepth).connect(shGain.gain);
  shLfo.start();

  state.audio = { context: ctx, master, musicGain, filter };
  return state.audio;
}

function playClickSound() {
  const audio = initAudio();
  if (!audio) return;
  const { context: ctx, master } = audio;
  const now = ctx.currentTime;

  const t1 = ctx.createOscillator();
  t1.type  = "triangle";
  t1.frequency.setValueAtTime(820, now);
  t1.frequency.exponentialRampToValueAtTime(360, now + 0.10);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.08,   now + 0.012);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  t1.connect(g1).connect(master);
  t1.start(now); t1.stop(now + 0.14);

  const t2 = ctx.createOscillator();
  t2.type  = "sine";
  t2.frequency.setValueAtTime(540, now);
  t2.frequency.exponentialRampToValueAtTime(220, now + 0.14);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, now);
  g2.gain.exponentialRampToValueAtTime(0.026,  now + 0.014);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  t2.connect(g2).connect(master);
  t2.start(now); t2.stop(now + 0.18);
}

function updateAudio(sceneTime, afterOpacity) {
  if (!state.audio) return;
  const { context: ctx, musicGain, filter } = state.audio;
  const { imageTransition, finalGlow: fg }  = CONFIG.timing;

  musicGain.gain.setTargetAtTime(
    CONFIG.audio.musicMaxGain * smoothstep(sceneTime, imageTransition.start, imageTransition.end),
    ctx.currentTime, 0.22
  );
  filter.frequency.setTargetAtTime(
    780 + 240 * afterOpacity + 120 * smoothstep(sceneTime, fg.start, fg.end),
    ctx.currentTime, 0.28
  );
}


/* ════════════════════════════════════════════════
   9. حلقة الرسم الرئيسية
   ════════════════════════════════════════════════ */

function updateScene(now) {
  state.lastNow = now;
  const nowSec    = now / 1000;
  const sceneTime = state.active ? Math.max(0, (now - state.startTime) / 1000) : 0;
  const { timing } = CONFIG;

  /* الكاميرا: تنفس مستمر + تكبير لحظي عند النقر */
  const atmosphere   = smoothstep(sceneTime, 3, 6);
  const ambientAmp   = mix(0.00085, 0.0015, atmosphere);
  const ambientScale = 1 + ambientAmp * (Math.sin(now * 0.00034) + Math.sin(now * 0.00017 + 1.7) * 0.6);
  const cameraScale  = state.active
    ? ambientScale * mix(1, 1.01, easeOutCubic(range(sceneTime, 0, 1)))
    : 1 + 0.001 * (1 - Math.cos(now * 0.00044));
  camera.style.transform = `scale(${cameraScale.toFixed(5)})`;

  /* الصورة المضيئة */
  const afterOpacity = smoothstep(sceneTime, timing.imageTransition.start, timing.imageTransition.end);
  afterImage.style.opacity = afterOpacity.toFixed(3);

  /* كشف الزهور */
  const bloom = smoothstep(sceneTime, timing.flowerReveal.start, timing.flowerReveal.end);
  flowerReveal.style.opacity   = bloom.toFixed(3);
  flowerReveal.style.transform = `scale(${mix(1, 1.02, bloom).toFixed(4)})`;

  /* وميض الكوخ: 3 نبضات عند النقر */
  const flicker =
    pulse(sceneTime, 0.12, 0.05, 0.90) +
    pulse(sceneTime, 0.28, 0.06, 0.66) +
    pulse(sceneTime, 0.48, 0.09, 0.42);
  hutFlicker.style.opacity   = clamp(flicker * (1 - smoothstep(sceneTime, 0.65, 1.08))).toFixed(3);
  hutFlicker.style.transform = `translate3d(-50%,-50%,0) scale(${mix(0.84, 1.18, clamp(flicker)).toFixed(3)})`;

  /* هالة النافذة */
  const winLight = clamp(
    afterOpacity * 0.68 +
    smoothstep(sceneTime, timing.finalGlow.start, timing.finalGlow.end) * 0.12 +
    Math.sin(now * 0.0008) * 0.03 + 0.03
  );
  windowGlow.style.opacity   = winLight.toFixed(3);
  windowGlow.style.transform = `translate3d(-50%,-50%,0) scale(${
    mix(0.76, 1.18,
      afterOpacity + smoothstep(sceneTime, timing.finalGlow.start, timing.finalGlow.end) * 0.3
    ).toFixed(3)
  })`;

  /* طبقة الدفء والوهج النهائي */
  warmOverlay.style.opacity = clamp(
    smoothstep(sceneTime, timing.warmOverlay.start, timing.warmOverlay.end) * 0.16 +
    smoothstep(sceneTime, timing.finalGlow.start,   timing.finalGlow.end)   * 0.04,
    0, 0.22
  ).toFixed(3);
  finalGlow.style.opacity = clamp(
    smoothstep(sceneTime, timing.finalGlow.start, timing.finalGlow.end) * 0.16,
    0, 0.18
  ).toFixed(3);

  /* الجسيمات */
  updateParticles(nowSec, sceneTime);

  /* الريح */
  updateWind(sceneTime);

  /* ظل الشخص */
  silhouette.style.opacity   = (smoothstep(sceneTime, timing.silhouette.start, timing.silhouette.end) * 0.68).toFixed(3);
  silhouette.style.transform = `translate(-50%, calc(-50% + ${(
    Math.sin(nowSec * 0.76 + 1.1) * 1.2 *
    (1 - smoothstep(sceneTime, timing.silhouetteStop.start, timing.silhouetteStop.end))
  ).toFixed(2)}px))`;

  /* نص Happy Birthday */
  message.style.opacity = smoothstep(sceneTime, timing.message.start, timing.message.end).toFixed(3);

  /* الصوت */
  updateAudio(sceneTime, afterOpacity);

  requestAnimationFrame(updateScene);
}


/* ════════════════════════════════════════════════
   10. التهيئة وربط الأحداث
   ════════════════════════════════════════════════ */

async function activateScene() {
  if (state.active) return;
  state.active    = true;
  state.startTime = performance.now();
  hotspot.style.pointerEvents = "none";

  const audio = initAudio();
  if (audio) {
    try { await audio.context.resume(); } catch { /* صامت */ }
  }
  playClickSound();
}

hotspot.addEventListener("click", activateScene);
hotspot.addEventListener("touchstart", (e) => { e.preventDefault(); activateScene(); }, { passive: false });
window.addEventListener("resize", layoutScene);
beforeImage.addEventListener("load", layoutScene);
afterImage.addEventListener("load",  layoutScene);

createParticles();
layoutScene();
requestAnimationFrame(updateScene);
