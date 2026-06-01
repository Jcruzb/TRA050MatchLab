import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { compareTechnicalSpecs, formatCilindradaCc, formatEmisionesGco2Km, formatPotenciaCv, parseCilindradaCc, parseEmisionesGco2Km, parsePotenciaCv } from "../utils/technicalSpecs.js";

function inputValue(item, key, legacyKey = "") {
  return item?.input?.[key] || (legacyKey ? item?.input?.[legacyKey] : "") || item?.[key] || "";
}

function buildInitialTechnicalBasis(items) {
  const item = items[0] || {};
  return {
    categoria: inputValue(item, "categoria", "Categoria_nuevo"),
    marca_modelo: inputValue(item, "marca_modelo", "Marca_modelo_Nuevo"),
    cilindrada_cc: parseCilindradaCc(inputValue(item, "cilindrada", "Cilindrada_Nuevo")) || "",
    potencia_cv: parsePotenciaCv(inputValue(item, "potencia", "Potencia_Nuevo")) || "",
    emisiones_wltp_gco2_km: parseEmisionesGco2Km(inputValue(item, "emisiones_wltp_gco2_km", "Emisiones_WLTP_gCO2_km")) || "",
    combustible_motorizacion: inputValue(item, "combustible_motorizacion", "Combustible_Motorizacion_Nuevo"),
    tipo_cambio: inputValue(item, "tipo_cambio", "Tipo_Cambio_Nuevo"),
    anio_modelo_my: inputValue(item, "anio_modelo_my", "Anio_Modelo_MY_Nuevo")
  };
}

function buildComparedCandidates(items, basis) {
  const seen = new Set();
  return items
    .flatMap((item) => item.candidates || [])
    .filter((candidate) => {
      if (!candidate?.id_idae || seen.has(candidate.id_idae)) return false;
      seen.add(candidate.id_idae);
      return true;
    })
    .slice(0, 8)
    .map((candidate) => {
      const comparison = compareTechnicalSpecs({
        cilindradaCc: basis.cilindrada_cc,
        potenciaCv: basis.potencia_cv,
        emisionesWltpGco2Km: basis.emisiones_wltp_gco2_km
      }, candidate);
      return {
        id_idae: candidate.id_idae,
        modelo_idae: candidate.modeloOriginal,
        cilindrada_cc: candidate.cilindradaCc || null,
        potencia_cv: candidate.potenciaCv || null,
        emisiones_wltp_gco2_km: candidate.emisionesWltpGco2Km || null,
        differences: Object.values(comparison).filter((entry) => ["dudosa", "distinta"].includes(entry.status)).map((entry) => entry.explanation)
      };
    });
}

export default function NoDbJustificationModal({ items, scope = "individual", groupLabel = "", onClose, onConfirm }) {
  const targets = useMemo(() => Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean), [items]);
  const [basis, setBasis] = useState(() => buildInitialTechnicalBasis(targets));
  const [reason, setReason] = useState(scope === "group" ? "Justificacion aplicada al grupo completo. " : "");
  const [touched, setTouched] = useState(false);
  const comparedCandidates = useMemo(() => buildComparedCandidates(targets, {
    ...basis,
    cilindrada_cc: parseCilindradaCc(basis.cilindrada_cc),
    potencia_cv: parsePotenciaCv(basis.potencia_cv),
    emisiones_wltp_gco2_km: parseEmisionesGco2Km(basis.emisiones_wltp_gco2_km)
  }), [targets, basis]);
  const plates = targets.map((item) => inputValue(item, "matricula", "Matricula_Nuevo")).filter(Boolean).join(", ");
  const missingReason = touched && !reason.trim();

  function update(key, value) {
    setBasis((current) => ({ ...current, [key]: value }));
  }

  function confirm() {
    setTouched(true);
    if (!reason.trim()) return;
    onConfirm({
      created_at: new Date().toISOString(),
      applied_scope: scope,
      reason_text: reason.trim(),
      technical_basis: {
        ...basis,
        cilindrada_cc: parseCilindradaCc(basis.cilindrada_cc),
        potencia_cv: parsePotenciaCv(basis.potencia_cv),
        emisiones_wltp_gco2_km: parseEmisionesGco2Km(basis.emisiones_wltp_gco2_km)
      },
      compared_candidates: comparedCandidates
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal no-db-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Confirmar vehiculo no encontrado en DB">
        <button type="button" className="icon close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        <h2>Confirmar vehiculo no encontrado en DB</h2>
        <p className="muted">Registra los datos tecnicos utilizados para justificar que el vehiculo cargado no corresponde a los candidatos IDAE propuestos.</p>
        {scope === "group" && <p className="alert advertencia">Esta justificacion se aplicara al grupo completo: {groupLabel}</p>}

        <div className="no-db-grid">
          <label>Categoria<input value={basis.categoria} onChange={(e) => update("categoria", e.target.value)} /></label>
          <label>Matricula o grupo<input value={plates || groupLabel} readOnly /></label>
          <label>Marca/modelo cargado<input value={basis.marca_modelo} onChange={(e) => update("marca_modelo", e.target.value)} /></label>
          <label>Cilindrada real (cc)<input value={basis.cilindrada_cc} onChange={(e) => update("cilindrada_cc", e.target.value)} placeholder="1999" /></label>
          <label>Potencia real (cv)<input value={basis.potencia_cv} onChange={(e) => update("potencia_cv", e.target.value)} placeholder="150" /></label>
          <label>Emisiones WLTP reales (g CO2/km)<input value={basis.emisiones_wltp_gco2_km} onChange={(e) => update("emisiones_wltp_gco2_km", e.target.value)} placeholder="120" /></label>
          <label>Combustible/motorizacion<input value={basis.combustible_motorizacion} onChange={(e) => update("combustible_motorizacion", e.target.value)} /></label>
          <label>Tipo de cambio<input value={basis.tipo_cambio} onChange={(e) => update("tipo_cambio", e.target.value)} /></label>
          <label>Año/MY<input value={basis.anio_modelo_my} onChange={(e) => update("anio_modelo_my", e.target.value)} /></label>
        </div>

        <label className="stacked-field">Descripcion / detalles adicionales que justifican el descarte
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} placeholder="La ficha tecnica indica cilindrada, potencia o emisiones distintas a los candidatos IDAE disponibles..." />
        </label>
        {missingReason && <p className="alert error">La descripcion de la justificacion es obligatoria.</p>}

        <div className="debug-box">
          <strong>Candidatos comparados</strong>
          {comparedCandidates.length ? comparedCandidates.map((candidate) => (
            <p key={candidate.id_idae}>
              {candidate.id_idae} · {candidate.modelo_idae} · {formatCilindradaCc(candidate.cilindrada_cc)} · {formatPotenciaCv(candidate.potencia_cv)} · {formatEmisionesGco2Km(candidate.emisiones_wltp_gco2_km)}
              {candidate.differences.length ? ` · ${candidate.differences.join("; ")}` : ""}
            </p>
          )) : <p className="muted">No hay candidatos IDAE comparados.</p>}
        </div>

        <div className="button-row selector-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={confirm}>Confirmar No DB</button>
        </div>
      </section>
    </div>
  );
}
