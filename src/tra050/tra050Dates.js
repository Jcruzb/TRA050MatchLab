import { parseLooseDate } from "../utils/normalize.js";

export function addMonths(date, months) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function parseOperationDate(value) {
  return parseLooseDate(value);
}

export function isSaleInTra050Window(saleValue, purchaseValue) {
  const saleDate = parseOperationDate(saleValue);
  const purchaseDate = parseOperationDate(purchaseValue);
  if (!saleDate || !purchaseDate) return { valid: false, saleDate, purchaseDate, daysBetween: null, warning: "Fecha de venta o compra inválida." };
  const from = addMonths(purchaseDate, -3);
  const to = addMonths(purchaseDate, 6);
  const valid = saleDate >= from && saleDate <= to;
  const daysBetween = Math.round((saleDate - purchaseDate) / 86400000);
  return { valid, saleDate, purchaseDate, daysBetween, warning: valid ? "" : "Fuera de ventana TRA050 (-3/+6 meses)." };
}

export function formatDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}
