// "THE WAVE THAT IS A GALAXY" — ai-excited-01 entry.
// A lone tiny figure stands on a cliff edge as a colossal wave crests over
// them — and the wave IS a galaxy: spiral arms, a blazing core, stars.
// One dominant diagonal shape, high contrast, reads at 300px.
// Node 22, standard library only. Fully deterministic: seeded PRNG, no clock.
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png), 1024x1024.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---- deterministic PRNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xA1E_C17E);

// ---- CRC32 (PNG chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePng(rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---- helpers ----
const clamp = (v, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep 0..1
const ss = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const buf = Buffer.alloc(W * H * 3);
function setPx(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = clamp(r); buf[i + 1] = clamp(g); buf[i + 2] = clamp(b);
}
function addPx(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = clamp(buf[i] + r); buf[i + 1] = clamp(buf[i + 1] + g); buf[i + 2] = clamp(buf[i + 2] + b);
}
// soft radial stamp (additive glow dot)
function stamp(x0, y0, rad, r, g, b, strength = 1) {
  const R = Math.ceil(rad);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.sqrt(x * x + y * y) / rad;
      if (d >= 1) continue;
      const f = (1 - d * d) * (1 - d * d) * strength;
      addPx(x0 + x, y0 + y, r * f, g * f, b * f);
    }
  }
}
// solid disc stamp (for the figure / stars)
function disc(x0, y0, rad, r, g, b) {
  const R = Math.ceil(rad);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      if (x * x + y * y <= rad * rad) setPx(x0 + x, y0 + y, r, g, b);
    }
  }
}

// ---- geometry ----
// Crest of the wave: a diagonal sweep from lower-left (near the cliff) up to the
// top-right, where it hooks over and plunges — the wave breaking.
function crestY(x) {
  const base = 900 - 0.55 * x - 120 * Math.sin((x / 1024) * Math.PI * 0.9);
  const hook = ss(820, 1024, x);
  return base + 300 * hook * hook;
}
// Galaxy core inside the wave.
const CORE = { x: 700, y: 400 };
// Cliff top edge (piecewise linear, slightly rugged), peak where the figure stands.
function cliffTop(x) {
  const base = x < 300 ? 920 - 0.4333 * x : 790 + 234 * ((x - 300) / 220);
  return base + 7 * Math.sin(x * 0.11) + 4 * Math.sin(x * 0.031 + 2);
}
function inWave(x, y) {
  return y < crestY(x);
}

// ---- main pixel pass ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const t = y / H;
    let r, g, b;
    if (inWave(x, y)) {
      // --- inside the galaxy-wave ---
      // Base: deep indigo at top -> violet -> electric teal near the crest.
      const depth = clamp(1 - y / 900, 0, 1); // 1 at top
      r = lerp(16, 96, 1 - depth) + 10 * (1 - depth);
      g = lerp(10, 42, 1 - depth);
      b = lerp(58, 150, 1 - depth);
      // Spiral arms around the core: 2 arms, log spiral.
      const dx = x - CORE.x, dy = y - CORE.y;
      const rad = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const arm = Math.cos(2 * ang - 2.6 * Math.log(rad + 30) + 1.2);
      const armGlow = Math.pow(Math.max(0, arm), 6) * Math.exp(-rad / 520);
      r += 260 * armGlow; g += 300 * armGlow; b += 320 * armGlow;
      // Second, looser arm set (magenta) for depth.
      const arm2 = Math.cos(2 * ang - 2.6 * Math.log(rad + 30) + 1.2 + Math.PI);
      const arm2Glow = Math.pow(Math.max(0, arm2), 8) * Math.exp(-rad / 430);
      r += 260 * arm2Glow; g += 90 * arm2Glow; b += 280 * arm2Glow;
      // Darken the gaps between arms so the spiral reads.
      const armMax = Math.max(armGlow, arm2Glow);
      const gap = 1 - ss(0.02, 0.25, armMax);
      r *= lerp(1, 0.55, gap * 0.7); g *= lerp(1, 0.55, gap * 0.7); b *= lerp(1, 0.6, gap * 0.7);
      // Blazing core glow.
      const coreGlow = Math.exp(-rad / 130);
      r += 255 * coreGlow; g += 230 * coreGlow; b += 170 * coreGlow;
      // Darken toward the crest bottom edge so the rim pops.
      const dCrest = y - crestY(x);
      if (dCrest > -40 && dCrest < 60) {
        const shade = ss(-40, 60, dCrest);
        r *= lerp(1, 0.55, shade); g *= lerp(1, 0.55, shade); b *= lerp(1, 0.7, shade);
      }
    } else {
      // --- sky / sea below the wave ---
      // Deep teal night sea, lighter toward the horizon glow under the crest.
      r = lerp(8, 26, t);
      g = lerp(22, 66, t);
      b = lerp(46, 96, t);
      // Cyan reflection glow just below the crest.
      const dBelow = y - crestY(x);
      if (dBelow >= 0 && dBelow < 150) {
        const gl = Math.exp(-dBelow / 55);
        r += 20 * gl; g += 90 * gl; b += 130 * gl;
      }
      // Warm horizon glow low-left, where the wave is about to strike the cliff.
      const dh = Math.hypot(x - 210, y - 780);
      const hg = Math.exp(-dh / 170);
      r += 120 * hg; g += 60 * hg; b += 20 * hg;
      // Faint horizontal shimmer on the sea.
      const shim = Math.max(0, Math.sin(x * 0.021 + y * 0.11) * Math.sin(y * 0.05 + 1.7));
      const sh = shim * shim * 4 * ss(40, 160, y - crestY(x)) * (1 - ss(160, 320, y - crestY(x)));
      r += sh; g += sh * 1.6; b += sh * 1.9;
    }
    // --- bright crest rim (the wave's glowing edge) ---
    const dRim = Math.abs(y - crestY(x));
    const rim = Math.exp(-(dRim * dRim) / (2 * 7 * 7));
    r += 200 * rim; g += 245 * rim; b += 255 * rim;
    const halo = Math.exp(-(dRim * dRim) / (2 * 34 * 34));
    r += 40 * halo; g += 110 * halo; b += 150 * halo;
    // --- cliff silhouette (bottom-left) ---
    if (x < 520 && y > cliffTop(x)) {
      const top = cliffTop(x);
      const dTop = y - top;
      r = 8; g = 8; b = 20;
      // faint violet rim light on the cliff's top edge
      const edge = Math.exp(-dTop / 9);
      r += 60 * edge; g += 40 * edge; b += 110 * edge;
    }
    // --- vignette ---
    const vx = (x - W / 2) / (W / 2), vy = (y - H / 2) / (H / 2);
    const vig = 1 - 0.28 * Math.max(0, vx * vx + vy * vy - 0.55);
    buf[i] = clamp(r * vig); buf[i + 1] = clamp(g * vig); buf[i + 2] = clamp(b * vig);
  }
}

