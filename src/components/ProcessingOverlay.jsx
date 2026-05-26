export default function ProcessingOverlay({ processing, onCancel }) {
  if (!processing) return null;
  return (
    <section className="processing-overlay">
      <div className="processing-card">
        <div className="spinner" />
        <h2>{processing.stage}</h2>
        <p>{processing.message || `Procesando ${processing.processed.toLocaleString("es-ES")} de ${processing.total.toLocaleString("es-ES")} vehículos...`}</p>
        <progress value={processing.percent} max="100" />
        <strong>{processing.percent}%</strong>
        <button className="ghost small" onClick={onCancel}>Cancelar procesamiento</button>
      </div>
    </section>
  );
}
