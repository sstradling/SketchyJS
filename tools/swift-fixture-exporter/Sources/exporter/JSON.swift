import Foundation

/// Minimal deterministic JSON tree and writer.
///
/// Determinism rules (so manifests are reproducible byte for byte):
/// - object keys are written sorted;
/// - `Float` values use Swift's shortest round-trip description, so a JS reader gets the same
///   float after `Math.fround`;
/// - 64-bit integers that may exceed 2^53 are written as decimal strings via `.u64`;
/// - non-finite numbers are written as the strings "NaN", "Infinity", "-Infinity";
/// - no timestamps, hostnames, or absolute paths are ever written.
enum J {
    case null
    case bool(Bool)
    case int(Int)
    case u64(UInt64)
    case float(Float)
    case double(Double)
    case string(String)
    case array([J])
    case object([String: J])

    static func obj(_ pairs: KeyValuePairs<String, J>) -> J {
        var dict: [String: J] = [:]
        for (key, value) in pairs { dict[key] = value }
        return .object(dict)
    }

    static func floats(_ values: [Float]) -> J { .array(values.map { .float($0) }) }
}

extension J {
    func render(indent: Int = 0) -> String {
        let pad = String(repeating: "  ", count: indent)
        let inner = String(repeating: "  ", count: indent + 1)
        switch self {
        case .null: return "null"
        case .bool(let value): return value ? "true" : "false"
        case .int(let value): return String(value)
        case .u64(let value): return "\"\(value)\""
        case .float(let value):
            if value.isNaN { return "\"NaN\"" }
            if value.isInfinite { return value < 0 ? "\"-Infinity\"" : "\"Infinity\"" }
            return value.description
        case .double(let value):
            if value.isNaN { return "\"NaN\"" }
            if value.isInfinite { return value < 0 ? "\"-Infinity\"" : "\"Infinity\"" }
            return value.description
        case .string(let value): return Self.quote(value)
        case .array(let items):
            if items.isEmpty { return "[]" }
            if items.allSatisfy({ $0.isScalar }) && items.count <= 12 {
                return "[" + items.map { $0.render() }.joined(separator: ", ") + "]"
            }
            let body = items.map { inner + $0.render(indent: indent + 1) }.joined(separator: ",\n")
            return "[\n\(body)\n\(pad)]"
        case .object(let dict):
            if dict.isEmpty { return "{}" }
            if dict.count <= 6 && dict.values.allSatisfy({ $0.isScalar }) {
                return "{ " + dict.keys.sorted().map { "\(Self.quote($0)): \(dict[$0]!.render())" }.joined(separator: ", ") + " }"
            }
            let body = dict.keys.sorted().map { key in
                "\(inner)\(Self.quote(key)): \(dict[key]!.render(indent: indent + 1))"
            }.joined(separator: ",\n")
            return "{\n\(body)\n\(pad)}"
        }
    }

    private var isScalar: Bool {
        switch self {
        case .array, .object: return false
        default: return true
        }
    }

    private static func quote(_ text: String) -> String {
        var out = "\""
        for scalar in text.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

/// Writes `value` to `directory/relativePath` with a trailing newline, creating folders.
func write(_ value: J, to relativePath: String, in directory: String) throws {
    let url = URL(fileURLWithPath: directory).appendingPathComponent(relativePath)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try (value.render() + "\n").write(to: url, atomically: true, encoding: .utf8)
}
