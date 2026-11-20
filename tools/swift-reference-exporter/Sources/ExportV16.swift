import CoreGraphics
import SwiftUI
import UIKit

/// Feature fixtures added in Sketchy 1.6.0.
///
/// Route: `Phase3FixtureExporter.exportVersionDirectory` calls
/// `exportVersionFeatures` after the v1.5.0 case list. Each case is built
/// with the public `RoughView` modifiers, then measured from the generator,
/// filler, or painter. Nothing here substitutes a hand-written path for that
/// result.
@MainActor
func exportVersionFeatures(to directory: String, provenance: Provenance) throws {
    try write(contourDocument(provenance), to: "fills/contour.json", in: directory)
    try write(washDocument(provenance), to: "fills/wash.json", in: directory)
    try write(try interiorDocument(provenance, directory: directory), to: "fills/interior-shades.json", in: directory)
    try write(closedWidthDocument(provenance), to: "strokes/closed-width.json", in: directory)
    try write(try silhouetteDocument(provenance, directory: directory), to: "stickers/silhouette-shadow.json", in: directory)
}

// MARK: - Shared measurements

private let dome: [[Float]] = [[0, 0], [200, 0], [200, 280], [0, 280]]

private func quietContour() -> RoughView {
    RoughView()
        .seed(7)
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .fillWeight(2)
        .fillSpacing(8)
        .fillStyle(.contour)
        .contourGuide(.arc(center: CGPoint(x: 100, y: 420), radius: 420))
}

private func domePlan(_ options: Options) -> ContourPlan {
    ContourGeometry.plan(polygon: dome, options: options)
}

private func fillerSets(_ options: Options, polygon: [[Float]] = dome) -> [OperationSet] {
    ContourFiller().fillPolygonSets(points: polygon, options: options)
}

private func chord(_ points: [ContourPoint]) -> Float {
    guard let first = points.first, let last = points.last else { return 0 }
    return hypot(last.x - first.x, last.y - first.y)
}

/// Distance of the samples from the straight chord. This is how a flattened bow shows up.
private func sagitta(_ points: [ContourPoint]) -> Float {
    guard let first = points.first, let last = points.last, points.count > 2 else { return 0 }
    let dx = last.x - first.x
    let dy = last.y - first.y
    let length = hypot(dx, dy)
    guard length > 1 else { return 0 }
    return points.reduce(Float(0)) { best, point in
        max(best, abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length)
    }
}

private func pointsJSON(_ points: [ContourPoint]) -> J {
    .array(points.map { .array([.float($0.x), .float($0.y)]) })
}

private func strokeJSON(_ stroke: ContourStroke) -> J {
    let ys = stroke.points.map(\.y)
    let meanY = ys.isEmpty ? 0 : ys.reduce(0, +) / Float(ys.count)
    return .obj([
        "slot": .int(stroke.slot),
        "offset": .float(stroke.offset),
        "scale": .float(stroke.scale),
        "chord": .float(chord(stroke.points)),
        "sagitta": .float(sagitta(stroke.points)),
        "meanY": .float(meanY),
        "points": pointsJSON(stroke.points),
    ])
}

private func planJSON(_ plan: ContourPlan) -> J {
    let bows = plan.strokes.map { sagitta($0.points) }
    return .obj([
        "period": .float(plan.period),
        "gap": .float(plan.gap),
        "slotCount": .int(plan.slotCount),
        "phaseSlots": .float(plan.phaseSlots),
        "travel": .array([.float(plan.travel.x), .float(plan.travel.y)]),
        "strokeCount": .int(plan.strokes.count),
        "maxSagitta": .float(bows.max() ?? 0),
        "strokes": .array(plan.strokes.map(strokeJSON)),
    ])
}

