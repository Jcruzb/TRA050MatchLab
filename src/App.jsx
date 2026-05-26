import { useEffect, useMemo, useState } from "react";
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
import { buildSearchIndex, matchRows, MATCH_MEANINGS, MATCH_STATES } from "./utils/matchEngine.js";
import { validateRows } from "./utils/validation.js";
import { normalizeText } from "./utils/normalize.js";

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

  function handleRows(rows) {
    const result = validateRows(rows);
    setValidation(result);
    if (result.hasErrors) {
      setItems([]);
      setToast("Hay errores criticos de estructura. Corrigelos antes de ejecutar matching.");
      return;
    }
    setItems(matchRows(result.rows, index));
    setToast(`Carga procesada: ${result.rows.length} vehiculos.`);
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
        vehiculo_no_encontrado_db: false,
        reference: null
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

  return (
    <main>
      <AppHeader dbCount={index.length} onClear={clearSession} />
      <Stepper current={currentStep} />
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
      <div className="load-grid">
        <UploadPanel onRows={handleRows} onError={setToast} />
        <PastePanel onRows={handleRows} onError={setToast} />
      </div>
      <ValidationSummary validation={validation} />
      <MatchSummaryCards items={items} alerts={validation?.alerts || []} />
      <VehiclesTable items={items} onSelect={setSelected} onMarkMissing={markMissing} />
      <ConflictResolver items={items} onAssign={assignCandidate} onApplySimilar={applySimilar} onMarkMissing={markMissing} />
      <MissingReferencePanel items={items} onUpdate={updateMissingReference} />
      <ManualDbSearch index={index} selectedItem={selectedFresh} onAssign={assignCandidate} />
      <ExportPanel items={items} />
      <VehicleDetailModal item={selectedFresh} onClose={() => setSelected(null)} />
    </main>
  );
}
