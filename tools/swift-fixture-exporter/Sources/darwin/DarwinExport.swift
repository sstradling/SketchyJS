import CoreGraphics
import SwiftUI
import UIKit

/// Path elements in the same compact form as the Linux shape fixtures.
func pathElements(_ path: CGPath) -> J {
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

func pathElements(_ path: SwiftUI.Path) -> J { pathElements(path.cgPath) }

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

private func commandJSON(_ command: RoughRenderCommand) -> J {
    let style: J
    let lineWidth: J
    switch command.style {
    case .stroke(let color, let width):
        style = .string("stroke")
        lineWidth = .double(Double(width))
        var row = baseCommand(command, style: style, color: color)
        row["lineWidth"] = lineWidth
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

private func lineOperations() -> [Operation] {
    [Move(data: [12, 30]), LineTo(data: [80, 36]), LineTo(data: [150, 110]), LineTo(data: [188, 70])]
}

private func rectangleOperations() -> [Operation] {
    [Move(data: [30, 40]), LineTo(data: [170, 40]), LineTo(data: [170, 140]), LineTo(data: [30, 140]), Close()]
}

@MainActor
func exportStrokeOutlines() -> J {
    let samples: [(String, [Operation], CGFloat, BrushCap, BrushJoin, CGFloat)] = [
        ("polyline-round", lineOperations(), 12, .round, .round, 10),
        ("polyline-miter-limit-2", lineOperations(), 14, .butt, .miter, 2),
        ("polyline-miter-limit-10", lineOperations(), 14, .square, .miter, 10),
        ("polyline-bevel", lineOperations(), 14, .butt, .bevel, 10),
        ("polyline-curved-bevel", lineOperations(), 14, .round, .standardCurvedBevel, 10),
        ("rectangle-round", rectangleOperations(), 8, .round, .round, 10),
    ]
    let rows = samples.map { id, operations, width, cap, join, miter in
        let outline = NativeStrokeOutline.path(operations: operations, width: width, cap: cap, join: join, miterLimit: miter)
        return J.obj([
            "id": .string(id),
            "width": .double(Double(width)),
            "cap": .string(String(describing: cap)),
            "join": .string(String(describing: join)),
            "miterLimit": .double(Double(miter)),
            "outline": pathElements(outline),
            "bounds": .array([
                .double(Double(outline.boundingRect.minX)), .double(Double(outline.boundingRect.minY)),
                .double(Double(outline.boundingRect.width)), .double(Double(outline.boundingRect.height)),
            ]),
        ])
    }
    return .obj(["generator": .string("NativeStrokeOutline"), "cases": .array(rows)])
}

@MainActor
func exportCrayonWatercolor() -> J {
    let renderer = SwiftUIRenderer()
    let canvas = CGSize(width: 200, height: 200)
    func drawing(_ drawable: Drawable, _ options: Options) -> J {
        guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: options) else { return .null }
        let commands = renderer.commands(for: drawing, options: options, in: canvas)
        return .obj([
            "shape": .string(drawing.shape),
            "commandCount": .int(commands.count),
            "commands": .array(commands.map(commandJSON)),
        ])
    }
    var crayon = Options()
    crayon.seed = 42
    crayon.strokeWidth = 10
    crayon.brushProfile = .crayon
    var wash = Options()
    wash.seed = 42
    wash.strokeWidth = 12
    wash.brushProfile = .watercolor()
    wash.fillStyle = .watercolor
    return .obj([
        "canvas": .array([.double(200), .double(200)]),
        "crayonLine": drawing(Curve(points: [Point(x: 16, y: 150), Point(x: 70, y: 40), Point(x: 130, y: 150), Point(x: 184, y: 60)]), crayon),
        "watercolorRectangle": drawing(Rectangle(x: 30, y: 36, width: 140, height: 120), wash),
        "watercolorEllipseFill": drawing(Ellipse(x: 100, y: 100, width: 140, height: 100), wash),
    ])
}

private func backing(_ edge: StickerEdge, image: StickerImage? = nil, shadow: StickerShadow? = nil) -> StickerBacking {
    StickerBacking(width: 12, smoothness: 1, edge: edge, color: .white, image: image, shadow: shadow)
}

@MainActor
private func contourCase(_ id: String, _ drawable: Drawable, _ backing: StickerBacking, options: Options = Options()) -> J {
    var options = options
    options.seed = 42
    options.strokeWidth = 3
    options.stickerBacking = backing
    let canvas = CGSize(width: 220, height: 220)
    guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: options) else { return .obj(["id": .string(id), "drawing": .null]) }
    let commands = StickerBackingBuilder.commands(for: drawing, options: options, backing: backing, transform: nil)
    let lines = StickerBackingBuilder.centerlines(for: drawing, options: options, backing: backing, transform: nil)
    return .obj([
        "id": .string(id),
        "centerlines": .array(lines.map { line in
            .obj(["closed": .bool(line.closed), "points": .array(line.points.map(pointJSON))])
        }),
        "commands": .array(commands.map(commandJSON)),
    ])
}

@MainActor
func exportStickerContours() -> J {
    let hole = "M 24 24 H 196 V 196 H 24 Z M 78 78 H 142 V 142 H 78 Z"
    let groupBacking = backing(.smooth)
    let parts = [
        SketchPart(RoughView().draw(Rectangle(x: 30, y: 70, width: 100, height: 80)).seed(42).strokeWidth(3)),
        SketchPart(RoughView().draw(Circle(x: 130, y: 110, diameter: 90)).seed(7).strokeWidth(3)).sketchOffset(x: 10, y: 0),
    ]
    let lines = SketchGroupRenderer.silhouetteLines(parts: parts, backing: groupBacking, size: CGSize(width: 220, height: 220))
    let groupCommands = StickerBackingBuilder.commands(for: lines, outward: groupBacking.width, backing: groupBacking, seed: 42)
    return .obj([
        "cases": .array([
            contourCase("smooth", Rectangle(x: 36, y: 46, width: 148, height: 110), backing(.smooth)),
            contourCase("fullySmooth", Ellipse(x: 110, y: 110, width: 150, height: 110), backing(.fullySmooth(radius: 0))),
            contourCase("fullySmooth-radius-12", Rectangle(x: 36, y: 46, width: 148, height: 110), backing(.fullySmooth(radius: 12))),
            contourCase("torn", Polygon(points: [(110, 24), (132, 78), (190, 82), (146, 118), (160, 176), (110, 146), (60, 176), (74, 118), (30, 82), (88, 78)].map { Point(x: $0.0, y: $0.1) }), backing(.torn(StickerTear(depth: 8, length: 14, jaggedness: 0.4)))),
            contourCase("hole", Path(d: hole), backing(.smooth)),
            .obj([
                "id": .string("group"),
                "centerlines": .array(lines.map { .obj(["closed": .bool($0.closed), "points": .array($0.points.map(pointJSON))]) }),
                "commands": .array(groupCommands.map(commandJSON)),
            ]),
            contourCase("shadow", Rectangle(x: 40, y: 40, width: 130, height: 100), backing(.smooth, shadow: StickerShadow(opacity: 0.35, x: 6, y: 8, radius: 8))),
        ]),
    ])
}

@MainActor
func exportStickerImagePlacement(weaveData: Data?) -> J {
    let weave = (weaveData.flatMap { UIImage(data: $0) }) ?? UIGraphicsImageRenderer(size: CGSize(width: 32, height: 16)).image { context in
        UIColor.systemBlue.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 32, height: 16))
    }
    let bounds = CGRect(x: 20, y: 30, width: 180, height: 120)
    let mask = SwiftUI.Path(bounds)
    func row(_ id: String, _ placement: StickerImagePlacement, _ scale: CGFloat) -> J {
        let image = StickerImage(image: weave, placement: placement, scale: scale, opacity: 0.8)
        let fitted = placementRect(image, maskBounds: bounds)
        return .obj([
            "id": .string(id),
            "placement": .string(placementName(placement)),
            "scale": .double(Double(scale)),
            "imageSize": .array([.double(Double(weave.size.width)), .double(Double(weave.size.height))]),
            "maskBounds": .array([.double(20), .double(30), .double(180), .double(120)]),
            "resolvedTileWidth": .double(Double(image.resolvedTileWidth)),
            "resolvedFitScale": .double(Double(image.resolvedFitScale)),
            "tileWidth": .double(Double(StickerImagePainter.tileWidth(image, in: bounds))),
            "drawRect": .array([.double(Double(fitted.minX)), .double(Double(fitted.minY)), .double(Double(fitted.width)), .double(Double(fitted.height))]),
            "maskedCommand": contourCase(id, Rectangle(x: 36, y: 46, width: 148, height: 110), backing(.smooth, image: image)),
        ])
    }
    _ = mask
    return .obj([
        "tileBudget": .int(StickerImagePainter.tileBudget),
        "cases": .array([
            row("tile-natural", .tile, 0),
            row("tile-scale-24", .tile, 24),
            row("stretch", .stretch, 1),
            row("stretch-scale-1.4", .stretch, 1.4),
            row("fill", .fill, 1),
            row("fill-scale-0.8", .fill, 0.8),
        ]),
    ])
}

