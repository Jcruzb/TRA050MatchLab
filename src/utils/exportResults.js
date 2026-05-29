import * as XLSX from "xlsx";
import { MATCH_MEANINGS } from "./matchEngine.js";
import { TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO, TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "../data/tra050-reference.js";
import { factorForFuel } from "../tra050/tra050Factors.js";
import { getAnnualMileageForTra050, getVehicleConsumptionForTra050 } from "../tra050/tra050Savings.js";

function officialConsumption(item) {
  if (item.assigned?.consumoElectricoKwh100) return { value: item.assigned.consumoElectricoKwh100, unit: "kWh/100km", origin: "idae_db" };
  if (item.assigned?.consumoLitros100) return { value: item.assigned.consumoLitros100, unit: "l/100km", origin: "idae_db" };
  return { value: "", unit: "", origin: item.vehiculo_no_encontrado_db ? "tra050_reference" : "" };
}

export function flattenResult(item) {
  const assigned = item.assigned || {};
  const consumption = officialConsumption(item);
  const traConsumption = getVehicleConsumptionForTra050(item, item.dataset_type || item.input?.dataset_type || "");
  const mileage = getAnnualMileageForTra050(item);
  const fuel = item.input?.combustible_motorizacion || item.input?.Combustible_Motorizacion_Nuevo || item.combustible_referencia_tra050 || item.reference?.combustible || assigned.motorizacion || "";
  const factor = factorForFuel(fuel, traConsumption.unit);
  const soldConverted = item.consumo_vendido_kwh_100km || (item.dataset_type === "sold_thermal" && traConsumption.value !== null && factor.factor ? Number((traConsumption.value * factor.factor).toFixed(4)) : "");
  const operationKey = item.dataset_type === "sold_thermal" ? "fecha_venta" : "fecha_compra";
  return {
    dataset_type: item.dataset_type || item.input?.dataset_type || "",
    categoria: item.input?.categoria || item.input?.Categoria_nuevo || "",
    matricula: item.input?.matricula || item.input?.Matricula_Nuevo || "",
    marca_modelo: item.input?.marca_modelo || item.input?.Marca_modelo_Nuevo || "",
    fecha_matriculacion: item.input?.fecha_matriculacion || item.input?.Matriculacion_Nuevo || "",
    [operationKey]: item.input?.fecha_operacion || item.input?.["Fecha Compra"] || "",
    contrato_factura: item.input?.contrato_factura || item.input?.["Nº Contrato/Factura"] || item.input?.["NÂº Contrato/Factura"] || "",
    precio_sin_iva: item.input?.precio_sin_iva || item.input?.["Precio (SIN IVA)"] || "",
    cilindrada: item.input?.cilindrada || item.input?.Cilindrada_Nuevo || "",
    combustible_motorizacion: item.input?.combustible_motorizacion || item.input?.Combustible_Motorizacion_Nuevo || "",
    potencia: item.input?.potencia || item.input?.Potencia_Nuevo || "",
    tipo_cambio: item.input?.tipo_cambio || item.input?.Tipo_Cambio_Nuevo || "",
    carroceria: item.input?.carroceria || item.input?.Carroceria_Nuevo || "",
    version_acabado: item.input?.version_acabado || item.input?.Version_Acabado_Nuevo || "",
    anio_modelo_my: item.input?.anio_modelo_my || item.input?.Anio_Modelo_MY_Nuevo || "",
    observaciones: item.input?.observaciones || item.input?.Observaciones_Nuevo || "",
    match_estado: item.match_estado,
    match_score: item.match_score,
    match_significado: MATCH_MEANINGS[item.match_estado] || item.match_significado,
    id_idae_asignado: assigned.id_idae || "",
    modelo_idae_asignado: assigned.modeloOriginal || "",
    source_url_idae: assigned.source_url || "",
    vehiculo_no_encontrado_db: Boolean(item.vehiculo_no_encontrado_db),
    consumo_origen: item.consumo_origen || consumption.origin,
    consumo_oficial_extraido: consumption.value,
    consumo_referencia_tra050: item.consumo_referencia_tra050 || item.reference?.consumo || item.reference?.consumo_kwh_100km || "",
    unidad_consumo: item.unidad_consumo || item.reference?.unidad || consumption.unit || (item.reference?.consumo_kwh_100km ? "kWh/100km" : ""),
    unidad_consumo_referencia: item.reference?.unidad || (item.reference?.consumo_kwh_100km ? "kWh/100km" : ""),
    tipologia_referencia_tra050: item.tipologia_referencia_tra050 || item.reference?.tipologia || "",
    combustible_referencia_tra050: item.combustible_referencia_tra050 || item.reference?.combustible || "",
    tra050_reference_auto_selected: Boolean(item.tra050_reference_auto_selected),
    tra050_reference_manual_selected: Boolean(item.tra050_reference_manual_selected),
    tra050_reference_confidence: item.tra050_reference_confidence || "",
    tra050_reference_reason: item.tra050_reference_reason || "",
    observacion_consumo_referencia: item.observacion_consumo_referencia || "",
    match_manual: Boolean(item.match_manual),
    manual_search_used: Boolean(item.manual_search_used),
    learning_rule_applied: Boolean(item.learning_rule_applied),
    learning_rule_id: item.learning_rule_id || "",
    fecha_validacion: new Date().toISOString(),
    explicacion_match: item.explicacion_match,
    matched_features: item.matched_features || item.assigned?.matchedFeatures?.join(", ") || "",
    penalties: item.penalties || item.assigned?.penalties?.join(", ") || "",
    conflictos_detectados: item.conflictos_detectados,
    observaciones_match: item.notes || "",
    conflict_group_key: item.conflict_group_key || item.group_resolution_key || "",
    conflict_group_label: item.conflict_group_label || "",
    conflict_group_size: item.conflict_group_size || "",
    resolved_as_group: Boolean(item.resolved_as_group),
    group_resolution_mode: item.group_resolution_mode || "",
    group_resolution_timestamp: item.group_resolution_timestamp || ""
    ,
    match_pair_id: item.input?.match_pair_id || item.match_pair_id || null,
    pair_status: item.input?.pair_status || item.pair_status || "not_paired"
    ,
    consumo_vendido_original: item.dataset_type === "sold_thermal" ? traConsumption.value ?? "" : "",
    unidad_consumo_vendido: item.dataset_type === "sold_thermal" ? traConsumption.unit || "" : "",
    factor_conversion_f: item.dataset_type === "sold_thermal" ? item.factor_conversion_f || factor.factor || "" : "",
    consumo_vendido_kwh_100km: soldConverted,
    kilometraje_anual_km: item.dataset_type === "sold_thermal" ? item.kilometraje_anual_km || mileage.value || "" : "",
    tipologia_km_anuales: item.dataset_type === "sold_thermal" ? item.tipologia_km_anuales || mileage.typology || "" : "",
    origen_km_anuales: item.dataset_type === "sold_thermal" ? item.origen_km_anuales || mileage.source || "" : "",
    consumo_comprado_kwh_100km: item.dataset_type === "purchased_electric" ? item.consumo_comprado_kwh_100km || traConsumption.value || "" : ""
  };
}

export function exportResultsExcel(items) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map(flattenResult)), "Resultado");
  XLSX.writeFile(wb, "resultado-tra050-matchlab.xlsx");
}

