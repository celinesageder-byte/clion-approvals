// Claude — Motion Design Showreel 2026
// Every frame is a pure function of time: renderFrame(t) draws the reel at t seconds.
// 1920x1080, 60fps, 15s, 120 BPM (one beat = 0.5s). Motion blur via sub-frame accumulation.

const W = 1920, H = 1080, FPS = 60, DUR = 15;
const CX = W / 2, CY = H / 2;
const C = {
  ink: '#0B0B10', ink2: '#15151D', cream: '#F4EFE4', paper: '#EAE3D3',
  coral: '#FF4A2B', lime: '#CBFF3A', violet: '#6D4BFF', blue: '#2F7BFF',
};
const TAU = Math.PI * 2;

// ─── canvases ────────────────────────────────────────────────────────────────
const out = document.getElementById('c').getContext('2d');
function mk(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const [bufC, bx] = mk(), [accC, ax] = mk(), [tmpC, tx] = mk(), [chC, chx] = mk();

// ─── math / easing ───────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: x => x,
  inQ: x => x * x, outQ: x => 1 - (1 - x) * (1 - x),
  inC: x => x * x * x, outC: x => 1 - Math.pow(1 - x, 3),
  ioC: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  inX: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  outX: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  ioX: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outB: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inB: x => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
  outEl: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (TAU / 3)) + 1,
};
function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bxx = 3 * (p2x - p1x) - cx, axx = 1 - cx - bxx;
  const cy = 3 * p1y, byy = 3 * (p2y - p1y) - cy, ayy = 1 - cy - byy;
  const sx = t => ((axx * t + bxx) * t + cx) * t, sy = t => ((ayy * t + byy) * t + cy) * t;
  const dsx = t => (3 * axx * t + 2 * bxx) * t + cx;
  return x => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 6; i++) { const d = dsx(t); if (Math.abs(d) < 1e-5) break; const nt = t - (sx(t) - x) / d; if (nt < 0 || nt > 1) break; t = nt; }
    if (Math.abs(sx(t) - x) > 1e-4) { for (let i = 0; i < 30; i++) { t = (lo + hi) / 2; if (sx(t) < x) lo = t; else hi = t; } }
    return sy(t);
  };
}
const EXPO_IO = cubicBezier(.83, 0, .17, 1);
function rng(s) { return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(n) { const r = rng(n * 7919 + 13); return r(); }
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = lerp(pa >> 16, pb >> 16, t) | 0, g = lerp(pa >> 8 & 255, pb >> 8 & 255, t) | 0, bl = lerp(pa & 255, pb & 255, t) | 0;
  return `rgb(${r},${g},${bl})`;
}
function rgba(hex, a) { const p = parseInt(hex.slice(1), 16); return `rgba(${p >> 16},${p >> 8 & 255},${p & 255},${a})`; }

// ─── rhythm: every hit shakes the camera, flashes, and splits RGB ────────────
const HITS = [[1.0, .45], [1.5, 1], [3.0, 1], [4.5, .35], [5.5, .35], [6.0, .35], [7.0, 1], [9.5, .7], [12.0, 1.25], [13.5, .45]];
function env(t, decay) { let s = 0; for (const [h, k] of HITS) if (t >= h) s += k * Math.exp(-(t - h) * decay); return s; }
function shake(t) {
  const a = env(t, 13) * 20;
  return [a * Math.sin(t * 91.7) * Math.cos(t * 13.1), a * Math.cos(t * 77.3) * Math.sin(t * 17.9 + 1), a * .0012 * Math.sin(t * 61.1)];
}

// ─── shared drawing helpers ──────────────────────────────────────────────────
function bg(x, col) { x.fillStyle = col; x.fillRect(-200, -200, W + 400, H + 400); }
function circle(x, px, py, r, col) { x.fillStyle = col; x.beginPath(); x.arc(px, py, Math.max(0, r), 0, TAU); x.fill(); }
function ring(x, px, py, r, lw, col) { if (lw <= 0 || r <= 0) return; x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(px, py, r, 0, TAU); x.stroke(); }
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
function scramble(str, p, t, seed = 1) {
  let s = '';
  const tick = Math.floor(t * 30);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const th = i / Math.max(1, str.length) * .75;
    if (ch === ' ' || p >= th + .25) s += ch;
    else if (p > th) s += GLYPHS[Math.floor(hash(i * 31 + tick * 7 + seed) * GLYPHS.length)];
    else s += ' ';
  }
  return s;
}
// Wipe transition used as the "visual rhyme" of the reel: a leading accent ring, then the new colour.
function irisWipe(x, t, t0, t1, lead, col, fromR = 0) {
  const rl = lerp(fromR, 1180, E.ioC(P(t, t0 - .05, t1 - .03)));
  const r = lerp(fromR, 1180, E.ioC(P(t, t0, t1)));
  if (t > t0 - .05) circle(x, CX, CY, rl, lead);
  if (t > t0) circle(x, CX, CY, r, col);
}

