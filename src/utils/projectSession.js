import { DATASET_CONFIG, createEmptyDataset } from "./datasets.js";
import { groupConflictResults } from "./groupConflicts.js";

export const PROJECT_SESSION_SCHEMA_VERSION = "1.0.0";
export const PROJECT_SESSION_APP = "TRA050 MatchLab";
export const PROJECT_SESSION_APP_VERSION = "0.1.0";
export const LARGE_PROJECT_VEHICLE_THRESHOLD = 1_000;

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

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function vehicleCount(datasets = {}) {
  return (datasets.soldThermal?.matchResults?.length || 0) + (datasets.purchasedElectric?.matchResults?.length || 0);
}

function abortIfRequested(signal) {
  if (!signal?.cancelled) return;
  throw new DOMException("Exportacion cancelada por el usuario.", "AbortError");
}

function compactAssigned(candidate) {
  if (!candidate?.id_idae) return null;
  return {
    id_idae: candidate.id_idae,
    modeloOriginal: candidate.modeloOriginal,
    modelo_tabla: candidate.raw?.modelo_tabla || candidate.modeloOriginal,
    titulo_modal: candidate.raw?.titulo_modal || "",
    source_url: candidate.source_url || candidate.raw?.source_url || "",
    marcaDetectada: candidate.marcaDetectada || "",
    modelBase: candidate.modelBase || "",
    cilindradaCc: candidate.cilindradaCc ?? null,
    potenciaCv: candidate.potenciaCv ?? null,
    potenciaTermicaKw: candidate.potenciaTermicaKw ?? null,
    potenciaElectricaKw: candidate.potenciaElectricaKw ?? null,
    emisionesWltpGco2Km: candidate.emisionesWltpGco2Km ?? null,
    motorizacion: candidate.motorizacion || "",
    tipoCambio: candidate.tipoCambio || "",
    segmento: candidate.segmento || "",
    consumoElectricoKwh100: candidate.consumoElectricoKwh100 ?? null,
    consumoLitros100: candidate.consumoLitros100 ?? null
  };
}

