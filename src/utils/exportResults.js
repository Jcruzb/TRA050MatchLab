import * as XLSX from "xlsx";
import { MATCH_MEANINGS } from "./matchEngine.js";

export function flattenResult(item) {
  const assigned = item.assigned || {};
  return {
    ...item.input,
    match_estado: item.match_estado,
    match_score: item.match_score,
    match_significado: MATCH_MEANINGS[item.match_estado] || item.match_significado,
    id_idae_asignado: assigned.id_idae || "",
    modelo_idae_asignado: assigned.modeloOriginal || "",
    source_url_idae: assigned.source_url || "",
    vehiculo_no_encontrado_db: Boolean(item.vehiculo_no_encontrado_db),
    consumo_referencia_tra050: item.reference?.consumo || item.reference?.consumo_kwh_100km || "",
    unidad_consumo_referencia: item.reference?.unidad || (item.reference?.consumo_kwh_100km ? "kWh/100km" : ""),
    tipologia_referencia_tra050: item.reference?.tipologia || "",
    combustible_referencia_tra050: item.reference?.combustible || "",
    match_manual: Boolean(item.match_manual),
    manual_search_used: Boolean(item.manual_search_used),
    fecha_validacion: new Date().toISOString(),
    explicacion_match: item.explicacion_match,
    conflictos_detectados: item.conflictos_detectados,
    observaciones_match: item.notes || "",
    conflict_group_key: item.conflict_group_key || item.group_resolution_key || "",
    conflict_group_label: item.conflict_group_label || "",
    conflict_group_size: item.conflict_group_size || "",
    resolved_as_group: Boolean(item.resolved_as_group),
    group_resolution_mode: item.group_resolution_mode || ""
  };
}

export function exportResultsExcel(items) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map(flattenResult)), "Resultado");
  XLSX.writeFile(wb, "resultado-tra050-matchlab.xlsx");
}

export function exportResultsJson(items) {
  const blob = new Blob([JSON.stringify(items.map(flattenResult), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "resultado-tra050-matchlab.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
