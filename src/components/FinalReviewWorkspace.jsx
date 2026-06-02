import { useMemo, useState } from "react";
import { Eye, Lock, RotateCcw, SearchCheck, Unlock } from "lucide-react";

const REVIEW_LABELS = {
  pending_review: "Pendiente",
  reviewed: "Revisado",
  needs_change: "Necesita cambio",
  changed_after_review: "Con cambios"
};

function plate(item) {
  return item.input?.matricula || item.input?.Matricula_Nuevo || "-";
}

function model(item) {
  return item.input?.marca_modelo || item.input?.Marca_modelo_Nuevo || "-";
}

function category(item) {
  return item.input?.categoria || item.input?.Categoria_nuevo || "-";
}

function datasetLabel(item) {
  return item.dataset_type === "sold_thermal" ? "Vendido / Termico" : "Comprado / Electrico";
}

function reviewStatus(item) {
  return item.review_status || "pending_review";
}

function technicalDiffs(item) {
  const comparison = item.technical_comparison || {};
  return Object.values(comparison).filter((entry) => ["doubtful", "different"].includes(entry?.status)).length;
}

function warningText(item) {
  return [item.dataset_warning, item.conflictos_detectados, item.no_db_reason_text].filter(Boolean).join(" | ");
}

function pairForItem(item, pairs) {
  return pairs.find((pair) => pair.match_pair_id === item.match_pair_id || pair.sold_row_id === item.id || pair.purchased_row_id === item.id);
}