private func opJSON(_ operation: Operation) -> J {
    switch operation {
    case let move as Move:
        return .array([.string("M"), .float(move.point.x), .float(move.point.y)])
    case let line as LineTo:
        return .array([.string("L"), .float(line.point.x), .float(line.point.y)])
    case let quad as QuadraticCurveTo:
        return .array([
            .string("Q"), .float(quad.controlPoint.x), .float(quad.controlPoint.y),
            .float(quad.point.x), .float(quad.point.y),
        ])
    case let curve as BezierCurveTo:
        return .array([
            .string("C"),
            .float(curve.controlPoint1.x), .float(curve.controlPoint1.y),
            .float(curve.controlPoint2.x), .float(curve.controlPoint2.y),
            .float(curve.point.x), .float(curve.point.y),
        ])
    case is Close:
        return .array([.string("Z")])
    default:
        return .array([.string("?")])
    }
}

private func setJSON(_ set: OperationSet) -> J {
    var row: [String: J] = [
        "type": .string(set.type.rawValue),
        "ops": .array(set.operations.map(opJSON)),
    ]
    if let path = set.path { row["path"] = .string(path) }
    if let size = set.size { row["size"] = .floats([size.width, size.height]) }
    if let scale = set.fillLineScale { row["fillLineScale"] = .float(scale) }
    if let width = set.fillLineWidth { row["fillLineWidth"] = .float(width) }
    if let opacity = set.opacityScale { row["opacityScale"] = .float(opacity) }
    return .object(row)
}

private func cg(_ value: CGFloat) -> J { .double(Double(value)) }

private func colorJSON(_ color: UIColor) -> J {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    let resolved = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
    guard resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
        return .string("unresolved")
    }
    return .obj(["r": cg(red), "g": cg(green), "b": cg(blue), "a": cg(alpha)])
}

private func matrixJSON(_ transform: CGAffineTransform) -> J {
    .array([
        cg(transform.a), cg(transform.b), cg(transform.c),
        cg(transform.d), cg(transform.tx), cg(transform.ty),
    ])
}

/// Maps image points the way `SilhouetteShadowPainter` does.
///
/// The painter translates to `position`, concatenates `transform`, then
/// translates by `-anchor`. Each new matrix is applied to the image before
/// the older one, so the anchor is subtracted, the skew runs, and the anchor
/// lands on `position`.
private func composedShadowTransform(_ shadow: SilhouetteShadow) -> CGAffineTransform {
    CGAffineTransform(translationX: -shadow.anchor.x, y: -shadow.anchor.y)
        .concatenating(shadow.transform)
        .concatenating(CGAffineTransform(translationX: shadow.position.x, y: shadow.position.y))
}

private func shadeKind(_ shade: InteriorShade) -> String {
    switch shade.kind {
    case .innerShadow: return "innerShadow"
    case .linear: return "linear"
    case .radial: return "radial"
    case .halo: return "halo"
    }
}

private func stopJSON(_ stop: ShadeStop) -> J {
    .obj([
        "location": cg(stop.location),
        "opacity": cg(stop.opacity),
        "color": colorJSON(stop.color),
    ])
}

/// Paint parameters stored on the shade after the public constructor clamps them.
private func shadeJSON(_ shade: InteriorShade) -> J {
    switch shade.kind {
    case let .innerShadow(opacity, x, y, blur, red, green, blue, alpha):
        return .obj([
            "kind": .string("innerShadow"),
            "opacity": cg(opacity),
            "x": cg(x), "y": cg(y), "blur": cg(blur),
            "color": .obj(["r": cg(red), "g": cg(green), "b": cg(blue), "a": cg(alpha)]),
            "paintsOutside": .bool(shade.paintsOutside),
        ])
    case let .linear(stops, angle):
        return .obj([
            "kind": .string("linear"),
            "angle": cg(angle),
            "stops": .array(stops.map(stopJSON)),
            "paintsOutside": .bool(shade.paintsOutside),
        ])
    case let .radial(stops, centerX, centerY, startRadius, endRadius):
        return .obj([
            "kind": .string("radial"),
            "center": .array([cg(centerX), cg(centerY)]),
            "startRadius": cg(startRadius),
            "endRadius": cg(endRadius),
            "stops": .array(stops.map(stopJSON)),
            "paintsOutside": .bool(shade.paintsOutside),
        ])
    case let .halo(opacity, glow, width, blur, red, green, blue, alpha):
        return .obj([
            "kind": .string("halo"),
            "opacity": cg(opacity),
            "glow": cg(glow),
            "width": cg(width),
            "blur": cg(blur),
            "color": .obj(["r": cg(red), "g": cg(green), "b": cg(blue), "a": cg(alpha)]),
            "paintsOutside": .bool(shade.paintsOutside),
        ])
    }
}

