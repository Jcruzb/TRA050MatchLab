const steps = ["Cargar datos", "Validar estructura", "Ejecutar matching", "Resolver conflictos", "Exportar resultados"];

export default function Stepper({ current }) {
  return (
    <nav className="stepper" aria-label="Flujo de trabajo">
      {steps.map((step, index) => (
        <div className={`step ${index <= current ? "active" : ""}`} key={step}>
          <span>{index + 1}</span>
          <p>{step}</p>
        </div>
      ))}
    </nav>
  );
}
