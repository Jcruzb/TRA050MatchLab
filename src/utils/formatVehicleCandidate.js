import { normalizeText } from "./normalize.js";
import { compareTechnicalSpecs, formatCilindradaCc, formatEmisionesGco2Km, formatPotenciaCv, parseEmisionesGco2Km } from "./technicalSpecs.js";

const EMPTY = "-";

function valueOf(detail, label) {
  const wanted = normalizeText(label);
  const found = Object.entries(detail || {}).find(([key]) => normalizeText(key) === wanted);
  const value = found?.[1];
  return value === undefined || value === null || value === "" ? EMPTY : String(value);
}

function clean(value) {
  if (value === undefined || value === null || value === "") return EMPTY;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function badge(label, tone = "info") {
  return { label, tone };
}

export function candidateSearchText(candidate) {
  return normalizeText([
    candidate.id_idae,
    candidate.modeloOriginal,
    candidate.raw?.titulo_modal,
    candidate.marcaDetectada,
    candidate.modelBase,
    candidate.motorizacion,
    candidate.cilindradaCc,
    candidate.potenciaCv,
    candidate.emisionesWltpGco2Km,
    candidate.tipoCambio,
    candidate.segmento
  ].filter(Boolean).join(" "));
}

export function formatVehicleCandidate(candidate, userFeatures = {}) {
  const raw = candidate.raw || {};
  const detail = raw.detalle_tecnico || {};
  const wltp = raw.tabla_wltp || {};
  const consumo = candidate.consumoElectricoKwh100 || candidate.consumoLitros100 || valueOf(detail, "Consumo electrico") || valueOf(detail, "Consumo mixto");
  const emisionesValue = candidate.emisionesWltpGco2Km || parseEmisionesGco2Km(valueOf(detail, "Emisiones segun ciclo WLTP") !== EMPTY ? valueOf(detail, "Emisiones segun ciclo WLTP") : (wltp.emisiones_minimo || wltp.emisiones_maximo));
  const technicalComparison = candidate.technicalComparison || compareTechnicalSpecs(userFeatures, candidate);
  const technicalMatches = Object.values(technicalComparison).filter((item) => item.status === "compatible").map((item) => item.explanation);
  const technicalDifferences = Object.values(technicalComparison).filter((item) => ["dudosa", "distinta"].includes(item.status)).map((item) => item.explanation);
  const formatted = {
    idIdae: clean(candidate.id_idae || raw.id_idae),
    title: clean(candidate.modeloOriginal || raw.modelo_tabla || valueOf(detail, "Nombre")),
    subtitle: clean(raw.titulo_modal),
    brand: clean(candidate.marcaDetectada),
    modelBase: clean(candidate.modelBase),
    score: candidate.score ?? EMPTY,
    sourceUrl: clean(candidate.source_url || raw.source_url),
    raw,
    compactFields: [
      ["Motorizacion", clean(candidate.motorizacion || valueOf(detail, "Motorizacion"))],
      ["Cilindrada", formatCilindradaCc(candidate.cilindradaCc || valueOf(detail, "Cilindrada"))],
      ["Potencia", formatPotenciaCv(candidate.potenciaCv || valueOf(detail, "Potencia"))],
      ["Cambio", clean(candidate.tipoCambio || valueOf(detail, "Tipo de cambio"))],
      ["Segmento", clean(candidate.segmento || valueOf(detail, "Segmento comercial"))],
      ["Consumo", clean(consumo)],
      ["Emisiones", formatEmisionesGco2Km(emisionesValue)]
    ],
    technicalRows: [
      ["ID IDAE", clean(candidate.id_idae || raw.id_idae)],
      ["Nombre", valueOf(detail, "Nombre")],
      ["Modelo tabla", clean(raw.modelo_tabla)],
      ["Titulo modal", clean(raw.titulo_modal)],
      ["Marca", clean(candidate.marcaDetectada)],
      ["Modelo base", clean(candidate.modelBase)],
      ["Segmento comercial", valueOf(detail, "Segmento comercial")],
      ["Motorizacion", clean(candidate.motorizacion || valueOf(detail, "Motorizacion"))],
      ["Cilindrada", formatCilindradaCc(candidate.cilindradaCc || valueOf(detail, "Cilindrada"))],
      ["Tipo de cambio", clean(candidate.tipoCambio || valueOf(detail, "Tipo de cambio"))],
      ["MTMA", valueOf(detail, "MTMA")],
      ["Potencia", formatPotenciaCv(candidate.potenciaCv || valueOf(detail, "Potencia"))],
      ["Potencia termica", valueOf(detail, "Potencia termica")],
      ["Potencia electrica", clean(candidate.potenciaElectricaKw || valueOf(detail, "Potencia electrica"))],
      ["Autonomia electrica", valueOf(detail, "Autonomia electrica")],
      ["Consumo medio WLTP", clean(candidate.consumoLitros100 || wltp.consumo_minimo || wltp.consumo_maximo)],
      ["Consumo electrico", clean(candidate.consumoElectricoKwh100 || valueOf(detail, "Consumo electrico"))],
      ["Capacidad bateria", valueOf(detail, "Capacidad de bateria")],
      ["Emisiones WLTP", formatEmisionesGco2Km(emisionesValue)],
      ["Dimensiones", valueOf(detail, "Dimensiones (largo x ancho x alto)")],
      ["Plazas maximas", valueOf(detail, "Nº de Plazas Maximas")],
      ["Clasificacion energetica", clean(wltp.clasificacion_energetica)],
      ["Consumo minimo", clean(wltp.consumo_minimo)],
      ["Consumo maximo", clean(wltp.consumo_maximo)],
      ["Emisiones minimo", formatEmisionesGco2Km(wltp.emisiones_minimo)],
      ["Emisiones maximo", formatEmisionesGco2Km(wltp.emisiones_maximo)],
      ["Clasificacion consumo relativo", valueOf(detail, "Clasificacion por Consumo Relativo")],
      ["Tecnologia hibrida", valueOf(detail, "Tecnologia Hibrida (normal / enchufable)")],
      ["Score", clean(candidate.score)],
      ["Coincidencias", clean([...(candidate.matchedFeatures || []), ...technicalMatches].join(", "))],
      ["Diferencias", clean([...(candidate.penalties || []), ...technicalDifferences].join(", "))],
      ["Explicacion matching", clean(candidate.explicacion)],
      ["Source URL", clean(candidate.source_url || raw.source_url)]
    ]
  };

  const badges = [];
  if (userFeatures.brand && candidate.marcaDetectada === userFeatures.brand) badges.push(badge("Marca OK", "ok"));
  if (userFeatures.modelBase && (candidate.modelBase === userFeatures.modelBase || candidate.modeloNormalizado?.includes(userFeatures.modelBase))) badges.push(badge("Modelo OK", "ok"));
  if (userFeatures.year && candidate.yearMY && Math.abs(userFeatures.year - candidate.yearMY) <= 1) badges.push(badge("Año compatible", "ok"));
  if (candidate.motorizacion) badges.push(badge(candidate.motorizacion, "info"));
  if (candidate.tipoCambio) badges.push(badge(candidate.tipoCambio, "info"));
  Object.entries(technicalComparison).forEach(([key, comparison]) => {
    if (comparison.status === "dudosa") badges.push(badge(`${key} dudosa`, "warning"));
    if (comparison.status === "distinta") badges.push(badge(`${key} distinta`, "danger"));
  });
  if (candidate.potenciaElectricaKw) badges.push(badge("Electrico", "info"));
  formatted.badges = badges.slice(0, 8);

  formatted.comparison = {
    matches: [...(candidate.matchedFeatures || []), ...technicalMatches],
    differences: [...(candidate.penalties || []), ...technicalDifferences],
    explanation: clean(candidate.explicacion)
  };
  return formatted;
}
