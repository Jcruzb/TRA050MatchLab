import { useState } from "react";
import { formatVehicleCandidate } from "../utils/formatVehicleCandidate.js";

export default function CandidateOptionCard({ candidate, userFeatures, selected, onSelect, actionLabel = "Seleccionar" }) {
  const [open, setOpen] = useState(false);
  const data = formatVehicleCandidate(candidate, userFeatures);
  return (
    <article className={`candidate-card ${selected ? "selected" : ""}`}>
      <div className="candidate-card-header">
        <div>
          <strong>{data.score} pts · IDAE {data.idIdae}</strong>
          <h3>{data.title}</h3>
          {data.subtitle !== "—" && <p className="muted">{data.subtitle}</p>}
        </div>
        <span className="badge info">{data.brand}</span>
      </div>

      <div className="candidate-badges">
        {data.badges.map((item) => <span className={`mini-badge ${item.tone}`} key={item.label}>{item.label}</span>)}
      </div>

      <div className="candidate-fields">
        {data.compactFields.map(([label, value]) => (
          <p key={label}><span>{label}</span>{value}</p>
        ))}
      </div>

      <div className="candidate-comparison">
        <p><strong>Coincidencias:</strong> {data.comparison.matches.length ? data.comparison.matches.join(", ") : data.comparison.explanation}</p>
        {data.comparison.differences.length > 0 && <p><strong>Diferencias:</strong> {data.comparison.differences.join(", ")}</p>}
      </div>

      <div className="button-row">
        <button className="small ghost" onClick={() => setOpen((value) => !value)} aria-label={`Ver detalle de ${data.title}`}>
          {open ? "Ocultar detalle" : "Ver detalle"}
        </button>
        <button className="small" onClick={() => onSelect(candidate)} aria-label={`${actionLabel} ${data.title}`}>{actionLabel}</button>
      </div>

      {open && (
        <div className="candidate-detail-table">
          {data.technicalRows.map(([label, value]) => (
            <p key={label}><span>{label}</span>{value}</p>
          ))}
        </div>
      )}
    </article>
  );
}
