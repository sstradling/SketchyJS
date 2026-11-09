import Foundation
import UIKit

private func kindName(_ kind: SVGCommand.Kind) -> String {
    switch kind {
    case .move: return "move"
    case .line: return "line"
    case .cubeCurve: return "cubic"
    case .quadCurve: return "quad"
    case .arc: return "arc"
    case .close: return "close"
    }
}

private let pathStrings: [(String, String)] = [
    ("absolute-basic", "M10 20 L30 40 L50 20 Z"),
    ("relative-basic", "m10 20 l20 20 l20 -20 z"),
    ("horizontal-vertical", "M10 10 H50 V40 h-20 v-10 Z"),
    ("implicit-lineto-after-moveto", "M10 10 20 20 30 10"),
    ("cubic-and-smooth", "M10 80 C40 10 65 10 95 80 S150 150 180 80"),
    ("relative-cubic-smooth", "m10 80 c30 -70 55 -70 85 0 s55 70 85 0"),
    ("quad-and-smooth", "M10 80 Q52.5 10 95 80 T180 80"),
    ("relative-quad-smooth", "m10 80 q42.5 -70 85 0 t85 0"),
    ("close-then-relative-move", "M10 10 L40 10 L40 40 Z m5 5 l10 0 l0 10 z"),
    ("exponent-and-signs", "M1e1 -2E+1 L3.5e-1.5 .5-.5"),
    ("compact-numbers", "M10-20L30.5.5-40-50"),
    ("whitespace-and-commas", "M 10 , 20\n\tL 30,40  50 ,60"),
    ("arc-basic", "M10 50 A40 30 0 0 1 90 50"),
    ("arc-large-sweep-variants", "M10 50 A40 30 0 1 0 90 50 A40 30 0 1 1 10 50 A40 30 0 0 0 90 50"),
    ("arc-rotation", "M20 60 A50 20 30 0 1 120 60 A50 20 -45 1 1 20 60"),
    ("arc-packed-flags", "M10 10 a5 5 0 1010 10 a5 5 0 0110 -10"),
    ("arc-zero-radius-is-line", "M10 10 A0 5 0 0 1 50 50"),
    ("arc-identical-endpoints-omitted", "M10 10 A5 5 0 0 1 10 10 L20 20"),
    ("arc-negative-radii", "M10 50 A-40 -30 0 0 1 90 50"),
    ("arc-radii-too-small-scaled", "M10 50 A5 5 0 0 1 190 50"),
    ("arc-relative", "m10 50 a40 30 0 0 1 80 0 a40 30 0 0 1 -80 0"),
    ("empty", ""),
    ("only-move", "M5 5"),
    ("lone-close", "Z"),
]

private func parseRow(_ id: String, _ d: String) -> J {
    let path = SVGPath(d)
    let commands: [J] = path.commands.map { command in
        J.obj([
            "type": .string(kindName(command.type)),
            "x": .double(Double(command.point.x)), "y": .double(Double(command.point.y)),
            "c1x": .double(Double(command.control1.x)), "c1y": .double(Double(command.control1.y)),
            "c2x": .double(Double(command.control2.x)), "c2y": .double(Double(command.control2.y)),
            "rx": .double(Double(command.rx)), "ry": .double(Double(command.ry)),
            "rotation": .double(Double(command.xAxisRotation)),
            "largeArc": .bool(command.largeArc), "sweep": .bool(command.sweep),
        ])
    }
    return J.obj(["id": .string(id), "d": .string(d), "commands": .array(commands)])
}

private func conversionJSON(_ conversion: SVGArcConverter.Conversion) -> J {
    switch conversion {
    case .omitted: return .obj(["kind": .string("omitted")])
    case .line: return .obj(["kind": .string("line")])
    case .cubic(let geometry):
        return .obj([
            "kind": .string("cubic"),
            "cx": .double(Double(geometry.center.x)), "cy": .double(Double(geometry.center.y)),
            "rx": .double(Double(geometry.rx)), "ry": .double(Double(geometry.ry)),
            "deltaAngle": .double(Double(geometry.deltaAngle)),
            "curves": .array(geometry.curves.map {
                .array([.double(Double($0.control1.x)), .double(Double($0.control1.y)), .double(Double($0.control2.x)), .double(Double($0.control2.y)), .double(Double($0.point.x)), .double(Double($0.point.y))])
            }),
        ])
    }
}

/// Parser output and arc-to-cubic conversion. Trigonometry goes through the platform libm, so
/// arc rows are compared with a tolerance on the TypeScript side rather than bit for bit.
func exportSvgPaths() -> J {
    var arcRows: [J] = []
    let arcInputs: [(String, (Double, Double), (Double, Double), Double, Double, Double, Bool, Bool)] = [
        ("quarter", (10, 50), (50, 10), 40, 40, 0, false, true),
        ("half-large", (10, 50), (90, 50), 40, 30, 0, true, false),
        ("half-sweep", (10, 50), (90, 50), 40, 30, 0, false, true),
        ("rotated-30", (20, 60), (120, 60), 50, 20, 30, false, true),
        ("rotated-minus-45-large", (20, 60), (120, 60), 50, 20, -45, true, true),
        ("rotation-360", (10, 50), (90, 50), 40, 30, 360, false, true),
        ("scaled-radii", (10, 50), (190, 50), 5, 5, 0, false, true),
        ("zero-rx", (10, 10), (50, 50), 0, 5, 0, false, true),
        ("same-point", (10, 10), (10, 10), 5, 5, 0, false, true),
        ("negative-radii", (10, 50), (90, 50), -40, -30, 0, false, true),
        ("nearly-full-circle", (50, 10), (49.999, 10), 40, 40, 0, true, true),
    ]
    for (id, start, end, rx, ry, rotation, large, sweep) in arcInputs {
        let conversion = SVGArcConverter.convert(
            from: CGPoint(x: start.0, y: start.1), to: CGPoint(x: end.0, y: end.1),
            rx: CGFloat(rx), ry: CGFloat(ry), xAxisRotation: CGFloat(rotation), largeArc: large, sweep: sweep)
        arcRows.append(J.obj([
            "id": .string(id),
            "input": .obj(["start": .array([.double(start.0), .double(start.1)]), "end": .array([.double(end.0), .double(end.1)]),
                           "rx": .double(rx), "ry": .double(ry), "rotation": .double(rotation), "largeArc": .bool(large), "sweep": .bool(sweep)]),
            "result": conversionJSON(conversion),
        ]))
    }
    return J.obj([
        "parse": .array(pathStrings.map { parseRow($0.0, $0.1) }),
        "arcConversion": .array(arcRows),
    ])
}
