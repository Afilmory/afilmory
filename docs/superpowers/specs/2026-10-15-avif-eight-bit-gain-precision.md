# AVIF 8-bit gain conversion precision

## Fix

The paired JPEG/AVIF baseline isolated two AVIF-only failures after matching
sampling policies. Both use colored 8-bit 4:2:0 gain maps. Their compressed YUV
samples are 8-bit, but YUV-to-RGB conversion produces fractional channel values.
The previous ImageBitmap/rgba8 path quantized those values again before the
exponential gain reconstruction amplified the error.

All non-monochrome AVIF gain items now use the existing native YUV decoder and
float16 conversion/upload path, including 8-bit items. Mono 8-bit gains retain
the bitmap/rgba8 path: they have no chroma conversion and their decoded values
already agree with the independent reference. The high-depth path is unchanged.
JPEG decoding, shared shader math, base-image color management and thumbnail
generation are unchanged.

The parser rejects explicit chroma siting for this centered-chroma conversion
at all depths, rather than incorrectly treating it as centered; this uses the
existing warned original-file browser fallback. Unsupported
native layouts, missing ImageDecoder/float16 support, decode failure or the
existing 128 MiB conversion budget produce a warning and an SDR-base fallback.
This means colored 8-bit AVIF HDR now requires the same native APIs as high-depth
gain maps. No auxiliary image request, bundled AV1 decoder or silent precision
downgrade is added. The native-format warning includes the actual format, matrix
and range for diagnosis.

## Paired baseline

Chromium 151.0.7922.34 and Edge 155.0.4283.45 agree:

| Check | Before | After |
| --- | --- | --- |
| AVIF independent decoded planes with matched sampling | 78/80 pass | 80/80 pass |
| JPEG independent decoded planes with matched sampling | 80/80 pass | 80/80 pass |
| GPU formula controls, both formats | 160/160 pass | 160/160 pass |
| AVIF native full-reconstruction differences | 15/80 | 12/80 |
| JPEG native full-reconstruction differences | 38/80 | 38/80 |

All four legacy JPEG parity checks pass. The formerly failing full-resolution
colored 4:2:0 gain case improves from approximately 0.004776 to 0.000233 maximum
normalized gain-plane error. Across the paired AVIF corpus, maximum gain-plane
error is 0.000245. The separate 0.0003 precision gate now covers all generated
AVIF gain planes, including 8-bit inputs. Final-image tolerance remains unchanged.

The paired command still exits nonzero for 50 native full-reconstruction
differences. Matching the independent sampled-plane reference does not imply
identical output to native libraries with different reconstruction policies.

## Full regression and the two newly exposed native differences

The full Chromium and Edge regressions each have 140 scenarios (four new 8-bit native-decode
failure/missing-API checks) and six resource/lifecycle checks. Native full-image
differences increase from 24 to 26. The newly over-threshold cases are the HDR
`color-base` / equivalent `icc-base` fixtures, each with 16 boundary pixels.
Their previous gain quantization had partly compensated for the reference's
different reconstruction. Do not describe this full suite as green.

Both fixtures now also have an independent libavif decoded-plane and metadata
reference, reconstructed with pixel-center RGB gain sampling in linear sRGB,
then converted to Display P3. All four HDR/SDR checks pass. Their gain planes
match the independent samples within 0.000199, and the HDR matched-sampling
maximum linear error is 0.08718 versus 0.10201 for native reconstruction.
The native mismatch remains recorded and fails the command; neither the
threshold nor the native reference was replaced to hide it.

All generated AVIF gain-plane precision checks, four legacy JPEG parity checks,
decode-fallback checks and six lifecycle/resource checks pass. Package tests
(73 cases), scoped ESLint, TypeScript and the native helper's warning-clean
compilation pass. The large 12-bit-gain resource case is unchanged; this is not
a separate 12MP 8-bit-gain timing benchmark.

## Scope and remaining work

This fixes gain-plane conversion precision. Base-image decode/quantization,
particularly 12-bit 4:2:0 colored edges, remains a separate investigation. Native
gain resampling differences also remain visible. This is not an end-to-end
12-bit precision claim or a physical HDR display measurement. Safari's shared
color-upload issue remains separate.

Reproduce using the commands in the [browser verification guide](../../../packages/webgl-viewer/tests/browser/README.md).
The [original paired baseline report](./2026-10-15-jpeg-avif-baseline.md) records
the pre-fix comparison and why native full-reconstruction differences alone do
not identify an AVIF-only renderer defect.
