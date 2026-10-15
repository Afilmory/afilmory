# AVIF gain-map coverage and next steps

## 2026-10-15 AVIF-specific fix — high-bit-depth gain samples

This change fixes one independently isolated AVIF defect, not the entire expanded
corpus. 10/12-bit gain items now use native `ImageDecoder` YUV samples, full-range
BT.601 conversion with centered chroma interpolation, float16 ImageData/bitmaps,
and rgba16float gain textures. Original AV1 bytes remain in the single AVIF;
there is no auxiliary request or bundled software AV1 decoder. Frame transforms
are applied once. Native frames and decoders close on success and failure.
8-bit AVIF gain items and JPEG/Ultra HDR retain their previous bitmap/rgba8 path.

The independent libavif RGB16 plane reference exposes the original 12-bit 4:2:0
gain error of approximately 0.3534. The new gain textures match all 12 high-depth
corpus recipes within 0.000248 (normalized samples, including float16 rounding),
with a separate strict 0.0003 gate in both HDR and SDR runs. The previously failing
colored 12-bit 4:2:0 gain reconstruction now satisfies the unchanged final-image
tolerance. This is gain-plane precision, not end-to-end 12-bit output precision.

Validation: 55 unit tests, scoped ESLint and package typecheck pass. Chromium
151.0.7922.34 and Edge 155.0.4283.45 complete 136 rendering scenarios: 112 satisfy
their checks, 24 still exceed the unchanged final-image numerical tolerance
(previously 25 failures among 132). Original scenarios and four added native
gain-decode failure/missing-API scenarios pass. JPEG HDR/SDR pixels remain exactly
equal to the legacy decoder. Six lifecycle/error cases per browser pass with a
12MP base and 12-bit gain, confirmed rgba16float overview, approximately 50.19 MiB
peak tracked textures, and zero remaining tracked resources after disposal.
The full browser command intentionally still exits nonzero.

Missing native sample decoding, reduced decoder bit depth, unsupported native
pixel layout/transform metadata, ignored float16 ImageData, or a conversion
allocation over 128 MiB produces one existing viewer warning and an SDR-base
fallback without reconstructed-HDR status. This limit bounds native sample plus
conversion buffers; it is not total process RSS. The separate GPU budget remains
128 MiB and accounts for 8 bytes per gain texel. Explicitly sited high-depth 4:2:0
chroma is conservatively unsupported. Float16 has more precision than rgba8, but
does not represent every 12-bit normalized value exactly.

Next AVIF work, in order:

1. Isolate and fix base-plane decoding, especially 12-bit 4:2:0 colored edges
   already different in SDR, plus 10/12-bit quantization amplified in HDR. Keep
   ICC/profile handling and bounded large-photo memory; do not blindly apply the
   gain-data decoder to display colors.
2. Establish a controlled resampling comparison for low-resolution gain maps.
   libavif resizes YUV before conversion (including endpoint alignment in the
   observed scaler), while the viewer samples RGB textures at pixel centers.
   Quarter-resolution ramps expose this even with correct native gain samples.
   Preserve both results and the existing strict gate; do not change the shared
   JPEG shader or relax tolerance just to match one scaler.
3. Add real high-depth transformed exports and tile-seam numerical coverage.
   Native transform mapping has unit coverage; the existing real transformed
   fixtures still exercise the unchanged 8-bit gain path.

Safari shared color-upload correctness is explicitly outside this fix. Its
[independent issue draft](./2026-10-15-safari-webgpu-color-upload-issue.md) retains
the prior evidence. No Safari support claim, production deploy, or thumbnail-mode
change is made here.

## Earlier 2026-10-15 baseline — expanded corpus is not green

