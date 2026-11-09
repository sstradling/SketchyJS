import Foundation
import UIKit

/// Option overrides a corpus case applies on top of `Options()`. Anything left nil keeps the Swift default.
struct OptionPatch {
    var seed: UInt64? = nil
    var fillStyle: FillStyle? = nil
    var fillAngle: Float? = nil
    var fillSpacing: Float? = nil
    var fillWeight: Float? = nil
    var fillSpacingPattern: [Float]? = nil
    var roughness: Float? = nil
    var bowing: Float? = nil
    var maxRandomnessOffset: Float? = nil
    var strokeWidth: Float? = nil
    var strokeContinuity: StrokeContinuity? = nil
    var curveStepCount: Float? = nil
    var curveTightness: Float? = nil
    var dashOffset: Float? = nil
    var dashGap: Float? = nil
    var zigzagOffset: Float? = nil

    func apply(to options: inout Options) {
        if let seed { options.seed = seed }
        if let fillStyle { options.fillStyle = fillStyle }
        if let fillAngle { options.fillAngle = fillAngle }
        if let fillSpacing { options.fillSpacing = fillSpacing }
        if let fillWeight { options.fillWeight = fillWeight }
        if let fillSpacingPattern { options.fillSpacingPattern = fillSpacingPattern }
        if let roughness { options.roughness = roughness }
        if let bowing { options.bowing = bowing }
        if let maxRandomnessOffset { options.maxRandomnessOffset = maxRandomnessOffset }
        if let strokeWidth { options.strokeWidth = strokeWidth }
        if let strokeContinuity { options.strokeContinuity = strokeContinuity }
        if let curveStepCount { options.curveStepCount = curveStepCount }
        if let curveTightness { options.curveTightness = curveTightness }
        if let dashOffset { options.dashOffset = dashOffset }
        if let dashGap { options.dashGap = dashGap }
        if let zigzagOffset { options.zigzagOffset = zigzagOffset }
    }

    var json: J {
        var dict: [String: J] = [:]
        if let seed { dict["seed"] = .u64(seed) }
        if let fillStyle { dict["fillStyle"] = .string(fillStyle.rawValue) }
        if let fillAngle { dict["fillAngle"] = .float(fillAngle) }
        if let fillSpacing { dict["fillSpacing"] = .float(fillSpacing) }
        if let fillWeight { dict["fillWeight"] = .float(fillWeight) }
        if let fillSpacingPattern { dict["fillSpacingPattern"] = .floats(fillSpacingPattern) }
        if let roughness { dict["roughness"] = .float(roughness) }
        if let bowing { dict["bowing"] = .float(bowing) }
        if let maxRandomnessOffset { dict["maxRandomnessOffset"] = .float(maxRandomnessOffset) }
        if let strokeWidth { dict["strokeWidth"] = .float(strokeWidth) }
        if let strokeContinuity { dict["strokeContinuity"] = .string(strokeContinuity == .legacy ? "legacy" : "continuous") }
        if let curveStepCount { dict["curveStepCount"] = .float(curveStepCount) }
        if let curveTightness { dict["curveTightness"] = .float(curveTightness) }
        if let dashOffset { dict["dashOffset"] = .float(dashOffset) }
        if let dashGap { dict["dashGap"] = .float(dashGap) }
        if let zigzagOffset { dict["zigzagOffset"] = .float(zigzagOffset) }
        return .object(dict)
    }
}

struct ShapeCase {
    let id: String
    let kind: String
    let args: J
    let drawable: Drawable
    var patch = OptionPatch(seed: 42)
}

private func pts(_ pairs: [(Float, Float)]) -> [Point] { pairs.map { Point(x: $0.0, y: $0.1) } }
private func ptsJSON(_ pairs: [(Float, Float)]) -> J { .array(pairs.map { J.floats([$0.0, $0.1]) }) }

private let concave: [(Float, Float)] = [(10, 10), (150, 10), (150, 60), (80, 60), (80, 120), (10, 120)]
private let star: [(Float, Float)] = [(90, 10), (110, 70), (170, 70), (122, 106), (140, 166), (90, 130), (40, 166), (58, 106), (10, 70), (70, 70)]
private let curvePoints: [(Float, Float)] = [(10, 100), (60, 20), (110, 90), (160, 30), (190, 100)]

