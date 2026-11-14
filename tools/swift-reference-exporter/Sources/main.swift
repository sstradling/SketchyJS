import CoreGraphics
import Foundation
import SwiftUI
import UIKit

/// Darwin sticker and group fixtures for Sketchy v1.5.0.
///
/// Route: `scripts/export.sh` archives that commit, compiles these sources with
/// Sketchy in one module, and runs the binary in the iOS simulator.
/// `group-torn` also records the part geometry, the pre-simplify union, and the
/// offset ring that the private tear chop receives. Command generation is the
/// same call as the other group cases.
@main
struct Phase3FixtureExporter {
    static func main() {
        let arguments = CommandLine.arguments
        guard arguments.count >= 8 else {
            FileHandle.standardError.write(Data("usage: phase3-exporter <output.json> <weave.png> <xcode> <simulator> <runtime> <arch> <swift>\n".utf8))
            exit(2)
        }
        let output = arguments[1]
        let weavePath = arguments[2]
        let provenance = Provenance(
            xcode: arguments[3],
            simulator: arguments[4],
            simulatorRuntime: arguments[5],
            arch: arguments[6],
            swift: arguments[7]
        )
        let weave = try? Data(contentsOf: URL(fileURLWithPath: weavePath))
        do {
            try MainActor.assumeIsolated {
                let exported = exportPhase3(weaveData: weave, provenance: provenance)
                let text = exported.render() + "\n"
                try text.write(to: URL(fileURLWithPath: output), atomically: true, encoding: .utf8)
                FileHandle.standardError.write(Data("wrote \(output) (\(text.utf8.count) bytes)\n".utf8))
            }
        } catch {
            FileHandle.standardError.write(Data("phase3 export failed: \(error)\n".utf8))
            exit(1)
        }
    }
}

private struct Provenance {
    var xcode: String
    var simulator: String
    var simulatorRuntime: String
    var arch: String
    var swift: String

    func json() -> J {
        .obj([
            "repo": .string("https://github.com/sstradling/Sketchy"),
            "tag": .string("v1.5.0"),
            "commit": .string("fb17a6e7344f46da994ece07da1505be7d431b16"),
            "platform": .string("darwin-\(arch)"),
            "os": .string("darwin"),
            "arch": .string(arch),
            "sdk": .string("iphonesimulator"),
            "sdkVersion": .string("26.0"),
            "minimumOS": .string("17.0"),
            "swift": .string(swift),
            "xcode": .string(xcode),
            "simulator": .string(simulator),
            "simulatorRuntime": .string(simulatorRuntime),
            "hashing": .string("SWIFT_DETERMINISTIC_HASHING=1"),
        ])
    }
}

private func pointJSON(_ point: CGPoint) -> J { .array([.double(Double(point.x)), .double(Double(point.y))]) }

private func colorJSON(_ color: Color) -> J {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
        return .string("unresolved")
    }
    return .obj([
        "r": .double(Double(red)), "g": .double(Double(green)),
        "b": .double(Double(blue)), "a": .double(Double(alpha)),
    ])
}

private func pathElements(_ path: CGPath) -> J {
    var operations: [J] = []
    path.applyWithBlock { pointer in
        let element = pointer.pointee
        let point = { (index: Int) -> [J] in
            let value = element.points[index]
            return [.double(Double(value.x)), .double(Double(value.y))]
        }
        switch element.type {
        case .moveToPoint:
            operations.append(.array([.string("M")] + point(0)))
        case .addLineToPoint:
            operations.append(.array([.string("L")] + point(0)))
        case .addQuadCurveToPoint:
            operations.append(.array([.string("Q")] + point(0) + point(1)))
        case .addCurveToPoint:
            operations.append(.array([.string("C")] + point(0) + point(1) + point(2)))
        case .closeSubpath:
            operations.append(.array([.string("Z")]))
        @unknown default:
            operations.append(.array([.string("?")]))
        }
    }
    return .array(operations)
}

private func pathElements(_ path: SwiftUI.Path) -> J { pathElements(path.cgPath) }

