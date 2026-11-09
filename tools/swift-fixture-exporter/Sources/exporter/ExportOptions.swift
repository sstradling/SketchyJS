import Foundation
import UIKit

/// Generic reflection of a value into JSON. Used for default-value fixtures so a new stored
/// property in a future Sketchy release shows up in the diff instead of being missed.
func reflect(_ value: Any, depth: Int = 0) -> J {
    let mirror = Mirror(reflecting: value)
    if depth > 6 { return .string("<depth>") }
    switch value {
    case let v as Bool: return .bool(v)
    case let v as Int: return .int(v)
    case let v as UInt64: return .u64(v)
    case let v as Float: return .float(v)
    case let v as Double: return .double(v)
    case let v as CGFloat: return .double(Double(v))
    case let v as String: return .string(v)
    default: break
    }
    switch mirror.displayStyle {
    case .optional:
        if let child = mirror.children.first { return reflect(child.value, depth: depth + 1) }
        return .null
    case .enum:
        return .string(String(describing: value))
    case .collection, .set:
        return .array(mirror.children.map { reflect($0.value, depth: depth + 1) })
    case .struct, .class:
        var dict: [String: J] = [:]
        for child in mirror.children {
            guard let label = child.label else { continue }
            dict[label] = reflect(child.value, depth: depth + 1)
        }
        return .object(dict)
    case .tuple:
        return .array(mirror.children.map { reflect($0.value, depth: depth + 1) })
    default:
        return .string(String(describing: value))
    }
}

@MainActor
func exportDefaults() -> J {
    var backing = StickerBacking(width: 0)
    backing.texture = nil
    return J.obj([
        "options": reflect(Options()),
        "crayonStyle": reflect(CrayonStyle()),
        "watercolorStyle": reflect(WatercolorStyle()),
        "stickerTear": reflect(StickerTear()),
        "stickerTexturePaper": reflect(StickerTexture.paper()),
        "stickerShadow": reflect(StickerShadow()),
        "stickerBacking": reflect(backing),
        "animationConfig": reflect(AnimationConfig()),
        "brushProfileDefault": reflect(BrushProfile.default),
        "fillStyleRawValues": .object(Dictionary(uniqueKeysWithValues: [
            FillStyle.hachure, .solid, .zigzag, .crossHatch, .dots, .sunBurst, .starBurst, .dashed, .zigzagLine, .scribble, .watercolor,
        ].map { (String(describing: $0), J.string($0.rawValue)) })),
        "animation": .obj([
            "speedDurationSeconds": .object(["slow": .double(AnimationSpeed.slow.duration), "medium": .double(AnimationSpeed.medium.duration), "fast": .double(AnimationSpeed.fast.duration)]),
            "varianceFactor": .object(["veryLow": .float(AnimationVariance.veryLow.factor), "low": .float(AnimationVariance.low.factor), "medium": .float(AnimationVariance.medium.factor), "high": .float(AnimationVariance.high.factor)]),
        ]),
    ])
}

private let doubleInputs: [Double] = [-1000, -1, -0.5, 0, 0.1, 0.25, 0.35, 0.5, 1, 1.5, 2, 3, 3.5, 4, 5, 6, 11, 100, 1000, .nan, .infinity, -.infinity]
private let intInputs: [Int] = [-5, -1, 0, 1, 2, 3, 4, 5, 6, 100]

private func doubleOrString(_ value: Double) -> J { .double(value) }

/// One clamping rule: how an initializer maps one raw input to the stored value.
private func table(_ name: String, kind: String, inputs: [Double], _ resolve: (Double) -> J) -> J {
    J.obj([
        "param": .string(name),
        "kind": .string(kind),
        "rows": .array(inputs.map { J.obj(["input": doubleOrString($0), "stored": resolve($0)]) }),
    ])
}

private func intTable(_ name: String, _ resolve: (Int) -> J) -> J {
    J.obj([
        "param": .string(name),
        "kind": .string("int"),
        "rows": .array(intInputs.map { J.obj(["input": .int($0), "stored": resolve($0)]) }),
    ])
}

