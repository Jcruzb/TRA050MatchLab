export const TRA050_REFERENCIAS_CONSUMO = {
  documento: "TRA050 - Anexo II v1.1",
  tablas: [
    {
      id: "A",
      nombre: "Consumo de referencia del vehículo nuevo eléctrico puro",
      descripcion: "Consumo en kWh/100km del vehículo nuevo eléctrico puro cuando no se pueda localizar el vehículo en la base de datos del IDAE.",
      unidad: "kWh/100km",
      filas: [
        { tipologia: "M1", consumo: 17.92 },
        { tipologia: "M3", consumo: 86.7 },
        { tipologia: "N1", consumo: 20.84 },
        { tipologia: "N2", consumo: 47.71 },
        { tipologia: "N3", consumo: 118.53 },
        { tipologia: "L3e", consumo: 4.84 },
        { tipologia: "L5e", consumo: 9.34 },
        { tipologia: "L6e", consumo: 19.45 },
        { tipologia: "L7e", consumo: 18.54 }
      ]
    },
    {
      id: "B",
      nombre: "Consumo de referencia del vehículo antiguo de combustión que se sustituye",
      descripcion: "Consumo de referencia del vehículo antiguo M, N y L de combustión cuando corresponda usar la tabla del anexo o cuando no se pueda localizar el vehículo en la base de datos del IDAE.",
      filas: [
        { tipologia: "M1 - turismo", combustible: "gasolina", consumo: 7.89, unidad: "L/100km" },
        { tipologia: "M1 - turismo", combustible: "diésel", consumo: 6.99, unidad: "L/100km" },
        { tipologia: "M1 - turismo", combustible: "GLP", consumo: 6.45, unidad: "L/100km" },
        { tipologia: "M1 - turismo", combustible: "gas natural", consumo: 4.88, unidad: "kg/100km" },
        { tipologia: "M1 - turismo", combustible: "híbrido gasolina", consumo: 5.135, unidad: "L/100km" },
        { tipologia: "M1 - turismo", combustible: "híbrido diésel", consumo: 5.18, unidad: "L/100km" },
        { tipologia: "N1 - furgonetas pequeñas", combustible: "gasolina", consumo: 7.05, unidad: "L/100km" },
        { tipologia: "N1 - furgonetas pequeñas", combustible: "diésel", consumo: 5.63, unidad: "L/100km" },
        { tipologia: "N1 - furgonetas pequeñas", combustible: "gas natural", consumo: 8.28, unidad: "kg/100km" },
        { tipologia: "M1 - furgonetas grandes", combustible: "gasolina", consumo: 6.22, unidad: "L/100km" },
        { tipologia: "M1 - furgonetas grandes", combustible: "diésel", consumo: 7.4, unidad: "L/100km" },
        { tipologia: "N1 - camión < 3500 kg", combustible: "diésel", consumo: 11.5, unidad: "L/100km" },
        { tipologia: "N2", combustible: "diésel", consumo: 19, unidad: "L/100km" },
        { tipologia: "N3", combustible: "diésel", consumo: 35, unidad: "L/100km" },
        { tipologia: "M2", combustible: "diésel", consumo: 15.5, unidad: "L/100km" },
        { tipologia: "M3", combustible: "diésel", consumo: 21, unidad: "L/100km" },
        { tipologia: "M3", combustible: "gas natural", consumo: 36.6, unidad: "kg/100km" },
        { tipologia: "L", combustible: "gasolina", consumo: 2.9, unidad: "L/100km" }
      ]
    }
  ]
};

export const TRA050_CONSUMO_REFERENCIA_NUEVO_ELECTRICO = TRA050_REFERENCIAS_CONSUMO.tablas[0].filas.map((fila) => ({
  ...fila,
  unidad: "kWh/100km",
  consumo_kwh_100km: fila.consumo
}));

export const TRA050_CONSUMO_REFERENCIA_ANTIGUO_TERMICO = TRA050_REFERENCIAS_CONSUMO.tablas[1].filas;

export const TRA050_FACTORES_CONVERSION = {
  gasolina_litro_a_kwh: 9.19,
  diesel_litro_a_kwh: 10,
  GLP_litro_a_kwh: 7.16,
  GAS_nATURAL_litro_a_kwh: 13.33
};
