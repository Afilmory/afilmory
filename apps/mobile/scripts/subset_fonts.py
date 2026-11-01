#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "Afilmory/Resources/Localizable.xcstrings"
KEYS = ROOT / "Afilmory/Resources/Fonts/display-keys.json"
OUT = ROOT / "Afilmory/Resources/Fonts"
REGIONS = {"SC": "zh-Hans", "TC": "zh-Hant", "HK": "zh-HK", "JP": "ja", "KR": "ko"}
BASE_CHARS = "".join(chr(c) for c in range(0x20, 0x7F)) + "·—…“”‘’"


def collect(language: str) -> str:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))["strings"]
    keys = json.loads(KEYS.read_text(encoding="utf-8"))
    chars = set(BASE_CHARS)
    for key in keys:
        unit = catalog.get(key, {}).get("localizations", {}).get(language, {}).get("stringUnit")
        if not unit:
            sys.exit(f"missing {language} translation for display key: {key}")
        chars.update(unit["value"])
    return "".join(sorted(chars))


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: subset_fonts.py <dir with SourceHanSerif{SC,TC,HK,JP,KR}-SemiBold.otf>")
    sources = Path(sys.argv[1])
    for region, language in REGIONS.items():
        source = sources / f"SourceHanSerif{region}-SemiBold.otf"
        output = OUT / f"SourceHanSerif{region}-SemiBold-Subset.otf"
        text = collect(language)
        subprocess.run(
            ["pyftsubset", str(source), f"--text={text}", f"--output-file={output}",
             "--layout-features=*", "--name-IDs=*", "--name-languages=*", "--no-hinting"],
            check=True,
        )
        print(f"{output.name}: {len(text)} chars, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
