# End-to-end AVIF rendering check

The independent JPEG/AVIF comparison is available with `JPEG_BASELINE=1` using
the same command below. It additionally requires libultrahdr 2.0.2, libjpeg-turbo
3.2.0 and a C++ compiler. It generates 40 paired recipes (8-bit P3, mono/RGB gain,
4:2:0/4:4:4, 1x/2x/4x gain scaling, color/ramp/constant controls), runs 160 HDR/SDR
scenarios plus four legacy JPEG checks, and writes separate
`engine-readback-<browser>-jpeg-baseline.json` reports. It does not run the large
resource tests. Native-library, matched-sampling and GPU-formula results are
reported separately; failed comparisons still return nonzero. Full methodology,
observed counts and limits: [independent JPEG baseline](../../../../docs/superpowers/specs/2026-10-15-jpeg-avif-baseline.md).

Run from a dependency-installed checkout:

```sh
PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
```

The runner requires Chromium installed by Playwright, libavif 1.4.1 gain-map
support, a C compiler and pkg-config. `NODE` overrides the node executable.
It compiles an isolated test entry, serves temporary files on loopback and writes
`.local/avif-verification/engine-readback-chromium.json`. Set
`BROWSER_CHANNEL=msedge` to run installed Edge serially, producing a separate
`engine-readback-msedge.json`. No private photos or cloud access.
`BROWSER_CHANNEL=safari` uses the installed macOS Safari through `/usr/bin/safaridriver`
and requires the user to enable Remote Automation. It opens an isolated automation
session, runs the same Engine evaluation and closes it; it never toggles Safari
settings. The test HTTP server supplies equivalent worker-fault injection and
request accounting, with caching disabled. Its driver defaults to loopback port
19615 (`SAFARIDRIVER_PORT` overrides it). Browser runs must remain serial.

The runner also generates 42 synthetic encoding variants and a 4096×3072 image
through libavif. `encode-corpus.c` performs actual RGB→YUV conversion and AV1
encoding; range flags are not changed without changing samples. The base matrix
crosses 8/10/12-bit, 4:2:0/4:4:4, full/limited range for colored edges and a ramp,
holding the gain plane at 8-bit 4:4:4 half resolution. Separate gain cases vary
8/10/12-bit, 4:2:0 and full/quarter resolution with a fixed 10-bit 4:4:4 base.
These are synthetic re-encodes, not a real-camera corpus or a test that proves
preservation of 10/12-bit source gradients. Generated AVIFs and SHA-256/encoder
metadata are retained under `.local/avif-verification/corpus` and `corpus.json`.

**2026-10-15 high-depth gain fix:** 136 rendering scenarios run in Chromium and
Edge, with 24 remaining final-image numerical failures. The original cases and
four added native-decoder failure/missing-API cases pass. The formerly failing
colored 12-bit 4:2:0 gain case now passes. A separate comparison of native RGB16
libavif gain samples to actual GPU textures requires error ≤ 0.0003 for every
10/12-bit gain recipe, in both HDR and SDR modes; observed maximum is 0.000248.
Final-image tolerance has not changed. The full suite is still not green.

**Earlier baseline:** the expanded suite intentionally exits nonzero on both
Chromium 151.0.7922.34 and Edge 155.0.4283.45: 25 of 132 rendering scenarios
exceed the unchanged numerical tolerance. All original 46 scenarios and two
added extracted-base fallback scenarios pass. Do not call this a green browser
suite. The JSON records all numerical failures before the runner fails, instead
of losing later evidence after the first mismatch. See the roadmap for the
remaining decoder/interpolation investigation.

Safari 27.0.1 completes the same suite with 78 numerical failures, including
colored SDR inputs. `color-upload.cjs` separately compares pure canvas/bitmap
uploads to sRGB/P3 GPU textures, plus a P3 canvas read, without AVIF or gain maps.
It reproduces Safari returning identical RGB for both GPU destination color spaces.
The roadmap records this shared-renderer blocker; do not label Safari supported
just because the files decode or the HDR state changes successfully.
One final serial Safari repeat hit a 60-second WebDriver transport timeout before
producing a complete report. The earlier complete Safari report is retained; the
timeout is recorded separately. Transport/setup failures now write `.error.txt`
instead of overwriting a complete JSON report. No automatic browser retry is used.

