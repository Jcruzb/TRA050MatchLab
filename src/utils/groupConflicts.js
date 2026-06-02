import { MATCH_STATES } from "./matchEngine.js";
import { normalizeText } from "./normalize.js";

const CONFLICT_STATES = new Set([
  MATCH_STATES.conflicto,
  MATCH_STATES.probable,
  "conflicto",
  "conflict",
  "requiere_revision",
  "requires_review",
  "match_probable",
  "probable_match",
  "match_probable_revisable"
]);

const NO_MATCH_STATES = new Set([
  MATCH_STATES.sinMatch,
  "sin_match",
  "no_match",
  "not_found"
]);

function normalizedState(item) {
  return item?.match_estado || "";
}

export function buildConflictGroupKey(item) {
  const features = item.userFeatures || {};
  const inputKey = normalizeText(
    item.input?.Marca_modelo_Nuevo
    || item.input?.marca_modelo
    || item.marca_modelo
    || features.rawText
    || ""
  );
  const candidateSignature = (item.candidates || [])
    .slice(0, 5)
    .map((candidate) => candidate.id_idae)
    .sort()
    .join("|");
  return [
    inputKey,
    features.brand || "",
    features.modelBase || "",
    features.year || "",
    features.motorizacion || "",
    features.tipoCambio || features.cambio || "",
    features.carroceria || "",
    candidateSignature
  ].join("::");
}

function buildNoMatchGroupKey(item) {
  const features = item.userFeatures || {};
  const inputKey = normalizeText(
    item.input?.Marca_modelo_Nuevo
    || item.input?.marca_modelo
    || item.marca_modelo
    || features.rawText
    || ""
  );
  return [
    "no_match",
    item.dataset_type || item.input?.dataset_type || "",
    inputKey,
    features.brand || "",
    features.modelBase || "",
    features.year || ""
  ].join("::");
}

function noDbReferenceRequired(item) {
  const datasetType = item.dataset_type || item.input?.dataset_type || "";
  return datasetType !== "sold_thermal";
}

function hasNoDbReference(item) {
  if (!item.vehiculo_no_encontrado_db) return false;
  if (!noDbReferenceRequired(item)) return true;
  return Boolean(item.consumo_referencia_tra050 && item.unidad_consumo && item.tipologia_referencia_tra050);
}

function hasExplicitIdaeDecision(item) {
  return Boolean(
    item.id_idae_asignado
    || item.idIdaeAsignado
    || item.match_manual
    || item.manual_search_used
    || item.resolved_as_group
    || item.group_resolution_applied
    || item.selection_source
  ) && Boolean(item.assigned?.id_idae || item.id_idae_asignado || item.idIdaeAsignado);
}

function isAutomaticExactMatch(item) {
  return normalizedState(item) === MATCH_STATES.exacto && Boolean(item.assigned?.id_idae);
}

export function isVehicleResolved(item = {}) {
  if (item.vehiculo_no_encontrado_db) return hasNoDbReference(item);
  return Boolean(hasExplicitIdaeDecision(item) || isAutomaticExactMatch(item));
}

export function isVehiclePendingResolution(item = {}) {
  const state = normalizedState(item);
  if (item.vehiculo_no_encontrado_db) return !hasNoDbReference(item);
  if (CONFLICT_STATES.has(state) || NO_MATCH_STATES.has(state)) return !isVehicleResolved(item);
  return !isVehicleResolved(item) && !isAutomaticExactMatch(item);
}

function itemWorkType(item) {
  const state = normalizedState(item);
  if (item.vehiculo_no_encontrado_db && !hasNoDbReference(item)) return "no_db_pending_reference";
  if (NO_MATCH_STATES.has(state)) return "no_match";
  if (CONFLICT_STATES.has(state)) return "conflict";
  if (isVehicleResolved(item)) return "resolved";
  return "partial";
}

function itemGroupKey(item) {
  if (item.group_resolution_key || item.conflict_group_key) return item.group_resolution_key || item.conflict_group_key;
  if (NO_MATCH_STATES.has(normalizedState(item))) return buildNoMatchGroupKey(item);
  return buildConflictGroupKey(item);
}

function shouldIncludeInConflictGroups(item) {
  return Boolean(
    isVehiclePendingResolution(item)
    || CONFLICT_STATES.has(normalizedState(item))
    || NO_MATCH_STATES.has(normalizedState(item))
    || item.vehiculo_no_encontrado_db
    || item.resolved_as_group
    || item.group_resolution_key
    || item.conflict_group_key
    || item.group_individual_resolution
  );
}

function hasStatus(item, statuses) {
  const values = [
    ...Object.values(item.technicalComparison || {}),
    ...Object.values(item.technical_comparison || {})
  ];
  return values.some((entry) => statuses.has(entry?.status) || statuses.has(entry?.status_label));
}

function deriveGroupStatus(group) {
  if (group.pendingVehicles > 0 && group.resolvedVehicles > 0) return "partially_resolved";
  if (group.pendingVehicles > 0) return "pending";
  if (group.totalVehicles > 0 && group.noDbVehicleCount === group.totalVehicles) return "marked_no_db";
  if (group.totalVehicles > 0 && group.manualReviewVehicleCount === group.totalVehicles) return "manual_review";
  return "resolved";
}

