/**
 * Aviso de tope de IA superado por el log (F0-28, R1). La spec pide encolarlo
 * por el puerto de notificaciones (F0-29); hasta que ese puerto esté en
 * `main`, sale por acá: una línea `warn` con el código `IA-0001` y los
 * detalles del tope (`acumulado`, `estimado`, `tope`, `mes`, `perfil`), sin
 * la entrada que se quería interpretar.
 */
import { paraLog } from "../../dominio/compartido/errores/serializar.ts";
import type { Log } from "../../infraestructura/log.ts";
import type { AvisosIa } from "../../puertos/ia.ts";

export function crearAvisosIaPorLog(log: Log): AvisosIa {
  return {
    topeSuperado(error) {
      log.warn(
        paraLog(error),
        "tope mensual de gasto de IA superado: no se llamó al adaptador",
      );
    },
  };
}
