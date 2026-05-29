import { Eye, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_VEHICLE_TABLE_FILTERS = {
  search: "",
  status: "all",
  onlyConflicts: false,
  onlyNoDb: false,
  onlyWarnings: false
};

const PAGE_SIZE = 75;

function applyVehicleFilters(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows
    .filter((item) => filters.status === "all" || item.match_estado === filters.status)
    .filter((item) => !filters.onlyConflicts || item.match_estado === "Conflicto")
    .filter((item) => !filters.onlyNoDb || item.vehiculo_no_encontrado_db)
    .filter((item) => !filters.onlyWarnings || item.dataset_warning || item.conflictos_detectados)
    .filter((item) => {
      if (!search) return true;
      return [
        item.input?.Matricula_Nuevo,
        item.input?.matricula,
        item.input?.Marca_modelo_Nuevo,
        item.input?.marca_modelo,
        item.assigned?.id_idae,
        item.assigned?.modeloOriginal
      ].filter(Boolean).join(" ").toLowerCase().includes(search);
    })
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}

export default function VehiclesTable({ items, datasetType, resetKey, onSelect, onMarkMissing }) {
  const rows = useMemo(() => Array.isArray(items) ? items : [], [items]);
  const [filters, setFilters] = useState(DEFAULT_VEHICLE_TABLE_FILTERS);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setFilters(DEFAULT_VEHICLE_TABLE_FILTERS);
    setPage(1);
  }, [datasetType, resetKey]);

  const filtered = useMemo(() => applyVehicleFilters(rows, filters), [rows, filters, datasetType]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [datasetType, rows.length, filters]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const visible = useMemo(() => {
    const safePage = Math.min(page, pageCount);
    return filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  }, [filtered, page, pageCount]);

  const statuses = useMemo(() => [...new Set(rows.map((item) => item.match_estado).filter(Boolean))], [rows]);
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_VEHICLE_TABLE_FILTERS);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_VEHICLE_TABLE_FILTERS);
    setPage(1);
  }

  return (
    <section className="panel table-panel">
      <div className="section-heading">
        <div>
          <h2>Tabla principal</h2>
          <p className="muted">{rows.length} vehiculos cargados · {filtered.length} resultados visibles</p>
        </div>
        <div className="filters">
          <label><Search size={16} /><input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Buscar matricula, modelo o IDAE" /></label>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="all">Todos los estados</option>
            {statuses.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
          <label className="check-filter"><input type="checkbox" checked={filters.onlyConflicts} onChange={(e) => updateFilter("onlyConflicts", e.target.checked)} /> Conflictos</label>
          <label className="check-filter"><input type="checkbox" checked={filters.onlyNoDb} onChange={(e) => updateFilter("onlyNoDb", e.target.checked)} /> No DB</label>
          <label className="check-filter"><input type="checkbox" checked={filters.onlyWarnings} onChange={(e) => updateFilter("onlyWarnings", e.target.checked)} /> Avisos</label>
          {hasActiveFilters && <button type="button" className="ghost small" onClick={clearFilters}><X size={14} /> Limpiar filtros</button>}
        </div>
      </div>

      {!rows.length ? (
        <p className="muted">Aun no hay vehiculos cargados.</p>
      ) : !filtered.length ? (
        <div className="empty-state">
          <p className="muted">No hay vehiculos que coincidan con los filtros actuales.</p>
          <button type="button" className="ghost small" onClick={clearFilters}>Limpiar filtros</button>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Matricula</th><th>Modelo cargado</th><th>Estado</th><th>Score</th><th>IDAE asignado</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>{item.input?.Matricula_Nuevo || item.input?.matricula || "-"}</td>
                    <td>{item.input?.Marca_modelo_Nuevo || item.input?.marca_modelo || "-"}</td>
                    <td><span className={`state ${String(item.match_estado || "").replaceAll(" ", "-").toLowerCase()}`}>{item.match_estado || "-"}</span></td>
                    <td>{item.match_score ?? "-"}</td>
                    <td>{item.assigned?.id_idae || "-"}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost small" onClick={() => onSelect(item)} title="Ver detalle"><Eye size={16} /> Ver detalle</button>
                      <button type="button" className="ghost small" onClick={() => onMarkMissing(item.id)}>No encontrado</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button type="button" className="ghost small" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <span>Pagina {Math.min(page, pageCount)} de {pageCount}</span>
            <button type="button" className="ghost small" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button>
          </div>
        </>
      )}
    </section>
  );
}