private func commandJSON(_ command: RoughRenderCommand) -> J {
    let style: String
    var lineWidth: Double?
    let color: Color
    switch command.style {
    case .stroke(let painted, let width):
        style = "stroke"
        lineWidth = Double(width)
        color = painted
    case .fill(let painted):
        style = "fill"
        color = painted
    }
    var row: [String: J] = [
        "style": .string(style),
        "color": colorJSON(UIColor(color)),
        "path": pathElements(command.path),
        "fillRule": .string(command.fillRule == .evenOdd ? "evenOdd" : "winding"),
        "cap": .string(String(describing: command.cap)),
        "join": .string(String(describing: command.join)),
        "miterLimit": cg(command.miterLimit),
    ]
    if let lineWidth { row["lineWidth"] = .double(lineWidth) }
    if let clip = command.clipPath { row["clip"] = pathElements(clip) }
    if let shade = command.shade { row["shade"] = shadeJSON(shade) }
    if let group = command.opacityMaskGroup { row["opacityMaskGroup"] = .int(group) }
    row["maskOpacity"] = cg(command.maskOpacity)
    row["opacityMaskBlur"] = cg(command.opacityMaskBlur)
    return .object(row)
}

private func orderJSON(_ commands: [RoughRenderCommand]) -> J {
    .array(commands.enumerated().map { index, command in
        let role: String
        if let shade = command.shade {
            role = "shade:" + shadeKind(shade)
        } else if case .stroke = command.style {
            role = "stroke"
        } else {
            role = "fill"
        }
        return .obj(["index": .int(index), "role": .string(role)])
    })
}

@MainActor
private func renderPNG<V: View>(_ view: V, size: CGSize) throws -> Data {
    let content = view
        .frame(width: size.width, height: size.height)
        .environment(\.colorScheme, .light)
    let renderer = ImageRenderer(content: content)
    renderer.scale = 1
    renderer.isOpaque = true
    renderer.proposedSize = ProposedViewSize(width: size.width, height: size.height)
    guard let data = renderer.uiImage?.pngData() else {
        throw CocoaError(.fileWriteUnknown)
    }
    if data.count > 10_000_000 {
        throw CocoaError(.fileWriteUnknown)
    }
    return data
}

private func writePNG(_ data: Data, to relativePath: String, in directory: String) throws {
    let url = URL(fileURLWithPath: directory).appendingPathComponent(relativePath)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
}

private func withProvenance(_ provenance: Provenance, _ extra: KeyValuePairs<String, J>) -> J {
    var row: [String: J] = ["provenance": provenance.json()]
    for (key, value) in extra { row[key] = value }
    return .object(row)
}

// MARK: - Contour

