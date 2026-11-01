#!/usr/bin/env bash
set -euo pipefail
app="${1:?usage: check-release-bundle.sh <path/to/Afilmory.app>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
leaked=0
while IFS= read -r name; do
  if [ -e "$app/$name" ]; then
    echo "fixture resource in release bundle: $name" >&2
    leaked=$((leaked + 1))
  fi
done < <(find "$root/Afilmory/Fixtures" -type f ! -name '*.swift' -exec basename {} \; | sort -u)
[ "$leaked" -eq 0 ] || { echo "$leaked fixture resources leaked" >&2; exit 1; }
echo "release bundle clean"
