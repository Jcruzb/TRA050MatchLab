export const PROJECT_DB_NAME = "TRA050_MATCHLAB_DB";
export const PROJECT_DB_VERSION = 1;

const STORES = {
  projects: "projects",
  chunks: "project_chunks",
  meta: "project_meta"
};

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Operacion IndexedDB fallida."));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaccion IndexedDB fallida."));
    tx.onabort = () => reject(tx.error || new Error("Transaccion IndexedDB cancelada."));
  });
}

export async function initProjectDb() {
  if (!("indexedDB" in window)) throw new Error("IndexedDB no esta disponible en este navegador.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.projects)) {
        db.createObjectStore(STORES.projects, { keyPath: "project_id" });
      }
      if (!db.objectStoreNames.contains(STORES.chunks)) {
        const chunks = db.createObjectStore(STORES.chunks, { keyPath: ["project_id", "dataset_type", "chunk_index"] });
        chunks.createIndex("by_project_dataset", ["project_id", "dataset_type"], { unique: false });
        chunks.createIndex("by_project", "project_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        const meta = db.createObjectStore(STORES.meta, { keyPath: ["project_id", "key"] });
        meta.createIndex("by_project", "project_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
  });
}

async function withDb(callback) {
  const db = await initProjectDb();
  try {
    return await callback(db);
  } catch (error) {
    throw new Error(error?.message || "Error al acceder al guardado progresivo.");
  } finally {
    db.close();
  }
}

export async function createLargeProject(projectMeta) {
  return withDb(async (db) => {
    const now = new Date().toISOString();
    const project = {
      project_id: projectMeta.project_id || `TRA050-LARGE-${Date.now()}`,
      project_name: projectMeta.project_name || "Proyecto TRA050 grande",
      created_at: projectMeta.created_at || now,
      updated_at: now,
      status: "processing",
      dataset_type: projectMeta.dataset_type || "mixed",
      total_rows: projectMeta.total_rows || 0,
      processed_rows: projectMeta.processed_rows || 0,
      chunk_size: projectMeta.chunk_size || 500,
      app_version: projectMeta.app_version || "0.1.0",
      schema_version: projectMeta.schema_version || "1.0.0",
      ...projectMeta
    };
    const tx = db.transaction(STORES.projects, "readwrite");
    tx.objectStore(STORES.projects).put(project);
    await txDone(tx);
    return project;
  });
}

export async function saveProjectChunk(projectId, datasetType, chunkIndex, records, meta = {}) {
  return withDb(async (db) => {
    const now = new Date().toISOString();
    const startRow = meta.start_row ?? meta.startRow ?? 0;
    const endRow = meta.end_row ?? meta.endRow ?? (startRow + records.length);
    const tx = db.transaction([STORES.chunks, STORES.projects], "readwrite");
    tx.objectStore(STORES.chunks).put({
      project_id: projectId,
      dataset_type: datasetType,
      chunk_index: chunkIndex,
      start_row: startRow,
      end_row: endRow,
      records,
      created_at: meta.created_at || now,
      updated_at: now,
      status: "processed"
    });
    const projects = tx.objectStore(STORES.projects);
    const project = await requestToPromise(projects.get(projectId));
    if (project && meta.update_project_progress !== false) {
      projects.put({
        ...project,
        updated_at: now,
        processed_rows: Math.max(project.processed_rows || 0, endRow),
        last_chunk_index: Math.max(project.last_chunk_index ?? -1, chunkIndex),
        status: project.status === "completed" ? project.status : "processing"
      });
    }
    await txDone(tx);
    return { project_id: projectId, dataset_type: datasetType, chunk_index: chunkIndex, saved_rows: records.length, updated_at: now };
  });
}

export async function updateProjectProgress(projectId, progress) {
  return withDb(async (db) => {
    const tx = db.transaction(STORES.projects, "readwrite");
    const store = tx.objectStore(STORES.projects);
    const project = await requestToPromise(store.get(projectId));
    if (!project) throw new Error("No se encontro el proyecto grande para actualizar progreso.");
    const updated = { ...project, ...progress, updated_at: new Date().toISOString() };
    store.put(updated);
    await txDone(tx);
    return updated;
  });
}

export async function getProjectMeta(projectId) {
  return withDb(async (db) => {
    const tx = db.transaction([STORES.projects, STORES.meta], "readonly");
    const project = await requestToPromise(tx.objectStore(STORES.projects).get(projectId));
    if (!project) return null;
    const metaIndex = tx.objectStore(STORES.meta).index("by_project");
    const entries = await requestToPromise(metaIndex.getAll(projectId));
    await txDone(tx);
    return {
      ...project,
      meta: Object.fromEntries(entries.map((entry) => [entry.key, entry.value]))
    };
  });
}

export async function setProjectMetaValue(projectId, key, value) {
  return withDb(async (db) => {
    const tx = db.transaction(STORES.meta, "readwrite");
    tx.objectStore(STORES.meta).put({ project_id: projectId, key, value, updated_at: new Date().toISOString() });
    await txDone(tx);
    return { project_id: projectId, key };
  });
}

export async function listRecoverableProjects() {
  return withDb(async (db) => {
    const tx = db.transaction(STORES.projects, "readonly");
    const all = await requestToPromise(tx.objectStore(STORES.projects).getAll());
    await txDone(tx);
    return all
      .filter((project) => ["processing", "error"].includes(project.status))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  });
}

export async function loadProjectChunks(projectId, datasetType) {
  return withDb(async (db) => {
    const tx = db.transaction(STORES.chunks, "readonly");
    const chunks = await requestToPromise(tx.objectStore(STORES.chunks).index("by_project_dataset").getAll([projectId, datasetType]));
    await txDone(tx);
    return chunks.sort((a, b) => a.chunk_index - b.chunk_index);
  });
}

export async function deleteLargeProject(projectId) {
  return withDb(async (db) => {
    const tx = db.transaction([STORES.projects, STORES.chunks, STORES.meta], "readwrite");
    tx.objectStore(STORES.projects).delete(projectId);
    const chunkStore = tx.objectStore(STORES.chunks);
    const chunks = await requestToPromise(chunkStore.index("by_project").getAllKeys(projectId));
    chunks.forEach((key) => chunkStore.delete(key));
    const metaStore = tx.objectStore(STORES.meta);
    const metaKeys = await requestToPromise(metaStore.index("by_project").getAllKeys(projectId));
    metaKeys.forEach((key) => metaStore.delete(key));
    await txDone(tx);
    return { project_id: projectId, deleted: true };
  });
}

export async function markProjectCompleted(projectId) {
  return updateProjectProgress(projectId, { status: "completed", completed_at: new Date().toISOString() });
}

export async function markProjectError(projectId, error) {
  return updateProjectProgress(projectId, {
    status: "error",
    error: {
      project_id: projectId,
      chunk_index: error?.chunk_index ?? null,
      stage: error?.stage || "processing",
      message: error?.message || "Error durante el guardado progresivo.",
      detail: error?.detail || "",
      created_at: new Date().toISOString()
    }
  });
}