@MainActor
private func contourDocument(_ provenance: Provenance) -> J {
    let straight = quietContour().contourIntensity(0)
    let middle = quietContour().contourIntensity(0.35)
    let full = quietContour().contourIntensity(1)
    let ramp = quietContour().contourIntensity(from: 0.1, to: 1, angle: 0, easing: .easeInOut)
    var falloff = quietContour().contourIntensity(1)
    falloff = falloff.contourFalloff(1)

    let animatedBase = quietContour().contourIntensity(1)
    let preview = domePlan(animatedBase.options)
    let angle = atan2(preview.travel.y, preview.travel.x) * 180 / .pi
    let speed: Float = 30
    let phases: [Float] = [0, preview.gap * 0.5, preview.period]
    let frames = phases.map { phase -> J in
        let view = animatedBase.contourDrift(angle: angle, speed: speed, phase: phase)
        let plan = domePlan(view.options)
        return .obj([
            "phase": .float(phase),
            "phaseSlots": .float(plan.phaseSlots),
            "plan": planJSON(plan),
            "sets": .array(fillerSets(view.options).map(setJSON)),
        ])
    }
    let wrapped = animatedBase.contourDrift(angle: angle, speed: speed, phase: preview.period)
    let atZero = fillerSets(animatedBase.contourDrift(angle: angle, speed: speed, phase: 0).options)
    let atPeriod = fillerSets(wrapped.options)
    let opsMatch = renderSets(atZero) == renderSets(atPeriod)

    return withProvenance(provenance, [
        "fillStyle": .string(FillStyle.contour.rawValue),
        "cases": .array([
            contourCase("contour-intensity-0", straight),
            contourCase("contour-intensity-middle", middle),
            contourCase("contour-intensity-1", full),
            contourCase("contour-intensity-ramp", ramp),
            contourCase("contour-falloff", falloff),
            .obj([
                "id": .string("contour-animated"),
                "note": .string("animatedContour(angle:speed:) sets contourDrift phase to elapsed * speed. These frames are that phase at 0, half a gap, and one period. TimelineView dates are not sampled."),
                "angle": .float(angle),
                "speed": .float(speed),
                "period": .float(preview.period),
                "gap": .float(preview.gap),
                "phaseZeroMatchesPeriod": .bool(opsMatch),
                "frames": .array(frames),
            ]),
            svgHoleCase(),
            shortClipCase(),
            washOnContourCase(),
        ]),
    ])
}

private func contourCase(_ id: String, _ view: RoughView) -> J {
    let plan = domePlan(view.options)
    return .obj([
        "id": .string(id),
        "input": contourInput(view.options),
        "plan": planJSON(plan),
        "sets": .array(fillerSets(view.options).map(setJSON)),
    ])
}

private func contourInput(_ options: Options) -> J {
    .obj([
        "polygon": .array(dome.map { .floats($0) }),
        "intensity": .float(options.contourIntensity),
        "intensityStart": options.contourIntensityStart.map { .float($0) } ?? .null,
        "intensityEnd": options.contourIntensityEnd.map { .float($0) } ?? .null,
        "gradientAngle": .float(options.contourGradientAngle),
        "easing": .string(options.contourEasing.rawValue),
        "falloff": .float(options.contourFalloff),
        "fillSpacing": .float(options.fillSpacing),
        "seed": options.seed.map { .u64($0) } ?? .null,
    ])
}

@MainActor
private func svgHoleCase() -> J {
    let path = "M10 10 H110 V90 H10 Z M40 30 H80 V70 H40 Z"
    let view = RoughView()
        .seed(7)
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .fillStyle(.contour)
        .fill(Color.black)
        .contourIntensity(0)
        .fillAngle(0)
        .fillSpacing(4)
        .strokeWidth(1)
        .draw(Path(d: path))
    let size = CGSize(width: 140, height: 120)
    let drawing = NativeGenerator(size: size).generate(drawable: view.drawables[0], options: view.options)
    let commands = drawing.map { SwiftUIRenderer().commands(for: $0, options: view.options, in: size) } ?? []
    let clip = commands.compactMap { $0.clipPath }.first
    return .obj([
        "id": .string("contour-svg-hole"),
        "input": .obj(["d": .string(path), "canvas": .array([.double(140), .double(120)])]),
        "commands": .array(commands.map(commandJSON)),
        "clipProbes": clip.map { probes($0.cgPath) } ?? .null,
    ])
}

