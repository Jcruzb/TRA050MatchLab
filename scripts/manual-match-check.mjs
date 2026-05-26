import { VEHICLE_DB } from "../vehicle-db.js";
import { buildSearchIndex, matchRows } from "../src/utils/matchEngine.js";
import { groupConflictResults } from "../src/utils/groupConflicts.js";

const fixture = {
  Categoria_nuevo: "M1",
  Matricula_Nuevo: "3643LBK",
  Marca_modelo_Nuevo: "AUDI Q8 UTL DI AUT_2019",
  Matriculacion_Nuevo: "2019",
  "Fecha Compra": "2019",
  "Nº Contrato/Factura": "TEST",
  "Precio (SIN IVA)": "0"
};

const index = buildSearchIndex(VEHICLE_DB);
const [result] = matchRows([fixture], index);

const topModels = result.candidates.map((candidate) => `${candidate.marcaDetectada}:${candidate.modeloOriginal}`);
const hasToyota = result.candidates.some((candidate) => candidate.marcaDetectada === "toyota" || /toyota|mirai/i.test(candidate.modeloOriginal));
const hasBmw = result.candidates.some((candidate) => candidate.marcaDetectada === "bmw" || /\bbmw\b|\bi3\b/i.test(candidate.modeloOriginal));

console.log(JSON.stringify({
  detectedBrand: result.userFeatures.brand,
  detectedModelBase: result.userFeatures.modelBase,
  state: result.match_estado,
  score: result.match_score,
  poolBeforeBrand: result.matchDebug.candidatePoolSizeBeforeBrandFilter,
  poolAfterBrand: result.matchDebug.candidatePoolSizeAfterBrandFilter,
  poolAfterModel: result.matchDebug.candidatePoolSizeAfterModelFilter,
  topModels
}, null, 2));

if (result.userFeatures.brand !== "audi") throw new Error("Expected detected brand audi");
if (result.userFeatures.modelBase !== "q8") throw new Error("Expected detected modelBase q8");
if (hasToyota) throw new Error("Toyota/MIRAI appeared in normal candidates");
if (hasBmw) throw new Error("BMW/i3 appeared in normal candidates");
if (result.candidates.some((candidate) => candidate.marcaDetectada !== "audi")) throw new Error("Non-Audi candidate appeared in normal candidates");

const duplicateFixtures = [
  {
    Categoria_nuevo: "M1",
    Matricula_Nuevo: "5203LXL",
    Marca_modelo_Nuevo: "CITRO C4 GSPACETOURER MPV 7S DI AUT_2022",
    Matriculacion_Nuevo: "2022",
    "Fecha Compra": "2022",
    "Nº Contrato/Factura": "TEST",
    "Precio (SIN IVA)": "0"
  },
  {
    Categoria_nuevo: "M1",
    Matricula_Nuevo: "2562LXW",
    Marca_modelo_Nuevo: "CITRO C4 GSPACETOURER MPV 7S DI AUT_2022",
    Matriculacion_Nuevo: "2022",
    "Fecha Compra": "2022",
    "Nº Contrato/Factura": "TEST",
    "Precio (SIN IVA)": "0"
  }
];

const duplicateResults = matchRows(duplicateFixtures, index);
const duplicateGroups = groupConflictResults(duplicateResults);
const grouped = duplicateGroups.find((group) => group.vehicles.some((vehicle) => vehicle.matricula === "5203LXL"));

console.log(JSON.stringify({
  duplicateGroupLabel: grouped?.label,
  duplicateGroupSize: grouped?.groupSize,
  duplicateMatriculas: grouped?.vehicles.map((vehicle) => vehicle.matricula),
  duplicateFeatures: grouped?.detectedFeatures
}, null, 2));

if (!grouped) throw new Error("Expected duplicate CITRO conflict group");
if (grouped.groupSize !== 2) throw new Error("Expected duplicate conflict group size 2");

const smartFixtures = [
  {
    label: "PEUGE 2008",
    row: {
      Categoria_nuevo: "M1",
      Matricula_Nuevo: "9774MFT",
      Marca_modelo_Nuevo: "PEUGE 2008 SAL DI AUT_2023",
      Matriculacion_Nuevo: "2023",
      "Fecha Compra": "2023",
      "Nº Contrato/Factura": "TEST",
      "Precio (SIN IVA)": "0"
    },
    expectedBrand: "peugeot",
    expectedModel: "2008",
    forbidden: /volkswagen|arteon|toyota|bmw/i
  },
  {
    label: "MB CITAN",
    row: {
      Categoria_nuevo: "M1",
      Matricula_Nuevo: "4296MDX",
      Marca_modelo_Nuevo: "MB CITAN MPV 5S DI AUT_2023",
      Matriculacion_Nuevo: "2023",
      "Fecha Compra": "2023",
      "Nº Contrato/Factura": "TEST",
      "Precio (SIN IVA)": "0"
    },
    expectedBrand: "mercedes-benz",
    expectedModel: "citan",
    forbidden: /volkswagen|arteon|peugeot|toyota|bmw/i
  },
  {
    label: "CITRO C4",
    row: duplicateFixtures[0],
    expectedBrand: "citroen",
    expectedModel: "c4",
    forbidden: /volkswagen|arteon|toyota|bmw/i
  }
];

for (const testCase of smartFixtures) {
  const [match] = matchRows([testCase.row], index);
  const models = match.candidates.map((candidate) => `${candidate.marcaDetectada}:${candidate.modeloOriginal}`);
  console.log(JSON.stringify({
    label: testCase.label,
    brand: match.userFeatures.brand,
    brandConfidence: match.userFeatures.brandConfidence,
    modelBase: match.userFeatures.modelBase,
    year: match.userFeatures.year,
    phase: match.matchDebug.candidateRetrievalPhase,
    models
  }, null, 2));
  if (match.userFeatures.brand !== testCase.expectedBrand) throw new Error(`${testCase.label}: expected brand ${testCase.expectedBrand}`);
  if (match.userFeatures.modelBase !== testCase.expectedModel) throw new Error(`${testCase.label}: expected model ${testCase.expectedModel}`);
  if (match.userFeatures.modelBase.startsWith("my")) throw new Error(`${testCase.label}: MY token used as model`);
  if (models.some((model) => testCase.forbidden.test(model))) throw new Error(`${testCase.label}: forbidden candidate appeared`);
}
