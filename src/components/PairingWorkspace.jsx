import { useMemo } from "react";
import PairingSummaryCards from "./PairingSummaryCards.jsx";
import PairingResultTable from "./PairingResultTable.jsx";
import { prepareVehiclesForPairing } from "../tra050/tra050Pairing.js";

function diagnosticRows(prepared) {
  const explainReasons = (reasons = []) => reasons.map((reason) => {
    if (reason === "falta_kilometraje_anual") return "No se puede calcular el ahorro anual porque falta el kilometraje promedio anual L.";
    return reason;
  }).join(", ");
  const originLabel = (item) => {
    if (item.tra050_reference_auto_selected) return "referencia TRA050 automatica";
    if (item.tra050_reference_manual_selected) return "referencia TRA050 manual";
    return item.pairing_debug?.consumption?.source || "";
  };
  const mapRows = (items, datasetLabel, status = "") => items.map((item) => ({
    dataset: datasetLabel,
    matricula: item.pairing_debug?.matricula || item.input?.matricula || item.input?.Matricula_Nuevo || "",
    categoria: item.pairing_debug?.category || "",
    modelo: item.pairing_debug?.marca_modelo || "",
    fecha: item.pairing_debug?.parsedOperationDate || item.pairing_debug?.operationDate || "",
    consumo: item.pairing_debug?.consumption?.value !== null && item.pairing_debug?.consumption?.value !== undefined
      ? `${item.pairing_debug.consumption.value} ${item.pairing_debug.consumption.unit || ""}`.trim()
      : "",
    origen: originLabel(item),
    motivo: status || item.tra050_reference_reason || explainReasons(item.pairing_ineligible_reasons || [])
  }));
  const noDbWithReference = (prepared.eligibleSold || []).filter((item) => item.vehiculo_no_encontrado_db && item.consumo_origen === "tra050_reference");
  return [
    ...mapRows(noDbWithReference, "Vendidos / termicos", "Elegible No DB con consumo TRA050"),
    ...mapRows(prepared.ineligibleSold || [], "Vendidos / termicos"),
    ...mapRows(prepared.ineligiblePurchased || [], "Comprados / electricos")
  ];
}

