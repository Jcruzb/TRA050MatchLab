import {
  buildBrandIndex,
  featuresFromUser,
  isRelevantSearchToken,
  normalizeIdaeVehicle
} from "./extractVehicleFeatures.js";
import { normalizeText, tokenSimilarity } from "./normalize.js";
import { applyLearningRules } from "../engine/vehicleLearning.js";
import { explainableVectorScore } from "../engine/vehicleScoring.js";

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

const MATCH_CHUNK_SIZE = 75;

function addToSetIndex(index, key, value) {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(value);
}

function buildModelBrandIndex(vehicles) {
  const index = new Map();
  vehicles.forEach((vehicle) => {
    if (!vehicle.modelBase || !vehicle.marcaDetectada) return;
    if (!index.has(vehicle.modelBase)) index.set(vehicle.modelBase, { brands: new Map(), total: 0 });
    const entry = index.get(vehicle.modelBase);
    entry.total += 1;
    entry.brands.set(vehicle.marcaDetectada, (entry.brands.get(vehicle.marcaDetectada) || 0) + 1);
  });
  return index;
}

function buildTokenIndexes(vehicles) {
  const modelTokenIndex = new Map();
  const normalizedTextTokenIndex = new Map();
  vehicles.forEach((vehicle, arrayIndex) => {
    const tokens = new Set([vehicle.modelBase, ...(vehicle.modelTokens || [])].filter(Boolean));
    tokens.forEach((token) => addToSetIndex(modelTokenIndex, token, arrayIndex));
    new Set(vehicle.searchableTokens || []).forEach((token) => addToSetIndex(normalizedTextTokenIndex, token, arrayIndex));
  });
  return { modelTokenIndex, normalizedTextTokenIndex };
}

export function buildSearchIndex(db) {
  const brandIndex = buildBrandIndex(db);
  const vehicles = (db || []).map((vehicle) => normalizeIdaeVehicle(vehicle, brandIndex));
  const modelBrandIndex = buildModelBrandIndex(vehicles);
  const { modelTokenIndex, normalizedTextTokenIndex } = buildTokenIndexes(vehicles);
  vehicles.brandIndex = brandIndex;
  vehicles.modelBrandIndex = modelBrandIndex;
  vehicles.modelTokenIndex = modelTokenIndex;
  vehicles.normalizedTextTokenIndex = normalizedTextTokenIndex;
  vehicles.candidateCache = new Map();
  return vehicles;
}

function sameModel(userModel, candidateModel) {
  if (!userModel || !candidateModel) return false;
  return userModel === candidateModel;
}

function containsModel(userModel, candidate) {
  if (!userModel) return true;
  return sameModel(userModel, candidate.modelBase) || candidate.modelTokens?.includes(userModel) || candidate.modeloNormalizado.includes(userModel);
}

function fromIndex(indexedDb, set) {
  return [...(set || [])].map((arrayIndex) => indexedDb[arrayIndex]).filter(Boolean);
}

export function searchDbByTokens(userFeatures, indexedDb) {
  const tokenScores = new Map();
  const tokens = userFeatures.modelTokens.filter((token, index) => isRelevantSearchToken(token, index, userFeatures.modelTokens));
  tokens.forEach((token) => {
    const modelHits = indexedDb.modelTokenIndex.get(token);
    const textHits = indexedDb.normalizedTextTokenIndex.get(token);
    fromIndex(indexedDb, modelHits).forEach((candidate) => {
      tokenScores.set(candidate, (tokenScores.get(candidate) || 0) + (token === userFeatures.modelBase ? 8 : 5));
    });
    fromIndex(indexedDb, textHits).forEach((candidate) => {
      tokenScores.set(candidate, (tokenScores.get(candidate) || 0) + 1);
    });
  });
  return [...tokenScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300)
    .map(([candidate, tokenScore]) => ({ ...candidate, tokenSearchScore: tokenScore }));
}

