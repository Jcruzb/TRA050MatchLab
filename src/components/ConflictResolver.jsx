import { Check, CopyCheck } from "lucide-react";
import { MATCH_MEANINGS, MATCH_STATES } from "../utils/matchEngine.js";

export default function ConflictResolver({ items, onAssign, onApplySimilar, onMarkMissing }) {
  const targets = items.filter((item) => [MATCH_STATES.conflicto, MATCH_STATES.probable].includes(item.match_estado));
  if (!targets.length) return null;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Resolver conflictos</h2>
        <p className="muted">Revisa matches probables y conflictos antes de exportar.</p>
      </div>
      <div className="conflict-list">
        {targets.map((item) => (
          <article className="conflict-item" key={item.id}>
            <div>
              <strong>{item.input.Matricula_Nuevo} · {item.input.Marca_modelo_Nuevo}</strong>
              <p>{MATCH_MEANINGS[item.match_estado]}</p>
              <p className="muted">{item.explicacion_match}</p>
            </div>
            <select value={item.assigned?.id_idae || ""} onChange={(e) => onAssign(item.id, e.target.value, true)}>
              {item.candidates.map((candidate) => (
                <option value={candidate.id_idae} key={candidate.id_idae}>
                  {candidate.score} · {candidate.id_idae} · {candidate.modeloOriginal} · {candidate.cilindradaCc || "-"} cc · {candidate.motorizacion || "-"} · {candidate.potenciaCv || "-"} cv · {candidate.tipoCambio || "-"} · {candidate.consumoElectricoKwh100 || candidate.consumoLitros100 || "-"}
                </option>
              ))}
            </select>
            <div className="button-row">
              <button className="small" onClick={() => onAssign(item.id, item.assigned?.id_idae, true)}><Check size={16} /> Usar sugerido</button>
              <button className="small ghost" onClick={() => onApplySimilar(item)}><CopyCheck size={16} /> Aplicar a similares</button>
              <button className="small ghost" onClick={() => onMarkMissing(item.id)}>Vehiculo no encontrado en la DB</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