This executes the real viewer Engine, texture Worker, AVIF decoding, texture
upload, metadata uniforms and shader. Only the same-format canvas render target
is substituted with a COPY_SRC-capable texture. Dynamic-range capability is
mocked to exercise both engine branches; this is not a physical HDR display test.

Independent reference: libavif `avifImageApplyGainMap` reconstructs at full
alternate headroom for HDR and zero for SDR. Its API clamps even float linear
outputs to [0,1], so reference values are emitted as Rec.2020/PQ half floats and
converted back to linear Display P3 (203-nit SDR white) for comparison. Rec.2020
preserves colors that require negative Display P3 components. Tests compare all
pixels/channels with a linear tolerance of 0.005 plus 2% of pixel peak magnitude,
accounting for browser bitmap quantization, gain-map interpolation, and half-float
PQ reference quantization. They also require output above 1 in HDR, base-only SDR
output, one image request, alpha=1, and no viewer/GPU errors.

Transform cases use independently indexed reference pixels for rotations and
mirrors. Clean aperture crops both libavif image planes before reconstruction,
so lower-resolution gain-map interpolation clamps at the crop boundary. Fixtures
include asymmetric color patterns and vertical ramps; no-op mirror checks are
insufficient. `generate-transforms.ts` mutates only BMFF properties/metadata.

libavif 1.4.1 rejects ICC reconstruction. The real LittleCMS sRGB ICC cases use
the known equivalent sRGB nclx-only source as reference, both with alternate and
base working primaries. This validates that profile, not arbitrary ICC color
spaces. The JPEG test builds the pre-refactor decoder from Git commit `1a045b1`
and requires its actual rendered pixels to match the current decoder exactly,
in both HDR and SDR. Keep that commit reachable when running this developer test.

The harness also simulates extended-canvas rejection, both runtime dynamic-range
transitions, gain-plane decode failure and extracted-base decode failure. The last
case checks successful original-file retry and cleared custom HDR state, without
asserting that native decoding must produce SDR. Ordinary AVIF stays silent; unsupported
tmap metadata and failed gain decoding produce one warning and no HDR state.
The unsupported fixture happens to decode as base-only in tested Chromium; native
fallback behavior on other browsers must not be promised to be SDR.

`lifecycle.cjs` adds three 12MP open/zoom/pan/destroy cycles, two pending-load
cancellations and one undecodable-file case, serially in one page. It checks
actual Worker termination and explicit destruction of created GPU textures,
buffers and devices, empty engine queues and texture accounting, a 128 MiB
texture budget and at most two pending tile requests. Chromium/Edge peak tracked
texture allocation is now about 50.19 MiB with a 12-bit gain item. The test also
requires its overview gain texture to use rgba16float. Earlier runs with 8-bit
gain used 45.16 MiB; Safari passed those earlier six cases at about 81.39 MiB under
its native display scale. Safari has not been revalidated for the precision fix.
These are allocation/lifecycle checks,
not OS resident-memory measurements, GPU-driver reclamation timing, or mobile
performance certification. No benchmark timing is used as a CI pass threshold.

These checks establish computed HDR values and SDR gating, not display nits,
OS tone mapping, Safari/iPhone correctness, or end-to-end 10/12-bit precision.
The original AVIF fixtures are 10-bit and the corpus spans 8/10/12-bit, but browser ImageBitmap/texture conversion and the
8-bit gain-map rgba8 texture may quantize. 10/12-bit gain items now use native YUV
sample conversion and float16 bitmaps/textures with independent plane checks;
this does not fix high-bit-depth base decoding or establish whole-image 12-bit
precision. Missing native precision APIs warn and fall back to the SDR base.
The tolerance is per-pixel peak plus an
absolute term, not a claim of <2% error in every small RGB component.
