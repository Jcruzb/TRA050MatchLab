import * as XLSX from "xlsx";
import { flattenResult } from "../utils/exportResults.js";

export function exportFinalTra050Excel({ pairs, datasets, warnings, unpairedSold = [], unpairedPurchased = [] }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pairs.map((pair) => ({
    match_pair_id: pair.match_pair_id,
    categoria: pair.categoria,
    categoria_check_result: pair.categoryCheck?.valid ? "cumple" : "no_cumple",
    categoria_check_explanation: pair.categoryCheck?.explanation || "",
    date_window_check_result: pair.dateWindowCheck?.valid ? "cumple" : "no_cumple",
    fecha_compra_electrico: pair.dateWindowCheck?.purchaseDate || pair.fecha_compra,
    fecha_venta_termico: pair.dateWindowCheck?.saleDate || pair.fecha_venta,
    ventana_fecha_inicio: pair.dateWindowCheck?.windowStart || "",
    ventana_fecha_fin: pair.dateWindowCheck?.windowEnd || "",
    date_window_explanation: pair.dateWindowCheck?.explanation || "",
    saving_check_result: pair.savingCheck?.valid ? "cumple" : "no_cumple",
    uniqueness_check_result: pair.uniquenessCheck?.valid ? "cumple" : "no_cumple",
    pair_selection_explanation: pair.pair_selection_explanation || "",
    matricula_vendido: pair.sold_matricula,
    fecha_venta: pair.fecha_venta,
    cva_original: pair.cva_original,
    unidad_cva_original: pair.unidad_cva_original,
    combustible_vendido: pair.combustible_vendido,
    factor_conversion_f: pair.factor_conversion_f,
    unidad_factor_conversion: pair.unidad_factor_conversion,
    cva_kwh_100km: pair.cva_kwh_100km,
    consumo_vendido_kwh_100km: pair.consumo_termico_kwh_100km,
    factor_conversion_usado: pair.factor_conversion_usado,
    matricula_comprado: pair.purchased_matricula,
    fecha_compra: pair.fecha_compra,
    cvn_kwh_100km: pair.cvn_kwh_100km,
    consumo_comprado_kwh_100km: pair.consumo_electrico_kwh_100km,
    tipologia_km_anuales: pair.tipologia_km_anuales || pair.annual_mileage_typology,
    km_anuales: pair.kilometraje_anual_km,
    origen_km_anuales: pair.annual_mileage_source || pair.kilometraje_anual_origen,
    kilometraje_anual_km: pair.kilometraje_anual_km,
    ahorro_kwh_100km: pair.ahorro_kwh_100km,
    ahorro_kwh_anio: pair.ahorro_kwh_anio,
    formula_aplicada: pair.formula_aplicada,
    explicacion_calculo: pair.explicacion_calculo || pair.explanation,
    calculo_valido: pair.calculo_valido,
    warnings_calculo: (pair.warnings_calculo || []).join(" | "),
    days_between: pair.days_between,
    pair_status: pair.pair_status,
    pair_locked: pair.pair_locked,
    pair_manual_override: pair.pair_manual_override,
    warnings: (pair.warnings || []).join(" | ")
  }))), "01_Pares_TRA050");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((datasets.soldThermal.matchResults || []).map(flattenResult)), "02_Vehiculos_vendidos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((datasets.purchasedElectric.matchResults || []).map(flattenResult)), "03_Vehiculos_comprados");
  const explicitUnpaired = [...unpairedSold, ...unpairedPurchased];
  const unpairedSource = explicitUnpaired.length ? explicitUnpaired : [...(datasets.soldThermal.matchResults || []), ...(datasets.purchasedElectric.matchResults || [])].filter((item) => !item.match_pair_id);
  const unpaired = unpairedSource
    .map((item) => ({ dataset_type: item.dataset_type, matricula: item.input?.matricula || item.input?.Matricula_Nuevo, categoria: item.input?.categoria || item.input?.Categoria_nuevo, marca_modelo: item.input?.marca_modelo || item.input?.Marca_modelo_Nuevo, fecha_operacion: item.input?.fecha_operacion, motivo_no_emparejado: item.unpaired_reason || item.pair_status || "no emparejado", detalle_motivo_no_emparejado: item.unpaired_reason_detail || "" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unpaired), "04_No_emparejados");
  const pairWarnings = pairs.flatMap((pair) => [
    ...(pair.warnings_calculo || []).map((message) => ({ match_pair_id: pair.match_pair_id, type: "warning_calculo", message })),
    ...(pair.errores_calculo || []).map((message) => ({ match_pair_id: pair.match_pair_id, type: "error_calculo", message }))
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...(warnings || []), ...pairWarnings]), "05_Advertencias");
  XLSX.writeFile(wb, "tra050-emparejamiento-final.xlsx");
}