private func commandJSON(_ command: RoughRenderCommand) -> J {
    switch command.style {
    case .stroke(let color, let width):
        var row = baseCommand(command, style: .string("stroke"), color: color)
        row["lineWidth"] = .double(Double(width))
        return .object(row)
    case .fill(let color):
        return .object(baseCommand(command, style: .string("fill"), color: color))
    }
}

private func baseCommand(_ command: RoughRenderCommand, style: J, color: Color) -> [String: J] {
    var row: [String: J] = [
        "style": style,
        "color": colorJSON(color),
        "path": pathElements(command.path),
        "bounds": .array([
            .double(Double(command.path.boundingRect.minX)), .double(Double(command.path.boundingRect.minY)),
            .double(Double(command.path.boundingRect.width)), .double(Double(command.path.boundingRect.height)),
        ]),
        "cap": .string(String(describing: command.cap)),
        "join": .string(String(describing: command.join)),
        "miterLimit": .double(Double(command.miterLimit)),
        "fillRule": .string(command.fillRule == .evenOdd ? "evenOdd" : "winding"),
        "inverseClip": .bool(command.inverseClip),
        "maskOpacity": .double(Double(command.maskOpacity)),
        "opacityMaskBlur": .double(Double(command.opacityMaskBlur)),
    ]
    if let group = command.opacityMaskGroup { row["opacityMaskGroup"] = .int(group) }
    if let clip = command.clipPath { row["clip"] = pathElements(clip) }
    if let shadow = command.sheetShadow {
        row["sheetShadow"] = .obj([
            "rgba": .array([.double(Double(shadow.red)), .double(Double(shadow.green)), .double(Double(shadow.blue)), .double(Double(shadow.alpha))]),
            "opacity": .double(Double(shadow.opacity)),
            "x": .double(Double(shadow.x)), "y": .double(Double(shadow.y)),
            "radius": .double(Double(shadow.radius)),
        ])
    }
    if let image = command.stickerImage {
        row["stickerImage"] = .obj([
            "placement": .string(placementName(image.placement)),
            "scale": .double(Double(image.scale)),
            "opacity": .double(Double(image.opacity)),
            "imageSize": .array([.double(Double(image.image.size.width)), .double(Double(image.image.size.height))]),
            "tileWidth": .double(Double(StickerImagePainter.tileWidth(image, in: command.path.boundingRect))),
        ])
    }
    return row
}

private func placementName(_ placement: StickerImagePlacement) -> String {
    switch placement {
    case .tile: return "tile"
    case .stretch: return "stretch"
    case .fill: return "fill"
    }
}

private func linesJSON(_ lines: [StickerBackingBuilder.Centerline]) -> J {
    .array(lines.map { line in
        .obj(["closed": .bool(line.closed), "points": .array(line.points.map(pointJSON))])
    })
}

private func numbers(_ values: [Double]) -> J { .array(values.map { .double($0) }) }

private func matrixJSON(_ transform: CGAffineTransform) -> J {
    numbers([
        Double(transform.a), Double(transform.b), Double(transform.c),
        Double(transform.d), Double(transform.tx), Double(transform.ty),
    ])
}

@MainActor
private func shapeCase(
    _ id: String,
    _ drawable: Drawable,
    _ backing: StickerBacking,
    options: Options,
    canvas: CGSize,
    input: J
) -> J {
    var options = options
    options.stickerBacking = backing
    guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: options) else {
        return .obj(["id": .string(id), "input": input, "drawing": .null])
    }
    let commands = StickerBackingBuilder.commands(for: drawing, options: options, backing: backing, transform: nil)
    let lines = StickerBackingBuilder.centerlines(for: drawing, options: options, backing: backing, transform: nil)
    return .obj([
        "id": .string(id),
        "input": input,
        "storedSmoothness": .double(Double(backing.smoothness)),
        "centerlines": linesJSON(lines),
        "commands": .array(commands.map(commandJSON)),
    ])
}

