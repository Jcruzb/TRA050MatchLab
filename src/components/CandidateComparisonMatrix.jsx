import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { buildCandidateComparisonMatrix } from "../utils/technicalSpecs.js";
import { formatVehicleCandidate } from "../utils/formatVehicleCandidate.js";

function tone(status) {
  if (status === "match") return "ok";
  if (status === "compatible") return "info";
  if (status === "doubtful") return "warning";
  if (status === "different") return "danger";
  return "neutral";
}

function candidateTitle(candidate) {
  const title = candidate.modeloOriginal || candidate.raw?.modelo_tabla || "-";
  return title.length > 54 ? `${title.slice(0, 51)}...` : title;
}

export default function CandidateComparisonMatrix({
  userVehicle,
  candidates = [],
  activeCandidateId,
  onSelectCandidate,
  context = "group",
  onClose
}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const initialIds = safeCandidates.slice(0, Math.min(3, safeCandidates.length)).map((candidate) => candidate.id_idae);
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const [detailCandidateId, setDetailCandidateId] = useState("");
  const selectedCandidates = useMemo(
    () => safeCandidates.filter((candidate) => selectedIds.includes(candidate.id_idae)).slice(0, 5),
    [safeCandidates, selectedIds]
  );
  const matrix = useMemo(() => buildCandidateComparisonMatrix(userVehicle, selectedCandidates), [userVehicle, selectedCandidates]);
  const detailCandidate = selectedCandidates.find((candidate) => candidate.id_idae === detailCandidateId);
  const detailData = detailCandidate ? formatVehicleCandidate(detailCandidate, userVehicle) : null;

  function setTop(count) {
    setSelectedIds(safeCandidates.slice(0, Math.min(count, safeCandidates.length)).map((candidate) => candidate.id_idae));
  }

  function toggleCandidate(candidateId) {
    setSelectedIds((current) => {
      if (current.includes(candidateId)) return current.filter((id) => id !== candidateId);
      if (current.length >= 5) return current;
      return [...current, candidateId];
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal comparison-matrix-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Comparativa de candidatos IDAE">
        <button className="icon close" onClick={onClose} aria-label="Cerrar comparativa"><X size={18} /></button>
        <h2>Comparativa de candidatos IDAE</h2>
        <p className="muted">Compara los datos cargados con los principales candidatos encontrados antes de seleccionar.</p>

        <div className="button-row">
          <button className="small" onClick={() => setTop(3)}>Comparar top 3</button>
          <button className="small ghost" onClick={() => setTop(5)}>Comparar top 5</button>
          <button className="small ghost" onClick={() => setSelectedIds([])}>Limpiar seleccion</button>
        </div>

        {safeCandidates.length > 5 && (
          <p className="alert advertencia">Hay mas candidatos disponibles. Añade solo los que quieras comparar para mantener la tabla legible.</p>
        )}

        <div className="comparison-picker">
          {safeCandidates.map((candidate) => (
            <label key={candidate.id_idae} className="check-filter">
              <input
                type="checkbox"
                checked={selectedIds.includes(candidate.id_idae)}
                disabled={!selectedIds.includes(candidate.id_idae) && selectedIds.length >= 5}
                onChange={() => toggleCandidate(candidate.id_idae)}
              />
              IDAE {candidate.id_idae} · {candidate.score ?? "-"} pts
            </label>
          ))}
        </div>

        {!selectedCandidates.length ? (
          <p className="muted">Selecciona al menos un candidato para comparar.</p>
        ) : (
          <>
          {detailData && (
            <section className="comparison-detail-preview">
              <div>
                <strong>IDAE {detailData.idIdae} · {detailData.score} pts</strong>
                <p className="muted">{detailData.title}</p>
              </div>
              <div className="candidate-fields">
                {detailData.compactFields.slice(0, 6).map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}
              </div>
            </section>
          )}
          <div className="matrix-scroll">
            <table className="comparison-matrix-table">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th className="sticky-user-col">Dato cargado</th>
                  {selectedCandidates.map((candidate) => (
                    <th key={candidate.id_idae} className={candidate.id_idae === activeCandidateId ? "active-candidate" : ""}>
                      <strong>{candidate.score ?? "-"} pts</strong>
                      <span>IDAE {candidate.id_idae}</span>
                      <small title={candidate.modeloOriginal}>{candidateTitle(candidate)}</small>
                      <button
                        type="button"
                        className="small"
                        onClick={() => onSelectCandidate?.(candidate)}
                      >
                        {context === "group" ? "Seleccionar para todo el grupo" : "Seleccionar para este vehiculo"}
                      </button>
                      <button type="button" className="small ghost" onClick={() => setDetailCandidateId((current) => current === candidate.id_idae ? "" : candidate.id_idae)}>
                        {detailCandidateId === candidate.id_idae ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.fields.map((field) => (
                  <tr key={field.key}>
                    <th>{field.label}</th>
                    <td className="sticky-user-col user-value">{field.userValue || "-"}</td>
                    {field.candidates.map((cell) => (
                      <td className={`matrix-cell ${tone(cell.status)}`} key={`${field.key}-${cell.candidateId}`} title={cell.explanation}>
                        <strong>{cell.value || "-"}</strong>
                        <span>{cell.statusLabel}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
