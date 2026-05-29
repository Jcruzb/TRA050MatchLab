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
import ProcessingOverlay from "./components/ProcessingOverlay.jsx";
import PairingWorkspace from "./components/PairingWorkspace.jsx";
import { VEHICLE_DB } from "./data/vehicle-db.js";
import { TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "./data/tra050-reference.js";
import { buildSearchIndex, matchRowsInChunks, MATCH_MEANINGS, MATCH_STATES } from "./utils/matchEngine.js";
import { normalizeText } from "./utils/normalize.js";
import { groupConflictResults } from "./utils/groupConflicts.js";
import { clearLearningRules, exportLearningRules, importLearningRules, loadLearningRules, saveLearningRule } from "./engine/vehicleLearning.js";
import { createEmptyDataset, DATASET_CONFIG, validateDatasetRows } from "./utils/datasets.js";
import { applyPairsToDatasets, autoPairVehicles, buildPairingCandidates, prepareVehiclesForPairing, validatePairingIntegrity } from "./tra050/tra050Pairing.js";
import { exportFinalTra050Excel } from "./tra050/tra050PairExport.js";
import { applyTra050ReferenceResolution } from "./tra050/tra050ReferenceResolver.js";

const STORAGE_KEY = "tra050-matchlab-session";
const EMPTY_PAIRING = { pairs: [], unpairedSold: [], unpairedPurchased: [], candidates: [], warnings: [], summary: {}, integrity: null, updatedAt: null, annualMileageKm: "" };

function unpairedReasonFor(item, role, evaluatedCandidates = [], selectedPairs = []) {
  const id = item.id;
  const relevant = evaluatedCandidates.filter((candidate) => role === "sold" ? candidate.sold_row_id === id : candidate.purchased_row_id === id);
  if (!relevant.length) return { unpaired_reason: "no_same_category_counterpart", unpaired_reason_detail: "No se evaluo ninguna contraparte para este vehiculo." };
  if (!relevant.some((candidate) => candidate.categoryCheck?.valid)) return { unpaired_reason: "no_same_category_counterpart", unpaired_reason_detail: "No tiene contraparte de la misma categoria." };
  if (!relevant.some((candidate) => candidate.dateWindowCheck?.valid)) return { unpaired_reason: "no_valid_date_window", unpaired_reason_detail: "Todas las contrapartes estan fuera de ventana temporal." };
  const savingErrors = relevant.flatMap((candidate) => candidate.savingCheck?.errors || []);
  if (savingErrors.includes("falta_kilometraje_anual")) return { unpaired_reason: "missing_annual_mileage", unpaired_reason_detail: "Falta kilometraje promedio anual L para calcular ahorro." };
  if (!relevant.some((candidate) => candidate.savingCheck?.valid)) return { unpaired_reason: "missing_consumption", unpaired_reason_detail: "Falta consumo valido o factor para calcular ahorro." };
  const selectedIds = new Set(selectedPairs.flatMap((pair) => [pair.sold_row_id, pair.purchased_row_id]));
  const best = relevant.filter((candidate) => candidate.isEligible).sort((a, b) => (b.savingCheck?.ahorro_kwh_year || 0) - (a.savingCheck?.ahorro_kwh_year || 0))[0];
  if (best && (selectedIds.has(best.sold_row_id) || selectedIds.has(best.purchased_row_id))) {
    return { unpaired_reason: "already_used_by_higher_saving_pair", unpaired_reason_detail: "La mejor alternativa fue asignada a otra pareja con mayor prioridad de ahorro." };
  }
  return { unpaired_reason: "not_selected_by_optimization", unpaired_reason_detail: "Fue sobrante por regla de uso unico y optimizacion." };
}

function createDatasets() {
  return {
    soldThermal: createEmptyDataset(DATASET_CONFIG.soldThermal),
    purchasedElectric: createEmptyDataset(DATASET_CONFIG.purchasedElectric)
  };
}

function defaultReferenceForDataset(config) {
  if (config.type === "sold_thermal") {
    return null;
  }
  const item = TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0];
  return { ...item, key: `nuevo-${item.tipologia}`, consumo: item.consumo || item.consumo_kwh_100km, unidad: item.unidad || "kWh/100km" };
}

