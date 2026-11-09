// swift-tools-version: 5.9
//
// Linux-buildable harness that compiles a pinned subset of Sketchy's engine sources
// (copied verbatim by scripts/prepare.sh) together with thin shim modules for the
// Apple frameworks the engine imports, and exports deterministic JSON reference fixtures.
import PackageDescription

let package = Package(
    name: "swift-fixture-exporter",
    targets: [
        .target(name: "CoreGraphics", path: "Shims/CoreGraphics"),
        .target(name: "CoreText", dependencies: ["CoreGraphics"], path: "Shims/CoreText"),
        .target(name: "UIKit", dependencies: ["CoreGraphics"], path: "Shims/UIKit"),
        .target(name: "SwiftUI", dependencies: ["UIKit"], path: "Shims/SwiftUI"),
        .executableTarget(
            name: "exporter",
            dependencies: ["UIKit", "CoreGraphics", "SwiftUI", "CoreText"],
            path: "Sources/exporter"
        ),
    ]
)
