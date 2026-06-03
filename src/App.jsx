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
import LargeProjectProgressOverlay from "./components/LargeProjectProgressOverlay.jsx";
import RecoverySessionBanner from "./components/RecoverySessionBanner.jsx";
import LargeProjectDecisionDialog from "./components/LargeProjectDecisionDialog.jsx";
import PairingWorkspace from "./components/PairingWorkspace.jsx";
import NoDbJustificationModal from "./components/NoDbJustificationModal.jsx";
import FinalReviewWorkspace from "./components/FinalReviewWorkspace.jsx";
import { VEHICLE_DB } from "./data/vehicle-db.js";
import { TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "./data/tra050-reference.js";
import { buildSearchIndex, matchRowsInChunks, matchVehicleWithCache, MATCH_MEANINGS, MATCH_STATES } from "./utils/matchEngine.js";
import { normalizeText } from "./utils/normalize.js";
import { groupConflictResults } from "./utils/groupConflicts.js";
import { clearLearningRules, exportLearningRules, importLearningRules, loadLearningRules, replaceLearningRules, saveLearningRule } from "./engine/vehicleLearning.js";
import { createEmptyDataset, DATASET_CONFIG, validateDatasetRows } from "./utils/datasets.js";
import { applyPairsToDatasets, autoPairVehicles, buildPairingCandidates, prepareVehiclesForPairing, validatePairingIntegrity } from "./tra050/tra050Pairing.js";
import { exportFinalTra050Excel } from "./tra050/tra050PairExport.js";
import { applyTra050ReferenceResolution } from "./tra050/tra050ReferenceResolver.js";
import { LARGE_PROJECT_VEHICLE_THRESHOLD, hydrateProjectSession, loadProjectSession, saveProjectSession, vehicleCount } from "./utils/projectSession.js";
import { buildVehicleTechnicalComparison, compareTechnicalSpecs } from "./utils/technicalSpecs.js";
import { deleteLargeProject, listRecoverableProjects, markProjectError } from "./storage/indexedDbProjectStore.js";
import {
  chunkSizeForTotalRows,
  completeAutosaveProject,
  exportLargeProjectSessionFromIndexedDb,
  hydrateLargeProjectDataset,
  hydrateLargeProjectSourceRows,
  saveProcessedVehicleChunk,
  saveSourceRowsChunk,
  shouldUseLargeProjectMode,
  startLargeProjectAutosave,
  updateAutosaveProgress
} from "./storage/largeProjectAutosave.js";

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
      review_status: item.review_status || "pending_review",
      review_notes: item.review_notes || "",
      reviewed_at: item.reviewed_at || null,
      reviewed_by: item.reviewed_by || null,
      review_locked: Boolean(item.review_locked),
      expected_powertrain: config.expectedPowertrain,
      dataset_warning: warnings.join(" "),
      conflictos_detectados: [item.conflictos_detectados, ...warnings].filter(Boolean).join(" ")
    };
  });
}

