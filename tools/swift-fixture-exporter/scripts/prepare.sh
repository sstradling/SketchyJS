#!/usr/bin/env bash
# Fetches Sketchy at the pinned tag, verifies the commit, and copies the engine files the
# Linux harness compiles into Sources/exporter/Upstream. Only `import os.signpost` lines are
# removed (no other edits), and every copied file's sha256 is recorded in upstream-files.json.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="v1.5.0"
COMMIT="fb17a6e7344f46da994ece07da1505be7d431b16"
CACHE=".cache/Sketchy"
DEST="Sources/exporter/Upstream"

if [ ! -d "$CACHE/.git" ]; then
  mkdir -p .cache
  git clone --quiet --depth 1 --branch "$TAG" https://github.com/sstradling/Sketchy.git "$CACHE"
fi
ACTUAL="$(git -C "$CACHE" rev-parse HEAD)"
if [ "$ACTUAL" != "$COMMIT" ]; then
  echo "pinned $TAG resolves to $ACTUAL, expected $COMMIT" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
SRC="$CACHE/Sources/Sketchy"
EXCLUDE_ENGINE="TextPathConverter.swift Color+Extensions.swift RoughColor.swift PerformanceInstrumentation.swift"
for f in "$SRC"/Engine/*.swift "$SRC"/Engine/Fillers/*.swift; do
  name="$(basename "$f")"
  case " $EXCLUDE_ENGINE " in *" $name "*) continue;; esac
  cp "$f" "$DEST/$name"
done
for name in SVGPath.swift SVGArcConverter.swift CGPathToSVG.swift; do
  cp "$SRC/Render/$name" "$DEST/$name"
done
if [[ "$(uname -s)" == "Darwin" ]]; then
  sed -i '' '/^import os\.signpost$/d' "$DEST"/*.swift
else
  sed -i '/^import os\.signpost$/d' "$DEST"/*.swift
fi

node -e '
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const dir=process.argv[1];
const files=fs.readdirSync(dir).filter(f=>f.endsWith(".swift")).sort();
const out={sketchyTag:process.argv[2],sketchyCommit:process.argv[3],patch:"removed lines matching ^import os.signpost$",files:files.map(f=>({file:f,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(dir,f))).digest("hex")}))};
fs.writeFileSync("upstream-files.json",JSON.stringify(out,null,2)+"\n");
' "$DEST" "$TAG" "$COMMIT"
echo "prepared $(ls "$DEST" | wc -l) upstream files"
