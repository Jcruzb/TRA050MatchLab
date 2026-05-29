import { addMonths, isSaleInTra050Window, formatDate, parseOperationDate } from "./tra050Dates.js";
import { calculateTra050AnnualSaving, getAnnualMileageForTra050, getVehicleConsumptionForTra050 } from "./tra050Savings.js";

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

function reasonLabel(reason) {
  const labels = {
    no_same_category_counterpart: "No tiene contraparte de la misma categoria.",
    no_valid_date_window: "Todas las contrapartes estan fuera de ventana temporal.",
    missing_consumption: "Falta consumo valido para calcular ahorro.",
    missing_annual_mileage: "Falta kilometraje promedio anual L.",
    not_selected_by_optimization: "Fue sobrante por regla de uso unico y optimizacion.",
    already_used_by_higher_saving_pair: "La mejor alternativa ya estaba asignada a otra pareja de mayor ahorro."
  };
  return labels[reason] || reason || "";
}

export function validatePairCategory(soldVehicle, purchasedVehicle) {
  const soldCategory = getVehicleCategory(soldVehicle);
  const purchasedCategory = getVehicleCategory(purchasedVehicle);
  const valid = Boolean(soldCategory && purchasedCategory && soldCategory === purchasedCategory);
  return {
    valid,
    soldCategory,
    purchasedCategory,
    explanation: valid
      ? `Categoria compatible: ${soldCategory} = ${purchasedCategory}`
      : `Categoria no compatible: ${soldCategory || "sin categoria"} frente a ${purchasedCategory || "sin categoria"}`
  };
}

export function validatePairDateWindow(soldVehicle, purchasedVehicle) {
  const saleDate = parseOperationDate(getOperationDateValue(soldVehicle, "sold_thermal"));
  const purchaseDate = parseOperationDate(getOperationDateValue(purchasedVehicle, "purchased_electric"));
  if (!saleDate || !purchaseDate) {
    return {
      valid: false,
      saleDate: formatDate(saleDate),
      purchaseDate: formatDate(purchaseDate),
      windowStart: "",
      windowEnd: "",
      daysBetween: null,
      monthsBeforeOrAfter: null,
      explanation: "No se puede evaluar la ventana temporal porque falta una fecha valida."
    };
  }
  const windowStart = addMonths(purchaseDate, -3);
  const windowEnd = addMonths(purchaseDate, 6);
  const window = isSaleInTra050Window(saleDate, purchaseDate);
  const monthsBeforeOrAfter = Number((window.daysBetween / 30.4375).toFixed(2));
  let explanation = "La venta del termico esta dentro del intervalo permitido: entre 3 meses antes y 6 meses despues de la compra del electrico.";
  if (!window.valid && saleDate < windowStart) explanation = `La venta del termico queda fuera de la ventana permitida. La fecha minima aceptada era ${formatDate(windowStart)}.`;
  if (!window.valid && saleDate > windowEnd) explanation = `La venta del termico queda fuera de la ventana permitida. La fecha maxima aceptada era ${formatDate(windowEnd)}.`;
  return {
    valid: window.valid,
    saleDate: formatDate(saleDate),
    purchaseDate: formatDate(purchaseDate),
    windowStart: formatDate(windowStart),
    windowEnd: formatDate(windowEnd),
    daysBetween: window.daysBetween,
    monthsBeforeOrAfter,
    explanation
  };
}

function buildSavingCheck(savings) {
  return {
    valid: savings.is_valid,
    ahorro_kwh_year: savings.ahorro_kwh_year,
    ahorro_kwh_100km: savings.ahorro_kwh_100km,
    explanation: savings.explanation,
    warnings: savings.warnings,
    errors: savings.errors
  };
}