export function getCandidatePool(userFeatures, indexedDb) {
  const debug = {
    rawInput: userFeatures.rawText,
    normalizedTokens: userFeatures.modelTokens,
    inferredBrand: userFeatures.brand,
    brandConfidence: userFeatures.brandConfidence,
    modelBase: userFeatures.modelBase,
    year: userFeatures.year,
    rejectedModelTokens: userFeatures.rejectedModelTokens,
    candidateRetrievalPhase: "",
    candidatesBeforeHardGates: 0,
    candidatesAfterHardGates: 0,
    discardedByBrand: [],
    discardedByModel: [],
    candidatePoolSizeBeforeBrandFilter: indexedDb.length,
    candidatePoolSizeAfterBrandFilter: indexedDb.length,
    candidatePoolSizeAfterModelFilter: indexedDb.length,
    searchExpanded: false,
    warning: "",
    topDiscardedCandidates: [],
    topCandidates: []
  };

  const brandPool = userFeatures.brand ? indexedDb.filter((candidate) => candidate.marcaDetectada === userFeatures.brand) : indexedDb;
  debug.candidatePoolSizeAfterBrandFilter = brandPool.length;

  let pool = [];
  if (userFeatures.brand && userFeatures.modelBase) {
    pool = brandPool.filter((candidate) => containsModel(userFeatures.modelBase, candidate));
    debug.candidateRetrievalPhase = "phase_1_brand_model";
  }
  if (!pool.length && userFeatures.modelBase) {
    pool = indexedDb.filter((candidate) => containsModel(userFeatures.modelBase, candidate));
    debug.candidateRetrievalPhase = "phase_2_model_first";
  }
  if (!pool.length) {
    pool = searchDbByTokens(userFeatures, indexedDb);
    debug.candidateRetrievalPhase = "phase_3_token_search";
  }
  if (!pool.length && userFeatures.brand) {
    pool = brandPool;
    debug.candidateRetrievalPhase = "phase_4_brand_only";
  }
  if (!pool.length) {
    debug.searchExpanded = true;
    debug.candidateRetrievalPhase = "phase_5_controlled_fallback";
    debug.warning = "No se encontraron candidatos claros por marca/modelo. Usa la busqueda manual global o marca el vehiculo como no encontrado.";
    return { pool: [], debug };
  }

  debug.candidatesBeforeHardGates = pool.length;
  const gated = pool.filter((candidate) => {
    if (userFeatures.brand && candidate.marcaDetectada && userFeatures.brand !== candidate.marcaDetectada) {
      debug.discardedByBrand.push({ id_idae: candidate.id_idae, modeloOriginal: candidate.modeloOriginal, brand: candidate.marcaDetectada });
      return false;
    }
    if (userFeatures.modelBase && !containsModel(userFeatures.modelBase, candidate)) {
      debug.discardedByModel.push({ id_idae: candidate.id_idae, modeloOriginal: candidate.modeloOriginal, modelBase: candidate.modelBase });
      return false;
    }
    return true;
  });
  debug.candidatesAfterHardGates = gated.length;
  debug.candidatePoolSizeAfterModelFilter = gated.length;
  if (!gated.length) {
    debug.searchExpanded = true;
    debug.warning = `Se detecto ${userFeatures.brand || "marca no detectada"} ${userFeatures.modelBase || ""}, pero los candidatos amplios fueron descartados por marca/modelo incompatible.`;
  }
  return { pool: gated, debug };
}

function compareValue(user, db, tolerance, label, weight, explanation) {
  if (!user || !db) return weight * 0.25;
  const diff = Math.abs(Number(user) - Number(db));
  if (diff <= tolerance) {
    explanation.push(`${label} compatible (${user} frente a ${db}).`);
    return weight;
  }
  explanation.push(`${label} distinto (${user} frente a ${db}).`);
  return 0;
}

