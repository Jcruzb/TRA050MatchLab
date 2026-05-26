import { dateToYear, normalizeText, parseNumber, tokenize } from "./normalize.js";

export const BRAND_ALIASES = {
  peugeot: ["peugeot", "peuge", "peug", "pgt"],
  citroen: ["citroen", "citroën", "citro", "cit"],
  "mercedes-benz": ["mercedes", "mercedes benz", "mercedes-benz", "mb", "m-b", "benz"],
  volkswagen: ["volkswagen", "vw"],
  bmw: ["bmw"],
  audi: ["audi"],
  toyota: ["toyota"],
  renault: ["renault"],
  nissan: ["nissan"],
  ford: ["ford"],
  opel: ["opel"],
  seat: ["seat"],
  skoda: ["skoda", "škoda"],
  hyundai: ["hyundai"],
  kia: ["kia"],
  fiat: ["fiat"],
  jeep: ["jeep"],
  mazda: ["mazda"],
  volvo: ["volvo"],
  tesla: ["tesla"],
  mg: ["mg"],
  byd: ["byd"],
  polestar: ["polestar"],
  porsche: ["porsche"],
  lexus: ["lexus"],
  mini: ["mini"],
  smart: ["smart"],
  cupra: ["cupra"],
  dacia: ["dacia"],
  honda: ["honda"],
  zero: ["zero motorcycles", "zero"]
};

export const NON_MODEL_TOKENS = new Set([
  "my19", "my20", "my21", "my22", "my23", "my24", "my25", "my26",
  "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026",
  "automatico", "auto", "aut", "manual", "man", "diesel", "di", "tdi", "tsi",
  "hdi", "bluehdi", "dci", "sal", "mpv", "utilitario", "utl", "5s", "7s",
  "kw", "cv", "gasolina", "hibrido", "electrico", "puro", "enchufable"
]);

const HIGH_VALUE_MODEL_TOKENS = new Set([
  "q8", "q7", "q5", "a3", "a4", "a6", "a8", "x3", "x5", "i3",
  "citan", "corolla", "2008", "3008", "5008", "208", "308", "508",
  "c4", "berlingo", "kangoo", "transit", "ducato", "sprinter", "arteon",
  "corsa", "astra", "golf", "leon", "captur", "clio", "zs", "atto"
]);

export function isYearToken(token, index, tokens) {
  const value = Number(token);
  return /^\d{4}$/.test(token) && value >= 1990 && value <= 2035 && index === tokens.length - 1;
}

export function isRelevantSearchToken(token, index, tokens) {
  if (!token || token.length < 2) return false;
  if (NON_MODEL_TOKENS.has(token)) return false;
  if (isYearToken(token, index, tokens)) return false;
  return true;
}