function candidateEligibilityExplanation(categoryCheck, dateWindowCheck, savingCheck) {
  if (!categoryCheck.valid) return categoryCheck.explanation;
  if (!dateWindowCheck.valid) return dateWindowCheck.explanation;
  if (!savingCheck.valid) return savingCheck.explanation;
  return "Candidato elegible: cumple categoria, ventana temporal y ahorro calculado.";
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

export function isVehicleEligibleForPairing(vehicle, datasetType, options = {}) {
  const normalizedType = normalizeDatasetType(datasetType || vehicle.dataset_type || vehicle.input?.dataset_type);
  const reasons = [];
  const category = getVehicleCategory(vehicle);
  const operationDate = getOperationDateValue(vehicle, normalizedType);
  const parsedOperationDate = parseOperationDate(operationDate);
  const consumption = getVehicleConsumptionForTra050(vehicle, normalizedType);
  const annualMileage = normalizedType === "sold_thermal" ? getAnnualMileageForTra050(vehicle, options) : null;

  if (!category) reasons.push("sin_categoria");
  if (!parsedOperationDate) reasons.push(normalizedType === "sold_thermal" ? "fecha_venta_invalida" : "fecha_compra_invalida");
  if (!consumption.is_valid) reasons.push(consumption.reason || "sin_consumo_valido");
  if (normalizedType === "sold_thermal" && annualMileage?.value === null) reasons.push("falta_kilometraje_anual");
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
      annualMileage,
      matricula: getMatricula(vehicle),
      marca_modelo: getModelo(vehicle)
    }
  };
}

