export default function ValidationSummary({ validation }) {
  if (!validation) return null;
  const errors = validation.alerts.filter((alert) => alert.type === "Error").length;
  const warnings = validation.alerts.filter((alert) => alert.type === "Advertencia").length;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Validacion</h2>
        <div className="badges">
          <span className={errors ? "badge danger" : "badge ok"}>{errors} errores</span>
          <span className={warnings ? "badge warning" : "badge ok"}>{warnings} advertencias</span>
        </div>
      </div>
      {validation.alerts.length ? (
        <div className="alerts">
          {validation.alerts.map((alert, index) => <p className={`alert ${alert.type.toLowerCase()}`} key={`${alert.message}-${index}`}>{alert.type}: {alert.message}</p>)}
        </div>
      ) : (
        <p className="alert correcto">Correcto: estructura lista para ejecutar matching.</p>
      )}
    </section>
  );
}
