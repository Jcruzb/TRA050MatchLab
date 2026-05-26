import { normalizeHeader, parseLooseDate, parseNumber } from "./normalize.js";

export const REQUIRED_FIELDS = [
  "Categoria_nuevo",
  "Matricula_Nuevo",
  "Marca_modelo_Nuevo",
  "Matriculacion_Nuevo",
  "Fecha Compra",
  "Nº Contrato/Factura",
  "Precio (SIN IVA)"
];

export const RECOMMENDED_FIELDS = [
  "Cilindrada_Nuevo",
  "Combustible_Motorizacion_Nuevo",
  "Potencia_Nuevo",
  "Tipo_Cambio_Nuevo",
  "Carroceria_Nuevo",
  "Version_Acabado_Nuevo",
  "Anio_Modelo_MY_Nuevo",
  "Observaciones_Nuevo"
];

const FIELD_ALIASES = new Map(
  [...REQUIRED_FIELDS, ...RECOMMENDED_FIELDS].map((field) => [normalizeHeader(field), field])
);

export function normalizeRows(rows) {
  return rows
    .map((row) => {
      const normalized = {};
      Object.entries(row).forEach(([key, value]) => {
        const canonical = FIELD_ALIASES.get(normalizeHeader(key)) || key.replace(/\*$/, "");
        normalized[canonical] = typeof value === "string" ? value.trim() : value ?? "";
      });
      return normalized;
    })
    .filter((row) => Object.values(row).some((value) => String(value || "").trim()));
}

export function validateRows(rows) {
  const normalizedRows = normalizeRows(rows);
  const headers = new Set(Object.keys(normalizedRows[0] || {}));
  const alerts = [];
  REQUIRED_FIELDS.forEach((field) => {
    if (!headers.has(field)) alerts.push({ type: "Error", message: `Falta columna obligatoria ${field}.` });
  });
  const seen = new Map();
  normalizedRows.forEach((row, index) => {
    const excelRow = index + 2;
    if (!row.Matricula_Nuevo) alerts.push({ type: "Error", message: `La fila ${excelRow} no tiene matricula.` });
    if (!row.Marca_modelo_Nuevo) alerts.push({ type: "Error", message: `La fila ${excelRow} no tiene Marca_modelo_Nuevo.` });
    if (row["Fecha Compra"] && !parseLooseDate(row["Fecha Compra"])) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene fecha de compra invalida.` });
    if (row.Matriculacion_Nuevo && !parseLooseDate(row.Matriculacion_Nuevo)) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene fecha de matriculacion invalida.` });
    if (row["Precio (SIN IVA)"] && parseNumber(row["Precio (SIN IVA)"]) === null) alerts.push({ type: "Advertencia", message: `La fila ${excelRow} tiene un precio que no parece numerico.` });
    const plate = String(row.Matricula_Nuevo || "").toUpperCase().replace(/\s+/g, "");
    if (plate) seen.set(plate, [...(seen.get(plate) || []), excelRow]);
  });
  [...seen.entries()].forEach(([plate, indexes]) => {
    if (indexes.length > 1) alerts.push({ type: "Advertencia", message: `Hay ${indexes.length} vehiculos con la misma matricula ${plate}.` });
  });
  return {
    rows: normalizedRows,
    alerts,
    hasErrors: alerts.some((alert) => alert.type === "Error")
  };
}
