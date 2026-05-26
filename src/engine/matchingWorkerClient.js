import { matchRowsInChunks } from "../utils/matchEngine.js";

export async function runMatchingJob({ rows, indexes, learningRules, onProgress, signal }) {
  return matchRowsInChunks(rows, indexes, onProgress, signal, learningRules);
}
