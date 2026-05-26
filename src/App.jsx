import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./components/AppHeader.jsx";
import Stepper from "./components/Stepper.jsx";
import UploadPanel from "./components/UploadPanel.jsx";
import PastePanel from "./components/PastePanel.jsx";
import ValidationSummary from "./components/ValidationSummary.jsx";
import MatchSummaryCards from "./components/MatchSummaryCards.jsx";
import VehiclesTable from "./components/VehiclesTable.jsx";
import ConflictResolver from "./components/ConflictResolver.jsx";
import ManualDbSearch from "./components/ManualDbSearch.jsx";
import MissingReferencePanel from "./components/MissingReferencePanel.jsx";
import VehicleDetailModal from "./components/VehicleDetailModal.jsx";
import ExportPanel from "./components/ExportPanel.jsx";
import { VEHICLE_DB } from "./data/vehicle-db.js";
import { TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "./data/tra050-reference.js";
import { buildSearchIndex, matchRowsInChunks, MATCH_MEANINGS, MATCH_STATES } from "./utils/matchEngine.js";
import { validateRows } from "./utils/validation.js";
import { normalizeText } from "./utils/normalize.js";
import { groupConflictResults } from "./utils/groupConflicts.js";

const STORAGE_KEY = "tra050-matchlab-session";
const DEFAULT_MISSING_REFERENCE = {
  ...TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0],
  key: "nuevo-M1",
  consumo: TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0].consumo_kwh_100km,
  unidad: "kWh/100km"
};

