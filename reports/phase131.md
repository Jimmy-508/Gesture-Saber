# Phase 1.3.1 targeted correction

Baseline: `5ac509a8cddaa7e4e01c9194ae52287a7df2de7d`. Audio source: `253358f1beac6893665bfd2846c21e39168f828a`. Only Gesture-Saber is changed; no game features are added.

## Reproduced code defects, versus device uncertainty

There is no red-only Z negation in Phase 1.3's pose function. The side multiplier changes the transverse X axis, not the primary wrist→MCP9 Y axis. Flipping all of the right hand's signs would therefore be unjustified and risk its anatomical basis. The multiplier is retained. MediaPipe's selfie handedness convention is exchanged once for the actual unmirrored camera input, as before; see the [upstream handedness convention](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/hand_landmark/hand_landmark_tracking_cpu.pbtxt).

Three concrete failure paths were found:

1. `main.tsx` assigned every observation directly from that frame's label and accepted the first duplicate. A transient duplicate label could starve the red blade; a label swap could feed another hand's pose into its history. There was no temporal ownership independent of output list order or image position. The new small two-hand association uses recent palm motion plus handedness evidence. Missing/implausible matches are skipped. Near-coincident detections retain the previous identities rather than guessing a swap, using the existing loss/retraction behavior. Identity does not depend on left/right image position, so hands may cross.
2. The old roll guard returned the **entire** previous quaternion when a transverse/normal reversal was detected, freezing even a valid finger direction. Repeated bad transverse observations caused stop-and-jump updates. The new guard preserves unreliable roll alone while updating trustworthy pointing direction. Transverse degeneracy falls back to a nonparallel orthogonal axis. Basis determinant stays positive, quaternion hemisphere continuity is preserved, and the canonical anatomical side factor is unchanged.
3. The old direction guard accepted a repeated depth reversal after two packets, even if the world estimate contradicted image landmarks or image-plane motion provided no evidence of a turn. The new code checks wrist-relative world/image axis agreement, uses image-space fallback for contradictory world depth, and holds a purely ambiguous flat-palm depth reversal. A real continuous wrist path may still point forward **or backward**; neither direction is hard-locked. Recovery after a short gap is cadence-aware and bounded (regular slow inference is not treated as repeated occlusion), with angular prediction disabled while pose confidence is low. Normal accepted motion keeps the existing MotionFilter parameters. The normalized fallback now uses captured video aspect rather than the display viewport aspect.

The tests run the saved Phase 1.3 class on the same full anatomical input: it turns toward the player after repeated world-depth corruption, and freezes a valid pointer when only MCP roll is corrupt. The corrected class passes both cases. These are reproducible software defects, **not proof that every reported tablet failure had the same cause**. No physical hand-camera trace was supplied or captured here.

The existing diagnostic panel now reports accepted direction XYZ, quaternion delta in degrees, source/guard status for each hand and association status at its existing 500 ms cadence. Demo mode explicitly does not claim a measured hand pose.

## Exact Phase 1.1 sound restoration

`src/dynamics.ts` matches the requested Phase 1.1 file. `src/audio.ts` is taken directly from that commit; only late resume/dispose status protection and handling a rejected `AudioContext.close()` promise differ. There is no new sound design, resynthesis of a recording, prerecorded bank, limiter, changed headroom or changed tonal parameter.

The original sawtooth + triangle hum, sine activation/retraction sweep, filtered looping noise, side-dependent pitch, pan, filter Q/cutoffs, speed mapping, gain levels and automation time constants are restored. Node-graph/event tests compare the production implementation against the archived original with the same seeded noise, inputs and timing. They match exactly. Each context owns six oscillators and two looping noise sources; movement and activation create no additional nodes or noise buffers. Disposal stops eight sources, disconnects the graph and closes the context once; a late Safari resume cannot revive it. The UI's mute, volume and user-gesture unlock remain. Ignition/retraction retain 160/120 ms ramps, aligned with the unchanged blade animation.

Unused Phase 1.3 WAV files, bank descriptor and generator were removed. The historical DSP fixture remains only for the old `compare-phase13.mjs` benchmark; no game or asset-build module imports it. No sound assets are downloaded or decoded at runtime.

Actual Chromium `OfflineAudioContext` rendering uses the **production graph**, not a substitute synthesizer: three seconds of independent/simultaneous on/off gestures at maximum volume for speeds 0, 8 and 24. Observed peaks were **0.1194 / 0.2964 / 0.4069**, below clipping; final tail RMS after stopping was zero in these runs. Raw result: [phase131-audio.json](phase131-audio.json). Noise is intentionally random, as in 1.1; these are measured scenarios, not an exhaustive mathematical peak bound or speaker/listening test. No output-gain change was needed.