export function buildCompactVehicleRecord(vehicle = {}) {
  const input = vehicle.input || vehicle;
  const assigned = vehicle.assigned || {};
  return {
    dataset_type: vehicle.dataset_type || input.dataset_type || "",
    row_id: vehicle.row_id || vehicle.id || input.row_id || "",
    id: vehicle.id || vehicle.row_id || input.row_id || "",
    source_row_index: vehicle.source_row_index || input.source_row_index || vehicle.rowIndex || null,
    matricula: input.matricula || input.Matricula_Nuevo || vehicle.matricula || "",
    categoria: input.categoria || input.Categoria_nuevo || vehicle.categoria || "",
    marca_modelo: input.marca_modelo || input.Marca_modelo_Nuevo || vehicle.marca_modelo || "",
    fecha_matriculacion: input.fecha_matriculacion || input.Matriculacion_Nuevo || "",
    fecha_operacion: input.fecha_operacion || input["Fecha Compra"] || "",
    fecha_operacion_tipo: input.fecha_operacion_tipo || vehicle.fecha_operacion_tipo || "",
    cilindrada_cc: input.cilindrada_cc ?? vehicle.cilindrada_cc ?? null,
    potencia_termica_kw: input.potencia_termica_kw ?? vehicle.potencia_termica_kw ?? null,
    potencia_cv_calculada: input.potencia_cv_calculada ?? vehicle.potencia_cv_calculada ?? null,
    potencia_cv_conversion_factor: input.potencia_cv_conversion_factor ?? vehicle.potencia_cv_conversion_factor ?? null,
    potencia_origen: input.potencia_origen || vehicle.potencia_origen || "",
    emisiones_wltp_gco2_km: input.emisiones_wltp_gco2_km_num ?? input.emisiones_wltp_gco2_km ?? vehicle.emisiones_wltp_gco2_km ?? null,
    combustible_motorizacion: input.combustible_motorizacion || input.Combustible_Motorizacion_Nuevo || "",
    tipo_cambio: input.tipo_cambio || input.Tipo_Cambio_Nuevo || "",
    carroceria: input.carroceria || input.Carroceria_Nuevo || "",
    version_acabado: input.version_acabado || input.Version_Acabado_Nuevo || "",
    anio_modelo_my: input.anio_modelo_my || input.Anio_Modelo_MY_Nuevo || "",
    observaciones: input.observaciones || input.Observaciones_Nuevo || "",
    match_estado: vehicle.match_estado || "",
    match_score: vehicle.match_score ?? 0,
    id_idae_asignado: assigned.id_idae || vehicle.id_idae_asignado || null,
    modelo_idae_asignado: assigned.modeloOriginal || vehicle.modelo_idae_asignado || "",
    vehiculo_no_encontrado_db: Boolean(vehicle.vehiculo_no_encontrado_db),
    consumo_origen: vehicle.consumo_origen || "",
    consumo_oficial_extraido: assigned.consumoElectricoKwh100 || assigned.consumoLitros100 || vehicle.consumo_oficial_extraido || "",
    consumo_referencia_tra050: vehicle.consumo_referencia_tra050 || vehicle.reference?.consumo || vehicle.reference?.consumo_kwh_100km || "",
    unidad_consumo: vehicle.unidad_consumo || vehicle.reference?.unidad || "",
    tipologia_referencia_tra050: vehicle.tipologia_referencia_tra050 || vehicle.reference?.tipologia || "",
    combustible_referencia_tra050: vehicle.combustible_referencia_tra050 || vehicle.reference?.combustible || "",
    reference: vehicle.reference || null,
    match_manual: Boolean(vehicle.match_manual),
    manual_search_used: Boolean(vehicle.manual_search_used),
    resolved_as_group: Boolean(vehicle.resolved_as_group),
    conflict_group_key: vehicle.conflict_group_key || vehicle.group_resolution_key || "",
    conflict_group_label: vehicle.conflict_group_label || "",
    conflict_group_size: vehicle.conflict_group_size || vehicle.group_vehicle_count || vehicle.total_vehicle_count || "",
    group_status: vehicle.group_status || "",
    group_resolution_mode: vehicle.group_resolution_mode || "",
    group_resolution_applied: Boolean(vehicle.group_resolution_applied),
    group_resolution_timestamp: vehicle.group_resolution_timestamp || null,
    resolved_vehicle_count: vehicle.resolved_vehicle_count ?? vehicle.group_resolved_count ?? null,
    total_vehicle_count: vehicle.total_vehicle_count ?? vehicle.group_vehicle_count ?? null,
    explicacion_match: vehicle.explicacion_match || "",
    no_db_justification: vehicle.no_db_justification || null,
    no_db_reason_text: vehicle.no_db_reason_text || "",
    no_db_technical_basis: vehicle.no_db_technical_basis || null,
    compared_candidates: vehicle.compared_candidates || [],
    technical_comparison: vehicle.technical_comparison || null,
    match_pair_id: vehicle.match_pair_id || null,
    pair_status: vehicle.pair_status || "not_paired",
    pair_locked: Boolean(vehicle.pair_locked),
    pair_manual_override: Boolean(vehicle.pair_manual_override),
    review_status: vehicle.review_status || "pending_review",
    review_notes: vehicle.review_notes || "",
    reviewed_at: vehicle.reviewed_at || null,
    reviewed_by: vehicle.reviewed_by || null,
    review_locked: Boolean(vehicle.review_locked),
    last_review_action: vehicle.last_review_action || "",
    selection_source: vehicle.selection_source || "",
    comparison_matrix_used: Boolean(vehicle.comparison_matrix_used),
    comparison_candidate_ids: vehicle.comparison_candidate_ids || []
  };
}

