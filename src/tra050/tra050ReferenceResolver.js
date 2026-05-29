import { TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO } from "../data/tra050-reference.js";
import { normalizeText } from "../utils/normalize.js";

const FUEL_LABELS = {
  gasolina: "gasolina",
  diesel: "di\u00e9sel",
  glp: "GLP",
  gas_natural: "gas natural",
  hibrido_gasolina: "h\u00edbrido gasolina",
  hibrido_diesel: "h\u00edbrido di\u00e9sel"
};

const FUEL_ALIASES = [
  { fuel: FUEL_LABELS.hibrido_diesel, patterns: [/\bhibrido diesel\b/, /\bhev diesel\b/, /\bdiesel hibrido\b/] },
  { fuel: FUEL_LABELS.hibrido_gasolina, patterns: [/\bhibrido gasolina\b/, /\bhev gasolina\b/, /\bgasolina hibridos?\b/, /\bgasolina\b.*\bhibrido\b/, /\bhybrid petrol\b/] },
  { fuel: FUEL_LABELS.gas_natural, patterns: [/\bgas natural\b/, /\bg natural\b/, /\bgnc\b/, /\bgnv\b/, /\bcng\b/] },
  { fuel: FUEL_LABELS.glp, patterns: [/\bglp\b/, /\bgpl\b/, /\blpg\b/, /\bautogas\b/] },
  { fuel: FUEL_LABELS.gasolina, patterns: [/\bpetroleo gasolina\b/, /\bgasolina\b/, /\bgas\b/, /\bpetrol\b/, /\bpet\b/] },
  { fuel: FUEL_LABELS.diesel, patterns: [/\bdiesel\b/, /\bgasoleo\b/, /\bpetroleo\b/, /\bdi\b/, /\btdi\b/, /\bhdi\b/, /\bbluehdi\b/, /\bdci\b/, /\bcdi\b/] },
];

const FUEL_SOURCE_FIELDS = [
  { key: "Combustible_Motorizacion_Nuevo", canonical: "combustible_motorizacion", label: "Combustible_Motorizacion_Nuevo" },
  { key: "Marca_modelo_Nuevo", canonical: "marca_modelo", label: "Marca_modelo_Nuevo" },
  { key: "Observaciones_Nuevo", canonical: "observaciones", label: "Observaciones_Nuevo" }
];

function pickField(vehicle, field) {
  return vehicle?.input?.[field.key] || vehicle?.input?.[field.canonical] || vehicle?.[field.key] || vehicle?.[field.canonical] || "";
}

function getCategory(vehicle) {
  const value = vehicle?.input?.Categoria_nuevo || vehicle?.input?.categoria || vehicle?.Categoria_nuevo || vehicle?.categoria || "";
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/\b(M1|M2|M3|N1|N2|N3|L\d?E?|L)\b/);
  if (!match) return "";
  return match[1].startsWith("L") ? "L" : match[1];
}

function normalizeFuelText(value) {
  return normalizeText(value)
    .replace(/\bdi\u00e9sel\b/g, "diesel")
    .replace(/\bdiesel\b/g, "diesel")
    .replace(/\bh\u00edbrido\b/g, "hibrido");
}

function detectFuel(value) {
  const text = normalizeFuelText(value);
  if (!text) return null;
  const matches = [];
  FUEL_ALIASES.forEach(({ fuel, patterns }) => {
    const pattern = patterns.find((entry) => entry.test(text));
    if (pattern) matches.push({ fuel, token: text.match(pattern)?.[0] || fuel });
  });
  if (!matches.length) return null;
  const first = matches[0];
  return { fuel: first.fuel, token: first.token };
}

export function normalizeFuel(value) {
  return detectFuel(value)?.fuel || "";
}

function normalizeReferenceFuel(value) {
  const normalized = normalizeFuel(value);
  if (normalized) return normalized;
  const text = normalizeFuelText(value);
  if (text.includes("hibrido diesel")) return FUEL_LABELS.hibrido_diesel;
  if (text.includes("hibrido gasolina")) return FUEL_LABELS.hibrido_gasolina;
  if (text.includes("gas natural")) return FUEL_LABELS.gas_natural;
  if (text.includes("glp")) return FUEL_LABELS.glp;
  if (text.includes("diesel")) return FUEL_LABELS.diesel;
  if (text.includes("gasolina")) return FUEL_LABELS.gasolina;
  return value;
}

function referenceCategory(reference) {
  if (reference.categoria) return reference.categoria;
  const match = String(reference.tipologia || "").match(/\b(M1|M2|M3|N1|N2|N3|L)\b/);
  return match ? match[1] : "";
}

function referenceSubtype(reference) {
  if (reference.subtipo) return reference.subtipo;
  const text = normalizeText(reference.tipologia || "");
  if (text.includes("furgonetas grandes")) return "furgoneta_grande";
  if (text.includes("camion")) return "camion_menor_3500";
  return "";
}