@MainActor
private func groupCase(_ id: String, _ group: SketchGroup, canvas: CGSize, input: J) -> J {
    guard let backing = group.backing else {
        return .obj(["id": .string(id), "input": input, "drawing": .null])
    }
    let lines = SketchGroupRenderer.silhouetteLines(
        parts: group.parts,
        backing: backing,
        groupTransform: group.transform,
        size: canvas
    )
    let tearSeed = group.seed ?? group.parts.first?.content.options.seed
    let commands = StickerBackingBuilder.commands(for: lines, outward: backing.width, backing: backing, seed: tearSeed)
    var row: [String: J] = [
        "id": .string(id),
        "input": input,
        "storedSmoothness": .double(Double(backing.smoothness)),
        "centerlines": linesJSON(lines),
        "commands": .array(commands.map(commandJSON)),
    ]
    if id.hasPrefix("group-torn") {
        row.merge(tornReconstruction(group: group, backing: backing, lines: lines)) { _, new in new }
    }
    return .object(row)
}

private func baseOptions(seed: UInt64, stroke: Float, roughness: Float = 0, bowing: Float = 0, randomness: Float = 0) -> Options {
    var options = Options()
    options.seed = seed
    options.strokeWidth = stroke
    options.roughness = roughness
    options.bowing = bowing
    options.maxRandomnessOffset = randomness
    options.fill = .clear
    return options
}

