import { TRA050_FACTORES_CONVERSION } from "../data/tra050-reference.js";

export const TRA050_FACTORS = TRA050_FACTORES_CONVERSION;

export function factorForFuel(combustible = "", unit = "") {
  const text = `${combustible} ${unit}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (text.includes("gas natural")) return { factor: TRA050_FACTORS.GAS_nATURAL_litro_a_kwh, key: "GAS_nATURAL_litro_a_kwh", unit: "kWh/kg" };
  if (text.includes("glp")) return { factor: TRA050_FACTORS.GLP_litro_a_kwh, key: "GLP_litro_a_kwh", unit: "kWh/L" };
  if (text.includes("diesel") || text.includes("diã")) return { factor: TRA050_FACTORS.diesel_litro_a_kwh, key: "diesel_litro_a_kwh", unit: "kWh/L" };
  if (text.includes("gasolina") || text.includes("hibrido gasolina") || text.includes("hã")) return { factor: TRA050_FACTORS.gasolina_litro_a_kwh, key: "gasolina_litro_a_kwh", unit: "kWh/L" };
  return { factor: null, key: "", unit: "", warning: `No hay factor de conversion configurado para ${combustible || unit || "combustible desconocido"}.` };
}
