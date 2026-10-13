# Synthetic AVIF gain maps

These 32×24 grayscale ramps were generated for this project; they contain no
photographs, identifying metadata, or third-party image material. They are
distributed under the same license as the viewer package.

Run `sh generate-avif.sh` with ImageMagick 7 and libavif 1.4.1 (gain-map enabled)
to regenerate them. Normal Vitest runs require neither program.

`gainmap-{1,12,9}.avif` use sRGB, Display P3, and BT.2020 primaries respectively,
with sRGB transfer characteristics and BT.601 matrix coefficients. Their alternate
image uses BT.2020/PQ; the gain map is half resolution. `sdr.avif` has no gain map.

The fixtures test actual AV1 remuxing and browser decoding. Additional malformed
containers are derived in memory, keeping mutation intent visible in the tests.

`metadata-reference.json` records the per-channel rational values returned by
libavif 1.4.1's C API, using `avif-reference.c`; it does not derive expected values
from the TypeScript parser. Compile with `cc avif-reference.c -lavif -o avif-reference`
(add your installation's include/library search paths), then run it on each AVIF.
Rebuild the JSON keys `1`, `12`, and `9` when regenerating these fixtures.

`sdr.jpg` and `gainmap.jpg` are the same synthetic ramp encoded as JPEG. The latter
appends an independently decodable JPEG with Adobe gain-map XMP to exercise the
existing JPEG extraction and bitmap path. Python 3 is needed only to regenerate it.
