import { normalizeText, parseNumber } from "./normalize.js";

const EMPTY = "-";

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
  if (text.includes("kw") && !text.includes("cv")) return Number((number * 1.35962).toFixed(1));
  return Number(number.toFixed(1));
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

export function formatEmisionesGco2Km(value) {
  const parsed = parseEmisionesGco2Km(value);
  return parsed === null ? EMPTY : `${parsed.toLocaleString("es-ES")} g CO2/km`;
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
    potencia: compareTechnicalValue(user.potenciaCv, candidate.potenciaCv, { compatible: 5, doubtful: 15 }, "potencia", formatPotenciaCv),
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
  return {
    cilindrada_cc: parseCilindradaCc(vehicleOrCandidate.cilindrada_cc ?? vehicleOrCandidate.cilindradaCc ?? vehicleOrCandidate.Cilindrada_Nuevo ?? vehicleOrCandidate.cilindrada),
    potencia_cv: parsePotenciaCv(vehicleOrCandidate.potencia_cv ?? vehicleOrCandidate.potenciaCv ?? vehicleOrCandidate.Potencia_Nuevo ?? vehicleOrCandidate.potencia),
    emisiones_wltp_gco2_km: parseEmisionesGco2Km(vehicleOrCandidate.emisiones_wltp_gco2_km ?? vehicleOrCandidate.emisionesWltpGco2Km ?? vehicleOrCandidate.Emisiones_WLTP_gCO2_km ?? vehicleOrCandidate.emisiones)
  };
}

export function parseOptionalNumber(value) {
  return parseNumber(value);
}
