import { Download } from "lucide-react";
import { exportDatasetExcel, exportIdaeEvidenceManifest, exportProjectJson, exportResultsExcel, exportResultsJson } from "../utils/exportResults.js";

export default function ExportPanel({ items, datasets, activeDatasetKey, learningRules, learningCount, pairing, onExportLearning, onImportLearning, onClearLearning }) {
  const isSold = activeDatasetKey === "soldThermal";
  const activeDataset = datasets?.[activeDatasetKey];
  return (
    <section className="panel export-panel">
      <div>
        <h2>Exportar resultados</h2>
        <p className="muted">Genera una salida trazable con estado, score, explicacion, asignacion IDAE y vehiculos no encontrados.</p>
        <p className="muted">{learningCount} reglas aprendidas locales.</p>
      </div>
      <div className="button-row">
        <button disabled={!items.length} onClick={() => exportResultsExcel(items)}><Download size={16} /> Exportar resultado Excel</button>
        <button disabled={!items.length} onClick={() => exportDatasetExcel(activeDataset, isSold ? "Vehiculos_vendidos_validados" : "Vehiculos_electricos_validados", isSold ? "vehiculos-vendidos-validados.xlsx" : "vehiculos-electricos-validados.xlsx")}>
          {isSold ? "Exportar vendidos validados" : "Exportar eléctricos validados"}
        </button>
        <button className="ghost" disabled={!items.length} onClick={() => exportResultsJson(items)}>Exportar JSON</button>
        <button className="ghost" onClick={() => exportProjectJson(datasets, learningRules, pairing)}>Exportar proyecto completo JSON</button>
        <button className="ghost" onClick={() => exportIdaeEvidenceManifest(datasets)}>Exportar manifest de evidencias IDAE</button>
        <button className="ghost" onClick={onExportLearning}>Exportar reglas aprendidas</button>
        <label className="file-button secondary">
          Importar reglas
          <input type="file" accept=".json" onChange={(event) => event.target.files?.[0] && onImportLearning(event.target.files[0])} />
        </label>
        <button className="ghost" onClick={onClearLearning}>Limpiar reglas</button>
      </div>
    </section>
  );
}
