import { MATCH_STATES } from "./matchEngine.js";
import { normalizeText } from "./normalize.js";

const GROUPABLE_STATES = new Set([MATCH_STATES.conflicto, MATCH_STATES.probable]);

export function buildConflictGroupKey(item) {
  const features = item.userFeatures || {};
  const inputKey = normalizeText(item.input?.Marca_modelo_Nuevo || features.rawText || "");
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

export function groupConflictResults(items) {
  const groups = new Map();
  items
    .filter((item) => GROUPABLE_STATES.has(item.match_estado) && !item.vehiculo_no_encontrado_db && !item.group_individual_resolution)
    .forEach((item) => {
      const groupKey = buildConflictGroupKey(item);
      const group = groups.get(groupKey) || {
        groupKey,
        label: item.input?.Marca_modelo_Nuevo || item.userFeatures?.rawText || "Conflicto sin modelo",
        status: item.match_estado,
        vehicles: [],
        groupSize: 0,
        detectedFeatures: {
          brand: item.userFeatures?.brand || "",
          modelBase: item.userFeatures?.modelBase || "",
          year: item.userFeatures?.year || "",
          motorizacion: item.userFeatures?.motorizacion || "",
          cambio: item.userFeatures?.tipoCambio || item.userFeatures?.cambio || "",
          carroceria: item.userFeatures?.carroceria || ""
        },
        suggestedCandidate: item.assigned,
        candidateOptions: item.candidates || [],
        explanation: item.explicacion_match,
        warning: item.matchDebug?.warning || "",
        manuallyOverridden: false
      };
      group.vehicles.push({
        rowId: item.id,
        matricula: item.input?.Matricula_Nuevo || "",
        originalRow: item.input,
        matchResult: item
      });
      group.groupSize = group.vehicles.length;
      groups.set(groupKey, group);
    });

  return [...groups.values()].sort((a, b) => b.groupSize - a.groupSize || a.label.localeCompare(b.label));
}
