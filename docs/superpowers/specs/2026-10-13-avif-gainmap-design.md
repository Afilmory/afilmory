# AVIF gain maps in the tiled WebGPU viewer

## Problem and architecture

JPEG gain maps already reach the tiled WebGPU renderer, but an AVIF containing a
tone-map derived item currently loses that information. Fetch one original file;
extract its two compressed AV1 items in the texture worker; remux each into a
standalone AVIF Blob; decode through createImageBitmap; reuse existing GPU tiles,
matrices and reconstruction. No encoder, WASM decoder, extra network asset, build
manifest field, feature flag, or native-image viewer is introduced.

Reference: AVIF 1.2.0 §4.2.2, §6, §9
<https://aomediacodec.github.io/av1-avif/v1.2.0.html>.

## Boundaries and extension points

`avif-bmff.ts` provides bounds-checked container primitives. `avif-gainmap.ts`
owns item references, properties, metadata and capability decisions.
`avif-gainmap-color.ts` maps supported CICP primaries to D65 linear matrices.
The worker consumes a discriminated result: supported, none, unsupported, invalid.
Supporting another layout should extend item resolution; another color space
should extend color policy, without changing shader or worker message types.

Supported: static SDR-primary AV1 items; sRGB, Display P3, BT.2020 primaries;
SDR transfer characteristics 1/6/13/14/15 normalized by browser color management;
full/limited-range base matrices 0/1/5/6/9; one- or three-channel tmap metadata;
file or idat extents. Gain samples currently require full-range BT.601 (including
the unspecified matrix used by libavif). Gain reconstruction uses either base or
alternate primaries according to metadata. GPU base textures are Display P3, so
the input matrix always starts in Display P3, regardless of source primaries.

Unknown nonessential descriptive properties are ignored. Unknown essential
properties, grid/layered images, sequences, ICC-only color, auxiliary alpha/depth,
orientation/crop transforms, HDR-primary reconstruction, and unsupported color
recipes deliberately return unsupported. The parser does not claim full AVIF
conformance. Numerical budgets limit compressed input to 128 MiB, decoded planes
to 100 MP, container boxes to 4096 per level, and items/extents to 256. Selected
payload copies together cannot exceed input length. These are viewer policies,
not limits imposed by the AVIF standard.

## Failure behavior

No gain map is normal and silent. Unsupported capabilities and malformed gain-map
containers produce one existing worker warning and decode the original through
the browser, with no reconstructed-HDR metadata. This fallback may use a native
browser tone-map implementation; it must not be described as guaranteed SDR.
Failure to decode a remuxed base retries the original. Failure to decode a gain
plane retains the decoded base and clears HDR metadata. If the browser cannot
decode either base, the existing image error path applies. Warnings stay in the
existing diagnostics channel, with no new untranslated UI strings.

## Validation and remaining scope

Public synthetic fixtures cover three primaries, half-resolution gain maps and
ordinary AVIF. Unit tests cover lossless remuxing, color matrix inversion,
container corruption/truncation and unsupported capabilities. Scoped package
Vitest, TypeScript and ESLint checks are required. Browser validation must decode
both remuxed planes, request only the original, and upload to WebGPU.

This reuses existing full-alternate reconstruction and browser extended-range
canvas tone mapping; adaptive display-headroom weighting is a separate renderer
change. True HDR luminance and Safari/iPhone behavior require device validation.