@MainActor
private func exportPhase3(weaveData: Data?, provenance: Provenance) -> J {
    let tornChop = shapeCase(
        "torn-chop",
        Rectangle(x: 40, y: 40, width: 140, height: 90),
        StickerBacking(
            width: 14,
            smoothness: 1,
            edge: .torn(StickerTear(depth: 8, length: 18, jaggedness: 0)),
            color: .white
        ),
        options: baseOptions(seed: 42, stroke: 3),
        canvas: CGSize(width: 220, height: 180),
        input: .obj([
            "kind": .string("closed-torn-chop"),
            "shape": .string("rectangle"),
            "rect": numbers([40, 40, 140, 90]),
            "seed": .u64(42),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(14),
            "smoothness": .double(1),
            "edge": .string("torn"),
            "tearDepth": .double(8),
            "tearLength": .double(18),
            "tearJaggedness": .double(0),
            "canvas": numbers([220, 180]),
        ])
    )

    let fibers = shapeCase(
        "paper-fibers",
        Rectangle(x: 30, y: 28, width: 100, height: 70),
        StickerBacking(
            width: 12,
            smoothness: 1,
            color: UIColor(red: 0.95, green: 0.90, blue: 0.75, alpha: 1),
            texture: StickerTexture(amount: 0.5, scale: 10, seed: 5)
        ),
        options: baseOptions(seed: 42, stroke: 2),
        canvas: CGSize(width: 180, height: 160),
        input: .obj([
            "kind": .string("paper-fibers"),
            "shape": .string("rectangle"),
            "rect": numbers([30, 28, 100, 70]),
            "seed": .u64(42),
            "strokeWidth": .double(2),
            "roughness": .double(0),
            "width": .double(12),
            "smoothness": .double(1),
            "textureAmount": .double(0.5),
            "textureScale": .double(10),
            "textureSeed": .u64(5),
            "canvas": numbers([180, 160]),
        ])
    )

    let smallHole = "M 30 30 H 190 V 190 H 30 Z M 100 100 H 112 V 112 H 100 Z"
    let hole = shapeCase(
        "hole-smaller-than-margin",
        Path(d: smallHole),
        StickerBacking(width: 20, smoothness: 1, edge: .smooth, color: .white),
        options: baseOptions(seed: 42, stroke: 4),
        canvas: CGSize(width: 220, height: 220),
        input: .obj([
            "kind": .string("hole-smaller-than-margin"),
            "shape": .string("path"),
            "d": .string(smallHole),
            "seed": .u64(42),
            "strokeWidth": .double(4),
            "roughness": .double(0),
            "width": .double(20),
            "smoothness": .double(1),
            "canvas": numbers([220, 220]),
        ])
    )

    let ribbon = shapeCase(
        "open-ribbon",
        Line(from: Point(x: 20, y: 60), to: Point(x: 190, y: 64)),
        StickerBacking(width: 10, smoothness: 0.2, edge: .smooth, color: .white),
        options: baseOptions(seed: 42, stroke: 3),
        canvas: CGSize(width: 220, height: 120),
        input: .obj([
            "kind": .string("open-ribbon"),
            "shape": .string("line"),
            "from": numbers([20, 60]),
            "to": numbers([190, 64]),
            "seed": .u64(42),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(10),
            "smoothness": .double(0.2),
            "canvas": numbers([220, 120]),
        ])
    )

    // Same rectangle as the committed `smooth` contour, with the v1.5.0 option defaults made explicit.
    // Smoothness above 1 is clamped by `StickerBacking.init`, so 1.5 is exported as the API stores it.
    let smoothShape = Rectangle(x: 36, y: 46, width: 148, height: 110)
    let smoothOptions = baseOptions(seed: 42, stroke: 3, roughness: 1, bowing: 1, randomness: 2)
    let smoothCanvas = CGSize(width: 220, height: 220)
    func smoothnessInput(_ requested: Double) -> J {
        .obj([
            "kind": .string("smoothness"),
            "shape": .string("rectangle"),
            "rect": numbers([36, 46, 148, 110]),
            "seed": .u64(42),
            "strokeWidth": .double(3),
            "roughness": .double(1),
            "bowing": .double(1),
            "maxRandomnessOffset": .double(2),
            "width": .double(12),
            "requestedSmoothness": .double(requested),
            "canvas": numbers([220, 220]),
        ])
    }
    let smoothHalf = shapeCase(
        "smoothness-0.5",
        smoothShape,
        StickerBacking(width: 12, smoothness: 0.5, edge: .smooth, color: .white),
        options: smoothOptions,
        canvas: smoothCanvas,
        input: smoothnessInput(0.5)
    )
    let smoothPast = shapeCase(
        "smoothness-1.5",
        smoothShape,
        StickerBacking(width: 12, smoothness: 1.5, edge: .smooth, color: .white),
        options: smoothOptions,
        canvas: smoothCanvas,
        input: smoothnessInput(1.5)
    )

    let groupHolePath = "M 24 24 H 196 V 196 H 24 Z M 78 78 H 142 V 142 H 78 Z"
    let groupHole = groupCase(
        "group-hole",
        SketchGroup {
            RoughView()
                .roughness(0)
                .bowing(0)
                .maxRandomnessOffset(0)
                .strokeWidth(3)
                .stroke(UIColor.black)
                .fill(UIColor.clear)
                .seed(42)
                .draw(Path(d: groupHolePath))
        }
        .stickerBacking(width: 12, smoothness: 1, edge: .smooth, color: UIColor.white)
        .seed(42),
        canvas: CGSize(width: 220, height: 220),
        input: .obj([
            "kind": .string("group-hole"),
            "d": .string(groupHolePath),
            "seed": .u64(42),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(12),
            "smoothness": .double(1),
            "canvas": numbers([220, 220]),
        ])
    )

    let moved = CGAffineTransform(translationX: 28, y: 14).rotated(by: 20 * .pi / 180)
    let groupTransform = groupCase(
        "group-transform",
        SketchGroup {
            RoughView()
                .roughness(0)
                .bowing(0)
                .maxRandomnessOffset(0)
                .strokeWidth(4)
                .stroke(UIColor.black)
                .fill(UIColor.clear)
                .seed(3)
                .draw(Rectangle(x: 40, y: 36, width: 80, height: 50))
        }
        .stickerBacking(width: 10, smoothness: 1, edge: .smooth, color: UIColor.white)
        .seed(3)
        .sketchTransform(moved),
        canvas: CGSize(width: 280, height: 220),
        input: .obj([
            "kind": .string("group-transform"),
            "shape": .string("rectangle"),
            "rect": numbers([40, 36, 80, 50]),
            "seed": .u64(3),
            "strokeWidth": .double(4),
            "roughness": .double(0),
            "width": .double(10),
            "smoothness": .double(1),
            "transform": numbers([Double(moved.a), Double(moved.b), Double(moved.c), Double(moved.d), Double(moved.tx), Double(moved.ty)]),
            "canvas": numbers([280, 220]),
        ])
    )

    let tornGroup = groupCase(
        "group-torn",
        SketchGroup {
            RoughView()
                .roughness(0)
                .bowing(0)
                .strokeWidth(3)
                .stroke(UIColor.black)
                .fill(UIColor(red: 0.20, green: 0.48, blue: 0.78, alpha: 1))
                .seed(11)
                .draw(Circle(x: 70, y: 70, diameter: 70))
            SketchPart(
                RoughView()
                    .roughness(0)
                    .bowing(0)
                    .strokeWidth(3)
                    .stroke(UIColor.black)
                    .fill(UIColor(red: 0.86, green: 0.36, blue: 0.28, alpha: 1))
                    .seed(11)
                    .draw(Circle(x: 70, y: 70, diameter: 56))
            )
            .sketchOffset(x: 36, y: 8)
        }
        .stickerBacking(
            width: 12,
            smoothness: 0.4,
            edge: .torn(StickerTear(depth: 5, length: 14, jaggedness: 0.3)),
            color: UIColor.white
        )
        .seed(11),
        canvas: CGSize(width: 220, height: 160),
        input: .obj([
            "kind": .string("group-torn"),
            "seed": .u64(11),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(12),
            "smoothness": .double(0.4),
            "edge": .string("torn"),
            "tearDepth": .double(5),
            "tearLength": .double(14),
            "tearJaggedness": .double(0.3),
            "offset": numbers([36, 8]),
            "canvas": numbers([220, 160]),
        ])
    )

    var cases: [J] = [tornChop, fibers, hole, ribbon, smoothHalf, smoothPast, groupHole, groupTransform, tornGroup]
    if let weaveData, let picture = UIImage(data: weaveData) {
        let image = StickerImage(image: picture, placement: .tile, scale: 24, opacity: 0.6)
        let imagePath = "M16 16 H144 V144 H16 Z M50 50 H110 V110 H50 Z"
        cases.append(shapeCase(
            "image-hole",
            Path(d: imagePath),
            StickerBacking(width: 12, smoothness: 0.9, edge: .fullySmooth(), color: .white, image: image),
            options: baseOptions(seed: 9, stroke: 2, roughness: 1.2),
            canvas: CGSize(width: 180, height: 180),
            input: .obj([
                "kind": .string("image-hole"),
                "d": .string(imagePath),
                "seed": .u64(9),
                "strokeWidth": .double(2),
                "roughness": .double(1.2),
                "width": .double(12),
                "smoothness": .double(0.9),
                "edge": .string("fullySmooth"),
                "placement": .string("tile"),
                "imageScale": .double(24),
                "imageOpacity": .double(0.6),
                "imageAsset": .string("assets/sticker-weave.png"),
                "imageSize": numbers([Double(picture.size.width), Double(picture.size.height)]),
                "canvas": numbers([180, 180]),
            ])
        ))
    } else {
        FileHandle.standardError.write(Data("skip image-hole: sticker-weave.png did not decode\n".utf8))
    }

    func square(_ x: Float, _ y: Float, _ side: Float, seed: UInt64) -> RoughView {
        RoughView()
            .roughness(0)
            .bowing(0)
            .maxRandomnessOffset(0)
            .strokeWidth(0)
            .stroke(UIColor.black)
            .fill(UIColor.black)
            .seed(seed)
            .draw(Rectangle(x: x, y: y, width: side, height: side))
    }
    cases.append(groupCase(
        "group-overlapping",
        SketchGroup {
            square(0, 0, 100, seed: 1)
            square(60, 0, 100, seed: 2)
        }
        .stickerBacking(width: 12, smoothness: 1, edge: .smooth, color: UIColor.white)
        .seed(1),
        canvas: CGSize(width: 220, height: 180),
        input: .obj([
            "kind": .string("group-overlapping"),
            "rects": .array([numbers([0, 0, 100, 100]), numbers([60, 0, 100, 100])]),
            "strokeWidth": .double(0),
            "roughness": .double(0),
            "width": .double(12),
            "smoothness": .double(1),
            "canvas": numbers([220, 180]),
        ])
    ))
    cases.append(groupCase(
        "group-corner-sharing",
        SketchGroup {
            square(0, 0, 50, seed: 1)
            square(50, 50, 50, seed: 2)
        }
        .stickerBacking(width: 8, smoothness: 1, edge: .smooth, color: UIColor.white)
        .seed(1),
        canvas: CGSize(width: 200, height: 200),
        input: .obj([
            "kind": .string("group-corner-sharing"),
            "rects": .array([numbers([0, 0, 50, 50]), numbers([50, 50, 50, 50])]),
            "strokeWidth": .double(0),
            "roughness": .double(0),
            "width": .double(8),
            "smoothness": .double(1),
            "canvas": numbers([200, 200]),
        ])
    ))
    cases.append(groupCase(
        "group-torn-2",
        SketchGroup {
            ink(seed: 17, stroke: 4).draw(Rectangle(x: 36, y: 48, width: 100, height: 64))
            SketchPart(ink(seed: 19, stroke: 4).draw(Circle(x: 210, y: 80, diameter: 64)))
        }
        .stickerBacking(
            width: 12,
            smoothness: 1,
            edge: .torn(StickerTear(depth: 6, length: 12, jaggedness: 0.15)),
            color: UIColor.white
        )
        .seed(17),
        canvas: CGSize(width: 300, height: 200),
        input: .obj([
            "kind": .string("group-torn"),
            "seed": .u64(17),
            "strokeWidth": .double(4),
            "roughness": .double(0),
            "width": .double(12),
            "smoothness": .double(1),
            "edge": .string("torn"),
            "tearDepth": .double(6),
            "tearLength": .double(12),
            "tearJaggedness": .double(0.15),
            "canvas": numbers([300, 200]),
        ])
    ))
    cases.append(groupCase(
        "group-torn-3",
        SketchGroup {
            ink(seed: 23, stroke: 3).draw(Circle(x: 78, y: 86, diameter: 74))
            ink(seed: 29, stroke: 3).draw(Circle(x: 124, y: 86, diameter: 74))
            ink(seed: 31, stroke: 3).draw(Circle(x: 102, y: 124, diameter: 70))
        }
        .stickerBacking(
            width: 14,
            smoothness: 0.25,
            edge: .torn(StickerTear(depth: 9, length: 18, jaggedness: 0.8)),
            color: UIColor.white
        )
        .seed(23),
        canvas: CGSize(width: 280, height: 260),
        input: .obj([
            "kind": .string("group-torn"),
            "seed": .u64(23),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(14),
            "smoothness": .double(0.25),
            "edge": .string("torn"),
            "tearDepth": .double(9),
            "tearLength": .double(18),
            "tearJaggedness": .double(0.8),
            "canvas": numbers([280, 260]),
        ])
    ))
    let roundPivot = CGPoint(x: 110, y: 80)
    cases.append(groupCase(
        "group-torn-4",
        SketchGroup {
            SketchPart(
                ink(seed: 41, stroke: 3).draw(
                    RoundedRectangle(x: 50, y: 44, width: 120, height: 72, cornerRadius: 18)
                )
            )
            .sketchRotation(.degrees(22), around: roundPivot)
        }
        .stickerBacking(
            width: 11,
            smoothness: 0.7,
            edge: .torn(StickerTear(depth: 4, length: 10, jaggedness: 0)),
            color: UIColor.white
        )
        .seed(41)
        .sketchTransform(CGAffineTransform(translationX: 16, y: -8)),
        canvas: CGSize(width: 300, height: 240),
        input: .obj([
            "kind": .string("group-torn"),
            "seed": .u64(41),
            "strokeWidth": .double(3),
            "roughness": .double(0),
            "width": .double(11),
            "smoothness": .double(0.7),
            "edge": .string("torn"),
            "tearDepth": .double(4),
            "tearLength": .double(10),
            "tearJaggedness": .double(0),
            "rotationDegrees": .double(22),
            "rotationAnchor": numbers([110, 80]),
            "groupTranslation": numbers([16, -8]),
            "canvas": numbers([300, 240]),
        ])
    ))

    return .obj([
        "provenance": provenance.json(),
        "cases": .array(cases),
    ])
}

