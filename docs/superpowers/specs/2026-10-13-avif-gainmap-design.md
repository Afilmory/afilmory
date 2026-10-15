# AVIF gain maps in the tiled WebGPU viewer

## Architecture

A static AVIF containing an ISO tone-map derived item can use the same tiled HDR renderer as JPEG gain maps.
The texture Worker fetches one original, resolves its base/gain AV1 items, remuxes each into an in-memory AVIF Blob, and reuses the existing GPU textures, transforms and reconstruction.
There is no AV1 re-encoding, bundled software decoder, extra image request, manifest field or feature flag.
The format reference is [AVIF 1.2.0](https://aomediacodec.github.io/av1-avif/v1.2.0.html), particularly tone-map items and item properties.

`avif-bmff.ts` supplies bounded container primitives; `avif-gainmap.ts` owns item resolution, metadata and capability decisions.
Color and geometry policies live in `avif-gainmap-icc.ts`, `avif-gainmap-color.ts` and `avif-gainmap-transform.ts`.
`gainmap-color.ts` shares ICC matrix utilities with JPEG while retaining JPEG's existing accepted-profile policy.
The Worker consumes a discriminated supported/none/unsupported/invalid result.
New layouts or color spaces should extend those policies instead of adding shader format branches.

The browser color-manages the SDR base through ImageBitmap.
Colored 8-bit and all 10/12-bit gain items use native ImageDecoder YUV samples, explicit full-range BT.601 conversion and centered 4:2:0 interpolation in `avif-gainmap-decode.ts`.
Their fractional RGB values remain float16 through bitmaps and GPU textures because gain values are data, not display colors.
Monochrome 8-bit gain retains the bitmap/rgba8 path.
Base conversion remains browser-dependent; storage depth does not imply end-to-end precision.

## Supported input policy

Recommended input is a static SDR-primary AVIF with a 10-bit full-range 4:4:4 Display P3 base (`nclx` 12/13/6), and an 8-bit full-range 4:4:4 BT.601 gain map with half the base width and height.
Bake orientation/crop into pixels for the simplest interoperable export.
The gain-map metadata must describe the actual image; do not impose a fixed HDR boost on every photograph.

The parser accepts sRGB, Display P3 and BT.2020 primaries, SDR transfer identifiers 1/6/13/14/15, base matrix identifiers 0/1/5/6/9 and full/limited base range.
Gain samples require full-range BT.601, including the unspecified matrix emitted by libavif which is explicitly pinned during remuxing.
Native gain decoding accepts I420/I444 at 8/10/12 bits; explicitly sited gain chroma is unsupported.
One- and three-channel tmap parameters, file/idat extents, and base/alternate gain working spaces are supported.
Container parsing does not certify every permitted encoding combination.

Aligned integer-pixel `clap`, then `irot`, then `imir` are supported on both planes.
The normalized crop region and orientation must match, including lower-resolution gain maps.
The browser applies preserved transforms once; the native gain path applies the frame's reported rotation/flip once after sample extraction.
Fractional, mismatched, repeated, differently ordered or tmap-output transforms are rejected.

One matrix/TRC RGB ICC v2/v4 profile can coexist with explicit nclx.
ICC controls RGB colorimetry and browser TRC decoding; nclx supplies YUV matrix/range.
ICC colorants already use PCS D50 and must not receive a second chromatic adaptation.
Real LittleCMS sRGB profiles have browser coverage; other matrix profiles have narrower parser coverage.
ICC-only, LUT profiles, gain-plane ICC and ICC profiles carrying `cicp` are unsupported.

Grid/layered images, sequences, auxiliary alpha/depth, HDR-primary reconstruction and unknown essential properties are unsupported.
Unknown nonessential descriptive properties are ignored.
This is a bounded viewer adapter, not a general AVIF decoder or conformance checker.
Input is limited to 128 MiB, each image to 100 MP, container boxes to 4096 per level, and items/extents to 256.
Selected payload copies cannot exceed input length.
Native gain samples plus the float16 conversion buffer have a separate 128 MiB budget; GPU texture accounting includes 8 bytes per float16 gain texel.
These are application limits, not AVIF limits or total process-memory guarantees.

## Fallback and correctness boundaries

Ordinary AVIF without a gain map is silent.
Unsupported or invalid gain-map input produces one existing diagnostic warning and attempts original-file browser decoding without custom HDR metadata.
Failure to decode an extracted base also retries the original.
Gain decoding failure, unavailable precision APIs or a conversion budget violation retains the extracted SDR base and clears custom HDR state.
If browser decoding also fails, the existing image error path applies.
Original-file fallback is not guaranteed SDR because native browsers may interpret gain maps themselves.
Warnings do not add untranslated product UI.

The renderer retains its existing full-alternate reconstruction and extended-canvas tone mapping; adaptive display-headroom weighting is separate work.
Browser base YUV-to-RGB conversion has known precision/interpolation limitations, especially 12-bit 4:2:0 edges.
Do not rewrite the shared shader merely to match libavif's YUV gain resizing policy.
Safari's shared external-image color-upload discrepancy is separately tracked; Chromium/Edge numerical validation does not establish Safari/iPhone or physical-display correctness.
Builder HDR discovery, color metadata UI and HDR thumbnail generation are separate integration work.

## Acceptance and contribution scope

Keep implementation, focused package unit tests, small public fixtures with provenance, and reproducible browser/reference tooling in Git.
Keep raw reports, screenshots, generated corpora and chronological investigation notes local; concise validation evidence belongs in the PR/release description.
The [browser acceptance guide](../../../packages/webgl-viewer/tests/browser/README.md) defines hard correctness checks, explicit base-fidelity limitations and optional strict native comparisons.
Future work is base conversion fidelity, real transformed/high-depth camera samples and numerical tile-seam coverage, followed by additional formats based on actual inputs.
