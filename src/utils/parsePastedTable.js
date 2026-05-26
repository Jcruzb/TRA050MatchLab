export function parsePastedTable(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim().length);
  if (lines.length < 2) throw new Error("El pegado debe incluir encabezados y al menos una fila de datos.");
  const headers = lines[0].split("\t").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]));
  });
}