// MARK: - group-torn reconstruction

/// The literal passed to the private simplify in Sketchy v1.5.0 `SketchGroup.swift`.
private let tornSimplifyEpsilon: CGFloat = 1.8

/// Part geometry, the union before simplify, and the offset ring before the private chop.
private func tornReconstruction(
    group: SketchGroup,
    backing: StickerBacking,
    lines: [StickerBackingBuilder.Centerline]
) -> [String: J] {
    for line in lines {
        let simplified = simplifyTornRing(line.source, epsilon: tornSimplifyEpsilon)
        let matches = simplified.count == line.points.count && zip(simplified, line.points).allSatisfy { left, right in
            left.x == right.x && left.y == right.y
        }
        if !matches {
            FileHandle.standardError.write(Data(
                "group-torn simplify epsilon \(tornSimplifyEpsilon) did not reproduce the centerline (\(simplified.count) vs \(line.points.count))\n".utf8
            ))
            exit(1)
        }
    }

    let rings = lines.filter { $0.points.count >= 3 }
    var offsets: [J] = []
    for (index, line) in rings.enumerated() {
        let depth = nestingDepth(index, in: rings)
        let distance = depth.isMultiple(of: 2) ? backing.width : -backing.width
        guard let offset = StickerBackingBuilder.offsetClosed(line.points, by: distance) else {
            FileHandle.standardError.write(Data("group-torn offset before tear failed at ring \(index)\n".utf8))
            exit(1)
        }
        offsets.append(ringJSON(offset, closed: true, distance: distance))
    }

    return [
        "parts": .array(group.parts.map(partJSON)),
        "groupTransform": matrixJSON(group.transform),
        "preSimplifyRings": .array(lines.map { line in
            ringJSON(line.source, closed: line.closed, distance: nil)
        }),
        "simplifyEpsilon": .double(Double(tornSimplifyEpsilon)),
        "offsetBeforeTear": .array(offsets),
    ]
}

