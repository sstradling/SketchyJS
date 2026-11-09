#!/usr/bin/env bash
# Compiles the pinned Sketchy sources for the iOS simulator and runs them there, so the
# fixtures come from UIKit, CoreGraphics, CoreText and SwiftUI rather than the Linux shims.
# Linux fixtures are not overwritten.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"
OUT="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${1:-$ROOT/fixtures/swift-reference/v1.5.0}")"
PREVIEWS="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${2:-$ROOT/../sticker-previews}")"
bash scripts/prepare.sh
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"
TARGET="${ARCH}-apple-ios17.0-simulator"
DEVICE="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/ { print $2; exit }')"
if [ -z "$DEVICE" ]; then
  echo "no booted iOS simulator" >&2
  exit 1
fi
mkdir -p .build
BINARY=".build/darwin-exporter"
SOURCES=()
while IFS= read -r file; do SOURCES+=("$file"); done < <(find .cache/Sketchy/Sources/Sketchy -name '*.swift' | sort)
xcrun swiftc -sdk "$SDK" -target "$TARGET" -swift-version 5 -parse-as-library \
  -o "$BINARY" \
  "${SOURCES[@]}" \
  Sources/exporter/JSON.swift \
  Sources/exporter/ExportRng.swift \
  Sources/exporter/ExportOptions.swift \
  Sources/exporter/ExportShapes.swift \
  Sources/exporter/ExportSvg.swift \
  Sources/darwin/DarwinExport.swift \
  Sources/darwin/main.swift
# Dictionary iteration order changes the sticker-union start point unless hashing is pinned.
SIMCTL_CHILD_SWIFT_DETERMINISTIC_HASHING=1 \
  xcrun simctl spawn "$DEVICE" "$PWD/$BINARY" "$OUT" "$PREVIEWS" "$OUT/assets/sticker-weave.png"
echo "darwin fixtures written to $OUT"
echo "sticker previews written to $PREVIEWS"
