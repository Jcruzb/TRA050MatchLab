# TRA050 MatchLab

Aplicacion local en React + Vite para cargar vehiculos desde Excel o tabla pegada, validar estructura, hacer matching contra una base IDAE local y exportar un resultado trazable para expedientes CAE TRA050.

## Instalacion

```bash
npm install
```

## Desarrollo local

```bash
npm run dev
```

## Generar HTML final offline

```bash
npm run build
```

El build deja el resultado en `dist/index.html` con CSS, JavaScript, dependencias y base IDAE embebidos. Ese archivo puede abrirse directamente en el navegador, sin servidor y sin conexion a internet.

## Base de datos IDAE

Coloca `vehicle-db.js` en la raiz del proyecto. El archivo debe exportar:

```js
export const VEHICLE_DB = [
  // registros IDAE
];
```

Si llega como `const VEHICLE_DB = [...]`, se puede convertir a export manteniendo el contenido local. La app importa esa fuente desde `src/data/vehicle-db.js`, por lo que queda incluida dentro del bundle final.

## Validacion offline

1. Ejecuta `npm run build`.
2. Abre `dist/index.html` directamente desde el explorador de archivos.
3. Desconecta internet o bloquea red.
4. Comprueba que se ve el contador de registros IDAE, que puedes descargar la plantilla, cargar/pegar datos y exportar resultados.

## Flujo fase 1

La app separa dos espacios de trabajo:

- `Vendidos / Térmicos`: vehículos antiguos sustituidos. Si se carga una columna heredada `Fecha Compra`, se interpreta como fecha de venta.
- `Comprados / Eléctricos`: vehículos eléctricos nuevos. `Fecha Compra` se interpreta como fecha de compra.

El emparejamiento TRA050 entre vendido y comprado queda preparado para una fase posterior; por ahora se validan y matchean ambos conjuntos por separado contra IDAE.

## Evidencias IDAE

La exportación `manifest de evidencias IDAE` genera un JSON para un futuro script Node/Playwright que tomará pantallazos de las fichas IDAE. Ese script no se integra en el HTML porque depende de Node, filesystem y Playwright.
