const TERM_REPLACEMENTS = [
  [/\btouring sports?\b/g, "touring sport"],
  [/\bts\b/g, "touring sport"],
  [/\bhb\b/g, "hatchback"],
  [/\bsedan\b/g, "sedan"],
  [/\bsedan\b/g, "sedan"],
  [/\bauto(matico)?\b/g, "automatico"],
  [/\belectricos? puros?\b/g, "electrico puro"],
  [/\belectrico(s)?\b/g, "electrico puro"],
  [/\bdiesel\b/g, "diesel"],
  [/\bdiesel\b/g, "diesel"],
  [/\bphev\b/g, "enchufable"],
  [/\bhev\b/g, "hibrido normal"],
  [/\bhibrido\b/g, "hibrido"]
];

export function normalizeText(value = "") {
  let text = String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .replace(/[()_[\]{}.,;:|/\\+*]/g, " ")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  TERM_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeHeader(value = "") {
  return normalizeText(value)
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !["de", "del", "la", "el", "y"].includes(token));
}

export function tokenSimilarity(a = "", b = "") {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.max(left.size, right.size);
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseLooseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const raw = String(value).trim();
  const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    const year = parts[3].length === 2 ? Number(`20${parts[3]}`) : Number(parts[3]);
    const date = new Date(year, Number(parts[2]) - 1, Number(parts[1]));
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function dateToYear(value) {
  const date = parseLooseDate(value);
  return date ? date.getFullYear() : null;
}
