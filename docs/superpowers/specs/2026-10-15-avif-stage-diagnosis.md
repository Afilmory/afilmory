# AVIF rendering differences: stage-by-stage diagnosis

## Conclusion

The 26 native-reference differences are not 26 shader defects. With the existing
renderer unchanged, all 88 diagnosed HDR/SDR scenarios pass an independent CPU
reconstruction from the actual uploaded samples. After matching sampling policy,
18 of the 26 native-reference differences disappear; eight scenarios still
differ, and replacing only the base pixels reproduces a failure in those same
eight scenarios. Replacing only the gain pixels does not fail any scenario.

This is evidence that the shared GPU reconstruction is functioning correctly
for this corpus. The remaining image-fidelity limitations occur before it, in
the browser's YUV-to-base-RGB conversion, plus reconstruction policy differences
between the native reference and viewer. No production rendering code or error
tolerance changes in this investigation.

## Measurements

Chromium 151.0.7922.34 and Edge 155.0.4283.45 each complete the full 140-scenario
suite and six lifecycle checks, with identical diagnostic counts. The diagnostics cover the 42 generated encoding recipes in HDR and SDR,
plus the sRGB-base and equivalent ICC-base fixtures: 88 scenarios total.

| Independent check | Result |
| --- | --- |
| Browser native AV1 YUV samples vs libavif, before RGB conversion | 42/42 exactly identical |
| Decoded base bitmap read through float16 P3 canvas vs GPU base texture | 42/42 exactly identical |
| CPU formula on uploaded base/gain samples vs GPU final output | 88/88 within unchanged tolerance |
| CPU model of native scaling/intermediate depths vs libavif final output | 88/88 within unchanged tolerance |
| Independently decoded RGB16 planes with viewer sampling vs final output | 80/88 within tolerance |
| Replace only base pixels, leaving reference gain pixels unchanged | Same eight scenarios exceed tolerance |
| Replace only gain pixels, leaving reference base pixels unchanged | 88/88 within tolerance |

The bitmap probe receives the already available file bytes from the harness;
there is still only one actual image request through the viewer. It verifies
float16 canvas/readback support rather than accidentally measuring an 8-bit
canvas. The YUV probe reads native ImageDecoder planes and checks exact values,
dimensions and depth against libavif. Probe frames, bitmaps and decoders close
on all paths. The probe does not exercise arbitrary ICC profiles or transforms.

## What the remaining eight mean

| Base encoding | Modes with matched-sampling differences | Evidence |
| --- | --- | --- |
| Colored 12-bit 4:2:0 full range | SDR and HDR | Browser RGB closely follows nearest chroma, not the independent smooth decode |
| Colored 12-bit 4:2:0 limited range | SDR and HDR | Same chroma behavior, with additional small conversion differences |
| Colored 10-bit 4:2:0 limited range | HDR | Small base conversion differences are amplified by the gain |
| Colored 12-bit 4:4:4 full range | HDR | Base conversion/precision; there is no subsampled chroma to resize |
| Colored 12-bit 4:4:4 limited range | HDR | Base conversion/precision; there is no subsampled chroma to resize |
| Ramp 12-bit 4:4:4 limited range | HDR | Small base conversion differences cross the threshold in four final pixels |

For colored 12-bit 4:2:0 full range, maximum linear P3 base error is about 0.05953
against the smooth independent decode, versus 0.00214 against an independently
decoded nearest-chroma control. Limited range is about 0.05525 vs 0.00476. The
edge difference exists in SDR before applying any gain. It grows to about 1.862
linear P3 units in the full-range HDR reconstruction.

The other affected base cases have maximum base differences of roughly
0.0041–0.0053 in linear P3. They pass the SDR tolerance but become visible to the
HDR numerical gate. Both base bit-depth conversion and integer/float rounding
are implicated; this test does not claim a particular Chromium source-code
instruction or a specific output-bit-depth contract without further evidence.
Nearest versus smooth chroma is a reconstruction policy difference, not by
itself proof of a file-format conformance violation.

## Why native-library comparison is not a shader oracle

libavif 1.4.1's [versioned reconstruction implementation](https://github.com/AOMediaCodec/libavif/blob/v1.4.1/src/gainmap.c#L162)
scales the YUV gain image to the base size before RGB conversion. Its base and
gain intermediates use the default RGB depth derived from each image; the
viewer's gain conversion now preserves fractional RGB in float16 and samples
the resulting RGB texture at pixel centers. The reference also stores its final
Rec.2020/PQ output in float16 before conversion back to linear P3 for comparison.

The diagnostic independently reconstructs both policies using native decoded
planes and metadata. Color matrices are derived from libavif's primary/white
chromaticities, not imported from viewer uniforms. Modeling the native policy
agrees with its full output in all 88 cases. Using the viewer's policy with its
uploaded planes agrees with the GPU in all 88 cases. The implementations are
computing different reconstructions; a pixel difference alone does not identify
an incorrect shader.

The isolated native scaling effect exceeds tolerance in 19 scenarios. Native
intermediate-depth/rounding effects alone stay within tolerance, but can combine
with base conversion and sampling differences near the gate. These counts are
overlapping diagnostic controls, not categories to add together. The two
previously discussed sRGB/ICC-base native differences both pass the matched
sampling reference and the formula control.

## Reproduction and next work

```sh
AVIF_DIAGNOSTICS=1 PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
AVIF_DIAGNOSTICS=1 BROWSER_CHANNEL=msedge PLAYWRIGHT_MODULE=/path/to/@playwright/test python3 packages/webgl-viewer/tests/browser/run.py
```

Run browsers serially. Reports are
`.local/avif-verification/engine-readback-<browser>-diagnostics.json`; they do not
overwrite ordinary or paired-baseline reports. The command still exits nonzero
for the 26 retained native differences. Raw YUV, uploaded-formula and native-model
checks have separate hard assertions. No thresholds were loosened.

Keep the shared HDR shader intact. If better AVIF fidelity is required next,
work on the **base decoding path**: preserve high-depth YUV-to-RGB precision and
make chroma sampling explicit for well-defined nclx color spaces, while retaining
correct ICC handling, transform behavior, memory limits and warned fallback.
That is separate from matching libavif's particular gain-map scaler. Safari's
shared upload issue also remains separate. These numerical results do not assert
physical display luminance or validate every AVIF encoding.