export function scoreCandidate(user, candidate) {
  const explanation = [];
  const vector = explainableVectorScore(user, candidate);
  let score = 0;
  let excludeFromNormalCandidates = false;
  const brandOk = !user.brand || !candidate.marcaDetectada || user.brand === candidate.marcaDetectada;
  const modelOk = !user.modelBase || containsModel(user.modelBase, candidate);

  if (brandOk && user.brand) {
    score += 30;
    explanation.push(`Marca compatible (${user.brand}, confianza ${user.brandConfidence}).`);
  } else if (!user.brand) {
    score += 5;
    explanation.push("No se pudo detectar marca; el ano no puede dominar el matching.");
  } else {
    explanation.push(`Marca incompatible: ${user.brand} frente a ${candidate.marcaDetectada || "sin dato"}.`);
  }

  if (modelOk && user.modelBase) {
    score += 35;
    explanation.push(`Modelo base compatible (${user.modelBase}).`);
  } else if (!user.modelBase) {
    score += Math.round(tokenSimilarity(user.normalizedText, candidate.modeloNormalizado) * 10);
  } else {
    explanation.push(`Modelo base incompatible: ${user.modelBase} frente a ${candidate.modelBase || "sin dato"}.`);
  }

  if (!user.motorizacion || !candidate.motorizacion) score += 3;
  else if (user.motorizacion === candidate.motorizacion || candidate.motorizacion.includes(user.motorizacion)) {
    score += 10;
    explanation.push(`Motorizacion compatible (${candidate.motorizacion}).`);
  }
  score += compareValue(user.year, candidate.yearMY, 1, "Ano/MY", 10, explanation);
  score += compareValue(user.cilindradaCc, candidate.cilindradaCc, 80, "Cilindrada", 7, explanation);
  if (!user.tipoCambio || !candidate.tipoCambio) score += 1;
  else if (user.tipoCambio === candidate.tipoCambio) {
    score += 5;
    explanation.push(`Cambio compatible (${candidate.tipoCambio}).`);
  }
  if (!user.carroceria || !candidate.carroceriaDetectada) score += 1;
  else if (user.carroceria === candidate.carroceriaDetectada) score += 3;

  if (user.expectedPowertrain === "electric" && candidate.motorizacion && candidate.motorizacion !== "electrico puro") {
    score -= 22;
    explanation.push("Penalizado: este dataset espera vehículo eléctrico puro y el candidato no lo parece.");
  }
  if (user.expectedPowertrain === "thermal_or_hybrid" && candidate.motorizacion === "electrico puro") {
    score -= 22;
    explanation.push("Penalizado: este dataset espera vehículo vendido térmico/híbrido y el candidato parece eléctrico puro.");
  }

  if (user.brand && candidate.marcaDetectada && user.brand !== candidate.marcaDetectada) {
    score = Math.min(score, 25);
    excludeFromNormalCandidates = true;
  }
  if (user.modelBase && candidate.modelBase && !modelOk) score = Math.min(score, 45);
  if (user.modelBase && candidate.modeloNormalizado && !candidate.modeloNormalizado.includes(user.modelBase)) score = Math.min(score, 45);
  if (!brandOk && !modelOk && user.year && candidate.yearMY) score = Math.min(score, 25);

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    excludeFromNormalCandidates,
    matchedFeatures: vector.matchedFeatures,
    penalties: vector.rejectedFeatures,
    explicacion: explanation.join(" ")
  };
}

function brandExplanation(user) {
  if (user.brandConfidence === "inferred_prefix") return `Se detecto ${user.brand} por aproximacion del texto "${user.matchedAlias}".`;
  if (user.brandConfidence === "inferred_from_alias_and_model") return `Se detecto ${user.brand} por alias/modelo "${user.matchedAlias}".`;
  if (user.brandConfidence === "inferred_from_model") return `Se detecto ${user.brand} por coincidencia del modelo ${user.modelBase} en la base IDAE.`;
  return user.brand ? `Se detecto marca ${user.brand}.` : "No se pudo detectar marca con confianza.";
}

function buildHumanExplanation(user, candidates, poolDebug, estado) {
  if (!candidates.length) {
    return `${brandExplanation(user)} Modelo base ${user.modelBase || "no detectado"}. No se encontraron candidatos suficientes; usa busqueda manual global o marca no encontrado.`;
  }
  if (poolDebug.candidateRetrievalPhase === "phase_3_token_search") {
    return `Se buscaron tokens individuales del texto cargado. El token "${user.modelBase || user.modelTokens[0]}" coincide con modelos de la DB IDAE, por lo que se priorizaron esos candidatos.`;
  }
  if (estado === MATCH_STATES.conflicto) {
    return `${brandExplanation(user)} Se detecto modelo base ${user.modelBase || "sin modelo"}. Hay varios modelos similares en la base IDAE, por lo que se requiere seleccion manual.`;
  }
  return `${brandExplanation(user)} Se detecto modelo base ${user.modelBase || "sin modelo"}. El candidato pertenece a la misma familia.`;
}

export function buildInputSignature(row) {
  return normalizeText([
    row.Marca_modelo_Nuevo,
    row.Version_Acabado_Nuevo,
    row.Cilindrada_Nuevo,
    row.Combustible_Motorizacion_Nuevo,
    row.Potencia_Nuevo,
    row.Tipo_Cambio_Nuevo,
    row.Carroceria_Nuevo,
    row.Anio_Modelo_MY_Nuevo,
    row.Matriculacion_Nuevo
  ].filter(Boolean).join(" "));
}

function cloneMatchForRow(cached, row, rowIndex) {
  return {
    ...cached,
    id: `${row.Matricula_Nuevo || "fila"}-${rowIndex}`,
    rowIndex,
    input: row
  };
}