function electricReferenceForNoDbVehicle(item) {
  const category = String(item.input?.categoria || item.input?.Categoria_nuevo || item.categoria || "").trim().toUpperCase();
  const reference = TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO.find((entry) => String(entry.tipologia).toUpperCase() === category);
  if (!reference) return null;
  return {
    ...reference,
    key: `nuevo-${reference.tipologia}`,
    consumo: reference.consumo || reference.consumo_kwh_100km,
    unidad: reference.unidad || "kWh/100km"
  };
}

function applyNoDbReferenceForDataset(item, datasetType) {
  if (datasetType === "sold_thermal") return applyTra050ReferenceResolution(item, datasetType);
  if (datasetType === "purchased_electric") {
    const reference = electricReferenceForNoDbVehicle(item);
    if (!reference) {
      return {
        ...item,
        reference: null,
        consumo_origen: "",
        tra050_reference_auto_selected: false,
        tra050_reference_confidence: "low",
        tra050_reference_reason: "No se pudo inferir referencia electrica TRA050 por categoria."
      };
    }
    return {
      ...item,
      reference,
      consumo_origen: "tra050_reference",
      consumo_referencia_tra050: reference.consumo,
      unidad_consumo: reference.unidad,
      tipologia_referencia_tra050: reference.tipologia,
      combustible_referencia_tra050: "",
      tra050_reference_auto_selected: true,
      tra050_reference_manual_selected: false,
      tra050_reference_confidence: "high",
      tra050_reference_reason: `Categoria ${reference.tipologia} detectada; referencia TRA050 electrica seleccionada automaticamente.`,
      observacion_consumo_referencia: "Referencia TRA050 electrica seleccionada automaticamente por categoria."
    };
  }
  return item;
}

function resolveNoDbReferencesInDataset(dataset) {
  return {
    ...dataset,
    matchResults: (dataset.matchResults || []).map((item) => {
      if (!item.vehiculo_no_encontrado_db) return item;
      if (item.tra050_reference_manual_selected) return item;
      if (item.dataset_type !== "sold_thermal") return item.reference ? item : applyNoDbReferenceForDataset(item, item.dataset_type);
      if (item.reference && item.tra050_reference_auto_selected) return item;
      return applyTra050ReferenceResolution(item, item.dataset_type);
    })
  };
}

function resolveNoDbReferencesInDatasets(datasets) {
  return Object.fromEntries(Object.entries(datasets).map(([key, dataset]) => [key, resolveNoDbReferencesInDataset(dataset)]));
}

function addDatasetWarnings(items, config) {
  return items.map((item) => {
    const motor = item.assigned?.motorizacion || item.userFeatures?.motorizacion || "";
    const warnings = [];
    if (config.type === "sold_thermal" && motor === "electrico puro") {
      warnings.push("Este vehículo vendido parece eléctrico. Revisa si está cargado en la pestaña correcta.");
    }
    if (config.type === "purchased_electric" && motor && motor !== "electrico puro") {
      warnings.push("Este vehículo comprado no parece eléctrico puro según el match IDAE. Revisa el candidato seleccionado.");
    }
    return {
      ...item,
      dataset_type: config.type,
      expected_powertrain: config.expectedPowertrain,
      dataset_warning: warnings.join(" "),
      conflictos_detectados: [item.conflictos_detectados, ...warnings].filter(Boolean).join(" ")
    };
  });
}

