import * as XLSX from "xlsx";
import { flattenResult } from "../utils/exportResults.js";

export function exportFinalTra050Excel({ pairs, datasets, warnings }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pairs.map((pair) => ({
    match_pair_id: pair.match_pair_id,
    categoria: pair.categoria,
    matricula_vendido: pair.sold_matricula,
    fecha_venta: pair.fecha_venta,
    consumo_vendido_kwh_100km: pair.consumo_termico_kwh_100km,
    factor_conversion_usado: pair.factor_conversion_usado,
    matricula_comprado: pair.purchased_matricula,
    fecha_compra: pair.fecha_compra,
    consumo_comprado_kwh_100km: pair.consumo_electrico_kwh_100km,
    ahorro_kwh_100km: pair.ahorro_kwh_100km,
    days_between: pair.days_between,
    pair_status: pair.pair_status,
    pair_locked: pair.pair_locked,
    pair_manual_override: pair.pair_manual_override,
    warnings: (pair.warnings || []).join(" | "),
    explicacion_calculo: pair.explanation
  }))), "01_Pares_TRA050");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((datasets.soldThermal.matchResults || []).map(flattenResult)), "02_Vehiculos_vendidos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((datasets.purchasedElectric.matchResults || []).map(flattenResult)), "03_Vehiculos_comprados");
  const unpaired = [...(datasets.soldThermal.matchResults || []), ...(datasets.purchasedElectric.matchResults || [])]
    .filter((item) => !item.match_pair_id)
    .map((item) => ({ dataset_type: item.dataset_type, matricula: item.input?.matricula, categoria: item.input?.categoria, marca_modelo: item.input?.marca_modelo, fecha_operacion: item.input?.fecha_operacion, motivo_no_emparejado: item.pair_status || "no emparejado" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unpaired), "04_No_emparejados");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warnings || []), "05_Advertencias");
  XLSX.writeFile(wb, "tra050-emparejamiento-final.xlsx");
}
