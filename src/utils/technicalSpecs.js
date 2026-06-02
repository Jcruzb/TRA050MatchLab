import { normalizeText, parseNumber } from "./normalize.js";

const EMPTY = "-";
export const KW_TO_CV = 1.35802469;

function firstNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const match = raw.match(/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const token = match[0];
  if (/^\d{1,3}([.,]\d{3})+$/.test(token)) return Number(token.replace(/[.,]/g, ""));
  if (/^\d{1,2}[.,]\d{3}\b/.test(token)) return Number(token.replace(/[.,]/g, ""));
  return Number(token.replace(",", "."));
}

export function parseCilindradaCc(value) {
  const number = firstNumber(value);
  if (number === null) return null;
  const text = normalizeText(value);
  if (number > 0 && number < 10 && !text.includes("cc") && !text.includes("cm3")) return Math.round(number * 1000);
  if (number > 0 && number < 100 && (text.includes("l") || text.includes("litro"))) return Math.round(number * 1000);
  return Math.round(number);
}

export function parsePotenciaCv(value) {
  const number = firstNumber(value);
  if (number === null) return null;
  const text = normalizeText(value);
  return Number(number.toFixed(1));
}

export function parsePowerKw(value) {
  const number = firstNumber(value);
  return number === null ? null : Number(number.toFixed(1));
}

export function convertKwToCv(kw) {
  const number = Number(kw);
  return Number.isFinite(number) ? Number((number * KW_TO_CV).toFixed(1)) : null;
}

export function parseUserPowerKwToCv(value) {
  const text = normalizeText(value);
  if (text.includes("cv") && !text.includes("kw")) return parsePotenciaCv(value);
  const kw = parsePowerKw(value);
  return convertKwToCv(kw);
}

export function parseEmisionesGco2Km(value) {
  const number = firstNumber(value);
  return number === null ? null : Math.round(number);
}

export function formatCilindradaCc(value) {
  const parsed = parseCilindradaCc(value);
  return parsed === null ? EMPTY : `${parsed.toLocaleString("es-ES")} cc`;
}

export function formatPotenciaCv(value) {
  const parsed = parsePotenciaCv(value);
  if (parsed === null) return EMPTY;
  return `${parsed.toLocaleString("es-ES", { maximumFractionDigits: 1 })} cv`;
}

export function formatPowerKw(value) {
  const parsed = parsePowerKw(value);
  return parsed === null ? EMPTY : `${parsed.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kW`;
}

export function formatEmisionesGco2Km(value) {
  const parsed = parseEmisionesGco2Km(value);
  return parsed === null ? EMPTY : `${parsed.toLocaleString("es-ES")} g CO2/km`;
}

export function formatKw(value) {
  return formatPowerKw(value);
}

export function formatConsumption(value, unit = "L/100km") {
  const parsed = firstNumber(value);
  return parsed === null ? EMPTY : `${parsed.toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`;
}

