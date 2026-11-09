import Foundation

/// Counts how many 64-bit values a standard-library random call consumes.
struct CountingRNG: RandomNumberGenerator {
    var base: SplitMix64
    var calls = 0
    init(seed: UInt64) { base = SplitMix64(seed: seed) }
    mutating func next() -> UInt64 {
        calls += 1
        return base.next()
    }
}

let rngSeeds: [UInt64] = [
    0, 1, 2, 7, 42, 99, 1234, 65_535, 0xDEAD_BEEF,
    0x9E37_79B9_7F4A_7C15, 0x7FFF_FFFF_FFFF_FFFF, 0x8000_0000_0000_0000, UInt64.max,
]

/// SplitMix64 raw outputs, plus seed-derivation arithmetic that the sticker builder uses.
func exportSplitMix64() -> J {
    let vectors: [J] = rngSeeds.map { seed in
        var rng = SplitMix64(seed: seed)
        return J.obj([
            "seed": .u64(seed),
            "values": .array((0..<32).map { _ in J.u64(rng.next()) }),
        ])
    }
    let derivations: [J] = [(UInt64(42), 3, UInt64(0x9E37_79B9_7F4A_7C15)), (UInt64.max, 5, UInt64(0xBF58_476D_1CE4_E5B9)), (0x9E37_79B9_7F4A_7C15, 2, 0x9E37_79B9)]
        .map { seed, k, multiplier in
            J.obj([
                "seed": .u64(seed), "index": .int(k), "multiplier": .u64(multiplier),
                "derived": .u64(seed &+ UInt64(k) &* multiplier),
            ])
        }
    return J.obj([
        "documented": .obj([
            "seed": .u64(42),
            "firstFour": .array([13_679_457_532_755_275_413, 2_949_826_092_126_892_291, 5_139_283_748_462_763_858, 6_349_198_060_258_255_764].map { J.u64($0) }),
            "source": .string("Tests/SketchyTests/Core/SeedDeterminismTests.swift testSplitMix64MatchesReferenceSequence"),
        ]),
        "vectors": .array(vectors),
        "seedDerivation": .array(derivations),
    ])
}

/// `RoughRandom.unit()` and the closed-range stdlib conversions Sketchy uses.
///
/// `Float.random(in: 0...1, using:)` draws `next(upperBound: 2^24 + 1)` with Lemire rejection,
/// so a draw can consume more than one 64-bit value. `consumed` records that.
@MainActor
func exportUnitFloat() -> J {
    var unitVectors: [J] = []
    for seed in rngSeeds.prefix(8) {
        let viaRough: [Float] = RoughRandom.with(seed: seed) { (0..<64).map { _ in RoughRandom.unit() } }
        var counting = CountingRNG(seed: seed)
        var draws: [J] = []
        for index in 0..<64 {
            let before = counting.calls
            let value = Float.random(in: 0...1, using: &counting)
            precondition(value == viaRough[index], "RoughRandom.unit disagrees with Float.random for seed \(seed)")
            draws.append(J.obj(["value": .float(value), "bits": .int(Int(value.bitPattern)), "consumed": .int(counting.calls - before)]))
        }
        unitVectors.append(J.obj(["seed": .u64(seed), "draws": .array(draws)]))
    }

    var rejectionSeeds: [J] = []
    var seed: UInt64 = 0
    while rejectionSeeds.count < 4 && seed < 200_000 {
        var counting = CountingRNG(seed: seed)
        let value = Float.random(in: 0...1, using: &counting)
        if counting.calls > 1 {
            rejectionSeeds.append(J.obj(["seed": .u64(seed), "value": .float(value), "bits": .int(Int(value.bitPattern)), "consumed": .int(counting.calls)]))
        }
        seed += 1
    }

    func floatRange(_ lo: Float, _ hi: Float) -> J {
        var rows: [J] = []
        for seed in [UInt64(42), 7, 0xDEAD_BEEF] {
            var counting = CountingRNG(seed: seed)
            var values: [J] = []
            for _ in 0..<32 {
                let before = counting.calls
                let value = Float.random(in: lo...hi, using: &counting)
                values.append(J.obj(["value": .float(value), "consumed": .int(counting.calls - before)]))
            }
            rows.append(J.obj(["seed": .u64(seed), "draws": .array(values)]))
        }
        return J.obj(["lower": .float(lo), "upper": .float(hi), "rows": .array(rows)])
    }

    func doubleRange(_ lo: Double, _ hi: Double) -> J {
        var rows: [J] = []
        for seed in [UInt64(42), 7, 0xDEAD_BEEF] {
            var counting = CountingRNG(seed: seed)
            var values: [J] = []
            for _ in 0..<32 {
                let before = counting.calls
                let value = Double.random(in: lo...hi, using: &counting)
                values.append(J.obj(["value": .double(value), "consumed": .int(counting.calls - before)]))
            }
            rows.append(J.obj(["seed": .u64(seed), "draws": .array(values)]))
        }
        return J.obj(["lower": .double(lo), "upper": .double(hi), "rows": .array(rows)])
    }

    var doubleRejection: [J] = []
    seed = 0
    while doubleRejection.count < 2 && seed < 2_000_000 {
        var counting = CountingRNG(seed: seed)
        let value = Double.random(in: 0...1, using: &counting)
        if counting.calls > 1 {
            doubleRejection.append(J.obj(["seed": .u64(seed), "value": .double(value), "consumed": .int(counting.calls)]))
        }
        seed += 1
    }

    return J.obj([
        "algorithm": .string("Float.random(in: lo...hi, using:) = delta * (Float(next(upperBound: 2^24 + 1)) / 2^24) + lo; Double uses 2^53 + 1"),
        "unit": .array(unitVectors),
        "rejectionSeedsFloat": .array(rejectionSeeds),
        "rejectionSeedsDouble": .array(doubleRejection),
        "floatRanges": .array([floatRange(0, 1), floatRange(-1, 1), floatRange(0.55, 1.35), floatRange(2, 5)]),
        "doubleRanges": .array([doubleRange(0, 1), doubleRange(-0.55, 0.55), doubleRange(0.55, 1.35), doubleRange(-1, 1)]),
    ])
}