// ═════════════════════════════════════════════════════════════════════════════
// 01 — SQUASH & STRETCH (0.0 → 2.0)
// ═════════════════════════════════════════════════════════════════════════════
function s1(x, t) {
  bg(x, C.ink);
  const R = 46, floorY = 700;
  // floor + ruler ticks draw on
  const fl = E.outX(P(t, .3, 1.0)), flOut = E.inC(P(t, 1.5, 1.75));
  x.strokeStyle = rgba(C.cream, .28 * (1 - flOut)); x.lineWidth = 2;
  x.beginPath(); x.moveTo(CX - 520 * fl, floorY); x.lineTo(CX + 520 * fl, floorY); x.stroke();
  for (let i = -10; i <= 10; i++) {
    const a = P(fl, Math.abs(i) / 12, Math.abs(i) / 12 + .1);
    x.fillStyle = rgba(C.cream, .3 * a * (1 - flOut));
    x.fillRect(CX + i * 52 - 1, floorY + 10, 2, i % 5 === 0 ? 18 : 8);
  }
  // ball: anticipation → launch → fall (stretch) → impact (squash) → bounce → second impact → burst
  let y = CY, sx = 1, sy = 1, alive = true;
  if (t < .12) { const k = E.outQ(t / .12); sy = 1 - .32 * k; sx = 1 + .22 * k; y = CY + R * (1 - sy); }
  else if (t < .36) { const k = E.inC(P(t, .12, .36)); y = lerp(CY, -180, k); sy = 1 + 1.1 * Math.sin(Math.PI * clamp(P(t, .12, .36) * 1.2)); sx = 1 / Math.sqrt(sy); }
  else if (t < 1.0) { const k = P(t, .36, 1.0); y = lerp(-180, floorY - R, k * k); sy = 1 + .9 * k * k; sx = 1 / Math.sqrt(sy); }
  else if (t < 1.5) {
    const u = P(t, 1.0, 1.5); const h = 4 * u * (1 - u) * 210; y = floorY - R - h;
    const v = Math.abs(1 - 2 * u); const imp = Math.exp(-(t - 1.0) * 26);
    sy = 1 + .55 * v * v * (1 - imp) - .5 * imp; sx = 1 / Math.sqrt(Math.max(.2, sy));
  } else if (t < 1.58) { const k = E.outQ(P(t, 1.5, 1.58)); sy = 1 - .6 * k; sx = 1 + .9 * k; y = floorY - R * sy; }
  else alive = false;
  // contact shadow
  if (t > .36 && t < 1.58) {
    const hgt = clamp((floorY - R - y) / 700);
    x.fillStyle = rgba('#000000', .55 * (1 - hgt)); x.beginPath();
    x.ellipse(CX, floorY + 4, R * 1.3 * (1 - hgt * .6) * sx, 9 * (1 - hgt * .6), 0, 0, TAU); x.fill();
  }
  if (alive) {
    x.save(); x.translate(CX, sy < 1 && t > .9 ? floorY - R * sy : y); x.scale(sx, sy);
    circle(x, 0, 0, R, C.cream); x.restore();
    // designer HUD readout that tracks the ball
    const a = P(t, .45, .6) * (1 - P(t, 1.45, 1.55));
    if (a > 0 && y > 0) {
      x.globalAlpha = a; x.strokeStyle = rgba(C.cream, .5); x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(CX + R * sx + 10, y); x.lineTo(CX + 150, y - 40); x.lineTo(CX + 300, y - 40); x.stroke();
      x.fillStyle = C.cream; x.font = '18px JB'; x.textBaseline = 'bottom';
      const yq = Math.round(y / 4) * 4;
      x.fillText(`y ${yq.toString().padStart(4, '0')}px`, CX + 158, y - 48);
      x.fillStyle = C.lime; x.fillText(`scale ${sx.toFixed(2)} × ${sy.toFixed(2)}`, CX + 158, y - 72);
      x.globalAlpha = 1;
    }
  }
  // burst at the second impact
  if (t >= 1.5) {
    const cols = [C.coral, C.lime, C.violet];
    for (let i = 0; i < 3; i++) {
      const p = E.outX(P(t, 1.52 + i * .04, 1.95 + i * .04));
      ring(x, CX, floorY - 20, p * (380 + i * 220), 34 * (1 - p), cols[i]);
    }
    const r = rng(42);
    for (let i = 0; i < 44; i++) {
      const ang = -Math.PI * (i / 43) + (r() - .5) * .15, sp = 180 + r() * 720, col = [C.cream, C.coral, C.lime, C.violet][i % 4];
      const p = E.outX(P(t, 1.5, 1.9 + r() * .2)), d = p * sp, tail = (1 - p) * 140 + 4;
      x.strokeStyle = col; x.lineWidth = 6 * (1 - p) + 1.5; x.lineCap = 'round';
      const px = CX + Math.cos(ang) * d, py = floorY - 20 + Math.sin(ang) * d;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px - Math.cos(ang) * tail, py - Math.sin(ang) * tail); x.stroke();
    }
  }
  irisWipe(x, t, 1.66, 2.0, C.lime, C.coral);
}

