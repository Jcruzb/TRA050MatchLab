import { isSaleInTra050Window, formatDate, parseOperationDate } from "./tra050Dates.js";
import { calculateTra050Savings, getVehicleConsumptionForTra050 } from "./tra050Savings.js";

function v(item, field) {
  return item?.input?.[field] || item?.[field] || "";
}

export function normalizeDatasetType(value) {
  if (value === "soldThermal") return "sold_thermal";
  if (value === "purchasedElectric") return "purchased_electric";
  return value || "";
}

export function getVehicleCategory(vehicle) {
  return String(v(vehicle, "categoria") || v(vehicle, "Categoria_nuevo") || v(vehicle, "Categoria_vendido") || "").trim();
}

export function getOperationDateValue(vehicle, datasetType = normalizeDatasetType(vehicle?.dataset_type || vehicle?.input?.dataset_type)) {
  if (datasetType === "sold_thermal") {
    return v(vehicle, "fecha_venta") || v(vehicle, "fecha_operacion") || v(vehicle, "Fecha Venta") || v(vehicle, "Fecha Compra");
  }
  return v(vehicle, "fecha_compra") || v(vehicle, "fecha_operacion") || v(vehicle, "Fecha Compra");
}

function getMatricula(vehicle) {
  return v(vehicle, "matricula") || v(vehicle, "Matricula_Nuevo") || v(vehicle, "Matricula_Vendido");
}

function getModelo(vehicle) {
  return v(vehicle, "marca_modelo") || v(vehicle, "Marca_modelo_Nuevo") || v(vehicle, "Marca_modelo_Vendido");
}

function isResolvedForPairing(vehicle) {
  const state = String(vehicle.match_estado || "").toLowerCase();
  return Boolean(
    vehicle.vehiculo_no_encontrado_db ||
    vehicle.assigned?.id_idae ||
    vehicle.id_idae_asignado ||
    state.includes("match exacto") ||
    state.includes("match probable") ||
    state.includes("manual")
  );
}

export function isVehicleEligibleForPairing(vehicle, datasetType) {
  const normalizedType = normalizeDatasetType(datasetType || vehicle.dataset_type || vehicle.input?.dataset_type);
  const reasons = [];
  const category = getVehicleCategory(vehicle);
  const operationDate = getOperationDateValue(vehicle, normalizedType);
  const parsedOperationDate = parseOperationDate(operationDate);
  const consumption = getVehicleConsumptionForTra050(vehicle, normalizedType);

  if (!category) reasons.push("sin_categoria");
  if (!parsedOperationDate) reasons.push(normalizedType === "sold_thermal" ? "fecha_venta_invalida" : "fecha_compra_invalida");
  if (!consumption.is_valid) reasons.push(consumption.reason || "sin_consumo_valido");
  if (!isResolvedForPairing(vehicle)) reasons.push("matching_idae_no_resuelto");
  if (vehicle.pair_locked && vehicle.match_pair_id) reasons.push("ya_bloqueado_en_pareja");

  return {
    eligible: reasons.length === 0,
    reasons,
    normalized: {
      dataset_type: normalizedType,
      category,
      operationDate,
      parsedOperationDate: formatDate(parsedOperationDate),
      consumption,
      matricula: getMatricula(vehicle),
      marca_modelo: getModelo(vehicle)
    }
  };
}

export function prepareVehiclesForPairing(soldRows = [], purchasedRows = []) {
  const warnings = [];
  function split(rows, type) {
    const eligible = [];
    const ineligible = [];
    rows.forEach((row) => {
      const check = isVehicleEligibleForPairing(row, type);
      const entry = { ...row, pairing_ineligible_reasons: check.reasons, pairing_debug: check.normalized };
      (check.eligible ? eligible : ineligible).push(entry);
      check.reasons.forEach((message) => warnings.push({ dataset_type: type, matricula: check.normalized.matricula, message, detail: check.normalized.marca_modelo }));
    });
    return { eligible, ineligible };
  }
  const sold = split(soldRows, "sold_thermal");
  const purchased = split(purchasedRows, "purchased_electric");
  return {
    eligibleSold: sold.eligible,
    eligiblePurchased: purchased.eligible,
    ineligibleSold: sold.ineligible,
    ineligiblePurchased: purchased.ineligible,
    warnings,
    debug: {
      soldProcessed: soldRows.length,
      purchasedProcessed: purchasedRows.length,
      soldEligible: sold.eligible.length,
      purchasedEligible: purchased.eligible.length,
      soldIneligible: sold.ineligible.length,
      purchasedIneligible: purchased.ineligible.length
    }
  };
}