private func ink(seed: UInt64, stroke: Float) -> RoughView {
    RoughView()
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .strokeWidth(stroke)
        .stroke(UIColor.black)
        .fill(UIColor.black)
        .seed(seed)
}

private func partJSON(_ part: SketchPart) -> J {
    let options = part.content.options
    guard part.content.drawables.count == 1 else {
        FileHandle.standardError.write(Data("group-torn part does not have one drawable\n".utf8))
        exit(1)
    }
    let drawable = part.content.drawables[0]
    var row: [String: J] = [:]
    if let circle = drawable as? Circle {
        row["shape"] = .string("circle")
        row["center"] = numbers([Double(circle.x), Double(circle.y)])
        row["diameter"] = .double(Double(circle.diameter))
    } else if let rectangle = drawable as? Rectangle {
        row["shape"] = .string("rectangle")
        row["rect"] = numbers([Double(rectangle.x), Double(rectangle.y), Double(rectangle.width), Double(rectangle.height)])
    } else if let rounded = drawable as? RoundedRectangle {
        row["shape"] = .string("roundedRectangle")
        row["rect"] = numbers([Double(rounded.x), Double(rounded.y), Double(rounded.width), Double(rounded.height)])
        row["cornerRadius"] = .double(Double(rounded.cornerRadius))
    } else {
        FileHandle.standardError.write(Data("group-torn part shape \(drawable.method) is not recorded\n".utf8))
        exit(1)
    }
    row["transform"] = matrixJSON(part.transform)
    row["strokeWidth"] = .double(Double(options.strokeWidth))
    row["roughness"] = .double(Double(options.roughness))
    row["bowing"] = .double(Double(options.bowing))
    row["maxRandomnessOffset"] = .double(Double(options.maxRandomnessOffset))
    if let seed = options.seed {
        row["seed"] = .u64(seed)
    }
    return .object(row)
}

