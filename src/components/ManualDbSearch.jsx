import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function ManualDbSearch({ index, selectedItem, onAssign }) {
  const [query, setQuery] = useState("");
  const [motorizacion, setMotorizacion] = useState("");
  const [cilindrada, setCilindrada] = useState("");
  const results = useMemo(() => {
    const q = query.toLowerCase();
    return index
      .filter((item) => !q || item.modeloNormalizado.includes(q) || item.id_idae?.includes(q))
      .filter((item) => !motorizacion || item.motorizacion === motorizacion)
      .filter((item) => !cilindrada || Math.abs((item.cilindradaCc || 0) - Number(cilindrada)) <= 100)
      .slice(0, 50);
  }, [index, query, motorizacion, cilindrada]);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Busqueda manual en DB</h2>
        <p className="muted">{selectedItem ? `Asignando a ${selectedItem.input.Matricula_Nuevo}` : "Abre una fila para asignar manualmente."}</p>
      </div>
      <div className="manual-grid">
        <label><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Texto libre, marca/modelo o ID" /></label>
        <input value={cilindrada} onChange={(e) => setCilindrada(e.target.value)} placeholder="Cilindrada cc" />
        <select value={motorizacion} onChange={(e) => setMotorizacion(e.target.value)}>
          <option value="">Motorizacion</option>
          {["electrico puro", "hibrido gasolina", "hibrido diesel", "hibrido enchufable", "gasolina", "diesel", "gas natural", "GLP"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      <div className="manual-results">
        {results.map((candidate) => (
          <button key={candidate.id_idae} disabled={!selectedItem} onClick={() => onAssign(selectedItem.id, candidate.id_idae, true, candidate)}>
            <strong>{candidate.id_idae} · {candidate.modeloOriginal}</strong>
            <span>{candidate.cilindradaCc || "-"} cc · {candidate.motorizacion || "-"} · {candidate.potenciaCv || "-"} cv · {candidate.segmento || "-"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
