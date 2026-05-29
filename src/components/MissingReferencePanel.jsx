import { TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "../data/tra050-reference.js";
import { getThermalTra050References } from "../tra050/tra050ReferenceResolver.js";
import { MATCH_STATES } from "../utils/matchEngine.js";

const electricReferences = TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO.map((item) => ({
  ...item,
  key: `nuevo-${item.tipologia}`,
  label: `${item.tipologia} · ${item.consumo || item.consumo_kwh_100km} ${item.unidad || "kWh/100km"}`,
  unidad: item.unidad || "kWh/100km",
  consumo: item.consumo || item.consumo_kwh_100km
}));

const thermalReferences = getThermalTra050References().map((item, index) => ({
  ...item,
  key: item.key || `termico-${index}`,
  label: `${item.tipologia} · ${item.combustible} · ${item.consumo} ${item.unidad}`
}));

function referenceStatus(item) {
  if (item.tra050_reference_auto_selected) return "Referencia seleccionada automaticamente";
  if (item.tra050_reference_manual_selected) return "Referencia seleccionada manualmente";
  return "Pendiente de seleccionar referencia TRA050";
}

export default function MissingReferencePanel({ items, onUpdate }) {
  const missing = items.filter((item) => item.match_estado === MATCH_STATES.noEncontrado);
  if (!missing.length) return null;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Vehiculos no encontrados en la DB</h2>
        <p className="muted">Registra la referencia TRA050 y la observacion justificativa para la exportacion.</p>
      </div>
      <div className="missing-list">
        {missing.map((item) => {
          const references = item.dataset_type === "sold_thermal" ? thermalReferences : electricReferences;
          return (
            <article className="missing-item" key={item.id}>
              <strong>{item.input.Matricula_Nuevo} · {item.input.Marca_modelo_Nuevo}</strong>
              <p className={item.reference ? "alert correcto" : "alert advertencia"}>{referenceStatus(item)}</p>
              {item.reference && (
                <p className="muted">
                  {item.reference.tipologia} · {item.reference.combustible ? `${item.reference.combustible} · ` : ""}
                  {item.reference.consumo || item.reference.consumo_kwh_100km} {item.reference.unidad}
                </p>
              )}
              {item.tra050_reference_reason && <p className="muted">Motivo: {item.tra050_reference_reason}</p>}
              {item.tra050_reference_warnings && <p className="alert advertencia">{item.tra050_reference_warnings}</p>}
              <select value={item.reference?.key || ""} onChange={(event) => onUpdate(item.id, references.find((entry) => entry.key === event.target.value) || null, item.notes, "manual")}>
                <option value="">Seleccionar referencia TRA050...</option>
                {references.map((reference) => <option value={reference.key} key={reference.key}>{reference.label}</option>)}
              </select>
              <div className="reference-summary">
                <p><span>Tipologia</span>{item.reference?.tipologia || "-"}</p>
                {item.dataset_type === "sold_thermal" && <p><span>Combustible</span>{item.reference?.combustible || "-"}</p>}
                <p><span>Consumo</span>{item.reference?.consumo || item.reference?.consumo_kwh_100km || "-"}</p>
                <p><span>Unidad</span>{item.reference?.unidad || "-"}</p>
              </div>
              <textarea value={item.notes || ""} onChange={(event) => onUpdate(item.id, item.reference || null, event.target.value, "notes")} placeholder="Observacion justificativa" />
            </article>
          );
        })}
      </div>
    </section>
  );
}
