import UIKit
import CoreGraphics
enum OSSignpostType { case begin, end }
struct OSSignpostID { init(log: Any) {} }
enum RoughPerformanceLog { static let pathOps = 0; static let parsing = 0 }
enum PathOpsSignpost { static let scribbleFill = "", rayIntersection = "", duplicateRemoval = "" }
enum ParsingSignpost { static let svgParse = "" }
func os_signpost(_ t: OSSignpostType, log: Any, name: String, signpostID: OSSignpostID, _ fmt: String = "", _ args: Any...) {}
@discardableResult func measurePerformance<T>(_ name: String, log: Any, metadata: @autoclosure () -> String = "", _ body: () -> T) -> T { body() }
struct RoughColor: Equatable, Hashable, Sendable {
    private let uiColor: UIColor
    init(uiColor: UIColor) { self.uiColor = uiColor }
    var asUIColor: UIColor { uiColor }
    func toHex() -> String { "#000000" }
}
enum TextPathConverter {
    static func path(from string: String, font: UIFont) -> CGPath { CGPath() }
    static func path(from string: NSAttributedString) -> CGPath { CGPath() }
    static func pathSizeAndAscent(for string: String, font: UIFont) -> (CGPath, CGSize, CGFloat, CGPoint) { (CGPath(), .zero, 0, .zero) }
    static func pathSizeAndAscent(for string: NSAttributedString) -> (CGPath, CGSize, CGFloat, CGPoint) { (CGPath(), .zero, 0, .zero) }
}