function buildGroups(items, pairs) {
  const groups = [];
  const addMapGroups = (type, label, keyFn, filterFn = () => true) => {
    const map = new Map();
    items.filter(filterFn).forEach((item) => {
      const key = keyFn(item) || "Sin dato";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    map.forEach((rows, key) => groups.push({ type, label: `${label}: ${key}`, key, items: rows }));
  };
  addMapGroups("model", "Modelo cargado", model);
  addMapGroups("candidate", "Candidato IDAE", (item) => item.assigned?.id_idae || "Sin IDAE", (item) => item.assigned?.id_idae);
  addMapGroups("no_db", "Grupo No DB", (item) => item.group_resolution_key || model(item), (item) => item.vehiculo_no_encontrado_db);
  addMapGroups("pair", "Pareja TRA050", (item) => item.match_pair_id, (item) => item.match_pair_id);
  addMapGroups("category", "Categoria", category);
  addMapGroups("warning", "Advertencias", (item) => warningText(item) || "Con advertencias", (item) => warningText(item));
  pairs.filter((pair) => pair.warnings?.length || pair.warnings_calculo?.length).forEach((pair) => {
    groups.push({ type: "pair_warning", label: `Par con advertencias: ${pair.match_pair_id}`, key: pair.match_pair_id, items: items.filter((item) => item.id === pair.sold_row_id || item.id === pair.purchased_row_id), pair });
  });
  return groups.sort((a, b) => b.items.length - a.items.length);
}

function statusTone(status) {
  if (status === "reviewed") return "ok";
  if (status === "changed_after_review") return "warning";
  if (status === "needs_change") return "danger";
  return "neutral";
}

export default function FinalReviewWorkspace({
  datasets,
  pairing,
  reviewChangeLog = [],
  onSelectVehicle,
  onMarkVehicleReviewed,
  onToggleVehicleLock,
  onChangeCandidate,
  onMarkNoDb,
  onRevertNoDb,
  onUndoSelection,
  onMarkPairReviewed,
  onTogglePairReviewLock,
  onUndoPair,
  onMarkGroupReviewed
}) {
  const [mode, setMode] = useState("unit");
  const [filter, setFilter] = useState("all");
  const allItems = useMemo(() => [
    ...(datasets.soldThermal?.matchResults || []),
    ...(datasets.purchasedElectric?.matchResults || [])
  ], [datasets]);
  const pairs = pairing.pairs || [];
  const rows = useMemo(() => allItems.filter((item) => {
    if (filter === "pending") return reviewStatus(item) === "pending_review";
    if (filter === "reviewed") return reviewStatus(item) === "reviewed";
    if (filter === "warnings") return Boolean(warningText(item));
    if (filter === "no_db") return Boolean(item.vehiculo_no_encontrado_db);
    if (filter === "idae") return Boolean(item.assigned?.id_idae);
    if (filter === "technical") return technicalDiffs(item) > 0;
    if (filter === "paired") return Boolean(item.match_pair_id);
    if (filter === "unpaired") return !item.match_pair_id;
    return true;
  }), [allItems, filter]);
  const groups = useMemo(() => buildGroups(allItems, pairs), [allItems, pairs]);
  const reviewedVehicles = allItems.filter((item) => reviewStatus(item) === "reviewed").length;
  const pairReviewed = pairs.filter((pair) => (pair.pair_review_status || "pending_review") === "reviewed").length;
  const warningVehicles = allItems.filter((item) => warningText(item)).length;
  const warningPairs = pairs.filter((pair) => pair.warnings?.length || pair.warnings_calculo?.length).length;

  return (
    <>
      <section className="panel dataset-hero">
        <p className="eyebrow">Fase final</p>
        <h2>Revision final</h2>
        <p className="muted">Audita las decisiones de matching IDAE, No DB y emparejamiento TRA050 antes de exportar.</p>
        <div className="button-row">
          <button className={mode === "unit" ? "" : "ghost"} onClick={() => setMode("unit")}>Revision por unidad</button>
          <button className={mode === "package" ? "" : "ghost"} onClick={() => setMode("package")}>Revision por paquete</button>
          <button className={mode === "pairs" ? "" : "ghost"} onClick={() => setMode("pairs")}>Pares TRA050</button>
          <button className={mode === "log" ? "" : "ghost"} onClick={() => setMode("log")}>Historial</button>
        </div>
      </section>

      <section className="summary-grid">
        {[
          ["Total vehiculos", allItems.length],
          ["Vehiculos revisados", reviewedVehicles],
          ["Vehiculos pendientes", allItems.length - reviewedVehicles],
          ["Vehiculos con advertencias", warningVehicles],
          ["Vehiculos No DB", allItems.filter((item) => item.vehiculo_no_encontrado_db).length],
          ["Pares revisados", pairReviewed],
          ["Pares pendientes", pairs.length - pairReviewed],
          ["Pares con advertencias", warningPairs],
          ["Cambios en revision", reviewChangeLog.length]
        ].map(([label, value]) => (
          <article className="summary-card info" key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      {mode === "unit" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Revision por unidad</h2>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="pending">Pendientes de revision</option>
              <option value="reviewed">Revisados</option>
              <option value="warnings">Con advertencias</option>
              <option value="no_db">No encontrados en DB</option>
              <option value="idae">Candidatos IDAE asignados</option>
              <option value="technical">Con diferencias tecnicas</option>
              <option value="paired">Con pareja TRA050</option>
              <option value="unpaired">Sin pareja</option>
            </select>
          </div>
          <div className="table-wrap review-table-wrap">
            <table>
              <thead>
                <tr><th>Revision</th><th>Dataset</th><th>Matricula</th><th>Categoria</th><th>Modelo cargado</th><th>IDAE</th><th>Modelo IDAE</th><th>Match</th><th>Dif. tecnicas</th><th>No DB</th><th>Pair</th><th>Ahorro</th><th>Advertencias</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const pair = pairForItem(item, pairs);
                  return (
                    <tr key={`${item.dataset_type}-${item.id}`}>
                      <td><span className={`state ${statusTone(reviewStatus(item))}`}>{REVIEW_LABELS[reviewStatus(item)]}</span>{item.review_locked && <span className="mini-badge dark">Bloqueado</span>}</td>
                      <td>{datasetLabel(item)}</td>
                      <td>{plate(item)}</td>
                      <td>{category(item)}</td>
                      <td>{model(item)}</td>
                      <td>{item.assigned?.id_idae || "-"}</td>
                      <td>{item.assigned?.modeloOriginal || "-"}</td>
                      <td>{item.match_estado || "-"}</td>
                      <td>{technicalDiffs(item)}</td>
                      <td>{item.vehiculo_no_encontrado_db ? "Si" : "No"}</td>
                      <td>{item.match_pair_id || "-"}</td>
                      <td>{pair?.ahorro_kwh_anio ? `${Number(pair.ahorro_kwh_anio).toFixed(2)} kWh/año` : "-"}</td>
                      <td>{warningText(item) || "-"}</td>
                      <td className="row-actions">
                        <button className="icon" title="Ver detalle" onClick={() => onSelectVehicle(item)}><Eye size={16} /></button>
                        <button className="small" onClick={() => onMarkVehicleReviewed(item)}>Marcar revisado</button>
                        <button className="icon ghost" title={item.review_locked ? "Desbloquear" : "Bloquear revisado"} onClick={() => onToggleVehicleLock(item)}>{item.review_locked ? <Unlock size={16} /> : <Lock size={16} />}</button>
                        {item.candidates?.length > 0 && (
                          <select value="" onChange={(event) => event.target.value && onChangeCandidate(item, event.target.value)}>
                            <option value="">Cambiar IDAE</option>
                            {item.candidates.map((candidate) => <option key={candidate.id_idae} value={candidate.id_idae}>{candidate.id_idae} · {candidate.score ?? "-"} pts</option>)}
                          </select>
                        )}
                        <button className="small ghost" onClick={() => onMarkNoDb(item)}>No DB</button>
                        {item.vehiculo_no_encontrado_db && <button className="small ghost" onClick={() => onRevertNoDb(item)}>Revertir No DB</button>}
                        <button className="small ghost" onClick={() => onUndoSelection(item)}><RotateCcw size={14} /> Deshacer</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mode === "package" && (
        <section className="panel">
          <h2>Revision por paquete</h2>
          <div className="review-group-list">
            {groups.slice(0, 80).map((group) => {
              const reviewed = group.items.filter((item) => reviewStatus(item) === "reviewed").length;
              const warnings = group.items.filter((item) => warningText(item)).length;
              return (
                <article className="review-group-card" key={`${group.type}-${group.key}`}>
                  <div>
                    <strong>{group.label}</strong>
                    <p className="muted">{group.items.length} vehiculos · {reviewed} revisados · {warnings} con advertencias</p>
                  </div>
                  <div className="button-row">
                    <button className="small" onClick={() => onMarkGroupReviewed(group.items)}>Marcar grupo revisado</button>
                    <button className="small ghost" onClick={() => group.items.forEach((item) => onToggleVehicleLock(item, true))}>Bloquear grupo revisado</button>
                    {group.items[0]?.candidates?.length > 0 && (
                      <select value="" onChange={(event) => {
                        if (!event.target.value) return;
                        const ok = window.confirm("Vas a cambiar el candidato IDAE para todo este grupo. ¿Quieres continuar?");
                        if (ok) group.items.forEach((item) => onChangeCandidate(item, event.target.value, false));
                        event.target.value = "";
                      }}>
                        <option value="">Cambiar candidato grupo</option>
                        {group.items[0].candidates.map((candidate) => <option key={candidate.id_idae} value={candidate.id_idae}>{candidate.id_idae} · {candidate.score ?? "-"} pts</option>)}
                      </select>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {mode === "pairs" && (
        <section className="panel">
          <h2>Revision de pares TRA050</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Revision</th><th>Pair ID</th><th>Vendido</th><th>Comprado</th><th>Ahorro</th><th>Estado</th><th>Advertencias</th><th>Acciones</th></tr></thead>
              <tbody>
                {pairs.map((pair) => (
                  <tr key={pair.match_pair_id}>
                    <td><span className={`state ${statusTone(pair.pair_review_status || "pending_review")}`}>{REVIEW_LABELS[pair.pair_review_status || "pending_review"]}</span>{pair.pair_review_locked && <span className="mini-badge dark">Bloqueado</span>}</td>
                    <td>{pair.match_pair_id}</td>
                    <td>{pair.sold_matricula || pair.sold_row_id}</td>
                    <td>{pair.purchased_matricula || pair.purchased_row_id}</td>
                    <td>{pair.ahorro_kwh_anio ? `${Number(pair.ahorro_kwh_anio).toFixed(2)} kWh/año` : "-"}</td>
                    <td>{pair.pair_status}</td>
                    <td>{[...(pair.warnings || []), ...(pair.warnings_calculo || [])].join(" | ") || "-"}</td>
                    <td className="row-actions">
                      <button className="small" onClick={() => onMarkPairReviewed(pair)}>Marcar par revisado</button>
                      <button className="icon ghost" onClick={() => onTogglePairReviewLock(pair)}>{pair.pair_review_locked ? <Unlock size={16} /> : <Lock size={16} />}</button>
                      <button className="small ghost" onClick={() => {
                        const ok = window.confirm("Vas a deshacer esta pareja TRA050 y liberar ambos vehiculos. ¿Quieres continuar?");
                        if (ok) onUndoPair(pair.match_pair_id);
                      }}>Deshacer pareja</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mode === "log" && (
        <section className="panel">
          <h2>Historial de cambios</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Fecha</th><th>Scope</th><th>Accion</th><th>Dataset</th><th>Filas</th><th>Pares</th><th>Nota</th></tr></thead>
              <tbody>
                {reviewChangeLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.id}</td>
                    <td>{entry.created_at}</td>
                    <td>{entry.scope}</td>
                    <td>{entry.action}</td>
                    <td>{entry.dataset_type || "-"}</td>
                    <td>{(entry.row_ids || []).join(", ") || "-"}</td>
                    <td>{(entry.match_pair_ids || []).join(", ") || "-"}</td>
                    <td>{entry.user_note || entry.reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
