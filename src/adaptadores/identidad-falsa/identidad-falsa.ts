/**
 * El adaptador de identidad falso (F0-31, ADR 0027): una pantalla que lista
 * emails de prueba y deja elegir uno. Es lo que usan dev, CI y el e2e. **No
 * existe en el servidor**: el esquema del entorno rechaza `IDENTIDAD=falsa`
 * con `APP_ENTORNO=servidor` y la app no arranca
 * (`src/infraestructura/entorno.ts`).
 *
 * Imita el camino del de verdad para que la app no tenga dos flujos:
 * `iniciarLogin` manda a su pantalla (`/ingresar/prueba`) con el `state`, la
 * pantalla vuelve al callback con un código por email, y `completarLogin`
 * compara el `state` igual que Google. Verifica la identidad, no la autoriza:
 * un email de la lista sin usuario activo vuelve verificado, y lo rebota el
 * caso de uso (`AUT-0001`).
 *
 * Los emails se los da el punto de armado (`src/infraestructura/arranque/`):
 * una lista fija inventada (`@ejemplo.test`) más `ADMIN_INICIAL_EMAIL`.
 */

import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type {
  Identidad,
  IdentidadVerificada,
} from "../../puertos/identidad.ts";

/** La pantalla del falso (`src/app/(auth)/ingresar/prueba/page.tsx`). */
export const RUTA_PANTALLA_FALSA = "/ingresar/prueba";

/** Prefijo del código que la pantalla manda al callback: `prueba:<email>`. */
const PREFIJO_CODIGO = "prueba:";

export type IdentidadFalsa = Identidad & {
  /** Los emails que muestra la pantalla, en minúsculas y sin repetir. */
  readonly emails: readonly string[];
  /** El código que la pantalla manda al callback por ese email. */
  codigoPara(email: string): string;
};

export function crearIdentidadFalsa(emails: readonly string[]): IdentidadFalsa {
  const lista = [...new Set(emails.map((email) => email.trim().toLowerCase()))];

  return {
    emails: lista,

    codigoPara(email) {
      return `${PREFIJO_CODIGO}${email.trim().toLowerCase()}`;
    },

    iniciarLogin(estado) {
      return `${RUTA_PANTALLA_FALSA}?${new URLSearchParams({ state: estado.state })}`;
    },

    async completarLogin(codigo, { guardado, stateRecibido }) {
      if (stateRecibido === null || stateRecibido !== guardado.state) {
        throw nuevoError(catalogo.AUT_0002, {
          motivo: "el state del login no coincide con el guardado",
        });
      }
      const email = codigo.startsWith(PREFIJO_CODIGO)
        ? codigo.slice(PREFIJO_CODIGO.length)
        : null;
      if (email === null || !lista.includes(email)) {
        throw nuevoError(catalogo.AUT_0001, {
          motivo: "la identidad falsa no reconoce el código",
        });
      }
      const verificada: IdentidadVerificada = {
        proveedor: "falsa",
        sub: `falsa:${email}`,
        email,
        emailVerificado: true,
      };
      return verificada;
    },
  };
}