The first follow-up validation pass adds 42 reproducible synthetic AVIF recipes,
two extracted-base retry scenarios and six resource/error lifecycle scenarios.
Both Chromium 151.0.7922.34 and Edge 155.0.4283.45 complete 132 rendering scenarios:
107 satisfy their checks; 25 exceed the existing `0.005 + 0.02 × pixel peak`
linear numerical tolerance. The original 46 scenarios still pass. All six
12MP lifecycle/error scenarios pass in each browser; peak tracked texture
allocation is 45.16 MiB and tracked resources return to zero after disposal.
The command exits nonzero for numerical failures and saves their complete report.

The controlled base matrix covers 8/10/12-bit, 4:2:0/4:4:4 and full/limited range
with a fixed half-resolution 8-bit 4:4:4 gain plane. Gain cases independently vary
depth, chroma and size. Seventeen failed scenarios are in the base matrix and
eight in the gain variants. Two failures already appear in SDR for 12-bit 4:2:0
colored edges; the other 23 are HDR comparisons. Quarter-resolution gain maps
also expose differences on the grayscale ramp. Do not attribute every difference
to bit depth or mark these recipes supported merely because they decode.

The next focused task is to separate decoded base/gain plane error from scaling
and reconstruction error. The reference uses libavif scaling of YUV gain planes
before YUV→RGB; the current renderer samples browser-decoded RGB gain textures
bilinearly and stores gain textures as rgba8. These are known differences in
the paths, not yet a demonstrated root cause for every failing pixel. Preserve
the current strict reference checks; add independent plane/interpolation controls
before changing precision, sampling or supported-input policy. Do not raise
tolerance, silently skip failing recipes, or claim every libavif pixel difference
is itself an AVIF-standard violation.

After the user enabled Remote Automation, installed Safari 27.0.1 completed the
same 132 scenarios through its real WebDriver: 78 numerical comparisons fail,
including previously Chromium-verified colored SDR fixtures. All six lifecycle
checks pass, with about 81.39 MiB peak tracked textures under Safari's native
display scale. The harness does not force Safari to Playwright's device scale.
This is now actual WebKit coverage; it is not iPhone or physical-nits validation.
A later final Safari repeat timed out at the WebDriver transport layer; retain
the earlier complete 132-case result and the separate error record. Safari
automation stability is also unresolved, not a reason to mark that repeat passed.

An independent 1×1 canvas probe isolates a browser color-upload discrepancy:
`copyExternalImageToTexture` of sRGB `#704030` yields the same half-float RGB
`[0.439209, 0.250977, 0.188232]` for both sRGB and Display P3 destinations in this
Safari. A color-managed P3 canvas read instead yields `[105,66,51] / 255`.
Canvas and ImageBitmap sources both reproduce the upload discrepancy. Safari also
returns 8-bit ImageData when this probe requests `rgba-float16`; do not assume a
CPU-readback workaround preserves wide-gamut/float precision. This identifies a
shared image→GPU color-conversion problem, not an AVIF parser-only problem or a
complete explanation of all 78 failures. Next work must add a validated capability
policy or color-correct upload path shared with JPEG, with independent color tests;
the exact old/new JPEG parity check alone cannot detect a pre-existing shared bug.

No viewer runtime behavior, production gallery patch or default thumbnail mode
changed in this pass. Reports and generated fixtures are ignored local artifacts;
reproduction commands and limits are in `packages/webgl-viewer/tests/browser/README.md`.

## Current, verified scope

Single-file SDR-primary AVIF extraction reuses the existing texture worker and
WebGPU renderer. Container, color and transform policy are separate modules;
unsupported features fall back through browser decoding without reconstructed-HDR
metadata. No extra image asset/request is required.