function slimCandidate(candidate) {
  if (!candidate) return null;
  return {
    id_idae: candidate.id_idae,
    modeloOriginal: candidate.modeloOriginal,
    modeloNormalizado: candidate.modeloNormalizado,
    marcaDetectada: candidate.marcaDetectada,
    modelBase: candidate.modelBase,
    yearMY: candidate.yearMY,
    cilindradaCc: candidate.cilindradaCc,
    motorizacion: candidate.motorizacion,
    tipoCambio: candidate.tipoCambio,
    potenciaCv: candidate.potenciaCv,
    potenciaElectricaKw: candidate.potenciaElectricaKw,
    segmento: candidate.segmento,
    consumoElectricoKwh100: candidate.consumoElectricoKwh100,
    consumoLitros100: candidate.consumoLitros100,
    source_url: candidate.source_url,
    score: candidate.score,
    explicacion: candidate.explicacion,
    matchedFeatures: candidate.matchedFeatures,
    penalties: candidate.penalties
  };
}

function makePersistableDatasets(datasets) {
  return Object.fromEntries(Object.entries(datasets).map(([key, dataset]) => [
    key,
    {
      ...dataset,
      rawRows: [],
      normalizedRows: [],
      conflictGroups: [],
      matchResults: (dataset.matchResults || []).map((item) => ({
        ...item,
        assigned: slimCandidate(item.assigned),
        candidates: (item.candidates || []).slice(0, 8).map(slimCandidate)
      }))
    }
  ]));
}