private func shapeCases() -> [ShapeCase] {
    var cases: [ShapeCase] = []
    func add(_ id: String, _ kind: String, _ args: J, _ drawable: Drawable, _ patch: OptionPatch = OptionPatch(seed: 42)) {
        cases.append(ShapeCase(id: id, kind: kind, args: args, drawable: drawable, patch: patch))
    }
    for continuity in [StrokeContinuity.continuous, .legacy] {
        let tag = continuity == .legacy ? "legacy" : "continuous"
        func p(_ seed: UInt64 = 42, style: FillStyle = .solid) -> OptionPatch {
            OptionPatch(seed: seed, fillStyle: style, strokeContinuity: continuity)
        }
        add("rectangle-\(tag)", "rectangle", .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
            Rectangle(x: 20, y: 30, width: 150, height: 90), p())
        add("ellipse-\(tag)", "ellipse", .obj(["x": .float(92), "y": .float(92), "width": .float(150), "height": .float(108)]),
            Ellipse(x: 92, y: 92, width: 150, height: 108), p(14))
        add("circle-\(tag)", "circle", .obj(["x": .float(92), "y": .float(92), "diameter": .float(120)]),
            Circle(x: 92, y: 92, diameter: 120), p(7))
        add("line-\(tag)", "line", .obj(["x1": .float(10), "y1": .float(20), "x2": .float(180), "y2": .float(140)]),
            Line(from: Point(x: 10, y: 20), to: Point(x: 180, y: 140)), p(3))
        add("linearPath-\(tag)", "linearPath", .obj(["points": ptsJSON(curvePoints)]), LinearPath(points: pts(curvePoints)), p(5))
        add("polygon-star-\(tag)", "polygon", .obj(["points": ptsJSON(star)]), Polygon(points: pts(star)), p(42))
        add("polygon-concave-\(tag)", "polygon", .obj(["points": ptsJSON(concave)]), Polygon(points: pts(concave)), p(42))
        add("arc-open-\(tag)", "arc", .obj(["x": .float(92), "y": .float(92), "width": .float(140), "height": .float(100), "start": .float(0.4), "stop": .float(4.2), "closed": .bool(false)]),
            Arc(x: 92, y: 92, width: 140, height: 100, start: 0.4, stop: 4.2, closed: false), p(9))
        add("arc-closed-\(tag)", "arc", .obj(["x": .float(92), "y": .float(92), "width": .float(140), "height": .float(100), "start": .float(0.4), "stop": .float(4.2), "closed": .bool(true)]),
            Arc(x: 92, y: 92, width: 140, height: 100, start: 0.4, stop: 4.2, closed: true), p(9))
        add("curve-\(tag)", "curve", .obj(["points": ptsJSON(curvePoints)]), Curve(points: pts(curvePoints)), p(11))
        add("roundedRectangle-\(tag)", "roundedRectangle", .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90), "cornerRadius": .float(18)]),
            RoundedRectangle(x: 20, y: 30, width: 150, height: 90, cornerRadius: 18), p(21))
        add("egg-\(tag)", "egg", .obj(["x": .float(92), "y": .float(92), "width": .float(110), "height": .float(150), "tilt": .float(0.3)]),
            EggShape(x: 92, y: 92, width: 110, height: 150, tilt: 0.3), p(17))
    }
    add("rectangle-roughness-0", "rectangle", .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
        Rectangle(x: 20, y: 30, width: 150, height: 90), OptionPatch(seed: 42, fillStyle: .solid, roughness: 0))
    add("rectangle-roughness-3-bowing-2", "rectangle", .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
        Rectangle(x: 20, y: 30, width: 150, height: 90), OptionPatch(seed: 42, fillStyle: .solid, roughness: 3, bowing: 2, maxRandomnessOffset: 4))
    let d = "M 20 90 C 20 20, 120 20, 120 90 S 220 160, 220 90 Q 170 10 120 40 T 60 60 Z"
    add("path-svg-cubic-quad", "path", .obj(["d": .string(d)]), Path(d: d), OptionPatch(seed: 42, fillStyle: .solid))
    let arcPath = "M 30 100 A 50 30 0 0 1 130 100 A 50 30 20 1 0 30 100 Z"
    add("path-svg-arcs", "path", .obj(["d": .string(arcPath)]), Path(d: arcPath), OptionPatch(seed: 42, fillStyle: .solid))
    return cases
}

