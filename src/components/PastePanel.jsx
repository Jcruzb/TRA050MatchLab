import { ClipboardPaste } from "lucide-react";
import { useState } from "react";
import { parsePastedTable } from "../utils/parsePastedTable.js";

export default function PastePanel({ onRows, onError, title = "Pegar desde Excel" }) {
  const [value, setValue] = useState("");
  function parse() {
    try {
      onRows(parsePastedTable(value));
    } catch (error) {
      onError(error.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <ClipboardPaste size={20} />
        <h2>{title}</h2>
      </div>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Pega aqui una tabla copiada de Excel con encabezados en la primera fila" />
      <button onClick={parse}>Procesar pegado</button>
    </section>
  );
}
