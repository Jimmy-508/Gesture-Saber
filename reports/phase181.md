# Phase 1.8.1 — targeted continuity fix

> Measurement correction during the final Grip integration: the old replay could lose twin mode during setup without asserting it. Its claimed twin rotation comparison is withdrawn; the historical raw artifact is retained, not a current acceptance claim. Use `final-grip-comparison.json`, whose corrected setup asserts twin mode and records it on every output frame. Position/rejection findings remain consistent. Single direction has subsequently changed by design to Grip Control.

Baseline: `b5c8c90043394e472319454e8f6532176539147f`.

## Confirmed software defects

- A zero-hand or unmatched packet called `ControlHand.freeze()`, cancelling the remaining response to an already accepted target. Missing observations now call `miss()`: finish only that target, then hold. No extrapolation. Recovery retains the existing 18 ms response constant; normal position/rotation response constants are unchanged.
- Velocity-predicted identity distance could reject a sole tracked hand during a fast reversal, even within the original 0.55 normalized-distance bound of its actual last observation. That measured-distance fallback now requires a corroborating calibrated handedness label (existing 0.5 acquisition threshold). Two-owner/two-candidate ambiguity decisions are unchanged. Large unsupported displacements remain rejected.
- Explicit ambiguous matches renewed pose, weapon and blade timestamps without a valid pose. They now freeze conservatively without renewing those valid-observation lifetimes. Existing 180/260/420 ms stale/retract/hide policy remains.

`tracking.ts` stamps capture before frame extraction; main/Worker results echo that timestamp. Inference is serialized. Rendering response uses main-thread arrival time, while capture time remains metadata/order evidence. No timestamp defect was reproduced, so the tracking/Worker implementation was left unchanged.

## Same-input comparison

`node benchmarks/final-replay.mjs`; frozen baseline source copies change import paths only. 24 Hz observations, 24 ms delivery, 60 Hz logical rendering; **scene units, not physical metres**. Neither MediaPipe detection accuracy nor tablet end-to-end latency is measured.

Single and twin results below agree (within floating-point precision):

| Metric | Phase 1.8 | Phase 1.8.1 |
|---|---:|---:|
| Fast reversal with 3 missing observations: valid packets rejected | 6 | 0 |
| Same case: rendered stationary time while synthetic truth moves | 416.7 ms | 66.7 ms |
| Same case: largest recovery-frame position step | 4.6544 | 3.0908 |
| Same case: largest recovery-frame quaternion step | 9.6049° | 1.0727° |
| Same case: mean position error | 1.3833 | 0.5031 |
| Single missing packet: forced-freeze time | 33.3 ms | 0 |
| Three missing packets: forced-freeze time | 133.3 ms | 0 |
| True identity ambiguity: conservative freeze | 133.3 ms | 133.3 ms |

“Forced-freeze” is the software flag, **not** a claim of continuous reconstructed motion: three missing packets still leave 83.3 ms of rendered stationary time (previously 150 ms). No unknown trajectory is invented. For these pure-loss cases recovery steps are essentially unchanged: maximum position step increases by 0.0019 scene units (<0.3%) and angle step by <0.001°. This small difference comes from finishing the accepted endpoint before reversing, not greater extrapolation or changed response parameters.

Normal horizontal motion and wrist rotation are numerically identical at every rendered frame for both owners and both modes: no added normal-response delay. Recovery is monotonic toward its accepted endpoint; abrupt-stop residual and overshoot behavior are unchanged. Raw P95/peak/error/CPU sample data: `phase181-comparison.json`. CPU sample timings exclude inference/WebGL and are too small/noisy to justify an FPS improvement claim.

## Verification

- 132 automated tests; TypeScript and production build pass.
- 59 real WebGL/formal React workflow checks pass, including four owner/mode dropout cases, restoration, expiry, actual scene output, Grip Control, morph, original geometry/shaders, fallback, audio reuse/suspension/disposal and geometry release. Observations/session are synthetic.
- 21 formal UI checks pass, including start/stop/cancel, settings and stream cleanup.
- Original Phase 1.1 audio graph/parameters/envelopes, Phase 1.8 audio lifecycle, Grip geometry, morph timing, visual assets and camera/model/cache sources are unchanged. No new render-time allocations, prediction, GPU effects or model work.

Browser evidence: `phase181-webgl.json`, `phase181-ui.json`. The existing audio A/B portion compares historical Phase 1.7 scheduling with unchanged Phase 1.8 audio; it is not a Phase 1.8.1 audio-performance improvement claim. The QA render pump coexists with browser RAF; its frame intervals must not be presented as actual device FPS.

## Limits

The software defects are reproduced and fixed; their contribution to the user's tablet symptoms is not physically measured. Camera blur, occlusion, model zero returns and genuinely ambiguous identities still withhold new motion. No camera resolution/rate/model threshold, Grip Control, audio, visual or UI design was changed. Physical fast single/twin swings, reversals and stops remain for the user's tablet acceptance; synthetic tests cannot establish that acceptance.