export function exportDatasetExcel(dataset, sheetName, fileName) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((dataset.matchResults || []).map(flattenResult)), sheetName);
  XLSX.writeFile(wb, fileName);
}

export function exportProjectJson(datasets, learningRules, pairing = null) {
  const payload = {
    app: "TRA050 MatchLab",
    version: "0.1.0",
    exported_at: new Date().toISOString(),
    soldThermal: datasets.soldThermal,
    purchasedElectric: datasets.purchasedElectric,
    pairing,
    pairingDiagnostics: pairing?.pairingDiagnostics || null,
    learningRules,
    tra050ReferenceTables: {
      TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO,
      TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO
    }
  };
  downloadJson(payload, "tra050-matchlab-proyecto.json");
}

export function exportIdaeEvidenceManifest(datasets) {
  const all = [
    ...(datasets.soldThermal?.matchResults || []),
    ...(datasets.purchasedElectric?.matchResults || [])
  ].filter((item) => item.assigned?.id_idae);
  const items = all.map((item, index) => {
    const n = String(index + 1).padStart(6, "0");
    const role = item.dataset_type === "sold_thermal" ? "vendido" : "comprado";
    const plate = item.input?.matricula || item.input?.Matricula_Nuevo || "";
    const pairId = item.match_pair_id || (role === "vendido" ? `UNPAIRED_SOLD_${n}` : `UNPAIRED_PURCHASED_${n}`);
    return {
      evidence_id: pairId,
      match_pair_id: item.match_pair_id || null,
      dataset_type: item.dataset_type,
      evidence_role: role,
      matricula: plate,
      categoria: item.input?.categoria || item.input?.Categoria_nuevo || "",
      id_idae: item.assigned.id_idae,
      modelo_idae: item.assigned.modeloOriginal,
      source_url: item.assigned.source_url,
      output_folder: role === "vendido" ? "vendidos" : "comprados",
      suggested_filename: `${pairId}_${role}_${plate}_${item.assigned.id_idae}.png`
    };
  });
  downloadJson({ app: "TRA050 MatchLab", manifest_type: "idae_evidence_manifest", generated_at: new Date().toISOString(), items }, "tra050-idae-evidence-manifest.json");
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportResultsJson(items) {
  const blob = new Blob([JSON.stringify(items.map(flattenResult), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "resultado-tra050-matchlab.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
