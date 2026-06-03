import { DATASET_CONFIG } from "../utils/datasets.js";
import { PROJECT_SESSION_APP, PROJECT_SESSION_APP_VERSION, PROJECT_SESSION_SCHEMA_VERSION, buildCompactVehicleRecord } from "../utils/projectSession.js";
import {
  createLargeProject,
  loadProjectChunks,
  markProjectCompleted,
  saveProjectChunk,
  setProjectMetaValue,
  updateProjectProgress
} from "./indexedDbProjectStore.js";

export const LARGE_PROJECT_ROW_THRESHOLD = 1000;
export const LARGE_PROJECT_FILE_SIZE_THRESHOLD_MB = 10;
export const DEFAULT_LARGE_PROJECT_CHUNK_SIZE = 500;

export function shouldUseLargeProjectMode({ totalRows = 0, fileSize = 0 } = {}) {
  return totalRows > LARGE_PROJECT_ROW_THRESHOLD || fileSize > LARGE_PROJECT_FILE_SIZE_THRESHOLD_MB * 1024 * 1024;
}

export function chunkSizeForTotalRows(totalRows) {
  return totalRows > 100000 ? 250 : DEFAULT_LARGE_PROJECT_CHUNK_SIZE;
}

export function datasetKeyFromType(datasetType) {
  return Object.values(DATASET_CONFIG).find((config) => config.type === datasetType)?.key || datasetType;
}

export function createLargeProjectId() {
  return `TRA050-LARGE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function startLargeProjectAutosave({ datasetType, totalRows, chunkSize, fileName = "" }) {
  const project = await createLargeProject({
    project_id: createLargeProjectId(),
    project_name: fileName || "Proyecto TRA050 grande",
    dataset_type: datasetType,
    total_rows: totalRows,
    processed_rows: 0,
    chunk_size: chunkSize,
    app_version: PROJECT_SESSION_APP_VERSION,
    schema_version: PROJECT_SESSION_SCHEMA_VERSION
  });
  await setProjectMetaValue(project.project_id, "source_file_name", fileName);
  await setProjectMetaValue(project.project_id, "large_project_notice_acknowledged", true);
  return project;
}

export async function saveProcessedVehicleChunk({ projectId, datasetType, chunkIndex, startRow, records }) {
  const compactRecords = records.map(buildCompactVehicleRecord);
  return saveProjectChunk(projectId, datasetType, chunkIndex, compactRecords, {
    start_row: startRow,
    end_row: startRow + records.length
  });
}

export async function saveSourceRowsChunk({ projectId, datasetType, chunkIndex, startRow, rows }) {
  return saveProjectChunk(projectId, `${datasetType}_source`, chunkIndex, rows, {
    start_row: startRow,
    end_row: startRow + rows.length,
    update_project_progress: false
  });
}

export async function updateAutosaveProgress(projectId, progress) {
  return updateProjectProgress(projectId, progress);
}

export async function completeAutosaveProject(projectId, extraMeta = {}) {
  for (const [key, value] of Object.entries(extraMeta)) {
    await setProjectMetaValue(projectId, key, value);
  }
  return markProjectCompleted(projectId);
}

export async function hydrateLargeProjectDataset(projectId, datasetType) {
  const chunks = await loadProjectChunks(projectId, datasetType);
  return chunks.flatMap((chunk) => chunk.records || []);
}

export async function hydrateLargeProjectSourceRows(projectId, datasetType) {
  const chunks = await loadProjectChunks(projectId, `${datasetType}_source`);
  return chunks.flatMap((chunk) => chunk.records || []);
}

async function downloadJsonlFallback(fileName, lines) {
  const blob = new Blob(lines, { type: "application/x-ndjson" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
  return { usedPicker: false, bytes: blob.size };
}

export async function exportLargeProjectSessionFromIndexedDb(projectId, options = {}) {
  const project = options.project || {};
  const fileName = options.fileName || `${projectId}.jsonl`;
  const datasetType = project.dataset_type || options.datasetType || "mixed";
  const datasetTypes = datasetType === "mixed" ? ["sold_thermal", "purchased_electric"] : [datasetType];
  const header = {
    section: "header",
    app: PROJECT_SESSION_APP,
    schema_version: PROJECT_SESSION_SCHEMA_VERSION,
    session_format: "TRA050 Large Session JSONL",
    project_id: projectId,
    project_name: project.project_name || "Proyecto TRA050 grande",
    app_version: PROJECT_SESSION_APP_VERSION,
    exported_at: new Date().toISOString()
  };
  const footer = { section: "footer", project_id: projectId, exported_at: new Date().toISOString() };

  if ("showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: "TRA050 Large Session JSONL", accept: { "application/x-ndjson": [".jsonl"] } }]
    });
    const writable = await handle.createWritable();
    let bytes = 0;
    const writeLine = async (value) => {
      const line = `${JSON.stringify(value)}\n`;
      bytes += line.length;
      await writable.write(line);
    };
    await writeLine(header);
    for (const type of datasetTypes) {
      const chunks = await loadProjectChunks(projectId, type);
      for (const chunk of chunks) {
        for (const record of chunk.records || []) {
          await writeLine({ section: type, record });
        }
      }
    }
    await writeLine(footer);
    await writable.close();
    return { usedPicker: true, bytes, format: "jsonl" };
  }

  const lines = [`${JSON.stringify(header)}\n`];
  for (const type of datasetTypes) {
    const chunks = await loadProjectChunks(projectId, type);
    chunks.forEach((chunk) => {
      (chunk.records || []).forEach((record) => lines.push(`${JSON.stringify({ section: type, record })}\n`));
    });
  }
  lines.push(`${JSON.stringify(footer)}\n`);
  const result = await downloadJsonlFallback(fileName, lines);
  return {
    ...result,
    format: "jsonl",
    warning: "Este navegador no permite escritura progresiva a archivo. Para proyectos muy grandes, se recomienda usar Chrome o Edge actualizado."
  };
}
