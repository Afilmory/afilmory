# AVIF viewer acceptance

Run from an installed checkout with Node supporting Float16Array, Python 3, a C/C++ compiler, pkg-config, libavif 1.4.1 with gain maps, and Playwright Chromium.
The paired JPEG run additionally needs libultrahdr 2.0.2 and libjpeg-turbo 3.2.0.
No private photos, cloud credentials or running gallery are required.

```sh
pnpm --filter @afilmory/webgl-viewer test
pnpm --filter @afilmory/webgl-viewer type-check
PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
JPEG_BASELINE=1 PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
```

Set `BROWSER_CHANNEL=msedge` for installed Edge and run browsers serially.
`NODE` overrides the Node executable.
`BROWSER_CHANNEL=safari` uses macOS safaridriver with Remote Automation already enabled; Safari color upload correctness remains a separate limitation, not an accepted browser target.
`SAFARIDRIVER_PORT` overrides its loopback port 19615.
The runner closes its own automation session and does not change browser settings.

## Required checks

The harness uses the real Engine, Worker, native AV1 decoder, texture upload and shader.
It substitutes only the render target with a same-format readable texture and mocks dynamic-range capability to exercise HDR and SDR branches.
It requires one image request, finite output, opaque alpha, expected HDR state, correct warning/fallback behavior and no unexpected GPU/page errors.
JPEG ICC rendering must remain pixel-identical to the decoder at upstream commit `9a0413ddefe02da95bea9218cb7961b09e47b143`; keep that commit available when running this developer test.

Generated corpus cases require all of the following:

- Gain texture samples agree with independently decoded libavif RGB16 within 0.0003, covering float16 rounding.
- Independent CPU reconstruction of uploaded samples agrees with GPU output.
- An independent model of libavif scaling/intermediate precision agrees with its native output, validating the reference model.
- Decoded RGB16 planes reconstructed with the viewer's pixel-center sampling agree with output, except the explicitly bounded base-conversion limitations below.
- Gain-only substitution passes even for cases with a base-conversion limitation.

Final-image comparisons use linear Display P3, with unchanged per-pixel tolerance `0.005 + 0.02 * max(0.1, pixel peak magnitude)`.
The reference emits Rec.2020/PQ half floats before conversion to linear P3 to avoid libavif's linear-output clipping.
This is not a relative-error guarantee for each small color component.
The paired JPEG/AVIF suite requires independent matched-sampling and uploaded-formula checks for both formats.
Original transform, fallback and color fixtures without a matched reference still require native reconstruction agreement.

The lifecycle cases cover three 12MP open/zoom/pan/destroy cycles, pending-load cancellation and an invalid image.
They require termination/destruction of tracked Workers and GPU resources, empty queues, bounded texture accounting and float16 high-depth gain textures.
These checks do not measure process RSS or driver reclamation timing.

## Known limitations versus reference differences

libavif scales YUV before RGB conversion; the viewer samples RGB gain textures at pixel centers.
The full native reconstruction comparison is retained in each report, but is not a shader-correctness oracle when independent sampling/formula controls pass.
Set `STRICT_NATIVE_REFERENCE=1` to make every native difference fail the command as well.

Eight generated HDR/SDR scenarios have independently isolated browser base-RGB conversion differences: colored 12-bit 4:2:0 full/limited in both modes, colored 10-bit 4:2:0 limited in HDR, colored 12-bit 4:4:4 full/limited in HDR, and the 12-bit 4:4:4 limited ramp in HDR.
`acceptance.cjs` lists those exact cases and maximum-error regression bounds, rounded up to 0.001 from the diagnostic baseline.
They are reported as `passed-with-known-limitations`, never as passing image-accuracy comparisons.
An unlisted case, an increased maximum error, a gain/shader error or missing stage controls fails acceptance.
Improvements do not require preserving the previous failure count.
The recommended 10-bit full-range 4:4:4 recipe is not exempted.

`AVIF_DIAGNOSTICS=1` additionally compares native AV1 YUV samples exactly with libavif and compares pre-upload float16 P3 bitmap pixels with GPU base samples.
It requires native ImageDecoder and float16 P3 canvas readback.
The shared shader is not changed to imitate a particular native scaler.

## Fixtures and reports

Small public synthetic AVIF/JPEG/ICC fixtures and independently derived metadata expectations live in `src/fixtures`, with provenance and regeneration instructions.
`encode-corpus.c` generates 42 encoding recipes crossing base depth/range/chroma and separately varying gain depth/chroma/size; `jpeg-baseline.cpp` generates 40 paired JPEG/AVIF recipes.
These are synthetic inputs, not a real-camera interoperability corpus.
Transformed fixtures use asymmetric pixels and independently indexed expected rotations/crops.
The real LittleCMS sRGB ICC is compared with its known nclx equivalent; this does not validate arbitrary ICC profiles.

Generated images, JSON reports, screenshots, logs and one-off investigation notes belong under ignored `.local/avif-verification/`, not in Git.
Reports include browser version, native differences, stage controls, acceptance status and known limitations.
Transport/setup failures write a separate error file without replacing an earlier complete report.
Summarize the exact tested revision and relevant counts in the PR/release description instead of committing chronological run reports.

Numerical HDR output and forced SDR gating do not establish physical display luminance, mobile-device behavior, Safari correctness or end-to-end 12-bit precision.
See the [design and supported input policy](../../../../docs/superpowers/specs/2026-10-13-avif-gainmap-design.md).
