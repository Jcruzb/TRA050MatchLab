import { useMemo } from "react";
import PairingSummaryCards from "./PairingSummaryCards.jsx";
import PairingResultTable from "./PairingResultTable.jsx";
import { prepareVehiclesForPairing } from "../tra050/tra050Pairing.js";

function diagnosticRows(prepared) {
  const mapRows = (items, datasetLabel) => items.map((item) => ({
    dataset: datasetLabel,
    matricula: item.pairing_debug?.matricula || item.input?.matricula || item.input?.Matricula_Nuevo || "",
    categoria: item.pairing_debug?.category || "",
    modelo: item.pairing_debug?.marca_modelo || "",
    fecha: item.pairing_debug?.parsedOperationDate || item.pairing_debug?.operationDate || "",
    consumo: item.pairing_debug?.consumption?.value ?? "",
    origen: item.pairing_debug?.consumption?.source || "",
    motivo: (item.pairing_ineligible_reasons || []).join(", ")
  }));
  return [
    ...mapRows(prepared.ineligibleSold || [], "Vendidos / termicos"),
    ...mapRows(prepared.ineligiblePurchased || [], "Comprados / electricos")
  ];
}

export default function PairingWorkspace({ canPair, datasets, pairing, onGenerate, onToggleLock, onUndoPair, onExportFinal }) {
  const prepared = useMemo(() => prepareVehiclesForPairing(
    datasets?.soldThermal?.matchResults || [],
    datasets?.purchasedElectric?.matchResults || []
  ), [datasets]);
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
      {pairing.integrity?.errors?.length > 0 && (
        <section className="panel">
          <h2>Advertencias de integridad</h2>
          {pairing.integrity.errors.map((error) => <p className="alert error" key={error}>{error}</p>)}
        </section>
      )}
      <PairingResultTable pairs={pairing.pairs || []} onToggleLock={onToggleLock} onUndoPair={onUndoPair} />
      <section className="panel">
        <h2>No emparejados</h2>
        <p className="muted">Vendidos sin pareja: {pairing.unpairedSold?.length || 0} · Electricos sin pareja: {pairing.unpairedPurchased?.length || 0}</p>
      </section>
    </>
  );
}
