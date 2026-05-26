import { X } from "lucide-react";

export default function VehicleDetailModal({ item, onClose }) {
  if (!item) return null;
  const detail = item.assigned?.raw?.detalle_tecnico || {};
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <button className="icon close" onClick={onClose}><X size={18} /></button>
        <h2>{item.input.Matricula_Nuevo} · {item.input.Marca_modelo_Nuevo}</h2>
        <div className="detail-grid">
          <div>
            <h3>Datos cargados</h3>
            {["Categoria_nuevo", "Matricula_Nuevo", "Marca_modelo_Nuevo", "Matriculacion_Nuevo", "Fecha Compra", "Cilindrada_Nuevo", "Potencia_Nuevo", "Combustible_Motorizacion_Nuevo", "Tipo_Cambio_Nuevo", "Carroceria_Nuevo", "Observaciones_Nuevo"].map((key) => (
              <p key={key}><span>{key}</span>{item.input[key] || "-"}</p>
            ))}
          </div>
          <div>
            <h3>Match IDAE asignado</h3>
            <p><span>ID IDAE</span>{item.assigned?.id_idae || "-"}</p>
            <p><span>Modelo IDAE</span>{item.assigned?.modeloOriginal || "-"}</p>
            <p><span>Titulo modal</span>{item.assigned?.raw?.titulo_modal || "-"}</p>
            <p><span>Segmento</span>{detail["Segmento comercial"] || "-"}</p>
            <p><span>Motorizacion</span>{item.assigned?.motorizacion || "-"}</p>
            <p><span>Cilindrada</span>{detail.Cilindrada || item.assigned?.cilindradaCc || "-"}</p>
            <p><span>Potencia</span>{detail.Potencia || item.assigned?.potenciaCv || "-"}</p>
            <p><span>Potencia electrica</span>{item.assigned?.potenciaElectricaKw || "-"}</p>
            <p><span>Tipo de cambio</span>{item.assigned?.tipoCambio || "-"}</p>
            <p><span>Consumo</span>{item.assigned?.consumoElectricoKwh100 || item.assigned?.consumoLitros100 || "-"}</p>
            <p><span>Source URL</span>{item.assigned?.source_url || "-"}</p>
          </div>
        </div>
        <h3>Explicacion del match</h3>
        <p className="explain">{item.explicacion_match}</p>
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
            matchedFeatures: item.matched_features || item.assigned?.matchedFeatures,
            penalties: item.penalties || item.assigned?.penalties,
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
