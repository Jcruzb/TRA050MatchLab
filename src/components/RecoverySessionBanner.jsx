export default function RecoverySessionBanner({ project, onContinue, onExport, onDiscard }) {
  if (!project) return null;
  return (
    <section className="recovery-banner">
      <div>
        <strong>Se encontro un proyecto grande en curso.</strong>
        <p>Ultimo avance guardado: {(project.processed_rows || 0).toLocaleString("es-ES")} de {(project.total_rows || 0).toLocaleString("es-ES")} vehiculos.</p>
      </div>
      <div className="button-row">
        <button type="button" onClick={onContinue}>Continuar</button>
        <button type="button" className="ghost" onClick={onExport}>Exportar avance actual</button>
        <button type="button" className="ghost danger-button" onClick={onDiscard}>Descartar</button>
      </div>
    </section>
  );
}