// ═════════════════════════════════════════════════════════════════════════════
// 02 — KINETIC TYPE (2.0 → 4.5)   MOTION → E·MOTION
// ═════════════════════════════════════════════════════════════════════════════
function s2(x, t) {
  bg(x, C.coral);
  const fs = 310; x.font = `${fs}px "Archivo Black"`; x.textBaseline = 'alphabetic';
  const word = 'MOTION', base = CY + fs * .36;
  const ws = [...word].map(ch => x.measureText(ch).width), wM = ws.reduce((a, b) => a + b, 0), wE = x.measureText('E').width;
  // echo rows (outlined, counter-scrolling)
  const ea = E.outX(P(t, 3.3, 3.8));
  if (ea > 0) {
    x.save(); x.lineWidth = 3; x.strokeStyle = rgba(C.ink, .38 * ea);
    const row = 'EMOTION  EMOTION  EMOTION  EMOTION  ';
    const rw = x.measureText(row).width / 2;
    for (const [dy, dir] of [[-310, 1], [310, -1]]) {
      const off = ((t - 3.3) * 520 * dir + (dir > 0 ? -rw * .3 : -rw * .7)) % rw - rw * .5 + (1 - ea) * 400 * dir;
      x.strokeText(row, off, base + dy);
    }
    x.restore();
  }
  // E slams in on the 3.0 hit and pushes MOTION right
  const shift = E.outX(P(t, 2.97, 3.2)) * wE / 2;
  let px = CX - wM / 2 + shift;
  for (let i = 0; i < word.length; i++) {
    const p = E.outX(P(t, 2.04 + i * .055, 2.5 + i * .055));
    const jump = -46 * Math.sin(Math.PI * P(t, 2.5 + i * .045, 2.78 + i * .045));
    x.save();
    x.beginPath(); x.rect(px - 30, base - fs * .85, ws[i] + 60, fs * .9); x.clip();
    x.translate(px + ws[i] / 2, base + (1 - p) * fs * .95 + jump);
    x.rotate((1 - p) * .35);
    x.fillStyle = C.ink; x.fillText(word[i], -ws[i] / 2, 0);
    x.restore();
    px += ws[i];
  }
  const ep = P(t, 2.84, 3.0);
  if (ep > 0) {
    const ex = CX - (wM + wE) / 2, s = lerp(5, 1, E.inC(ep));
    x.save(); x.globalAlpha = clamp(ep * 3);
    x.translate(ex + wE / 2, base - fs * .36); x.scale(s, s);
    x.fillStyle = C.cream; x.fillText('E', -wE / 2, fs * .36); x.restore();
    // impact lines off the E
    const ip = P(t, 3.0, 3.3);
    if (ip > 0 && ip < 1) {
      x.strokeStyle = C.cream; x.lineWidth = 6 * (1 - ip); x.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * .72 + k * .22, r0 = 190 + E.outX(ip) * 60, r1 = r0 + 80 * (1 - ip);
        const ox = ex + wE / 2, oy = base - fs * .36;
        x.beginPath(); x.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0); x.lineTo(ox + Math.cos(a) * r1, oy + Math.sin(a) * r1); x.stroke();
      }
    }
  }
  // tagline, typed
  const tl = 'every frame, on purpose.', n = Math.floor(clamp(P(t, 3.15, 3.6)) * tl.length);
  if (n > 0) {
    x.font = 'italic 70px Serif'; x.fillStyle = C.ink; x.textBaseline = 'alphabetic';
    const tw = x.measureText(tl).width; x.fillText(tl.slice(0, n), CX - tw / 2 + shift * 0, base + 110);
    if (n < tl.length || Math.floor(t * 4) % 2 === 0) { x.fillRect(CX - tw / 2 + x.measureText(tl.slice(0, n)).width + 6, base + 58, 4, 64); }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 03 — PROCEDURAL SYSTEMS (4.25 → 7.0)   ripple grid, zoom into the centre cell
// ═════════════════════════════════════════════════════════════════════════════
function s3(x, t) {
  bg(x, C.ink);
  const cs = 120, cols = 19, rows = 11, T0 = 4.25;
  const zp = E.ioC(P(t, 6.25, 7.0)), Z = Math.pow(5.6, zp);
  const pal = [C.coral, C.lime, C.violet, C.cream, C.blue];
  x.save(); x.translate(CX, CY); x.scale(Z, Z); x.rotate(zp * .5);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const gxI = i - (cols - 1) / 2, gyI = j - (rows - 1) / 2, d = Math.hypot(gxI, gyI);
    const centre = gxI === 0 && gyI === 0;
    const a = E.outB(P(t, T0 + d * .035, T0 + .38 + d * .035));
    if (a <= 0) continue;
    const w = .5 + .5 * Math.sin(d * .85 - (t - T0) * 7.5);
    let pulse = 0; for (const p of [5.5, 6.0]) if (t > p) { const front = (t - p) * 16; pulse += Math.exp(-((d - front) ** 2) / 1.6) * Math.exp(-(t - p) * 1.5); }
    let s = cs * .4 * a * (.3 + .6 * w + .55 * pulse), m = w, rot = w * Math.PI / 4 + pulse * Math.PI / 2;
    let col = pal[((Math.floor(d - (t - T0) * 3.2) % 5) + 5) % 5];
    let alpha = 1;
    if (centre) { s = lerp(s, 50, zp > 0 ? E.outC(P(t, 6.25, 6.6)) : 0); m = lerp(m, 0, P(t, 6.25, 6.5)); rot *= 1 - P(t, 6.25, 6.5); if (P(t, 6.25, 6.4) > .5) col = C.cream; }
    else alpha = 1 - P(Z, 1.3, 3.2);
    if (alpha <= 0) continue;
    x.save(); x.globalAlpha = alpha; x.translate(gxI * cs, gyI * cs); x.rotate(rot);
    x.fillStyle = col; x.beginPath(); x.roundRect(-s, -s, 2 * s, 2 * s, s * (1 - m)); x.fill();
    x.restore();
  }
  x.restore();
  // crosshair guides that lock onto the centre during the zoom
  const g = P(t, 5.9, 6.2) * (1 - P(t, 6.8, 7.0));
  if (g > 0) {
    x.strokeStyle = rgba(C.cream, .35 * g); x.lineWidth = 1.5; x.setLineDash([6, 8]);
    x.beginPath(); x.moveTo(0, CY); x.lineTo(W, CY); x.moveTo(CX, 0); x.lineTo(CX, H); x.stroke(); x.setLineDash([]);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 04 — 3D / PARTICLES (7.0 → 9.5)  sphere → torus → cube → a bezier curve
// ═════════════════════════════════════════════════════════════════════════════
const N = 1500;
const PTS = (() => {
  const r = rng(7), a = [];
  for (let i = 0; i < N; i++) {
    const yy = 1 - 2 * (i + .5) / N, rr = Math.sqrt(1 - yy * yy), ph = i * 2.399963;
    const sphere = [Math.cos(ph) * rr * 280, yy * 280, Math.sin(ph) * rr * 280];
    const u = (i / N) * TAU * 34, v = (i * .618034 % 1) * TAU;
    const torus = [(270 + 105 * Math.cos(v)) * Math.cos(u), 105 * Math.sin(v), (270 + 105 * Math.cos(v)) * Math.sin(u)];
    const f = i % 6, s1_ = r() * 2 - 1, s2_ = r() * 2 - 1, h = 215;
    const cube = [[h, s1_ * h, s2_ * h], [-h, s1_ * h, s2_ * h], [s1_ * h, h, s2_ * h], [s1_ * h, -h, s2_ * h], [s1_ * h, s2_ * h, h], [s1_ * h, s2_ * h, -h]][f];
    a.push({ sphere, torus, cube, d: r(), u: r(), jx: (r() - .5), jy: (r() - .5), acc: i % 11 === 0 ? C.coral : i % 17 === 0 ? C.lime : null });
  }
  return a;
})();
// graph editor geometry (shared with scene 05 so particles land exactly on the curve)
const G = { x: 150, y: 250, w: 700, h: 600 };
function curvePt(u) {
  const p = [[0, 0], [.83, 0], [.17, 1], [1, 1]], m = 1 - u;
  const bxv = m * m * m * p[0][0] + 3 * m * m * u * p[1][0] + 3 * m * u * u * p[2][0] + u * u * u * p[3][0];
  const byv = m * m * m * p[0][1] + 3 * m * m * u * p[1][1] + 3 * m * u * u * p[2][1] + u * u * u * p[3][1];
  return [G.x + bxv * G.w, G.y + G.h - byv * G.h];
}
const RING = 'DESIGN • ANIMATE • DIRECT • DESIGN • ANIMATE • DIRECT • ';
function s4(x, t) {
  bg(x, C.ink);
  const glow = x.createRadialGradient(CX, CY, 0, CX, CY, 700);
  glow.addColorStop(0, rgba(C.violet, .28)); glow.addColorStop(1, rgba(C.violet, 0));
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  const ry = (t - 7) * 1.5 + .3, rx = .45 + .25 * Math.sin((t - 7) * 1.6);
  const cyy = Math.cos(ry), syy = Math.sin(ry), cxx = Math.cos(rx), sxx = Math.sin(rx);
  let beat = 0; for (const b of [7.5, 8, 8.5, 9]) if (t > b) beat += .05 * Math.exp(-(t - b) * 10);
  const burst = t >= 7 ? .32 * (1 - Math.exp(-(t - 7) * 14)) * Math.exp(-(t - 7) * 3.2) : 0;
  const sc = 1 + burst + beat, D = 1400, f = 1400;
  const items = [];
  const toCurve = t > 8.95;
  for (const p of PTS) {
    const k1 = E.ioC(P(t, 7.38 + p.d * .15, 7.82 + p.d * .15)), k2 = E.ioC(P(t, 8.22 + p.d * .15, 8.62 + p.d * .15));
    let X = lerp(lerp(p.sphere[0], p.torus[0], k1), p.cube[0], k2) * sc;
    let Y = lerp(lerp(p.sphere[1], p.torus[1], k1), p.cube[1], k2) * sc;
    let Z = lerp(lerp(p.sphere[2], p.torus[2], k1), p.cube[2], k2) * sc;
    let x1 = X * cyy + Z * syy, z1 = -X * syy + Z * cyy, y1 = Y * cxx - z1 * sxx, z2 = Y * sxx + z1 * cxx;
    const zc = z2 + D, pr = f / zc;
    let px = CX + x1 * pr, py = CY + y1 * pr, depth = clamp((z2 + 350) / 700);
    let size = lerp(4.2, 1.2, depth) * (pr > 0 ? 1 : 0);
    if (toCurve) {
      const k = E.ioC(P(t, 8.95 + p.d * .2, 9.4 + p.d * .06));
      const [cxp, cyp] = curvePt(p.u);
      const spread = (1 - k) * 24;
      px = lerp(px, cxp + p.jx * spread, k); py = lerp(py, cyp + p.jy * spread, k);
      size = lerp(size, 3.2, k); depth = lerp(depth, 0, k);
    }
    const col = p.acc || mixHex(C.cream, C.violet, depth * .9);
    items.push([z2, 0, px, py, size, col, 1 - depth * .55]);
  }
  // 3D text ring
  const ra = P(t, 7.15, 7.6) * (1 - P(t, 8.85, 9.1));
  if (ra > 0) {
    const rr = 560 * sc, n = RING.length, tilt = .38;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU - (t - 7) * .9;
      const X = Math.cos(a) * rr, Z = Math.sin(a) * rr, Y = 0;
      const y1 = Y * Math.cos(tilt) - Z * Math.sin(tilt), z1 = Y * Math.sin(tilt) + Z * Math.cos(tilt);
      const pr = f / (z1 + D);
      items.push([z1, 1, CX + X * pr, CY + y1 * pr + 20, pr, RING[i], ra * lerp(1, .22, clamp((z1 + rr) / (2 * rr))), a]);
    }
  }
  items.sort((a, b) => b[0] - a[0]);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const it of items) {
    if (it[1] === 0) { x.globalAlpha = it[6]; x.fillStyle = it[5]; x.beginPath(); x.arc(it[2], it[3], it[4], 0, TAU); x.fill(); }
    else {
      x.globalAlpha = it[6]; x.fillStyle = C.cream; x.font = `${Math.round(46 * it[4])}px "Archivo Black"`;
      x.save(); x.translate(it[2], it[3]); x.scale(-Math.sin(it[7]) * .25 + .75, 1); x.fillText(it[5], 0, 0); x.restore();
    }
  }
  x.globalAlpha = 1; x.textAlign = 'left';
  // the circle from the grid "shatters" into the sphere
  const disc = 1 - E.outC(P(t, 7.0, 7.22));
  if (disc > 0) circle(x, CX, CY, 280 * (1 + burst * .5), rgba(C.cream, disc));
}