/// First grid point inside the path, and the first point the even-odd rule excludes while winding includes it.
private func probes(_ path: CGPath) -> J {
    let box = path.boundingBox
    var body: CGPoint?
    var hole: CGPoint?
    let steps = 28
    guard box.width > 0, box.height > 0 else {
        return .obj(["evenOddInside": .null, "windingOnly": .null])
    }
    for row in 0..<steps where body == nil || hole == nil {
        for column in 0..<steps where body == nil || hole == nil {
            let point = CGPoint(
                x: box.minX + box.width * (CGFloat(column) + 0.5) / CGFloat(steps),
                y: box.minY + box.height * (CGFloat(row) + 0.5) / CGFloat(steps)
            )
            let even = path.contains(point, using: .evenOdd, transform: .identity)
            let winding = path.contains(point, using: .winding, transform: .identity)
            if body == nil, even { body = point }
            if hole == nil, winding, !even { hole = point }
        }
    }
    func pointJSON(_ point: CGPoint?) -> J {
        guard let point else { return .null }
        return .array([cg(point.x), cg(point.y)])
    }
    return .obj(["evenOddInside": pointJSON(body), "windingOnly": pointJSON(hole)])
}

private func renderSets(_ sets: [OperationSet]) -> String {
    J.array(sets.map(setJSON)).render()
}

private func shortClipCase() -> J {
    let polygon: [[Float]] = [
        [0, 30], [180, 30], [180, 0], [188, 0], [188, 50], [180, 50], [180, 110], [0, 110],
    ]
    let view = RoughView()
        .seed(4)
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .fillStyle(.contour)
        .contourIntensity(0)
        .fillAngle(0)
        .fillSpacing(6)
    let plan = ContourGeometry.plan(polygon: polygon, options: view.options)
    let xs = plan.strokes.flatMap { $0.points.map(\.x) }
    let chords = plan.strokes.map { chord($0.points) }
    return .obj([
        "id": .string("contour-short-clip"),
        "input": .obj([
            "polygon": .array(polygon.map { .floats($0) }),
            "fillAngle": .float(view.options.fillAngle),
            "note": .string("The spike from x 180 to 188 and y 0 to 30 is only 8 points wide. Kept strokes are the ones ContourGeometry.plan returned."),
        ]),
        "strokeCount": .int(plan.strokes.count),
        "minChord": .float(chords.min() ?? 0),
        "maxX": .float(xs.max() ?? 0),
        "pointsWithYBelow30": .int(plan.strokes.flatMap(\.points).filter { $0.y < 30 }.count),
        "strokes": .array(plan.strokes.map(strokeJSON)),
    ])
}

private func washOnContourCase() -> J {
    let pass = WashPass(
        spacingMin: 18, spacingSpan: 0,
        widthMin: 7, widthSpan: 3,
        opacityMin: 0.4, opacitySpan: 0.15,
        trimMax: 10, angleSpread: 0, bow: 6,
        minLength: 8, seed: 5
    )
    let view = quietContour()
        .contourIntensity(0.8)
        .washPasses([pass])
    let sets = fillerSets(view.options)
    return .obj([
        "id": .string("contour-wash-passes"),
        "pass": reflect(pass),
        "sets": .array(sets.map(setJSON)),
    ])
}

// MARK: - Wash

private let washRect: [[Float]] = [[10, 10], [170, 10], [170, 90], [10, 90]]

private func washDocument(_ provenance: Provenance) -> J {
    let plain = RoughView().seed(42).fillStyle(.wash).fillAngle(-40).roughness(0.6).bowing(1)
    let explicit = plain.washPasses(WashPass.sky)
    let tight = washPass(angleSpread: 0, trimMax: 0, bow: 0)
    let scattered = washPass(angleSpread: 40, trimMax: 0, bow: 0)
    let trimmed = washPass(angleSpread: 0, trimMax: 36, bow: 0)
    let bowed = washPass(angleSpread: 0, trimMax: 0, bow: 20)
    return withProvenance(provenance, [
        "fillStyle": .string(FillStyle.wash.rawValue),
        "sky": reflect(WashPass.sky),
        "cases": .array([
            washCase("wash-default", plain, WashPass.sky),
            washCase("wash-sky", explicit, WashPass.sky),
            .obj([
                "id": .string("wash-scatter"),
                "straight": washResult(tight),
                "scattered": washResult(scattered),
            ]),
            .obj([
                "id": .string("wash-trim"),
                "full": washResult(tight),
                "trimmed": washResult(trimmed),
            ]),
            .obj([
                "id": .string("wash-bow"),
                "flat": washResult(tight),
                "bowed": washResult(bowed),
            ]),
        ]),
    ])
}

