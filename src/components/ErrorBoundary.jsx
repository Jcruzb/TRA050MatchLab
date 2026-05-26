import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main>
        <section className="panel">
          <h2>No se pudo completar el analisis</h2>
          <p className="muted">Revisa el archivo o intenta procesar menos filas.</p>
          <details className="debug-box">
            <summary>Ver detalle tecnico</summary>
            <pre>{this.state.error.stack || this.state.error.message}</pre>
          </details>
        </section>
      </main>
    );
  }
}
