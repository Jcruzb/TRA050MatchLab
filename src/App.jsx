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
import { TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO, TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "./data/tra050-reference.js";
import { buildSearchIndex, matchRowsInChunks, MATCH_MEANINGS, MATCH_STATES } from "./utils/matchEngine.js";
import { normalizeText } from "./utils/normalize.js";
import { groupConflictResults } from "./utils/groupConflicts.js";
import { clearLearningRules, exportLearningRules, importLearningRules, loadLearningRules, saveLearningRule } from "./engine/vehicleLearning.js";
import { createEmptyDataset, DATASET_CONFIG, validateDatasetRows } from "./utils/datasets.js";
import { applyPairsToDatasets, autoPairVehicles, buildPairingCandidates, prepareVehiclesForPairing, validatePairingIntegrity } from "./tra050/tra050Pairing.js";
import { exportFinalTra050Excel } from "./tra050/tra050PairExport.js";

const STORAGE_KEY = "tra050-matchlab-session";
const DEFAULT_MISSING_REFERENCE = {
  ...TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0],
  key: "nuevo-M1",
  consumo: TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0].consumo_kwh_100km,
  unidad: "kWh/100km"
};
const EMPTY_PAIRING = { pairs: [], unpairedSold: [], unpairedPurchased: [], candidates: [], warnings: [], summary: {}, integrity: null, updatedAt: null };

function createDatasets() {
  return {
    soldThermal: createEmptyDataset(DATASET_CONFIG.soldThermal),
    purchasedElectric: createEmptyDataset(DATASET_CONFIG.purchasedElectric)
  };
}

function defaultReferenceForDataset(config) {
  if (config.type === "sold_thermal") {
    const item = TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO[0];
    return { ...item, key: `termico-${item.tipologia}-${item.combustible}` };
  }
  const item = TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO[0];
  return { ...item, key: `nuevo-${item.tipologia}`, consumo: item.consumo || item.consumo_kwh_100km, unidad: item.unidad || "kWh/100km" };
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
        setDatasets(saved.datasets);
        if (saved.pairing) setPairing(saved.pairing);
      } else if (saved?.items) {
        setDatasets((current) => ({
          ...current,
          soldThermal: {
            ...current.soldThermal,
            validation: saved.validation,
            matchResults: saved.items,
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
    setProcessing({ stage: "Validando estructura", processed: 0, total: rows.length, percent: 0 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = validateDatasetRows(rows, activeConfig);
      updateActiveDataset((dataset) => ({ ...dataset, rawRows: rows, normalizedRows: result.rows, validation: result, matchResults: [], exportReady: false }));
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
      const matchResults = addDatasetWarnings(matched, activeConfig);
      updateActiveDataset((dataset) => ({ ...dataset, normalizedRows: result.rows, validation: result, matchResults, conflictGroups: groupConflictResults(matchResults), exportReady: true }));
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
        reference: null
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
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => item.id === itemId ? {
      ...item,
      assigned: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      reference: defaultReferenceForDataset(activeConfig),
      consumo_origen: "tra050_reference",
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050."
    } : item) }));
  }

  function markGroupMissing(group) {
    const timestamp = new Date().toISOString();
    const ids = new Set(group.vehicles.map((vehicle) => vehicle.rowId));
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => ids.has(item.id) ? {
      ...item,
      assigned: null,
      match_estado: MATCH_STATES.noEncontrado,
      match_score: 0,
      match_significado: MATCH_MEANINGS[MATCH_STATES.noEncontrado],
      explicacion_match: `Vehiculo no encontrado en DB aplicado al grupo ${group.label}.`,
      vehiculo_no_encontrado_db: true,
      match_manual: true,
      reference: defaultReferenceForDataset(activeConfig),
      consumo_origen: "tra050_reference",
      notes: item.notes || "Pendiente de justificar consumo de referencia TRA050.",
      conflict_group_key: group.groupKey,
      conflict_group_label: group.label,
      conflict_group_size: group.groupSize,
      resolved_as_group: true,
      group_resolution_key: group.groupKey,
      group_resolution_applied: true,
      group_resolution_timestamp: timestamp,
      group_resolution_mode: "not-found"
    } : item) }));
  }

  function resolveIndividually(itemId) {
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => item.id === itemId ? {
      ...item,
      group_individual_resolution: true,
      resolved_as_group: false
    } : item) }));
  }

  function updateMissingReference(itemId, reference, notes) {
    updateActiveDataset((dataset) => ({ ...dataset, matchResults: dataset.matchResults.map((item) => item.id === itemId ? { ...item, reference, notes, consumo_origen: "tra050_reference" } : item) }));
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
      const prepared = prepareVehiclesForPairing(datasets.soldThermal.matchResults || [], datasets.purchasedElectric.matchResults || []);
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
      const candidates = buildPairingCandidates(prepared.eligibleSold, prepared.eligiblePurchased);
      setProcessing({ stage: "Optimizando emparejamiento", processed: 65, total: 100, percent: 65 });
      const lockedPairs = (pairing.pairs || []).filter((pair) => pair.pair_locked);
      const pairs = autoPairVehicles(candidates, { lockedPairs });
      const usedSold = new Set(pairs.map((pair) => pair.sold_row_id));
      const usedPurchased = new Set(pairs.map((pair) => pair.purchased_row_id));
      const unpairedSold = prepared.eligibleSold.filter((item) => !usedSold.has(item.id)).map((item) => ({ ...item, pair_status: "unpaired_sold" }));
      const unpairedPurchased = prepared.eligiblePurchased.filter((item) => !usedPurchased.has(item.id)).map((item) => ({ ...item, pair_status: "unpaired_purchased" }));
      const integrity = validatePairingIntegrity(pairs);
      const nextDatasets = applyPairsToDatasets(datasets, pairs);
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
        totalSavings: pairs.reduce((sum, pair) => sum + (pair.ahorro_kwh_100km || 0), 0),
        warningPairs: pairs.filter((pair) => pair.warnings?.length).length
      };
      setDatasets(nextDatasets);
      setPairing({ pairs, candidates, unpairedSold, unpairedPurchased, warnings: prepared.warnings, summary, integrity, updatedAt: new Date().toISOString() });
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
    setPairing((current) => ({ ...current, pairs: remaining, integrity: validatePairingIntegrity(remaining), summary: { ...current.summary, pairs: remaining.length, totalSavings: remaining.reduce((sum, pair) => sum + (pair.ahorro_kwh_100km || 0), 0) } }));
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
            onGenerate={generatePairing}
            onToggleLock={togglePairLock}
            onUndoPair={undoPair}
            onExportFinal={() => exportFinalTra050Excel({ pairs: pairing.pairs, datasets, warnings: pairing.warnings })}
          />
        </>
      ) : (
      <>
      <section className="dataset-overview">
        {Object.entries(DATASET_CONFIG).map(([key, config]) => {
          const data = datasets[key]?.matchResults || [];
          return (
            <article className={`dataset-status-card ${activeDatasetKey === key ? "active" : ""}`} key={key} onClick={() => setActiveDatasetKey(key)}>
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
      <VehiclesTable items={items} onSelect={setSelected} onMarkMissing={markMissing} />
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
