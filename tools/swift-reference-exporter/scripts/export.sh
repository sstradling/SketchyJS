#!/usr/bin/env bash
# Builds phase3.json from a local Sketchy checkout at commit fb17a6e.
# The checkout is only read (`git archive`). Nothing in it is modified.
set -euo pipefail

EXPORTER="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$EXPORTER/../.." && pwd)"
SKETCHY="${1:?usage: export.sh <sketchy-checkout> <output.json>}"
OUT="${2:?usage: export.sh <sketchy-checkout> <output.json>}"
COMMIT="fb17a6e7344f46da994ece07da1505be7d431b16"
WEAVE="$REPO/fixtures/swift-reference/v1.5.0/assets/sticker-weave.png"

ACTUAL="$(git -C "$SKETCHY" rev-parse "$COMMIT^{commit}")"
if [ "$ACTUAL" != "$COMMIT" ]; then
  echo "Sketchy commit $COMMIT is not in $SKETCHY" >&2
  exit 1
fi

DEVICE="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/ { print $2; exit }')"
if [ -z "$DEVICE" ]; then
  echo "no booted iOS simulator" >&2
  exit 1
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/sketchy-phase3.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

git -C "$SKETCHY" archive "$COMMIT" | tar -x -C "$STAGE"
test -f "$STAGE/Sources/Sketchy/Render/StickerBackingBuilder.swift"

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"
TARGET="${ARCH}-apple-ios17.0-simulator"
SOURCES=()
while IFS= read -r file; do SOURCES+=("$file"); done < <(find "$STAGE/Sources/Sketchy" -name '*.swift' | sort)
xcrun swiftc -sdk "$SDK" -target "$TARGET" -swift-version 5 -parse-as-library \
  -o "$STAGE/phase3-exporter" \
  "${SOURCES[@]}" \
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/JSON.swift" \
  "$EXPORTER/Sources/main.swift"

mkdir -p "$(dirname "$OUT")"
SIMCTL_CHILD_SWIFT_DETERMINISTIC_HASHING=1 \
  xcrun simctl spawn "$DEVICE" "$STAGE/phase3-exporter" \
  "$OUT" "$WEAVE" \
  "26.0.1 (17A400)" \
  "iPhone 17 Pro" \
  "iOS 26.0 (23A343)" \
  "x86_64" \
  "6.2 (swiftlang-6.2.0.19.9 clang-1700.3.19.1)"
echo "wrote $OUT"
