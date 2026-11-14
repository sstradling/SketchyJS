export {
  stickerCenterlines,
  stickerCommands,
  commandsForLines,
  channels,
  clampStickerBacking,
  StickerOptionsError,
  asSeed,
} from "./builder.js";
export type { StickerDiagnostic, StickerReport } from "./builder.js";
export { stickerLayers } from "./layers.js";
export { paper, paperSeed, paperWidths, seedHalves } from "./paper.js";
export type { Centerline, StickerBuild, StickerCommand } from "./builder.js";
export { smoothEdge } from "./edges/smooth.js";
export { fullySmoothEdge } from "./edges/fully-smooth.js";
export { tornEdge } from "./edges/torn.js";
export { offsetClosed } from "./offset.js";
import { fullySmoothEdge } from "./edges/fully-smooth.js";
import { smoothEdge } from "./edges/smooth.js";
import { tornEdge } from "./edges/torn.js";
export {
  groupCommands,
  groupSilhouette,
  multiply,
  simplifyTornRing,
  TORN_SIMPLIFY_EPSILON,
} from "./group.js";
export type { GroupPart } from "./group.js";
export { combineSilhouettes } from "./union.js";
export type { SilhouetteRing } from "./union.js";

/** Built-in sticker edges. Register these to draw smooth, fully smooth, and torn sheets. */
export const builtinEdges = [smoothEdge, fullySmoothEdge, tornEdge] as const;
