import { Eye, Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function VehiclesTable({ items, onSelect, onMarkMissing }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("todos");
  const [page, setPage] = useState(1);
  const pageSize = 75;
  const filtered = useMemo(() => {
    return items
      .filter((item) => state === "todos" || item.match_estado === state)
      .filter((item) => `${item.input.Matricula_Nuevo} ${item.input.Marca_modelo_Nuevo}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.match_score - a.match_score);
  }, [items, query, state]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);

  return (
    <section className="panel table-panel">
      <div className="section-heading">
        <h2>Tabla principal</h2>
        <div className="filters">
          <label><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar matricula o modelo" /></label>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {[...new Set(items.map((item) => item.match_estado))].map((option) => <option key={option}>{option}</option>)}
          </select>
          <span className="muted">{filtered.length} resultados</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Matricula</th><th>Modelo cargado</th><th>Estado</th><th>Score</th><th>IDAE asignado</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>{item.input.Matricula_Nuevo}</td>
                <td>{item.input.Marca_modelo_Nuevo}</td>
                <td><span className={`state ${item.match_estado.replaceAll(" ", "-").toLowerCase()}`}>{item.match_estado}</span></td>
                <td>{item.match_score}</td>
                <td>{item.assigned?.id_idae || "-"}</td>
                <td className="row-actions">
                  <button className="icon" onClick={() => onSelect(item)} title="Ver detalle"><Eye size={16} /></button>
                  <button className="ghost small" onClick={() => onMarkMissing(item.id)}>No encontrado</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button className="ghost small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <span>Pagina {Math.min(page, pageCount)} de {pageCount}</span>
        <button className="ghost small" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
      </div>
    </section>
  );
}