private func ringJSON(_ points: [CGPoint], closed: Bool, distance: CGFloat?) -> J {
    var row: [String: J] = [
        "closed": .bool(closed),
        "startIndex": .int(0),
        "count": .int(points.count),
        "points": .array(points.map(pointJSON)),
    ]
    if let distance {
        row["distance"] = .double(Double(distance))
    }
    return .object(row)
}

/// Copy of `SketchGroupRenderer.simplify` / `rdp` at v1.5.0, used only to confirm the epsilon.
private func simplifyTornRing(_ points: [CGPoint], epsilon: CGFloat) -> [CGPoint] {
    guard points.count > 8 else { return points }
    return rdpTornRing(points, epsilon: epsilon, closed: true)
}

private func rdpTornRing(_ points: [CGPoint], epsilon: CGFloat, closed: Bool) -> [CGPoint] {
    func recurse(_ input: [CGPoint]) -> [CGPoint] {
        guard input.count > 2 else { return input }
        let start = input[0]
        let end = input[input.count - 1]
        var farthest = 0
        var distance: CGFloat = 0
        let span = hypot(end.x - start.x, end.y - start.y)
        for index in 1..<(input.count - 1) {
            let point = input[index]
            let deviation: CGFloat
            if span < 1e-4 {
                deviation = hypot(point.x - start.x, point.y - start.y)
            } else {
                deviation = abs(
                    (end.y - start.y) * point.x
                        - (end.x - start.x) * point.y
                        + end.x * start.y
                        - end.y * start.x
                ) / span
            }
            if deviation > distance {
                distance = deviation
                farthest = index
            }
        }
        guard distance > epsilon else { return [start, end] }
        let left = recurse(Array(input[0...farthest]))
        let right = recurse(Array(input[farthest...]))
        return left.dropLast() + right
    }
    var ring = points
    if closed, let first = ring.first {
        ring.append(first)
    }
    let reduced = recurse(ring)
    var open = reduced
    if closed, open.count >= 2, hypot(open[0].x - open[open.count - 1].x, open[0].y - open[open.count - 1].y) < 0.5 {
        open.removeLast()
    }
    return open.count >= 8 ? open : points
}