export function buildPairingCandidates(eligibleSold, eligiblePurchased) {
  const candidates = [];
  const purchasedByCategory = new Map();
  eligiblePurchased.forEach((item) => {
    const cat = getVehicleCategory(item);
    if (!purchasedByCategory.has(cat)) purchasedByCategory.set(cat, []);
    purchasedByCategory.get(cat).push(item);
  });
  eligibleSold.forEach((sold) => {
    const cat = getVehicleCategory(sold);
    (purchasedByCategory.get(cat) || []).forEach((purchased) => {
      const window = isSaleInTra050Window(getOperationDateValue(sold, "sold_thermal"), getOperationDateValue(purchased, "purchased_electric"));
      if (!window.valid) return;
      const savings = calculateTra050Savings(sold, purchased);
      if (!savings.is_valid || savings.ahorro_kwh_100km === null) return;
      const referencePenalty = (savings.consumo_termico_origen === "tra050_reference" ? 1 : 0) + (savings.consumo_electrico_origen === "tra050_reference" ? 1 : 0);
      const dateBonus = Math.max(0, 3 - Math.abs(window.daysBetween || 0) / 60);
      candidates.push({
        candidate_id: `${sold.id}__${purchased.id}`,
        sold_row_id: sold.id,
        purchased_row_id: purchased.id,
        sold_matricula: getMatricula(sold),
        purchased_matricula: getMatricula(purchased),
        categoria: cat,
        fecha_venta: formatDate(window.saleDate),
        fecha_compra: formatDate(window.purchaseDate),
        date_window_valid: true,
        days_between: window.daysBetween,
        savings,
        score: savings.ahorro_kwh_100km + dateBonus - referencePenalty,
        warnings: savings.warnings,
        explanation: savings.explanation
      });
    });
  });
  return candidates.sort((a, b) => b.score - a.score);
}

export function autoPairVehicles(candidates, options = {}) {
  const usedSold = new Set(options.lockedPairs?.map((pair) => pair.sold_row_id) || []);
  const usedPurchased = new Set(options.lockedPairs?.map((pair) => pair.purchased_row_id) || []);
  const pairs = [...(options.lockedPairs || [])];
  candidates.forEach((candidate) => {
    if (usedSold.has(candidate.sold_row_id) || usedPurchased.has(candidate.purchased_row_id)) return;
    usedSold.add(candidate.sold_row_id);
    usedPurchased.add(candidate.purchased_row_id);
    pairs.push(candidateToPair(candidate, pairs.length + 1, "auto_paired"));
  });
  return pairs.map((pair, index) => ({ ...pair, match_pair_id: pair.match_pair_id || `PAIR-${String(index + 1).padStart(6, "0")}` }));
}

export function candidateToPair(candidate, index, status = "auto_paired") {
  return {
    match_pair_id: `PAIR-${String(index).padStart(6, "0")}`,
    sold_row_id: candidate.sold_row_id,
    purchased_row_id: candidate.purchased_row_id,
    sold_matricula: candidate.sold_matricula,
    purchased_matricula: candidate.purchased_matricula,
    categoria: candidate.categoria,
    fecha_venta: candidate.fecha_venta,
    fecha_compra: candidate.fecha_compra,
    days_between: candidate.days_between,
    ahorro_kwh_100km: candidate.savings.ahorro_kwh_100km,
    consumo_termico_kwh_100km: candidate.savings.consumo_termico_kwh_100km,
    consumo_electrico_kwh_100km: candidate.savings.consumo_electrico_kwh_100km,
    factor_conversion_usado: candidate.savings.factor_conversion_usado,
    consumo_termico_origen: candidate.savings.consumo_termico_origen,
    consumo_electrico_origen: candidate.savings.consumo_electrico_origen,
    pair_status: status,
    pair_locked: false,
    pair_manual_override: status === "manual_paired",
    warnings: candidate.warnings,
    explanation: candidate.explanation
  };
}

export function validatePairingIntegrity(pairs) {
  const errors = [];
  const sold = new Set();
  const purchased = new Set();
  const ids = new Set();
  pairs.forEach((pair) => {
    if (sold.has(pair.sold_row_id)) errors.push(`Vendido repetido en ${pair.match_pair_id}.`);
    if (purchased.has(pair.purchased_row_id)) errors.push(`Comprado repetido en ${pair.match_pair_id}.`);
    if (ids.has(pair.match_pair_id)) errors.push(`ID de pareja duplicado ${pair.match_pair_id}.`);
    if (pair.ahorro_kwh_100km === null || pair.ahorro_kwh_100km === undefined) errors.push(`Pareja ${pair.match_pair_id} sin ahorro calculado.`);
    sold.add(pair.sold_row_id);
    purchased.add(pair.purchased_row_id);
    ids.add(pair.match_pair_id);
  });
  return { ok: errors.length === 0, errors };
}

export function applyPairsToDatasets(datasets, pairs) {
  const bySold = new Map(pairs.map((pair) => [pair.sold_row_id, pair]));
  const byPurchased = new Map(pairs.map((pair) => [pair.purchased_row_id, pair]));
  const update = (items, map, unpairedStatus) => items.map((item) => {
    const pair = map.get(item.id);
    return pair ? { ...item, match_pair_id: pair.match_pair_id, pair_status: pair.pair_status, pair_locked: pair.pair_locked, pair_manual_override: pair.pair_manual_override } : { ...item, match_pair_id: null, pair_status: unpairedStatus };
  });
  return {
    ...datasets,
    soldThermal: { ...datasets.soldThermal, matchResults: update(datasets.soldThermal.matchResults || [], bySold, "unpaired_sold") },
    purchasedElectric: { ...datasets.purchasedElectric, matchResults: update(datasets.purchasedElectric.matchResults || [], byPurchased, "unpaired_purchased") }
  };
}
