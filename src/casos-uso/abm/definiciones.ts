/**
 * Las definiciones de todos los ABM, por entidad (F1-03, ADR 0031). Un ABM
 * nuevo suma su línea. Las acciones de los formularios reciben el **nombre**
 * de la entidad (una definición no viaja al navegador: lleva su validación) y
 * la buscan acá.
 */

import { z } from "zod";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { EntidadAbm } from "../../puertos/repositorios/abm.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { CENTROS_DE_COSTO } from "./centros-de-costo.ts";
import { CLIENTES } from "./clientes.ts";
import { CUENTAS } from "./cuentas.ts";
import { type ColumnaAbm, camposDe, type DefinicionAbm } from "./definicion.ts";
import { EGRESOS } from "./egresos.ts";
import { GRUPOS } from "./grupos.ts";
import { SITIOS } from "./sitios.ts";
import { TIPOS_DE_SERVICIO } from "./tipos-de-servicio.ts";

export const DEFINICIONES: { readonly [E in EntidadAbm]: DefinicionAbm<E> } = {
  Grupo: GRUPOS,
  Cliente: CLIENTES,
  Sitio: SITIOS,
  TipoServicio: TIPOS_DE_SERVICIO,
  CentroCosto: CENTROS_DE_COSTO,
  Cuenta: CUENTAS,
  Egreso: EGRESOS,
};

const esquemaEntidad = z
  .string()
  .refine((nombre): nombre is EntidadAbm =>
    Object.hasOwn(DEFINICIONES, nombre),
  );

function aplicar<E extends EntidadAbm, T>(
  entidad: E,
  trabajo: (definicion: DefinicionAbm<E>) => T,
): T {
  return trabajo(DEFINICIONES[entidad]);
}

/**
 * Corre `trabajo` con la definición de `entidad`. El nombre llega atado a una
 * acción de formulario, o sea de afuera: si no es el de un ABM, `DOM-0009`.
 */
export function conDefinicion<T>(
  entidad: unknown,
  trabajo: <E extends EntidadAbm>(definicion: DefinicionAbm<E>) => T,
): T {
  const leida = esquemaEntidad.safeParse(entidad);
  if (!leida.success) {
    throw nuevoError(catalogo.DOM_0009, { entidad });
  }
  return aplicar(leida.data, trabajo);
}

/** Una relación guarda el id: su columna es de texto, y su nombre sale de `campos`. */
function esColumna<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  nombre: string,
): nombre is ColumnaAbm<E> {
  return Object.hasOwn(definicion.campos, nombre);
}

/** Las columnas de `definicion` que son una relación con `destino`. */
function columnasHacia<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  destino: EntidadAbm,
): readonly ColumnaAbm<E>[] {
  return camposDe(definicion).flatMap(([nombre, campo]) =>
    campo.tipo === "relacion" &&
    campo.entidad === destino &&
    esColumna(definicion, nombre)
      ? [nombre]
      : [],
  );
}

/** ¿Hay algún registro vigente, de cualquier ABM, que apunte al `id` de `destino`? */
export async function enUso(
  repos: RepositoriosEnTransaccion,
  destino: EntidadAbm,
  id: string,
): Promise<boolean> {
  for (const entidad of Object.keys(DEFINICIONES)) {
    const usado = await conDefinicion(entidad, async (definicion) => {
      for (const columna of columnasHacia(definicion, destino)) {
        if (await repos.abm(definicion.entidad).hayVigenteCon(columna, id)) {
          return true;
        }
      }
      return false;
    });
    if (usado) {
      return true;
    }
  }
  return false;
}
