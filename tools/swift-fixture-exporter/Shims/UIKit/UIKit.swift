@_exported import CoreGraphics
public final class UIColor: Sendable, Equatable, Hashable {
    public let r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat
    public init(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) { r = red; g = green; b = blue; a = alpha }
    public convenience init(hex: String) { self.init(red: 0, green: 0, blue: 0, alpha: 1) }
    public static let black = UIColor(red: 0, green: 0, blue: 0, alpha: 1)
    public static let white = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
    public static let clear = UIColor(red: 0, green: 0, blue: 0, alpha: 0)
    public static func == (l: UIColor, r: UIColor) -> Bool { l.r == r.r && l.g == r.g && l.b == r.b && l.a == r.a }
    public func hash(into h: inout Hasher) { h.combine(r); h.combine(g); h.combine(b); h.combine(a) }
}
public final class UIFont: @unchecked Sendable { public init() {} }
public final class UIImage: Equatable, Hashable, @unchecked Sendable {
    public var size: CGSize = .zero
    public init() {}
    public init?(data: Data) { return nil }
    public func pngData() -> Data? { nil }
    public static func == (l: UIImage, r: UIImage) -> Bool { l === r }
    public func hash(into h: inout Hasher) { h.combine(ObjectIdentifier(self)) }
}
public final class UIBezierPath {
    public let mutable = CGMutablePath()
    public var cgPath: CGPath { mutable }
    public init() {}
    public init(ovalIn r: CGRect) {}
    public func move(to p: CGPoint) { mutable.move(to: p) }
    public func addLine(to p: CGPoint) { mutable.addLine(to: p) }
    public func addQuadCurve(to p: CGPoint, controlPoint c: CGPoint) { mutable.addQuadCurve(to: p, control: c) }
    public func addCurve(to p: CGPoint, controlPoint1 a: CGPoint, controlPoint2 b: CGPoint) { mutable.addCurve(to: p, control1: a, control2: b) }
    public func close() { mutable.closeSubpath() }
}

public extension UIColor { convenience init(_ c: Any) { self.init(red: 0, green: 0, blue: 0, alpha: 1) } }
