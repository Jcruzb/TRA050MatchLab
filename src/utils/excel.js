import * as XLSX from "xlsx";
import { REQUIRED_FIELDS, RECOMMENDED_FIELDS } from "./validation.js";

export async function readExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export function downloadPurchasedTemplate() {
  const headers = [...REQUIRED_FIELDS.map((field) => `${field}*`), ...RECOMMENDED_FIELDS];
  const example = [
    "M1",
    "1234ABC",
    "Toyota Corolla 1.8 Hybrid Touring Sport MY24",
    "15/03/2024",
    "20/03/2024",
    "FAC-2024-001",
    "28500",
    "1798",
    "hibrido gasolina",
    "140 cv",
    "automatico",
    "touring sport",
    "Style",
    "MY24",
    "Ejemplo orientativo"
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, example]), "Vehiculos_comprados");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Campo", "Tipo", "Indicacion"],
      ...REQUIRED_FIELDS.map((field) => [field, "Obligatorio", "Debe estar informado para validar la carga."]),
      ...RECOMMENDED_FIELDS.map((field) => [field, "Recomendado", "Mejora el matching contra IDAE."]),
      ["Fecha Compra", "Obligatorio", "Fecha de compra del vehículo eléctrico nuevo."],
      ["Fechas", "Formato", "dd/mm/aaaa o fecha Excel."],
      ["Matricula", "Formato", "Sin espacios o con espacios; se normaliza para duplicados."]
    ]),
    "Diccionario"
  );
  XLSX.writeFile(wb, "plantilla-tra050-electricos.xlsx");
}

export function downloadSoldTemplate() {
  const headers = [
    "Categoria_vendido*",
    "Matricula_Vendido*",
    "Marca_modelo_Vendido*",
    "Matriculacion_Vendido*",
    "Fecha Venta*",
    "Nº Contrato/Factura*",
    "Precio (SIN IVA)*",
    "Cilindrada_Vendido",
    "Combustible_Motorizacion_Vendido",
    "Potencia_Vendido",
    "Tipo_Cambio_Vendido",
    "Carroceria_Vendido",
    "Version_Acabado_Vendido",
    "Anio_Modelo_MY_Vendido",
    "Observaciones_Vendido"
  ];
  const example = [
    "M1",
    "1234ABC",
    "Volkswagen Golf 2.0 TDI DSG 2020",
    "15/03/2020",
    "20/03/2024",
    "CTR-VENTA-001",
    "14500",
    "1968",
    "diesel",
    "150 cv",
    "automatico",
    "turismo",
    "Advance",
    "MY20",
    "Ejemplo vendido térmico"
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, example]), "Vehiculos_vendidos");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Campo", "Tipo", "Indicacion"],
      ["Campos con *", "Obligatorio", "Debe estar informado para validar la carga."],
      ["Fecha Venta", "Obligatorio", "Fecha de venta del vehículo térmico sustituido."],
      ["Formato heredado", "Aceptado", "También se aceptan columnas *_Nuevo y Fecha Compra, interpretada como Fecha de venta en esta pestaña."],
      ["Fechas", "Formato", "dd/mm/aaaa o fecha Excel."],
      ["Matricula", "Formato", "Sin espacios o con espacios; se normaliza para duplicados."]
    ]),
    "Diccionario"
  );
  XLSX.writeFile(wb, "plantilla-tra050-vendidos-termicos.xlsx");
}

export function downloadTemplate() {
  downloadPurchasedTemplate();
}
