import { factorForFuel } from "./tra050Factors.js";

function pick(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

export function parseNumberFromSpanishUnit(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function rawTechnical(vehicle) {
  return vehicle.assigned?.raw?.detalle_tecnico || vehicle.raw?.detalle_tecnico || vehicle.detalle_tecnico || {};
}

function rawWltp(vehicle) {
  return vehicle.assigned?.raw?.tabla_wltp || vehicle.raw?.tabla_wltp || vehicle.tabla_wltp || {};
}

function findTechnicalValue(vehicle, names) {
  const detail = rawTechnical(vehicle);
  const normalizedNames = names.map((name) => String(name).toLowerCase());
  const key = Object.keys(detail).find((entry) => normalizedNames.includes(String(entry).toLowerCase()));
  return key ? detail[key] : "";
}

function inferUnit(value, fallback = "") {
  const text = `${value || ""} ${fallback || ""}`.toLowerCase();
  if (text.includes("kwh")) return "kWh/100km";
  if (text.includes("kg/100")) return "kg/100km";
  if (text.includes("l/100") || text.includes("litro")) return "L/100km";
  return fallback || "";
}

export function getVehicleConsumptionForTra050(vehicle, datasetType = vehicle?.dataset_type || vehicle?.input?.dataset_type || "") {
  const detailElectric = findTechnicalValue(vehicle, ["Consumo eléctrico", "Consumo Electrico", "Consumo eléctrico WLTP"]);
  const detailThermal = findTechnicalValue(vehicle, [
    "Consumo medio mixto según ciclo WLTP",
    "Consumo medio mixto segun ciclo WLTP",
    "Consumo medio mixto",
    "Consumo combinado",
    "Consumo WLTP"
  ]);
  const wltpConsumption = pick(rawWltp(vehicle).consumo_minimo, rawWltp(vehicle).consumo_maximo);
  const assignedElectric = pick(vehicle.assigned?.consumoElectricoKwh100, vehicle.consumo_electrico_kwh_100);
  const assignedThermal = pick(vehicle.assigned?.consumoLitros100, vehicle.consumo_litros_100, vehicle.consumo_oficial_extraido);
  const explicitReference = pick(vehicle.reference?.consumo, vehicle.reference?.consumo_kwh_100km, vehicle.consumo_referencia_tra050);
  const referenceUnit = pick(vehicle.reference?.unidad, vehicle.unidad_consumo, vehicle.unidad_consumo_referencia);

  const wantsElectric = datasetType === "purchased_electric" || datasetType === "purchasedElectric";
  const officialSource = wantsElectric
    ? pick(assignedElectric, detailElectric, vehicle.consumo_oficial_extraido)
    : pick(assignedThermal, detailThermal, wltpConsumption);
  const official = parseNumberFromSpanishUnit(officialSource);
  const officialUnit = wantsElectric ? "kWh/100km" : inferUnit(officialSource, assignedElectric ? "kWh/100km" : "L/100km");
  if (official !== null) return { value: official, unit: officialUnit, source: "idae_official", isReference: false, isOfficialIdae: true, is_valid: true, rawValue: officialSource, warnings: [] };

  const reference = parseNumberFromSpanishUnit(explicitReference);
  if (reference !== null) return { value: reference, unit: referenceUnit || (wantsElectric ? "kWh/100km" : "L/100km"), source: "tra050_reference", isReference: true, isOfficialIdae: false, is_valid: true, rawValue: explicitReference, warnings: [] };

  const reason = wantsElectric ? "sin_consumo_electrico_extraido" : "sin_consumo_termico_extraido";
  return { value: null, unit: "", source: "missing", isReference: false, isOfficialIdae: false, is_valid: false, rawValue: "", reason, warnings: ["Consumo no disponible."] };
}

export function calculateTra050Savings(soldVehicle, purchasedVehicle) {
  const warnings = [];
  const thermal = getVehicleConsumptionForTra050(soldVehicle, "sold_thermal");
  const electric = getVehicleConsumptionForTra050(purchasedVehicle, "purchased_electric");
  warnings.push(...thermal.warnings, ...electric.warnings);
  if (thermal.value === null || electric.value === null) {
    return { ahorro_kwh_100km: null, is_valid: false, warnings, explanation: "No se puede calcular ahorro porque falta consumo." };
  }
  if (!String(electric.unit).toLowerCase().includes("kwh")) {
    warnings.push("El consumo del eléctrico no está en kWh/100km.");
    return { ahorro_kwh_100km: null, is_valid: false, warnings, explanation: "Unidad eléctrica incompatible." };
  }
  const fuel = soldVehicle.input?.combustible_motorizacion || soldVehicle.userFeatures?.motorizacion || soldVehicle.assigned?.motorizacion || soldVehicle.reference?.combustible || "";
  const factorInfo = factorForFuel(fuel, thermal.unit);
  if (!factorInfo.factor) {
    warnings.push(factorInfo.warning);
    return { ahorro_kwh_100km: null, is_valid: false, warnings, explanation: factorInfo.warning };
  }
  const thermalKwh = thermal.value * factorInfo.factor;
  const ahorro = thermalKwh - electric.value;
  if (ahorro <= 0) warnings.push("El ahorro calculado es cero o negativo.");
  return {
    ahorro_kwh_100km: Number(ahorro.toFixed(2)),
    consumo_termico_original: thermal.value,
    consumo_termico_kwh_100km: Number(thermalKwh.toFixed(2)),
    consumo_electrico_kwh_100km: electric.value,
    factor_conversion_usado: factorInfo.factor,
    factor_origen: factorInfo.key,
    consumo_termico_origen: thermal.source,
    consumo_electrico_origen: electric.source,
    is_valid: warnings.length === 0 || ahorro > 0,
    warnings,
    explanation: `Consumo térmico ${thermal.value} ${thermal.unit} × ${factorInfo.factor} = ${thermalKwh.toFixed(2)} kWh/100km. Consumo eléctrico ${electric.value} kWh/100km. Ahorro estimado: ${ahorro.toFixed(2)} kWh/100km.`
  };
}
