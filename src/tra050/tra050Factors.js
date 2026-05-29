import { TRA050_FACTORES_CONVERSION } from "../data/tra050-reference.js";

export const TRA050_FACTORS = TRA050_FACTORES_CONVERSION;

export const TRA050_FACTORES_CONVERSION_NORMALIZADOS = {
  diesel: TRA050_FACTORES_CONVERSION.diesel_litro_a_kwh ?? 10.0,
  gasolina: TRA050_FACTORES_CONVERSION.gasolina_litro_a_kwh ?? 9.19,
  glp: TRA050_FACTORES_CONVERSION.GLP_litro_a_kwh ?? 7.16,
  gas_natural: TRA050_FACTORES_CONVERSION.GAS_nATURAL_litro_a_kwh ?? 13.33
};

export function normalizeFuelForTra050Factor(combustible = "") {
  const text = String(combustible || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (text.includes("gas natural") || /\b(gnc|gnv|cng)\b/.test(text)) return "gas_natural";
  if (text.includes("glp") || text.includes("gpl") || text.includes("lpg")) return "glp";
  if (text.includes("hibrido diesel") || text.includes("diesel") || text.includes("gasoleo") || text.includes("petroleo") || /\b(tdi|hdi|bluehdi|dci|cdi|di)\b/.test(text)) return "diesel";
  if (text.includes("hibrido gasolina") || text.includes("gasolina") || text.includes("petrol") || /\bpet\b/.test(text)) return "gasolina";
  return "";
}

export function factorForFuel(combustible = "", unit = "") {
  const fuelKey = normalizeFuelForTra050Factor(`${combustible} ${unit}`);
  if (fuelKey === "gas_natural") return { factor: TRA050_FACTORES_CONVERSION_NORMALIZADOS.gas_natural, fuelKey, key: "gas_natural", unit: "kWh/kg" };
  if (fuelKey === "glp") return { factor: TRA050_FACTORES_CONVERSION_NORMALIZADOS.glp, fuelKey, key: "glp", unit: "kWh/L" };
  if (fuelKey === "diesel") return { factor: TRA050_FACTORES_CONVERSION_NORMALIZADOS.diesel, fuelKey, key: "diesel", unit: "kWh/L" };
  if (fuelKey === "gasolina") return { factor: TRA050_FACTORES_CONVERSION_NORMALIZADOS.gasolina, fuelKey, key: "gasolina", unit: "kWh/L" };
  return { factor: null, fuelKey: "", key: "", unit: "", warning: `No hay factor de conversion configurado para ${combustible || unit || "combustible desconocido"}.` };
}
