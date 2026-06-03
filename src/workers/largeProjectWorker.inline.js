export function createLargeProjectWorkerUnsupportedNotice() {
  return "TRA050 MatchLab procesa proyectos grandes por chunks asincronos y guarda cada bloque en IndexedDB. Este worker inline queda preparado para mover el matching completo fuera del hilo principal en una iteracion posterior.";
}

export const LARGE_PROJECT_WORKER_EVENTS = {
  start: "START_LARGE_PROJECT_PROCESSING",
  processChunk: "PROCESS_CHUNK",
  cancel: "CANCEL",
  progress: "PROGRESS",
  chunkReady: "CHUNK_READY",
  done: "DONE",
  error: "ERROR",
  cancelled: "CANCELLED"
};