/// The rectangles `StickerImagePainter` draws into. Tile repeats start at the mask minimum.
private func placementRect(_ image: StickerImage, maskBounds: CGRect) -> CGRect {
    switch image.placement {
    case .tile:
        let aspect = max(image.image.size.height, 1) / max(image.image.size.width, 1)
        let width = StickerImagePainter.tileWidth(image, in: maskBounds)
        return CGRect(x: maskBounds.minX, y: maskBounds.minY, width: width, height: max(4, width * aspect))
    case .stretch:
        let factor = max(image.resolvedFitScale, 0.05)
        let size = CGSize(width: maskBounds.width * factor, height: maskBounds.height * factor)
        return CGRect(x: maskBounds.midX - size.width / 2, y: maskBounds.midY - size.height / 2, width: size.width, height: size.height)
    case .fill:
        let imageWidth = max(image.image.size.width, 1)
        let imageHeight = max(image.image.size.height, 1)
        let fit = max(maskBounds.width / imageWidth, maskBounds.height / imageHeight) * max(image.resolvedFitScale, 0.05)
        let size = CGSize(width: imageWidth * fit, height: imageHeight * fit)
        return CGRect(x: maskBounds.midX - size.width / 2, y: maskBounds.midY - size.height / 2, width: size.width, height: size.height)
    }
}

