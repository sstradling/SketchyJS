import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { fixtures } from "./fixtures.ts";
import { vertexCount } from "./geometry.ts";
import { measureSizes } from "./size.ts";
import type { CaseRequest, CaseResult } from "./worker.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const BACKENDS = ["clipper2-ts", "clipper2-wasm", "polygon-clipping"] as const;
const OPERATIONS = ["union", "offset-round", "offset-miter"] as const;
const TIMEOUT_MS = Number(process.env["BENCH_TIMEOUT_MS"] ?? 120_000);

type Outcome =
  | ({ status: "ok" } & CaseResult)
  | { status: "timeout"; timeoutMs: number }
  | { status: "error"; error: string };

/** Runs one case in a fresh worker so a slow backend can be terminated at the time limit. */
function runCase(request: CaseRequest): Promise<Outcome> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      workerData: request,
      execArgv: ["--import", "tsx"],
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ status: "timeout", timeoutMs: TIMEOUT_MS });
    }, TIMEOUT_MS);
    worker.once("message", (message: { ok: boolean; result?: CaseResult; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(
        message.ok && message.result
          ? { status: "ok", ...message.result }
          : { status: "error", error: message.error ?? "unknown" },
      );
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "error", error: String(error) });
    });
  });
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function packageInfo(name: string): { version: string; license: string; modified: string } {
  const pkg = JSON.parse(
    readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
  ) as { version: string; license: string };
  let modified = "unknown";
  try {
    modified = (
      JSON.parse(
        execFileSync("npm", ["view", name, "time.modified", "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      ) as string
    ).slice(0, 10);
  } catch {
    // Offline: leave unknown.
  }
  return { version: pkg.version, license: pkg.license, modified };
}

async function main(): Promise<void> {
  const rows: object[] = [];
  const table: string[][] = [];
  for (const fixture of fixtures()) {
    for (const operation of OPERATIONS) {
      for (const backend of BACKENDS) {
        const outcome = await runCase({ backend, fixture: fixture.id, operation });
        rows.push({
          fixture: fixture.id,
          operation,
          backend,
          ...outcome,
          ...(outcome.status === "ok"
            ? { medianMs: Number(median(outcome.timesMs).toFixed(2)) }
            : {}),
        });
        const cell =
          outcome.status === "ok"
            ? outcome.unsupported
              ? "unsupported"
              : `${median(outcome.timesMs).toFixed(1)} ms, ${outcome.vertices} v, ${outcome.holes} holes, ${outcome.selfIntersections} x${outcome.containsOriginal !== undefined && outcome.containsOriginal < 1 ? ", MISSES ORIGINAL" : ""}${outcome.deterministic ? "" : ", NONDETERMINISTIC"}`
            : outcome.status === "timeout"
              ? `timeout > ${TIMEOUT_MS / 1000}s`
              : `error: ${outcome.error.slice(0, 60)}`;
        table.push([fixture.id, operation, backend, cell]);
        console.log(
          `${fixture.id.padEnd(20)} ${operation.padEnd(13)} ${backend.padEnd(17)} ${cell}`,
        );
      }
    }
  }
  const sizes = await measureSizes(root);
  console.log("\nsizes (gzip bytes)");
  for (const size of sizes)
    console.log(`  ${size.backend.padEnd(17)} js ${size.jsGzip}  wasm ${size.wasmGzip}`);

  const results = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
      timeoutMs: TIMEOUT_MS,
    },
    packages: Object.fromEntries(
      BACKENDS.map((b) => [b, packageInfo(b === "clipper2-wasm" ? "clipper2-wasm" : b)]),
    ),
    fixtures: fixtures().map((f) => ({
      id: f.id,
      description: f.description,
      inputVertices: vertexCount(f.polygons),
      polygons: f.polygons.length,
      offset: f.offset,
    })),
    sizes,
    cases: rows,
  };
  const out = join(root, "results", "results.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nwrote ${out}`);
}

void main();