export default function App() {
  const index = useMemo(() => buildSearchIndex(VEHICLE_DB), []);
  const [validation, setValidation] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [processing, setProcessing] = useState(null);
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.items) {
        setItems(saved.items);
        setValidation(saved.validation);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, validation, editedAt: new Date().toISOString() }));
  }, [items, validation]);

  async function handleRows(rows) {
    cancelRef.current = { cancelled: false };
    setProcessing({ stage: "Validando estructura", processed: 0, total: rows.length, percent: 0 });
    const result = validateRows(rows);
    setValidation(result);
    if (result.hasErrors) {
      setItems([]);
      setToast("Hay errores criticos de estructura. Corrigelos antes de ejecutar matching.");
      setProcessing(null);
      return;
    }
    try {
      setProcessing({ stage: "Ejecutando matching", processed: 0, total: result.rows.length, percent: 0 });
      const matched = await matchRowsInChunks(result.rows, index, setProcessing, cancelRef.current);
      setProcessing({ stage: "Agrupando conflictos", processed: result.rows.length, total: result.rows.length, percent: 100 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      setItems(matched);
      setToast(`Carga procesada: ${result.rows.length} vehiculos.`);
    } catch (error) {
      setToast(error.message || "No se pudo completar el analisis. Revisa el archivo o intenta procesar menos filas.");
    } finally {
      setProcessing(null);
    }
  }

  function assignCandidate(itemId, candidateId, manual = false, candidateOverride = null) {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const candidate = candidateOverride || item.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
      if (!candidate) return item;
      return {
        ...item,
        assigned: candidate,
        match_estado: manual ? MATCH_STATES.exacto : item.match_estado,
        match_score: candidate.score || item.match_score || 100,
        match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
        explicacion_match: manual ? `Asignacion manual a ${candidate.modeloOriginal}.` : item.explicacion_match,
        match_manual: manual,
        manual_search_used: Boolean(candidateOverride),
        vehiculo_no_encontrado_db: false,
        reference: null
      };
    }));
  }

  function assignCandidateToGroup(group, candidateId, mode = "manual-selection") {
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    setItems((current) => current.map((item) => {
      if (!ids.has(item.id)) return item;
      const candidate = item.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
      if (!candidate) return item;
      return {
        ...item,
        assigned: candidate,
        match_estado: MATCH_STATES.exacto,
        match_score: candidate.score || item.match_score || 100,
        match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
        explicacion_match: mode === "global-search"
          ? `Asignado manualmente por el usuario desde busqueda global en DB IDAE: ${candidate.modeloOriginal}.`
          : `Resolucion de grupo aplicada a ${group.groupSize} vehiculos: ${candidate.modeloOriginal}.`,
        match_manual: true,
        manual_search_used: mode === "global-search",
        vehiculo_no_encontrado_db: false,
        reference: null,
        conflict_group_key: group.groupKey,
        conflict_group_label: group.label,
        conflict_group_size: group.groupSize,
        resolved_as_group: true,
        group_resolution_key: group.groupKey,
        group_resolution_applied: true,
        group_resolution_timestamp: timestamp,
        group_resolution_mode: mode
      };
    }));
  }

  function markMissing(itemId) {
    setItems((current) => current.map((item) => item.id === itemId ? {
      ...item,
      assigned: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      reference: DEFAULT_MISSING_REFERENCE,
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050."
    } : item));
  }

  function markGroupMissing(group) {
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    setItems((current) => current.map((item) => ids.has(item.id) ? {
      ...item,
      assigned: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: `Vehiculo no encontrado en DB aplicado al grupo ${group.label}.`,
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      reference: DEFAULT_MISSING_REFERENCE,
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050.",
      conflict_group_key: group.groupKey,
      conflict_group_label: group.label,
      conflict_group_size: group.groupSize,
      resolved_as_group: true,
      group_resolution_key: group.groupKey,
      group_resolution_applied: true,
      group_resolution_timestamp: timestamp,
      group_resolution_mode: "not-found"
    } : item));
  }

  function resolveIndividually(itemId) {
    setItems((current) => current.map((item) => item.id === itemId ? {
      ...item,
      group_individual_resolution: true,
      resolved_as_group: false
    } : item));
  }

  function updateMissingReference(itemId, reference, notes) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, reference, notes } : item));
  }

  function applySimilar(source) {
    if (!source.assigned) return;
    const sourceModel = normalizeText(source.input.Marca_modelo_Nuevo);
    const sourceCc = source.input.Cilindrada_Nuevo || "";
    const sourceFuel = normalizeText(source.input.Combustible_Motorizacion_Nuevo || "");
    const similar = items.filter((item) => item.id !== source.id && normalizeText(item.input.Marca_modelo_Nuevo) === sourceModel && (!sourceCc || item.input.Cilindrada_Nuevo === sourceCc) && (!sourceFuel || normalizeText(item.input.Combustible_Motorizacion_Nuevo || "") === sourceFuel));
    if (!similar.length) {
      setToast("No se encontraron filas similares para aplicar este match.");
      return;
    }
    const ok = window.confirm(`Se aplicara el match ${source.assigned.id_idae} a ${similar.length} vehiculos similares. ¿Continuar?`);
    if (!ok) return;
    setItems((current) => current.map((item) => similar.some((entry) => entry.id === item.id) ? {
      ...item,
      assigned: source.assigned,
      match_estado: MATCH_STATES.exacto,
      match_score: source.match_score,
      match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
      explicacion_match: `Match aplicado masivamente desde ${source.input.Matricula_Nuevo}.`,
      match_manual: true
    } : item));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
    setValidation(null);
    setSelected(null);
    setToast("Sesion local limpiada.");
  }

  const currentStep = items.length ? (items.some((item) => [MATCH_STATES.conflicto, MATCH_STATES.probable].includes(item.match_estado)) ? 3 : 4) : validation ? 1 : 0;
  const selectedFresh = selected ? items.find((item) => item.id === selected.id) : null;
  const conflictGroups = useMemo(() => groupConflictResults(items), [items]);

  return (
    <main>
      <AppHeader dbCount={index.length} onClear={clearSession} />
      <Stepper current={currentStep} />
      {processing && (
        <section className="processing-overlay">
          <div className="processing-card">
            <div className="spinner" />
            <h2>{processing.stage}</h2>
            <p>Procesando {processing.processed.toLocaleString("es-ES")} de {processing.total.toLocaleString("es-ES")} vehiculos...</p>
            <progress value={processing.percent} max="100" />
            <strong>{processing.percent}%</strong>
            <button className="ghost small" onClick={() => { cancelRef.current.cancelled = true; }}>Cancelar procesamiento</button>
          </div>
        </section>
      )}
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
      <div className="load-grid">
        <UploadPanel onRows={handleRows} onError={setToast} />
        <PastePanel onRows={handleRows} onError={setToast} />
      </div>
      <ValidationSummary validation={validation} />
      <MatchSummaryCards items={items} alerts={validation?.alerts || []} />
      <VehiclesTable items={items} onSelect={setSelected} onMarkMissing={markMissing} />
      <ConflictResolver groups={conflictGroups} index={index} onAssign={assignCandidate} onAssignGroup={assignCandidateToGroup} onApplySimilar={applySimilar} onMarkMissing={markMissing} onMarkGroupMissing={markGroupMissing} onResolveIndividually={resolveIndividually} onSelect={setSelected} />
      <MissingReferencePanel items={items} onUpdate={updateMissingReference} />
      <ManualDbSearch index={index} selectedItem={selectedFresh} onAssign={assignCandidate} />
      <ExportPanel items={items} />
      <VehicleDetailModal item={selectedFresh} onClose={() => setSelected(null)} />
    </main>
  );
}
