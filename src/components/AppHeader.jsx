import { Database, Trash2 } from "lucide-react";

export default function AppHeader({ dbCount, onClear }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">CAE TRA050</p>
        <h1>TRA050 MatchLab</h1>
        <p>Matching masivo de vehiculos contra base IDAE para expedientes TRA050</p>
      </div>
      <div className="header-actions">
        <span className="db-pill"><Database size={16} /> {dbCount.toLocaleString("es-ES")} IDAE</span>
        <button className="ghost" onClick={onClear} title="Limpiar sesion"><Trash2 size={18} /> Limpiar sesion</button>
      </div>
    </header>
  );
}
