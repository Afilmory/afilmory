#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
"$here/subset-fonts.sh"
"$here/fixture-media.sh"
