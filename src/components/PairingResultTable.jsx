import { useState } from "react";
import { X } from "lucide-react";

function format(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number.isFinite(Number(value)) ? Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 }) : value}${suffix}`;
}

function ConditionBadges({ pair }) {
  const badges = [
    [pair.categoryCheck?.valid, `Categoria ${pair.categoryCheck?.soldCategory || pair.categoria || "-"}`],
    [pair.dateWindowCheck?.valid, "Fecha dentro de ventana"],
    [pair.savingCheck?.valid, "Ahorro calculado"],
    [pair.uniquenessCheck?.valid, "Sin duplicados"]
  ];
  const warnings = [...(pair.warnings_calculo || []), ...(pair.warnings || [])];
  return (
    <div className="condition-badges">
      {badges.map(([ok, label]) => <span className={ok ? "mini-badge ok" : "mini-badge danger"} key={label}>{ok ? "✓" : "✕"} {label}</span>)}
      {warnings.slice(0, 2).map((warning) => <span className="mini-badge warning" key={warning}>⚠ {warning}</span>)}
    </div>
  );
}

function PairingDetailModal({ pair, onClose }) {
  if (!pair) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalle de calculo TRA050">
        <button type="button" className="icon close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        <h2>{pair.match_pair_id}</h2>
        <div className="detail-grid">
          <div>
            <h3>Validacion del match TRA050</h3>
            <p><span>Categoria</span>{pair.categoryCheck?.explanation || "-"}</p>
            <p><span>Fechas</span>{pair.dateWindowCheck?.explanation || "-"}</p>
            <p><span>Ahorro</span>{pair.savingCheck?.valid ? "cumple" : "pendiente"} · {pair.savingCheck?.explanation || "-"}</p>
            <p><span>Unicidad</span>{pair.uniquenessCheck?.explanation || "-"}</p>
            <p><span>Seleccion</span>{pair.pair_selection_explanation || "-"}</p>
          </div>
          <div>
            <h3>Calculo TRA050</h3>
            <p><span>CVA</span>{format(pair.cva_original)} {pair.unidad_cva_original || ""}</p>
            <p><span>f</span>{format(pair.factor_conversion_f)} {pair.unidad_factor_conversion || ""}</p>
            <p><span>CVA · f</span>{format(pair.cva_kwh_100km, " kWh/100km")}</p>
            <p><span>CVN</span>{format(pair.cvn_kwh_100km, " kWh/100km")}</p>
            <p><span>L</span>{format(pair.kilometraje_anual_km, " km/año")} {pair.annual_mileage_source === "tra050_annex_iii" ? `segun Anexo III TRA050 para tipologia ${pair.annual_mileage_typology}.` : ""}</p>
            <p><span>Diferencia</span>{format(pair.ahorro_kwh_100km, " kWh/100km")}</p>
            <p><span>AE_TOTAL</span>{format(pair.ahorro_kwh_anio, " kWh/año")}</p>
          </div>
          <div>
            <h3>Trazabilidad</h3>
            <p><span>Formula</span>{pair.formula_aplicada || "-"}</p>
            <p><span>Combustible</span>{pair.combustible_vendido || "-"}</p>
            <p><span>Origen L</span>{pair.kilometraje_anual_origen || "-"}</p>
            <p><span>Tipologia L</span>{pair.tipologia_km_anuales || pair.annual_mileage_typology || "-"}</p>
            <p><span>Valido</span>{pair.calculo_valido ? "Si" : "No"}</p>
            <p><span>Warnings</span>{(pair.warnings_calculo || pair.warnings || []).join(" | ") || "-"}</p>
            <p><span>Errores</span>{(pair.errores_calculo || []).join(" | ") || "-"}</p>
          </div>
        </div>
        <h3>Alternativas evaluadas</h3>
        <div className="table-wrap compact-table">
          <table>
            <thead><tr><th>Vendido</th><th>Comprado</th><th>Categoria</th><th>Fecha</th><th>Ahorro kWh/año</th><th>Estado</th></tr></thead>
            <tbody>
              {(pair.alternativesEvaluated || []).map((alt) => (
                <tr key={alt.candidate_id}>
                  <td>{alt.sold_matricula}</td>
                  <td>{alt.purchased_matricula}</td>
                  <td>{alt.categoria || "-"}</td>
                  <td>{alt.fecha_valida ? "valida" : "no valida"}</td>
                  <td>{format(alt.ahorro_kwh_anio)}</td>
                  <td>{alt.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Explicacion exportable</h3>
        <p className="explain">{pair.explicacion_calculo || pair.explanation || "-"}</p>
        <p className="explain">{`AE_TOTAL = ((${format(pair.cva_kwh_100km)} - ${format(pair.cvn_kwh_100km)}) / 100) · ${format(pair.kilometraje_anual_km)} = ${format(pair.ahorro_kwh_anio)} kWh/año`}</p>
      </section>
    </div>
  );
}

export default function PairingResultTable({ pairs, onToggleLock, onUndoPair }) {
  const [selectedPair, setSelectedPair] = useState(null);
  if (!pairs.length) return <section className="panel"><h2>Parejas propuestas</h2><p className="muted">Aun no hay parejas generadas.</p></section>;
  return (
    <section className="panel table-panel">
      <h2>Parejas propuestas</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID pareja</th><th>Categoria</th><th>Vendido</th><th>Comprado</th>
              <th>Ahorro kWh/año</th><th>Diferencia kWh/100km</th><th>Kilometraje anual</th><th>Condiciones evaluadas</th>
              <th>CVA</th><th>Factor f</th><th>CVA kWh/100km</th><th>CVN kWh/100km</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => (
              <tr key={pair.match_pair_id}>
                <td>{pair.match_pair_id}</td>
                <td>{pair.categoria}</td>
                <td>{pair.sold_matricula}</td>
                <td>{pair.purchased_matricula}</td>
                <td>{format(pair.ahorro_kwh_anio)}</td>
                <td>{format(pair.ahorro_kwh_100km)}</td>
                <td>{format(pair.kilometraje_anual_km)}</td>
                <td><ConditionBadges pair={pair} /></td>
                <td>{format(pair.cva_original)} {pair.unidad_cva_original || ""}</td>
                <td>{format(pair.factor_conversion_f)} {pair.unidad_factor_conversion || ""}</td>
                <td>{format(pair.cva_kwh_100km)}</td>
                <td>{format(pair.cvn_kwh_100km)}</td>
                <td>{pair.pair_locked ? "locked" : pair.pair_status}</td>
                <td className="row-actions">
                  <button className="ghost small" onClick={() => setSelectedPair(pair)}>Detalle</button>
                  <button className="ghost small" onClick={() => onToggleLock(pair.match_pair_id)}>{pair.pair_locked ? "Desbloquear" : "Bloquear"}</button>
                  <button className="ghost small" onClick={() => onUndoPair(pair.match_pair_id)}>Deshacer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PairingDetailModal pair={selectedPair} onClose={() => setSelectedPair(null)} />
    </section>
  );
}