function detectSubtype(vehicle) {
  const text = normalizeText([
    vehicle?.input?.Marca_modelo_Nuevo,
    vehicle?.input?.marca_modelo,
    vehicle?.input?.Carroceria_Nuevo,
    vehicle?.input?.carroceria,
    vehicle?.input?.Observaciones_Nuevo,
    vehicle?.input?.observaciones,
    vehicle?.Marca_modelo_Nuevo,
    vehicle?.marca_modelo,
    vehicle?.Carroceria_Nuevo,
    vehicle?.carroceria,
    vehicle?.Observaciones_Nuevo,
    vehicle?.observaciones
  ].filter(Boolean).join(" "));
  if (/\b(camion|cami[o\u00f3]n|truck)\b/.test(text)) return "camion_menor_3500";
  if (/\b(furgoneta grande|van grande|large van)\b/.test(text)) return "furgoneta_grande";
  return "";
}

export function getThermalTra050References() {
  return TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO.map((reference) => {
    const combustible = normalizeReferenceFuel(reference.combustible);
    return {
      ...reference,
      key: `termico-${reference.tipologia}-${combustible}-${referenceSubtype(reference) || reference.subtipo || "generic"}`,
      categoria: referenceCategory(reference),
      subtipo: referenceSubtype(reference) || reference.subtipo,
      combustible,
      consumo: reference.tipologia === "M1 - turismo" && combustible === FUEL_LABELS.hibrido_gasolina ? 5.13 : reference.consumo
    };
  });
}

function inferFuel(vehicle) {
  for (const field of FUEL_SOURCE_FIELDS) {
    const value = pickField(vehicle, field);
    const detected = detectFuel(value);
    if (detected) {
      return {
        fuel: detected.fuel,
        reason: `Combustible ${detected.fuel} inferido por token ${detected.token.toUpperCase()} en ${field.label}.`
      };
    }
  }
  return null;
}

function buildUnresolved(confidence, reasons, warnings) {
  return { resolved: false, confidence, reference: null, reasons, warnings };
}

export function resolveTra050ReferenceForNoDbVehicle(vehicle, datasetType = vehicle?.dataset_type || vehicle?.input?.dataset_type || "") {
  const type = datasetType === "soldThermal" ? "sold_thermal" : datasetType;
  if (type && type !== "sold_thermal") {
    return buildUnresolved("low", [], ["La resoluci\u00f3n autom\u00e1tica por combustible solo aplica a vendidos/t\u00e9rmicos."]);
  }

  const reasons = [];
  const category = getCategory(vehicle);
  if (!category) {
    return buildUnresolved("low", reasons, ["No se pudo detectar categor\u00eda para seleccionar consumo TRA050."]);
  }
  reasons.push(`Categor\u00eda ${category} detectada`);

  const fuel = inferFuel(vehicle);
  if (!fuel) {
    return buildUnresolved("low", reasons, ["No se pudo inferir combustible para seleccionar consumo TRA050."]);
  }
  reasons.push(fuel.reason);

  const subtype = detectSubtype(vehicle);
  if (subtype) reasons.push(`Subtipo ${subtype} detectado`);

  const references = getThermalTra050References().filter((reference) => (
    reference.categoria === category &&
    normalizeReferenceFuel(reference.combustible) === fuel.fuel
  ));

  if (!references.length) {
    return buildUnresolved("medium", reasons, [`No existe referencia TRA050 interna para ${category} + ${fuel.fuel}.`]);
  }

  const matchingSubtype = subtype ? references.find((reference) => reference.subtipo === subtype) : null;
  const generic = references.find((reference) => !reference.subtipo);
  const reference = matchingSubtype || generic;
  if (!reference) {
    return buildUnresolved("medium", reasons, [`Hay referencias TRA050 para ${category} + ${fuel.fuel}, pero requieren subtipo.`]);
  }

  return {
    resolved: true,
    confidence: "high",
    reference: {
      ...reference,
      key: reference.key
    },
    reasons,
    warnings: []
  };
}

export function applyTra050ReferenceResolution(item, datasetType = item?.dataset_type || item?.input?.dataset_type || "") {
  const resolution = resolveTra050ReferenceForNoDbVehicle(item, datasetType);
  if (!resolution.resolved || resolution.confidence !== "high") {
    return {
      ...item,
      reference: item.tra050_reference_manual_selected ? item.reference : null,
      tra050_reference_auto_selected: false,
      tra050_reference_confidence: resolution.confidence,
      tra050_reference_reason: resolution.reasons.join("; "),
      tra050_reference_warnings: resolution.warnings.join("; ")
    };
  }
  const reason = resolution.reasons.join("; ");
  return {
    ...item,
    reference: resolution.reference,
    consumo_origen: "tra050_reference",
    consumo_referencia_tra050: resolution.reference.consumo,
    unidad_consumo: resolution.reference.unidad,
    tipologia_referencia_tra050: resolution.reference.tipologia,
    combustible_referencia_tra050: resolution.reference.combustible,
    tra050_reference_auto_selected: true,
    tra050_reference_manual_selected: false,
    tra050_reference_confidence: resolution.confidence,
    tra050_reference_reason: reason,
    tra050_reference_warnings: resolution.warnings.join("; "),
    observacion_consumo_referencia: "Referencia TRA050 seleccionada automaticamente a partir de categoria y combustible cargados.",
    notes: item.notes || "Referencia TRA050 seleccionada automaticamente a partir de categoria y combustible cargados."
  };
}
