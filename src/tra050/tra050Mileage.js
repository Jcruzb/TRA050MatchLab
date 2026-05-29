import { normalizeText } from "../utils/normalize.js";

export const TRA050_KM_ANUALES_POR_TIPOLOGIA = [
  { tipologia: "ciclomotor", km_anuales: 1759 },
  { tipologia: "motocicleta", km_anuales: 2831 },
  { tipologia: "turismo", km_anuales: 13073 },
  { tipologia: "furgoneta", km_anuales: 15815 },
  { tipologia: "camion", km_anuales: 53508 },
  { tipologia: "autobus", km_anuales: 46607 }
];

function pick(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function categoryOf(vehicle) {
  return String(pick(vehicle?.input?.categoria, vehicle?.input?.Categoria_nuevo, vehicle?.categoria, vehicle?.Categoria_nuevo) || "").trim().toUpperCase();
}

function textOf(vehicle) {
  return normalizeText([
    vehicle?.reference?.tipologia,
    vehicle?.tipologia_referencia_tra050,
    vehicle?.input?.Marca_modelo_Nuevo,
    vehicle?.input?.marca_modelo,
    vehicle?.input?.Carroceria_Nuevo,
    vehicle?.input?.carroceria,
    vehicle?.input?.Observaciones_Nuevo,
    vehicle?.input?.observaciones
  ].filter(Boolean).join(" "));
}

export function kmForTra050Typology(tipologia) {
  return TRA050_KM_ANUALES_POR_TIPOLOGIA.find((item) => item.tipologia === tipologia) || null;
}

export function inferTra050MileageTypology(vehicle) {
  const category = categoryOf(vehicle);
  const text = textOf(vehicle);

  if (/^L1E?$/.test(category) || text.includes("ciclomotor")) return { typology: "ciclomotor", confidence: "high", reason: "Categoria L1e/tipologia ciclomotor detectada." };
  if (/^L(3E?|5E?)$/.test(category) || text.includes("motocicleta")) return { typology: "motocicleta", confidence: "high", reason: "Categoria L3e/L5e/tipologia motocicleta detectada." };
  if (category.startsWith("L")) return { typology: "motocicleta", confidence: "medium", reason: "Categoria L detectada; se usa motocicleta salvo indicio de ciclomotor." };

  if (category === "N2" || category === "N3" || text.includes("camion")) return { typology: "camion", confidence: "high", reason: "Categoria N2/N3 o camion detectado." };
  if (category === "M2" || category === "M3" || text.includes("autobus") || text.includes("bus")) return { typology: "autobus", confidence: "high", reason: "Categoria M2/M3 o autobus detectado." };
  if (category === "N1" || text.includes("furgoneta")) return { typology: "furgoneta", confidence: "high", reason: "Categoria N1 o furgoneta detectada." };
  if (category === "M1") return { typology: "turismo", confidence: "high", reason: "Categoria M1 turismo detectada." };

  return { typology: "", confidence: "low", reason: "No se pudo inferir tipologia de kilometraje Anexo III." };
}

export function resolveTra050AnnualMileage(vehicle, options = {}) {
  const manualTypology = options.annualMileageTypology || vehicle?.annual_mileage_typology_manual;
  const manualTypologyRow = manualTypology ? kmForTra050Typology(manualTypology) : null;
  if (manualTypologyRow) {
    return {
      value: manualTypologyRow.km_anuales,
      source: "manual_typology",
      typology: manualTypologyRow.tipologia,
      confidence: "manual",
      reason: `Tipologia de kilometraje seleccionada manualmente: ${manualTypologyRow.tipologia}.`
    };
  }

  const inferred = inferTra050MileageTypology(vehicle);
  const row = kmForTra050Typology(inferred.typology);
  if (row && inferred.confidence === "high") {
    return {
      value: row.km_anuales,
      source: "tra050_annex_iii",
      typology: row.tipologia,
      confidence: inferred.confidence,
      reason: inferred.reason
    };
  }

  return {
    value: null,
    source: "",
    typology: inferred.typology,
    confidence: inferred.confidence,
    reason: inferred.reason
  };
}
