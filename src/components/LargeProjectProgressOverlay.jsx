export default function LargeProjectProgressOverlay({ progress, onCancel }) {
  if (!progress) return null;
  const updatedAt = progress.lastSavedAt ? new Date(progress.lastSavedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "pendiente";
  const chunkText = progress.totalChunks ? `Chunk ${progress.savedChunks || 0} de ${progress.totalChunks}` : `${progress.savedChunks || 0} chunks guardados`;
  return (
    <section className="processing-overlay">
      <div className="processing-card large-project-card">
        <div className="spinner" />
        <p className="eyebrow">Proyecto grande detectado</p>
        <h2>Procesando y guardando avance...</h2>
        <p>{progress.stage || "Procesando matching y guardando avance"}</p>
        <progress value={progress.percent || 0} max="100" />
        <strong>{Number(progress.percent || 0).toLocaleString("es-ES")}%</strong>
        <dl className="progress-details">
          <div><dt>Filas</dt><dd>{(progress.processedRows || 0).toLocaleString("es-ES")} de {(progress.totalRows || 0).toLocaleString("es-ES")}</dd></div>
          <div><dt>Guardado</dt><dd>{chunkText}</dd></div>
          <div><dt>Ultimo guardado</dt><dd>{updatedAt}</dd></div>
          {progress.eta && <div><dt>Estimacion</dt><dd>{progress.eta}</dd></div>}
        </dl>
        <p className="muted">Puedes dejar la ventana abierta. Si el navegador se cierra o se refresca, podras recuperar el avance guardado.</p>
        <button className="ghost small" onClick={onCancel}>Cancelar procesamiento</button>
      </div>
    </section>
  );
}
