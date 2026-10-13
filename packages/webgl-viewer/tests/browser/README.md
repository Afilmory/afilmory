# End-to-end AVIF rendering check

Run from a dependency-installed checkout:

```sh
PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
```

The runner requires Chromium installed by Playwright, libavif 1.4.1 gain-map
support, a C compiler and pkg-config. `NODE` overrides the node executable.
It compiles an isolated test entry, serves temporary files on loopback and writes
`.local/avif-verification/engine-readback.json`. No private photos or cloud access.

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
transitions, and gain-plane decode failure. Ordinary AVIF stays silent; unsupported
tmap metadata and failed gain decoding produce one warning and no HDR state.
The unsupported fixture happens to decode as base-only in tested Chromium; native
fallback behavior on other browsers must not be promised to be SDR.

These checks establish computed HDR values and SDR gating, not display nits,
OS tone mapping, Safari/iPhone correctness, or end-to-end 10/12-bit precision.
The AVIF files are 10-bit, but browser ImageBitmap/texture conversion and the
gain-map rgba8 texture may quantize. The tolerance is per-pixel peak plus an
absolute term, not a claim of <2% error in every small RGB component.