function rawValue(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function detailValue(candidate, label) {
  const wanted = normalizeText(label);
  const detail = candidate?.raw?.detalle_tecnico || candidate?.detalle_tecnico || {};
  const found = Object.entries(detail).find(([key]) => normalizeText(key) === wanted);
  return found?.[1] || "";
}

function userInput(vehicleOrFeatures = {}) {
  return vehicleOrFeatures.input || vehicleOrFeatures;
}

function statusPayload(status, explanation, difference = null) {
  const labels = {
    match: "Coincide",
    compatible: "Compatible",
    doubtful: "Dudoso",
    different: "Diferente",
    missing: "No informado"
  };
  return { status, status_label: labels[status] || status, difference, explanation };
}

function textComparison(userValue, idaeValue, label) {
  const userText = String(userValue || "").trim();
  const idaeText = String(idaeValue || "").trim();
  if (!userText || !idaeText) return statusPayload("missing", `${label}: dato no informado`);
  const left = normalizeText(userText);
  const right = normalizeText(idaeText);
  if (left === right || left.includes(right) || right.includes(left)) return statusPayload("match", `${label} coincidente`);
  return statusPayload("different", `${label} distinto`);
}

function numericComparison(userValue, idaeValue, userUnit, idaeUnit, label, tolerances, formatter) {
  const user = Number(userValue);
  const idae = Number(idaeValue);
  if (!Number.isFinite(user) || !Number.isFinite(idae)) return statusPayload("missing", `${label}: dato no informado`);
  const diff = Math.abs(user - idae);
  if (diff <= tolerances.compatible) return statusPayload("match", `${label} compatible`, diff);
  if (diff <= tolerances.doubtful) return statusPayload("doubtful", `${label} dudoso`, diff);
  return statusPayload("different", `${label} distinto`, diff);
}

function comparisonEntry({ field, label, userValue, userDisplay, userUnit = "", idaeValue, idaeDisplay, idaeUnit = "", result }) {
  return {
    field,
    label,
    user_value: userValue ?? "",
    user_display: userDisplay || EMPTY,
    user_unit: userUnit,
    idae_value: idaeValue ?? "",
    idae_display: idaeDisplay || EMPTY,
    idae_unit: idaeUnit,
    status: result.status,
    status_label: result.status_label,
    difference: result.difference,
    explanation: result.explanation
  };
}

export function buildVehicleTechnicalComparison(vehicleOrFeatures = {}, candidate = {}) {
  const input = userInput(vehicleOrFeatures);
  const features = vehicleOrFeatures.userFeatures || vehicleOrFeatures;
  const wltp = candidate.raw?.tabla_wltp || {};
  const userCilindrada = parseCilindradaCc(rawValue(input, "cilindrada_cc", "Cilindrada_Nuevo", "cilindrada") || features.cilindradaCc);
  const userPowerKw = parsePowerKw(rawValue(input, "potencia_termica_kw", "Potencia_Termica_kW_Nuevo", "Potencia_Termica_kW_Vendido", "Potencia_Nuevo", "potencia") || features.potenciaTermicaKw);
  const userPotencia = parsePotenciaCv(rawValue(input, "potencia_cv_calculada", "potencia_cv") || features.potenciaCv) || convertKwToCv(userPowerKw);
  const idaePowerKw = parsePowerKw(candidate.potenciaTermicaKw || detailValue(candidate, "Potencia térmica"));
  const thermalPowerResult = numericComparison(userPowerKw, idaePowerKw, "kW", "kW", "Potencia termica", { compatible: 3.7, doubtful: 11 }, formatPowerKw);
  const equivalentPowerResult = numericComparison(userPotencia, candidate.potenciaCv, "cv", "cv", "Potencia equivalente", { compatible: 5, doubtful: 15 }, formatPotenciaCv);
  if (equivalentPowerResult.status !== "missing") {
    equivalentPowerResult.explanation = `Potencia ${equivalentPowerResult.status === "match" ? "compatible" : equivalentPowerResult.status_label.toLowerCase()}: el dato cargado es ${formatPowerKw(userPowerKw)}, equivalente a ${formatPotenciaCv(userPotencia)}; IDAE indica ${formatPotenciaCv(candidate.potenciaCv)}.`;
  }
  const userEmisiones = parseEmisionesGco2Km(rawValue(input, "emisiones_wltp_gco2_km_num", "Emisiones_WLTP_gCO2_km", "emisiones_wltp_gco2_km") || features.emisionesWltpGco2Km);
  const idaeEmisiones = parseEmisionesGco2Km(candidate.emisionesWltpGco2Km || detailValue(candidate, "Emisiones según ciclo WLTP") || wltp.emisiones_minimo || wltp.emisiones_maximo);
  const userMarca = features.brand || normalizeText(rawValue(input, "marca_modelo", "Marca_modelo_Nuevo")).split(" ")[0] || "";
  const rows = {
    marca: comparisonEntry({
      field: "marca",
      label: "Marca",
      userValue: userMarca,
      userDisplay: userMarca || EMPTY,
      idaeValue: candidate.marcaDetectada || "",
      idaeDisplay: candidate.marcaDetectada || EMPTY,
      result: textComparison(userMarca, candidate.marcaDetectada, "Marca")
    }),
    modelo: comparisonEntry({
      field: "modelo",
      label: "Modelo base",
      userValue: features.modelBase || "",
      userDisplay: features.modelBase || EMPTY,
      idaeValue: candidate.modelBase || "",
      idaeDisplay: candidate.modelBase || EMPTY,
      result: textComparison(features.modelBase, candidate.modelBase, "Modelo")
    }),
    year: comparisonEntry({
      field: "year",
      label: "Año/MY",
      userValue: features.year || "",
      userDisplay: features.year || rawValue(input, "anio_modelo_my", "Anio_Modelo_MY_Nuevo") || EMPTY,
      idaeValue: candidate.yearMY || "",
      idaeDisplay: candidate.yearMY ? `MY${String(candidate.yearMY).slice(-2)}` : EMPTY,
      result: Number.isFinite(Number(features.year)) && Number.isFinite(Number(candidate.yearMY))
        ? (Math.abs(Number(features.year) - Number(candidate.yearMY)) <= 1 ? statusPayload("compatible", "Año compatible", Math.abs(Number(features.year) - Number(candidate.yearMY))) : statusPayload("different", "Año distinto", Math.abs(Number(features.year) - Number(candidate.yearMY))))
        : statusPayload("missing", "Año/MY: dato no informado")
    }),
    motorizacion: comparisonEntry({
      field: "motorizacion",
      label: "Combustible / motorización",
      userValue: features.motorizacion || rawValue(input, "combustible_motorizacion", "Combustible_Motorizacion_Nuevo"),
      userDisplay: features.motorizacion || rawValue(input, "combustible_motorizacion", "Combustible_Motorizacion_Nuevo") || EMPTY,
      idaeValue: candidate.motorizacion || "",
      idaeDisplay: candidate.motorizacion || EMPTY,
      result: textComparison(features.motorizacion || rawValue(input, "combustible_motorizacion", "Combustible_Motorizacion_Nuevo"), candidate.motorizacion, "Motorización")
    }),
    cambio: comparisonEntry({
      field: "cambio",
      label: "Tipo de cambio",
      userValue: features.tipoCambio || rawValue(input, "tipo_cambio", "Tipo_Cambio_Nuevo"),
      userDisplay: features.tipoCambio || rawValue(input, "tipo_cambio", "Tipo_Cambio_Nuevo") || EMPTY,
      idaeValue: candidate.tipoCambio || "",
      idaeDisplay: candidate.tipoCambio || EMPTY,
      result: textComparison(features.tipoCambio || rawValue(input, "tipo_cambio", "Tipo_Cambio_Nuevo"), candidate.tipoCambio, "Cambio")
    }),
    cilindrada: comparisonEntry({
      field: "cilindrada",
      label: "Cilindrada",
      userValue: userCilindrada,
      userDisplay: formatCilindradaCc(userCilindrada),
      userUnit: "cc",
      idaeValue: candidate.cilindradaCc ?? "",
      idaeDisplay: formatCilindradaCc(candidate.cilindradaCc),
      idaeUnit: "cc",
      result: numericComparison(userCilindrada, candidate.cilindradaCc, "cc", "cc", "Cilindrada", { compatible: 20, doubtful: 100 }, formatCilindradaCc)
    }),
    potencia_termica: comparisonEntry({
      field: "potencia_termica",
      label: "Potencia termica",
      userValue: userPowerKw,
      userDisplay: formatPowerKw(userPowerKw),
      userUnit: "kW",
      idaeValue: idaePowerKw ?? "",
      idaeDisplay: formatPowerKw(idaePowerKw),
      idaeUnit: "kW",
      result: thermalPowerResult
    }),
    potencia: comparisonEntry({
      field: "potencia",
      label: "Potencia equivalente",
      userValue: userPotencia,
      userDisplay: userPowerKw !== null ? `${formatPowerKw(userPowerKw)} = ${formatPotenciaCv(userPotencia)}` : formatPotenciaCv(userPotencia),
      userUnit: "cv",
      idaeValue: candidate.potenciaCv ?? "",
      idaeDisplay: formatPotenciaCv(candidate.potenciaCv),
      idaeUnit: "cv",
      result: equivalentPowerResult
    }),
    emisiones: comparisonEntry({
      field: "emisiones",
      label: "Emisiones WLTP",
      userValue: userEmisiones,
      userDisplay: formatEmisionesGco2Km(userEmisiones),
      userUnit: "g CO2/km",
      idaeValue: idaeEmisiones ?? "",
      idaeDisplay: formatEmisionesGco2Km(idaeEmisiones),
      idaeUnit: "g CO2/km",
      result: numericComparison(userEmisiones, idaeEmisiones, "g CO2/km", "g CO2/km", "Emisiones", { compatible: 5, doubtful: 15 }, formatEmisionesGco2Km)
    }),
    carroceria: comparisonEntry({
      field: "carroceria",
      label: "Carrocería / segmento",
      userValue: features.carroceria || rawValue(input, "carroceria", "Carroceria_Nuevo"),
      userDisplay: features.carroceria || rawValue(input, "carroceria", "Carroceria_Nuevo") || EMPTY,
      idaeValue: candidate.segmento || candidate.carroceriaDetectada || "",
      idaeDisplay: candidate.segmento || candidate.carroceriaDetectada || EMPTY,
      result: textComparison(features.carroceria || rawValue(input, "carroceria", "Carroceria_Nuevo"), candidate.segmento || candidate.carroceriaDetectada, "Carrocería / segmento")
    }),
    potencia_electrica: comparisonEntry({
      field: "potencia_electrica",
      label: "Potencia eléctrica",
      userValue: "",
      userDisplay: EMPTY,
      userUnit: "kW",
      idaeValue: candidate.potenciaElectricaKw ?? "",
      idaeDisplay: formatKw(candidate.potenciaElectricaKw),
      idaeUnit: "kW",
      result: statusPayload("missing", "Potencia eléctrica: dato cargado no informado")
    }),
    consumo_electrico: comparisonEntry({
      field: "consumo_electrico",
      label: "Consumo eléctrico",
      userValue: "",
      userDisplay: EMPTY,
      userUnit: "kWh/100km",
      idaeValue: candidate.consumoElectricoKwh100 ?? "",
      idaeDisplay: formatConsumption(candidate.consumoElectricoKwh100, "kWh/100km"),
      idaeUnit: "kWh/100km",
      result: statusPayload("missing", "Consumo eléctrico: dato cargado no informado")
    })
  };
  return rows;
}

function candidateDetail(candidate, label) {
  return detailValue(candidate, label);
}

function safeDisplay(value, formatter = null) {
  if (formatter) return formatter(value);
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "object") return EMPTY;
  return String(value);
}

