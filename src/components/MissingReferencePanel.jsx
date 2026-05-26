import { TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO, TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "../data/tra050-reference.js";
import { MATCH_STATES } from "../utils/matchEngine.js";

const electricReferences = TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO.map((item) => ({
  ...item,
  key: `nuevo-${item.tipologia}`,
  label: `${item.tipologia} · ${item.consumo || item.consumo_kwh_100km} ${item.unidad || "kWh/100km"}`,
  unidad: item.unidad || "kWh/100km",
  consumo: item.consumo || item.consumo_kwh_100km
}));

const thermalReferences = TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO.map((item, index) => ({
  ...item,
  key: `termico-${index}`,
  label: `${item.tipologia} · ${item.combustible} · ${item.consumo} ${item.unidad}`
}));

export default function MissingReferencePanel({ items, onUpdate }) {
  const missing = items.filter((item) => item.match_estado === MATCH_STATES.noEncontrado);
  if (!missing.length) return null;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Vehículos no encontrados en la DB</h2>
        <p className="muted">Registra la referencia TRA050 y la observación justificativa para la exportación.</p>
      </div>
      <div className="missing-list">
        {missing.map((item) => {
          const references = item.dataset_type === "sold_thermal" ? thermalReferences : electricReferences;
          return (
            <article className="missing-item" key={item.id}>
              <strong>{item.input.Matricula_Nuevo} · {item.input.Marca_modelo_Nuevo}</strong>
              <select value={item.reference?.key || references[0]?.key} onChange={(event) => onUpdate(item.id, references.find((entry) => entry.key === event.target.value), item.notes)}>
                {references.map((reference) => <option value={reference.key} key={reference.key}>{reference.label}</option>)}
              </select>
              <div className="reference-summary">
                <p><span>Tipología</span>{item.reference?.tipologia || references[0]?.tipologia}</p>
                {item.dataset_type === "sold_thermal" && <p><span>Combustible</span>{item.reference?.combustible || references[0]?.combustible}</p>}
                <p><span>Consumo</span>{item.reference?.consumo || references[0]?.consumo}</p>
                <p><span>Unidad</span>{item.reference?.unidad || references[0]?.unidad}</p>
              </div>
              <textarea value={item.notes || ""} onChange={(event) => onUpdate(item.id, item.reference || references[0], event.target.value)} placeholder="Observación justificativa" />
            </article>
          );
        })}
      </div>
    </section>
  );
}