export function buildBrandIndex(db = []) {
  const aliases = new Map();
  Object.entries(BRAND_ALIASES).forEach(([brand, values]) => {
    values.forEach((alias) => aliases.set(normalizeText(alias), brand));
  });

  db.forEach((vehicle) => {
    const source = [vehicle.modelo_tabla, vehicle.titulo_modal, vehicle.detalle_tecnico?.Nombre].filter(Boolean).join(" ");
    const first = tokenize(source)[0];
    if (first && first.length > 1 && !/^\d/.test(first) && !NON_MODEL_TOKENS.has(first)) aliases.set(first, aliases.get(first) || first);
  });

  return [...aliases.entries()]
    .map(([alias, brand]) => ({ alias, brand, tokens: alias.split(" ") }))
    .sort((a, b) => b.tokens.length - a.tokens.length || b.alias.length - a.alias.length);
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a, b) {
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

function brandFromModelTokens(tokens, modelBrandIndex) {
  const hits = tokens
    .map((token) => ({ token, entry: modelBrandIndex?.get(token) }))
    .filter((hit) => hit.entry);
  for (const hit of hits) {
    const brands = [...hit.entry.brands.entries()].sort((a, b) => b[1] - a[1]);
    if (brands[0] && (!brands[1] || brands[0][1] >= brands[1][1] * 2)) {
      return { brand: brands[0][0], token: hit.token };
    }
  }
  return null;
}

export function detectBrand(inputText = "", brandIndex = buildBrandIndex(), modelBrandIndex = null) {
  const normalized = normalizeText(inputText);
  const tokens = tokenize(normalized);
  for (const entry of brandIndex) {
    if (normalized === entry.alias || normalized.startsWith(`${entry.alias} `) || normalized.includes(` ${entry.alias} `)) {
      const confidence = entry.alias !== normalizeText(entry.brand) && entry.alias.length >= 4 ? "inferred_prefix" : "high";
      return { brand: entry.brand, confidence, matchedAlias: entry.alias };
    }
    if (entry.tokens.length === 1 && tokens[0] === entry.alias) {
      const confidence = entry.alias !== normalizeText(entry.brand) && entry.alias.length >= 4 ? "inferred_prefix" : "high";
      return { brand: entry.brand, confidence, matchedAlias: entry.alias };
    }
  }

  for (const token of tokens) {
    const prefix = brandIndex.find((entry) => token.length >= 4 && (entry.alias.startsWith(token) || token.startsWith(entry.alias)) && entry.alias.length >= 4);
    if (prefix) return { brand: prefix.brand, confidence: "inferred_prefix", matchedAlias: token };
  }

  const fuzzy = tokens.flatMap((token) => brandIndex
    .filter((entry) => token.length >= 4 && entry.alias.length >= 4)
    .map((entry) => ({ token, entry, score: similarity(token, entry.alias) }))
  ).sort((a, b) => b.score - a.score);
  if (fuzzy[0]?.score >= 0.82 && (!fuzzy[1] || fuzzy[0].score - fuzzy[1].score > 0.04)) {
    return { brand: fuzzy[0].entry.brand, confidence: "inferred_fuzzy", matchedAlias: fuzzy[0].token };
  }

  const modelHit = brandFromModelTokens(tokens, modelBrandIndex);
  if (modelHit) return { brand: modelHit.brand, confidence: "inferred_from_model", matchedAlias: modelHit.token };

  return { brand: "", confidence: "none", matchedAlias: "" };
}

export function extractModelBase(tokensOrText = "", inferredBrand = "", modelBrandIndex = null) {
  const tokens = Array.isArray(tokensOrText) ? tokensOrText : tokenize(tokensOrText);
  const brandAliases = new Set((BRAND_ALIASES[inferredBrand] || []).map(normalizeText));
  const candidates = tokens.filter((token, index) => (
    token !== inferredBrand &&
    !brandAliases.has(token) &&
    !NON_MODEL_TOKENS.has(token) &&
    !isYearToken(token, index, tokens)
  ));
  const indexed = candidates.find((token) => modelBrandIndex?.has(token));
  if (indexed) return indexed;
  const highValue = candidates.find((token) => HIGH_VALUE_MODEL_TOKENS.has(token));
  if (highValue) return highValue;
  const premiumCode = candidates.find((token) => /^[a-z]{1,3}\d{1,2}[a-z]?$/.test(token));
  if (premiumCode) return premiumCode;
  return candidates.find((token) => !/^\d{4}$/.test(token) || HIGH_VALUE_MODEL_TOKENS.has(token)) || "";
}

export function extractModelBaseFromText(text = "", brand = "", modelBrandIndex = null) {
  return extractModelBase(tokenize(text), brand, modelBrandIndex);
}

export function extractCilindrada(value = "") {
  const text = normalizeText(value);
  const cc = text.match(/\b([1-9]\d{2,4})\s*(cc|cm3)?\b/);
  if (cc && Number(cc[1]) < 9000) return Number(cc[1]);
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
  if (text.includes("sedan") || text.includes("berlina") || text.includes("sal")) return "sedan";
  if (text.includes("furgoneta")) return "furgoneta";
  if (text.includes("motocicleta")) return "motocicleta";
  if (text.includes("suv")) return "SUV";
  if (text.includes("mpv")) return "MPV";
  return "";
}

function detailValue(detail, wantedKey) {
  const wanted = normalizeText(wantedKey);
  const found = Object.entries(detail || {}).find(([key]) => normalizeText(key) === wanted);
  return found?.[1] || "";
}

export function featuresFromUser(row, brandIndex, modelBrandIndex) {
  const rawText = [
    row.Marca_modelo_Nuevo,
    row.Version_Acabado_Nuevo,
    row.Combustible_Motorizacion_Nuevo,
    row.Tipo_Cambio_Nuevo,
    row.Carroceria_Nuevo,
    row.Anio_Modelo_MY_Nuevo
  ].filter(Boolean).join(" ");
  const normalizedText = normalizeText(rawText);
  const modelTokens = tokenize(normalizedText);
  let brandResult = detectBrand(normalizedText, brandIndex, modelBrandIndex);
  const modelBase = extractModelBase(modelTokens, brandResult.brand, modelBrandIndex);
  const modelBrand = modelBrandIndex?.get(modelBase);
  if (modelBrand && brandResult.brand) {
    const count = modelBrand.brands.get(brandResult.brand) || 0;
    if (count > 0 && brandResult.confidence === "high") {
      brandResult = { ...brandResult, confidence: "high" };
    }
    if (count > 0 && brandResult.confidence === "inferred_prefix" && brandResult.matchedAlias.length <= 3) {
      brandResult = { ...brandResult, confidence: "inferred_from_alias_and_model" };
    }
  }
  if (!brandResult.brand && modelBrand) {
    const [brand] = [...modelBrand.brands.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (brand) brandResult = { brand, confidence: "inferred_from_model", matchedAlias: modelBase };
  }
  if (brandResult.brand === "mercedes-benz" && modelBase === "citan" && modelTokens.includes("mb")) {
    brandResult = { brand: "mercedes-benz", confidence: "inferred_from_alias_and_model", matchedAlias: "mb+citan" };
  }
  return {
    rawText,
    normalizedText,
    brand: brandResult.brand,
    brandConfidence: brandResult.confidence,
    matchedAlias: brandResult.matchedAlias,
    modelTokens,
    modelBase,
    year: extractYearMY(row.Anio_Modelo_MY_Nuevo, row.Matriculacion_Nuevo, row["Fecha Compra"], rawText),
    possibleMY: extractYearMY(row.Anio_Modelo_MY_Nuevo, rawText),
    cilindrada: extractCilindrada(`${row.Cilindrada_Nuevo || ""} ${rawText}`),
    cilindradaCc: extractCilindrada(`${row.Cilindrada_Nuevo || ""} ${rawText}`),
    motorizacion: extractMotorizacion(row.Combustible_Motorizacion_Nuevo, rawText),
    potenciaCv: extractPowerCv(row.Potencia_Nuevo),
    cambio: extractCambio(row.Tipo_Cambio_Nuevo, rawText),
    tipoCambio: extractCambio(row.Tipo_Cambio_Nuevo, rawText),
    carroceria: extractCarroceria(row.Carroceria_Nuevo, rawText),
    versionTokens: tokenize(row.Version_Acabado_Nuevo || ""),
    rejectedModelTokens: modelTokens.filter((token, index) => NON_MODEL_TOKENS.has(token) || isYearToken(token, index, modelTokens))
  };
}

export function normalizeIdaeVehicle(vehicle, brandIndex) {
  const detail = vehicle.detalle_tecnico || {};
  const model = vehicle.modelo_tabla || detailValue(detail, "Nombre") || vehicle.titulo_modal || "";
  const normalized = normalizeText(model);
  const brandResult = detectBrand(normalized, brandIndex);
  const modelBase = extractModelBaseFromText(normalized, brandResult.brand);
  const cilindradaCc = extractCilindrada(detailValue(detail, "Cilindrada") || model);
  const extraText = normalizeText([
    model,
    vehicle.titulo_modal,
    detailValue(detail, "Nombre"),
    detailValue(detail, "Motorización"),
    detailValue(detail, "Segmento comercial"),
    detailValue(detail, "Tipo de cambio")
  ].filter(Boolean).join(" "));
  return {
    id_idae: vehicle.id_idae,
    modeloOriginal: model,
    modeloNormalizado: normalized,
    searchableText: extraText,
    searchableTokens: tokenize(extraText),
    marcaDetectada: brandResult.brand,
    brandConfidence: brandResult.confidence,
    modelBase,
    modelTokens: tokenize(normalized),
    familiaModeloDetectada: [brandResult.brand, modelBase].filter(Boolean).join(" "),
    yearMY: extractYearMY(model, detailValue(detail, "Nombre")),
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