export function buildCandidateComparisonMatrix(userVehicle = {}, candidates = []) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const comparisons = new Map(safeCandidates.map((candidate) => [
    candidate.id_idae,
    buildVehicleTechnicalComparison(userVehicle, candidate)
  ]));
  const input = userInput(userVehicle);
  const features = userVehicle.userFeatures || userVehicle;
  const fieldDefs = [
    ["marca", "Marca", () => comparisons.values().next().value?.marca?.user_display],
    ["modelo", "Modelo base", () => comparisons.values().next().value?.modelo?.user_display],
    ["year", "Año/MY", () => comparisons.values().next().value?.year?.user_display],
    ["motorizacion", "Combustible / motorización", () => comparisons.values().next().value?.motorizacion?.user_display],
    ["cambio", "Tipo de cambio", () => comparisons.values().next().value?.cambio?.user_display],
    ["cilindrada", "Cilindrada", () => comparisons.values().next().value?.cilindrada?.user_display],
    ["potencia_termica", "Potencia termica", () => comparisons.values().next().value?.potencia_termica?.user_display, (candidate) => formatKw(candidate.potenciaTermicaKw || candidateDetail(candidate, "Potencia térmica"))],
    ["potencia", "Potencia equivalente", () => comparisons.values().next().value?.potencia?.user_display],
    ["potencia_electrica", "Potencia eléctrica", () => EMPTY, (candidate) => formatKw(candidate.potenciaElectricaKw || candidateDetail(candidate, "Potencia eléctrica"))],
    ["emisiones", "Emisiones WLTP", () => comparisons.values().next().value?.emisiones?.user_display],
    ["consumo_medio", "Consumo medio WLTP", () => EMPTY, (candidate) => formatConsumption(candidate.consumoLitros100 || candidate.raw?.tabla_wltp?.consumo_minimo || candidate.raw?.tabla_wltp?.consumo_maximo, "L/100km")],
    ["consumo_electrico", "Consumo eléctrico", () => EMPTY, (candidate) => formatConsumption(candidate.consumoElectricoKwh100 || candidateDetail(candidate, "Consumo eléctrico"), "kWh/100km")],
    ["segmento", "Segmento / carrocería", () => features.carroceria || rawValue(input, "carroceria", "Carroceria_Nuevo") || EMPTY, (candidate) => candidate.segmento || candidate.carroceriaDetectada || EMPTY],
    ["mtma", "MTMA", () => EMPTY, (candidate) => safeDisplay(candidateDetail(candidate, "MTMA"))],
    ["plazas", "Plazas máximas", () => EMPTY, (candidate) => safeDisplay(candidateDetail(candidate, "Nº de Plazas Máximas"))]
  ];

  return {
    fields: fieldDefs.map(([key, label, userGetter, candidateGetter]) => ({
      key,
      label: comparisons.values().next().value?.[key]?.label || label,
      userValue: userGetter() || EMPTY,
      candidates: safeCandidates.map((candidate) => {
        const structured = comparisons.get(candidate.id_idae)?.[key];
        return {
          candidateId: candidate.id_idae,
          value: structured?.idae_display || candidateGetter?.(candidate) || EMPTY,
          status: structured?.status || "missing",
          statusLabel: structured?.status_label || "No informado",
          explanation: structured?.explanation || `${label}: dato no informado`
        };
      })
    }))
  };
}

