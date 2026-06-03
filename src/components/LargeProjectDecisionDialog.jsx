export default function LargeProjectDecisionDialog({ decision, onChoose }) {
  if (!decision) return null;
  return (
    <section className="processing-overlay">
      <div className="processing-card large-project-card">
        <p className="eyebrow">Proyecto grande detectado</p>
        <h2>Guardado progresivo local</h2>
        <p>Este archivo contiene muchos vehiculos. Para evitar perder el avance, se activara un guardado progresivo local mientras se procesa.</p>
        <p className="muted">Para evitar perdida de trabajo, TRA050 MatchLab activara guardado progresivo mientras procesa los datos.</p>
        <div className="decision-actions">
          <button type="button" onClick={() => onChoose("progressive")}>Continuar con guardado progresivo</button>
          <button type="button" className="ghost" onClick={() => onChoose("normal")}>Procesar sin guardado progresivo</button>
          <button type="button" className="ghost danger-button" onClick={() => onChoose("cancel")}>Cancelar</button>
        </div>
      </div>
    </section>
  );
}