export function prepareVehiclesForPairing(soldRows = [], purchasedRows = [], options = {}) {
  const warnings = [];
  function split(rows, type) {
    const eligible = [];
    const ineligible = [];
    rows.forEach((row) => {
      const check = isVehicleEligibleForPairing(row, type, options);
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

export function buildPairingCandidates(eligibleSold, eligiblePurchased, options = {}) {
  const candidates = [];
  const evaluatedCandidates = [];
  const diagnostics = {
    totalCandidatesEvaluated: 0,
    discardedByCategory: 0,
    discardedByDateWindow: 0,
    discardedByMissingConsumption: 0,
    discardedByMissingMileage: 0,
    validCandidates: 0,
    selectedPairs: 0,
    unpairedByUniqueness: 0
  };
  eligibleSold.forEach((sold) => {
    eligiblePurchased.forEach((purchased) => {
      diagnostics.totalCandidatesEvaluated += 1;
      const categoryCheck = validatePairCategory(sold, purchased);
      const dateWindowCheck = validatePairDateWindow(sold, purchased);
      const savings = calculateTra050AnnualSaving(sold, purchased, options);
      const savingCheck = buildSavingCheck(savings);
      const uniquenessCheck = { valid: true, explanation: "La regla de uso unico se evaluara durante la seleccion final." };
      const isEligible = categoryCheck.valid && dateWindowCheck.valid && savingCheck.valid;
      const baseCandidate = {
        candidate_id: `${sold.id}__${purchased.id}`,
        sold_row_id: sold.id,
        purchased_row_id: purchased.id,
        sold_matricula: getMatricula(sold),
        purchased_matricula: getMatricula(purchased),
        categoria: categoryCheck.soldCategory || categoryCheck.purchasedCategory,
        fecha_venta: dateWindowCheck.saleDate,
        fecha_compra: dateWindowCheck.purchaseDate,
        date_window_valid: dateWindowCheck.valid,
        days_between: dateWindowCheck.daysBetween,
        categoryCheck,
        dateWindowCheck,
        savingCheck,
        uniquenessCheck,
        isEligible,
        eligibilityExplanation: candidateEligibilityExplanation(categoryCheck, dateWindowCheck, savingCheck),
        savings,
        warnings: savings.warnings,
        explanation: savings.explanation
      };
      evaluatedCandidates.push(baseCandidate);
      if (!categoryCheck.valid) diagnostics.discardedByCategory += 1;
      else if (!dateWindowCheck.valid) diagnostics.discardedByDateWindow += 1;
      else if (!savingCheck.valid) {
        if (savingCheck.errors?.includes("falta_kilometraje_anual")) diagnostics.discardedByMissingMileage += 1;
        else diagnostics.discardedByMissingConsumption += 1;
      }
      if (!isEligible) return;
      diagnostics.validCandidates += 1;
      const referencePenalty = (savings.consumo_termico_origen === "tra050_reference" ? 1 : 0) + (savings.consumo_electrico_origen === "tra050_reference" ? 1 : 0);
      const dateBonus = Math.max(0, 3 - Math.abs(dateWindowCheck.daysBetween || 0) / 60);
      candidates.push({
        ...baseCandidate,
        score: savings.ahorro_kwh_year + dateBonus - referencePenalty,
      });
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  candidates.diagnostics = diagnostics;
  candidates.evaluatedCandidates = evaluatedCandidates;
  return candidates;
}

export function autoPairVehicles(candidates, options = {}) {
  const usedSold = new Set(options.lockedPairs?.map((pair) => pair.sold_row_id) || []);
  const usedPurchased = new Set(options.lockedPairs?.map((pair) => pair.purchased_row_id) || []);
  const pairs = [...(options.lockedPairs || [])];
  const selectedCandidateIds = new Set();
  candidates.forEach((candidate) => {
    if (usedSold.has(candidate.sold_row_id) || usedPurchased.has(candidate.purchased_row_id)) return;
    usedSold.add(candidate.sold_row_id);
    usedPurchased.add(candidate.purchased_row_id);
    selectedCandidateIds.add(candidate.candidate_id);
    pairs.push(candidateToPair(candidate, pairs.length + 1, "auto_paired"));
  });
  const evaluated = candidates.evaluatedCandidates || candidates;
  const result = pairs.map((pair, index) => {
    const alternatives = evaluated
      .filter((candidate) => candidate.sold_row_id === pair.sold_row_id || candidate.purchased_row_id === pair.purchased_row_id)
      .sort((a, b) => (b.savingCheck?.ahorro_kwh_year || -Infinity) - (a.savingCheck?.ahorro_kwh_year || -Infinity))
      .slice(0, 10)
      .map((candidate) => ({
        candidate_id: candidate.candidate_id,
        sold_matricula: candidate.sold_matricula,
        purchased_matricula: candidate.purchased_matricula,
        categoria: candidate.categoryCheck?.soldCategory,
        fecha_valida: Boolean(candidate.dateWindowCheck?.valid),
        ahorro_kwh_anio: candidate.savingCheck?.ahorro_kwh_year,
        status: candidate.candidate_id === pair.candidate_id ? "seleccionada" : !candidate.isEligible ? "descartada" : (usedSold.has(candidate.sold_row_id) || usedPurchased.has(candidate.purchased_row_id)) ? "descartada_por_uso_unico" : "disponible",
        explanation: candidate.eligibilityExplanation
      }));
    return {
      ...pair,
      match_pair_id: pair.match_pair_id || `PAIR-${String(index + 1).padStart(6, "0")}`,
      uniquenessCheck: { valid: true, explanation: "Vendido y comprado usados una sola vez en la seleccion final." },
      alternativesEvaluated: alternatives,
      pair_selection_explanation: pair.pair_selection_explanation || `Pareja generada automaticamente. Cumple categoria ${pair.categoryCheck?.soldCategory}, la venta del termico esta dentro de la ventana permitida del ${pair.dateWindowCheck?.windowStart} al ${pair.dateWindowCheck?.windowEnd}, y entre las alternativas validas disponibles ofrecia un ahorro estimado de ${Number(pair.ahorro_kwh_anio || 0).toLocaleString("es-ES")} kWh/año. Ninguno de los dos vehiculos estaba usado en otra pareja.`
    };
  });
  result.diagnostics = { ...(candidates.diagnostics || {}), selectedPairs: result.length, unpairedByUniqueness: Math.max(0, candidates.length - result.length) };
  return result;
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
    ahorro_kwh_anio: candidate.savings.ahorro_kwh_year,
    ahorro_kwh_year: candidate.savings.ahorro_kwh_year,
    cva_original: candidate.savings.cva_original_value,
    unidad_cva_original: candidate.savings.cva_original_unit,
    combustible_vendido: candidate.savings.cva_fuel_type,
    factor_conversion_f: candidate.savings.conversion_factor,
    unidad_factor_conversion: candidate.savings.conversion_factor_unit,
    cva_kwh_100km: candidate.savings.cva_kwh_100km,
    cvn_kwh_100km: candidate.savings.cvn_kwh_100km,
    kilometraje_anual_km: candidate.savings.annual_mileage_km,
    kilometraje_anual_origen: candidate.savings.annual_mileage_source,
    tipologia_km_anuales: candidate.savings.annual_mileage_typology,
    annual_mileage_source: candidate.savings.annual_mileage_source,
    annual_mileage_typology: candidate.savings.annual_mileage_typology,
    annual_mileage_km: candidate.savings.annual_mileage_km,
    annual_mileage_reason: candidate.savings.annual_mileage_reason,
    formula_aplicada: candidate.savings.formula,
    explicacion_calculo: candidate.savings.explanation,
    calculo_valido: candidate.savings.is_valid,
    warnings_calculo: candidate.savings.warnings,
    errores_calculo: candidate.savings.errors,
    consumo_termico_kwh_100km: candidate.savings.consumo_termico_kwh_100km,
    consumo_electrico_kwh_100km: candidate.savings.consumo_electrico_kwh_100km,
    factor_conversion_usado: candidate.savings.factor_conversion_usado,
    consumo_termico_origen: candidate.savings.consumo_termico_origen,
    consumo_electrico_origen: candidate.savings.consumo_electrico_origen,
    pair_status: status,
    pair_locked: false,
    pair_manual_override: status === "manual_paired",
    warnings: candidate.warnings,
    explanation: candidate.explanation,
    categoryCheck: candidate.categoryCheck,
    dateWindowCheck: candidate.dateWindowCheck,
    savingCheck: candidate.savingCheck,
    uniquenessCheck: candidate.uniquenessCheck,
    validationChecks: {
      categoryCheck: candidate.categoryCheck,
      dateWindowCheck: candidate.dateWindowCheck,
      savingCheck: candidate.savingCheck,
      uniquenessCheck: candidate.uniquenessCheck
    },
    eligibilityExplanation: candidate.eligibilityExplanation,
    pair_selection_explanation: ""
  };
}

export function validatePairingIntegrity(pairs) {
  const errors = [];
  const sold = new Set();
  const purchased = new Set();
  const ids = new Set();
  pairs.forEach((pair) => {
    if (!pair.match_pair_id) errors.push("Pareja sin match_pair_id.");
    if (!pair.sold_row_id) errors.push(`Pareja ${pair.match_pair_id} sin vendido asociado.`);
    if (!pair.purchased_row_id) errors.push(`Pareja ${pair.match_pair_id} sin comprado asociado.`);
    if (sold.has(pair.sold_row_id)) errors.push(`Vendido repetido en ${pair.match_pair_id}.`);
    if (purchased.has(pair.purchased_row_id)) errors.push(`Comprado repetido en ${pair.match_pair_id}.`);
    if (ids.has(pair.match_pair_id)) errors.push(`ID de pareja duplicado ${pair.match_pair_id}.`);
    if (pair.ahorro_kwh_anio === null || pair.ahorro_kwh_anio === undefined) errors.push(`Pareja ${pair.match_pair_id} sin ahorro anual calculado.`);
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
    return pair ? {
      ...item,
      match_pair_id: pair.match_pair_id,
      pair_status: pair.pair_status,
      pair_locked: pair.pair_locked,
      pair_manual_override: pair.pair_manual_override,
      factor_conversion_f: pair.factor_conversion_f,
      unidad_factor_conversion: pair.unidad_factor_conversion,
      consumo_vendido_kwh_100km: pair.cva_kwh_100km,
      consumo_comprado_kwh_100km: pair.cvn_kwh_100km,
      kilometraje_anual_km: pair.kilometraje_anual_km
      ,
      tipologia_km_anuales: pair.tipologia_km_anuales,
      origen_km_anuales: pair.annual_mileage_source || pair.kilometraje_anual_origen
    } : { ...item, match_pair_id: null, pair_status: unpairedStatus };
  });
  return {
    ...datasets,
    soldThermal: { ...datasets.soldThermal, matchResults: update(datasets.soldThermal.matchResults || [], bySold, "unpaired_sold") },
    purchasedElectric: { ...datasets.purchasedElectric, matchResults: update(datasets.purchasedElectric.matchResults || [], byPurchased, "unpaired_purchased") }
  };
}