private func washPass(angleSpread: Float, trimMax: Float, bow: Float) -> WashPass {
    WashPass(
        spacingMin: 28, spacingSpan: 0,
        widthMin: 8, widthSpan: 0,
        opacityMin: 0.8, opacitySpan: 0,
        trimMax: trimMax, angleSpread: angleSpread, bow: bow,
        minLength: 8, roughness: 0.2, bowing: 0.2, randomness: 0.2,
        seed: 8
    )
}

private func washCase(_ id: String, _ view: RoughView, _ recordedPasses: [WashPass]) -> J {
    var row = washResult(view)
    if case .object(var fields) = row {
        fields["id"] = .string(id)
        fields["storedPasses"] = view.options.washPasses.map { reflect($0) } ?? .null
        fields["skyPasses"] = reflect(recordedPasses)
        row = .object(fields)
    }
    return row
}

private func washResult(_ view: RoughView) -> J {
    let sets = WashFiller().fillPolygonSets(points: washRect, options: view.options)
    return .obj([
        "polygon": .array(washRect.map { .floats($0) }),
        "fillAngle": .float(view.options.fillAngle),
        "seed": view.options.seed.map { .u64($0) } ?? .null,
        "sets": .array(sets.map(setJSON)),
    ])
}

private func washResult(_ pass: WashPass) -> J {
    let view = RoughView()
        .seed(8)
        .fillStyle(.wash)
        .fillAngle(0)
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .washPasses([pass])
    var row = washResult(view)
    if case .object(var fields) = row {
        fields["pass"] = reflect(pass)
        row = .object(fields)
    }
    return row
}

// MARK: - Interior shades

@MainActor
private func interiorDocument(_ provenance: Provenance, directory: String) throws -> J {
    let size = CGSize(width: 160, height: 160)
    let circle = Circle(x: 80, y: 80, diameter: 100)
    let hole = "M0 0 H160 V160 H0 Z M50 50 H110 V110 H50 Z"
    let cases: [(String, [InteriorShade], Drawable, Bool)] = [
        ("shade-pit-shadow", [.pitShadow], circle, false),
        ("shade-pit-recess", [.pitRecess], circle, false),
        ("shade-edge", [.edgeShade()], circle, false),
        ("shade-halo", [.halo(color: Color(red: 0.12, green: 0.45, blue: 0.92))], circle, false),
        ("shade-hole", [.pitRecess], Path(d: hole), true),
    ]
    var rows: [J] = []
    for (id, shades, drawable, isHole) in cases {
        let view = shadeView(shades, drawable: drawable)
        let options = view.options
        guard let drawing = NativeGenerator(size: size).generate(drawable: drawable, options: options) else {
            rows.append(.obj(["id": .string(id), "drawing": .null]))
            continue
        }
        let commands = SwiftUIRenderer().commands(for: drawing, options: options, in: size)
        var bare = options
        bare.interiorShades = []
        let bareDrawing = NativeGenerator(size: size).generate(drawable: drawable, options: bare)
        let imageName = "images/shades/\(id).png"
        let png = try renderPNG(shadeCard(view, hole: isHole), size: size)
        try writePNG(png, to: imageName, in: directory)
        rows.append(.obj([
            "id": .string(id),
            "shades": .array(shades.map(shadeJSON)),
            "drawingCacheKeyEqual": .bool(
                DrawingCacheKey(drawable: drawable, size: size, options: bare)
                    == DrawingCacheKey(drawable: drawable, size: size, options: options)
            ),
            "cacheHash": .string(String(options.cacheHash)),
            "bareCacheHash": .string(String(bare.cacheHash)),
            "generatedSetsEqual": .bool(bareDrawing.map { renderSets($0.sets) } == renderSets(drawing.sets)),
            "order": orderJSON(commands),
            "commands": .array(commands.map(commandJSON)),
            "png": .string(imageName),
            "pngBytes": .int(png.count),
        ]))
    }
    return withProvenance(provenance, ["cases": .array(rows)])
}