// ═════════════════════════════════════════════════════════════════════════════
// 05 — TIMING & EASING (9.5 → 12.0)  graph editor + four balls, four personalities
// ═════════════════════════════════════════════════════════════════════════════
const LANES = [
  { name: 'LINEAR', fn: E.lin, col: C.ink },
  { name: 'CUBIC-BEZIER(.83,0,.17,1)', fn: EXPO_IO, col: C.coral },
  { name: 'BACK OUT', fn: E.outB, col: C.violet },
  { name: 'ELASTIC OUT', fn: E.outEl, col: C.blue },
];
const LX0 = 1060, LX1 = 1740, LY = [360, 500, 640, 780];
function s5(x, t) {
  bg(x, C.cream);
  const out_ = E.inX(P(t, 11.3, 11.8)), panelX = -out_ * 1100;
  // graph panel
  x.save(); x.translate(panelX, 0);
  x.fillStyle = C.paper; x.beginPath(); x.roundRect(G.x - 50, G.y - 90, G.w + 100, G.h + 170, 22); x.fill();
  x.strokeStyle = rgba(C.ink, .09); x.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(G.x + i * G.w / 8, G.y); x.lineTo(G.x + i * G.w / 8, G.y + G.h); x.stroke();
    x.beginPath(); x.moveTo(G.x, G.y + i * G.h / 8); x.lineTo(G.x + G.w, G.y + i * G.h / 8); x.stroke();
  }
  x.font = '17px JB'; x.fillStyle = rgba(C.ink, .55); x.textBaseline = 'alphabetic';
  x.fillText('GRAPH EDITOR  ·  VALUE', G.x, G.y - 44);
  x.fillText('TIME →', G.x + G.w - 70, G.y + G.h + 40);
  x.fillStyle = C.coral; x.fillText('cubic-bezier(0.83, 0, 0.17, 1)', G.x, G.y + G.h + 40);
  // handles pop out
  const h1 = E.outB(P(t, 9.55, 9.9)), h2 = E.outB(P(t, 9.62, 9.97));
  const [p0x, p0y] = [G.x, G.y + G.h], [p3x, p3y] = [G.x + G.w, G.y];
  const p1 = [lerp(p0x, G.x + .83 * G.w, h1), p0y], p2 = [lerp(p3x, G.x + .17 * G.w, h2), p3y];
  x.strokeStyle = C.coral; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(p0x, p0y); x.lineTo(p1[0], p1[1]); x.moveTo(p3x, p3y); x.lineTo(p2[0], p2[1]); x.stroke();
  x.strokeStyle = C.ink; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(p0x, p0y); x.bezierCurveTo(G.x + .83 * G.w, p0y, G.x + .17 * G.w, p3y, p3x, p3y); x.stroke();
  for (const [hx, hy, k] of [[p1[0], p1[1], h1], [p2[0], p2[1], h2]]) {
    if (k <= 0) continue; x.fillStyle = C.coral; x.save(); x.translate(hx, hy); x.rotate(Math.PI / 4); x.fillRect(-11 * k, -11 * k, 22 * k, 22 * k); x.restore();
  }
  circle(x, p0x, p0y, 10, C.ink); circle(x, p3x, p3y, 10, C.ink);
  // playhead
  const u = P(t, 10.0, 11.1);
  if (t > 9.9) {
    const phx = G.x + u * G.w, v = EXPO_IO(u), phy = G.y + G.h - v * G.h;
    x.strokeStyle = rgba(C.coral, .9); x.lineWidth = 2;
    x.beginPath(); x.moveTo(phx, G.y - 10); x.lineTo(phx, G.y + G.h + 10); x.stroke();
    x.setLineDash([4, 6]); x.beginPath(); x.moveTo(G.x, phy); x.lineTo(phx, phy); x.stroke(); x.setLineDash([]);
    circle(x, phx, phy, 14, C.coral); circle(x, phx, phy, 6, C.cream);
    x.fillStyle = C.ink; x.font = '20px JB'; x.fillText(v.toFixed(3), phx + 22, phy - 16);
  }
  x.restore();
  // title
  const ta = E.outX(P(t, 9.62, 10.1));
  x.save(); x.globalAlpha = ta * (1 - out_); x.font = 'italic 84px Serif'; x.fillStyle = C.ink;
  x.fillText('timing is everything.', LX0 - 8, 250 - (1 - ta) * 40); x.restore();
  // lanes
  const merge = P(t, 11.32, 11.86);
  LANES.forEach((ln, k) => {
    const y = LY[k], app = E.outB(P(t, 9.62 + k * .06, 9.98 + k * .06));
    const la = (1 - P(t, 11.25, 11.5)) * clamp(app);
    if (la > 0) {
      x.globalAlpha = la;
      x.strokeStyle = rgba(C.ink, .18); x.lineWidth = 2; x.setLineDash([2, 10]);
      x.beginPath(); x.moveTo(LX0, y); x.lineTo(LX1, y); x.stroke(); x.setLineDash([]);
      x.fillStyle = rgba(C.ink, .6); x.font = '16px JB'; x.fillText(ln.name, LX0, y - 42);
      for (const kx of [LX0, LX1]) { x.save(); x.translate(kx, y + 44); x.rotate(Math.PI / 4); x.fillStyle = C.ink; x.fillRect(-6, -6, 12, 12); x.restore(); }
      x.globalAlpha = 1;
    }
    // onion skin
    const pos = uu => lerp(LX0, LX1, ln.fn(clamp(uu)));
    if (t > 10.0 && t < 11.35) for (let j = 6; j >= 1; j--) {
      const uj = u - j * .03; if (uj <= 0) continue;
      ring(x, pos(uj), y, 26, 2, rgba(ln.col, .22 * (1 - j / 7)));
    }
    let bxp = pos(u), byp = y, r = 26 * clamp(app, 0, 2);
    const vel = (pos(u + .01) - pos(u - .01)) / .02 / 680;
    let st = u > 0 && u < 1 ? 1 + Math.min(.9, Math.abs(vel) * .22) : 1;
    let col = ln.col;
    if (merge > 0) {
      const m = E.ioC(clamp(P(t, 11.32 + k * .03, 11.8)));
      const cx1 = lerp(LX1, CX, .5) + 120, cy1 = y - 260;
      bxp = (1 - m) * (1 - m) * LX1 + 2 * (1 - m) * m * cx1 + m * m * CX;
      byp = (1 - m) * (1 - m) * y + 2 * (1 - m) * m * cy1 + m * m * CY;
      r = lerp(26, 46, m); st = 1 + Math.sin(Math.PI * m) * .5; col = mixHex(ln.col, C.ink, m);
    }
    x.save(); x.translate(bxp, byp);
    if (merge > 0 && merge < 1) x.rotate(Math.atan2(CY - byp, CX - bxp));
    x.scale(st, 1 / st); circle(x, 0, 0, r, col); x.restore();
  });
  irisWipe(x, t, 11.8, 12.0, C.coral, C.ink, 46);
}