| Area | Evidence | Boundary |
| --- | --- | --- |
| sRGB/P3/BT.2020 | Actual 10-bit full-range 4:4:4 AVIF → worker → Engine → rgba16float readback against libavif, gray and colored fixtures | Storage bit depth does not establish end-to-end precision |
| Gain size | Half-resolution gain map, native interpolation, original single request | Other ratios are accepted but need real corpus coverage |
| Orientation | 90/180/270° rotation, both mirrors, integer proportional crop and crop/rotation/mirror combination | Same normalized region and canonical order on both planes; output-level, fractional and mismatched transforms rejected |
| ICC | Real LittleCMS sRGB + nclx, alternate and base working space, D50-aware matrix path | Other valid matrix/TRC profiles are parser-tested only; ICC-only, LUT, gain ICC, ICC cicp rejected |
| JPEG | Real matrix-ICC JPEG gain map: exact old/new metadata, matrices and rendered HDR/SDR pixels | No claim about every vendor's JPEG profile |
| SDR gating | Forced standard dynamic range, unavailable extended canvas, both runtime HDR/SDR transitions | Capability simulation, not physical SDR/HDR display luminance |
| Diagnostics | Ordinary AVIF silent; unsupported tmap and injected gain decode failure warn once, load succeeds without HDR state | Malformed/container rejection and grid/alpha/HDR-primary mutations have unit coverage; not all unsupported forms have browser fixtures |
| Bounds | Truncated prefixes, allocation/count limits, ICC tag bounds/overlap, invalid curves and reserved transform bits | Not a full conformance or fuzz campaign |

The numerical criterion is linear Display P3 error ≤ `0.005 + 0.02 × pixel peak`
(peak floor 0.1). HDR values exceed 1. Independent libavif reconstruction uses
Rec.2020/PQ f16 output to avoid its clipped linear output. ICC uses an equivalent
known sRGB reference because libavif cannot reconstruct ICC. Reports are generated
at `.local/avif-verification/engine-readback.json`; GPU values are not screen nits.

## Product integration is a separate acceptance layer

Read-only inspection of this branch identifies three integration gaps; the viewer
changes do not claim complete Builder, thumbnail or metadata-panel AVIF support:

- `packages/builder/src/photo/gainmap-detector.ts` only inspects EXIF
  `ContainerDirectory`. `image-pipeline.ts` also checks `MPImageType` and
  `UniformResourceName` when assigning manifest `isHDR`. There is no structural
  AVIF tmap/item-reference detection here. Some files may be recognized through
  their extracted EXIF fields, but those heuristics do not establish detection for
  AVIF files without those fields or distinguish unsupported gain-map layouts.
- `packages/builder/src/image/thumbnail.ts` sends the original buffer through
  Sharp, auto-rotation, resize and JPEG encoding. It does not explicitly select
  the AVIF SDR base or define gain-map tone mapping and output color policy.
  ThumbHash uses that generated thumbnail. Current output depends on the pinned
  Sharp/libvips decoder; this is a missing policy/validation guarantee, not proof
  that existing thumbnails are wrong.
- `apps/web/src/modules/metadata/formatExifData.tsx` translates EXIF `ColorSpace`,
  and `ExifPanel.tsx` displays it as color space. The selected EXIF schema does
  not normalize AVIF nclx/ICC colorimetry. An EXIF `Uncalibrated` value alone does
  not mean the AVIF lacks nclx/ICC or that the renderer ignores its color profile.
  The panel currently cannot explain that distinction.

The displayed HDR badge is already driven by the viewer's `onHDRChange` callback
in `ProgressiveImage.tsx`, not solely by manifest `isHDR`. Future Builder metadata
must preserve this distinction between an HDR-capable file and HDR output actually
enabled on the current renderer/display. The present Engine tests bypass Builder
and the full application; they are not product-integration acceptance tests.

## Prioritized follow-up plan

Each item needs its own reviewable change, fixtures, warnings and fallback tests.
Do not silently broaden capability checks before the corresponding renderer and
interoperability evidence exist.

