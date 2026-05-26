import { FileSpreadsheet } from "lucide-react";
import { downloadTemplate, readExcelFile } from "../utils/excel.js";

export default function UploadPanel({ onRows, onError }) {
  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onRows(await readExcelFile(file));
    } catch {
      onError("No se pudo leer el Excel. Revisa que el archivo no este corrupto y que la primera hoja contenga datos.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <FileSpreadsheet size={20} />
        <h2>Cargar Excel</h2>
      </div>
      <p className="muted">Usa la plantilla o sube una hoja con encabezados equivalentes.</p>
      <div className="button-row">
        <button onClick={downloadTemplate}>Descargar plantilla Excel</button>
        <label className="file-button">
          Subir Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
        </label>
      </div>
    </section>
  );
}
