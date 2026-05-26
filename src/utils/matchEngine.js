import { normalizeIdaeVehicle, featuresFromUser } from "./extractVehicleFeatures.js";
import { tokenSimilarity } from "./normalize.js";

export const MATCH_STATES = {
  exacto: "Match exacto",
  probable: "Match probable",
  conflicto: "Conflicto",
  sinMatch: "Sin match",
  noEncontrado: "Vehiculo no encontrado en DB"
};

export const MATCH_MEANINGS = {
  [MATCH_STATES.exacto]: "Coincidencia muy alta. El sistema encontro un modelo IDAE compatible con los datos cargados.",
  [MATCH_STATES.probable]: "Coincidencia alta, pero falta algun dato o existe alguna diferencia menor. Se recomienda revision rapida.",
  [MATCH_STATES.conflicto]: "Hay varios modelos IDAE parecidos y no es seguro cual corresponde. El usuario debe seleccionar el modelo correcto.",
  [MATCH_STATES.sinMatch]: "No se encontro un modelo razonablemente compatible en la DB IDAE.",
  [MATCH_STATES.noEncontrado]: "El usuario confirma que no localizo el vehiculo en la DB IDAE."
};

export function buildSearchIndex(db) {
  return (db || []).map(normalizeIdaeVehicle);
}

function compareValue(user, db, tolerance, label, weight, explanation) {
  if (!user || !db) return weight * 0.45;
  const diff = Math.abs(Number(user) - Number(db));
  if (diff <= tolerance) {
    explanation.push(`${label} compatible (${user} frente a ${db}).`);
    return weight;
  }
  explanation.push(`${label} distinto (${user} frente a ${db}).`);
  return 0;
}

export function scoreCandidate(row, candidate) {
  const user = featuresFromUser(row);
  const explanation = [];
  const modelScore = tokenSimilarity(user.modeloNormalizado, candidate.modeloNormalizado);
  const brandOk = !user.marca || !candidate.marcaDetectada || user.marca === candidate.marcaDetectada;
  let score = (brandOk ? modelScore : modelScore * 0.35) * 35;
  if (brandOk && modelScore > 0.25) explanation.push(`Coincide razonablemente en marca/modelo con ${candidate.modeloOriginal}.`);
  if (!brandOk) explanation.push(`La marca detectada no coincide (${user.marca || "sin dato"} frente a ${candidate.marcaDetectada}).`);

  score += compareValue(user.yearMY, candidate.yearMY, 1, "Ano/MY", 20, explanation);
  score += compareValue(user.cilindradaCc, candidate.cilindradaCc, 80, "Cilindrada", 15, explanation);

  if (!user.motorizacion || !candidate.motorizacion) score += 6;
  else if (user.motorizacion === candidate.motorizacion || candidate.motorizacion.includes(user.motorizacion)) {
    score += 15;
    explanation.push(`Motorizacion compatible (${candidate.motorizacion}).`);
  } else {
    explanation.push(`Motorizacion diferente (${user.motorizacion} frente a ${candidate.motorizacion}).`);
  }

  score += compareValue(user.potenciaCv, candidate.potenciaCv, 12, "Potencia", 8, explanation);

  if (!user.carroceria || !candidate.carroceriaDetectada) score += 3;
  else if (user.carroceria === candidate.carroceriaDetectada) {
    score += 7;
    explanation.push(`Carroceria compatible (${candidate.carroceriaDetectada}).`);
  }
  if (user.tipoCambio && candidate.tipoCambio && user.tipoCambio !== candidate.tipoCambio) {
    score -= 8;
    explanation.push(`Tipo de cambio diferente (${user.tipoCambio} frente a ${candidate.tipoCambio}).`);
  }
  if (!brandOk && modelScore < 0.35) score = Math.min(score, 45);
  if (user.cilindradaCc && candidate.cilindradaCc && Math.abs(user.cilindradaCc - candidate.cilindradaCc) > 250) score -= 18;
  return {
    ...candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    explicacion: explanation.join(" ") || "No hay suficientes datos tecnicos para explicar una coincidencia fuerte."
  };
}

export function matchRows(rows, index) {
  return rows.map((row, rowIndex) => {
    const candidates = index
      .map((candidate) => scoreCandidate(row, candidate))
      .filter((candidate) => candidate.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const best = candidates[0] || null;
    const closeConflict = candidates[1] && best && best.score - candidates[1].score <= 5;
    let estado = MATCH_STATES.sinMatch;
    if (best?.score >= 90 && !closeConflict) estado = MATCH_STATES.exacto;
    else if (best?.score >= 75 && !closeConflict) estado = MATCH_STATES.probable;
    else if (best?.score >= 50 || closeConflict) estado = MATCH_STATES.conflicto;
    return {
      id: `${row.Matricula_Nuevo || "fila"}-${rowIndex}`,
      rowIndex,
      input: row,
      candidates,
      assigned: best,
      match_estado: estado,
      match_score: best?.score || 0,
      match_significado: MATCH_MEANINGS[estado],
      explicacion_match: best?.explicacion || MATCH_MEANINGS[estado],
      conflictos_detectados: closeConflict ? "Candidatos con puntuacion muy cercana." : "",
      match_manual: false,
      vehiculo_no_encontrado_db: false,
      reference: null,
      notes: ""
    };
  });
}