function buildIdaeSelectionIndex(datasets = {}) {
  const index = {};
  [...(datasets.soldThermal?.matchResults || []), ...(datasets.purchasedElectric?.matchResults || [])].forEach((vehicle) => {
    const compact = compactAssigned(vehicle.assigned);
    if (compact?.id_idae && !index[compact.id_idae]) index[compact.id_idae] = compact;
  });
  return index;
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

function ensureItemSessionFields(item, datasetType, index, idaeSelectionIndex = {}) {
  const input = { ...(item.input || {}) };
  const rowId = item.row_id || item.id || input.row_id || `${datasetType}-${index}`;
  const pairStatus = item.pair_status || input.pair_status || (item.match_pair_id || input.match_pair_id ? "paired" : "not_paired");
  const assigned = item.assigned || idaeSelectionIndex[item.id_idae_asignado] || null;
  const compactInput = {
    matricula: item.matricula,
    Matricula_Nuevo: item.matricula,
    categoria: item.categoria,
    Categoria_nuevo: item.categoria,
    marca_modelo: item.marca_modelo,
    Marca_modelo_Nuevo: item.marca_modelo,
    fecha_matriculacion: item.fecha_matriculacion,
    Matriculacion_Nuevo: item.fecha_matriculacion,
    fecha_operacion: item.fecha_operacion,
    "Fecha Compra": item.fecha_operacion,
    cilindrada_cc: item.cilindrada_cc,
    Cilindrada_Nuevo: item.cilindrada_cc,
    potencia_termica_kw: item.potencia_termica_kw,
    Potencia_Termica_kW_Nuevo: item.potencia_termica_kw,
    potencia_cv_calculada: item.potencia_cv_calculada,
    potencia_cv_conversion_factor: item.potencia_cv_conversion_factor,
    emisiones_wltp_gco2_km: item.emisiones_wltp_gco2_km,
    Emisiones_WLTP_gCO2km_Nuevo: item.emisiones_wltp_gco2_km,
    combustible_motorizacion: item.combustible_motorizacion,
    Combustible_Motorizacion_Nuevo: item.combustible_motorizacion,
    tipo_cambio: item.tipo_cambio,
    Tipo_Cambio_Nuevo: item.tipo_cambio,
    carroceria: item.carroceria,
    Carroceria_Nuevo: item.carroceria,
    version_acabado: item.version_acabado,
    Version_Acabado_Nuevo: item.version_acabado,
    anio_modelo_my: item.anio_modelo_my,
    Anio_Modelo_MY_Nuevo: item.anio_modelo_my,
    observaciones: item.observaciones,
    Observaciones_Nuevo: item.observaciones
  };
  const hydratedInput = Object.fromEntries(Object.entries(compactInput).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  return {
    ...item,
    assigned,
    id: item.id || rowId,
    row_id: rowId,
    dataset_type: item.dataset_type || input.dataset_type || datasetType,
    input: {
      ...hydratedInput,
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
    review_status: item.review_status || "pending_review",
    review_notes: item.review_notes || "",
    reviewed_at: item.reviewed_at || null,
    reviewed_by: item.reviewed_by || null,
    review_locked: Boolean(item.review_locked),
    group_status: item.group_status || "",
    group_resolution_mode: item.group_resolution_mode || "",
    group_resolution_applied: Boolean(item.group_resolution_applied),
    group_resolution_timestamp: item.group_resolution_timestamp || null,
    resolved_vehicle_count: item.resolved_vehicle_count ?? item.group_resolved_count ?? null,
    total_vehicle_count: item.total_vehicle_count ?? item.group_vehicle_count ?? null,
    tra050_reference_auto_selected: Boolean(item.tra050_reference_auto_selected),
    tra050_reference_manual_selected: Boolean(item.tra050_reference_manual_selected)
  };
}

function hydrateDataset(source, config, idaeSelectionIndex = {}) {
  const empty = createEmptyDataset(config);
  const dataset = { ...empty, ...(source || {}) };
  const sourceResults = normalizeArray(dataset.matchResults).length ? dataset.matchResults : normalizeArray(dataset.records);
  const matchResults = normalizeArray(sourceResults).map((item, index) => ensureItemSessionFields(item, config.type, index, idaeSelectionIndex));
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
    pair_manual_override: Boolean(pair.pair_manual_override),
    pair_review_status: pair.pair_review_status || "pending_review",
    pair_review_notes: pair.pair_review_notes || "",
    pair_reviewed_at: pair.pair_reviewed_at || null,
    pair_review_locked: Boolean(pair.pair_review_locked)
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

function compactPairing(pairing) {
  const hydrated = hydratePairing(pairing);
  return {
    ...hydrated,
    pairs: hydrated.pairs.map(compactPair),
    unpairedSold: hydrated.unpairedSold.map(buildCompactVehicleRecord),
    unpairedPurchased: hydrated.unpairedPurchased.map(buildCompactVehicleRecord),
    candidates: [],
    evaluatedCandidates: [],
    compact: true
  };
}

function compactPair(pair = {}) {
  const {
    sold,
    purchased,
    soldVehicle,
    purchasedVehicle,
    sold_item,
    purchased_item,
    vehicleSold,
    vehiclePurchased,
    candidates,
    evaluatedCandidates,
    ...rest
  } = pair;
  return {
    ...rest,
    sold: sold ? buildCompactVehicleRecord(sold) : undefined,
    purchased: purchased ? buildCompactVehicleRecord(purchased) : undefined,
    soldVehicle: soldVehicle ? buildCompactVehicleRecord(soldVehicle) : undefined,
    purchasedVehicle: purchasedVehicle ? buildCompactVehicleRecord(purchasedVehicle) : undefined,
    sold_item: sold_item ? buildCompactVehicleRecord(sold_item) : undefined,
    purchased_item: purchased_item ? buildCompactVehicleRecord(purchased_item) : undefined,
    vehicleSold: vehicleSold ? buildCompactVehicleRecord(vehicleSold) : undefined,
    vehiclePurchased: vehiclePurchased ? buildCompactVehicleRecord(vehiclePurchased) : undefined
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
    review_change_log: normalizeArray(settings.reviewChangeLog),
    idaeSelectionIndex: buildIdaeSelectionIndex(datasets),
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

function compactDataset(dataset, config) {
  const records = normalizeArray(dataset?.matchResults).map(buildCompactVehicleRecord);
  return {
    label: dataset?.label || config.label,
    type: config.type,
    compact: true,
    records,
    summary: dataset?.summary || buildDatasetSummary({ matchResults: dataset?.matchResults || [] }),
    exportReady: Boolean(dataset?.exportReady || records.length)
  };
}

export function buildCompactProjectSession({ datasets, pairing, learningRules, settings = {} }) {
  const totalVehicles = vehicleCount(datasets);
  const session = {
    app: PROJECT_SESSION_APP,
    schema_version: PROJECT_SESSION_SCHEMA_VERSION,
    session_format: "tra050-compact-json",
    compact_session: true,
    exported_at: new Date().toISOString(),
    project_id: settings.projectId || `TRA050-${Date.now()}`,
    project_name: settings.projectName || "Proyecto TRA050",
    app_version: PROJECT_SESSION_APP_VERSION,
    vehicle_count: totalVehicles,
    soldThermal: compactDataset(datasets?.soldThermal, DATASET_CONFIG.soldThermal),
    purchasedElectric: compactDataset(datasets?.purchasedElectric, DATASET_CONFIG.purchasedElectric),
    idaeSelectionIndex: buildIdaeSelectionIndex(datasets),
    pairing: compactPairing(pairing),
    review_change_log: normalizeArray(settings.reviewChangeLog),
    learningRules: normalizeArray(learningRules),
    settings: {
      annualMileageMode: settings.annualMileageMode || "",
      defaultAnnualMileage: settings.defaultAnnualMileage ?? null,
      filters: settings.filters || {},
      activeTab: settings.activeTab || "soldThermal"
    },
    tra050ReferenceTables: {
      included: false,
      note: "Las tablas normativas estan embebidas en la aplicacion; la sesion compacta guarda solo selecciones y trazabilidad."
    }
  };
  console.debug("[Session Export Size]", {
    soldRows: session.soldThermal.records.length,
    purchasedRows: session.purchasedElectric.records.length,
    pairs: session.pairing?.pairs?.length || 0,
    compact: true
  });
  return session;
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
  const idaeSelectionIndex = sessionJson.idaeSelectionIndex || {};
  return {
    datasets: {
      soldThermal: hydrateDataset(sessionJson.soldThermal, DATASET_CONFIG.soldThermal, idaeSelectionIndex),
      purchasedElectric: hydrateDataset(sessionJson.purchasedElectric, DATASET_CONFIG.purchasedElectric, idaeSelectionIndex)
    },
    pairing: hydratePairing(sessionJson.pairing),
    reviewChangeLog: normalizeArray(sessionJson.review_change_log || sessionJson.reviewChangeLog),
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

function isProjectState(value) {
  return Boolean(value?.datasets);
}

function createExportProgress(onProgress, totalItems) {
  const state = {
    processed: 0,
    total: Math.max(totalItems || 1, 1),
    lastNotified: 0
  };
  return (stage, processed = state.processed, force = false) => {
    state.processed = Math.min(processed, state.total);
    if (!force && state.processed - state.lastNotified < 250 && state.processed < state.total) return;
    state.lastNotified = state.processed;
    onProgress?.({
      stage,
      processed: state.processed,
      total: state.total,
      percent: Math.round((state.processed / state.total) * 100)
    });
  };
}

async function createSessionSink(fileName) {
  if ("showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: "Sesion TRA050 MatchLab", accept: { "application/json": [".json"] } }]
    });
    const writable = await handle.createWritable();
    let bytes = 0;
    return {
      usedPicker: true,
      async write(chunk) {
        bytes += chunk.length;
        await writable.write(chunk);
      },
      async close() {
        await writable.close();
      },
      async abort() {
        await writable.abort?.();
      },
      bytes() {
        return bytes;
      }
    };
  }
  const chunks = [];
  let bytes = 0;
  return {
    usedPicker: false,
    async write(chunk) {
      chunks.push(chunk);
      bytes += chunk.length;
    },
    async close() {
      const blob = new Blob(chunks, { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    async abort() {},
    bytes() {
      return bytes;
    }
  };
}

function compactDatasetHeader(dataset, config) {
  const records = normalizeArray(dataset?.matchResults);
  return {
    label: dataset?.label || config.label,
    type: config.type,
    compact: true,
    summary: dataset?.summary || buildDatasetSummary({ matchResults: records }),
    exportReady: Boolean(dataset?.exportReady || records.length)
  };
}

async function writeJsonArray(sink, items, mapItem, { signal, stage, progress, processedStart = 0 }) {
  await sink.write("[");
  let processed = processedStart;
  for (let index = 0; index < items.length; index += 1) {
    abortIfRequested(signal);
    if (index > 0) await sink.write(",");
    await sink.write(JSON.stringify(mapItem(items[index], index)));
    processed += 1;
    if (index % 250 === 0) {
      progress(stage, processed);
      await yieldToBrowser();
    }
  }
  await sink.write("]");
  progress(stage, processed, true);
  return processed;
}

async function writeDatasetSection(sink, fieldName, dataset, config, context) {
  const records = normalizeArray(dataset?.matchResults);
  const header = compactDatasetHeader(dataset, config);
  await sink.write(`${JSON.stringify(fieldName)}:{`);
  await sink.write(`${JSON.stringify("label")}:${JSON.stringify(header.label)},`);
  await sink.write(`${JSON.stringify("type")}:${JSON.stringify(header.type)},`);
  await sink.write(`${JSON.stringify("compact")}:true,`);
  await sink.write(`${JSON.stringify("summary")}:${JSON.stringify(header.summary)},`);
  await sink.write(`${JSON.stringify("exportReady")}:${JSON.stringify(header.exportReady)},`);
  await sink.write(`${JSON.stringify("records")}:`);
  context.processed = await writeJsonArray(sink, records, buildCompactVehicleRecord, {
    signal: context.signal,
    stage: context.stage,
    progress: context.progress,
    processedStart: context.processed
  });
  await sink.write("}");
}

async function writeIdaeSelectionIndexSection(sink, datasets, context) {
  await sink.write(`${JSON.stringify("idaeSelectionIndex")}:{`);
  const seen = new Set();
  const vehicles = [
    ...normalizeArray(datasets?.soldThermal?.matchResults),
    ...normalizeArray(datasets?.purchasedElectric?.matchResults)
  ];
  let written = 0;
  for (let index = 0; index < vehicles.length; index += 1) {
    abortIfRequested(context.signal);
    const compact = compactAssigned(vehicles[index]?.assigned);
    if (!compact?.id_idae || seen.has(compact.id_idae)) continue;
    if (written > 0) await sink.write(",");
    await sink.write(`${JSON.stringify(compact.id_idae)}:${JSON.stringify(compact)}`);
    seen.add(compact.id_idae);
    written += 1;
    if (index % 500 === 0) {
      context.progress("Guardando indice IDAE", context.processed);
      await yieldToBrowser();
    }
  }
  await sink.write("}");
}

function compactPairingBase(pairing) {
  const hydrated = hydratePairing(pairing);
  const { pairs, unpairedSold, unpairedPurchased, candidates, evaluatedCandidates, ...base } = hydrated;
  return {
    ...base,
    candidates: [],
    evaluatedCandidates: [],
    compact: true
  };
}

async function writePairingSection(sink, pairing, context) {
  const hydrated = hydratePairing(pairing);
  const base = compactPairingBase(pairing);
  await sink.write(`${JSON.stringify("pairing")}:{`);
  const baseEntries = Object.entries(base);
  for (let index = 0; index < baseEntries.length; index += 1) {
    const [key, value] = baseEntries[index];
    if (index > 0) await sink.write(",");
    await sink.write(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
  }
  await sink.write(`,${JSON.stringify("pairs")}:`);
  context.processed = await writeJsonArray(sink, hydrated.pairs, compactPair, {
    signal: context.signal,
    stage: "Guardando parejas TRA050",
    progress: context.progress,
    processedStart: context.processed
  });
  await sink.write(`,${JSON.stringify("unpairedSold")}:`);
  context.processed = await writeJsonArray(sink, hydrated.unpairedSold, buildCompactVehicleRecord, {
    signal: context.signal,
    stage: "Guardando sobrantes vendidos",
    progress: context.progress,
    processedStart: context.processed
  });
  await sink.write(`,${JSON.stringify("unpairedPurchased")}:`);
  context.processed = await writeJsonArray(sink, hydrated.unpairedPurchased, buildCompactVehicleRecord, {
    signal: context.signal,
    stage: "Guardando sobrantes comprados",
    progress: context.progress,
    processedStart: context.processed
  });
  await sink.write("}");
}

async function writeOptimizedProjectSession(projectState, fileName, options = {}) {
  const startedAt = performance.now();
  const { datasets, pairing, learningRules, settings = {} } = projectState;
  const totalVehicles = vehicleCount(datasets);
  const totalItems = totalVehicles
    + normalizeArray(pairing?.pairs).length
    + normalizeArray(pairing?.unpairedSold).length
    + normalizeArray(pairing?.unpairedPurchased).length;
  const progress = createExportProgress(options.onProgress, totalItems);
  const sink = await createSessionSink(fileName);
  const context = {
    processed: 0,
    signal: options.signal,
    progress,
    stage: "Guardando vehiculos"
  };
  try {
    progress("Preparando sesion compacta", 0, true);
    await sink.write("{");
    const writeField = async (name, value, needsComma = true) => {
      if (needsComma) await sink.write(",");
      await sink.write(`${JSON.stringify(name)}:${JSON.stringify(value)}`);
    };
    await sink.write(`${JSON.stringify("app")}:${JSON.stringify(PROJECT_SESSION_APP)}`);
    await writeField("schema_version", PROJECT_SESSION_SCHEMA_VERSION);
    await writeField("session_format", "tra050-compact-json");
    await writeField("compact_session", true);
    await writeField("exported_at", new Date().toISOString());
    await writeField("project_id", settings.projectId || `TRA050-${Date.now()}`);
    await writeField("project_name", settings.projectName || "Proyecto TRA050");
    await writeField("app_version", PROJECT_SESSION_APP_VERSION);
    await writeField("vehicle_count", totalVehicles);
    await sink.write(",");
    await writeDatasetSection(sink, "soldThermal", datasets?.soldThermal, DATASET_CONFIG.soldThermal, context);
    await sink.write(",");
    await writeDatasetSection(sink, "purchasedElectric", datasets?.purchasedElectric, DATASET_CONFIG.purchasedElectric, context);
    await sink.write(",");
    await writeIdaeSelectionIndexSection(sink, datasets, context);
    await sink.write(",");
    await writePairingSection(sink, pairing, context);
    await writeField("review_change_log", normalizeArray(settings.reviewChangeLog));
    await writeField("learningRules", normalizeArray(learningRules));
    await writeField("settings", {
      annualMileageMode: settings.annualMileageMode || "",
      defaultAnnualMileage: settings.defaultAnnualMileage ?? null,
      filters: settings.filters || {},
      activeTab: settings.activeTab || "soldThermal"
    });
    await writeField("tra050ReferenceTables", {
      included: false,
      note: "Las tablas normativas estan embebidas en la aplicacion; la sesion compacta guarda solo selecciones y trazabilidad."
    });
    await sink.write("}");
    progress("Sesion compacta lista", totalItems, true);
    await sink.close();
    return {
      usedPicker: sink.usedPicker,
      optimized: true,
      vehicleCount: totalVehicles,
      bytes: sink.bytes(),
      durationMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    try {
      await sink.abort?.();
    } catch {
      // Ignore close errors after a cancelled export.
    }
    throw error;
  }
}

async function saveStandardSession(session, fileName) {
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
  return { usedPicker: false, optimized: false, bytes: blob.size };
}

export async function saveProjectSession(payload, fileName = defaultProjectSessionFileName(), options = {}) {
  if (isProjectState(payload)) {
    const count = vehicleCount(payload.datasets);
    if (count >= LARGE_PROJECT_VEHICLE_THRESHOLD || options.forceOptimized) {
      return writeOptimizedProjectSession(payload, fileName, options);
    }
    return saveStandardSession(buildProjectSessionJson(payload), fileName);
  }
  return saveStandardSession(payload, fileName);
}
