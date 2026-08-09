#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace_root="$(cd "$script_directory/../../.." && pwd)"
output_directory="$script_directory/../modules/photo-masonry/ios/Resources/Locales"

mkdir -p "$output_directory"

for namespace in app mobile; do
  source_directory="$workspace_root/locales/$namespace"
  for source_file in "$source_directory"/*.json; do
    filename="$(basename "$source_file")"
    cp "$source_file" "$output_directory/$namespace-$filename"
  done
done
