export function vectorizeUserVehicle(features) {
  return {
    [`brand_${features.brand || "unknown"}`]: features.brand ? 1 : 0,
    [`model_${features.modelBase || "unknown"}`]: features.modelBase ? 1 : 0,
    [`fuel_${features.motorizacion || "unknown"}`]: features.motorizacion ? 1 : 0,
    [`gearbox_${features.tipoCambio || "unknown"}`]: features.tipoCambio ? 1 : 0,
    [`year_${features.year || "unknown"}`]: features.year ? 1 : 0,
    tokens: new Set(features.modelTokens || [])
  };
}

export function vectorizeDbVehicle(vehicle) {
  return {
    [`brand_${vehicle.marcaDetectada || "unknown"}`]: vehicle.marcaDetectada ? 1 : 0,
    [`model_${vehicle.modelBase || "unknown"}`]: vehicle.modelBase ? 1 : 0,
    [`fuel_${vehicle.motorizacion || "unknown"}`]: vehicle.motorizacion ? 1 : 0,
    [`gearbox_${vehicle.tipoCambio || "unknown"}`]: vehicle.tipoCambio ? 1 : 0,
    [`year_${vehicle.yearMY || "unknown"}`]: vehicle.yearMY ? 1 : 0,
    tokens: new Set(vehicle.searchableTokens || vehicle.modelTokens || [])
  };
}

export function calculateVectorSimilarity(userVector, candidateVector) {
  const matchedFeatures = [];
  const rejectedFeatures = [];
  let secondaryTokenScore = 0;
  Object.keys(userVector).forEach((key) => {
    if (key === "tokens" || !userVector[key]) return;
    if (candidateVector[key]) matchedFeatures.push(key);
    else rejectedFeatures.push(key);
  });
  userVector.tokens?.forEach((token) => {
    if (candidateVector.tokens?.has(token)) secondaryTokenScore += 1;
  });
  return { matchedFeatures, rejectedFeatures, secondaryTokenScore };
}
