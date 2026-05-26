import { Download } from "lucide-react";
import { exportResultsExcel, exportResultsJson } from "../utils/exportResults.js";

export default function ExportPanel({ items }) {
  return (
    <section className="panel export-panel">
      <div>
        <h2>Exportar resultados</h2>
        <p className="muted">Genera una salida trazable con estado, score, explicacion, asignacion IDAE y vehiculos no encontrados.</p>
      </div>
      <div className="button-row">
        <button disabled={!items.length} onClick={() => exportResultsExcel(items)}><Download size={16} /> Exportar resultado Excel</button>
        <button className="ghost" disabled={!items.length} onClick={() => exportResultsJson(items)}>Exportar JSON</button>
      </div>
    </section>
  );
}