export function compareTechnicalValue(userValue, dbValue, tolerances, label, formatter) {
  const user = Number(userValue);
  const db = Number(dbValue);
  if (!Number.isFinite(user) || !Number.isFinite(db)) {
    return { status: "", label, diff: null, explanation: "" };
  }
  const diff = Math.abs(user - db);
  if (diff <= tolerances.compatible) {
    return { status: "compatible", label, diff, explanation: `${label} compatible (${formatter(user)} frente a ${formatter(db)})` };
  }
  if (diff <= tolerances.doubtful) {
    return { status: "dudosa", label, diff, explanation: `${label} dudosa (${formatter(user)} frente a ${formatter(db)})` };
  }
  return { status: "distinta", label, diff, explanation: `${label} distinta (${formatter(user)} frente a ${formatter(db)})` };
}

export function compareTechnicalSpecs(user = {}, candidate = {}) {
  return {
    cilindrada: compareTechnicalValue(user.cilindradaCc, candidate.cilindradaCc, { compatible: 20, doubtful: 100 }, "cilindrada", formatCilindradaCc),
    potencia: compareTechnicalValue(user.potenciaCv || convertKwToCv(user.potenciaTermicaKw), candidate.potenciaCv, { compatible: 5, doubtful: 15 }, "potencia", formatPotenciaCv),
    emisiones: compareTechnicalValue(user.emisionesWltpGco2Km, candidate.emisionesWltpGco2Km, { compatible: 5, doubtful: 15 }, "emisiones", formatEmisionesGco2Km)
  };
}

