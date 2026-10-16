/**
 * Los clientes de un grupo vistos desde el grupo (F3-09): ver cuáles tiene,
 * agregar uno y sacarlo, sin entrar a cada cliente. Un cliente es de un solo
 * grupo (`Cliente.grupoId`), así que agregar es escribir esa columna con el
 * mismo repositorio del molde: la auditoría la deja el repositorio.
 *
 * - Agregar uno que ya tiene **otro** grupo no escribe nada hasta que llegue
 *   la confirmación; devuelve el nombre del grupo actual para preguntarla.
 * - Un grupo o un cliente que no existe o está dado de baja es `DOM-0009`.
 * - Quien no tiene un rol de `GRUPOS.rolesQueEscriben` no escribe (`AUT-0009`).
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import { marcarActualizado } from "../../dominio/compartido/auditable.ts";
import { formatearCuit } from "../../dominio/compartido/cuit.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import type { RegistroAbm } from "../../puertos/repositorios/abm.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { TODAS, vigente } from "./abm.ts";
import { CLIENTES } from "./clientes.ts";
import { GRUPOS } from "./grupos.ts";

type DependenciasClientesDeGrupo = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
};

export type PantallaDeGrupo = {
  readonly grupo: {
    readonly id: string;
    readonly nombre: string;
    readonly observaciones: string | null;
  };
  readonly clientes: readonly {
    readonly id: string;
    readonly razonSocial: string;
    readonly cuit: string;
  }[];
  /** Los clientes vigentes que no son de este grupo, con el nombre del grupo que tienen: primero los sin grupo. */
  readonly candidatos: readonly {
    readonly id: string;
    readonly razonSocial: string;
    readonly grupo: string | null;
  }[];
};

/** `grupoActual`: el cliente ya es de ese grupo y hace falta la confirmación para moverlo. */
export type ResultadoAgregarCliente =
  | { readonly ok: true }
  | { readonly ok: false; readonly grupoActual: string };

export type CasosUsoClientesDeGrupo = {
  pantalla(grupoId: string): Promise<PantallaDeGrupo>;
  /** `confirmado`: la persona ya aceptó mover al cliente de su grupo actual. */
  agregarClienteAGrupo(
    actor: Actor,
    grupoId: string,
    clienteId: string,
    confirmado: boolean,
  ): Promise<ResultadoAgregarCliente>;
  /** Sacar uno que no está en ese grupo no hace nada: no toca el que tenga. */
  sacarClienteDeGrupo(
    actor: Actor,
    grupoId: string,
    clienteId: string,
  ): Promise<void>;
};

export function crearCasosUsoClientesDeGrupo({
  transaccional,
  reloj,
}: DependenciasClientesDeGrupo): CasosUsoClientesDeGrupo {
  async function ponerGrupo(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    actual: RegistroAbm<"Cliente">,
    grupoId: string | null,
  ): Promise<void> {
    const cambiado = marcarActualizado(
      actual,
      { ...actual.valor, grupoId },
      actor,
      reloj,
    );
    if (!cambiado.ok) {
      throw nuevoError(catalogo.DOM_0009, { id: actual.valor.id });
    }
    await repos.abm("Cliente").actualizar(actor, cambiado.valor, "actualizar");
  }

  return {
    pantalla(grupoId) {
      return transaccional.ejecutar(async (repos) => {
        const grupo = await vigente(repos, GRUPOS, grupoId);
        const { registros } = await repos.abm("Cliente").listar({
          buscaEn: [],
          filtros: [],
          marcadas: [],
          mes: null,
          orden: "razonSocial",
          direccion: "asc",
          saltear: 0,
          cantidad: TODAS,
        });
        const deOtros = registros.flatMap(({ valor }) =>
          valor.grupoId === null || valor.grupoId === grupoId
            ? []
            : [{ valor, grupoId: valor.grupoId }],
        );
        const nombres = new Map<string, string>(
          (
            await repos
              .abm("Grupo")
              .buscarPorIds([...new Set(deOtros.map((otro) => otro.grupoId))])
          ).map((registro) => [registro.valor.id, registro.valor.nombre]),
        );
        return {
          grupo: {
            id: grupo.valor.id,
            nombre: grupo.valor.nombre,
            observaciones: grupo.valor.observaciones,
          },
          clientes: registros
            .filter(({ valor }) => valor.grupoId === grupoId)
            .map(({ valor }) => ({
              id: valor.id,
              razonSocial: valor.razonSocial,
              cuit: formatearCuit(valor.cuit),
            })),
          candidatos: [
            ...registros
              .filter(({ valor }) => valor.grupoId === null)
              .map(({ valor }) => ({
                id: valor.id,
                razonSocial: valor.razonSocial,
                grupo: null,
              })),
            ...deOtros.map(({ valor, grupoId: otro }) => ({
              id: valor.id,
              razonSocial: valor.razonSocial,
              grupo: nombres.get(otro) ?? "",
            })),
          ],
        };
      });
    },

    agregarClienteAGrupo(actor, grupoId, clienteId, confirmado) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          GRUPOS.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        await vigente(repos, GRUPOS, grupoId);
        const actual = await vigente(repos, CLIENTES, clienteId);
        const grupoActual = actual.valor.grupoId;
        if (grupoActual === grupoId) {
          return { ok: true };
        }
        if (grupoActual !== null && !confirmado) {
          const [anterior] = await repos
            .abm("Grupo")
            .buscarPorIds([grupoActual]);
          return { ok: false, grupoActual: anterior?.valor.nombre ?? "" };
        }
        await ponerGrupo(actor, repos, actual, grupoId);
        return { ok: true };
      });
    },

    sacarClienteDeGrupo(actor, grupoId, clienteId) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          GRUPOS.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        await vigente(repos, GRUPOS, grupoId);
        const actual = await vigente(repos, CLIENTES, clienteId);
        if (actual.valor.grupoId === grupoId) {
          await ponerGrupo(actor, repos, actual, null);
        }
      });
    },
  };
}
