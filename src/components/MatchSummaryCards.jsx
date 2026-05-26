import { MATCH_STATES } from "../utils/matchEngine.js";

export default function MatchSummaryCards({ items, alerts }) {
  const count = (state) => items.filter((item) => item.match_estado === state).length;
  const cards = [
    ["Total vehiculos cargados", items.length, ""],
    ["Matches exactos", count(MATCH_STATES.exacto), "ok"],
    ["Matches probables", count(MATCH_STATES.probable), "info"],
    ["Conflictos", count(MATCH_STATES.conflicto), "warning"],
    ["Sin match", count(MATCH_STATES.sinMatch), "danger"],
    ["No encontrados en DB", count(MATCH_STATES.noEncontrado), "dark"],
    ["Errores de validacion", alerts.filter((a) => a.type === "Error").length, "danger"],
    ["Advertencias", alerts.filter((a) => a.type === "Advertencia").length, "warning"]
  ];
  return (
    <section className="summary-grid">
      {cards.map(([label, value, tone]) => (
        <article className={`summary-card ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  );
}
