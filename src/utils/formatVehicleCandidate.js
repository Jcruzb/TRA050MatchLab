import { normalizeText } from "./normalize.js";

const EMPTY = "—";

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
    candidate.tipoCambio,
    candidate.segmento
  ].filter(Boolean).join(" "));
}

export function formatVehicleCandidate(candidate, userFeatures = {}) {
  const raw = candidate.raw || {};
  const detail = raw.detalle_tecnico || {};
  const wltp = raw.tabla_wltp || {};
  const consumo = candidate.consumoElectricoKwh100 || candidate.consumoLitros100 || valueOf(detail, "Consumo eléctrico") || valueOf(detail, "Consumo mixto");
  const emisiones = valueOf(detail, "Emisiones según ciclo WLTP") !== EMPTY ? valueOf(detail, "Emisiones según ciclo WLTP") : clean(wltp.emisiones_minimo || wltp.emisiones_maximo);
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
      ["Motorización", clean(candidate.motorizacion || valueOf(detail, "Motorización"))],
      ["Cilindrada", candidate.cilindradaCc ? `${candidate.cilindradaCc} cc` : valueOf(detail, "Cilindrada")],
      ["Potencia", candidate.potenciaCv ? `${candidate.potenciaCv} cv` : valueOf(detail, "Potencia")],
      ["Cambio", clean(candidate.tipoCambio || valueOf(detail, "Tipo de cambio"))],
      ["Segmento", clean(candidate.segmento || valueOf(detail, "Segmento comercial"))],
      ["Consumo", clean(consumo)],
      ["Emisiones", clean(emisiones)]
    ],
    technicalRows: [
      ["ID IDAE", clean(candidate.id_idae || raw.id_idae)],
      ["Nombre", valueOf(detail, "Nombre")],
      ["Modelo tabla", clean(raw.modelo_tabla)],
      ["Título modal", clean(raw.titulo_modal)],
      ["Marca", clean(candidate.marcaDetectada)],
      ["Modelo base", clean(candidate.modelBase)],
      ["Segmento comercial", valueOf(detail, "Segmento comercial")],
      ["Motorización", clean(candidate.motorizacion || valueOf(detail, "Motorización"))],
      ["Cilindrada", valueOf(detail, "Cilindrada")],
      ["Tipo de cambio", clean(candidate.tipoCambio || valueOf(detail, "Tipo de cambio"))],
      ["MTMA", valueOf(detail, "MTMA")],
      ["Potencia", clean(candidate.potenciaCv || valueOf(detail, "Potencia"))],
      ["Potencia térmica", valueOf(detail, "Potencia térmica")],
      ["Potencia eléctrica", clean(candidate.potenciaElectricaKw || valueOf(detail, "Potencia eléctrica"))],
      ["Autonomía eléctrica", valueOf(detail, "Autonomía eléctrica")],
      ["Consumo medio WLTP", clean(candidate.consumoLitros100 || wltp.consumo_minimo || wltp.consumo_maximo)],
      ["Consumo eléctrico", clean(candidate.consumoElectricoKwh100 || valueOf(detail, "Consumo eléctrico"))],
      ["Capacidad batería", valueOf(detail, "Capacidad de batería")],
      ["Emisiones WLTP", clean(emisiones)],
      ["Dimensiones", valueOf(detail, "Dimensiones (largo x ancho x alto)")],
      ["Plazas máximas", valueOf(detail, "Nº de Plazas Máximas")],
      ["Clasificación energética", clean(wltp.clasificacion_energetica)],
      ["Consumo mínimo", clean(wltp.consumo_minimo)],
      ["Consumo máximo", clean(wltp.consumo_maximo)],
      ["Emisiones mínimo", clean(wltp.emisiones_minimo)],
      ["Emisiones máximo", clean(wltp.emisiones_maximo)],
      ["Clasificación consumo relativo", valueOf(detail, "Clasificación por Consumo Relativo")],
      ["Tecnología híbrida", valueOf(detail, "Tecnología Híbrida (normal / enchufable)")],
      ["Score", clean(candidate.score)],
      ["Coincidencias", clean((candidate.matchedFeatures || []).join(", "))],
      ["Diferencias", clean((candidate.penalties || []).join(", "))],
      ["Explicación matching", clean(candidate.explicacion)],
      ["Source URL", clean(candidate.source_url || raw.source_url)]
    ]
  };

  const badges = [];
  if (userFeatures.brand && candidate.marcaDetectada === userFeatures.brand) badges.push(badge("Marca OK", "ok"));
  if (userFeatures.modelBase && (candidate.modelBase === userFeatures.modelBase || candidate.modeloNormalizado?.includes(userFeatures.modelBase))) badges.push(badge("Modelo OK", "ok"));
  if (userFeatures.year && candidate.yearMY && Math.abs(userFeatures.year - candidate.yearMY) <= 1) badges.push(badge("Año compatible", "ok"));
  if (candidate.motorizacion) badges.push(badge(candidate.motorizacion, "info"));
  if (candidate.tipoCambio) badges.push(badge(candidate.tipoCambio, "info"));
  if (userFeatures.cilindradaCc && candidate.cilindradaCc && Math.abs(userFeatures.cilindradaCc - candidate.cilindradaCc) > 120) badges.push(badge("Cilindrada dudosa", "warning"));
  if (candidate.potenciaElectricaKw) badges.push(badge("Eléctrico", "info"));
  formatted.badges = badges.slice(0, 8);

  formatted.comparison = {
    matches: candidate.matchedFeatures || [],
    differences: candidate.penalties || [],
    explanation: clean(candidate.explicacion)
  };
  return formatted;
}
