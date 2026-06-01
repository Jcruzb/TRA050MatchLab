import { Database, FileDown, FileUp, Trash2 } from "lucide-react";

export default function AppHeader({ dbCount, onClear, onSaveProjectSession, onLoadProjectSession }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">CAE TRA050</p>
        <h1>TRA050 MatchLab</h1>
        <p>Matching masivo de vehiculos contra base IDAE para expedientes TRA050</p>
      </div>
      <div className="header-actions">
        <span className="db-pill"><Database size={16} /> {dbCount.toLocaleString("es-ES")} IDAE</span>
        <button onClick={onSaveProjectSession} title="Guardar sesion JSON"><FileDown size={18} /> Guardar sesion JSON</button>
        <label className="file-button secondary" title="Cargar sesion JSON">
          <FileUp size={18} /> Cargar sesion JSON
          <input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onLoadProjectSession(file);
          }} />
        </label>
        <button className="ghost" onClick={onClear} title="Limpiar sesion local"><Trash2 size={18} /> Limpiar sesion local</button>
      </div>
    </header>
  );
}
