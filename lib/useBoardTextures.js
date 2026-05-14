import { useMemo } from "react";
import { getBoardTextures } from "./boardTextures";

/**
 * Returns texture labels for the current board, recomputed only when board changes.
 * @param {Array<{rank: string, suit: string}>} board
 * @param {{ filter?: boolean }} options - filter=true removes textures implied by others
 * @returns {string[]}
 */
export function useBoardTextures(board, options) {
  return useMemo(() => getBoardTextures(board, options), [board, options]);
}
