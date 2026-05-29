import { X } from "lucide-react";

function valueOrDash(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function Field({ label, value }) {
  const rendered = valueOrDash(value);
  return (
    <p>
      <span>{label}</span>
      <code className={rendered.includes("\n") ? "multiline-value" : ""}>{rendered}</code>
    </p>
  );
}

function Section({ title, fields }) {
  return (
    <div>
      <h3>{title}</h3>
      {fields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
    </div>
  );
}

function rawData(item) {
  return item.assigned?.raw || item.raw || item.idae_vehicle?.raw || item.idae_vehicle || {};
}

function tableValue(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.stringify(value, null, 2);
}

export default function VehicleDetailModal({ item, onClose }) {
  if (!item) return null;
  const input = item.input || {};
  const assigned = item.assigned || {};
  const raw = rawData(item);
  const detail = raw.detalle_tecnico || assigned.raw?.detalle_tecnico || {};
  const wltp = raw.tabla_wltp || assigned.raw?.tabla_wltp || {};
  const datasetLabel = item.dataset_type === "sold_thermal" ? "Vendido / termico" : item.dataset_type === "purchased_electric" ? "Comprado / electrico" : item.dataset_type;
  const operationLabel = item.dataset_type === "sold_thermal" ? "Fecha venta" : "Fecha compra";

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal vehicle-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalle de vehiculo">
        <button type="button" className="icon close" onClick={onClose} aria-label="Cerrar detalle"><X size={18} /></button>
        <h2>{input.Matricula_Nuevo || input.matricula || "-"} · {input.Marca_modelo_Nuevo || input.marca_modelo || "-"}</h2>

        <div className="detail-grid">
          <Section title="Datos cargados" fields={[
            ["Dataset", datasetLabel],
            ["Matricula", input.Matricula_Nuevo || input.matricula],
            ["Categoria", input.Categoria_nuevo || input.categoria],
            ["Marca/modelo original", input.Marca_modelo_Nuevo || input.marca_modelo],
            ["Fecha matriculacion", input.Matriculacion_Nuevo || input.fecha_matriculacion],
            [operationLabel, input.fecha_operacion || input["Fecha Compra"]],
            ["Contrato/factura", input.contrato_factura || input["Nº Contrato/Factura"] || input["NÂº Contrato/Factura"] || input["NÃ‚Âº Contrato/Factura"]],
            ["Precio sin IVA", input.precio_sin_iva || input["Precio (SIN IVA)"]],
            ["Combustible/motorizacion", input.Combustible_Motorizacion_Nuevo || input.combustible_motorizacion],
            ["Cilindrada", input.Cilindrada_Nuevo || input.cilindrada],
            ["Potencia", input.Potencia_Nuevo || input.potencia],
            ["Tipo de cambio", input.Tipo_Cambio_Nuevo || input.tipo_cambio],
            ["Carroceria", input.Carroceria_Nuevo || input.carroceria],
            ["Version/acabado", input.Version_Acabado_Nuevo || input.version_acabado],
            ["Observaciones", input.Observaciones_Nuevo || input.observaciones]
          ]} />

          <Section title="Matching IDAE" fields={[
            ["Estado del match", item.match_estado],
            ["Score", item.match_score],
            ["ID IDAE asignado", assigned.id_idae],
            ["Modelo IDAE asignado", assigned.modeloOriginal],
            ["Origen del match", item.manual_search_used ? "Busqueda manual global" : item.learning_rule_applied ? "Aprendizaje local" : item.match_manual ? "Seleccion manual" : "Motor de matching"],
            ["Aprendizaje local", item.learning_rule_applied],
            ["Manual", item.match_manual],
            ["Resuelto como grupo", item.resolved_as_group],
            ["Grupo", item.conflict_group_label || item.group_resolution_key],
            ["Explicacion del match", item.explicacion_match]
          ]} />

          <Section title="Consumo TRA050" fields={[
            ["consumo_origen", item.consumo_origen],
            ["consumo_oficial_extraido", assigned.consumoElectricoKwh100 || assigned.consumoLitros100 || item.consumo_oficial_extraido],
            ["consumo_referencia_tra050", item.consumo_referencia_tra050 || item.reference?.consumo || item.reference?.consumo_kwh_100km],
            ["unidad_consumo", item.unidad_consumo || item.reference?.unidad],
            ["tipologia_referencia_tra050", item.tipologia_referencia_tra050 || item.reference?.tipologia],
            ["combustible_referencia_tra050", item.combustible_referencia_tra050 || item.reference?.combustible],
            ["tra050_reference_auto_selected", item.tra050_reference_auto_selected],
            ["tra050_reference_reason", item.tra050_reference_reason]
          ]} />

          <Section title="Datos tecnicos IDAE" fields={[
            ["modelo_tabla", raw.modelo_tabla || assigned.modeloOriginal],
            ["titulo_modal", raw.titulo_modal],
            ["source_url", assigned.source_url || raw.source_url],
            ["tabla_wltp", tableValue(wltp)],
            ["detalle_tecnico", tableValue(detail)]
          ]} />
        </div>

        <details className="debug-box">
          <summary>Debug de matching</summary>
          <pre>{JSON.stringify({
            rawInput: item.matchDebug?.rawInput || item.userFeatures?.rawText,
            normalizedTokens: item.matchDebug?.normalizedTokens || item.userFeatures?.modelTokens,
            inferredBrand: item.matchDebug?.inferredBrand || item.userFeatures?.brand,
            brandConfidence: item.matchDebug?.brandConfidence || item.userFeatures?.brandConfidence,
            modelBase: item.matchDebug?.modelBase || item.userFeatures?.modelBase,
            year: item.matchDebug?.year || item.userFeatures?.year,
            rejectedModelTokens: item.matchDebug?.rejectedModelTokens || item.userFeatures?.rejectedModelTokens,
            candidateRetrievalPhase: item.matchDebug?.candidateRetrievalPhase,
            vectorScore: item.match_score,
            matchedFeatures: item.matched_features || assigned.matchedFeatures,
            penalties: item.penalties || assigned.penalties,
            candidatesBeforeHardGates: item.matchDebug?.candidatesBeforeHardGates,
            candidatesAfterHardGates: item.matchDebug?.candidatesAfterHardGates,
            discardedByBrand: item.matchDebug?.discardedByBrand,
            discardedByModel: item.matchDebug?.discardedByModel,
            topCandidates: item.matchDebug?.topCandidates,
            learningRuleApplied: item.learning_rule_id || item.matchDebug?.learningRuleApplied
          }, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
