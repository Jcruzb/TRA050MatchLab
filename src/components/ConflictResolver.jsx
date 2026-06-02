import { Check, Eye, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MATCH_MEANINGS } from "../utils/matchEngine.js";
import { isVehiclePendingResolution, isVehicleResolved } from "../utils/groupConflicts.js";
import { normalizeText } from "../utils/normalize.js";
import CandidateSelector from "./CandidateSelector.jsx";
import CandidateCarousel from "./CandidateCarousel.jsx";
import CandidateComparisonMatrix from "./CandidateComparisonMatrix.jsx";

const STATUS_LABELS = {
  pending: "Pendiente",
  resolved: "Resuelto",
  partially_resolved: "Parcialmente resuelto",
  marked_no_db: "No DB",
  manual_review: "Revision individual"
};

const STATUS_FILTERS = [
  ["all", "Todos"],
  ["pending", "Pendientes"],
  ["resolved", "Resueltos"],
  ["marked_no_db", "No DB"]
];

const ADVANCED_FILTERS = [
  ["partially_resolved", "Parcialmente resueltos"],
  ["strong_differences", "Diferencias fuertes"],
  ["doubtful_differences", "Diferencias dudosas"],
  ["manual_review", "Revision individual"],
  ["applied_by_group", "Aplicados por grupo"],
  ["manual", "Aplicados manualmente"]
];

function vehicleFromGroupEntry(vehicle) {
  return vehicle?.matchResult || vehicle || {};
}

function isPendingConflictGroup(group) {
  const vehicles = group.vehicles || [];
  return Boolean(
    group.group_status === "pending"
    || group.groupStatus === "pending"
    || group.group_status === "partially_resolved"
    || group.groupStatus === "partially_resolved"
    || group.status === "conflicto"
    || group.status === "sin_match"
    || group.status === "manual_review"
    || group.pendingVehicles > 0
    || vehicles.some((vehicle) => isVehiclePendingResolution(vehicleFromGroupEntry(vehicle)))
  );
}

function isNoDbConflictGroup(group) {
  return Boolean(group.group_status === "marked_no_db" || group.groupStatus === "marked_no_db" || group.vehicles?.some((vehicle) => vehicleFromGroupEntry(vehicle).vehiculo_no_encontrado_db));
}

function isResolvedConflictGroup(group) {
  const vehicles = group.vehicles || [];
  return Boolean(vehicles.length && group.pendingVehicles === 0 && vehicles.every((vehicle) => isVehicleResolved(vehicleFromGroupEntry(vehicle))));
}

function getGroupDisplayModel(group) {
  const firstVehicle = group.vehicles?.[0] || {};
  return String(
    group.label
    || group.group_label
    || group.normalizedInput
    || firstVehicle.marca_modelo
    || firstVehicle.originalRow?.Marca_modelo_Nuevo
    || firstVehicle.originalRow?.Marca_modelo_Vendido
    || firstVehicle.originalRow?.marca_modelo
    || "Modelo sin nombre"
  ).trim();
}