export function matchVehicle(row, rowIndex, index, learningRules = []) {
  const userFeatures = featuresFromUser(row, index.brandIndex, index.modelBrandIndex);
  const learned = applyLearningRules(userFeatures, learningRules);
  if (learned) {
    const candidate = index.find((entry) => entry.id_idae === learned.selectedIdIdae);
    if (candidate) {
      return {
        id: `${row.Matricula_Nuevo || "fila"}-${rowIndex}`,
        rowIndex,
        input: row,
        userFeatures,
        matchDebug: {
          rawInput: userFeatures.rawText,
          normalizedTokens: userFeatures.modelTokens,
          inferredBrand: userFeatures.brand,
          brandConfidence: userFeatures.brandConfidence,
          modelBase: userFeatures.modelBase,
          year: userFeatures.year,
          learningRuleApplied: learned.id,
          topCandidates: [{ id_idae: candidate.id_idae, modeloOriginal: candidate.modeloOriginal, score: 100 }]
        },
        candidates: [{ ...candidate, score: 100, explicacion: "Coincidencia aplicada por aprendizaje local." }],
        assigned: candidate,
        match_estado: MATCH_STATES.exacto,
        match_score: 100,
        match_significado: MATCH_MEANINGS[MATCH_STATES.exacto],
        explicacion_match: "Coincidencia aplicada por aprendizaje local: este patron fue resuelto anteriormente por el usuario.",
        conflictos_detectados: "",
        match_manual: false,
        vehiculo_no_encontrado_db: false,
        learning_rule_applied: true,
        learning_rule_id: learned.id,
        reference: null,
        notes: ""
      };
    }
  }
  const { pool, debug } = getCandidatePool(userFeatures, index);
  const candidates = pool
    .map((candidate) => scoreCandidate(userFeatures, candidate))
    .filter((candidate) => candidate.score >= 45 && !candidate.excludeFromNormalCandidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  debug.topCandidates = candidates.map((candidate) => ({
    id_idae: candidate.id_idae,
    modeloOriginal: candidate.modeloOriginal,
    brand: candidate.marcaDetectada,
    modelBase: candidate.modelBase,
    score: candidate.score
  }));

  const best = candidates[0] || null;
  const closeConflict = candidates[1] && best && best.score - candidates[1].score <= 5;
  let estado = MATCH_STATES.sinMatch;
  if (best?.score >= 90 && !closeConflict) estado = MATCH_STATES.exacto;
  else if (best?.score >= 75 && !closeConflict) estado = MATCH_STATES.probable;
  else if (best?.score >= 50 || closeConflict) estado = MATCH_STATES.conflicto;

  const explicacion = buildHumanExplanation(userFeatures, candidates, debug, estado);
  return {
    id: `${row.Matricula_Nuevo || "fila"}-${rowIndex}`,
    rowIndex,
    input: row,
    userFeatures,
    matchDebug: debug,
    candidates,
    assigned: best,
    match_estado: estado,
    match_score: best?.score || 0,
    match_significado: MATCH_MEANINGS[estado],
    explicacion_match: best ? `${explicacion} ${best.explicacion}` : explicacion,
    conflictos_detectados: debug.warning || (closeConflict ? "Candidatos con puntuacion muy cercana dentro de la misma familia." : ""),
    match_manual: false,
    vehiculo_no_encontrado_db: false,
    matched_features: best?.matchedFeatures?.join(", ") || "",
    penalties: best?.penalties?.join(", ") || "",
    learning_rule_applied: false,
    learning_rule_id: "",
    reference: null,
    notes: ""
  };
}

export function matchVehicleWithCache(row, rowIndex, index, learningRules = []) {
  const key = buildInputSignature(row);
  if (index.candidateCache.has(key)) return cloneMatchForRow(index.candidateCache.get(key), row, rowIndex);
  const result = matchVehicle(row, rowIndex, index, learningRules);
  index.candidateCache.set(key, { ...result, input: null, id: "cached", rowIndex: -1 });
  return result;
}

export function matchRows(rows, index, learningRules = []) {
  return rows.map((row, rowIndex) => matchVehicleWithCache(row, rowIndex, index, learningRules));
}

export async function matchRowsInChunks(rows, index, onProgress, signal, learningRules = []) {
  const results = [];
  const chunkSize = rows.length > 3000 ? 25 : MATCH_CHUNK_SIZE;
  for (let i = 0; i < rows.length; i += chunkSize) {
    if (signal?.cancelled) throw new Error("Procesamiento cancelado por el usuario.");
    const chunk = rows.slice(i, i + chunkSize);
    results.push(...chunk.map((row, offset) => matchVehicleWithCache(row, i + offset, index, learningRules)));
    const processed = Math.min(i + chunk.length, rows.length);
    onProgress?.({
      stage: "Ejecutando matching",
      processed,
      total: rows.length,
      percent: Math.round((processed / rows.length) * 100)
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}
