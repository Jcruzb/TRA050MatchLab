import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import CandidateCarousel from "./CandidateCarousel.jsx";
import { candidateSearchText } from "../utils/formatVehicleCandidate.js";

export default function CandidateSelector({
  group,
  selectedCandidateId,
  userFeatures,
  onClose,
  onSelectCandidate,
  onApplyToGroup,
  onOpenManualSearch,
  onMarkGroupMissing
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("score");
  const [limit, setLimit] = useState(5);
  const candidates = useMemo(() => {
    const q = query.trim();
    const filtered = group.candidateOptions.filter((candidate) => !q || candidateSearchText(candidate).includes(q.toLowerCase()));
    return [...filtered].sort((a, b) => {
      if (sort === "power") return Math.abs((a.potenciaCv || 0) - (userFeatures.potenciaCv || 0)) - Math.abs((b.potenciaCv || 0) - (userFeatures.potenciaCv || 0));
      if (sort === "cc") return Math.abs((a.cilindradaCc || 0) - (userFeatures.cilindradaCc || 0)) - Math.abs((b.cilindradaCc || 0) - (userFeatures.cilindradaCc || 0));
      if (sort === "fuel") return (b.motorizacion === userFeatures.motorizacion) - (a.motorizacion === userFeatures.motorizacion);
      if (sort === "model") return (b.modelBase === userFeatures.modelBase) - (a.modelBase === userFeatures.modelBase);
      return (b.score || 0) - (a.score || 0);
    });
  }, [group.candidateOptions, query, sort, userFeatures]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal candidate-selector-modal" onClick={(event) => event.stopPropagation()}>
        <button className="icon close" onClick={onClose}><X size={18} /></button>
        <h2>Seleccionar candidato IDAE</h2>
        <p className="muted">{group.label} · {group.groupSize} vehiculos afectados</p>

        <div className="candidate-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar dentro de candidatos sugeridos..." /></label>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="score">Mejor score</option>
            <option value="model">Modelo más parecido</option>
            <option value="fuel">Motorización compatible</option>
            <option value="power">Potencia más cercana</option>
            <option value="cc">Cilindrada más cercana</option>
          </select>
        </div>

        <CandidateCarousel candidates={candidates.slice(0, limit)} selectedCandidateId={selectedCandidateId} userFeatures={userFeatures} onSelectCandidate={onSelectCandidate} />

        <div className="button-row selector-actions">
          {limit < candidates.length && <button className="ghost" onClick={() => setLimit((value) => value + 5)}>Ver más candidatos</button>}
          <button onClick={() => {
            const selected = candidates.find((candidate) => candidate.id_idae === selectedCandidateId) || candidates[0];
            if (selected) onApplyToGroup(selected);
          }}>Aplicar candidato seleccionado a todo el grupo</button>
          <button className="ghost" onClick={onOpenManualSearch}>Buscar manualmente en toda la DB</button>
          <button className="ghost" onClick={onMarkGroupMissing}>Marcar grupo como no encontrado en DB</button>
        </div>
      </section>
    </div>
  );
}
