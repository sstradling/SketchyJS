import type { Scene } from "@sketchy-js/types";
import { precomputeFrames, type VarianceConfig } from "./variance.js";

/** Clock and frame scheduler. Tests pass a fake; the browser uses `requestAnimationFrame`. */
export interface AnimationHost {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
}

/** A running loop. `resize` drops any in-flight frame and rebuilds from the new scene. */
export interface AnimationController {
  readonly frames: readonly Scene[];
  start(): void;
  stop(): void;
  resize(scene: Scene): void;
}

export interface AnimationOptions {
  /** Called with the scene for the frame that should be painted. */
  onFrame(scene: Scene, index: number): void;
  host?: AnimationHost;
  /** Milliseconds each frame is held. The speed presets are 600, 300, and 100. */
  frameMs?: number;
}

const browserHost = (): AnimationHost => ({
  requestFrame: (callback) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: (t: number) => void) => number })
      .requestAnimationFrame;
    if (!raf) throw new Error("createAnimation needs a host with requestFrame outside the browser");
    return raf(callback);
  },
  cancelFrame: (handle) => {
    const cancel = (globalThis as { cancelAnimationFrame?: (id: number) => void })
      .cancelAnimationFrame;
    cancel?.(handle);
  },
});

/**
 * Plays precomputed frames. `resize` bumps a generation counter and cancels the scheduled
 * callback before building the new frames, so a frame for the old size cannot paint.
 */
export function createAnimation(
  scene: Scene,
  config: VarianceConfig,
  options: AnimationOptions,
): AnimationController {
  const host = options.host ?? browserHost();
  let frames = precomputeFrames(scene, config);
  let running = false;
  let handle = 0;
  let generation = 0;
  let index = 0;
  const scheduled = { current: false };

  const tick = (token: number): void => {
    scheduled.current = false;
    if (!running || token !== generation) return;
    options.onFrame(frames[index]!, index);
    index = (index + 1) % frames.length;
    handle = host.requestFrame(() => tick(token));
    scheduled.current = true;
  };

  return {
    get frames() {
      return frames;
    },
    start() {
      if (running) return;
      running = true;
      const token = generation;
      handle = host.requestFrame(() => tick(token));
      scheduled.current = true;
    },
    stop() {
      running = false;
      generation += 1;
      if (scheduled.current) host.cancelFrame(handle);
      scheduled.current = false;
    },
    resize(next) {
      const token = ++generation;
      if (scheduled.current) host.cancelFrame(handle);
      scheduled.current = false;
      frames = precomputeFrames(next, config);
      index = 0;
      if (!running || token !== generation) return;
      handle = host.requestFrame(() => tick(token));
      scheduled.current = true;
    },
  };
}
