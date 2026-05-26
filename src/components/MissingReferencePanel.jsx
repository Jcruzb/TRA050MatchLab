import { TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO, TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO } from "../data/tra050-reference.js";
import { MATCH_STATES } from "../utils/matchEngine.js";

const references = [
  ...TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO.map((item) => ({ ...item, key: `nuevo-${item.tipologia}`, label: `${item.tipologia} · ${item.consumo_kwh_100km} kWh/100km`, unidad: "kWh/100km", consumo: item.consumo_kwh_100km })),
  ...TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO.map((item, index) => ({ ...item, key: `termico-${index}`, label: `${item.tipologia} · ${item.combustible} · ${item.consumo} ${item.unidad}` }))
];

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
        {missing.map((item) => (
          <article className="missing-item" key={item.id}>
            <strong>{item.input.Matricula_Nuevo} · {item.input.Marca_modelo_Nuevo}</strong>
            <select value={item.reference?.key || "nuevo-M1"} onChange={(event) => onUpdate(item.id, references.find((entry) => entry.key === event.target.value), item.notes)}>
              {references.map((reference) => <option value={reference.key} key={reference.key}>{reference.label}</option>)}
            </select>
            <textarea value={item.notes || ""} onChange={(event) => onUpdate(item.id, item.reference || references[0], event.target.value)} placeholder="Observacion justificativa" />
          </article>
        ))}
      </div>
    </section>
  );
}