@MainActor
func exportAnimationFrames() -> J {
    let canvas = CGSize(width: 200, height: 200)
    func frames(_ id: String, _ drawable: Drawable, _ variance: AnimationVariance) -> J {
        var options = Options()
        options.seed = 42
        options.strokeWidth = 3
        guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: options),
              let operations = drawing.sets.last?.operations else { return .obj(["id": .string(id), "frames": .array([])]) }
        let path = SwiftUI.Path.from(operationSet: OperationSet(type: .path, operations: operations, path: nil, size: nil))
        let config = AnimationConfig(steps: 4, speed: .medium, variance: variance, seed: 42)
        let generator = PathVarianceGenerator(config: config, baseSeed: 42)
        let varied = generator.precomputeAllSteps(for: path)
        return .obj([
            "id": .string(id),
            "variance": .float(variance.factor),
            "steps": .int(config.steps),
            "seed": .u64(42),
            "frames": .array(varied.enumerated().map { index, frame in
                .obj(["step": .int(index), "path": pathElements(frame)])
            }),
        ])
    }
    return .obj([
        "cases": .array([
            frames("circle-medium", Circle(x: 100, y: 100, diameter: 120), .medium),
            frames("rectangle-low", Rectangle(x: 30, y: 40, width: 140, height: 90), .low),
        ]),
    ])
}

@MainActor
func exportTextOutlines() -> J {
    let samples: [(String, String, UIFont?)] = [
        ("helvetica-sketchy", "Sketchy", UIFont(name: "Helvetica", size: 36)),
        ("helvetica-ag", "Ag", UIFont(name: "Helvetica", size: 48)),
        ("system-hello", "Hello", UIFont.systemFont(ofSize: 32)),
    ]
    let rows = samples.map { id, text, font -> J in
        let resolved = font ?? UIFont.systemFont(ofSize: 32)
        let path = TextPathConverter.path(from: text, font: resolved)
        let metrics = TextPathConverter.typographicMetrics(for: text, font: resolved)
        return .obj([
            "id": .string(id),
            "text": .string(text),
            "fontName": .string(resolved.fontName),
            "pointSize": .double(Double(resolved.pointSize)),
            "ascent": .double(Double(metrics.ascent)),
            "size": .array([.double(Double(metrics.size.width)), .double(Double(metrics.size.height))]),
            "outline": pathElements(path),
        ])
    }
    return .obj(["cases": .array(rows)])
}

