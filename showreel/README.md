# Showreel 2026

A 15-second, 1920×1080 / 60fps motion design showreel. Everything is generated in code: no footage, no stock, no samples.

**Watch:** `showreel.mp4`. You can also open `reel.html` in a browser (via a local server) and click to play it live with sound.

## Breakdown (120 BPM, cut on the beat)

| Time | Scene | Shows off |
|---|---|---|
| 0.0 to 2.0 | 01 Squash & Stretch | anticipation, gravity, squash and stretch, a live HUD readout, a particle burst, an iris wipe |
| 2.0 to 4.5 | 02 Kinetic Type | masked staggered letter reveals, a wave, the E slams in so MOTION becomes EMOTION, echo rows, a slice transition |
| 4.5 to 7.0 | 03 Procedural Systems | a ripple grid morphing circles into squares, colour waves, beat pulses, a zoom into one cell |
| 7.0 to 9.5 | 04 3D / Particles | 1,500 depth-sorted particles morph sphere → torus → cube, with an orbiting 3D text ring |
| 9.5 to 12.0 | 05 Timing & Easing | a graph editor, a playhead, four easings racing with onion skin and velocity stretch |
| 12.0 to 15.0 | 06 Identity | a bar-wipe wordmark, a script signature, a decoded subtitle, a light sweep, a collapse back to the opening dot (it loops seamlessly) |

On top of the scenes there's 180° shutter motion blur (sub-frame accumulation), camera shake, RGB split and flashes on every hit, film grain, a vignette and a live HUD (timecode, beat counter, scene titles).

## Rebuild

```sh
pip install numpy scipy imageio-ffmpeg     # ffmpeg with libx264
python3 soundtrack.py                      # → soundtrack.wav (synthesized, synced to the same hit list)
NODE_PATH=$(npm root -g) node render.js    # → showreel.mp4 (needs playwright + chromium)
node render.js --stills 3.1,8.6            # → stills/ for quick checks
```
