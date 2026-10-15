# Issue draft: Safari WebGPU image uploads do not match Display P3 conversion

Status: independent local issue draft; not submitted to GitHub. Separate from
the AVIF high-bit-depth gain-map fix. Potentially affects the shared JPEG/AVIF
image-upload path; this is not evidence that AVIF demuxing is at fault.

## Reproduction and observed evidence

On installed macOS Safari 27.0.1, run the standalone `color-upload.cjs` probe via
`BROWSER_CHANNEL=safari` in `packages/webgl-viewer/tests/browser/run.py` after
enabling Safari Remote Automation. The probe uses a 1×1 opaque sRGB canvas filled
with `#704030`; no AVIF, JPEG, gain metadata or HDR reconstruction is involved.
It uploads both the canvas and an ImageBitmap into rgba16float WebGPU textures,
once with an sRGB destination and once with a Display P3 destination.

Observed GPU RGB is `[0.439209, 0.250977, 0.188232]` in both destinations. A
color-managed Display P3 canvas read instead produces `[105,66,51] / 255`.
The expected relationship is color-preserving conversion for the requested
destination space, not numerically identical RGB for different primaries.
Record the browser/OS/GPU details again with any upstream bug submission.

The same probe requests float16 ImageData but receives 8-bit data in this Safari;
therefore a canvas readback workaround cannot assume float precision. The prior
full Engine run completed 132 scenarios with 78 numerical differences, including
colored SDR images, while all six lifecycle cases passed. This upload probe does
not explain every one of those differences. A later repeat hit a 60-second
WebDriver transport timeout; that repeat is not a successful correctness result.
These measurements predate the separate AVIF high-depth gain decoder change.

## Proposed work and acceptance

- Establish a small independent sRGB/P3 upload regression with known color values,
  and characterize ImageBitmap, canvas and decoded image sources separately.
- Choose a capability-tested color-correct upload path or an explicit fallback;
  do not rely solely on user-agent matching or successful WebGPU initialization.
- Validate JPEG/Ultra HDR as well as AVIF against an independent color reference.
  Old/new JPEG pixel equality cannot detect a bug common to both versions.
- Verify standard and extended canvas modes, profile conversions, SDR gating,
  float precision, device changes and resource disposal. Test iOS separately.
- Keep WebDriver reliability separate from numerical and physical HDR display
  validation. Browser capability/readback is not a luminance measurement.

Do not mix this shared renderer/browser work into the AVIF-only precision fix.
