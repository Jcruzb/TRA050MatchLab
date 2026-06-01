import { DATASET_CONFIG, createEmptyDataset } from "./datasets.js";
import { groupConflictResults } from "./groupConflicts.js";

export const PROJECT_SESSION_SCHEMA_VERSION = "1.0.0";
export const PROJECT_SESSION_APP = "TRA050 MatchLab";
export const PROJECT_SESSION_APP_VERSION = "0.1.0";

function stampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function defaultProjectSessionFileName() {
  return `TRA050_MatchLab_sesion_${stampForFile()}.json`;
}

function compareVersions(a = "0.0.0", b = "0.0.0") {
  const left = String(a).split(".").map((part) => Number(part) || 0);
  const right = String(b).split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildDatasetSummary(dataset) {
  const results = normalizeArray(dataset?.matchResults);
  return {
    total: results.length,
    exactos: results.filter((item) => item.match_estado === "exacto").length,
    probables: results.filter((item) => item.match_estado === "probable").length,
    conflictos: results.filter((item) => item.match_estado === "conflicto").length,
    sinMatch: results.filter((item) => item.match_estado === "sin_match").length,
    noDb: results.filter((item) => item.vehiculo_no_encontrado_db || item.match_estado === "vehiculo_no_encontrado_en_db").length,
    emparejados: results.filter((item) => item.match_pair_id).length
  };
}

function ensureItemSessionFields(item, datasetType, index) {
  const input = { ...(item.input || {}) };
  const rowId = item.row_id || item.id || input.row_id || `${datasetType}-${index}`;
  const pairStatus = item.pair_status || input.pair_status || (item.match_pair_id || input.match_pair_id ? "paired" : "not_paired");
  return {
    ...item,
    id: item.id || rowId,
    row_id: rowId,
    dataset_type: item.dataset_type || input.dataset_type || datasetType,
    input: {
      ...input,
      row_id: input.row_id || rowId,
      dataset_type: input.dataset_type || datasetType,
      match_pair_id: input.match_pair_id || item.match_pair_id || null,
      pair_status: input.pair_status || pairStatus
    },
    match_pair_id: item.match_pair_id || input.match_pair_id || null,
    pair_status: pairStatus,
    pair_locked: Boolean(item.pair_locked || input.pair_locked),
    pair_manual_override: Boolean(item.pair_manual_override || input.pair_manual_override),
    vehiculo_no_encontrado_db: Boolean(item.vehiculo_no_encontrado_db),
    match_manual: Boolean(item.match_manual),
    manual_search_used: Boolean(item.manual_search_used),
    resolved_as_group: Boolean(item.resolved_as_group),
    tra050_reference_auto_selected: Boolean(item.tra050_reference_auto_selected),
    tra050_reference_manual_selected: Boolean(item.tra050_reference_manual_selected)
  };
}

function hydrateDataset(source, config) {
  const empty = createEmptyDataset(config);
  const dataset = { ...empty, ...(source || {}) };
  const matchResults = normalizeArray(dataset.matchResults).map((item, index) => ensureItemSessionFields(item, config.type, index));
  const normalizedRows = normalizeArray(dataset.normalizedRows).map((row, index) => ({
    ...row,
    row_id: row.row_id || `${config.type}-${index}`,
    dataset_type: row.dataset_type || config.type,
    match_pair_id: row.match_pair_id || null,
    pair_status: row.pair_status || "not_paired",
    pair_locked: Boolean(row.pair_locked),
    pair_manual_override: Boolean(row.pair_manual_override)
  }));
  return {
    ...dataset,
    label: dataset.label || config.label,
    type: dataset.type || config.type,
    rawRows: normalizeArray(dataset.rawRows),
    normalizedRows,
    matchResults,
    conflictGroups: normalizeArray(dataset.conflictGroups).length ? dataset.conflictGroups : groupConflictResults(matchResults),
    noDbReferences: normalizeArray(dataset.noDbReferences).length
      ? dataset.noDbReferences
      : matchResults.filter((item) => item.vehiculo_no_encontrado_db),
    summary: dataset.summary || buildDatasetSummary({ matchResults }),
    exportReady: Boolean(dataset.exportReady || matchResults.length)
  };
}

function hydratePairing(source) {
  const pairing = source || {};
  const pairs = normalizeArray(pairing.pairs).map((pair, index) => ({
    ...pair,
    match_pair_id: pair.match_pair_id || `PAIR_${String(index + 1).padStart(4, "0")}`,
    pair_status: pair.pair_status || (pair.pair_locked ? "locked" : "auto_paired"),
    pair_locked: Boolean(pair.pair_locked),
    pair_manual_override: Boolean(pair.pair_manual_override)
  }));
  return {
    pairs,
    unpairedSold: normalizeArray(pairing.unpairedSold),
    unpairedPurchased: normalizeArray(pairing.unpairedPurchased),
    candidates: normalizeArray(pairing.candidates),
    evaluatedCandidates: normalizeArray(pairing.evaluatedCandidates),
    warnings: normalizeArray(pairing.warnings),
    summary: pairing.summary || {
      pairs: pairs.length,
      unpairedSold: normalizeArray(pairing.unpairedSold).length,
      unpairedPurchased: normalizeArray(pairing.unpairedPurchased).length
    },
    integrity: pairing.integrity || null,
    pairingDiagnostics: pairing.pairingDiagnostics || {},
    annualMileageKm: pairing.annualMileageKm || "",
    updatedAt: pairing.updatedAt || null
  };
}

export function buildProjectSessionJson({ datasets, pairing, learningRules, settings = {} }) {
  const soldThermal = hydrateDataset(datasets?.soldThermal, DATASET_CONFIG.soldThermal);
  const purchasedElectric = hydrateDataset(datasets?.purchasedElectric, DATASET_CONFIG.purchasedElectric);
  return {
    app: PROJECT_SESSION_APP,
    schema_version: PROJECT_SESSION_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    project_id: `TRA050-${Date.now()}`,
    project_name: settings.projectName || "Proyecto TRA050",
    app_version: PROJECT_SESSION_APP_VERSION,
    soldThermal,
    purchasedElectric,
    pairing: hydratePairing(pairing),
    learningRules: normalizeArray(learningRules),
    settings: {
      annualMileageMode: settings.annualMileageMode || "",
      defaultAnnualMileage: settings.defaultAnnualMileage ?? null,
      filters: settings.filters || {},
      activeTab: settings.activeTab || "soldThermal"
    },
    tra050ReferenceTables: {
      included: false,
      note: "Las tablas normativas estan embebidas en la aplicacion. Este bloque conserva trazabilidad de la sesion exportada."
    }
  };
}

export function validateProjectSession(session) {
  if (!session || typeof session !== "object") throw new Error("El archivo seleccionado no parece ser una sesion valida de TRA050 MatchLab.");
  if (session.app !== PROJECT_SESSION_APP) throw new Error("El archivo seleccionado no parece ser una sesion valida de TRA050 MatchLab.");
  if (!session.soldThermal || !session.purchasedElectric) throw new Error("La sesion no contiene los datasets necesarios.");
  const version = session.schema_version || session.version || "0.0.0";
  const versionOrder = compareVersions(version, PROJECT_SESSION_SCHEMA_VERSION);
  return {
    version,
    isOlder: versionOrder < 0,
    isNewer: versionOrder > 0
  };
}

export function hydrateProjectSession(sessionJson) {
  const versionInfo = validateProjectSession(sessionJson);
  const learningRulesIncluded = Array.isArray(sessionJson.learningRules);
  return {
    datasets: {
      soldThermal: hydrateDataset(sessionJson.soldThermal, DATASET_CONFIG.soldThermal),
      purchasedElectric: hydrateDataset(sessionJson.purchasedElectric, DATASET_CONFIG.purchasedElectric)
    },
    pairing: hydratePairing(sessionJson.pairing),
    learningRules: normalizeArray(sessionJson.learningRules),
    learningRulesIncluded,
    settings: sessionJson.settings || {},
    warnings: [
      versionInfo.isOlder ? `Sesion migrada desde schema ${versionInfo.version}.` : "",
      versionInfo.isNewer ? "Esta sesion fue creada con una version mas reciente de TRA050 MatchLab. Puede que no sea totalmente compatible." : ""
    ].filter(Boolean)
  };
}

export async function loadProjectSession(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("El archivo seleccionado no parece ser una sesion valida de TRA050 MatchLab.");
  }
  return hydrateProjectSession(parsed);
}

export async function saveProjectSession(session, fileName = defaultProjectSessionFileName()) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  if ("showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: "Sesion TRA050 MatchLab", accept: { "application/json": [".json"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { usedPicker: true };
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
  return { usedPicker: false };
}
