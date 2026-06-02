import { useState } from "react";
import { formatVehicleCandidate } from "../utils/formatVehicleCandidate.js";
import CandidateComparisonTable from "./CandidateComparisonTable.jsx";

export default function CandidateOptionCard({ candidate, userFeatures, userVehicle, selected, onSelect, actionLabel = "Seleccionar", hideAction = false }) {
  const [open, setOpen] = useState(false);
  const data = formatVehicleCandidate(candidate, userVehicle || userFeatures);
  const detailSections = [
    ["Datos tecnicos completos IDAE", data.technicalRows.slice(6, 22)],
    ["WLTP / consumo / emisiones", data.technicalRows.slice(22, 28)],
    ["Datos del match", data.technicalRows.slice(28, 32)],
    ["Origen / fuente", data.technicalRows.slice(32)]
  ];

  return (
    <article className={`candidate-card ${selected ? "selected" : ""}`}>
      <div className="candidate-card-header">
        <div>
          <strong>{data.score} pts · IDAE {data.idIdae}</strong>
          <h3>{data.title}</h3>
          {!["-", "—"].includes(data.subtitle) && <p className="muted">{data.subtitle}</p>}
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
          {open ? "Ocultar detalle" : "Mostrar detalle"}
        </button>
        {!hideAction && <button className="small" onClick={() => onSelect(candidate)} aria-label={`${actionLabel} ${data.title}`}>{actionLabel}</button>}
      </div>

      {open && (
        <div className="candidate-full-detail">
          <CandidateComparisonTable userVehicle={userVehicle || userFeatures} candidate={candidate} />
          <section className="candidate-detail-section">
            <h4>Resumen del candidato</h4>
            <div className="candidate-detail-table">
              {data.technicalRows.slice(0, 6).map(([label, value]) => (
                <p key={label}><span>{label}</span>{value || "-"}</p>
              ))}
            </div>
          </section>
          {detailSections.map(([title, rows]) => (
            <details className="candidate-detail-accordion" key={title}>
              <summary>{title}</summary>
              <div className="candidate-detail-table">
                {rows.map(([label, value]) => (
                  <p key={label}><span>{label}</span>{value || "-"}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </article>
  );
}