function StartupSkeleton({ stage }) {
  return (
    <main className="startup-shell" aria-busy="true">
      <section className="startup-card">
        <div className="boot-spinner" />
        <div>
          <p className="eyebrow">TRA050 MatchLab</p>
          <h1>Preparando entorno local</h1>
          <p className="muted">{stage}</p>
        </div>
        <div className="skeleton-layout">
          <div className="skeleton-line wide" />
          <div className="skeleton-grid">
            <span />
            <span />
            <span />
          </div>
          <div className="skeleton-table">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [index, setIndex] = useState(null);
  const [startupStage, setStartupStage] = useState("Cargando base local IDAE...");
  const [activeDatasetKey, setActiveDatasetKey] = useState("soldThermal");
  const [datasets, setDatasets] = useState(createDatasets);
  const [pairing, setPairing] = useState(EMPTY_PAIRING);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [processing, setProcessing] = useState(null);
  const [learningRules, setLearningRules] = useState(() => loadLearningRules());
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      const loader = document.getElementById("boot-loader");
      if (loader) loader.remove();
      setStartupStage("Indexando base IDAE y preparando el motor de matching...");
      setTimeout(() => {
        try {
          const builtIndex = buildSearchIndex(VEHICLE_DB);
          if (!cancelled) {
            setStartupStage("Cargando sesion local...");
            setIndex(builtIndex);
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) setStartupStage("No se pudo preparar la base IDAE. Revisa vehicle-db.js.");
        }
      }, 80);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const savedText = localStorage.getItem(STORAGE_KEY);
      if (savedText && savedText.length > 4_000_000) {
        localStorage.removeItem(STORAGE_KEY);
        setToast("Se limpió una sesión local antigua demasiado grande para evitar bloqueos al cargar.");
        return;
      }
      const saved = JSON.parse(savedText || "null");
      if (saved?.datasets) {
        setDatasets(resolveNoDbReferencesInDatasets(saved.datasets));
        if (saved.pairing) setPairing(saved.pairing);
      } else if (saved?.items) {
        setDatasets((current) => ({
          ...current,
          soldThermal: {
            ...current.soldThermal,
            validation: saved.validation,
            matchResults: resolveNoDbReferencesInDataset({ matchResults: saved.items }).matchResults,
            exportReady: Boolean(saved.items?.length)
          }
        }));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ datasets: makePersistableDatasets(datasets), pairing, editedAt: new Date().toISOString() }));
    } catch (error) {
      console.warn("No se pudo persistir la sesión local completa.", error);
    }
  }, [datasets, pairing]);

  const activeConfig = DATASET_CONFIG[activeDatasetKey];
  const activeDataset = datasets[activeDatasetKey] || {};
  const items = activeDataset.matchResults || [];
  const validation = activeDataset.validation;
  const conflictGroups = useMemo(() => groupConflictResults(items), [items]);

  if (!index) {
    return <StartupSkeleton stage={startupStage} />;
  }

  function updateActiveDataset(updater) {
    setDatasets((current) => ({
      ...current,
      [activeDatasetKey]: updater(current[activeDatasetKey])
    }));
  }

  async function handleRows(rows) {
    cancelRef.current = { cancelled: false };
    setSelected(null);
    setProcessing({ stage: "Validando estructura", processed: 0, total: rows.length, percent: 0 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = validateDatasetRows(rows, activeConfig);
      const tableVersion = Date.now();
      updateActiveDataset((dataset) => ({ ...dataset, rawRows: rows, normalizedRows: result.rows, validation: result, matchResults: [], exportReady: false, tableVersion }));
      if (result.hasErrors) {
        setToast("Hay errores criticos de estructura. Corrigelos antes de ejecutar matching.");
        setProcessing(null);
        return;
      }
      setProcessing({ stage: "Ejecutando matching", processed: 0, total: result.rows.length, percent: 0 });
      const engineRows = result.rows.map((row) => ({ ...row, expected_powertrain: activeConfig.expectedPowertrain }));
      const matched = await matchRowsInChunks(engineRows, index, setProcessing, cancelRef.current, learningRules);
      setProcessing({ stage: "Agrupando conflictos", processed: result.rows.length, total: result.rows.length, percent: 100 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const matchResults = resolveNoDbReferencesInDataset({ matchResults: addDatasetWarnings(matched, activeConfig) }).matchResults;
      updateActiveDataset((dataset) => ({ ...dataset, normalizedRows: result.rows, validation: result, matchResults, conflictGroups: groupConflictResults(matchResults), exportReady: true, tableVersion }));
      setToast(`Carga procesada: ${result.rows.length} vehiculos.`);
    } catch (error) {
      setToast(error.message || "No se pudo completar el analisis. Revisa el archivo o intenta procesar menos filas.");
    } finally {
      setProcessing(null);
    }
  }

  function assignCandidate(itemId, candidateId, manual = false, candidateOverride = null) {
    const sourceItem = items.find((item) => item.id === itemId);
    const sourceCandidate = candidateOverride || sourceItem?.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
    if (manual && sourceItem && sourceCandidate) {
      setLearningRules(saveLearningRule({
        inputSignature: sourceItem.userFeatures?.normalizedText,
        normalizedInput: sourceItem.userFeatures?.normalizedText,
        detectedBrand: sourceItem.userFeatures?.brand,
        detectedModelBase: sourceItem.userFeatures?.modelBase,
        selectedIdIdae: sourceCandidate.id_idae,
        selectedModeloIdae: sourceCandidate.modeloOriginal,
        resolutionMode: candidateOverride ? "global-search" : "manual-selection"
      }));
    }
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => {
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
        reference: null,
        consumo_origen: "",
        consumo_referencia_tra050: "",
        unidad_consumo: "",
        tipologia_referencia_tra050: "",
        combustible_referencia_tra050: "",
        tra050_reference_auto_selected: false,
        tra050_reference_manual_selected: false,
        tra050_reference_confidence: "",
        tra050_reference_reason: "",
        observacion_consumo_referencia: ""
      };
    }) }));
  }

  function assignCandidateToGroup(group, candidateId, mode = "manual-selection") {
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    items.filter((item) => ids.has(item.id)).forEach((item) => {
      const candidate = item.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
      if (!candidate) return;
      setLearningRules(saveLearningRule({
        inputSignature: item.userFeatures?.normalizedText,
        normalizedInput: item.userFeatures?.normalizedText,
        detectedBrand: item.userFeatures?.brand,
        detectedModelBase: item.userFeatures?.modelBase,
        selectedIdIdae: candidate.id_idae,
        selectedModeloIdae: candidate.modeloOriginal,
        resolutionMode: mode
      }));
    });
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => {
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
        consumo_origen: "",
        consumo_referencia_tra050: "",
        unidad_consumo: "",
        tipologia_referencia_tra050: "",
        combustible_referencia_tra050: "",
        tra050_reference_auto_selected: false,
        tra050_reference_manual_selected: false,
        tra050_reference_confidence: "",
        tra050_reference_reason: "",
        observacion_consumo_referencia: "",
        conflict_group_key: group.groupKey,
        conflict_group_label: group.label,
        conflict_group_size: group.groupSize,
        resolved_as_group: true,
        group_resolution_key: group.groupKey,
        group_resolution_applied: true,
        group_resolution_timestamp: timestamp,
        group_resolution_mode: mode
      };
    }) }));
  }

  function markMissing(itemId) {
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => {
      if (item.id !== itemId) return item;
      const missingItem = {
        ...item,
      assigned: null,
      id_idae_asignado: null,
      modelo_idae_asignado: null,
      source_url_idae: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      manual_search_used: false,
      reference: defaultReferenceForDataset(activeConfig),
      consumo_origen: activeConfig.type === "sold_thermal" ? "" : "tra050_reference",
      tra050_reference_manual_selected: false,
      tra050_reference_auto_selected: false,
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050."
      };
      return applyNoDbReferenceForDataset(missingItem, activeConfig.type);
    }) }));
  }

  function markGroupMissing(group) {
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => {
      if (!ids.has(item.id)) return item;
      const missingItem = {
        ...item,
      assigned: null,
      id_idae_asignado: null,
      modelo_idae_asignado: null,
      source_url_idae: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: `Vehiculo no encontrado en DB aplicado al grupo ${group.label}.`,
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      manual_search_used: false,
      reference: defaultReferenceForDataset(activeConfig),
      consumo_origen: activeConfig.type === "sold_thermal" ? "" : "tra050_reference",
      tra050_reference_manual_selected: false,
      tra050_reference_auto_selected: false,
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050.",
      conflict_group_key: group.groupKey,
      conflict_group_label: group.label,
      conflict_group_size: group.groupSize,
      resolved_as_group: true,
      group_resolution_key: group.groupKey,
      group_resolution_applied: true,
      group_resolution_timestamp: timestamp,
      group_resolution_mode: "not_found_db"
      };
      return applyNoDbReferenceForDataset(missingItem, activeConfig.type);
    }) }));
  }

  function resolveIndividually(itemId) {
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => item.id === itemId ? {
      ...item,
      group_individual_resolution: true,
      resolved_as_group: false
    } : item) }));
  }

  function updateMissingReference(itemId, reference, notes, mode = "manual") {
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => item.id === itemId ? {
      ...item,
      reference,
      notes,
      consumo_origen: reference ? "tra050_reference" : "",
      consumo_referencia_tra050: reference?.consumo || reference?.consumo_kwh_100km || "",
      unidad_consumo: reference?.unidad || (reference?.consumo_kwh_100km ? "kWh/100km" : ""),
      tipologia_referencia_tra050: reference?.tipologia || "",
      combustible_referencia_tra050: reference?.combustible || "",
      tra050_reference_auto_selected: mode === "notes" ? Boolean(item.tra050_reference_auto_selected) : false,
      tra050_reference_manual_selected: mode === "notes" ? Boolean(item.tra050_reference_manual_selected) : Boolean(reference),
      tra050_reference_confidence: mode === "notes" ? item.tra050_reference_confidence || "" : (reference ? "manual" : item.tra050_reference_confidence || ""),
      tra050_reference_reason: mode === "notes" ? item.tra050_reference_reason || "" : (reference ? "Referencia TRA050 seleccionada manualmente." : item.tra050_reference_reason || ""),
      observacion_consumo_referencia: reference ? (notes || item.observacion_consumo_referencia || "Referencia TRA050 seleccionada manualmente por revision del usuario.") : item.observacion_consumo_referencia || ""
    } : item) }));
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
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => similar.some((entry) => entry.id === item.id) ? {
      ...item,
      assigned: source.assigned,
      match_estado: MATCH_STATES.exacto,
      match_score: source.match_score,
      match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
      explicacion_match: `Match aplicado masivamente desde ${source.input.Matricula_Nuevo}.`,
      match_manual: true
    } : item) }));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    setDatasets(createDatasets());
    setPairing(EMPTY_PAIRING);
    setSelected(null);
    setToast("Sesion local limpiada.");
  }

  async function handleImportLearning(file) {
    try {
      setLearningRules(await importLearningRules(file));
      setToast("Reglas aprendidas importadas.");
    } catch (error) {
      setToast(error.message || "No se pudieron importar las reglas aprendidas.");
    }
  }

  function handleClearLearning() {
    setLearningRules(clearLearningRules());
    setToast("Reglas aprendidas limpiadas.");
  }

  const currentStep = items.length ? (items.some((item) => [MATCH_STATES.conflicto, MATCH_STATES.probable].includes(item.match_estado)) ? 3 : 4) : validation ? 1 : 0;
  const selectedFresh = selected ? items.find((item) => item.id === selected.id) : null;
  const canPair = (datasets.soldThermal?.matchResults || []).length > 0 && (datasets.purchasedElectric?.matchResults || []).length > 0;

  function generatePairing() {
    if (pairing.pairs?.length) {
      const ok = window.confirm("Ya hay un emparejamiento generado. Se mantendran las parejas bloqueadas y se recalculara el resto. ¿Continuar?");
      if (!ok) return;
    }
    setProcessing({ stage: "Preparando vehículos elegibles", processed: 0, total: 100, percent: 5 });
    setTimeout(() => {
      const pairingOptions = { annualMileageKm: pairing.annualMileageKm };
      const prepared = prepareVehiclesForPairing(datasets.soldThermal.matchResults || [], datasets.purchasedElectric.matchResults || [], pairingOptions);
      if (!prepared.eligibleSold.length) {
        setProcessing(null);
        setToast("No hay vehiculos vendidos elegibles. Revisa el diagnostico: puede faltar fecha de venta, categoria o consumo TRA050/IDAE.");
        setPairing((current) => ({ ...current, warnings: prepared.warnings, summary: {
          ...(current.summary || {}),
          soldLoaded: prepared.debug.soldProcessed,
          purchasedLoaded: prepared.debug.purchasedProcessed,
          eligibleSold: 0,
          eligiblePurchased: prepared.debug.purchasedEligible,
          ineligibleSold: prepared.debug.soldIneligible,
          ineligiblePurchased: prepared.debug.purchasedIneligible
        } }));
        return;
      }
      if (!prepared.eligiblePurchased.length) {
        setProcessing(null);
        setToast("No hay vehiculos electricos elegibles. Revisa si se extrajo el consumo electrico o si falta consumo de referencia.");
        setPairing((current) => ({ ...current, warnings: prepared.warnings, summary: {
          ...(current.summary || {}),
          soldLoaded: prepared.debug.soldProcessed,
          purchasedLoaded: prepared.debug.purchasedProcessed,
          eligibleSold: prepared.debug.soldEligible,
          eligiblePurchased: 0,
          ineligibleSold: prepared.debug.soldIneligible,
          ineligiblePurchased: prepared.debug.purchasedIneligible
        } }));
        return;
      }
      setProcessing({ stage: "Generando candidatos por categoría", processed: 25, total: 100, percent: 25 });
      const candidates = buildPairingCandidates(prepared.eligibleSold, prepared.eligiblePurchased, pairingOptions);
      setProcessing({ stage: "Optimizando emparejamiento", processed: 65, total: 100, percent: 65 });
      const lockedPairs = (pairing.pairs || []).filter((pair) => pair.pair_locked);
      const pairs = autoPairVehicles(candidates, { lockedPairs });
      const evaluatedCandidates = candidates.evaluatedCandidates || [];
      const usedSold = new Set(pairs.map((pair) => pair.sold_row_id));
      const usedPurchased = new Set(pairs.map((pair) => pair.purchased_row_id));
      const unpairedSold = prepared.eligibleSold.filter((item) => !usedSold.has(item.id)).map((item) => ({ ...item, pair_status: "unpaired_sold", ...unpairedReasonFor(item, "sold", evaluatedCandidates, pairs) }));
      const unpairedPurchased = prepared.eligiblePurchased.filter((item) => !usedPurchased.has(item.id)).map((item) => ({ ...item, pair_status: "unpaired_purchased", ...unpairedReasonFor(item, "purchased", evaluatedCandidates, pairs) }));
      const integrity = validatePairingIntegrity(pairs);
      const nextDatasets = applyPairsToDatasets(datasets, pairs);
      const pairingDiagnostics = { ...(pairs.diagnostics || candidates.diagnostics || {}), selectedPairs: pairs.length };
      const summary = {
        eligibleSold: prepared.eligibleSold.length,
        eligiblePurchased: prepared.eligiblePurchased.length,
        ineligibleSold: prepared.ineligibleSold.length,
        ineligiblePurchased: prepared.ineligiblePurchased.length,
        soldLoaded: prepared.debug.soldProcessed,
        purchasedLoaded: prepared.debug.purchasedProcessed,
        pairs: pairs.length,
        unpairedSold: unpairedSold.length,
        unpairedPurchased: unpairedPurchased.length,
        totalSavings: pairs.reduce((sum, pair) => sum + (pair.ahorro_kwh_anio || 0), 0),
        totalSavings100km: pairs.reduce((sum, pair) => sum + (pair.ahorro_kwh_100km || 0), 0),
        warningPairs: pairs.filter((pair) => pair.warnings?.length).length
      };
      setDatasets(nextDatasets);
      setPairing((current) => ({ ...current, pairs, candidates, evaluatedCandidates, unpairedSold, unpairedPurchased, warnings: prepared.warnings, summary, integrity, pairingDiagnostics, updatedAt: new Date().toISOString() }));
      setProcessing(null);
    }, 0);
  }

  function togglePairLock(pairId) {
    setPairing((current) => {
      const pairs = current.pairs.map((pair) => pair.match_pair_id === pairId ? { ...pair, pair_locked: !pair.pair_locked, pair_status: !pair.pair_locked ? "locked" : "auto_paired" } : pair);
      setDatasets((currentDatasets) => applyPairsToDatasets(currentDatasets, pairs));
      return { ...current, pairs, integrity: validatePairingIntegrity(pairs) };
    });
  }

  function undoPair(pairId) {
    const remaining = pairing.pairs.filter((pair) => pair.match_pair_id !== pairId);
    setPairing((current) => ({ ...current, pairs: remaining, integrity: validatePairingIntegrity(remaining), summary: { ...current.summary, pairs: remaining.length, totalSavings: remaining.reduce((sum, pair) => sum + (pair.ahorro_kwh_anio || 0), 0), totalSavings100km: remaining.reduce((sum, pair) => sum + (pair.ahorro_kwh_100km || 0), 0) } }));
    setDatasets(applyPairsToDatasets(datasets, remaining));
  }

  return (
    <main>
      <AppHeader dbCount={index.length} onClear={clearSession} />
      <nav className="workspace-tabs" aria-label="Espacios de trabajo">
        {Object.values(DATASET_CONFIG).map((config) => (
          <button key={config.key} className={activeDatasetKey === config.key ? "active" : "ghost"} onClick={() => { setActiveDatasetKey(config.key); setSelected(null); }}>
            {config.shortLabel}
          </button>
        ))}
        <button className={activeDatasetKey === "pairing" ? "active" : "ghost"} onClick={() => setActiveDatasetKey("pairing")}>Emparejamiento TRA050</button>
      </nav>
      {activeDatasetKey === "pairing" ? (
        <>
          <ProcessingOverlay processing={processing} onCancel={() => { cancelRef.current.cancelled = true; }} />
          {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
          <PairingWorkspace
            canPair={canPair}
            datasets={datasets}
            pairing={pairing}
            onAnnualMileageChange={(value) => setPairing((current) => ({ ...current, annualMileageKm: value }))}
            onGenerate={generatePairing}
            onToggleLock={togglePairLock}
            onUndoPair={undoPair}
            onExportFinal={() => exportFinalTra050Excel({ pairs: pairing.pairs, datasets, warnings: pairing.warnings, unpairedSold: pairing.unpairedSold, unpairedPurchased: pairing.unpairedPurchased })}
          />
        </>
      ) : (
      <>
      <section className="dataset-overview">
        {Object.entries(DATASET_CONFIG).map(([key, config]) => {
          const data = datasets[key]?.matchResults || [];
          return (
            <article className={`dataset-status-card ${activeDatasetKey === key ? "active" : ""}`} key={key} onClick={() => { setActiveDatasetKey(key); setSelected(null); }}>
              <span>{config.shortLabel}</span>
              <strong>{data.length}</strong>
              <p>Exactos: {data.filter((item) => item.match_estado === MATCH_STATES.exacto).length} · Conflictos: {data.filter((item) => item.match_estado === MATCH_STATES.conflicto).length} · Sin match: {data.filter((item) => item.match_estado === MATCH_STATES.sinMatch).length} · No DB: {data.filter((item) => item.match_estado === MATCH_STATES.noEncontrado).length}</p>
            </article>
          );
        })}
      </section>
      <section className="panel dataset-hero">
        <div>
          <p className="eyebrow">{activeConfig.type}</p>
          <h2>{activeConfig.label}</h2>
          <p className="muted">{activeConfig.help}</p>
        </div>
      </section>
      <Stepper current={currentStep} />
      <ProcessingOverlay processing={processing} onCancel={() => { cancelRef.current.cancelled = true; }} />
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
      <div className="load-grid">
        <UploadPanel datasetKey={activeDatasetKey} title={activeDatasetKey === "soldThermal" ? "Cargar vehículos vendidos" : "Cargar vehículos comprados eléctricos"} help={activeConfig.help} onRows={handleRows} onError={setToast} />
        <PastePanel title={activeDatasetKey === "soldThermal" ? "Pegar vehículos vendidos" : "Pegar vehículos eléctricos"} onRows={handleRows} onError={setToast} />
      </div>
      <ValidationSummary validation={validation} />
      <MatchSummaryCards items={items} alerts={validation?.alerts || []} />
      <VehiclesTable items={items} datasetType={activeConfig.type} resetKey={`${activeDatasetKey}:${activeDataset.tableVersion || 0}`} onSelect={setSelected} onMarkMissing={markMissing} />
      <ConflictResolver groups={conflictGroups} index={index} onAssign={assignCandidate} onAssignGroup={assignCandidateToGroup} onApplySimilar={applySimilar} onMarkMissing={markMissing} onMarkGroupMissing={markGroupMissing} onResolveIndividually={resolveIndividually} onSelect={setSelected} />
      <MissingReferencePanel items={items} onUpdate={updateMissingReference} />
      <ManualDbSearch index={index} selectedItem={selectedFresh} onAssign={assignCandidate} />
      <ExportPanel items={items} datasets={datasets} activeDatasetKey={activeDatasetKey} learningRules={learningRules} learningCount={learningRules.length} pairing={pairing} onExportLearning={exportLearningRules} onImportLearning={handleImportLearning} onClearLearning={handleClearLearning} />
      <VehicleDetailModal item={selectedFresh} onClose={() => setSelected(null)} />
      </>
      )}
    </main>
  );
}