/// Stored values after each public initializer clamps its arguments. NaN rows pin down Swift's
/// `min`/`max` NaN behavior, which differs from `Math.min`/`Math.max`.
@MainActor
func exportClamps() -> J {
    func f(_ v: Double) -> Float { Float(v) }
    let crayon: [J] = [
        table("grain", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(grain: f($0)).grain) },
        table("edgeRoughness", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(edgeRoughness: f($0)).edgeRoughness) },
        table("widthVariation", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(widthVariation: f($0)).widthVariation) },
        table("opacityVariation", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(opacityVariation: f($0)).opacityVariation) },
        intTable("passes") { .int(CrayonStyle(passes: $0).passes) },
        table("baseOpacity", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(baseOpacity: f($0)).baseOpacity) },
        table("baseSoftness", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(baseSoftness: f($0)).baseSoftness) },
        table("grit", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(grit: f($0)).grit) },
        table("flakeSize", kind: "float", inputs: doubleInputs) { .float(CrayonStyle(flakeSize: f($0)).flakeSize) },
    ]
    let watercolor: [J] = [
        table("pigment", kind: "float", inputs: doubleInputs) { .float(WatercolorStyle(pigment: f($0)).pigment) },
        table("wetness", kind: "float", inputs: doubleInputs) { .float(WatercolorStyle(wetness: f($0)).wetness) },
        table("edgeDarkening", kind: "float", inputs: doubleInputs) { .float(WatercolorStyle(edgeDarkening: f($0)).edgeDarkening) },
        intTable("layers") { .int(WatercolorStyle(layers: $0).layers) },
        table("variation", kind: "float", inputs: doubleInputs) { .float(WatercolorStyle(variation: f($0)).variation) },
        table("bleed", kind: "float", inputs: doubleInputs) { .float(WatercolorStyle(bleed: f($0)).bleed) },
    ]
    let tear: [J] = [
        table("depth", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerTear(depth: CGFloat($0)).depth)) },
        table("length", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerTear(length: CGFloat($0)).length)) },
        table("jaggedness", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerTear(jaggedness: CGFloat($0)).jaggedness)) },
    ]
    let texture: [J] = [
        table("amount", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerTexture(amount: CGFloat($0)).amount)) },
        table("scale", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerTexture(scale: CGFloat($0)).scale)) },
    ]
    let shadow: [J] = [
        table("opacity", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerShadow(opacity: CGFloat($0)).opacity)) },
        table("radius", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerShadow(radius: CGFloat($0)).radius)) },
    ]
    let backing: [J] = [
        table("width", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerBacking(width: CGFloat($0)).width)) },
        table("smoothness", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerBacking(width: 1, smoothness: CGFloat($0)).smoothness)) },
        table("fullySmooth.radius", kind: "cgfloat", inputs: doubleInputs) { input in
            if case .fullySmooth(let radius) = StickerBacking(width: 1, edge: .fullySmooth(radius: CGFloat(input))).edge { return .double(Double(radius)) }
            return .null
        },
    ]
    let sampleImage: UIImage = {
        #if os(iOS)
        return UIGraphicsImageRenderer(size: CGSize(width: 100, height: 50)).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 50))
        }
        #else
        let image = UIImage()
        image.size = CGSize(width: 100, height: 50)
        return image
        #endif
    }()
    let image: [J] = [
        table("opacity", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerImage(image: sampleImage, opacity: CGFloat($0)).opacity)) },
        table("scale", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerImage(image: sampleImage, scale: CGFloat($0)).scale)) },
        table("resolvedTileWidth(imageWidth=100)", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerImage(image: sampleImage, scale: CGFloat($0)).resolvedTileWidth)) },
        table("resolvedFitScale", kind: "cgfloat", inputs: doubleInputs) { .double(Double(StickerImage(image: sampleImage, scale: CGFloat($0)).resolvedFitScale)) },
    ]
    let animation: [J] = [intTable("steps") { .int(AnimationConfig(steps: $0).steps) }]

    var derived: [J] = []
    for strokeWidth in [Float(0), 1, 2, 3, 8] {
        for fillWeight in [Float(-1), 0.5, 2] {
            for fillSpacing in [Float(0.1), 0.5, 4, 100, 250] {
                var options = Options()
                options.strokeWidth = strokeWidth
                options.fillWeight = fillWeight
                options.fillSpacing = fillSpacing
                derived.append(J.obj([
                    "strokeWidth": .float(strokeWidth), "fillWeight": .float(fillWeight), "fillSpacing": .float(fillSpacing),
                    "effectiveFillWeight": .float(options.effectiveFillWeight), "computedHachureGap": .float(options.computedHachureGap),
                ]))
            }
        }
    }

    return J.obj([
        "note": .string("NaN rows pin Swift min/max semantics: max(0, NaN) is 0 and min(1, NaN) is 1 (the first argument wins when the comparison is false)."),
        "crayonStyle": .array(crayon),
        "watercolorStyle": .array(watercolor),
        "stickerTear": .array(tear),
        "stickerTexture": .array(texture),
        "stickerShadow": .array(shadow),
        "stickerBacking": .array(backing),
        "stickerImage": .array(image),
        "animationConfig": .array(animation),
        "optionsDerived": .array(derived),
    ])
}
