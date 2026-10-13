#!/bin/sh
# Synthetic ramps only. Requires ImageMagick 7 and libavif 1.4.1 with gain-map support.
set -eu
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
magick -size 32x24 gradient:'#181818-#b0b0b0' -depth 16 "$tmp/base.png"
magick -size 32x24 gradient:'#202020-#e0e0e0' -depth 16 "$tmp/hdr.png"
for primary in 1 12 9; do
  avifgainmaputil combine "$tmp/base.png" "$tmp/hdr.png" "gainmap-$primary.avif" \
    --cicp-base "$primary/13/6" --cicp-alternate 9/16/9 \
    --ignore-profile -d 10 -y 444 -q 90 --qgain-map 90 --downscaling 2
done
avifenc --ignore-exif --ignore-xmp --ignore-icc --cicp 1/13/6 "$tmp/base.png" sdr.avif
magick "$tmp/base.png" -strip sdr.jpg
python3 - <<'PY'
from pathlib import Path
import struct
base = Path('sdr.jpg').read_bytes()
xmp = b'http://ns.adobe.com/xap/1.0/\0' + b'''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0" hdrgm:GainMapMin="0" hdrgm:GainMapMax="2" hdrgm:Gamma="1" hdrgm:OffsetSDR="0" hdrgm:OffsetHDR="0" hdrgm:HDRCapacityMin="0" hdrgm:HDRCapacityMax="2"/></rdf:RDF></x:xmpmeta>'''
gain = base[:2] + b'\xff\xe1' + struct.pack('>H', len(xmp) + 2) + xmp + base[2:]
Path('gainmap.jpg').write_bytes(base + gain)
PY
