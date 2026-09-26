/**
 * F0-29: corre la suite de contrato de `Correo` contra el doble en
 * memoria. Nivel dominio: el doble no abre red ni base (una lista viva en
 * el proceso), así que no necesita el nivel casos de uso.
 */
import { crearCorreoEnMemoria } from "../../src/adaptadores/memoria/correo.ts";
import { suiteCorreo } from "../contratos/correo.ts";

suiteCorreo("memoria", () => {
  const correo = crearCorreoEnMemoria();
  return {
    puerto: correo,
    preparar(mensajes) {
      correo.sembrar(mensajes);
    },
  };
});