// ═════════════════════════════════════════════════════════════════════════════
// 06 — IDENTITY (12.0 → 15.0)
// ═════════════════════════════════════════════════════════════════════════════
const DUST = (() => { const r = rng(99); return Array.from({ length: 140 }, () => [r() * W, r() * H, r() * 2 + .6, r() * .5 + .2, r()]); })();
const SKILLS = '2D  ·  3D  ·  KINETIC TYPE  ·  UI MOTION  ·  PROCEDURAL  ·  SOUND DESIGN  ·  ART DIRECTION  ·  ';
function s6(x, t) {
  bg(x, C.ink);
  // dust
  for (const [dx, dy, s, a, ph] of DUST) {
    const yy = ((dy - (t - 12) * 30 * (s + .5)) % H + H) % H;
    x.fillStyle = rgba(C.cream, a * .35 * P(t, 12.0, 12.6)); x.fillRect(dx + Math.sin(t * 1.3 + ph * 9) * 10, yy, s, s);
  }
  const col = E.inX(P(t, 14.68, 14.9)), S = 1 - col;
  x.save(); x.translate(CX, CY); x.scale(S, S); x.rotate(col * .25); x.translate(-CX, -CY);
  // orbit rings
  const ra = E.outX(P(t, 12.05, 12.7));
  x.save(); x.translate(CX, CY - 30); x.rotate((t - 12) * .35);
  x.setLineDash([2, 16]); x.lineCap = 'round'; ring(x, 0, 0, 470 * ra, 2, rgba(C.cream, .22)); x.setLineDash([]);
  ring(x, 0, 0, 395 * ra, 1, rgba(C.cream, .1));
  if (ra > .05) { const a = (t - 12) * 2.1; circle(x, Math.cos(a) * 470 * ra, Math.sin(a) * 470 * ra, 10, C.coral); circle(x, Math.cos(a + 2.4) * 395 * ra, Math.sin(a + 2.4) * 395 * ra, 6, C.lime); }
  x.restore();
  // wordmark: lime bar wipe reveal
  const fs = 290; x.font = `${fs}px "Archivo Black"`; x.textBaseline = 'alphabetic';
  const word = 'CLAUDE', ww = x.measureText(word).width, L = CX - ww / 2, base = CY - 30 + fs * .36;
  const barR = L - 20 + (ww + 40) * E.ioX(P(t, 12.0, 12.34)), barL = L - 20 + (ww + 40) * E.ioX(P(t, 12.3, 12.66));
  x.save(); x.beginPath(); x.rect(0, 0, barL, H); x.clip();
  x.fillStyle = C.cream; x.fillText(word, L, base);
  // light sweep across the wordmark
  const sw = P(t, 14.1, 14.6);
  if (sw > 0 && sw < 1) {
    const sxp = lerp(L - 300, L + ww + 300, E.ioC(sw));
    const g = x.createLinearGradient(sxp - 180, 0, sxp + 180, 0);
    g.addColorStop(0, rgba(C.lime, 0)); g.addColorStop(.5, rgba(C.lime, 1)); g.addColorStop(1, rgba(C.lime, 0));
    x.fillStyle = g; x.fillText(word, L, base);
  }
  x.restore();
  if (barR > barL) { x.fillStyle = C.lime; x.fillRect(barL, base - fs * .78, barR - barL, fs * .86); }
  // signature
  const sg = E.outC(P(t, 12.62, 13.05));
  if (sg > 0) {
    x.save(); x.translate(L + ww - 470, base + 78); x.rotate(-.09);
    x.beginPath(); x.rect(-30, -190, 760 * sg, 290); x.clip();
    x.font = 'italic 180px Serif'; x.fillStyle = C.coral; x.fillText('showreel', 0, 0); x.restore();
  }
  // subtitle decode
  x.font = '26px JB'; x.letterSpacing = '8px'; x.fillStyle = C.cream; x.textAlign = 'center';
  x.fillText(scramble('MOTION DESIGNER · ANIMATOR · ART DIRECTOR', P(t, 12.55, 13.3), t, 5), CX, base + 150);
  x.letterSpacing = '0px';
  // availability
  const av = E.outX(P(t, 13.5, 13.9));
  if (av > 0) {
    x.globalAlpha = av; x.font = '19px JB'; x.fillStyle = rgba(C.cream, .75);
    const lab = 'AVAILABLE FOR NEW PROJECTS', lw = x.measureText(lab).width;
    x.textAlign = 'left'; x.fillText(lab, CX - lw / 2 + 16, base + 208 + (1 - av) * 20);
    const pulse = (t * 2) % 1;
    circle(x, CX - lw / 2 - 10, base + 201 + (1 - av) * 20, 7, C.lime);
    ring(x, CX - lw / 2 - 10, base + 201 + (1 - av) * 20, 7 + pulse * 16, 2, rgba(C.lime, 1 - pulse));
    x.globalAlpha = 1;
  }
  x.textAlign = 'left';
  // skills marquee
  const mq = E.outX(P(t, 13.45, 13.9));
  if (mq > 0) {
    const my = 918;
    x.globalAlpha = mq; x.strokeStyle = rgba(C.cream, .16); x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, my - 30); x.lineTo(W, my - 30); x.moveTo(0, my + 18); x.lineTo(W, my + 18); x.stroke();
    x.font = '18px JB'; x.fillStyle = rgba(C.cream, .5);
    const mw = x.measureText(SKILLS).width, off = -((t - 13.45) * 160) % mw;
    for (let k = -1; k < 4; k++) x.fillText(SKILLS, off + k * mw, my);
    x.globalAlpha = 1;
  }
  x.restore();
  // everything collapses back into the dot the reel started with — seamless loop
  const dp = E.outB(P(t, 14.84, 14.97));
  if (dp > 0) circle(x, CX, CY, 46 * dp, C.cream);
}

