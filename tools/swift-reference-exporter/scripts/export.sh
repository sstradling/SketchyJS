#!/usr/bin/env bash
# Archives a Sketchy commit, compiles it with this harness, and runs the
# binary in the booted iOS simulator. The checkout is only read.
#
# One JSON path keeps the v1.5.0 phase 3 file:
#   export.sh <sketchy-checkout> <output.json>
#
# A version directory replays the v1.5.0 case list and writes the feature cases:
#   export.sh <sketchy-checkout> <output-dir> --commit <sha> --tag <vX.Y.Z>
set -euo pipefail

EXPORTER="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$EXPORTER/../.." && pwd)"
SKETCHY="${1:?usage: export.sh <sketchy-checkout> <output> [--commit SHA --tag TAG]}"
OUT="${2:?usage: export.sh <sketchy-checkout> <output> [--commit SHA --tag TAG]}"
shift 2

COMMIT="fb17a6e7344f46da994ece07da1505be7d431b16"
TAG="v1.5.0"
VERSION_DIR=0
if [ "$#" -gt 0 ]; then
  VERSION_DIR=1
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --commit) COMMIT="${2:?--commit needs a sha}"; shift 2 ;;
      --tag) TAG="${2:?--tag needs a version}"; shift 2 ;;
      *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
  done
fi

ACTUAL="$(git -C "$SKETCHY" rev-parse "$COMMIT^{commit}")"
if [ "$ACTUAL" != "$COMMIT" ]; then
  echo "Sketchy commit $COMMIT is not in $SKETCHY" >&2
  exit 1
fi

SKETCHY_REAL="$(cd "$SKETCHY" && pwd -P)"
if [ "$VERSION_DIR" -eq 1 ]; then
  mkdir -p "$OUT"
  OUT_REAL="$(cd "$OUT" && pwd -P)"
  case "$OUT_REAL" in
    "$SKETCHY_REAL"|"$SKETCHY_REAL"/*)
      echo "refusing to write inside the Sketchy checkout" >&2
      exit 1
      ;;
  esac
fi

DEVICE="$(xcrun simctl list devices booted | awk -F '[()]' '/iPhone/ && /Booted/ { print $2; exit }')"
if [ -z "$DEVICE" ]; then
  echo "no booted iPhone simulator" >&2
  exit 1
fi

eval "$(python3 - "$DEVICE" <<'PY'
import json, subprocess, sys
device = sys.argv[1]
xcode = subprocess.check_output(["xcodebuild", "-version"], text=True).splitlines()
version = xcode[0].split(" ", 1)[1].strip()
build = xcode[1].split(" ", 2)[2].strip()
swift = subprocess.check_output(["swift", "--version"], text=True).splitlines()[0]
swift = swift.removeprefix("Apple Swift version ").strip()
arch = subprocess.check_output(["uname", "-m"], text=True).strip()
sdk = subprocess.check_output(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"], text=True).strip()
booted = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "booted", "-j"]))
name = None
runtime_id = None
for runtime, devices in booted["devices"].items():
    for item in devices:
        if item.get("udid") == device and item.get("state") == "Booted":
            name = item["name"]
            runtime_id = runtime
if name is None:
    sys.exit("booted device disappeared")
runtimes = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "runtimes", "-j"]))
label = None
for runtime in runtimes["runtimes"]:
    if runtime["identifier"] == runtime_id:
        label = f"{runtime['name']} ({runtime['buildversion']})"
if label is None:
    sys.exit(f"runtime {runtime_id} not listed")

def sh(value):
    return "'" + value.replace("'", "'\"'\"'") + "'"

print(f"XCODE={sh(f'{version} ({build})')}")
print(f"SWIFT={sh(swift)}")
print(f"ARCH={sh(arch)}")
print(f"SDK_VERSION={sh(sdk)}")
print(f"SIMULATOR={sh(name)}")
print(f"RUNTIME={sh(label)}")
PY
)"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/sketchy-reference.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

git -C "$SKETCHY" archive "$COMMIT" | tar -x -C "$STAGE"
test -f "$STAGE/Sources/Sketchy/Render/StickerBackingBuilder.swift"

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
TARGET="${ARCH}-apple-ios17.0-simulator"
SOURCES=()
while IFS= read -r file; do SOURCES+=("$file"); done < <(find "$STAGE/Sources/Sketchy" -name '*.swift' | sort)
EXPORTER_SOURCES=(
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/JSON.swift"
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/ExportRng.swift"
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/ExportOptions.swift"
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/ExportShapes.swift"
  "$REPO/tools/swift-fixture-exporter/Sources/exporter/ExportSvg.swift"
  "$REPO/tools/swift-fixture-exporter/Sources/darwin/DarwinExport.swift"
  "$EXPORTER/Sources/main.swift"
)
if [ "$VERSION_DIR" -eq 1 ]; then
  EXPORTER_SOURCES+=("$EXPORTER/Sources/ExportV16.swift")
fi
xcrun swiftc -sdk "$SDK" -target "$TARGET" -swift-version 5 -parse-as-library \
  -o "$STAGE/reference-exporter" \
  "${SOURCES[@]}" \
  "${EXPORTER_SOURCES[@]}"

WEAVE="$REPO/fixtures/swift-reference/v1.5.0/assets/sticker-weave.png"
if [ "$VERSION_DIR" -eq 0 ]; then
  mkdir -p "$(dirname "$OUT")"
  SIMCTL_CHILD_SWIFT_DETERMINISTIC_HASHING=1 \
    xcrun simctl spawn "$DEVICE" "$STAGE/reference-exporter" \
    "$OUT" "$WEAVE" \
    "$XCODE" "$SIMULATOR" "$RUNTIME" "$ARCH" "$SWIFT"
  echo "wrote $OUT"
  exit 0
fi

SIMCTL_CHILD_SWIFT_DETERMINISTIC_HASHING=1 \
  xcrun simctl spawn "$DEVICE" "$STAGE/reference-exporter" \
  --version-dir "$OUT" "$WEAVE" \
  "$TAG" "$COMMIT" \
  "$XCODE" "$SIMULATOR" "$RUNTIME" "$ARCH" "$SWIFT" \
  "$SDK_VERSION" "17.0"

node "$REPO/tools/fixtures/diff-v16.mjs" \
  "$REPO/fixtures/swift-reference/v1.5.0" \
  "$OUT_REAL"
(
  cd "$REPO"
  OUT_DIR="$OUT_REAL" node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV16Manifest } from "./tools/fixtures/build-manifest.mjs";
const dir = process.env.OUT_DIR;
const manifest = buildV16Manifest(dir);
writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${manifest.files.length} files, tree ${manifest.treeSha256.slice(0, 12)}`);
'
)
echo "wrote $OUT_REAL"
