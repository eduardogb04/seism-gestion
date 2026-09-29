/**
 * F0-29: corre la suite de contrato de `Notificaciones` contra el doble en
 * memoria. Nivel dominio: el doble no abre red ni base.
 */
import { crearNotificacionesEnMemoria } from "../../src/adaptadores/memoria/notificaciones.ts";
import { suiteNotificaciones } from "../contratos/notificaciones.ts";

suiteNotificaciones("memoria", () => {
  const notificaciones = crearNotificacionesEnMemoria();
  return {
    puerto: notificaciones,
    leerEnviados: () =>
      notificaciones.enviados().map((envio) => ({ ...envio })),
  };
});