// ─── scene dispatch with transitions ─────────────────────────────────────────
function scene(x, t) {
  const [sx, sy, rot] = shake(t);
  x.save(); x.translate(CX + sx, CY + sy); x.rotate(rot); x.translate(-CX, -CY);
  if (t < 2.0) s1(x, t);
  else if (t < 4.0) s2(x, t);
  else if (t < 4.5) {
    s3(x, t);
    tx.setTransform(1, 0, 0, 1, 0, 0); s2(tx, t);
    const n = 9, hh = H / n;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1, k = E.inX(P(t, 4.0 + i * .025, 4.32 + i * .025));
      x.drawImage(tmpC, 0, i * hh, W, hh + 1, dir * k * W * 1.05, i * hh, W, hh + 1);
    }
  }
  else if (t < 7.0) s3(x, t);
  else if (t < 9.5) s4(x, t);
  else if (t < 12.0) s5(x, t);
  else s6(x, t);
  x.restore();
}

// ─── HUD overlay (drawn sharp, on top of the motion-blurred plate) ───────────
const TITLES = [[0, '01', 'SQUASH & STRETCH'], [2, '02', 'KINETIC TYPE'], [4.3, '03', 'PROCEDURAL SYSTEMS'], [7, '04', '3D / PARTICLES'], [9.5, '05', 'TIMING & EASING'], [12, '06', 'IDENTITY']];
function hud(x, t) {
  const a = E.outC(P(t, .05, .45)) * (1 - P(t, 14.55, 14.8));
  if (a <= 0) return;
  const light = (t >= 2.0 && t < 4.3) || (t >= 9.5 && t < 12.0);
  const fg = light ? C.ink : C.cream;
  x.save(); x.globalAlpha = a;
  const m = 56, b = 26;
  x.strokeStyle = rgba(fg, .7); x.lineWidth = 2;
  for (const [px, py, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    x.beginPath(); x.moveTo(px, py + dy * b); x.lineTo(px, py); x.lineTo(px + dx * b, py); x.stroke();
  }
  x.textBaseline = 'middle'; x.fillStyle = fg;
  x.font = '800 19px Inter'; x.fillText('CLAUDE', m + 40, m + 14);
  const cw = x.measureText('CLAUDE').width;
  x.font = '500 19px Inter'; x.fillStyle = rgba(fg, .6); x.fillText('/  SHOWREEL 2026', m + 50 + cw, m + 14);
  // scene title with scramble on every cut
  let cur = TITLES[0]; for (const tt of TITLES) if (t >= tt[0]) cur = tt;
  const sp = P(t, cur[0], cur[0] + .35);
  x.font = '17px JB'; x.textAlign = 'right'; x.fillStyle = fg;
  x.fillText(scramble(cur[2], sp, t, cur[0] * 10), W - m - 40, m + 14);
  x.fillStyle = light ? C.ink : C.lime; x.fillText(cur[1] + ' —', W - m - 48 - x.measureText(cur[2]).width, m + 14);
  // timecode
  const fr = Math.min(DUR * FPS - 1, Math.round(t * FPS)), ss = Math.floor(fr / FPS), ff = fr % FPS;
  x.textAlign = 'left'; x.fillStyle = rgba(fg, .6); x.fillText('TC', m + 40, H - m - 14);
  x.fillStyle = fg; x.fillText(`00:00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, m + 76, H - m - 14);
  // beat counter + progress
  const beat = Math.floor(t * 2) % 4;
  for (let i = 0; i < 4; i++) { x.fillStyle = i === beat ? (light ? C.ink : C.lime) : rgba(fg, .22); x.fillRect(W - m - 40 - 286 + i * 18, H - m - 20, 12, 12); }
  x.fillStyle = rgba(fg, .6); x.fillText('120 BPM', W - m - 40 - 380, H - m - 14);
  x.fillStyle = rgba(fg, .2); x.fillRect(W - m - 40 - 200, H - m - 15, 200, 2);
  x.fillStyle = fg; x.fillRect(W - m - 40 - 200, H - m - 16, 200 * clamp(t / DUR), 4);
  x.restore();
}

// ─── film grain + vignette ───────────────────────────────────────────────────
const GRAIN = Array.from({ length: 6 }, (_, k) => {
  const [c, g] = mk(384, 384), id = g.createImageData(384, 384), r = rng(k + 1);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0); return c;
});
const VIG = (() => {
  const [c, g] = mk(); const gr = g.createRadialGradient(CX, CY, 500, CX, CY, 1250);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
})();

// ─── frame composer ──────────────────────────────────────────────────────────
let SAMPLES = 5, SHUTTER = .5; // 180° shutter
const FAST = [[1.45, 2.02], [2.8, 3.05], [3.95, 4.5], [6.2, 7.1], [8.9, 9.5], [11.3, 12.7], [14.6, 15]];
function renderFrame(t) {
  // 1. motion-blurred plate: running average of sub-frame renders
  const fast = SAMPLES > 2 && FAST.some(([a, b]) => t >= a && t <= b);
  const n = fast ? SAMPLES * 3 : SAMPLES;
  for (let k = 0; k < n; k++) {
    const ts = Math.min(DUR - 1e-4, t + (k / n - .5) * SHUTTER / FPS);
    bx.setTransform(1, 0, 0, 1, 0, 0); scene(bx, Math.max(0, ts));
    ax.globalAlpha = 1 / (k + 1); ax.drawImage(bufC, 0, 0);
  }
  ax.globalAlpha = 1;
  // 2. chromatic aberration on hits
  const ca = env(t, 16) * 9;
  out.globalCompositeOperation = 'source-over';
  if (ca > .6) {
    out.fillStyle = '#000'; out.fillRect(0, 0, W, H);
    [['#FF0000', -ca], ['#00FF00', 0], ['#0000FF', ca]].forEach(([col, dx]) => {
      chx.globalCompositeOperation = 'source-over'; chx.drawImage(accC, dx, 0);
      chx.globalCompositeOperation = 'multiply'; chx.fillStyle = col; chx.fillRect(0, 0, W, H);
      out.globalCompositeOperation = 'lighter'; out.drawImage(chC, 0, 0);
    });
    out.globalCompositeOperation = 'source-over';
  } else out.drawImage(accC, 0, 0);
  // 3. flash, HUD, grain, vignette
  const fl = env(t, 22) * .16;
  if (fl > .005) { out.fillStyle = `rgba(255,255,255,${fl})`; out.fillRect(0, 0, W, H); }
  hud(out, t);
  out.globalCompositeOperation = 'overlay'; out.globalAlpha = .075;
  const gc = GRAIN[Math.floor(t * FPS) % GRAIN.length];
  for (let y = 0; y < H; y += 384) for (let x = 0; x < W; x += 384) out.drawImage(gc, x, y);
  out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1;
  out.drawImage(VIG, 0, 0);
}

window.ready = (async () => {
  await Promise.all(['40px "Archivo Black"', '20px JB', '800 20px Inter', '500 20px Inter', 'italic 40px Serif'].map(f => document.fonts.load(f)));
  if (!new URLSearchParams(location.search).has('render')) startPreview();
  return true;
})();
window.renderFrame = renderFrame;

// ─── live preview: open reel.html in a browser, click to play with sound ─────
function startPreview() {
  document.body.classList.add('preview');
  SAMPLES = 2;
  const audio = new Audio('soundtrack.wav');
  let t0 = null;
  renderFrame(0);
  document.body.addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); t0 = performance.now(); });
  (function loop(now) {
    if (t0 !== null) { const t = (now - t0) / 1000; if (t < DUR) renderFrame(t); else { renderFrame(0); t0 = null; } }
    requestAnimationFrame(loop);
  })(performance.now());
}