private func nestingDepth(_ index: Int, in lines: [StickerBackingBuilder.Centerline]) -> Int {
    let sample = centroid(lines[index].points)
    let area = abs(signedArea(lines[index].points))
    var depth = 0
    for other in lines.indices where other != index {
        guard abs(signedArea(lines[other].points)) > area * 1.02 else { continue }
        if contains(sample, polygon: lines[other].points) { depth += 1 }
    }
    return depth
}

private func centroid(_ points: [CGPoint]) -> CGPoint {
    let sum = points.reduce(CGPoint.zero) { partial, point in
        CGPoint(x: partial.x + point.x, y: partial.y + point.y)
    }
    let count = CGFloat(max(points.count, 1))
    return CGPoint(x: sum.x / count, y: sum.y / count)
}

private func contains(_ point: CGPoint, polygon: [CGPoint]) -> Bool {
    guard polygon.count >= 3 else { return false }
    var inside = false
    var previous = polygon.count - 1
    for index in 0..<polygon.count {
        let currentY = polygon[index].y
        let previousY = polygon[previous].y
        let crosses = (currentY > point.y) != (previousY > point.y)
        if crosses {
            let x = (polygon[previous].x - polygon[index].x) * (point.y - currentY)
                / (previousY - currentY) + polygon[index].x
            if point.x < x { inside.toggle() }
        }
        previous = index
    }
    return inside
}

private func signedArea(_ points: [CGPoint]) -> CGFloat {
    guard points.count >= 3 else { return 0 }
    var sum: CGFloat = 0
    for index in 0..<points.count {
        let next = points[(index + 1) % points.count]
        sum += points[index].x * next.y - next.x * points[index].y
    }
    return sum / 2
}
