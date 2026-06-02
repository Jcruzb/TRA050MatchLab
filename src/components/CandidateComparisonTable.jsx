import { buildVehicleTechnicalComparison } from "../utils/technicalSpecs.js";

const ORDER = ["marca", "modelo", "year", "motorizacion", "cambio", "cilindrada", "potencia_termica", "potencia", "potencia_electrica", "emisiones", "carroceria", "consumo_electrico"];

function tone(status) {
  if (status === "match" || status === "compatible") return "ok";
  if (status === "doubtful") return "warning";
  if (status === "different") return "danger";
  return "neutral";
}

export default function CandidateComparisonTable({ userVehicle, candidate }) {
  const comparison = buildVehicleTechnicalComparison(userVehicle || {}, candidate || {});
  const rows = ORDER.map((key) => comparison[key]).filter(Boolean);
  return (
    <section className="candidate-detail-section">
      <h4>Comparacion con datos cargados</h4>
      <div className="candidate-comparison-table">
        <div className="comparison-head">
          <span>Campo</span>
          <span>Dato cargado</span>
          <span>Dato IDAE</span>
          <span>Resultado</span>
        </div>
        {rows.map((row) => (
          <div className={`comparison-row ${tone(row.status)}`} key={row.field}>
            <span>{row.label}</span>
            <strong className="user-value">{row.user_display || "-"}</strong>
            <strong className="idae-value">{row.idae_display || "-"}</strong>
            <span className={`state ${tone(row.status)}`}>{row.status_label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