export default function PairingWorkspace({ canPair, datasets, pairing, onAnnualMileageChange, onGenerate, onToggleLock, onUndoPair, onExportFinal }) {
  const prepared = useMemo(() => prepareVehiclesForPairing(
    datasets?.soldThermal?.matchResults || [],
    datasets?.purchasedElectric?.matchResults || [],
    { annualMileageKm: pairing?.annualMileageKm }
  ), [datasets, pairing?.annualMileageKm]);
  const liveSummary = {
    ...(pairing.summary || {}),
    soldLoaded: prepared.debug.soldProcessed,
    purchasedLoaded: prepared.debug.purchasedProcessed,
    eligibleSold: pairing.summary?.eligibleSold ?? prepared.debug.soldEligible,
    eligiblePurchased: pairing.summary?.eligiblePurchased ?? prepared.debug.purchasedEligible,
    ineligibleSold: prepared.debug.soldIneligible,
    ineligiblePurchased: prepared.debug.purchasedIneligible
  };
  const rows = diagnosticRows(prepared);
  return (
    <>
      <section className="panel dataset-hero">
        <p className="eyebrow">Fase 2</p>
        <h2>Emparejamiento TRA050</h2>
        <p className="muted">Empareja vehiculos vendidos/termicos con vehiculos comprados/electricos cumpliendo categoria, ventana temporal y unicidad.</p>
        {!canPair && <p className="alert advertencia">Carga y valida al menos un vehiculo vendido y un vehiculo electrico antes de generar parejas.</p>}
        <div className="pairing-config">
          <label>
            Kilometraje promedio anual por defecto
            <input
              value={pairing?.annualMileageKm || ""}
              onChange={(event) => onAnnualMileageChange?.(event.target.value)}
              placeholder="Ej. 20000"
              inputMode="numeric"
            />
          </label>
          <p className="muted">Primero se usa el kilometraje del Anexo III TRA050 inferido por tipologia. Este valor solo actua como respaldo si la tipologia no puede inferirse.</p>
        </div>
        <div className="button-row">
          <button disabled={!canPair} onClick={onGenerate}>Generar emparejamiento automatico</button>
          <button className="ghost" disabled={!pairing.pairs.length} onClick={onExportFinal}>Exportar Excel final TRA050</button>
        </div>
      </section>
      <PairingSummaryCards summary={liveSummary} />
      <details className="panel" open={rows.length > 0}>
        <summary>Diagnostico de elegibilidad</summary>
        <div className="diagnostic-grid">
          <p><strong>Vendidos procesados:</strong> {prepared.debug.soldProcessed}</p>
          <p><strong>Vendidos elegibles:</strong> {prepared.debug.soldEligible}</p>
          <p><strong>Vendidos no elegibles:</strong> {prepared.debug.soldIneligible}</p>
          <p><strong>Electricos procesados:</strong> {prepared.debug.purchasedProcessed}</p>
          <p><strong>Electricos elegibles:</strong> {prepared.debug.purchasedEligible}</p>
          <p><strong>Electricos no elegibles:</strong> {prepared.debug.purchasedIneligible}</p>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Dataset</th><th>Matricula</th><th>Categoria</th><th>Modelo</th><th>Fecha detectada</th><th>Consumo</th><th>Origen</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, index) => (
                  <tr key={`${row.dataset}-${row.matricula}-${index}`}>
                    <td>{row.dataset}</td>
                    <td>{row.matricula || "-"}</td>
                    <td>{row.categoria || "-"}</td>
                    <td>{row.modelo || "-"}</td>
                    <td>{String(row.fecha || "-")}</td>
                    <td>{row.consumo || "-"}</td>
                    <td>{row.origen || "-"}</td>
                    <td>{row.motivo || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="muted">Mostrando los primeros 100 no elegibles de {rows.length}.</p>}
          </div>
        ) : <p className="muted">Todos los vehiculos cargados tienen categoria, fecha, consumo y matching resuelto para entrar al emparejamiento.</p>}
      </details>
      <details className="panel" open>
        <summary>Diagnostico del emparejamiento</summary>
        <div className="diagnostic-grid">
          <p><strong>Candidatos evaluados totales:</strong> {pairing.pairingDiagnostics?.totalCandidatesEvaluated || 0}</p>
          <p><strong>Descartados por categoria:</strong> {pairing.pairingDiagnostics?.discardedByCategory || 0}</p>
          <p><strong>Descartados por fecha:</strong> {pairing.pairingDiagnostics?.discardedByDateWindow || 0}</p>
          <p><strong>Descartados por consumo/factor:</strong> {pairing.pairingDiagnostics?.discardedByMissingConsumption || 0}</p>
          <p><strong>Descartados por kilometraje:</strong> {pairing.pairingDiagnostics?.discardedByMissingMileage || 0}</p>
          <p><strong>Candidatos validos:</strong> {pairing.pairingDiagnostics?.validCandidates || 0}</p>
          <p><strong>Pares seleccionados:</strong> {pairing.pairingDiagnostics?.selectedPairs || 0}</p>
          <p><strong>Vehiculos sobrantes por unicidad:</strong> {pairing.pairingDiagnostics?.unpairedByUniqueness || 0}</p>
        </div>
      </details>
      {pairing.integrity?.errors?.length > 0 && (
        <section className="panel">
          <h2>Advertencias de integridad</h2>
          {pairing.integrity.errors.map((error) => <p className="alert error" key={error}>{error}</p>)}
        </section>
      )}
      <PairingResultTable pairs={pairing.pairs || []} onToggleLock={onToggleLock} onUndoPair={onUndoPair} />
      {Boolean((pairing.unpairedSold?.length || 0) + (pairing.unpairedPurchased?.length || 0)) && (
        <section className="panel">
          <h2>Motivos de no emparejados</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dataset</th><th>Matricula</th><th>Motivo</th><th>Detalle</th></tr></thead>
              <tbody>
                {[...(pairing.unpairedSold || []).map((item) => ({ ...item, label: "Vendido" })), ...(pairing.unpairedPurchased || []).map((item) => ({ ...item, label: "Comprado" }))].map((item) => (
                  <tr key={`${item.label}-${item.id}`}>
                    <td>{item.label}</td>
                    <td>{item.input?.Matricula_Nuevo || item.input?.matricula || "-"}</td>
                    <td>{item.unpaired_reason || "-"}</td>
                    <td>{item.unpaired_reason_detail || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>No emparejados</h2>
        <p className="muted">Vendidos sin pareja: {pairing.unpairedSold?.length || 0} · Electricos sin pareja: {pairing.unpairedPurchased?.length || 0}</p>
      </section>
    </>
  );
}