function mergeWorkType(current, next) {
  const priority = ["no_db_pending_reference", "partial", "conflict", "no_match", "resolved"];
  return priority.indexOf(next) < priority.indexOf(current) ? next : current;
}

export function buildConflictWorkItems(matchResults = []) {
  const groups = new Map();
  matchResults.filter(shouldIncludeInConflictGroups).forEach((item) => {
    const workType = itemWorkType(item);
    const groupKey = itemGroupKey(item);
    const datasetType = item.dataset_type || item.input?.dataset_type || "";
    const group = groups.get(groupKey) || {
      groupKey,
      groupLabel: item.conflict_group_label || item.input?.Marca_modelo_Nuevo || item.input?.marca_modelo || item.userFeatures?.rawText || "Conflicto sin modelo",
      label: item.conflict_group_label || item.input?.Marca_modelo_Nuevo || item.input?.marca_modelo || item.userFeatures?.rawText || "Conflicto sin modelo",
      datasetType,
      datasetLabel: datasetType === "sold_thermal" ? "Vehiculos vendidos/termicos" : "Vehiculos comprados/electricos",
      status: item.match_estado,
      workType,
      vehicles: [],
      totalVehicles: 0,
      resolvedVehicles: 0,
      pendingVehicles: 0,
      groupSize: 0,
      resolvedVehicleCount: 0,
      unresolvedVehicleCount: 0,
      noDbVehicleCount: 0,
      manualReviewVehicleCount: 0,
      hasConflicts: false,
      hasNoMatch: false,
      hasNoDb: false,
      needsTra050Reference: false,
      detectedFeatures: {
        brand: item.userFeatures?.brand || "",
        modelBase: item.userFeatures?.modelBase || "",
        year: item.userFeatures?.year || "",
        motorizacion: item.userFeatures?.motorizacion || "",
        cambio: item.userFeatures?.tipoCambio || item.userFeatures?.cambio || "",
        carroceria: item.userFeatures?.carroceria || ""
      },
      representativeVehicle: item,
      suggestedCandidate: item.assigned,
      candidateOptions: item.candidates || [],
      explanation: item.explicacion_match,
      warning: item.matchDebug?.warning || "",
      manuallyOverridden: false,
      groupStatus: "pending",
      hasStrongDifferences: false,
      hasDoubtfulDifferences: false,
      appliedByGroup: false,
      appliedManually: false
    };

    const pending = isVehiclePendingResolution(item);
    const resolved = isVehicleResolved(item);
    group.vehicles.push({
      rowId: item.id,
      matricula: item.input?.Matricula_Nuevo || item.input?.matricula || "",
      originalRow: item.input,
      matchResult: item
    });
    group.totalVehicles += 1;
    group.groupSize = group.totalVehicles;
    group.resolvedVehicles += resolved ? 1 : 0;
    group.pendingVehicles += pending ? 1 : 0;
    group.resolvedVehicleCount = group.resolvedVehicles;
    group.unresolvedVehicleCount = group.pendingVehicles;
    group.noDbVehicleCount += item.vehiculo_no_encontrado_db ? 1 : 0;
    group.manualReviewVehicleCount += item.group_individual_resolution ? 1 : 0;
    group.hasConflicts = group.hasConflicts || CONFLICT_STATES.has(normalizedState(item));
    group.hasNoMatch = group.hasNoMatch || NO_MATCH_STATES.has(normalizedState(item));
    group.hasNoDb = group.hasNoDb || Boolean(item.vehiculo_no_encontrado_db);
    group.needsTra050Reference = group.needsTra050Reference || Boolean(item.vehiculo_no_encontrado_db && !hasNoDbReference(item));
    group.candidateOptions = group.candidateOptions?.length ? group.candidateOptions : item.candidates || [];
    group.suggestedCandidate = group.suggestedCandidate || item.assigned;
    group.workType = mergeWorkType(group.workType, workType);
    group.hasStrongDifferences = group.hasStrongDifferences || hasStatus(item, new Set(["different", "diferente"]));
    group.hasDoubtfulDifferences = group.hasDoubtfulDifferences || hasStatus(item, new Set(["doubtful", "compatible", "dudoso"]));
    group.appliedByGroup = group.appliedByGroup || Boolean(item.group_resolution_applied || item.resolved_as_group);
    group.appliedManually = group.appliedManually || Boolean(item.match_manual);
    groups.set(groupKey, group);
  });

  return [...groups.values()].map((group) => {
    const groupStatus = deriveGroupStatus(group);
    return {
      ...group,
      groupStatus,
      status: groupStatus === "pending" ? group.status : groupStatus
    };
  }).sort((a, b) => {
    const order = { pending: 0, partially_resolved: 1, no_db_pending_reference: 2, marked_no_db: 3, manual_review: 4, resolved: 5 };
    return (order[a.groupStatus] ?? order[a.workType] ?? 9) - (order[b.groupStatus] ?? order[b.workType] ?? 9)
      || b.pendingVehicles - a.pendingVehicles
      || b.groupSize - a.groupSize
      || a.label.localeCompare(b.label);
  });
}

export function groupConflictResults(items) {
  return buildConflictWorkItems(items);
}