@MainActor
func renderStickerPreviews(to directory: String, weaveData: Data?) throws {
    let picture = checkerboard(width: 64, height: 32)
    let image = StickerImage(image: picture, placement: .tile, scale: 28, opacity: 1)
    _ = weaveData
    let views: [(String, AnyView)] = [
        ("smooth", AnyView(sheet(.smooth, image: nil, shadow: nil))),
        ("fullySmooth", AnyView(sheet(.fullySmooth(radius: 8), image: nil, shadow: nil))),
        ("torn", AnyView(sheet(.torn(StickerTear(depth: 8, length: 14, jaggedness: 0.45)), image: nil, shadow: nil))),
        ("hole", AnyView(holeSheet())),
        ("group", AnyView(groupSheet())),
        ("shadow", AnyView(sheet(.smooth, image: nil, shadow: StickerShadow(opacity: 0.4, x: 8, y: 10, radius: 8)))),
        ("image-mask", AnyView(sheet(.torn(StickerTear(depth: 7, length: 16, jaggedness: 0.3)), image: image, shadow: nil))),
    ]
    let url = URL(fileURLWithPath: directory)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    for (name, view) in views {
        let renderer = ImageRenderer(content: view.frame(width: 280, height: 280))
        renderer.scale = 2
        renderer.isOpaque = true
        guard let png = renderer.uiImage?.pngData() else {
            throw CocoaError(.fileWriteUnknown)
        }
        try png.write(to: url.appendingPathComponent("\(name).png"))
    }
}

private func checkerboard(width: Int, height: Int) -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { context in
        let cells = 4
        let cellWidth = CGFloat(width) / CGFloat(cells)
        let cellHeight = CGFloat(height) / CGFloat(cells)
        for row in 0..<cells {
            for column in 0..<cells {
                let light = (row + column).isMultiple(of: 2)
                (light ? UIColor(red: 0.85, green: 0.16, blue: 0.28, alpha: 1) : UIColor(red: 0.05, green: 0.45, blue: 0.62, alpha: 1)).setFill()
                context.fill(CGRect(x: CGFloat(column) * cellWidth, y: CGFloat(row) * cellHeight, width: cellWidth, height: cellHeight))
            }
        }
    }
}

private func sheet(_ edge: StickerEdge, image: StickerImage?, shadow: StickerShadow?) -> some View {
    RoughView()
        .draw(Rectangle(x: 48, y: 58, width: 170, height: 130))
        .seed(42)
        .strokeWidth(3)
        .stroke(UIColor(red: 0.15, green: 0.25, blue: 0.38, alpha: 1))
        .fill(UIColor(red: 0.93, green: 0.55, blue: 0.28, alpha: 1))
        .fillStyle(.hachure)
        .stickerBacking(StickerBacking(width: 16, smoothness: 1, edge: edge, color: UIColor(red: 0.98, green: 0.96, blue: 0.90, alpha: 1), texture: .paper(seed: 42), image: image, shadow: shadow))
        .padding(24)
        .background(Color(white: 0.94))
}

private func holeSheet() -> some View {
    RoughView()
        .draw(Path(d: "M 40 46 H 230 V 210 H 40 Z M 92 96 H 176 V 164 H 92 Z"))
        .seed(42)
        .strokeWidth(3)
        .stroke(UIColor.black)
        .fillStyle(.solid)
        .fill(UIColor(red: 0.35, green: 0.55, blue: 0.62, alpha: 1))
        .stickerBacking(StickerBacking(width: 14, smoothness: 1, edge: .smooth, color: .white))
        .padding(16)
        .background(Color(white: 0.94))
}

private func groupSheet() -> some View {
    SketchGroup {
        RoughView().draw(Rectangle(x: 36, y: 70, width: 110, height: 90)).seed(42).strokeWidth(3).stroke(UIColor.black).fillStyle(.solid).fill(UIColor.orange)
        SketchPart(RoughView().draw(Circle(x: 140, y: 120, diameter: 100)).seed(9).strokeWidth(3).stroke(UIColor.black).fillStyle(.hachure).fill(UIColor.systemTeal)).sketchOffset(x: 8)
    }
    .stickerBacking(width: 14, smoothness: 1, edge: .smooth, color: Color.white)
    .padding(20)
    .background(Color(white: 0.94))
}
