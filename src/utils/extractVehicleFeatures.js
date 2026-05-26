import { dateToYear, normalizeText, parseNumber } from "./normalize.js";

const KNOWN_BRANDS = [
  "abarth", "aiways", "audi", "bmw", "byd", "citroen", "cupra", "dacia", "ds", "fiat",
  "ford", "honda", "hyundai", "jaguar", "jeep", "kia", "lexus", "mazda", "mercedes",
  "mg", "mini", "mitsubishi", "nissan", "opel", "peugeot", "porsche", "renault",
  "seat", "skoda", "smart", "subaru", "suzuki", "tesla", "toyota", "volkswagen",
  "volvo", "zero motorcycles"
];

export function detectBrand(text = "") {
  const normalized = normalizeText(text);
  return KNOWN_BRANDS.find((brand) => normalized.startsWith(brand) || normalized.includes(` ${brand} `)) || normalized.split(" ")[0] || "";
}

export function extractCilindrada(value = "") {
  const text = normalizeText(value);
  const cc = text.match(/\b([1-9]\d{2,4})\s*(cc|cm3)?\b/);
  if (cc) return Number(cc[1]);
  const litros = text.match(/\b([0-9],[0-9]|[0-9]\.[0-9])\b/);
  if (litros) return Math.round(Number(litros[1].replace(",", ".")) * 1000);
  return null;
}

export function extractYearMY(...values) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  const my = text.match(/\bmy\s?(\d{2}|\d{4})\b/);
  if (my) return Number(my[1].length === 2 ? `20${my[1]}` : my[1]);
  const year = text.match(/\b(20[1-3]\d)\b/);
  if (year) return Number(year[1]);
  return values.map(dateToYear).find(Boolean) || null;
}

export function extractPowerCv(value = "") {
  const text = normalizeText(value);
  const cv = text.match(/(\d{2,4}([,.]\d+)?)\s*cv/);
  if (cv) return Number(cv[1].replace(",", "."));
  const kw = text.match(/(\d{2,4}([,.]\d+)?)\s*kw/);
  if (kw) return Math.round(Number(kw[1].replace(",", ".")) * 1.35962);
  return parseNumber(value);
}

export function extractMotorizacion(...values) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  if (text.includes("gas natural") || text.includes("gnc")) return "gas natural";
  if (text.includes("glp")) return "GLP";
  if (text.includes("enchufable")) return "hibrido enchufable";
  if (text.includes("electrico puro")) return "electrico puro";
  if (text.includes("hibrido") && text.includes("diesel")) return "hibrido diesel";
  if (text.includes("hibrido")) return "hibrido gasolina";
  if (text.includes("diesel")) return "diesel";
  if (text.includes("gasolina")) return "gasolina";
  return "";
}

export function extractCambio(...values) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  if (text.includes("automatico") || text.includes("auto")) return "automatico";
  if (text.includes("manual")) return "manual";
  return "";
}

export function extractCarroceria(...values) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  if (text.includes("touring sport") || text.includes("familiar")) return "touring sport";
  if (text.includes("hatchback")) return "hatchback";
  if (text.includes("sedan") || text.includes("berlina")) return "sedan";
  if (text.includes("furgoneta")) return "furgoneta";
  if (text.includes("motocicleta")) return "motocicleta";
  if (text.includes("suv")) return "SUV";
  return "";
}

function detailValue(detail, wantedKey) {
  const wanted = normalizeText(wantedKey);
  const found = Object.entries(detail || {}).find(([key]) => normalizeText(key) === wanted);
  return found?.[1] || "";
}

export function featuresFromUser(row) {
  const model = row.Marca_modelo_Nuevo || "";
  return {
    marca: detectBrand(model),
    modeloNormalizado: normalizeText([model, row.Version_Acabado_Nuevo].filter(Boolean).join(" ")),
    cilindradaCc: extractCilindrada(`${row.Cilindrada_Nuevo || ""} ${model}`),
    yearMY: extractYearMY(row.Anio_Modelo_MY_Nuevo, row.Matriculacion_Nuevo, row["Fecha Compra"], model),
    motorizacion: extractMotorizacion(row.Combustible_Motorizacion_Nuevo, model),
    potenciaCv: extractPowerCv(row.Potencia_Nuevo),
    tipoCambio: extractCambio(row.Tipo_Cambio_Nuevo, model),
    carroceria: extractCarroceria(row.Carroceria_Nuevo, model, row.Version_Acabado_Nuevo)
  };
}

export function normalizeIdaeVehicle(vehicle) {
  const detail = vehicle.detalle_tecnico || {};
  const model = vehicle.modelo_tabla || detail.Nombre || vehicle.titulo_modal || "";
  const cilindradaCc = extractCilindrada(detailValue(detail, "Cilindrada") || model);
  return {
    id_idae: vehicle.id_idae,
    modeloOriginal: model,
    modeloNormalizado: normalizeText(model),
    marcaDetectada: detectBrand(model),
    familiaModeloDetectada: normalizeText(model).split(" ").slice(0, 3).join(" "),
    yearMY: extractYearMY(model, detail.Nombre),
    cilindradaCc,
    cilindradaLitros: cilindradaCc ? cilindradaCc / 1000 : null,
    motorizacion: extractMotorizacion(detailValue(detail, "Motorización"), model),
    tipoCambio: extractCambio(detailValue(detail, "Tipo de cambio"), model),
    potenciaCv: extractPowerCv(detailValue(detail, "Potencia")),
    potenciaTermicaKw: parseNumber(detailValue(detail, "Potencia térmica")),
    potenciaElectricaKw: parseNumber(detailValue(detail, "Potencia eléctrica")),
    segmento: detailValue(detail, "Segmento comercial"),
    carroceriaDetectada: extractCarroceria(detailValue(detail, "Segmento comercial"), model),
    consumoElectricoKwh100: parseNumber(detailValue(detail, "Consumo eléctrico")),
    consumoLitros100: parseNumber(detailValue(detail, "Consumo mixto") || detailValue(detail, "Consumo Medio")),
    source_url: vehicle.source_url,
    raw: vehicle
  };
}