function withPendingPairReview(pair) {
  return {
    ...pair,
    pair_review_status: pair.pair_review_status || "pending_review",
    pair_review_notes: pair.pair_review_notes || "",
    pair_reviewed_at: pair.pair_reviewed_at || null,
    pair_review_locked: Boolean(pair.pair_review_locked)
  };
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
    emisionesWltpGco2Km: candidate.emisionesWltpGco2Km,
    segmento: candidate.segmento,
    consumoElectricoKwh100: candidate.consumoElectricoKwh100,
    consumoLitros100: candidate.consumoLitros100,
    source_url: candidate.source_url,
    score: candidate.score,
    explicacion: candidate.explicacion,
    matchedFeatures: candidate.matchedFeatures,
    penalties: candidate.penalties,
    technicalComparison: candidate.technicalComparison,
    technical_comparison: candidate.technical_comparison
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
  const [largeProjectProgress, setLargeProjectProgress] = useState(null);
  const [recoverableProject, setRecoverableProject] = useState(null);
  const [largeProjectDecision, setLargeProjectDecision] = useState(null);
  const [learningRules, setLearningRules] = useState(() => loadLearningRules());
  const [pendingNoDb, setPendingNoDb] = useState(null);
  const [reviewChangeLog, setReviewChangeLog] = useState([]);
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState(null);
  const [lastExportedAt, setLastExportedAt] = useState(null);
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
    let cancelled = false;
    listRecoverableProjects()
      .then((projects) => {
        if (!cancelled && projects[0]) setRecoverableProject(projects[0]);
      })
      .catch((error) => console.warn("No se pudo revisar proyectos grandes recuperables.", error));
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
      if (saved?.largeProject) {
        setToast("Sesion local grande detectada: se conservaron solo metadatos para evitar bloqueos. Carga el JSON exportado para recuperar el proyecto completo.");
      } else if (saved?.datasets) {
        setDatasets(resolveNoDbReferencesInDatasets(saved.datasets));
        if (saved.pairing) setPairing(saved.pairing);
        if (Array.isArray(saved.reviewChangeLog)) setReviewChangeLog(saved.reviewChangeLog);
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
      const editedAt = new Date().toISOString();
      const totalVehicles = vehicleCount(datasets);
      if (totalVehicles >= LARGE_PROJECT_VEHICLE_THRESHOLD) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          largeProject: true,
          vehicleCount: totalVehicles,
          soldThermalCount: datasets.soldThermal?.matchResults?.length || 0,
          purchasedElectricCount: datasets.purchasedElectric?.matchResults?.length || 0,
          pairCount: pairing.pairs?.length || 0,
          reviewChangeCount: reviewChangeLog.length,
          editedAt,
          note: "Proyecto grande no guardado completo en localStorage para evitar bloqueos del navegador. Usa Guardar sesion JSON."
        }));
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ datasets: makePersistableDatasets(datasets), pairing, reviewChangeLog, editedAt }));
      }
      setLastLocalSavedAt(editedAt);
    } catch (error) {
      console.warn("No se pudo persistir la sesión local completa.", error);
    }
  }, [datasets, pairing, reviewChangeLog]);

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

  function addReviewLog(entry) {
    setReviewChangeLog((current) => {
      const id = `CHANGE-${String(current.length + 1).padStart(6, "0")}`;
      return [{
        id,
        created_at: new Date().toISOString(),
        scope: "vehicle",
        action: "",
        dataset_type: null,
        row_ids: [],
        match_pair_ids: [],
        previous_value: {},
        new_value: {},
        reason: "",
        user_note: "",
        ...entry
      }, ...current];
    });
  }

  function updateVehicleById(itemId, updater, datasetKeyOverride = null) {
    setDatasets((current) => {
      const key = datasetKeyOverride || Object.keys(current).find((datasetKey) => (current[datasetKey]?.matchResults || []).some((item) => item.id === itemId));
      if (!key) return current;
      return {
        ...current,
        [key]: {
          ...current[key],
          matchResults: (current[key].matchResults || []).map((item) => item.id === itemId ? updater(item) : item)
        }
      };
    });
  }

  function askLargeProjectDecision({ totalRows, fileMeta }) {
    return new Promise((resolve) => {
      setLargeProjectDecision({ totalRows, fileMeta, resolve });
    });
  }

  function resolveLargeProjectDecision(choice) {
    if (largeProjectDecision?.resolve) largeProjectDecision.resolve(choice);
    setLargeProjectDecision(null);
  }

  function markChangedAfterReview(item) {
    return {
      ...item,
      review_status: item.review_status === "reviewed" ? "changed_after_review" : item.review_status || "pending_review",
      last_review_action: "changed_after_review"
    };
  }

  async function processRowsWithLargeAutosave(rows, validationResult, tableVersion, fileMeta = {}) {
    const totalRows = validationResult.rows.length;
    const chunkSize = chunkSizeForTotalRows(totalRows);
    const totalChunks = Math.ceil(totalRows / chunkSize);
    const project = await startLargeProjectAutosave({
      datasetType: activeConfig.type,
      totalRows,
      chunkSize,
      fileName: fileMeta.fileName || ""
    });
    const matched = [];
    const startedAt = performance.now();
    try {
      for (let start = 0; start < totalRows; start += chunkSize) {
        const sourceRows = validationResult.rows.slice(start, start + chunkSize);
        await saveSourceRowsChunk({
          projectId: project.project_id,
          datasetType: activeConfig.type,
          chunkIndex: Math.floor(start / chunkSize),
          startRow: start,
          rows: sourceRows
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (let start = 0; start < totalRows; start += chunkSize) {
        if (cancelRef.current.cancelled) throw new DOMException("Procesamiento cancelado por el usuario.", "AbortError");
        const chunkRows = validationResult.rows.slice(start, start + chunkSize).map((row) => ({ ...row, expected_powertrain: activeConfig.expectedPowertrain }));
        const chunkIndex = Math.floor(start / chunkSize);
        const chunkMatched = chunkRows.map((row, offset) => matchVehicleWithCache(row, start + offset, index, learningRules));
        const enriched = resolveNoDbReferencesInDataset({ matchResults: addDatasetWarnings(chunkMatched, activeConfig) }).matchResults;
        await saveProcessedVehicleChunk({
          projectId: project.project_id,
          datasetType: activeConfig.type,
          chunkIndex,
          startRow: start,
          records: enriched
        });
        matched.push(...enriched);
        const processedRows = Math.min(start + chunkRows.length, totalRows);
        const percent = Math.round((processedRows / totalRows) * 100);
        const lastSavedAt = new Date().toISOString();
        const elapsed = performance.now() - startedAt;
        const rowsPerMs = processedRows / Math.max(elapsed, 1);
        const remainingMs = (totalRows - processedRows) / Math.max(rowsPerMs, 0.001);
        const eta = processedRows < totalRows ? `${Math.max(1, Math.round(remainingMs / 1000))} s restantes aprox.` : "";
        const progress = {
          projectId: project.project_id,
          stage: "Procesando matching y guardando avance",
          processedRows,
          totalRows,
          percent,
          savedChunks: chunkIndex + 1,
          totalChunks,
          lastSavedAt,
          eta
        };
        setLargeProjectProgress(progress);
        await updateAutosaveProgress(project.project_id, {
          processed_rows: processedRows,
          last_progress: progress,
          last_chunk_index: chunkIndex
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await completeAutosaveProject(project.project_id, { dataset_key: activeDatasetKey });
    } catch (error) {
      await markProjectError(project.project_id, { stage: "Procesando matching y guardando avance", message: error.message });
      throw error;
    }
    updateActiveDataset((dataset) => ({
      ...dataset,
      rawRows: [],
      normalizedRows: validationResult.rows,
      validation: validationResult,
      matchResults: matched,
      conflictGroups: groupConflictResults(matched),
      exportReady: true,
      tableVersion,
      largeProject: {
        project_id: project.project_id,
        indexeddb_enabled: true,
        total_rows: totalRows,
        chunk_size: chunkSize
      }
    }));
    setRecoverableProject(null);
    return { project, matched };
  }

  async function handleRows(rows, fileMeta = {}) {
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
      const largeProjectDetected = shouldUseLargeProjectMode({ totalRows: result.rows.length, fileSize: fileMeta.fileSize || 0 });
      if (largeProjectDetected) {
        setProcessing(null);
        const choice = await askLargeProjectDecision({ totalRows: result.rows.length, fileMeta });
        if (choice === "progressive") {
          setLargeProjectProgress({
            stage: "Preparando guardado progresivo",
            processedRows: 0,
            totalRows: result.rows.length,
            percent: 0,
            savedChunks: 0,
            totalChunks: Math.ceil(result.rows.length / chunkSizeForTotalRows(result.rows.length)),
            lastSavedAt: null
          });
          const { project } = await processRowsWithLargeAutosave(rows, result, tableVersion, fileMeta);
          setToast(`Procesamiento completado y guardado localmente. Ya puedes exportar la sesion JSON optimizada. Proyecto ${project.project_id}.`);
          return;
        }
        if (choice !== "normal") return;
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
      if (largeProjectProgress?.projectId) {
        await markProjectError(largeProjectProgress.projectId, { stage: largeProjectProgress.stage, message: error.message });
      }
      if (error?.name === "AbortError") {
        setToast("Procesamiento cancelado. Los chunks ya guardados siguen disponibles para recuperacion.");
        return;
      }
      setToast(error.message || "No se pudo completar el analisis. Revisa el archivo o intenta procesar menos filas.");
    } finally {
      setProcessing(null);
      setLargeProjectProgress(null);
    }
  }

  async function handleContinueRecoverableProject() {
    if (!recoverableProject) return;
    try {
      setProcessing({ stage: "Recuperando proyecto grande", processed: 0, total: recoverableProject.total_rows || 1, percent: 5 });
      const records = await hydrateLargeProjectDataset(recoverableProject.project_id, recoverableProject.dataset_type);
      const sourceRows = await hydrateLargeProjectSourceRows(recoverableProject.project_id, recoverableProject.dataset_type);
      const datasetKey = recoverableProject.dataset_type === "purchased_electric" ? "purchasedElectric" : "soldThermal";
      const config = DATASET_CONFIG[datasetKey];
      if (sourceRows.length > records.length && !cancelRef.current.cancelled) {
        const ok = window.confirm(`Se recuperaron ${records.length.toLocaleString("es-ES")} vehiculos ya guardados y quedan filas pendientes. ¿Quieres continuar el matching desde el ultimo chunk correcto?`);
        if (ok) {
          cancelRef.current = { cancelled: false };
          const chunkSize = recoverableProject.chunk_size || chunkSizeForTotalRows(sourceRows.length);
          const totalChunks = Math.ceil(sourceRows.length / chunkSize);
          const matched = [...records];
          for (let start = records.length; start < sourceRows.length; start += chunkSize) {
            if (cancelRef.current.cancelled) throw new DOMException("Procesamiento cancelado por el usuario.", "AbortError");
            const chunkRows = sourceRows.slice(start, start + chunkSize).map((row) => ({ ...row, expected_powertrain: config.expectedPowertrain }));
            const chunkIndex = Math.floor(start / chunkSize);
            const chunkMatched = chunkRows.map((row, offset) => matchVehicleWithCache(row, start + offset, index, learningRules));
            const enriched = resolveNoDbReferencesInDataset({ matchResults: addDatasetWarnings(chunkMatched, config) }).matchResults;
            await saveProcessedVehicleChunk({
              projectId: recoverableProject.project_id,
              datasetType: recoverableProject.dataset_type,
              chunkIndex,
              startRow: start,
              records: enriched
            });
            matched.push(...enriched);
            const processedRows = Math.min(start + chunkRows.length, sourceRows.length);
            const progress = {
              projectId: recoverableProject.project_id,
              stage: "Continuando matching y guardando avance",
              processedRows,
              totalRows: sourceRows.length,
              percent: Math.round((processedRows / sourceRows.length) * 100),
              savedChunks: chunkIndex + 1,
              totalChunks,
              lastSavedAt: new Date().toISOString()
            };
            setLargeProjectProgress(progress);
            await updateAutosaveProgress(recoverableProject.project_id, {
              processed_rows: processedRows,
              last_progress: progress,
              last_chunk_index: chunkIndex
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          await completeAutosaveProject(recoverableProject.project_id, { dataset_key: datasetKey });
          const resumedSession = {
            app: "TRA050 MatchLab",
            schema_version: "1.0.0",
            soldThermal: recoverableProject.dataset_type === "sold_thermal" ? { records: matched } : { records: [] },
            purchasedElectric: recoverableProject.dataset_type === "purchased_electric" ? { records: matched } : { records: [] },
            pairing: {},
            review_change_log: [],
            idaeSelectionIndex: {},
            settings: { activeTab: datasetKey }
          };
          const resumed = hydrateProjectSession(resumedSession);
          setDatasets(resolveNoDbReferencesInDatasets(resumed.datasets));
          setPairing(EMPTY_PAIRING);
          setSelected(null);
          setActiveDatasetKey(datasetKey);
          setRecoverableProject(null);
          setToast(`Proyecto grande continuado: ${matched.length.toLocaleString("es-ES")} vehiculos procesados y guardados.`);
          return;
        }
      }
      const session = {
        app: "TRA050 MatchLab",
        schema_version: "1.0.0",
        soldThermal: recoverableProject.dataset_type === "sold_thermal" ? { records } : { records: [] },
        purchasedElectric: recoverableProject.dataset_type === "purchased_electric" ? { records } : { records: [] },
        pairing: {},
        review_change_log: [],
        idaeSelectionIndex: {},
        settings: { activeTab: datasetKey }
      };
      const hydrated = hydrateProjectSession(session);
      setDatasets(resolveNoDbReferencesInDatasets(hydrated.datasets));
      setPairing(EMPTY_PAIRING);
      setSelected(null);
      setActiveDatasetKey(hydrated.settings.activeTab);
      setRecoverableProject(null);
      setToast(`Proyecto grande recuperado: ${records.length.toLocaleString("es-ES")} vehiculos restaurados desde IndexedDB.`);
    } catch (error) {
      setToast(error.message || "No se pudo recuperar el proyecto grande.");
    } finally {
      setProcessing(null);
      setLargeProjectProgress(null);
    }
  }

  async function handleExportRecoverableProject() {
    if (!recoverableProject) return;
    try {
      const result = await exportLargeProjectSessionFromIndexedDb(recoverableProject.project_id, { project: recoverableProject });
      setToast(result.warning || "Avance exportado en formato TRA050 Large Session JSONL.");
    } catch (error) {
      setToast(error.message || "No se pudo exportar el avance guardado.");
    }
  }

  async function handleDiscardRecoverableProject() {
    if (!recoverableProject) return;
    const ok = window.confirm("Se borrara el avance guardado en IndexedDB para este proyecto grande. ¿Quieres continuar?");
    if (!ok) return;
    try {
      await deleteLargeProject(recoverableProject.project_id);
      setRecoverableProject(null);
      setToast("Avance guardado descartado.");
    } catch (error) {
      setToast(error.message || "No se pudo descartar el proyecto grande.");
    }
  }

  function assignCandidate(itemId, candidateId, manual = false, candidateOverride = null, selectionSource = "") {
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
      const technical_comparison = buildVehicleTechnicalComparison(item, candidate);
      const technicalComparison = compareTechnicalSpecs(item.userFeatures || {}, candidate);
      return markChangedAfterReview({
        ...item,
        assigned: candidate,
        technical_comparison,
        technicalComparison,
        match_estado: manual ? MATCH_STATES.exacto : item.match_estado,
        match_score: candidate.score || item.match_score || 100,
        match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
        explicacion_match: manual ? `Asignacion manual a ${candidate.modeloOriginal}.` : item.explicacion_match,
        match_manual: manual,
        selection_source: selectionSource || (manual ? "manual-selection" : item.selection_source || ""),
        comparison_matrix_used: selectionSource === "candidate_comparison_matrix" || Boolean(item.comparison_matrix_used),
        comparison_candidate_ids: selectionSource === "candidate_comparison_matrix" ? (sourceItem?.candidates || []).slice(0, 5).map((candidate) => candidate.id_idae) : item.comparison_candidate_ids,
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
      });
    }) }));
  }

  function assignCandidateToGroup(group, candidateId, mode = "manual-selection", candidateOverride = null) {
    if (group.groupSize > 1) {
      const ok = window.confirm(`Vas a aplicar el candidato IDAE ${candidateId} a ${group.groupSize} vehiculos de este grupo.\n\nQuieres continuar?`);
      if (!ok) return;
    }
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    items.filter((item) => ids.has(item.id)).forEach((item) => {
      const candidate = candidateOverride || item.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
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
      const candidate = candidateOverride || item.candidates.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
      if (!candidate) return item;
      const technical_comparison = buildVehicleTechnicalComparison(item, candidate);
      const technicalComparison = compareTechnicalSpecs(item.userFeatures || {}, candidate);
      return markChangedAfterReview({
        ...item,
        assigned: candidate,
        id_idae_asignado: candidate.id_idae,
        modelo_idae_asignado: candidate.modelo_tabla || candidate.raw?.modelo_tabla || candidate.titulo_modal || candidate.modeloOriginal || "",
        source_url_idae: candidate.source_url || candidate.raw?.source_url || "",
        technical_comparison,
        technicalComparison,
        match_estado: MATCH_STATES.exacto,
        match_score: candidate.score || item.match_score || 100,
        match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
        explicacion_match: mode === "global-search"
          ? `Asignado manualmente por el usuario desde busqueda global en DB IDAE: ${candidate.modeloOriginal}.`
          : `Resolucion de grupo aplicada a ${group.groupSize} vehiculos: ${candidate.modeloOriginal}.`,
        match_manual: true,
        selection_source: mode,
        comparison_matrix_used: mode === "candidate_comparison_matrix" || Boolean(item.comparison_matrix_used),
        comparison_candidate_ids: mode === "candidate_comparison_matrix" ? group.candidateOptions.slice(0, 5).map((candidate) => candidate.id_idae) : item.comparison_candidate_ids,
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
        group_status: "resolved",
        resolved_vehicle_count: group.groupSize,
        total_vehicle_count: group.groupSize,
        group_vehicle_count: group.groupSize,
        group_resolved_count: group.groupSize,
        resolved_as_group: true,
        group_resolution_key: group.groupKey,
        group_resolution_applied: true,
        group_resolution_timestamp: timestamp,
        group_resolution_mode: mode
      });
    }) }));
  }

  function openNoDbJustification(itemId) {
    const item = items.find((entry) => entry.id === itemId);
    if (item) setPendingNoDb({ scope: "individual", items: [item] });
  }

  function markMissing(itemId, justification) {
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
      no_db_justification: justification,
      no_db_reason_text: justification?.reason_text || "",
      no_db_technical_basis: justification?.technical_basis || null,
      compared_candidates: justification?.compared_candidates || [],
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

  function openGroupNoDbJustification(group) {
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    const groupItems = items.filter((item) => ids.has(item.id));
    setPendingNoDb({ scope: "group", group, items: groupItems });
  }

  function markGroupMissing(group, justification) {
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
      no_db_justification: justification,
      no_db_reason_text: justification?.reason_text || "",
      no_db_technical_basis: justification?.technical_basis || null,
      compared_candidates: justification?.compared_candidates || [],
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
      group_status: "marked_no_db",
      resolved_vehicle_count: group.groupSize,
      total_vehicle_count: group.groupSize,
      group_vehicle_count: group.groupSize,
      group_resolved_count: group.groupSize,
      resolved_as_group: true,
      group_resolution_key: group.groupKey,
      group_resolution_applied: true,
      group_resolution_timestamp: timestamp,
      group_resolution_mode: "not_found_db"
      };
      return applyNoDbReferenceForDataset(missingItem, activeConfig.type);
    }) }));
  }

  function confirmNoDbJustification(justification) {
    if (!pendingNoDb) return;
    if (pendingNoDb.scope === "group") {
      markGroupMissing(pendingNoDb.group, justification);
      addReviewLog({ scope: "group", action: "mark_no_db", row_ids: pendingNoDb.items.map((item) => item.id), new_value: justification });
    } else {
      markMissing(pendingNoDb.items[0].id, justification);
      addReviewLog({ scope: "vehicle", action: "mark_no_db", dataset_type: pendingNoDb.items[0].dataset_type, row_ids: [pendingNoDb.items[0].id], new_value: justification });
    }
    setPendingNoDb(null);
  }

  function markVehicleReviewed(item) {
    const note = window.prompt("Nota de revision (opcional):", item.review_notes || "") || "";
    updateVehicleById(item.id, (current) => ({
      ...current,
      review_status: "reviewed",
      review_notes: note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "user",
      last_review_action: "mark_reviewed"
    }));
    addReviewLog({ action: "mark_reviewed", dataset_type: item.dataset_type, row_ids: [item.id], user_note: note });
  }

  function toggleVehicleReviewLock(item, forceLocked = null) {
    const nextLocked = forceLocked ?? !item.review_locked;
    updateVehicleById(item.id, (current) => ({
      ...current,
      review_locked: nextLocked,
      last_review_action: nextLocked ? "lock_reviewed" : "unlock_reviewed"
    }));
    addReviewLog({ action: nextLocked ? "lock_reviewed" : "unlock_reviewed", dataset_type: item.dataset_type, row_ids: [item.id] });
  }

  function markGroupReviewed(itemsToReview) {
    const note = window.prompt("Nota para marcar el grupo como revisado (opcional):", "") || "";
    const ids = new Set(itemsToReview.map((item) => item.id));
    setDatasets((current) => Object.fromEntries(Object.entries(current).map(([key, dataset]) => [key, {
      ...dataset,
      matchResults: (dataset.matchResults || []).map((item) => ids.has(item.id) ? {
        ...item,
        review_status: "reviewed",
        review_notes: note,
        reviewed_at: new Date().toISOString(),
        reviewed_by: "user",
        last_review_action: "mark_group_reviewed"
      } : item)
    }])));
    addReviewLog({ scope: "group", action: "mark_reviewed", row_ids: [...ids], user_note: note });
  }

  function changeCandidateFromReview(item, candidateId, groupChange = false) {
    const candidate = item.candidates?.find((entry) => entry.id_idae === candidateId) || index.find((entry) => entry.id_idae === candidateId);
    if (!candidate) return;
    if (groupChange) {
      const ok = window.confirm("Vas a cambiar el candidato IDAE para todo este grupo. ¿Quieres continuar?");
      if (!ok) return;
    }
    assignCandidate(item.id, candidateId, true, candidate, "review_change_candidate");
    addReviewLog({
      action: "change_candidate",
      dataset_type: item.dataset_type,
      row_ids: [item.id],
      previous_value: { id_idae: item.assigned?.id_idae, modelo: item.assigned?.modeloOriginal },
      new_value: { id_idae: candidate.id_idae, modelo: candidate.modeloOriginal },
      user_note: window.prompt("Motivo del cambio (opcional):", "") || ""
    });
  }

  function revertNoDb(item) {
    const ok = window.confirm("Vas a revertir el estado No DB y quitar la referencia TRA050/manual asociada. ¿Quieres continuar?");
    if (!ok) return;
    updateVehicleById(item.id, (current) => markChangedAfterReview({
      ...current,
      vehiculo_no_encontrado_db: false,
      no_db_justification: null,
      no_db_reason_text: "",
      no_db_technical_basis: null,
      compared_candidates: [],
      reference: null,
      consumo_origen: "",
      consumo_referencia_tra050: "",
      unidad_consumo: "",
      tipologia_referencia_tra050: "",
      combustible_referencia_tra050: "",
      tra050_reference_auto_selected: false,
      tra050_reference_manual_selected: false,
      tra050_reference_reason: "",
      match_estado: current.candidates?.length ? MATCH_STATES.conflicto : MATCH_STATES.sinMatch,
      last_review_action: "revert_no_db"
    }));
    addReviewLog({ action: "revert_no_db", dataset_type: item.dataset_type, row_ids: [item.id], previous_value: { no_db_justification: item.no_db_justification } });
  }

  function undoSelectionFromReview(item) {
    const ok = window.confirm("Vas a deshacer la seleccion de este vehiculo. Si estaba emparejado, tambien se liberara su pareja TRA050. ¿Quieres continuar?");
    if (!ok) return;
    const pairId = item.match_pair_id;
    if (pairId) undoPair(pairId);
    updateVehicleById(item.id, (current) => markChangedAfterReview({
      ...current,
      assigned: null,
      id_idae_asignado: null,
      modelo_idae_asignado: null,
      source_url_idae: null,
      match_estado: current.candidates?.length ? MATCH_STATES.conflicto : MATCH_STATES.sinMatch,
      match_score: 0,
      vehiculo_no_encontrado_db: false,
      reference: null,
      no_db_justification: null,
      no_db_reason_text: "",
      match_pair_id: null,
      pair_status: "not_paired",
      last_review_action: "undo_selection"
    }));
    addReviewLog({ action: "undo_selection", dataset_type: item.dataset_type, row_ids: [item.id], match_pair_ids: pairId ? [pairId] : [], previous_value: { assigned: item.assigned, no_db: item.vehiculo_no_encontrado_db } });
  }

  function markPairReviewed(pair) {
    const note = window.prompt("Nota de revision del par (opcional):", pair.pair_review_notes || "") || "";
    setPairing((current) => ({
      ...current,
      pairs: current.pairs.map((entry) => entry.match_pair_id === pair.match_pair_id ? {
        ...entry,
        pair_review_status: "reviewed",
        pair_review_notes: note,
        pair_reviewed_at: new Date().toISOString()
      } : entry)
    }));
    addReviewLog({ scope: "pair", action: "mark_reviewed", match_pair_ids: [pair.match_pair_id], user_note: note });
  }

  function togglePairReviewLock(pair) {
    const nextLocked = !pair.pair_review_locked;
    setPairing((current) => ({
      ...current,
      pairs: current.pairs.map((entry) => entry.match_pair_id === pair.match_pair_id ? { ...entry, pair_review_locked: nextLocked } : entry)
    }));
    addReviewLog({ scope: "pair", action: nextLocked ? "lock_reviewed" : "unlock_reviewed", match_pair_ids: [pair.match_pair_id] });
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
      technical_comparison: buildVehicleTechnicalComparison(item, source.assigned),
      technicalComparison: compareTechnicalSpecs(item.userFeatures || {}, source.assigned),
      match_estado: MATCH_STATES.exacto,
      match_score: source.match_score,
      match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
      explicacion_match: `Match aplicado masivamente desde ${source.input.Matricula_Nuevo}.`,
      match_manual: true
    } : item) }));
  }

  function clearSession() {
    const ok = window.confirm("Vas a limpiar la sesion local de trabajo. No se borraran las reglas aprendidas, pero se vaciaran vehiculos, emparejamientos y revision actual. ¿Quieres continuar?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    setDatasets(createDatasets());
    setPairing(EMPTY_PAIRING);
    setSelected(null);
    setToast("Sesion local limpiada.");
  }

  function hasProjectData() {
    return Boolean(
      (datasets.soldThermal?.matchResults || []).length
      || (datasets.purchasedElectric?.matchResults || []).length
      || (pairing.pairs || []).length
    );
  }

  async function handleSaveProjectSession() {
    cancelRef.current = { cancelled: false };
    const totalVehicles = vehicleCount(datasets);
    try {
      setProcessing({
        stage: totalVehicles >= LARGE_PROJECT_VEHICLE_THRESHOLD ? "Preparando sesion compacta" : "Preparando sesion",
        processed: 0,
        total: Math.max(totalVehicles, 1),
        percent: 0
      });
      const result = await saveProjectSession({
        datasets,
        pairing,
        learningRules,
        settings: {
          activeTab: activeDatasetKey,
          defaultAnnualMileage: pairing.annualMileageKm || null,
          reviewChangeLog
        }
      }, undefined, {
        signal: cancelRef.current,
        onProgress: setProcessing
      });
      setLastExportedAt(new Date().toISOString());
      const seconds = result.durationMs ? ` en ${(result.durationMs / 1000).toFixed(1)} s` : "";
      const mode = result.optimized ? `Sesion compacta exportada: ${result.vehicleCount.toLocaleString("es-ES")} vehiculos${seconds}.` : "Sesion exportada correctamente.";
      setToast(result.usedPicker ? mode : `${mode} Tu navegador descargara el archivo en la carpeta de descargas configurada.`);
    } catch (error) {
      if (error?.name === "AbortError") {
        setToast("Exportacion cancelada.");
        return;
      }
      setToast(error.message || "No se pudo guardar la sesion del proyecto.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleLoadProjectSessionFile(file) {
    if (hasProjectData()) {
      const ok = window.confirm("Ya hay un proyecto cargado. Si cargas esta sesion, se reemplazaran los datos actuales.\n\nQuieres continuar?");
      if (!ok) return;
    }
    try {
      setProcessing({ stage: "Leyendo sesion JSON", processed: 0, total: 100, percent: 5 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const hydrated = await loadProjectSession(file);
      setProcessing({ stage: "Restaurando proyecto", processed: 80, total: 100, percent: 80 });
      setDatasets(resolveNoDbReferencesInDatasets(hydrated.datasets));
      setPairing({ ...EMPTY_PAIRING, ...hydrated.pairing });
      setReviewChangeLog(hydrated.reviewChangeLog || []);
      if (hydrated.learningRulesIncluded) setLearningRules(replaceLearningRules(hydrated.learningRules));
      setSelected(null);
      const tab = hydrated.settings?.activeTab;
      const tabMap = { sold_thermal: "soldThermal", purchased_electric: "purchasedElectric" };
      const nextTab = tabMap[tab] || tab;
      if (["soldThermal", "purchasedElectric", "pairing", "review"].includes(nextTab)) setActiveDatasetKey(nextTab);
      const soldCount = hydrated.datasets.soldThermal.matchResults.length;
      const purchasedCount = hydrated.datasets.purchasedElectric.matchResults.length;
      const pairCount = hydrated.pairing.pairs.length;
      const unpairedCount = hydrated.pairing.unpairedSold.length + hydrated.pairing.unpairedPurchased.length;
      const warnings = hydrated.warnings.length ? ` ${hydrated.warnings.join(" ")}` : "";
      setToast(`Sesion cargada correctamente: ${soldCount} vehiculos vendidos/termicos, ${purchasedCount} vehiculos comprados/electricos, ${pairCount} parejas generadas, ${unpairedCount} vehiculos no emparejados.${warnings}`);
    } catch (error) {
      setToast(error.message || "El archivo seleccionado no parece ser una sesion valida de TRA050 MatchLab.");
    } finally {
      setProcessing(null);
    }
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
    const ok = window.confirm("Vas a limpiar las reglas aprendidas locales. Esta accion no afecta al proyecto cargado, pero perderas esas ayudas para futuros matching. ¿Quieres continuar?");
    if (!ok) return;
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
      const pairs = autoPairVehicles(candidates, { lockedPairs }).map(withPendingPairReview);
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
      <AppHeader dbCount={index.length} onClear={clearSession} onSaveProjectSession={handleSaveProjectSession} onLoadProjectSession={handleLoadProjectSessionFile} lastLocalSavedAt={lastLocalSavedAt} lastExportedAt={lastExportedAt} />
      <ProcessingOverlay processing={processing} onCancel={() => { cancelRef.current.cancelled = true; }} />
      <LargeProjectProgressOverlay progress={largeProjectProgress} onCancel={() => { cancelRef.current.cancelled = true; }} />
      <LargeProjectDecisionDialog decision={largeProjectDecision} onChoose={resolveLargeProjectDecision} />
      <RecoverySessionBanner project={recoverableProject} onContinue={handleContinueRecoverableProject} onExport={handleExportRecoverableProject} onDiscard={handleDiscardRecoverableProject} />
      <nav className="workspace-tabs" aria-label="Espacios de trabajo">
        {Object.values(DATASET_CONFIG).map((config) => (
          <button key={config.key} className={activeDatasetKey === config.key ? "active" : "ghost"} onClick={() => { setActiveDatasetKey(config.key); setSelected(null); }}>
            {config.shortLabel}
          </button>
        ))}
        <button className={activeDatasetKey === "pairing" ? "active" : "ghost"} onClick={() => setActiveDatasetKey("pairing")}>Emparejamiento TRA050</button>
        <button className={activeDatasetKey === "review" ? "active" : "ghost"} onClick={() => setActiveDatasetKey("review")}>Revision final</button>
      </nav>
      {activeDatasetKey === "review" ? (
        <>
          {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
          {pendingNoDb && (
            <NoDbJustificationModal
              items={pendingNoDb.items}
              scope={pendingNoDb.scope}
              groupLabel={pendingNoDb.group?.label || ""}
              onClose={() => setPendingNoDb(null)}
              onConfirm={confirmNoDbJustification}
            />
          )}
          <FinalReviewWorkspace
            datasets={datasets}
            pairing={pairing}
            reviewChangeLog={reviewChangeLog}
            onSelectVehicle={setSelected}
            onMarkVehicleReviewed={markVehicleReviewed}
            onToggleVehicleLock={toggleVehicleReviewLock}
            onChangeCandidate={changeCandidateFromReview}
            onMarkNoDb={(item) => setPendingNoDb({ scope: "individual", items: [item] })}
            onRevertNoDb={revertNoDb}
            onUndoSelection={undoSelectionFromReview}
            onMarkPairReviewed={markPairReviewed}
            onTogglePairReviewLock={togglePairReviewLock}
            onUndoPair={(pairId) => {
              undoPair(pairId);
              addReviewLog({ scope: "pair", action: "undo_pair", match_pair_ids: [pairId] });
            }}
            onMarkGroupReviewed={markGroupReviewed}
          />
          <VehicleDetailModal item={selectedFresh || selected} onClose={() => setSelected(null)} />
        </>
      ) : activeDatasetKey === "pairing" ? (
        <>
          {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
          <PairingWorkspace
            canPair={canPair}
            datasets={datasets}
            pairing={pairing}
            onAnnualMileageChange={(value) => setPairing((current) => ({ ...current, annualMileageKm: value }))}
            onGenerate={generatePairing}
            onToggleLock={togglePairLock}
            onUndoPair={undoPair}
            onExportFinal={() => exportFinalTra050Excel({ pairs: pairing.pairs, datasets, warnings: pairing.warnings, unpairedSold: pairing.unpairedSold, unpairedPurchased: pairing.unpairedPurchased, reviewChangeLog })}
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
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
      {pendingNoDb && (
        <NoDbJustificationModal
          items={pendingNoDb.items}
          scope={pendingNoDb.scope}
          groupLabel={pendingNoDb.group?.label || ""}
          onClose={() => setPendingNoDb(null)}
          onConfirm={confirmNoDbJustification}
        />
      )}
      <div className="load-grid">
        <UploadPanel datasetKey={activeDatasetKey} title={activeDatasetKey === "soldThermal" ? "Cargar vehículos vendidos" : "Cargar vehículos comprados eléctricos"} help={activeConfig.help} onRows={handleRows} onError={setToast} />
        <PastePanel title={activeDatasetKey === "soldThermal" ? "Pegar vehículos vendidos" : "Pegar vehículos eléctricos"} onRows={handleRows} onError={setToast} />
      </div>
      <ValidationSummary validation={validation} />
      <MatchSummaryCards items={items} alerts={validation?.alerts || []} />
      <VehiclesTable items={items} datasetType={activeConfig.type} resetKey={`${activeDatasetKey}:${activeDataset.tableVersion || 0}`} onSelect={setSelected} onMarkMissing={openNoDbJustification} />
      <ConflictResolver groups={conflictGroups} items={items} index={index} onAssign={assignCandidate} onAssignGroup={assignCandidateToGroup} onApplySimilar={applySimilar} onMarkMissing={openNoDbJustification} onMarkGroupMissing={openGroupNoDbJustification} onResolveIndividually={resolveIndividually} onSelect={setSelected} />
      <MissingReferencePanel items={items} onUpdate={updateMissingReference} />
      <ManualDbSearch index={index} selectedItem={selectedFresh} onAssign={assignCandidate} />
      <ExportPanel items={items} datasets={datasets} activeDatasetKey={activeDatasetKey} learningRules={learningRules} learningCount={learningRules.length} pairing={pairing} onExportLearning={exportLearningRules} onImportLearning={handleImportLearning} onClearLearning={handleClearLearning} onNotify={setToast} />
      <VehicleDetailModal item={selectedFresh} onClose={() => setSelected(null)} />
      </>
      )}
    </main>
  );
}
