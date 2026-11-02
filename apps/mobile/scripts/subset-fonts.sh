#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
fonts="$here/../Afilmory/Resources/Fonts"
cache="${AFILMORY_FONT_CACHE:-$HOME/Library/Caches/afilmory-font-sources}"
source_han="https://github.com/adobe-fonts/source-han-serif/raw/7889f11bf31170b5d092a083b357c8c8130f89e0/SubsetOTF"
tex_gyre="https://mirrors.ctan.org/fonts/tex-gyre/opentype"
mkdir -p "$cache"

fetch() {
  local file="$cache/$1" url="$2" expected="$3"
  if [ -f "$file" ] && [ "$(shasum -a 256 "$file" | cut -d' ' -f1)" != "$expected" ]; then
    rm -f "$file"
  fi
  if [ ! -f "$file" ]; then
    curl -fsSL -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  local actual
  actual="$(shasum -a 256 "$file" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    rm -f "$file"
    echo "checksum mismatch for $1: expected $expected, got $actual" >&2
    exit 1
  fi
}

fetch SourceHanSerifSC-SemiBold.otf "$source_han/CN/SourceHanSerifCN-SemiBold.otf" 50d3f12201ce2dd840650b6bfa47ebb8572ecf767eec0e5ccb20a247b5bfa805
fetch SourceHanSerifTC-SemiBold.otf "$source_han/TW/SourceHanSerifTW-SemiBold.otf" 089660b2a0123885b3157bba02963e867eb9109fe2f5b1c30aa68db158a17702
fetch SourceHanSerifHK-SemiBold.otf "$source_han/HK/SourceHanSerifHK-SemiBold.otf" a9739f077a5fcc2dae40670681e3c23050540b31e685fe515936690c4d6633b7
fetch SourceHanSerifJP-SemiBold.otf "$source_han/JP/SourceHanSerifJP-SemiBold.otf" 7d6b0349e32033950132970a9dbdadcd4cd7ce232eedd8869ba8f58c9d089ca2
fetch SourceHanSerifKR-SemiBold.otf "$source_han/KR/SourceHanSerifKR-SemiBold.otf" f959ed812534357527574ab34b4a15d03f8922c6e15c967e56790a244a122eb3
fetch texgyreschola-regular.otf "$tex_gyre/texgyreschola-regular.otf" 935b82e25f56b1d1276ca82793205e8ce254fbb37ebd38bedf7388cef21fbf44
fetch texgyreschola-italic.otf "$tex_gyre/texgyreschola-italic.otf" 2f45b8c394037951aaec73d947f0b0c3af715950f8f207c9f4290ba37a53a4d2
command -v pyftsubset >/dev/null || { echo "pyftsubset not found: brew install fonttools" >&2; exit 1; }
# TeX Gyre Schola ships hhea metrics of 1135/-332 (1.47em), which CoreText uses as line height; titles need ~1.2em.
tighten() {
  local metrics="$cache/$2.hhea.ttx"
  ttx -q -t hhea -o "$metrics" "$cache/$1"
  sed -i '' -e 's/<ascent value="[-0-9]*"/<ascent value="920"/' -e 's/<descent value="[-0-9]*"/<descent value="-280"/' -e 's/<lineGap value="[-0-9]*"/<lineGap value="0"/' "$metrics"
  ttx -q -m "$cache/$1" -o "$fonts/$2" "$metrics"
}
tighten texgyreschola-regular.otf TeXGyreSchola-Regular.otf
tighten texgyreschola-italic.otf TeXGyreSchola-Italic.otf
python3 "$here/subset_fonts.py" "$cache"
