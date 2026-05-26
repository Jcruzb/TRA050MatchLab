import { calculateVectorSimilarity, vectorizeDbVehicle, vectorizeUserVehicle } from "./vehicleVectorizer.js";

export function explainableVectorScore(userFeatures, candidate) {
  const userVector = vectorizeUserVehicle(userFeatures);
  const candidateVector = vectorizeDbVehicle(candidate);
  return calculateVectorSimilarity(userVector, candidateVector);
}
