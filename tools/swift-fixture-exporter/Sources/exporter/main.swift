import Foundation

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: exporter <output-directory>\n".utf8))
    exit(2)
}
let outputDirectory = arguments[1]

do {
    try MainActor.assumeIsolated {
        try write(exportSplitMix64(), to: "rng/splitmix64.json", in: outputDirectory)
        try write(exportUnitFloat(), to: "rng/unit-float.json", in: outputDirectory)
        try write(exportDefaults(), to: "options/defaults.json", in: outputDirectory)
        try write(exportClamps(), to: "options/clamps.json", in: outputDirectory)
        try write(exportShapes(), to: "shapes/shapes.json", in: outputDirectory)
        try write(exportFills(), to: "fills/fills.json", in: outputDirectory)
        try write(exportDirectFillers(), to: "fills/direct-fillers.json", in: outputDirectory)
        try write(exportScribble(), to: "fills/scribble.json", in: outputDirectory)
        try write(exportSvgPaths(), to: "svg/path-parse.json", in: outputDirectory)
    }
} catch {
    FileHandle.standardError.write(Data("export failed: \(error)\n".utf8))
    exit(1)
}
