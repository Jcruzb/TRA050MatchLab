import * as XLSX from "xlsx";
import { REQUIRED_FIELDS, RECOMMENDED_FIELDS } from "./validation.js";

export async function readExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export function downloadTemplate() {
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, example]), "Vehiculos");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Campo", "Tipo", "Indicacion"],
      ...REQUIRED_FIELDS.map((field) => [field, "Obligatorio", "Debe estar informado para validar la carga."]),
      ...RECOMMENDED_FIELDS.map((field) => [field, "Recomendado", "Mejora el matching contra IDAE."]),
      ["Fechas", "Formato", "dd/mm/aaaa o fecha Excel."],
      ["Matricula", "Formato", "Sin espacios o con espacios; se normaliza para duplicados."]
    ]),
    "Diccionario"
  );
  XLSX.writeFile(wb, "plantilla-tra050-matchlab.xlsx");
}
