# JPEG / AVIF independent baseline

This report records the pre-fix baseline. The subsequent
[8-bit AVIF gain precision fix](./2026-10-15-avif-eight-bit-gain-precision.md)
resolves both matched-sampling AVIF failures, while retaining the remaining
native-library differences and documenting additional full-suite diagnostics.

## Result

The new JPEG baseline changes the interpretation of the earlier AVIF failures:
native-library pixel differences are not automatically AVIF-specific renderer
bugs. Both formats differ from their native library's full reconstruction, but
the common shader agrees with a CPU calculation on the uploaded samples in all
160 controlled scenarios. JPEG also agrees with an independent decoded-plane
reference using explicitly matched sampling in all 80 scenarios. AVIF has two
remaining differences in that comparison, before any shared formula fix.

Chromium 151.0.7922.34 and Edge 155.0.4283.45 give identical counts:

| Comparison | JPEG / Ultra HDR | AVIF |
| --- | --- | --- |
| Native library reconstruction exceeds the existing tolerance | 38 / 80 | 15 / 80 |
| Independent decoded planes, matched pixel-center sampling exceeds tolerance | 0 / 80 | 2 / 80 |
| GPU output vs formula control on its uploaded planes exceeds tolerance | 0 / 80 | 0 / 80 |
| SDR cases exceeding native-library tolerance | 10 / 40 | 0 / 40 |

Four additional old/new JPEG HDR/SDR parity scenarios pass, giving 164 scenarios
per browser. All image loads use one request, warn/error checks pass, and HDR/SDR
state and output-white checks pass. The baseline command remains nonzero: it
retains both native-library failures and the two matched-sampling AVIF failures.
No numerical threshold was loosened and no production renderer code changed.

## What is now isolated

### JPEG base chroma reconstruction

The 10 JPEG SDR differences are colored 4:2:0 base cases. Browser GPU base pixels
and independent libjpeg RGB decoding with fancy chroma upsampling agree exactly
at their 8-bit levels (JSON normalization error below 5e-10). The libultrahdr linear
SDR output instead matches a separate libjpeg decode with nearest chroma within
the existing tolerance in every case. For the colored constant-gain control,
maximum linear difference is about 0.22082 against fancy upsampling but 0.00239
against nearest. No gain interpolation is needed to expose this discrepancy.

This is evidence of differing base reconstruction policies. It is not evidence
that the JPEG viewer's decoded colors are wrong or that HDR formula code should
be changed to reproduce libultrahdr's base decoder.

### Lower-resolution gain maps

With 4:4:4 base images, both formats pass all native-reference 1:1 gain-map cases
and all constant-gain controls. Differences appear with varying lower-resolution
gain maps: JPEG has six failures each at half and quarter resolution; AVIF has
two at half and six at quarter resolution, among 12 scenarios per ratio.
Pixel-center reconstruction from the independent decoded planes passes all these
4:4:4-base cases in both formats.

The viewer uses bilinear RGB texture sampling. libultrahdr 2.0.2's reconstruction
uses its `sampleMap` / `sampleMap3Channel` functions and a Shepard-IDW table for
integer scale factors; see the [versioned upstream implementation](https://github.com/google/libultrahdr/blob/v2.0.2/lib/src/jpegr.cpp#L1554).
libavif 1.4.1 resizes gain YUV before RGB conversion. These references do not
define the same computation. Matching sampling here is an explicit diagnostic
control, not a claim that one resampling policy is mandated by the file standard.

### Remaining AVIF decoded-plane differences

Only these two matched-sampling cases exceed tolerance, both in HDR:

- `baseline-avif-color-b420-g420-r1`: 15 pixels.
- `baseline-avif-color-b420-g420-r2`: 2 pixels.

Across this 8-bit corpus, AVIF GPU base samples differ from the independent
libavif RGB16 samples by up to 0.004979, and gain samples by up to 0.004776.
The formula control passes even for the two cases above. The evidence localizes
the discrepancy to decoded/uploaded samples rather than a demonstrated error in
the shared gain formula. Chroma conversion, interpolation and quantization still
need to be separated before labeling a specific operation incorrect.

This does not resolve or reclassify every earlier 10/12-bit AVIF failure. In
particular, the earlier 12-bit 4:2:0 base cases are not covered by these 8-bit JPEG
pairs. The earlier "17 base-group / 7 gain-group" counts describe fixture
variation, not proven root-cause categories.

## Reproduction and independence

```sh
JPEG_BASELINE=1 PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
JPEG_BASELINE=1 BROWSER_CHANNEL=msedge PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
```

Run browsers serially. Requirements: libultrahdr 2.0.2, libjpeg-turbo 3.2.0,
libavif 1.4.1, C/C++ compiler, pkg-config and the existing viewer/browser tooling.

- `jpeg-baseline.cpp` creates 40 pairs from identical pre-encode RGB samples:
  color edges / grayscale ramps, base 4:2:0 / 4:4:4, mono / RGB gain planes,
  gain 4:2:0 / 4:4:4, ratios 1 / 2 / 4, and constant-gain controls.
- Both encoders use quality 95; that number does not imply equivalent distortion
  or size. Each output is compared with independently decoding **its own file**,
  not with the other lossy format's output or with uncompressed source pixels.
- libultrahdr packages valid JPEG Gain Maps, independently parses metadata and
  reconstructs linear float16 P3. libjpeg independently decodes the extracted
  base and gain JPEGs. libavif decodes AVIF planes and reconstructs Rec.2020/PQ
  float16, converted to linear P3 by the existing harness.
- The controlled metadata is Display P3 with sRGB transfer, base working space,
  unit gamma, zero offsets, and 1–8x gain. Parsed viewer metadata is asserted
  against this contract before the simple CPU diagnostic calculation.
- `format-baseline.cjs` additionally evaluates independent decoded planes using
  pixel-center bilinear RGB sampling. A second control uses actual GPU textures
  to isolate formula/uniform errors. The latter cannot prove decode correctness.
- All comparisons retain `0.005 + 0.02 × pixel peak` in linear P3, with peak floor
  0.1. Raw normalized plane errors are reported separately.

Ignored local artifacts are `.local/avif-verification/jpeg-baseline/` (80 encoded
files, encoder versions and SHA-256 manifest) and
`engine-readback-{chromium,msedge}-jpeg-baseline.json`. The original full AVIF
reports use separate filenames. These are 32×24 synthetic controls, not a photo
corpus, visual-quality certification, arbitrary ICC/metadata conformance test,
mobile/Safari validation, or physical display luminance measurements.

## Consequence for the next fix

Keep JPEG runtime behavior intact for now. There is no demonstrated shared
formula defect in this controlled corpus. Preserve native-library comparisons as
interoperability evidence while separately reporting independent plane accuracy,
matched sampling and GPU math. Investigate AVIF decoded-plane differences next;
do not change the shared JPEG sampler just to make either native library's full
output match. Safari color-upload correctness remains in its separate issue draft.
