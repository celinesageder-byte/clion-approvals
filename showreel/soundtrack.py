"""Synthesizes the showreel soundtrack (15s, 120 BPM, A minor), cut to the same hit list as reel.js.

Everything is generated from oscillators and noise — no samples. Writes soundtrack.wav (48 kHz, 16-bit stereo).
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)
T = np.arange(N) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, at, gain=1.0, pan=0.0, bus=None):
    """Add a mono (or (2,n) stereo) signal at time `at`."""
    bl, br = bus if bus is not None else (L, R)
    i = int(at * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        sig = np.stack([sig * np.sqrt(0.5 * (1 - pan)), sig * np.sqrt(0.5 * (1 + pan))])
    n = min(sig.shape[1], N - i)
    bl[i:i + n] += sig[0, :n] * gain
    br[i:i + n] += sig[1, :n] * gain


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def sweep_filter(x, f0, f1, kind='bandpass', width=0.6, curve=2.0, block=256):
    """Band/low-pass with a moving cutoff (block-wise, filter state carried over)."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for s in range(0, n, block):
        p = (s / max(1, n - 1)) ** curve
        fc = f0 * (f1 / f0) ** p
        if kind == 'bandpass':
            sos = butter(2, [fc * (1 - width / 2), min(fc * (1 + width / 2), SR / 2 - 100)], btype='bandpass', fs=SR, output='sos')
        else:
            sos = butter(2, min(fc, SR / 2 - 100), btype=kind, fs=SR, output='sos')
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = np.zeros((sos.shape[0], 2))
        out[s:s + block], zi = sosfilt(sos, x[s:s + block], zi=zi)
    return out


def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)


def saw(freq, n, phase=0.0):
    ph = (np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR + phase) % 1
    return 2 * ph - 1


# ─── instruments ─────────────────────────────────────────────────────────────
def kick(g=1.0, length=0.45):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 48 + 140 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = filt(rng.standard_normal(n), 'highpass', 3000) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * g


def hat(g=1.0, d=0.035):
    n = int(0.15 * SR)
    return filt(rng.standard_normal(n), 'highpass', 8000, 4) * env(n, 0.0005, d) * g


def clap(g=1.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    e = sum(np.exp(-np.maximum(0, t - o) / 0.008) * (t >= o) for o in (0, 0.011, 0.022)) + np.exp(-np.maximum(0, t - 0.03) / 0.12) * (t >= 0.03)
    return filt(rng.standard_normal(n), 'bandpass', [900, 4200]) * e * 0.8 * g


def impact(g=1.0, length=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.7)
    crash = filt(rng.standard_normal(n), 'lowpass', 5000) * np.exp(-t / 0.35) * 0.5
    return np.tanh((sub * 1.3 + crash) * 1.4) * g


def whoosh(length, f0, f1, g=1.0, curve=2.0, rev=False):
    n = int(length * SR)
    x = sweep_filter(rng.standard_normal(n), f0, f1, 'bandpass', 0.9, curve)
    e = np.sin(np.pi * np.linspace(0, 1, n) ** (0.6 if not rev else 2.5)) ** 2
    if rev:
        e = np.linspace(0, 1, n) ** 3
    return x * e * g * 2.2


def riser(length, g=1.0, f0=200, f1=1800):
    n = int(length * SR)
    p = np.linspace(0, 1, n)
    freq = f0 * (f1 / f0) ** (p ** 1.6)
    tone = sum(saw(freq * d, n, k * 0.3) for k, d in enumerate((1, 1.006, 0.994)))
    tone = sweep_filter(tone, 400, 9000, 'lowpass', curve=1.5) * 0.18
    nz = sweep_filter(rng.standard_normal(n), 500, 9000, 'bandpass', 1.0, 1.5) * 0.6
    return (tone + nz) * p ** 2.2 * g


def blip(freq, g=1.0, d=0.08, glide=1.0):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = freq * glide ** (t / 0.05).clip(0, 1)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, d) * g


def pluck(freq, g=1.0, d=0.16, bright=3500):
    n = int(0.6 * SR)
    x = saw(freq, n) + 0.5 * saw(freq * 2.003, n, 0.3)
    x = filt(x, 'lowpass', bright) * env(n, 0.001, d)
    return x * g


