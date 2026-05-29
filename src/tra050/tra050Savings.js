import { factorForFuel, normalizeFuelForTra050Factor } from "./tra050Factors.js";
import { resolveTra050AnnualMileage } from "./tra050Mileage.js";

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

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function getAnnualMileageForTra050(vehicle, options = {}) {
  const annex = resolveTra050AnnualMileage(vehicle, options);
  if (annex.value !== null) return { value: annex.value, source: annex.source, raw: annex.value, typology: annex.typology, reason: annex.reason };

  const raw = pick(
    vehicle?.input?.kilometraje_promedio_anual,
    vehicle?.input?.Kilometraje_Promedio_Anual,
    vehicle?.input?.L_km_anio,
    vehicle?.input?.l_km_anio,
    vehicle?.kilometraje_promedio_anual,
    vehicle?.Kilometraje_Promedio_Anual,
    vehicle?.L_km_anio
  );
  const own = parseNumberFromSpanishUnit(raw);
  if (own !== null) return { value: own, source: "vehicle", raw, typology: "", reason: "Kilometraje anual informado en la fila." };
  const global = parseNumberFromSpanishUnit(options.annualMileageKm);
  if (global !== null) return { value: global, source: "global_default", raw: options.annualMileageKm, typology: "", reason: "Kilometraje anual global por defecto." };
  return { value: null, source: "", raw: raw || options.annualMileageKm || "", typology: annex.typology, reason: annex.reason };
}

function getFuelForAnnualSaving(vehicle) {
  return pick(
    vehicle?.input?.combustible_motorizacion,
    vehicle?.input?.Combustible_Motorizacion_Nuevo,
    vehicle?.combustible_motorizacion,
    vehicle?.combustible_referencia_tra050,
    vehicle?.reference?.combustible,
    vehicle?.userFeatures?.motorizacion,
    vehicle?.assigned?.motorizacion
  );
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

export function calculateTra050AnnualSaving(soldVehicle, purchasedVehicle, options = {}) {
  const warnings = [];
  const errors = [];
  const thermal = getVehicleConsumptionForTra050(soldVehicle, "sold_thermal");
  const electric = getVehicleConsumptionForTra050(purchasedVehicle, "purchased_electric");
  warnings.push(...thermal.warnings, ...electric.warnings);
  if (thermal.source === "tra050_reference") warnings.push("consumo_termico_referencia_tra050");
  if (electric.source === "tra050_reference") warnings.push("consumo_electrico_referencia_tra050");

  const fuel = getFuelForAnnualSaving(soldVehicle);
  const fuelKey = normalizeFuelForTra050Factor(fuel);
  const factorInfo = factorForFuel(fuel, thermal.unit);
  const mileage = getAnnualMileageForTra050(soldVehicle, options);
  if (mileage.source === "global_default") warnings.push("kilometraje_anual_valor_global_por_defecto");

  if (thermal.value === null) errors.push("falta_CVA");
  if (!fuel) errors.push("falta_combustible");
  if (!factorInfo.factor) errors.push("factor_conversion_no_configurado");
  if (electric.value === null) errors.push("falta_CVN");
  if (electric.value !== null && !String(electric.unit).toLowerCase().includes("kwh")) errors.push("CVN_unidad_no_kwh_100km");
  if (mileage.value === null) errors.push("falta_kilometraje_anual");

  const cvaKwh = errors.includes("falta_CVA") || errors.includes("factor_conversion_no_configurado") ? null : thermal.value * factorInfo.factor;
  const ahorro100 = cvaKwh === null || electric.value === null ? null : cvaKwh - electric.value;
  const ahorroYear = ahorro100 === null || mileage.value === null ? null : (ahorro100 / 100) * mileage.value;

  if (ahorro100 !== null && ahorro100 <= 0) warnings.push("ahorro_kwh_100km_no_positivo");
  if (ahorroYear !== null && ahorroYear <= 0) warnings.push("ahorro_kwh_anio_no_positivo");

  const explanation = errors.length
    ? `Calculo pendiente: ${errors.join(", ")}.`
    : `Consumo del vehiculo antiguo: ${thermal.value} ${thermal.unit}. Factor aplicado: ${factorInfo.factor.toFixed(2)} ${factorInfo.unit}. Consumo convertido: ${cvaKwh.toFixed(2)} kWh/100km. Consumo del vehiculo nuevo: ${electric.value} kWh/100km. Kilometraje anual: ${mileage.value.toLocaleString("es-ES")} km/año. Ahorro anual calculado: ${ahorroYear.toLocaleString("es-ES", { maximumFractionDigits: 2 })} kWh/año.`;

  return {
    is_valid: errors.length === 0,
    cva_original_value: thermal.value,
    cva_original_unit: thermal.unit,
    cva_fuel_type: fuelKey || fuel || "",
    conversion_factor: factorInfo.factor,
    conversion_factor_unit: factorInfo.unit,
    cva_kwh_100km: round(cvaKwh, 4),
    cvn_kwh_100km: electric.value,
    annual_mileage_km: mileage.value,
    annual_mileage_source: mileage.source,
    annual_mileage_typology: mileage.typology,
    annual_mileage_reason: mileage.reason,
    ahorro_kwh_100km: round(ahorro100, 4),
    ahorro_kwh_year: round(ahorroYear, 2),
    formula: "AE_TOTAL = (((CVA * f) - CVN) / 100) * L",
    explanation,
    warnings,
    errors,
    calculo_valido: errors.length === 0,
    consumo_termico_original: thermal.value,
    consumo_termico_unidad: thermal.unit,
    consumo_termico_kwh_100km: round(cvaKwh, 4),
    consumo_electrico_kwh_100km: electric.value,
    factor_conversion_usado: factorInfo.factor,
    unidad_factor_conversion: factorInfo.unit,
    factor_origen: factorInfo.key,
    consumo_termico_origen: thermal.source,
    consumo_electrico_origen: electric.source,
    raw: { thermal, electric, mileage }
  };
}

export function calculateTra050Savings(soldVehicle, purchasedVehicle, options = {}) {
  return calculateTra050AnnualSaving(soldVehicle, purchasedVehicle, options);
}