private func shadeView(_ shades: [InteriorShade], drawable: Drawable) -> RoughView {
    RoughView()
        .roughness(0)
        .bowing(0)
        .maxRandomnessOffset(0)
        .stroke(Color.clear)
        .strokeWidth(0)
        .fill(Color.white)
        .fillStyle(.solid)
        .seed(3)
        .interiorShades(shades)
        .draw(drawable)
}

@MainActor
private func shadeCard(_ view: RoughView, hole: Bool) -> some View {
    ZStack {
        hole ? Color.blue : Color(red: 0.96, green: 0.93, blue: 0.88)
        view
    }
}

// MARK: - Closed variable width

private let ringStops = [
    WidthStop(position: 0, width: 4),
    WidthStop(position: 0.15, width: 14),
    WidthStop(position: 0.85, width: 14),
    WidthStop(position: 1, width: 4),
]

private let sampleT: [CGFloat] = [0, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.5, 0.9, 0.92, 0.94, 0.96, 0.97, 0.98, 1]

@MainActor
private func closedWidthDocument(_ provenance: Provenance) -> J {
    let variable = VariableStrokeWidth(variation: 0.35, seed: 42, frequency: 3)
    let canvas = CGSize(width: 160, height: 160)
    let circle = Circle(x: 80, y: 80, diameter: 100)
    return withProvenance(provenance, [
        "cases": .array([
            widthSamples("width-samples-stops", .stops(ringStops), strokeWidth: 8),
            widthSamples("width-samples-variable", .variable(variable), strokeWidth: 8),
            ringCase(
                "closed-ring-stops",
                RoughView().seed(9).roughness(0.25).strokeWidth(8).stroke(Color.black).widthStops(ringStops),
                circle, canvas
            ),
            ringCase(
                "closed-ring-variable",
                RoughView().seed(9).roughness(0.25).strokeWidth(8).stroke(Color.black)
                    .brushProfile(.marker(variation: 0.35, seed: 9, frequency: 3)),
                circle, canvas
            ),
            ringCase(
                "closed-crayon-ring",
                RoughView().seed(11).roughness(0.2).strokeWidth(12).stroke(Color.black)
                    .brushProfile(.crayon)
                    .thicknessProfile(.variable(VariableStrokeWidth(variation: 0.35, seed: 11))),
                circle, canvas
            ),
            sameSeedCase(circle, canvas),
        ]),
    ])
}

private func widthSamples(_ id: String, _ profile: ThicknessProfile, strokeWidth: CGFloat) -> J {
    let rows = sampleT.map { t -> J in
        .obj([
            "t": cg(t),
            "open": cg(profile.width(at: t, strokeWidth: strokeWidth, closed: false)),
            "closed": cg(profile.width(at: t, strokeWidth: strokeWidth, closed: true)),
        ])
    }
    return .obj([
        "id": .string(id),
        "strokeWidth": cg(strokeWidth),
        "profile": .string(String(describing: profile)),
        "samples": .array(rows),
    ])
}

@MainActor
private func ringCase(_ id: String, _ view: RoughView, _ drawable: Drawable, _ canvas: CGSize) -> J {
    let drawn = view.draw(drawable)
    guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: drawn.options) else {
        return .obj(["id": .string(id), "drawing": .null])
    }
    let commands = SwiftUIRenderer().commands(for: drawing, options: drawn.options, in: canvas)
    return .obj([
        "id": .string(id),
        "seed": drawn.options.seed.map { .u64($0) } ?? .null,
        "strokeWidth": .float(drawn.options.strokeWidth),
        "sets": .array(drawing.sets.map(setJSON)),
        "order": orderJSON(commands),
        "commands": .array(commands.map(commandJSON)),
    ])
}

