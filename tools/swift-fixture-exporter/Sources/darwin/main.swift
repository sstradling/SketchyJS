import Foundation

@main
struct DarwinFixtureExporter {
    static func main() {
        let arguments = CommandLine.arguments
        guard arguments.count >= 2 else {
            FileHandle.standardError.write(Data("usage: darwin-exporter <output-directory> [preview-directory] [image]\n".utf8))
            exit(2)
        }
        let outputDirectory = arguments[1]
        let previewDirectory = arguments.count >= 3 ? arguments[2] : nil
        let imageData = arguments.count >= 4 ? try? Data(contentsOf: URL(fileURLWithPath: arguments[3])) : nil
        do {
            try MainActor.assumeIsolated {
                let replay: [(String, J)] = [
                    ("darwin/rng/splitmix64.json", exportSplitMix64()),
                    ("darwin/rng/unit-float.json", exportUnitFloat()),
                    ("darwin/options/defaults.json", exportDefaults()),
                    ("darwin/options/clamps.json", exportClamps()),
                    ("darwin/shapes/shapes.json", exportShapes()),
                    ("darwin/fills/fills.json", exportFills()),
                    ("darwin/fills/direct-fillers.json", exportDirectFillers()),
                    ("darwin/fills/scribble.json", exportScribble()),
                    ("darwin/svg/path-parse.json", exportSvgPaths()),
                    ("strokes/outlines.json", exportStrokeOutlines()),
                    ("brushes/crayon-watercolor.json", exportCrayonWatercolor()),
                    ("stickers/contours.json", exportStickerContours()),
                    ("stickers/image-placement.json", exportStickerImagePlacement(weaveData: imageData)),
                    ("animation/frames.json", exportAnimationFrames()),
                    ("text/outlines.json", exportTextOutlines()),
                ]
                for (path, value) in replay {
                    try write(value, to: path, in: outputDirectory)
                }
                if let previewDirectory {
                    try renderStickerPreviews(to: previewDirectory, weaveData: imageData)
                }
            }
        } catch {
            FileHandle.standardError.write(Data("darwin export failed: \(error)\n".utf8))
            exit(1)
        }
    }
}
