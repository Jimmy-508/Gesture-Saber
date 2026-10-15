# Gesture Saber Phase 1.4

Baseline: e912053e14307cb182b165e674119b932012a15f. Only Gesture-Saber is modified.

## Tracking-driven activation

The live receive path now assigns identity first, then updates the corresponding saber. No OPEN/FIST/UNKNOWN counter, finger gate, or 110/80 ms gesture confirmation remains. Every reliable assigned hand immediately requests extension. Finger tips and finger curl have no influence on activation. HandAssignment retains its handedness threshold (0.55) and temporal ownership logic; nonfinite confidence, invalid/collapsed wrist/MCP palm data are rejected. The palm guard uses 3D points 0/5/9/17 only, so edge-on projected palms and occluded/curling distal fingers remain usable.

SaberScene ignores the legacy Pose.open field (kept only for archived benchmark type compatibility). No appearance, shader, light, smoothing or PalmPose changes were made. Each hand's BladeState remains independent. Explicit loss freezes pose/prediction and stops new ribbon samples; missing updates also freeze at 180 ms. Existing 260 ms retract and 420 ms hide/fade protections remain. Recovery immediately requests extension without a new finger gesture; short occlusions never turn active false, so original audio does not replay ignition/retraction.

src/audio.ts is unchanged. soundForSpeed is unchanged. The Phase 1.1 Web Audio graph, oscillator/filter settings, noise and envelopes are protected by exact fixture comparisons. The original audio graph is driven by active-state edges as before.

## Interface

Normal idle, loading and running screen contains only Gesture Saber and two SVG icon buttons. The camera control toggles start/stop, changes to a small loading ring while initializing, and cancels on a second click. Active state has a restrained cyan indicator. Both icons have accessible names; camera has a pressed state. A necessary error is shown in a compact dismissible alert.

The old welcome copy, subtitle, phase text, brand symbol, footer, hand labels, HUD, session toolbar and their CSS are removed, not hidden. New styling uses system type, subtle cyan/magenta title edging, no external font requests, no particles or added WebGL/postprocessing. Existing scene is unchanged.

Settings contains music (honest unavailable text, no fake controls), original sound toggle/volume, three qualities with adaptive resolution, fullscreen toggle, compatibility mode, all pipeline/performance/palm/identity diagnostics, and developer demo. Escape and backdrop close; focus returns to settings icon; Tab stays within dialog. Long panels scroll on short screens.

main.tsx is now a small React entry and App moved to app.tsx. A typed session factory defaults to real TrackingSession; the separate developer UI check supplies a simulated session for deterministic control/lifecycle tests. Production never uses a fake camera. Diagnostics are buffered in a ref and only publish at 500 ms while settings + detailed diagnostics are open; closed settings does not keep updating HUD React state. Stop/error now explicitly report camera released instead of leaving stale camera-readable diagnostics.

## Checks and limitations

- 59 Node tests pass: true/noisy asymmetric left/right open and curled hands, flat/up/rotated positions, low/invalid confidence and invalid palms, crossing/reordering/occlusion, bilateral independence, immediate activation and loss timing, bounded prediction/trail expiry, resources/camera lifecycle, cached models, fallback, and exact original audio.
- TypeScript noEmit and production Vite build pass. Existing Three.js chunk size advisory remains.
- Built browser UI harness: 17 assertions pass for camera loading/cancel/late callbacks/start/stop/error dismissal, settings/music/quality/sound/volume/compatibility, diagnostic containment, Escape/focus restoration and no residual live test stream. These use simulated sessions, not real camera permission.
- Actual WebGL scene harness: nine assertions pass, including fist activation, finger-shape independence, independent hands, frozen short loss, continuous audio edges, prolonged loss, reacquisition and geometry disposal. Input is synthetic, not an actual MediaPipe hand result.
- Real browser model tests: native CacheStorage hit/corruption repair/clear recovery, Worker/main healthy engine reuse and blank-canvas inference; original audio native OfflineAudioContext peak test. Raw results stored alongside this report.
- Responsive layout inspected at nominal 320x568, 1024x768 and 844x390. Actual IAB CSS dimensions round the latter two widths to 1025 and 845. Header targets do not overlap; touch targets >=44 nominal px; no horizontal overflow. Settings fits viewport and scrolls. No claim of iPad Safari touch testing.

No additional MediaPipe inference, audio nodes per frame, graphics passes or dynamic lights were added. Finger classification work is removed, diagnostic React updates outside settings eliminated, CSS bundle drops from about 8.41 to 5.67 kB minified. These are code/build observations, not proof of improved tablet FPS. No same-device tablet FPS/latency/power comparison was possible; no real-device performance claim is made.

## Tablet acceptance still required

On iPad Safari and Android Chrome: actual permission/start/cancel/stop, camera indicator, natural fist/open/flat/rotated hands, correct bilateral identity during crossing and occlusion, short loss with no repeated sounds, sustained exit/re-entry with smooth retract/extend, full-screen support, volume and original sound, balanced-mode FPS/latency and thermal behavior. Automatic tests and blank canvas inference do not satisfy real hand/camera acceptance. No music, beat cubes or scoring is introduced.
