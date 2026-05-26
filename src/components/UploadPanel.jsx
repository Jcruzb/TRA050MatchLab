import { FileSpreadsheet } from "lucide-react";
import { downloadPurchasedTemplate, downloadSoldTemplate, readExcelFile } from "../utils/excel.js";
import { useState } from "react";

export default function UploadPanel({ onRows, onError, datasetKey, title = "Cargar Excel", help }) {
  const [reading, setReading] = useState(false);
  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const rows = await readExcelFile(file);
      await onRows(rows);
    } catch (error) {
      onError(error.message || "No se pudo leer el Excel. Revisa que el archivo no este corrupto y que la primera hoja contenga datos.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <FileSpreadsheet size={20} />
        <h2>{title}</h2>
      </div>
      <p className="muted">{help || "Usa la plantilla o sube una hoja con encabezados equivalentes."}</p>
      {reading && (
        <div className="inline-loader" role="status" aria-live="polite">
          <span className="inline-spinner" />
          <p>Leyendo archivo Excel y preparando filas...</p>
        </div>
      )}
      <div className="button-row">
        <button onClick={datasetKey === "soldThermal" ? downloadSoldTemplate : downloadPurchasedTemplate}>
          {datasetKey === "soldThermal" ? "Descargar plantilla de vehículos vendidos/térmicos" : "Descargar plantilla de vehículos comprados/eléctricos"}
        </button>
        <label className="file-button">
          {reading ? "Leyendo Excel..." : "Subir Excel"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={reading} />
        </label>
      </div>
    </section>
  );
}