function titleCaseModel(value) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (/^(kw|cv|tdi|tsi|tfsi|hdi|cdi|ev|phev|hev|aut|4x4)$/i.test(part)) return part.toUpperCase();
      if (/^nf$/i.test(part)) return "NF";
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function normalizeModelFilterKey(modelName) {
  return normalizeText(String(modelName || "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\d{4}\b$/g, "")
    .replace(/\b[A-Z]{1,2}\d{4}[A-Z]{1,3}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim());
}

function buildUniqueModelOptions(groups) {
  const byKey = new Map();
  groups.forEach((group) => {
    const raw = getGroupDisplayModel(group);
    const key = normalizeModelFilterKey(raw);
    if (!key || byKey.has(key)) return;
    byKey.set(key, { key, label: titleCaseModel(raw.replace(/[._-]+/g, " ").replace(/\b\d{4}\b$/g, "").trim()) });
  });
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function groupSearchText(group) {
  return normalizeText([
    group.label,
    group.datasetLabel,
    group.detectedFeatures?.brand,
    group.detectedFeatures?.modelBase,
    group.candidateOptions?.map((candidate) => `${candidate.id_idae} ${candidate.modeloOriginal} ${candidate.modelBase}`).join(" "),
    group.vehicles?.map((vehicle) => [
      vehicle.matricula,
      vehicle.originalRow?.Marca_modelo_Nuevo,
      vehicle.originalRow?.marca_modelo,
      vehicle.originalRow?.Categoria_nuevo,
      vehicle.originalRow?.categoria
    ].join(" ")).join(" ")
  ].filter(Boolean).join(" "));
}

function buildDatasetDiagnostics(items = [], groups = []) {
  const stateCount = (patterns) => items.filter((item) => patterns.includes(item.match_estado)).length;
  return {
    totalDatasetVehicles: items.length,
    exactMatches: stateCount(["Match exacto", "match_exacto", "exacto"]),
    conflictVehicles: stateCount(["Conflicto", "conflicto", "conflict", "requiere_revision", "requires_review"]),
    noMatchVehicles: stateCount(["Sin match", "sin_match", "no_match", "not_found"]),
    noDbVehicles: items.filter((item) => item.vehiculo_no_encontrado_db || item.match_estado === "Vehiculo no encontrado en DB").length,
    vehiclesUsedForGroups: groups.reduce((sum, group) => sum + group.groupSize, 0),
    conflictGroups: groups.filter((group) => group.workType === "conflict").length,
    noMatchGroups: groups.filter((group) => group.workType === "no_match").length,
    noDbGroups: groups.filter(isNoDbConflictGroup).length,
    resolvedGroups: groups.filter(isResolvedConflictGroup).length,
    calculatedPendingVehicles: groups.reduce((sum, group) => sum + (group.pendingVehicles ?? group.unresolvedVehicleCount ?? 0), 0)
  };
}

function buildConflictSummary(groups, items = []) {
  const totalGroups = groups.length;
  const pendingGroups = groups.filter(isPendingConflictGroup).length;
  const resolvedGroups = groups.filter(isResolvedConflictGroup).length;
  const partiallyResolvedGroups = groups.filter((group) => group.groupStatus === "partially_resolved").length;
  const manualReviewGroups = groups.filter((group) => group.groupStatus === "manual_review").length;
  const noDbGroups = groups.filter(isNoDbConflictGroup).length;
  const appliedByGroup = groups.filter((group) => group.appliedByGroup).length;
  const appliedManually = groups.filter((group) => group.appliedManually).length;
  const strongDifferences = groups.filter((group) => group.hasStrongDifferences).length;
  const doubtfulDifferences = groups.filter((group) => group.hasDoubtfulDifferences).length;
  const totalVehiclesInGroups = groups.reduce((sum, group) => sum + group.groupSize, 0);
  const resolvedVehiclesInGroups = groups.reduce((sum, group) => sum + group.resolvedVehicleCount, 0);
  const unresolvedVehiclesInGroups = groups.reduce((sum, group) => sum + (group.pendingVehicles ?? group.unresolvedVehicleCount ?? 0), 0);
  const diagnostics = buildDatasetDiagnostics(items, groups);
  return {
    totalGroups,
    pendingGroups,
    resolvedGroups,
    partiallyResolvedGroups,
    manualReviewGroups,
    noDbGroups,
    appliedByGroup,
    appliedManually,
    strongDifferences,
    doubtfulDifferences,
    totalVehiclesInGroups,
    resolvedVehiclesInGroups,
    unresolvedVehiclesInGroups,
    groupPercent: totalGroups ? (resolvedGroups / totalGroups) * 100 : 0,
    vehiclePercent: totalVehiclesInGroups ? (resolvedVehiclesInGroups / totalVehiclesInGroups) * 100 : 0,
    diagnostics
  };
}

function matchesStatusFilter(group, filter) {
  if (filter === "all") return true;
  if (filter === "pending") return isPendingConflictGroup(group);
  if (filter === "resolved") return isResolvedConflictGroup(group);
  if (filter === "marked_no_db") return isNoDbConflictGroup(group);
  if (filter === "strong_differences") return group.hasStrongDifferences;
  if (filter === "doubtful_differences") return group.hasDoubtfulDifferences;
  if (filter === "applied_by_group") return group.appliedByGroup;
  if (filter === "manual") return group.appliedManually;
  return group.groupStatus === filter;
}

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
                <button className="small" onClick={() => { onAssignGroup(group, candidate.id_idae, "global-search", candidate); onClose(); }}>Asignar a este grupo</button>
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
  items = [],
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
  const [comparisonTarget, setComparisonTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [datasetFilter, setDatasetFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("size_desc");
  const targets = groups || [];
  const summary = useMemo(() => buildConflictSummary(targets, items), [targets, items]);
  const stateDatasetTargets = useMemo(() => targets
    .filter((group) => matchesStatusFilter(group, statusFilter))
    .filter((group) => datasetFilter === "all" || group.datasetType === datasetFilter), [targets, statusFilter, datasetFilter]);
  const modelOptions = useMemo(() => buildUniqueModelOptions(stateDatasetTargets), [stateDatasetTargets]);
  const filteredTargets = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return targets
      .filter((group) => matchesStatusFilter(group, statusFilter))
      .filter((group) => datasetFilter === "all" || group.datasetType === datasetFilter)
      .filter((group) => modelFilter === "all" || normalizeModelFilterKey(getGroupDisplayModel(group)) === modelFilter)
      .filter((group) => !normalizedQuery || groupSearchText(group).includes(normalizedQuery))
      .sort((a, b) => {
        if (sortMode === "size_asc") return a.groupSize - b.groupSize || a.label.localeCompare(b.label);
        if (sortMode === "score_desc") return (b.suggestedCandidate?.score || 0) - (a.suggestedCandidate?.score || 0);
        if (sortMode === "score_asc") return (a.suggestedCandidate?.score || 0) - (b.suggestedCandidate?.score || 0);
        if (sortMode === "differences_desc") return Number(b.hasStrongDifferences) - Number(a.hasStrongDifferences) || Number(b.hasDoubtfulDifferences) - Number(a.hasDoubtfulDifferences);
        if (sortMode === "label_asc") return a.label.localeCompare(b.label);
        return b.groupSize - a.groupSize || a.label.localeCompare(b.label);
      });
  }, [targets, statusFilter, datasetFilter, modelFilter, query, sortMode]);
  const selection = useMemo(() => Object.fromEntries(targets.map((group) => [
    group.groupKey,
    selectedByGroup[group.groupKey] || group.suggestedCandidate?.id_idae || group.candidateOptions[0]?.id_idae || ""
  ])), [targets, selectedByGroup]);

  useEffect(() => {
    if (modelFilter !== "all" && !modelOptions.some((option) => option.key === modelFilter)) {
      setModelFilter("all");
    }
  }, [modelFilter, modelOptions]);

  function clearFilters() {
    setStatusFilter("pending");
    setDatasetFilter("all");
    setModelFilter("all");
    setQuery("");
    setSortMode("size_desc");
  }

  if (!targets.length) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Resolver conflictos</h2>
        <p className="muted">Los conflictos equivalentes se agrupan para resolverlos una sola vez.</p>
      </div>
      <div className="conflict-control-panel">
        <div className="conflict-summary-grid">
          <span><strong>{summary.totalGroups}</strong> grupos totales</span>
          <span><strong>{summary.pendingGroups}</strong> pendientes</span>
          <span><strong>{summary.resolvedGroups}</strong> resueltos</span>
          <span><strong>{summary.noDbGroups}</strong> No DB</span>
          <span><strong>{summary.unresolvedVehiclesInGroups}</strong> vehiculos pendientes</span>
          <span><strong>{summary.groupPercent.toFixed(1)}%</strong> avance grupos</span>
          <span><strong>{summary.vehiclePercent.toFixed(1)}%</strong> avance vehiculos</span>
        </div>
        <div className="progress-stack">
          <div>
            <p className="muted">Resolucion de grupos: {summary.groupPercent.toFixed(1)}% completado</p>
            <progress max="100" value={summary.groupPercent} />
          </div>
          <div>
            <p className="muted">Vehiculos resueltos: {summary.vehiclePercent.toFixed(1)}%</p>
            <progress max="100" value={summary.vehiclePercent} />
          </div>
        </div>
        <div className="conflict-filter-row">
          {STATUS_FILTERS.map(([value, label]) => (
            <button key={value} className={statusFilter === value ? "small active" : "small ghost"} onClick={() => setStatusFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="conflict-filter-row inputs">
          <label>
            Buscar
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Matricula, modelo, IDAE, categoria" />
          </label>
          <label>
            Dataset
            <select value={datasetFilter} onChange={(event) => setDatasetFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="sold_thermal">Vendidos / termicos</option>
              <option value="purchased_electric">Comprados / electricos</option>
            </select>
          </label>
          <label>
            Modelo
            <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
              <option value="all">Todos los modelos</option>
              {modelOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Ordenar
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="size_desc">Mayor cantidad de vehiculos</option>
              <option value="size_asc">Menor cantidad de vehiculos</option>
              <option value="score_desc">Mayor score sugerido</option>
              <option value="score_asc">Menor score sugerido</option>
              <option value="differences_desc">Mas diferencias tecnicas</option>
              <option value="label_asc">Marca/modelo A-Z</option>
            </select>
          </label>
        </div>
        <details className="debug-box">
          <summary>Filtros avanzados</summary>
          <div className="conflict-filter-row advanced">
            {ADVANCED_FILTERS.map(([value, label]) => (
              <button key={value} className={statusFilter === value ? "small active" : "small ghost"} onClick={() => setStatusFilter(value)}>{label}</button>
            ))}
          </div>
        </details>
        <details className="debug-box">
          <summary>Diagnostico de grupos</summary>
          <pre>{JSON.stringify({
            totalGroups: summary.totalGroups,
            pendingGroups: summary.pendingGroups,
            resolvedGroups: summary.resolvedGroups,
            partiallyResolvedGroups: summary.partiallyResolvedGroups,
            manualReviewGroups: summary.manualReviewGroups,
            noDbGroups: summary.noDbGroups,
            appliedByGroup: summary.appliedByGroup,
            appliedManually: summary.appliedManually,
            strongDifferences: summary.strongDifferences,
            doubtfulDifferences: summary.doubtfulDifferences,
            vehiculosTotalesDataset: summary.diagnostics.totalDatasetVehicles,
            matchExacto: summary.diagnostics.exactMatches,
            conflictos: summary.diagnostics.conflictVehicles,
            sinMatch: summary.diagnostics.noMatchVehicles,
            noDb: summary.diagnostics.noDbVehicles,
            vehiculosUsadosParaConstruirGrupos: summary.diagnostics.vehiclesUsedForGroups,
            gruposConflictivos: summary.diagnostics.conflictGroups,
            gruposSinMatch: summary.diagnostics.noMatchGroups,
            gruposNoDb: summary.diagnostics.noDbGroups,
            gruposResueltos: summary.diagnostics.resolvedGroups,
            vehiculosPendientesCalculados: summary.diagnostics.calculatedPendingVehicles,
            totalVehiclesInGroups: summary.totalVehiclesInGroups,
            resolvedVehiclesInGroups: summary.resolvedVehiclesInGroups,
            unresolvedVehiclesInGroups: summary.unresolvedVehiclesInGroups
          }, null, 2)}</pre>
        </details>
      </div>
      <div className="conflict-list">
        {!filteredTargets.length && (
          <div className="empty-filter-state">
            <strong>{statusFilter === "pending" ? "No hay conflictos pendientes para este filtro." : "No hay grupos para los filtros seleccionados."}</strong>
            <p className="muted">{modelFilter !== "all" ? "No hay grupos del modelo seleccionado." : "Prueba otro estado, dataset o busqueda."}</p>
            <button className="small ghost" onClick={clearFilters}>Limpiar filtros</button>
          </div>
        )}
        {filteredTargets.map((group) => (
          <article className="conflict-item conflict-group" key={group.groupKey}>
            <div className="group-heading">
              <div>
                <p className="eyebrow">Grupo de conflicto — {group.datasetLabel}</p>
                <strong>{group.label}</strong>
                <p className="muted">
                  <Users size={15} /> {group.groupSize} vehiculos afectados · Matriculas: {group.vehicles.map((vehicle) => vehicle.matricula).join(", ")}
                </p>
              </div>
              <span className={`badge ${group.groupStatus === "resolved" ? "ok" : group.groupStatus === "partially_resolved" ? "warning" : ""}`}>{STATUS_LABELS[group.groupStatus] || group.status}</span>
            </div>

            <p>{group.workType === "no_match" ? "No se encontraron candidatos IDAE suficientes para este grupo. Puedes buscar manualmente en toda la DB o marcarlo como no encontrado." : (MATCH_MEANINGS[group.status] || STATUS_LABELS[group.groupStatus])}</p>
            {group.workType === "no_db_pending_reference" && (
              <p className="alert advertencia">Este grupo esta marcado como No DB, pero falta completar la referencia TRA050.</p>
            )}
            {group.groupStatus === "partially_resolved" && (
              <p className="alert advertencia">Este grupo esta parcialmente resuelto: {group.resolvedVehicleCount} de {group.groupSize} vehiculos resueltos.</p>
            )}
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

            {group.candidateOptions?.length > 0 && (
              <div className="current-candidate">
                <h3>Candidato seleccionado</h3>
                <CandidateCarousel
                  candidates={group.candidateOptions}
                  selectedCandidateId={selection[group.groupKey]}
                  userFeatures={group.vehicles[0].matchResult.userFeatures}
                  userVehicle={group.vehicles[0].matchResult}
                  onSelectCandidate={(candidate) => setSelectedByGroup((current) => ({ ...current, [group.groupKey]: candidate.id_idae }))}
                />
              </div>
            )}

            <div className="action-zone">
              {group.candidateOptions?.length > 0 && (
                <div className="button-row">
                  <button className="small" disabled={!selection[group.groupKey]} onClick={() => onAssignGroup(group, selection[group.groupKey], "manual-selection")}><Check size={16} /> Aplicar candidato seleccionado</button>
                  <button className="small ghost" onClick={() => setComparisonTarget({ context: "group", group, item: group.vehicles[0].matchResult })}>Comparar candidatos</button>
                </div>
              )}
              <div className="button-row secondary-actions">
                <button className="small ghost" onClick={() => setManualGroup(group)}><Search size={16} /> Buscar manualmente</button>
                {group.candidateOptions?.length > 0 && <button className="small ghost" onClick={() => onAssignGroup(group, group.suggestedCandidate?.id_idae || selection[group.groupKey], "suggested")}>Usar sugerido</button>}
                <button className="small ghost" onClick={() => setExpanded((current) => ({ ...current, [group.groupKey]: !current[group.groupKey] }))}>Resolver individualmente</button>
              </div>
              <div className="button-row critical-actions">
                <button className="small ghost danger-action" onClick={() => onMarkGroupMissing(group)}>Marcar grupo como No encontrado en DB</button>
              </div>
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
                      {group.candidateOptions?.length > 0 && <button className="small ghost" disabled={!selection[group.groupKey]} onClick={() => onAssign(vehicle.rowId, selection[group.groupKey], true)}>Aplicar solo a esta fila</button>}
                      {group.candidateOptions?.length > 0 && <button className="small ghost" onClick={() => setComparisonTarget({ context: "individual", group, item: vehicle.matchResult })}>Comparar candidatos</button>}
                      <button className="small ghost danger-action" onClick={() => onMarkMissing(vehicle.rowId)}>Marcar solo este vehiculo como No encontrado en DB</button>
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
          onApplyToGroup={(candidate) => { onAssignGroup(selectorGroup, candidate.id_idae, "manual-selection", candidate); setSelectorGroup(null); }}
          onOpenManualSearch={() => { setManualGroup(selectorGroup); setSelectorGroup(null); }}
          onMarkGroupMissing={() => { onMarkGroupMissing(selectorGroup); setSelectorGroup(null); }}
        />
      )}
      {manualGroup && <GlobalDbSearchModal group={manualGroup} index={index} onClose={() => setManualGroup(null)} onAssignGroup={onAssignGroup} onAssign={onAssign} />}
      {comparisonTarget && (
        <CandidateComparisonMatrix
          userVehicle={comparisonTarget.item}
          candidates={comparisonTarget.item?.candidates?.length ? comparisonTarget.item.candidates : comparisonTarget.group.candidateOptions}
          activeCandidateId={selection[comparisonTarget.group.groupKey]}
          context={comparisonTarget.context}
          onClose={() => setComparisonTarget(null)}
          onSelectCandidate={(candidate) => {
            if (comparisonTarget.context === "group") {
              onAssignGroup(comparisonTarget.group, candidate.id_idae, "candidate_comparison_matrix", candidate);
            } else {
              onAssign(comparisonTarget.item.id, candidate.id_idae, true, candidate, "candidate_comparison_matrix");
            }
            setComparisonTarget(null);
          }}
        />
      )}
    </section>
  );
}