| Priority | Work and benefit | Dependency / acceptance | Until then |
| --- | --- | --- | --- |
| P1 | Builder AVIF gain-map detection and manifest semantics | Add bounded structural tmap/item-reference inspection or a shared environment-neutral inspector; define file gain-map presence separately from supported reconstruction/current display. Build public fixtures with and without legacy EXIF hints, ordinary AVIF, malformed and unsupported layouts; verify manifest migration/cache invalidation and full-app runtime HDR badge behavior. Preserve JPEG detection regression | Keep existing EXIF heuristics; do not claim `isHDR` reliably describes every AVIF or gate actual rendering on that flag |
| P1 | Explicit SDR thumbnail/ThumbHash policy | Pin/test Sharp/libvips behavior and choose SDR-primary extraction or defined tone mapping; normalize/profile JPEG output intentionally. Compare thumbnails against SDR reference for nclx/ICC, rotation/crop and saturated colors, verify full-app thumbnail→SDR viewer transition and ThumbHash consistency. Include cache regeneration/versioning and clear failure diagnostics | Existing generic Sharp JPEG pipeline remains; no AVIF-specific SDR guarantee from the worker tests |
| P2 | Consistent color metadata explanation | Normalize nclx primaries/transfer/matrix/range and ICC provenance into typed Builder metadata; define ICC/nclx precedence separately from the preserved source EXIF field. UI/i18n tests for EXIF `Uncalibrated` with valid P3/BT.2020 nclx or ICC, missing/contradictory fields and unsupported profiles; do not infer HDR from primaries or EXIF alone | Preserve raw EXIF information; do not relabel `Uncalibrated` as rendering failure or silently invent sRGB |
| P1 | Real-world encoding corpus and precision: full/limited YUV 4:2:0 and 4:4:4, 8/10/12-bit, varied gain ratios; unequal multi-extents and idat; ICC+nclx and no ICC | Public/reproducible fixtures; compare decoded planes and final HDR/SDR pixels against libavif/LittleCMS; measure quantization, gradients, dark small components and saturated colors separately. Verify no claimed bit depth without measured preserved levels | Keep current browser path and document measured error; reject unsupported recipes |
| P1 | Safari/iOS and physical HDR/SDR displays | Same numerical tests where WebGPU permits; test orientation/CORS/ICC; measure HDR highlights and SDR white with OS/display settings recorded, preferably a meter; test monitor changes | No physical-nits or cross-browser promise; existing browser/viewer failure path |
| P1 | Broader matrix ICC and ICC-only AVIF | LittleCMS independent color reference for P3/Adobe RGB/custom TRCs; AV1 sequence-header parser for YUV when nclx absent; verify ICC precedence and D50 adaptation exactly once | ICC-only, LUT and cicp-tag profiles remain explicitly unsupported |
| P2 | Grid-derived base/gain images for large camera exports | Resolve bounded derivation graph, tile geometry, per-item properties and cumulative decode budget; whole-image vs tiled reference incl seams and transforms, malformed/cyclic references | Warn and native decode; do not present reconstructed HDR |
| P2 | Auxiliary alpha | Preserve alpha graph, straight/premultiplied semantics and color conversion; numeric tests on transparent edges and checkerboard compositing, gain alignment | Warn and native decode so alpha is not silently discarded |
| P2 | HDR-primary / inverse reconstruction | Define working transfer and offsets in shared renderer; independent forward/reverse reference, capacity endpoints and SDR output; coordinate JPEG parity | Explicitly unsupported; no inverse formula guessed from SDR path |
| P2 | Adaptive display headroom | Shared JPEG/AVIF shader weight, reliable capability/headroom source or explicit policy; test headroom 1/intermediate/full, dynamic changes and clipping | Existing full-alternate reconstruction + browser extended-canvas tone mapping |
| P3 | More general transforms, sequences/layers and LUT ICC | Dedicated derivation/timeline/color-management design and decoder support; bounded memory, cancellation, orientation and color tests | Conservative rejection remains |

Maintain separate tests for `none`, `unsupported`, `invalid`, browser base-decode
retry and gain-decode fallback as new forms are added. A feature being accepted by
the container parser is only the first stage of its acceptance criteria.
