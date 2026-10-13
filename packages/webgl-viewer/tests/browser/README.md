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

These checks establish computed HDR values and SDR gating, not display nits,
OS tone mapping, or Safari/iPhone correctness.