/// Fill styles exercised on the same rectangle, ellipse, and concave polygon.
private let fillStyles: [FillStyle] = [.hachure, .solid, .zigzag, .crossHatch, .dots, .sunBurst, .starBurst, .dashed, .zigzagLine]

private func fillCases() -> [ShapeCase] {
    var cases: [ShapeCase] = []
    for style in fillStyles {
        let tag = style.rawValue
        cases.append(ShapeCase(id: "fill-\(tag)-rectangle", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                               drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: style, fillSpacing: style == .dots ? 14 : nil)))
        cases.append(ShapeCase(id: "fill-\(tag)-ellipse", kind: "ellipse", args: .obj(["x": .float(92), "y": .float(92), "width": .float(150), "height": .float(108)]),
                               drawable: Ellipse(x: 92, y: 92, width: 150, height: 108), patch: OptionPatch(seed: 14, fillStyle: style, fillSpacing: style == .dots ? 14 : nil)))
        cases.append(ShapeCase(id: "fill-\(tag)-polygon-concave", kind: "polygon", args: .obj(["points": ptsJSON(concave)]),
                               drawable: Polygon(points: pts(concave)), patch: OptionPatch(seed: 42, fillStyle: style, fillSpacing: style == .dots ? 14 : nil)))
    }
    cases.append(ShapeCase(id: "fill-hachure-angle-0-spacing-3", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                           drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: .hachure, fillAngle: 0, fillSpacing: 3)))
    cases.append(ShapeCase(id: "fill-hachure-angle-90-weight-2", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                           drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: .hachure, fillAngle: 90, fillWeight: 2)))
    cases.append(ShapeCase(id: "fill-hachure-spacing-pattern", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                           drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: .hachure, fillSpacingPattern: [1, 1, 2, 3, 5, 8])))
    cases.append(ShapeCase(id: "fill-dashed-offset-gap", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                           drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: .dashed, dashOffset: 6, dashGap: 4)))
    cases.append(ShapeCase(id: "fill-zigzag-offset", kind: "rectangle", args: .obj(["x": .float(20), "y": .float(30), "width": .float(150), "height": .float(90)]),
                           drawable: Rectangle(x: 20, y: 30, width: 150, height: 90), patch: OptionPatch(seed: 42, fillStyle: .zigzag, zigzagOffset: 5)))
    return cases
}

/// Operations are written as compact arrays: `["M",x,y]`, `["L",x,y]`, `["Q",cx,cy,x,y]`,
/// `["C",c1x,c1y,c2x,c2y,x,y]`, `["Z"]`.
private func opJSON(_ operation: Operation) -> J {
    switch operation {
    case let m as Move: return .array([.string("M"), .float(m.point.x), .float(m.point.y)])
    case let l as LineTo: return .array([.string("L"), .float(l.point.x), .float(l.point.y)])
    case let q as QuadraticCurveTo:
        return .array([.string("Q"), .float(q.controlPoint.x), .float(q.controlPoint.y), .float(q.point.x), .float(q.point.y)])
    case let c as BezierCurveTo:
        return .array([.string("C"), .float(c.controlPoint1.x), .float(c.controlPoint1.y), .float(c.controlPoint2.x), .float(c.controlPoint2.y), .float(c.point.x), .float(c.point.y)])
    case is Close: return .array([.string("Z")])
    default: return .array([.string("?")])
    }
}

private func setJSON(_ set: OperationSet) -> J {
    var dict: [String: J] = ["type": .string(set.type.rawValue), "ops": .array(set.operations.map(opJSON))]
    if let path = set.path { dict["path"] = .string(path) }
    if let size = set.size { dict["size"] = .floats([size.width, size.height]) }
    return .object(dict)
}

@MainActor
private func exportCases(_ cases: [ShapeCase], canvas: CGSize) -> J {
    let generator = NativeGenerator(size: canvas)
    var rows: [J] = []
    for item in cases {
        var options = Options()
        item.patch.apply(to: &options)
        let drawing = generator.generate(drawable: item.drawable, options: options)
        var row: [String: J] = [
            "id": .string(item.id),
            "shape": .obj(["kind": .string(item.kind), "args": item.args]),
            "options": item.patch.json,
        ]
        if let drawing {
            row["drawing"] = .obj(["shape": .string(drawing.shape), "sets": .array(drawing.sets.map(setJSON))])
        } else {
            row["drawing"] = .null
        }
        rows.append(.object(row))
    }
    return J.obj([
        "canvas": .floats([Float(canvas.width), Float(canvas.height)]),
        "cases": .array(rows),
    ])
}