def bell(freq, g=1.0):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / dd) for r, a, dd in ((1, 1, .5), (2.76, .45, .2), (5.4, .2, .08), (4.0, .15, .15)))
    return x * env(n, 0.001, 10) * g


def reverb(bl, br, length=2.2, mix=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    irs = [filt(rng.standard_normal(n), 'lowpass', 6000) * np.exp(-t / (length / 6.5)) for _ in range(2)]
    for ir in irs:
        ir /= np.sqrt(np.sum(ir ** 2))
    return fftconvolve(bl, irs[0])[:N] * mix, fftconvolve(br, irs[1])[:N] * mix


# ─── arrangement ─────────────────────────────────────────────────────────────
# chords per 2s bar (A minor): Am  F  C  G  Am  F  Am
CHORDS = {2: [57, 60, 64, 69], 4: [53, 57, 60, 65], 6: [55, 60, 64, 67], 8: [55, 59, 62, 67], 10: [57, 60, 64, 69], 12: [53, 57, 60, 65], 14: [57, 60, 64, 69]}
ROOTS = {2: 33, 4: 29, 6: 36, 8: 31, 10: 33, 12: 29, 14: 33}


def chord_at(t):
    k = max([b for b in CHORDS if b <= t], default=2)
    return CHORDS[k], ROOTS[k]


rev_l, rev_r = np.zeros(N), np.zeros(N)
REV = (rev_l, rev_r)

# kicks: sparse intro, four-on-the-floor from 2.0, dropouts before 7.0 / 9.5 / 12.0, out at 14.7
KICKS = [1.0, 1.5] + [b / 2 for b in range(4, 30) if b / 2 not in (6.5, 9.0, 11.5, 14.5)]
for k in KICKS:
    place(kick(0.55 if k == 1.0 else 1.0), k)

# sidechain pump
duck = np.ones(N)
for k in KICKS:
    i = int(k * SR)
    seg = 1 - 0.75 * np.exp(-np.arange(N - i) / SR / 0.11)
    duck[i:] = np.minimum(duck[i:], seg)

# hats
for s in np.arange(2.25, 14.6, 0.5):
    if not (6.4 < s < 7.0 or 8.95 < s < 9.5 or 11.4 < s < 12.0):
        place(hat(0.35), s, pan=0.3)
for s in np.arange(4.5, 6.4, 0.125):
    place(hat(0.14, 0.02), s, pan=-0.35)
for s in np.arange(12.0, 14.6, 0.125):
    if s % 0.5:
        place(hat(0.12, 0.02), s, pan=-0.35)

# claps on 2 and 4
for s in np.arange(2.5, 14.6, 1.0):
    if s not in (6.5, 9.5, 11.5):
        place(clap(0.5), s)
        place(clap(0.25), s, bus=REV)
# snare roll into 7.0 and 12.0
for t0, t1 in ((6.5, 7.0), (11.5, 12.0)):
    steps = np.concatenate([np.arange(t0, t0 + 0.25, 0.0625), np.arange(t0 + 0.25, t1, 0.03125)])
    for i, s in enumerate(steps):
        place(clap(0.12 + 0.4 * i / len(steps)), s, pan=(-1) ** i * 0.2)

# bass + sub (pumped)
bass = np.zeros(N)
sub = np.zeros(N)
for b in range(2, 15, 2):
    _, root = chord_at(b)
    i0, i1 = int(b * SR), int(min(b + 2, 14.7) * SR)
    n = i1 - i0
    t = np.arange(n) / SR
    bass[i0:i1] += filt(saw(midi(root + 12), n), 'lowpass', 520) * 0.35
    sub[i0:i1] += np.sin(2 * np.pi * midi(root) * t) * 0.5
# eighth-note gate on the mid bass
gate = 0.55 + 0.45 * ((T * 4) % 1 < 0.6)
mute = ((T > 6.45) & (T < 7.0)) | ((T > 8.95) & (T < 9.5)) | ((T > 11.45) & (T < 12.0))
bass_mix = (bass * gate + sub) * duck * (~mute) * (T >= 2.0)
L += bass_mix
R += bass_mix

# pad (supersaw), from 7.0 on
pad_l, pad_r = np.zeros(N), np.zeros(N)
for b in range(6, 15, 2):
    notes, _ = chord_at(b)
    t_start = max(b, 7.0)
    i0, i1 = int(t_start * SR), int(min(b + 2, 14.75) * SR)
    n = i1 - i0
    if n <= 0:
        continue
    for m in notes:
        for d, pan in ((0.994, -0.8), (0.998, -0.3), (1.0, 0), (1.003, 0.35), (1.007, 0.8)):
            x = saw(midi(m) * d, n, rng.random())
            pad_l[i0:i1] += x * np.sqrt(0.5 * (1 - pan))
            pad_r[i0:i1] += x * np.sqrt(0.5 * (1 + pan))
pad_env = np.clip((T - 7.0) / 0.6, 0, 1) * (1 - np.clip((T - 14.55) / 0.2, 0, 1)) * (1 - 0.6 * (((T > 9.5) & (T < 12.0))))
for arr in (pad_l, pad_r):
    arr[:] = filt(arr, 'lowpass', 1800) * 0.022 * pad_env * (0.35 + 0.65 * duck)
L += pad_l
R += pad_r
rev_l += pad_l * 0.5
rev_r += pad_r * 0.5

# arp: 16ths through the chord, from 4.5, with ping-pong delay
arp_l, arp_r = np.zeros(N), np.zeros(N)
pattern = [0, 1, 2, 3, 2, 1, 3, 4]
for i, s in enumerate(np.arange(4.5, 14.6, 0.125)):
    if 6.45 < s < 7.0 or 8.95 < s < 9.5 or 11.4 < s < 12.0:
        continue
    notes, _ = chord_at(s)
    idx = pattern[i % 8]
    m = notes[idx % 4] + 12 * (idx // 4) + 12
    bright = 1800 + 2600 * (0.5 + 0.5 * np.sin(s * 1.7))
    place(pluck(midi(m), 0.09, 0.12, bright), s, pan=0.0, bus=(arp_l, arp_r))
dly = int(0.375 * SR)
for i in range(1, 5):
    g = 0.45 ** i
    src_l, src_r = (arp_r, arp_l) if i % 2 else (arp_l, arp_r)
    L[i * dly:] += src_l[:-i * dly] * g
    R[i * dly:] += src_r[:-i * dly] * g
L += arp_l
R += arp_r
rev_l += arp_l * 0.6
rev_r += arp_r * 0.6

# ─── sound design, synced to picture ─────────────────────────────────────────
# 01 anticipation + launch + fall
place(blip(220, 0.25, 0.1, glide=0.6), 0.0)
place(whoosh(0.28, 400, 3000, 0.35, curve=0.7), 0.1)
n = int(0.62 * SR)
fall_f = 1400 * (180 / 1400) ** (np.linspace(0, 1, n) ** 1.3)
place(np.sin(2 * np.pi * np.cumsum(fall_f) / SR) * np.linspace(0.02, 0.12, n), 0.37, pan=-0.1)
place(blip(95, 0.5, 0.12, glide=0.5), 1.0)                  # land
place(blip(460, 0.18, 0.18, glide=1.5), 1.0, bus=REV)       # boing
place(impact(0.9), 1.5)                                     # burst
place(whoosh(0.9, 3000, 300, 0.35, curve=0.5), 1.5, pan=0.2)
place(impact(0.5), 1.5, bus=REV)
place(whoosh(0.4, 300, 6000, 0.55, curve=1.4), 1.62)        # iris wipe

# 02 letters tick in, E slam, typing
for i in range(6):
    place(blip(midi(81 + [0, 3, 5, 7, 10, 12][i]), 0.16, 0.05), 2.04 + i * 0.055, pan=-0.5 + i * 0.2)
place(whoosh(0.18, 800, 8000, 0.4, rev=True), 2.82)
place(impact(1.0, 1.6), 3.0)
place(clap(0.8), 3.0)
place(clap(0.5), 3.0, bus=REV)
for i in range(24):
    place(hat(0.13, 0.008), 3.15 + i * 0.45 / 24, pan=0.3 * np.sin(i))
for i in range(9):                                           # stripe swishes
    place(whoosh(0.22, 1500, 7000, 0.12), 4.0 + i * 0.025, pan=(-1) ** i * 0.7)

# 03 grid: sonar pings on the pulses, zoom riser
for s in (5.5, 6.0):
    place(blip(midi(88), 0.2, 0.25), s, bus=REV)
    place(blip(midi(88), 0.12, 0.25), s, pan=0.4)
place(riser(0.78, 0.9), 6.22)

# 04 particles: sphere burst, morph swooshes, reverse cymbal
place(impact(1.25, 2.5), 7.0)
place(impact(0.6, 2.5), 7.0, bus=REV)
place(whoosh(1.0, 6000, 900, 0.3, curve=0.4), 7.0, pan=-0.3)
for s in (7.38, 8.22):
    place(whoosh(0.5, 500, 4000, 0.25, curve=1.0), s, pan=0.4 if s < 8 else -0.4)
place(whoosh(0.55, 1500, 12000, 0.7, rev=True), 8.95)

# 05 graph editor: handle pops, ball blips, the eased zip, merge suck
place(impact(0.55, 1.4), 9.5)
place(clap(0.6), 9.5)
for s, f in ((9.55, 1320), (9.62, 1760)):
    place(blip(f, 0.2, 0.04), s, pan=-0.3)
for k in range(4):
    place(blip(midi(76 + [0, 3, 7, 10][k]), 0.15, 0.06), 9.62 + k * 0.06, pan=0.4)
n = int(1.1 * SR)
u = np.linspace(0, 1, n)
cb = 3 * (1 - u) ** 2 * u * 0 + 3 * (1 - u) * u ** 2 * 1 + u ** 3            # the same curve, heard
zip_f = 330 * 2 ** (2 * cb)
place(filt(saw(zip_f, n), 'lowpass', 2500) * 0.07 * np.sin(np.pi * u) ** 0.5, 10.0, pan=-0.2)
place(blip(1500, 0.12, 0.3, glide=1.0), 11.1, bus=REV)
place(riser(0.6, 0.8, 300, 2400), 11.35)
place(whoosh(0.35, 400, 7000, 0.4, rev=True), 11.65)

# 06 identity: drop, bar wipe swoosh, decode chatter, sweep shimmer, collapse, final tink
place(impact(1.5, 2.8), 12.0)
place(impact(0.8, 2.8), 12.0, bus=REV)
place(whoosh(0.66, 700, 9000, 0.4, curve=1.0), 12.0, pan=-0.5)
for i in range(22):
    s = 12.55 + i * 0.034
    place(blip(1800 + rng.random() * 2400, 0.05, 0.015), s, pan=rng.uniform(-0.8, 0.8))
place(blip(midi(93), 0.18, 0.3), 13.5, bus=REV)
n = int(0.5 * SR)
place(sweep_filter(rng.standard_normal(n), 3000, 14000, 'bandpass', 0.4, 1.0) * np.sin(np.pi * np.linspace(0, 1, n)) * 0.25, 14.1, pan=0.3)
place(whoosh(0.2, 9000, 300, 0.45, rev=True), 14.68)
place(bell(midi(93), 0.35), 14.86)
place(bell(midi(93), 0.3), 14.86, bus=REV)

# ─── mix ─────────────────────────────────────────────────────────────────────
wl, wr = reverb(rev_l, rev_r, 2.4, 0.9)
# the collapse: everything but the final bell tail dies at 14.86
cut = 1 - np.clip((T - 14.7) / 0.16, 0, 1)
bell_tail_l, bell_tail_r = np.zeros(N), np.zeros(N)
place(bell(midi(93), 0.35), 14.86, bus=(bell_tail_l, bell_tail_r))
L = (L + wl) * cut + bell_tail_l + wl * (1 - cut) * 0.6
R = (R + wr) * cut + bell_tail_r + wr * (1 - cut) * 0.6
mix = np.stack([L, R])
mix = filt(mix, 'highpass', 28)
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
fade = np.minimum(1, (N - np.arange(N)) / (0.03 * SR))
mix *= fade

out = Path(__file__).with_name('soundtrack.wav')
with wave.open(str(out), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype('<i2').tobytes())
print('wrote', out)
