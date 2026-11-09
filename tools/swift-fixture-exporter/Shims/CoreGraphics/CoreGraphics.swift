@_exported import Foundation
public enum CGPathElementType: Int32, Sendable { case moveToPoint, addLineToPoint, addQuadCurveToPoint, addCurveToPoint, closeSubpath }
public struct CGPathElement { public var type: CGPathElementType; public var points: UnsafeMutablePointer<CGPoint> }
public class CGPath {
    public var elements: [(CGPathElementType, [CGPoint])] = []
    public init() {}
    public init(rect: CGRect, transform: UnsafePointer<CGAffineTransform>?) {
        elements = [(.moveToPoint,[CGPoint(x: rect.minX,y: rect.minY)]),(.addLineToPoint,[CGPoint(x: rect.maxX,y: rect.minY)]),(.addLineToPoint,[CGPoint(x: rect.maxX,y: rect.maxY)]),(.addLineToPoint,[CGPoint(x: rect.minX,y: rect.maxY)]),(.closeSubpath,[])]
    }
    public var isEmpty: Bool { elements.isEmpty }
    public var boundingBox: CGRect {
        let pts = elements.flatMap { $0.1 }
        guard let f = pts.first else { return .null }
        var minX = f.x, maxX = f.x, minY = f.y, maxY = f.y
        for p in pts { minX = min(minX,p.x); maxX = max(maxX,p.x); minY = min(minY,p.y); maxY = max(maxY,p.y) }
        return CGRect(x: minX, y: minY, width: maxX-minX, height: maxY-minY)
    }
    public func applyWithBlock(_ block: @escaping (UnsafePointer<CGPathElement>) -> Void) {
        for e in elements {
            var pts = e.1
            pts.withUnsafeMutableBufferPointer { buf in
                var el = CGPathElement(type: e.0, points: buf.baseAddress ?? UnsafeMutablePointer<CGPoint>.allocate(capacity: 1))
                withUnsafePointer(to: &el) { block($0) }
            }
        }
    }
    public func copy() -> CGPath { let c = CGPath(); c.elements = elements; return c }
}
public final class CGMutablePath: CGPath {
    public override init() { super.init() }
    public func move(to p: CGPoint) { elements.append((.moveToPoint,[p])) }
    public func addLine(to p: CGPoint) { elements.append((.addLineToPoint,[p])) }
    public func addQuadCurve(to p: CGPoint, control c: CGPoint) { elements.append((.addQuadCurveToPoint,[c,p])) }
    public func addCurve(to p: CGPoint, control1 c1: CGPoint, control2 c2: CGPoint) { elements.append((.addCurveToPoint,[c1,c2,p])) }
    public func closeSubpath() { elements.append((.closeSubpath,[])) }
}
public extension CGPath { func mutableCopy() -> CGMutablePath { let m = CGMutablePath(); m.elements = elements; return m } }
public struct CGAffineTransform: Equatable, Sendable {
    public var a: CGFloat, b: CGFloat, c: CGFloat, d: CGFloat, tx: CGFloat, ty: CGFloat
    public init(a: CGFloat, b: CGFloat, c: CGFloat, d: CGFloat, tx: CGFloat, ty: CGFloat) { self.a=a;self.b=b;self.c=c;self.d=d;self.tx=tx;self.ty=ty }
    public init() { self.init(a:1,b:0,c:0,d:1,tx:0,ty:0) }
    public static let identity = CGAffineTransform()
    public init(translationX x: CGFloat, y: CGFloat) { self.init(a:1,b:0,c:0,d:1,tx:x,ty:y) }
    public init(scaleX x: CGFloat, y: CGFloat) { self.init(a:x,b:0,c:0,d:y,tx:0,ty:0) }
    public init(rotationAngle r: CGFloat) { self.init(a:cos(r),b:sin(r),c:-sin(r),d:cos(r),tx:0,ty:0) }
}
public enum CGLineCap: Int32, Sendable { case butt, round, square }
public enum CGLineJoin: Int32, Sendable { case miter, round, bevel }

public struct CGVector: Equatable, Sendable { public var dx: CGFloat; public var dy: CGFloat; public init(dx: CGFloat, dy: CGFloat) { self.dx = dx; self.dy = dy } }
public extension CGAffineTransform {
    func translatedBy(x: CGFloat, y: CGFloat) -> CGAffineTransform { CGAffineTransform(a: a, b: b, c: c, d: d, tx: tx + a*x + c*y, ty: ty + b*x + d*y) }
    func scaledBy(x sx: CGFloat, y sy: CGFloat) -> CGAffineTransform { CGAffineTransform(a: a*sx, b: b*sx, c: c*sy, d: d*sy, tx: tx, ty: ty) }
    func concatenating(_ t: CGAffineTransform) -> CGAffineTransform { CGAffineTransform(a: a*t.a + b*t.c, b: a*t.b + b*t.d, c: c*t.a + d*t.c, d: c*t.b + d*t.d, tx: tx*t.a + ty*t.c + t.tx, ty: tx*t.b + ty*t.d + t.ty) }
}

public extension CGPath {
    func copy(using t: UnsafePointer<CGAffineTransform>?) -> CGPath? {
        let tr = t?.pointee ?? .identity
        let c = CGPath()
        c.elements = elements.map { ($0.0, $0.1.map { CGPoint(x: tr.a*$0.x + tr.c*$0.y + tr.tx, y: tr.b*$0.x + tr.d*$0.y + tr.ty) }) }
        return c
    }
}
