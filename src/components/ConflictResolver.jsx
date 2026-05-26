import { Check, CopyCheck, Eye, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MATCH_MEANINGS } from "../utils/matchEngine.js";
import { normalizeText } from "../utils/normalize.js";
import CandidateOptionCard from "./CandidateOptionCard.jsx";
import CandidateSelector from "./CandidateSelector.jsx";

function GlobalDbSearchModal({ group, index, onClose, onAssignGroup, onAssign }) {
  const [filters, setFilters] = useState({ text: "", brand: "", model: "", motorizacion: "", cilindrada: "", year: "", cambio: "" });
  const results = useMemo(() => {
    const text = normalizeText(filters.text);
    const model = normalizeText(filters.model);
    const brand = normalizeText(filters.brand);
    const cambio = normalizeText(filters.cambio);
    return index
      .filter((item) => !text || item.searchableText.includes(text) || item.id_idae?.includes(text))
      .filter((item) => !brand || item.marcaDetectada.includes(brand))
      .filter((item) => !model || item.modeloNormalizado.includes(model) || item.modelBase === model)
      .filter((item) => !filters.motorizacion || item.motorizacion === filters.motorizacion)
      .filter((item) => !filters.cilindrada || Math.abs((item.cilindradaCc || 0) - Number(filters.cilindrada)) <= 100)
      .filter((item) => !filters.year || Math.abs((item.yearMY || 0) - Number(filters.year)) <= 1)
      .filter((item) => !cambio || item.tipoCambio === cambio)
      .slice(0, 50);
  }, [filters, index]);

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal search-modal" onClick={(event) => event.stopPropagation()}>
        <button className="icon close" onClick={onClose}><X size={18} /></button>
        <h2>Buscar en DB IDAE</h2>
        <p className="muted">Asignando a grupo: {group.label}</p>
        <div className="manual-grid expanded">
          <label><Search size={16} /><input value={filters.text} onChange={(e) => update("text", e.target.value)} placeholder="Texto libre" /></label>
          <input value={filters.brand} onChange={(e) => update("brand", e.target.value)} placeholder="Marca" />
          <input value={filters.model} onChange={(e) => update("model", e.target.value)} placeholder="Modelo" />
          <select value={filters.motorizacion} onChange={(e) => update("motorizacion", e.target.value)}>
            <option value="">Motorizacion</option>
            {["electrico puro", "hibrido gasolina", "hibrido diesel", "hibrido enchufable", "gasolina", "diesel", "gas natural", "GLP"].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input value={filters.cilindrada} onChange={(e) => update("cilindrada", e.target.value)} placeholder="Cilindrada cc" />
          <input value={filters.year} onChange={(e) => update("year", e.target.value)} placeholder="Ano/MY" />
          <select value={filters.cambio} onChange={(e) => update("cambio", e.target.value)}>
            <option value="">Cambio</option>
            <option value="automatico">automatico</option>
            <option value="manual">manual</option>
          </select>
        </div>
        <div className="manual-results table-like">
          {results.map((candidate) => (
            <article key={candidate.id_idae}>
              <div>
                <strong>{candidate.id_idae} · {candidate.modeloOriginal}</strong>
                <span>{candidate.marcaDetectada || "-"} · {candidate.modelBase || "-"} · {candidate.motorizacion || "-"} · {candidate.cilindradaCc || "-"} cc · {candidate.potenciaCv || "-"} cv · {candidate.tipoCambio || "-"} · {candidate.consumoElectricoKwh100 || candidate.consumoLitros100 || "-"}</span>
                <span>{candidate.source_url || ""}</span>
              </div>
              <div className="button-row">
                <button className="small" onClick={() => { onAssignGroup(group, candidate.id_idae, "global-search"); onClose(); }}>Asignar a este grupo</button>
                {group.vehicles.slice(0, 4).map((vehicle) => (
                  <button className="small ghost" key={vehicle.rowId} onClick={() => onAssign(vehicle.rowId, candidate.id_idae, true, candidate)}>
                    Asignar solo {vehicle.matricula}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ConflictResolver({
  groups,
  index,
  onAssign,
  onAssignGroup,
  onApplySimilar,
  onMarkMissing,
  onMarkGroupMissing,
  onResolveIndividually,
  onSelect
}) {
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [expanded, setExpanded] = useState({});
  const [manualGroup, setManualGroup] = useState(null);
  const [selectorGroup, setSelectorGroup] = useState(null);
  const targets = groups || [];
  const selection = useMemo(() => Object.fromEntries(targets.map((group) => [
    group.groupKey,
    selectedByGroup[group.groupKey] || group.suggestedCandidate?.id_idae || group.candidateOptions[0]?.id_idae || ""
  ])), [targets, selectedByGroup]);

  if (!targets.length) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Resolver conflictos</h2>
        <p className="muted">Los conflictos equivalentes se agrupan para resolverlos una sola vez.</p>
      </div>
      <div className="conflict-list">
        {targets.map((group) => (
          <article className="conflict-item conflict-group" key={group.groupKey}>
            <div className="group-heading">
              <div>
                <p className="eyebrow">Grupo de conflicto — {group.datasetLabel}</p>
                <strong>{group.label}</strong>
                <p className="muted">
                  <Users size={15} /> {group.groupSize} vehiculos afectados · Matriculas: {group.vehicles.map((vehicle) => vehicle.matricula).join(", ")}
                </p>
              </div>
              <span className="badge warning">{group.status}</span>
            </div>

            <p>{MATCH_MEANINGS[group.status]}</p>
            {group.warning && <p className="alert advertencia">{group.warning}</p>}
            <p className="explain">Este conflicto afecta a {group.groupSize} vehiculos con los mismos datos base y el mismo conjunto de candidatos IDAE. La decision se aplicara a todos los vehiculos del grupo.</p>
            <p className="muted">{group.explanation}</p>

            <div className="feature-strip">
              <span>Marca: {group.detectedFeatures.brand || "-"}</span>
              <span>Modelo: {group.detectedFeatures.modelBase || "-"}</span>
              <span>Ano/MY: {group.detectedFeatures.year || "-"}</span>
              <span>Motorizacion: {group.detectedFeatures.motorizacion || "-"}</span>
              <span>Cambio: {group.detectedFeatures.cambio || "-"}</span>
            </div>

            <div className="current-candidate">
              <h3>Candidato seleccionado</h3>
              {group.candidateOptions.find((candidate) => candidate.id_idae === selection[group.groupKey]) ? (
                <CandidateOptionCard
                  candidate={group.candidateOptions.find((candidate) => candidate.id_idae === selection[group.groupKey])}
                  userFeatures={group.vehicles[0].matchResult.userFeatures}
                  selected
                  onSelect={() => onAssignGroup(group, selection[group.groupKey], "manual-selection")}
                  actionLabel="Aplicar al grupo"
                />
              ) : (
                <p className="muted">No hay candidato sugerido.</p>
              )}
            </div>

            <div className="button-row">
              <button className="small" onClick={() => onAssignGroup(group, group.suggestedCandidate?.id_idae || selection[group.groupKey], "suggested")}><Check size={16} /> Usar sugerido para todo el grupo</button>
              <button className="small ghost" onClick={() => onAssignGroup(group, selection[group.groupKey], "manual-selection")}><Check size={16} /> Aplicar seleccion a todo el grupo</button>
              <button className="small ghost" onClick={() => setSelectorGroup(group)}>Cambiar candidato</button>
              <button className="small ghost" onClick={() => setManualGroup(group)}><Search size={16} /> Buscar manualmente en toda la DB</button>
              <button className="small ghost" onClick={() => onMarkGroupMissing(group)}>Vehiculo no encontrado en la DB</button>
              <button className="small ghost" onClick={() => setExpanded((current) => ({ ...current, [group.groupKey]: !current[group.groupKey] }))}>Resolver individualmente</button>
              <button className="small ghost" onClick={() => onApplySimilar(group.vehicles[0].matchResult)}><CopyCheck size={16} /> Aplicar a similares</button>
            </div>

            <details className="debug-box">
              <summary>Debug de matching</summary>
              <pre>{JSON.stringify(group.vehicles[0].matchResult.matchDebug, null, 2)}</pre>
            </details>

            {expanded[group.groupKey] && (
              <div className="group-vehicles">
                {group.vehicles.map((vehicle) => (
                  <article key={vehicle.rowId}>
                    <strong>{vehicle.matricula}</strong>
                    <span>{vehicle.originalRow.Marca_modelo_Nuevo}</span>
                    <div className="button-row">
                      <button className="icon" onClick={() => onSelect(vehicle.matchResult)} title="Ver detalle"><Eye size={16} /></button>
                      <button className="small ghost" onClick={() => onAssign(vehicle.rowId, selection[group.groupKey], true)}>Aplicar solo a esta fila</button>
                      <button className="small ghost" onClick={() => onMarkMissing(vehicle.rowId)}>No encontrado solo esta fila</button>
                      <button className="small ghost" onClick={() => onResolveIndividually(vehicle.rowId)}>Separar del grupo</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {selectorGroup && (
        <CandidateSelector
          group={selectorGroup}
          selectedCandidateId={selection[selectorGroup.groupKey]}
          userFeatures={selectorGroup.vehicles[0].matchResult.userFeatures}
          onClose={() => setSelectorGroup(null)}
          onSelectCandidate={(candidate) => setSelectedByGroup((current) => ({ ...current, [selectorGroup.groupKey]: candidate.id_idae }))}
          onApplyToGroup={(candidate) => { onAssignGroup(selectorGroup, candidate.id_idae, "manual-selection"); setSelectorGroup(null); }}
          onOpenManualSearch={() => { setManualGroup(selectorGroup); setSelectorGroup(null); }}
          onMarkGroupMissing={() => { onMarkGroupMissing(selectorGroup); setSelectorGroup(null); }}
        />
      )}
      {manualGroup && <GlobalDbSearchModal group={manualGroup} index={index} onClose={() => setManualGroup(null)} onAssignGroup={onAssignGroup} onAssign={onAssign} />}
    </section>
  );
}
