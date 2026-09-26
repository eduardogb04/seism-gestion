/**
 * Doble en memoria del puerto `Correo` (F0-29): una lista viva solo
 * mientras dura el proceso. `sembrar` y `procesados` no están en el
 * puerto: son un agregado propio del doble, para los tests (así como
 * `sembrar`/`registrados` de `secuencias.ts`/`auditoria.ts`). Un
 * adaptador real (Gmail...) no los tiene: usa su propia forma de preparar
 * estado, por eso la suite de contrato (`tests/contratos/correo.ts`) recibe
 * la preparación por la fábrica, no llama a `sembrar` directo.
 */
import type { Resultado } from "../../dominio/compartido/historial.ts";
import { formatearISO } from "../../dominio/compartido/reloj.ts";
import type {
  Correo,
  Cursor,
  MensajeCorreo,
  MensajeDesconocido,
  PaginaMensajes,
} from "../../puertos/correo.ts";
import { CODIGO_MENSAJE_DESCONOCIDO } from "../../puertos/correo.ts";

const LIMITE_POR_DEFECTO = 100;

/** Token de ordenamiento y comparación: fecha (ISO, ancho fijo) + idExterno. */
function token(mensaje: MensajeCorreo): string {
  return `${formatearISO(mensaje.fecha)}|${mensaje.idExterno}`;
}

/** Un `Correo` de prueba con `sembrar()` y `procesados()` para inspección. */
export function crearCorreoEnMemoria(): Correo & {
  /** Agrega mensajes al buzón (no reemplaza los que ya estaban). */
  sembrar(mensajes: readonly MensajeCorreo[]): void;
  /** Los `idExterno` marcados como procesados, en el orden en que se marcaron. */
  procesados(): readonly string[];
} {
  const sembrados = new Map<string, MensajeCorreo>();
  const marcados: string[] = [];
  const marcadosSet = new Set<string>();

  return {
    sembrar(mensajes) {
      for (const mensaje of mensajes) {
        sembrados.set(mensaje.idExterno, mensaje);
      }
    },

    procesados() {
      return [...marcados];
    },

    listarNuevos(
      desde: Cursor,
      limite = LIMITE_POR_DEFECTO,
    ): Promise<PaginaMensajes> {
      const candidatos = [...sembrados.values()]
        .map((mensaje) => ({ mensaje, token: token(mensaje) }))
        .filter((par) => par.token > desde)
        .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0))
        .slice(0, limite);

      const mensajes = candidatos.map((par) => par.mensaje);
      const ultimo = candidatos.at(-1);
      const cursor = (ultimo === undefined ? desde : ultimo.token) as Cursor;

      return Promise.resolve({ mensajes, cursor });
    },

    marcarProcesado(
      idExterno: string,
    ): Promise<Resultado<void, MensajeDesconocido>> {
      if (!sembrados.has(idExterno)) {
        return Promise.resolve({
          ok: false,
          error: { codigo: CODIGO_MENSAJE_DESCONOCIDO, idExterno },
        });
      }
      if (!marcadosSet.has(idExterno)) {
        marcadosSet.add(idExterno);
        marcados.push(idExterno);
      }
      return Promise.resolve({ ok: true, valor: undefined });
    },
  };
}
