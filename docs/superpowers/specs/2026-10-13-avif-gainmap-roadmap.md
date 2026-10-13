# AVIF gain-map coverage and next steps

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

## Prioritized follow-up plan

Each item needs its own reviewable change, fixtures, warnings and fallback tests.
Do not silently broaden capability checks before the corresponding renderer and
interoperability evidence exist.

| Priority | Work and benefit | Dependency / acceptance | Until then |
| --- | --- | --- | --- |
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