@MainActor func exportShapes() -> J { exportCases(shapeCases(), canvas: CGSize(width: 200, height: 200)) }
@MainActor func exportFills() -> J { exportCases(fillCases(), canvas: CGSize(width: 200, height: 200)) }

/// Fillers called directly on a polygon, isolating fill generation from outline generation.
@MainActor
func exportDirectFillers() -> J {
    var rows: [J] = []
    let polygons: [(String, [(Float, Float)])] = [
        ("rect", [(0, 0), (120, 0), (120, 90), (0, 90)]),
        ("concave", concave),
        ("star", star),
    ]
    for style in fillStyles {
        for (name, points) in polygons {
            var options = Options()
            options.seed = 42
            options.fillStyle = style
            if style == .dots { options.fillSpacing = 14 }
            let filler = FillPatternFactory.filler(for: style)
            let set = filler.fillPolygon(points: points.map { [$0.0, $0.1] }, options: options)
            rows.append(.obj([
                "id": .string("filler-\(style.rawValue)-\(name)"),
                "style": .string(style.rawValue),
                "polygon": ptsJSON(points),
                "options": OptionPatch(seed: 42, fillStyle: style, fillSpacing: style == .dots ? 14 : nil).json,
                "result": set.map(setJSON) ?? .null,
            ]))
        }
    }
    return J.obj(["cases": .array(rows)])
}

/// `ScribbleFillGenerator` on CGPaths. The scribble legs are geometric, so these fixtures
/// check ray intersection and ordering rather than random-number consumption.
@MainActor
func exportScribble() -> J {
    func polygonPath(_ points: [(Float, Float)]) -> CGPath {
        let path = CGMutablePath()
        for (index, point) in points.enumerated() {
            let cg = CGPoint(x: CGFloat(point.0), y: CGFloat(point.1))
            if index == 0 { path.move(to: cg) } else { path.addLine(to: cg) }
        }
        path.closeSubpath()
        return path
    }
    let blob = CGMutablePath()
    blob.move(to: CGPoint(x: 20, y: 90))
    blob.addCurve(to: CGPoint(x: 120, y: 90), control1: CGPoint(x: 20, y: 10), control2: CGPoint(x: 120, y: 10))
    blob.addQuadCurve(to: CGPoint(x: 70, y: 170), control: CGPoint(x: 150, y: 160))
    blob.closeSubpath()

    let shapes: [(String, CGPath, J)] = [
        ("rect", polygonPath([(10, 10), (190, 10), (190, 130), (10, 130)]), ptsJSON([(10, 10), (190, 10), (190, 130), (10, 130)])),
        ("concave", polygonPath(concave), ptsJSON(concave)),
        ("blob", blob, .string("M20 90 C20 10 120 10 120 90 Q150 160 70 170 Z")),
    ]
    let variants: [(String, (inout Options) -> Void, J)] = [
        ("default", { _ in }, .obj([:])),
        ("tightness-4-curvature", { $0.scribbleTightness = 4; $0.scribbleCurvature = 0.5 }, .obj(["scribbleTightness": .int(4), "scribbleCurvature": .float(0.5)])),
        ("origin-30", { $0.scribbleOrigin = 30; $0.scribbleTightness = 6 }, .obj(["scribbleOrigin": .float(30), "scribbleTightness": .int(6)])),
    ]
    var rows: [J] = []
    for (shapeName, path, description) in shapes {
        for (variantName, mutate, patch) in variants {
            var options = Options()
            options.seed = 42
            mutate(&options)
            let sets = ScribbleFillGenerator.generate(for: path, options: options)
            rows.append(.obj([
                "id": .string("scribble-\(shapeName)-\(variantName)"),
                "shape": description,
                "options": patch,
                "sets": .array(sets.map(setJSON)),
            ]))
        }
    }
    return J.obj(["cases": .array(rows)])
}
