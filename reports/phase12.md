# Phase 1.2 verification

Baseline: commit `253358f1beac6893665bfd2846c21e39168f828a`. The original scene/audio/dynamics files are retained under `benchmarks/` with import paths adjusted only. They are used by the optional comparison page/scripts, never the normal game entry.

## What was measured

`node scripts/compare-cpu.mjs` runs identical 10-second synthetic motion updates on Node 24 / Windows. Audio nodes are counting substitutes. Results are saved to `phase12-cpu.json`.

| Controlled algorithm metric | 1.1 | 1.2 |
| --- | ---: | ---: |
| Audio parameter target schedules, two sabers / 600 frames | 7,200 | 1,260 |
| Mean position error, sinusoid sampled at 24 Hz and rendered at 60 Hz | 0.08768 | 0.03541 |

The position error is in synthetic world units, not milliseconds or measured user input latency. The audio count reduction is 82.5%; it does not measure the audio device's DSP execution. The JSON also retains substitute CPU timings for transparency; the tiny one-run timings are unsuitable for claiming an audio performance gain.

The same in-app browser ran sequential warmed-up scene replays at a target 24 Hz. Actual producer cadence was about 24 Hz, but requestAnimationFrame was throttled to about 1 Hz. Both results were marked invalid. FPS, frame CPU duration, and GPU/real-camera latency cannot be validly compared from that run. The observed draw-call counts were 47 and 19 in these throttled frames; they describe the rendered work submitted in those frames, not a tablet FPS improvement. The test page freezes the view width for subsequent comparisons and reports actual pixel ratios.

## Actual scene-pipeline correctness check

The comparison page additionally steps the real 1.2 scene code through 180 deterministic frames. It uses a test clock and real WebGL rendering, without relying on browser frame scheduling:

| Input route | Blue frames with a trail | Red frames with a trail |
| --- | ---: | ---: |
| 24 Hz mirrored landmark replay through `SaberScene.update()` | 171 / 180 | 171 / 180 |
| Demo generator | 171 / 180 | 171 / 180 |

The initial frames include blade extension. Geometry/history/age buffers are independent. Separate tests cover rotation-only movement, slow movement, mirrored intensity and lifetime, and zero trail after stationary expiry. This is **not** physical hand-camera validation.

## Changes tied to identified costs

- Fixed-threshold, view-dependent ribbon admission was replaced by a shared displacement-driven ring sampler, plus a narrow camera-facing tip wake. Red gets a controlled white tint to compensate its lower perceived brightness; both use identical geometry and decay. No trail remains indefinitely when stationary.
- Fixed render-time exponential chasing was replaced with arrival interpolation and velocity-adaptive input filtering. Prediction is limited to 22 ms, 0.12 world units and 0.12 radians, and fades before sample expiry. The previous interpolation is evaluated before replacing a segment, including equal-cadence input/render updates. Stop, stale, gaps, and reordered samples have tests.
- Static grip parts are merged by material. Transparent double-sided effects use one pass. Balanced quality removes the two dynamic point lights, retaining the core, glow and metal environment reflection.
- Trail samples use fixed circular buffers rather than shifting histories. Only live attribute ranges upload, with a second narrow band ensuring an edge-on ribbon does not make a saber's trail disappear.
- React receives hand/status/diagnostic presentation at 2 Hz rather than every tracking result. Gameplay tracking and gesture gates still consume every result. Small audio gain schedules are capped at 30 Hz per saber.
- Resolution drops only after sustained poor frame timing, changes at most once per 8 seconds, and rises only after a long good period. Background-sized gaps are excluded from the adaptation controller. Tracking frequency is not increased to 60 Hz or reduced by this controller.
- Saw/triangle oscillators with speed-driven base-frequency ramps were removed. Five original deterministic PCM assets (about 502 kB total) are synthesized at build time; no OfflineAudioContext or noise/oscillator synthesis is needed on the tablet. Three decoded looping layers per hand crossfade by speed. Ignition/retraction create a bounded one-shot only on a physical blade-state transition. Completed buffers are cached across sessions; context, sources, fetches, and nodes release on stop/dispose.

## On-device diagnostics and remaining acceptance

The diagnostic panel shows mean / P95 / peak (up to 240 recent samples): camera decode interval/Hz when requestVideoFrameCallback exists, frame-copy cost, inference time, result delivery age, sample-to-render age estimate, smoothing lag estimate, frame interval/FPS, CPU frame work, per-saber trail/audio callback CPU time, tracking interval/Hz, pipeline mode, pixel ratio, draw calls and blue/red trail vertex counts. UI updates at 500 ms. Direct-video inference can have zero JS copy cost; this does not mean camera decoding is free. CPU submission time is not GPU execution time; GPU time is not measured.

The user has confirmed that Phase 1.1 opens the camera on their tablet. Phase 1.2 preserves that initialization and fallback path. The coding environment has no physical camera. Still required on the user's iPad/Android device: real red/blue trails, hand labels and open/fist operation, balanced-mode smoothness/stop/occlusion behavior, front camera and main fallback, audio loudness/loop seams/tonal preference, background resume, thermal stability, and actual end-to-end latency. No measured tablet performance or perceived sound-quality improvement is claimed.