Restoring the original also restores its six parameter targets per active hand update, rather than the 1.3 bank's three gains capped at 30 Hz. This is an acknowledged return to 1.1 scheduling cost, not a claim of reduced audio computation. Native audio runs off the game update path; actual tablet cost still needs checking.

## Checks and preserved behavior

- `npm test`: 54 passing tests. Includes anatomical full-hand mirror pairs (thumb position, finger lengths and unequal MCP heights), up/forward/palms up/down, same-direction and mirrored tilts, continuous rolls, fast swings/stops, vertical→flat motion, short occlusion, partial/corrupt landmarks, red-only corruption without disturbing blue, duplicate/swapped classifications, output order and hand crossing; plus existing camera, resource, cache, gesture, blade and ribbon checks.
- `npm run build`: asset preparation, TypeScript `--noEmit` and production Vite build pass. Existing large Three.js/scene chunk warning remains nonfatal.
- Actual browser Cache Storage: hit without asset fetch, equal-length SHA-256 corruption repaired, cleared cache restored. Real Worker and main model engines initialize, reacquire the same instance and infer blank frames. Resource version stays `f594220d53c6fc89`; no model/WASM incompatibility or unnecessary invalidation was introduced.
- Fixed-clock real scene replay: both tracking-landmark replay and demo produce blue/red trails on **171/180 frames each**, with **19 draw calls**. The initial frames include blade extension. Phase 1.3 ribbon geometry/shader, ring buffers, upload bounds and rendering quality controller are unchanged.
- The camera/tracking pipeline only adds captured aspect metadata. Camera initialization, Worker/main fallback, caching/pooling, gesture gates, blade animation and resource release remain covered by their regression tests.

## Performance evidence and limits

The same-process Node 24.21.0 / Windows benchmark includes the newly added assignment plus two poses and MotionFilters, using precomputed full anatomical inputs at 24 Hz: four alternating-order runs, 16,800 inputs/version/run, first 2,400 warmup. Mean per dual-hand input was approximately **0.00276 ms (1.3) → 0.00556 ms (1.3.1)**. The extra checks have a small measurable desktop CPU cost; they are not free. Raw data and method: [phase131-cpu.json](phase131-cpu.json), generated by `node scripts/compare-phase131.mjs`. Camera, MediaPipe, audio DSP, GPU work and tablet latency are excluded.

An initial same-window browser comparison was throttled to about 1 Hz and marked **invalid** by both versions; it is retained in [phase131-browser-throttled.json](phase131-browser-throttled.json). Once normal browser scheduling resumed, the first valid run had more variable P95 timing ([phase131-browser-first.json](phase131-browser-first.json)); these earlier results are not hidden or presented as tablet measurements.

After closing other local QA scenes and loading the final build, the same 1281×468 viewport / 1.14 pixel ratio, two-second warmup and four-second sample produced:

| Controlled desktop scene replay | Phase 1.3 | Phase 1.3.1 |
| --- | ---: | ---: |
| Actual landmark-input Hz | 24.31 | 24.30 |
| Render FPS | 60.00 | 60.00 |
| Frame mean / P95 / peak ms | 16.67 / 17.0 / 17.5 | 16.67 / 17.0 / 19.9 |
| CPU submit mean / P95 / peak ms | 0.927 / 1.2 / 2.0 | 0.948 / 1.3 / 2.1 |
| Draw calls | 19 | 19 |

Both blades produced trails in every measured frame. Raw final output: [phase131-browser.json](phase131-browser.json). This short controlled rendering replay shows no obvious mean-FPS regression, but the earlier variability prevents a general performance guarantee. It excludes camera, MediaPipe, identity association and audio; the CPU microbenchmark above separately includes association. No tablet, GPU execution or complete camera-to-display comparison is available. Neither this replay nor the fixed-step check establishes physical device smoothness.

## Required tablet acceptance

Use the newest HTTPS test build, open diagnostics and test actual left-blue/right-red ownership, flat forward palms, palms up/down, gradual wrist rotations and independent fast swings. Cross hands and briefly occlude one hand; ambiguous overlap should hold/retract safely rather than swap. Check reacquisition and absence of a large backward bend, audio mute/volume/ignition/retraction, stop/restart, Safari gesture unlock and background return. Compare tracking Hz, inference/delivery/frame P95/peaks on the same device, and listen for the requested original 1.1 sound. Physical camera correctness, speaker quality and long-session tablet performance remain user acceptance items; automated replay is not a substitute.