@MainActor
private func sameSeedCase(_ drawable: Drawable, _ canvas: CGSize) -> J {
    let view = RoughView()
        .seed(21)
        .roughness(0.3)
        .strokeWidth(8)
        .stroke(Color.black)
        .widthStops(ringStops)
        .draw(drawable)
    func once() -> J {
        guard let drawing = NativeGenerator(size: canvas).generate(drawable: drawable, options: view.options) else { return .null }
        let commands = SwiftUIRenderer().commands(for: drawing, options: view.options, in: canvas)
        return .array(commands.map(commandJSON))
    }
    let first = once()
    let second = once()
    return .obj([
        "id": .string("closed-ring-same-seed"),
        "seed": .u64(21),
        "identical": .bool(first.render() == second.render()),
        "first": first,
        "second": second,
    ])
}

// MARK: - Silhouette shadow

@MainActor
private func silhouetteDocument(_ provenance: Provenance, directory: String) throws -> J {
    let image = treeSprite()
    let source = "images/silhouette-source.png"
    guard let sourcePNG = image.pngData() else { throw CocoaError(.fileWriteUnknown) }
    try writePNG(sourcePNG, to: source, in: directory)

    let anchor = CGPoint(x: 8, y: 40)
    let transform = CGAffineTransform(a: 0.9, b: 0.15, c: -0.4, d: 0.5, tx: 0, ty: 0)
    let tint = UIColor(red: 22.0 / 255, green: 48.0 / 255, blue: 14.0 / 255, alpha: 1)
    let affine = SilhouetteShadow(
        image: image,
        color: tint,
        opacity: 0.42,
        transform: transform,
        anchor: anchor,
        position: CGPoint(x: 90, y: 110)
    )
    let tree = SilhouetteShadow.tree(image: image, at: CGPoint(x: 90, y: 120))
    let foot = SilhouetteShadow.footAnchor(in: image, alphaThreshold: 20)
    let canvas = CGSize(width: 180, height: 160)
    let affinePNG = try renderPNG(shadowCard(affine), size: canvas)
    let treePNG = try renderPNG(shadowCard(tree), size: canvas)
    try writePNG(affinePNG, to: "images/silhouette-affine.png", in: directory)
    try writePNG(treePNG, to: "images/silhouette-tree.png", in: directory)
    return withProvenance(provenance, [
        "sourceImage": .string(source),
        "sourceSize": .array([cg(image.size.width), cg(image.size.height)]),
        "cases": .array([
            shadowCase("silhouette-affine", affine, png: "images/silhouette-affine.png", bytes: affinePNG.count, foot: nil),
            shadowCase("silhouette-tree", tree, png: "images/silhouette-tree.png", bytes: treePNG.count, foot: foot),
        ]),
    ])
}

private func shadowCase(
    _ id: String,
    _ shadow: SilhouetteShadow,
    png: String,
    bytes: Int,
    foot: CGPoint?
) -> J {
    var row: [String: J] = [
        "id": .string(id),
        "color": colorJSON(shadow.color),
        "opacity": cg(shadow.opacity),
        "transform": matrixJSON(shadow.transform),
        "anchor": .array([cg(shadow.anchor.x), cg(shadow.anchor.y)]),
        "position": .array([cg(shadow.position.x), cg(shadow.position.y)]),
        "composedTransform": matrixJSON(composedShadowTransform(shadow)),
        "png": .string(png),
        "pngBytes": .int(bytes),
    ]
    if let foot {
        row["footAnchor"] = .array([cg(foot.x), cg(foot.y)])
        row["anchorMatchesFoot"] = .bool(shadow.anchor == foot)
    }
    return .object(row)
}

@MainActor
private func shadowCard(_ shadow: SilhouetteShadow) -> some View {
    ZStack {
        Color.white
        RoughView().draw(shadow)
    }
}

/// Small trunk-and-canopy sprite. The lowest opaque row is the trunk, not the image centre.
@MainActor
private func treeSprite() -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: CGSize(width: 28, height: 64), format: format).image { ctx in
        let context = ctx.cgContext
        context.setFillColor(UIColor.red.cgColor)
        context.fill(CGRect(x: 10, y: 16, width: 8, height: 48))
        context.fillEllipse(in: CGRect(x: 2, y: 0, width: 24, height: 26))
    }
}