export function technicalScoreAdjustment(comparison, weight) {
  if (!comparison?.status) return weight * 0.25;
  if (comparison.status === "compatible") return weight;
  if (comparison.status === "dudosa") return weight * 0.45;
  return -weight * 0.6;
}

export function normalizeTechnicalSpecs(vehicleOrCandidate = {}) {
  const potenciaTermicaKw = parsePowerKw(vehicleOrCandidate.potencia_termica_kw ?? vehicleOrCandidate.potenciaTermicaKw ?? vehicleOrCandidate.Potencia_Termica_kW_Nuevo ?? vehicleOrCandidate.Potencia_Termica_kW_Vendido ?? vehicleOrCandidate.Potencia_Nuevo ?? vehicleOrCandidate.potencia);
  return {
    cilindrada_cc: parseCilindradaCc(vehicleOrCandidate.cilindrada_cc ?? vehicleOrCandidate.cilindradaCc ?? vehicleOrCandidate.Cilindrada_Nuevo ?? vehicleOrCandidate.cilindrada),
    potencia_termica_kw: potenciaTermicaKw,
    potencia_cv_calculada: convertKwToCv(potenciaTermicaKw),
    potencia_cv_conversion_factor: KW_TO_CV,
    potencia_origen: "plantilla_kw",
    potencia_cv: parsePotenciaCv(vehicleOrCandidate.potencia_cv ?? vehicleOrCandidate.potenciaCv) || convertKwToCv(potenciaTermicaKw),
    emisiones_wltp_gco2_km: parseEmisionesGco2Km(vehicleOrCandidate.emisiones_wltp_gco2_km ?? vehicleOrCandidate.emisionesWltpGco2Km ?? vehicleOrCandidate.Emisiones_WLTP_gCO2_km ?? vehicleOrCandidate.emisiones)
  };
}

export function parseOptionalNumber(value) {
  return parseNumber(value);
}
