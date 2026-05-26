import { normalizeText } from "../utils/normalize.js";

const LEARNING_KEY = "tra050-matchlab-learning-rules";

export function loadLearningRules() {
  try {
    return JSON.parse(localStorage.getItem(LEARNING_KEY) || "[]");
  } catch {
    return [];
  }
}

function persist(rules) {
  localStorage.setItem(LEARNING_KEY, JSON.stringify(rules));
  return rules;
}

export function buildLearningInputSignature(rowOrFeatures) {
  const raw = rowOrFeatures?.Marca_modelo_Nuevo || rowOrFeatures?.rawText || "";
  return normalizeText(raw);
}

export function saveLearningRule(rule) {
  const rules = loadLearningRules();
  const inputSignature = rule.inputSignature || buildLearningInputSignature(rule);
  const existing = rules.find((entry) => entry.inputSignature === inputSignature && entry.selectedIdIdae === rule.selectedIdIdae);
  if (existing) {
    existing.timesUsed = (existing.timesUsed || 0) + 1;
    existing.updatedAt = new Date().toISOString();
    return persist(rules);
  }
  rules.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    inputSignature,
    normalizedInput: inputSignature,
    detectedBrand: rule.detectedBrand || "",
    detectedModelBase: rule.detectedModelBase || "",
    selectedIdIdae: rule.selectedIdIdae,
    selectedModeloIdae: rule.selectedModeloIdae,
    resolutionMode: rule.resolutionMode || "manual-selection",
    createdAt: new Date().toISOString(),
    timesUsed: 1
  });
  return persist(rules);
}

export function applyLearningRules(userFeatures, rules = []) {
  const signature = buildLearningInputSignature(userFeatures);
  return rules.find((rule) => rule.inputSignature === signature)
    || rules.find((rule) => rule.detectedBrand === userFeatures.brand && rule.detectedModelBase === userFeatures.modelBase && userFeatures.modelBase);
}

export function exportLearningRules() {
  const blob = new Blob([JSON.stringify(loadLearningRules(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tra050-matchlab-reglas-aprendidas.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function importLearningRules(file) {
  const imported = JSON.parse(await file.text());
  if (!Array.isArray(imported)) throw new Error("El archivo de reglas no tiene el formato esperado.");
  return persist(imported);
}

export function clearLearningRules() {
  return persist([]);
}