// ---- stars: dense inside the wave (the galaxy), sparse in the sky ----
for (let s = 0; s < 900; s++) {
  const x = Math.floor(rand() * W);
  const y = Math.floor(rand() * H);
  const inW = inWave(x, y);
  if (!inW) continue; // stars live in the galaxy-wave only; the sea stays dark
  const br = 90 + rand() * 165;
  const warm = rand();
  const cr = warm < 0.25 ? br : br * 0.85;
  const cg = br * 0.9;
  const cb = warm < 0.25 ? br * 0.75 : br;
  const rad = rand() < 0.06 ? 2.2 : rand() < 0.3 ? 1.4 : 0.9;
  stamp(x, y, rad * 3, cr * 0.5, cg * 0.5, cb * 0.5, 0.9);
  disc(x, y, rad, cr, cg, cb);
  if (rand() < 0.05) { // cross sparkle on a few bright stars
    for (let k = -7; k <= 7; k++) {
      addPx(x + k, y, 60, 60, 70);
      addPx(x, y + k, 60, 60, 70);
    }
  }
}

// ---- spray: white foam bursting off the crest ----
for (let s = 0; s < 520; s++) {
  const x = 120 + rand() * 880;
  const cy = crestY(x);
  const spread = (rand() + rand() + rand()) / 3; // bias toward crest
  const y = Math.round(cy - 6 - spread * (26 + rand() * 70));
  const br = 120 + rand() * 135;
  stamp(x, y, 1.5 + rand() * 3.5, br * 0.8, br * 0.95, br, 0.85);
}

// ---- the tiny figure on the cliff peak, arms raised at the wave ----
const FX = 300, FY = 793; // feet, standing on the rugged cliff peak
// rim glow behind the figure so the silhouette reads
stamp(FX, FY - 16, 26, 90, 120, 180, 0.8);
// body: head + torso + legs, near-black with a cyan rim on the wave side
disc(FX, FY - 30, 4.5, 4, 4, 12);                    // head
for (let yy = FY - 26; yy <= FY - 2; yy++) {          // torso
  const wdt = yy < FY - 14 ? 3.2 : 2.6;
  for (let xx = -wdt; xx <= wdt; xx++) setPx(Math.round(FX + xx), yy, 4, 4, 12);
}
for (let yy = FY - 2; yy <= FY; yy++) {               // legs
  setPx(FX - 2, yy, 4, 4, 12); setPx(FX + 2, yy, 4, 4, 12);
}
// arms raised in a V toward the wave
for (let k = 0; k <= 12; k++) {
  setPx(FX - 3 - k, FY - 26 - k, 4, 4, 12);
  setPx(FX + 3 + k, FY - 26 - k, 4, 4, 12);
  setPx(FX - 3 - k, FY - 25 - k, 4, 4, 12);
  setPx(FX + 3 + k, FY - 25 - k, 4, 4, 12);
}
// cyan rim light on the figure's wave-facing side
for (let yy = FY - 28; yy <= FY - 4; yy++) setPx(FX + 4, yy, 120, 220, 255);
setPx(FX + 4, FY - 31, 120, 220, 255);
setPx(FX + 5, FY - 30, 120, 220, 255);

// ---- core starburst at the galaxy heart ----
stamp(CORE.x, CORE.y, 60, 255, 240, 200, 0.9);
stamp(CORE.x, CORE.y, 22, 255, 255, 255, 1);
disc(CORE.x, CORE.y, 7, 255, 255, 245);

// ---- write it out ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), writePng(buf));
