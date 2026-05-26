import { normalizeHeader, parseLooseDate, parseNumber } from "./normalize.js";

export const DATASET_TYPES = {
  soldThermal: "sold_thermal",
  purchasedElectric: "purchased_electric"
};

export const DATASET_CONFIG = {
  soldThermal: {
    key: "soldThermal",
    type: DATASET_TYPES.soldThermal,
    label: "Vehículos vendidos / térmicos",
    shortLabel: "Vendidos / Térmicos",
    operationLabel: "Fecha de venta",
    operationField: "fecha_venta",
    operationType: "fecha_venta",
    help: "Carga aquí los vehículos antiguos o térmicos que serán sustituidos. La fecha de operación se interpretará como fecha de venta.",
    expectedPowertrain: "thermal_or_hybrid"
  },
  purchasedElectric: {
    key: "purchasedElectric",
    type: DATASET_TYPES.purchasedElectric,
    label: "Vehículos comprados / eléctricos",
    shortLabel: "Comprados / Eléctricos",
    operationLabel: "Fecha de compra",
    operationField: "fecha_compra",
    operationType: "fecha_compra",
    help: "Carga aquí los vehículos eléctricos nuevos que reemplazarán a los térmicos vendidos. La fecha de operación se interpretará como fecha de compra.",
    expectedPowertrain: "electric"
  }
};

export function createEmptyDataset(config) {
  return {
    label: config.label,
    type: config.type,
    rawRows: [],
    normalizedRows: [],
    validation: null,
    matchResults: [],
    conflictGroups: [],
    summary: null,
    exportReady: false
  };
}

const CANONICAL_FIELDS = {
  categoria: ["categoria_nuevo", "categoria_vendido", "categoria_comprado", "categoria"],
  matricula: ["matricula_nuevo", "matricula_vendido", "matricula_comprado", "matricula"],
  marca_modelo: ["marca_modelo_nuevo", "marca_modelo_vendido", "marca_modelo_comprado", "marca_modelo"],
  fecha_matriculacion: ["matriculacion_nuevo", "matriculacion_vendido", "matriculacion_comprado", "fecha_matriculacion"],
  fecha_operacion: ["fecha_compra", "fecha_venta", "fecha_operacion"],
  contrato_factura: ["n_contrato_factura", "no_contrato_factura", "contrato_factura", "nº_contrato_factura"],
  precio_sin_iva: ["precio_sin_iva", "precio_sin_iva"],
  cilindrada: ["cilindrada_nuevo", "cilindrada_vendido", "cilindrada_comprado", "cilindrada"],
  combustible_motorizacion: ["combustible_motorizacion_nuevo", "combustible_motorizacion_vendido", "combustible_motorizacion_comprado", "combustible_motorizacion"],
  potencia: ["potencia_nuevo", "potencia_vendido", "potencia_comprado", "potencia"],
  tipo_cambio: ["tipo_cambio_nuevo", "tipo_cambio_vendido", "tipo_cambio_comprado", "tipo_cambio"],
  carroceria: ["carroceria_nuevo", "carroceria_vendido", "carroceria_comprado", "carroceria"],
  version_acabado: ["version_acabado_nuevo", "version_acabado_vendido", "version_acabado_comprado", "version_acabado"],
  anio_modelo_my: ["anio_modelo_my_nuevo", "anio_modelo_my_vendido", "anio_modelo_my_comprado", "anio_modelo_my"],
  observaciones: ["observaciones_nuevo", "observaciones_vendido", "observaciones_comprado", "observaciones"]
};

const REQUIRED_CANONICAL = ["categoria", "matricula", "marca_modelo", "fecha_matriculacion", "fecha_operacion", "contrato_factura", "precio_sin_iva"];

function getValue(row, aliases) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]);
  const found = normalizedEntries.find(([key]) => aliases.includes(key));
  return typeof found?.[1] === "string" ? found[1].trim() : found?.[1] ?? "";
}

export function normalizeDatasetRows(rows, config) {
  return rows
    .map((row, index) => {
      const canonical = Object.fromEntries(
        Object.entries(CANONICAL_FIELDS).map(([field, aliases]) => [field, getValue(row, aliases)])
      );
      return {
        dataset_type: config.type,
        row_id: `${config.type}-${index}`,
        source_row_index: index + 2,
        original_row: row,
        ...canonical,
        fecha_operacion_tipo: config.operationType,
        match_pair_id: null,
        pair_status: "not_paired",
        pair_candidate_ids: [],
        pair_locked: false,
        pair_manual_override: false,
        Categoria_nuevo: canonical.categoria,
        Matricula_Nuevo: canonical.matricula,
        Marca_modelo_Nuevo: canonical.marca_modelo,
        Matriculacion_Nuevo: canonical.fecha_matriculacion,
        "Fecha Compra": canonical.fecha_operacion,
        "Nº Contrato/Factura": canonical.contrato_factura,
        "NÂº Contrato/Factura": canonical.contrato_factura,
        "Precio (SIN IVA)": canonical.precio_sin_iva,
        Cilindrada_Nuevo: canonical.cilindrada,
        Combustible_Motorizacion_Nuevo: canonical.combustible_motorizacion,
        Potencia_Nuevo: canonical.potencia,
        Tipo_Cambio_Nuevo: canonical.tipo_cambio,
        Carroceria_Nuevo: canonical.carroceria,
        Version_Acabado_Nuevo: canonical.version_acabado,
        Anio_Modelo_MY_Nuevo: canonical.anio_modelo_my,
        Observaciones_Nuevo: canonical.observaciones
      };
    })
    .filter((row) => Object.values(row.original_row || {}).some((value) => String(value || "").trim()));
}

export function validateDatasetRows(rows, config) {
  const normalizedRows = normalizeDatasetRows(rows, config);
  const alerts = [];
  if (!normalizedRows.length) alerts.push({ type: "Error", message: "No se detectaron filas con datos." });
  REQUIRED_CANONICAL.forEach((field) => {
    if (normalizedRows.length && normalizedRows.every((row) => !row[field])) {
      const label = field === "fecha_operacion" ? config.operationLabel : field;
      alerts.push({ type: "Error", message: `Falta columna obligatoria o datos para ${label}.` });
    }
  });
  const seen = new Map();
  normalizedRows.forEach((row) => {
    const excelRow = row.source_row_index;
    if (!row.matricula) alerts.push({ type: "Error", message: `La fila ${excelRow} no tiene matrícula.` });
    if (!row.marca_modelo) alerts.push({ type: "Error", message: `La fila ${excelRow} no tiene marca/modelo.` });
    if (row.fecha_operacion && !parseLooseDate(row.fecha_operacion)) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene ${config.operationLabel.toLowerCase()} inválida.` });
    if (row.fecha_matriculacion && !parseLooseDate(row.fecha_matriculacion)) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene fecha de matriculación inválida.` });
    if (row.precio_sin_iva && parseNumber(row.precio_sin_iva) === null) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene un precio que no parece numérico.` });
    const plate = String(row.matricula || "").toUpperCase().replace(/\s+/g, "");
    if (plate) seen.set(plate, [...(seen.get(plate) || []), excelRow]);
  });
  [...seen.entries()].forEach(([plate, indexes]) => {
    if (indexes.length > 1) alerts.push({ type: "Advertencia", message: `Hay ${indexes.length} vehículos con la misma matrícula ${plate}.` });
  });
  return { rows: normalizedRows, alerts, hasErrors: alerts.some((alert) => alert.type === "Error") };
}
