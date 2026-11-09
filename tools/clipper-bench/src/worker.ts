import { parentPort, workerData } from "node:worker_threads";
import {
  clipper2Ts,
  clipper2Wasm,
  polygonClippingBackend,
  type ClipBackend,
  type JoinStyle,
} from "./candidates.ts";
import { fixtures } from "./fixtures.ts";
import {
  containsPoint,
  holeCount,
  multiArea,
  selfIntersections,
  vertexCount,
  type MultiPolygon,
} from "./geometry.ts";

export interface CaseRequest {
  backend: string;
  fixture: string;
  operation: "union" | "offset-round" | "offset-miter";
}

export interface CaseResult {
  unsupported?: true;
  timesMs: number[];
  rings: number;
  holes: number;
  vertices: number;
  area: number;
  selfIntersections: number;
  deterministic: boolean;
  /** Offset only: share of original outer-ring vertices that lie inside the result. */
  containsOriginal?: number;
}

async function makeBackend(id: string): Promise<ClipBackend> {
  if (id === "clipper2-ts") return clipper2Ts();
  if (id === "clipper2-wasm") return clipper2Wasm();
  return polygonClippingBackend();
}

function run(
  backend: ClipBackend,
  request: CaseRequest,
  input: MultiPolygon,
  offset: number,
): MultiPolygon | null {
  if (request.operation === "union") return backend.union(input);
  const join: JoinStyle = request.operation === "offset-round" ? "round" : "miter";
  return backend.offset(input, offset, join);
}

async function main(): Promise<CaseResult> {
  const request = workerData as CaseRequest;
  const fixture = fixtures().find((f) => f.id === request.fixture);
  if (!fixture) throw new Error(`unknown fixture ${request.fixture}`);
  const backend = await makeBackend(request.backend);
  const first = run(backend, request, fixture.polygons, fixture.offset);
  if (first === null)
    return {
      unsupported: true,
      timesMs: [],
      rings: 0,
      holes: 0,
      vertices: 0,
      area: 0,
      selfIntersections: 0,
      deterministic: true,
    };

  const times: number[] = [];
  let last = first;
  let budget = 5;
  for (let i = 0; i < budget; i++) {
    const start = performance.now();
    last = run(backend, request, fixture.polygons, fixture.offset) ?? first;
    const elapsed = performance.now() - start;
    times.push(elapsed);
    if (elapsed > 3000) budget = Math.min(budget, 2);
  }
  const result: CaseResult = {
    timesMs: times,
    rings: last.reduce((n, polygon) => n + polygon.length, 0),
    holes: holeCount(last),
    vertices: vertexCount(last),
    area: multiArea(last),
    selfIntersections: selfIntersections(last),
    deterministic: JSON.stringify(first) === JSON.stringify(last),
  };
  if (request.operation !== "union") {
    const probes = fixture.polygons.flatMap((polygon) => polygon[0] ?? []);
    result.containsOriginal =
      probes.filter((point) => containsPoint(last, point)).length / probes.length;
  }
  backend.dispose?.();
  return result;
}

main().then(
  (result) => parentPort?.postMessage({ ok: true, result }),
  (error: unknown) => parentPort?.postMessage({ ok: false, error: String(error) }),
);
