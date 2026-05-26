export default function PairingResultTable({ pairs, onToggleLock, onUndoPair }) {
  if (!pairs.length) return <section className="panel"><h2>Parejas propuestas</h2><p className="muted">Aún no hay parejas generadas.</p></section>;
  return (
    <section className="panel table-panel">
      <h2>Parejas propuestas</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID pareja</th><th>Categoría</th><th>Vendido</th><th>Fecha venta</th><th>Comprado</th><th>Fecha compra</th><th>Ahorro</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {pairs.map((pair) => (
              <tr key={pair.match_pair_id}>
                <td>{pair.match_pair_id}</td>
                <td>{pair.categoria}</td>
                <td>{pair.sold_matricula}</td>
                <td>{pair.fecha_venta}</td>
                <td>{pair.purchased_matricula}</td>
                <td>{pair.fecha_compra}</td>
                <td>{pair.ahorro_kwh_100km}</td>
                <td>{pair.pair_locked ? "locked" : pair.pair_status}</td>
                <td className="row-actions">
                  <button className="ghost small" onClick={() => onToggleLock(pair.match_pair_id)}>{pair.pair_locked ? "Desbloquear" : "Bloquear"}</button>
                  <button className="ghost small" onClick={() => onUndoPair(pair.match_pair_id)}>Deshacer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
