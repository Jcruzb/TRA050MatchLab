export default function PairingSummaryCards({ summary }) {
  const cards = [
    ["Vendidos cargados", summary.soldLoaded || 0],
    ["Vendidos elegibles", summary.eligibleSold || 0],
    ["Vendidos no elegibles", summary.ineligibleSold || 0],
    ["Electricos cargados", summary.purchasedLoaded || 0],
    ["Electricos elegibles", summary.eligiblePurchased || 0],
    ["Electricos no elegibles", summary.ineligiblePurchased || 0],
    ["Pares generados", summary.pairs || 0],
    ["Vendidos sin pareja", summary.unpairedSold || 0],
    ["Electricos sin pareja", summary.unpairedPurchased || 0],
    ["Ahorro total estimado", `${(summary.totalSavings || 0).toFixed(2)} kWh/100km`],
    ["Pares con advertencias", summary.warningPairs || 0]
  ];
  return (
    <section className="summary-grid">
      {cards.map(([label, value]) => (
        <article className="summary-card info" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  );
}
