/**
 * Los casos de uso de servicios (F2-04, ADR 0033). Un servicio no entra en el
 * molde de ABM (código generado, estado con historial, sitios, pantalla
 * propia), pero usa sus piezas: los tipos de campo y su validación, las
 * relaciones, los parámetros del listado y la regla de "en uso".
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción.
 * - El código (`SRV-2026-014`) sale de `Secuencias` en la transacción del
 *   alta: dos altas a la vez no lo repiten, y un alta que falla no lo gasta.
 * - El estado es el último evento del historial. Un cambio que el ciclo no
 *   declara, o una baja fuera de «Solicitado», es `DOM-0011` y no guarda nada.
 * - Lo que la persona corrige en el formulario vuelve por campo, no se lanza.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarActualizado,
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  generarCodigoLegible,
  identificadorDesde,
} from "../../dominio/compartido/identificador.ts";
import { type Reloj, RelojFijo } from "../../dominio/compartido/reloj.ts";
import {
  admiteBaja,
  cicloServicio,
  ESTADO_INICIAL,
  ESTADOS_SERVICIO,
  type HistorialServicio,
  transicionesDesde,
} from "../../dominio/servicios/estados.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import {
  type DatosServicio,
  ORDENES_DE_SERVICIOS,
  type Servicio,
} from "../../puertos/repositorios/servicios.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import type { Rol } from "../../puertos/repositorios/usuarios.ts";
import {
  cuandoDe,
  type ErroresPorCampo,
  elegiblesDe,
  type FiltroListado,
  nombresDeActores,
  type OpcionesPorCampo,
  opcionesDe,
  parametrosDe,
  REGISTROS_POR_PAGINA,
  relacionesRotas,
  TODAS,
  validarEscrito,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  type OpcionAbm,
  type ValoresAbm,
} from "../abm/definicion.ts";
import { conDefinicion } from "../abm/definiciones.ts";
import { MODALIDADES } from "../abm/tipos-de-servicio.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  camposDeServicio,
  ETIQUETAS_DE_ESTADO,
  VALIDACION,
} from "./formulario.ts";

const PREFIJO = "SRV";

export const ROLES_QUE_ESCRIBEN_SERVICIOS: readonly Rol[] = [
  "administrador",
  "operador",
];

const CABECERAS = [
  "Código",
  "Título",
  "Cliente",
  "Tipo",
  "Estado",
  "Responsable",
  "Fecha de pedido",
] as const;

const ETIQUETAS_DE_ORDEN: Readonly<
  Record<(typeof ORDENES_DE_SERVICIOS)[number], string>
> = { fechaPedido: "Fecha de pedido", codigo: "Código" };

const esquemaId = z.uuid();
const esquemaEstado = z.enum(ESTADOS_SERVICIO);
const esquemaNota = z.string().trim().max(500);

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type ResultadoDeServicio =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** El listado, con la forma que dibuja `ListadoAbm`. */
export type ListadoDeServicios = {
  readonly cabeceras: readonly string[];
  readonly ordenes: readonly {
    readonly columna: string;
    readonly etiqueta: string;
  }[];
  readonly registros: readonly { readonly valor: { readonly id: string } }[];
  readonly celdas: Readonly<Record<string, readonly string[]>>;
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
  readonly buscar: string;
  readonly orden: string;
  readonly direccion: "asc" | "desc";
  readonly filtros: readonly FiltroListado[];
};

export type FormularioDeServicio = {
  readonly campos: CamposAbm;
  readonly elegibles: OpcionesPorCampo;
  /** Lo que trae el formulario al abrirse. */
  readonly escrito: Escrito;
};

/** Un cambio de estado, listo para mostrarse. */
export type CambioDeEstado = {
  /** dd/mm/aaaa hh:mm, hora argentina. */
  readonly cuando: string;
  /** Vacío en el alta. */
  readonly de: string;
  readonly a: string;
  readonly quien: string;
  readonly nota: string;
};

export type DetalleDeServicio = {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: string;
  /** Cada dato con su etiqueta, en el orden en que se muestra. */
  readonly datos: readonly (readonly [string, string])[];
  /** Del más nuevo al más viejo. */
  readonly historial: readonly CambioDeEstado[];
  /** A qué estados se puede pasar desde el actual. */
  readonly transiciones: readonly OpcionAbm[];
  /** Los sitios vigentes de su cliente, con los que abarca marcados. */
  readonly sitios: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly marcado: boolean;
  }[];
  readonly admiteBaja: boolean;
};

export type CasosUsoServicios = {
  listar(
    parametros: Readonly<Record<string, unknown>>,
  ): Promise<ListadoDeServicios>;
  /** El formulario de alta o, con `id`, el de edición de ese servicio. */
  formulario(id?: string): Promise<FormularioDeServicio>;
  /** El servicio vigente con ese id. `DOM-0009` si no existe o está dado de baja. */
  ver(id: string): Promise<DetalleDeServicio>;
  crear(actor: Actor, escrito: Escrito): Promise<ResultadoDeServicio>;
  guardar(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeServicio>;
  /** La baja lógica: solo de un servicio que sigue «Solicitado». */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
  cambiarEstado(
    actor: Actor,
    id: string,
    a: string,
    nota: string,
  ): Promise<void>;
  /** Reemplaza los sitios que abarca: todos tienen que ser sitios vigentes de su cliente. */
  guardarSitios(
    actor: Actor,
    id: string,
    sitioIds: readonly string[],
  ): Promise<void>;
};

async function vigente(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<Servicio> {
  const servicio = esquemaId.safeParse(id).success
    ? await repos.servicios.buscarPorId(id)
    : null;
  if (servicio === null || servicio.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Servicio", id });
  }
  return servicio;
}

async function historialDe(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<HistorialServicio> {
  const [alta, ...cambios] = await repos.servicios.eventosDe(id);
  if (alta === undefined) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "hay un servicio sin su evento de alta",
      id,
    });
  }
  return { eventos: [alta, ...cambios] };
}

/** Los usuarios activos, por email, y el que ya era responsable aunque ya no lo esté. */
async function responsables(
  repos: RepositoriosEnTransaccion,
  previo: string | undefined,
): Promise<readonly OpcionAbm[]> {
  return (await repos.usuarios.listar())
    .filter(
      ({ valor, eliminadoEn }) =>
        (valor.estado === "activo" && eliminadoEn === undefined) ||
        valor.id === previo,
    )
    .map(({ valor }) => ({ valor: valor.id, etiqueta: valor.email }));
}

type Leido =
  | { readonly ok: true; readonly datos: Omit<DatosServicio, "codigo"> }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Lo escrito, validado contra el formulario y contra la base. `actual`: el servicio que se edita. */
async function leer(
  repos: RepositoriosEnTransaccion,
  escrito: Escrito,
  actual: Servicio | null,
): Promise<Leido> {
  const campos = camposDeServicio(
    await responsables(repos, actual?.valor.responsableId),
  );
  const validado = validarEscrito(campos, VALIDACION, escrito);
  if (!validado.ok) {
    return validado;
  }
  const errores = await relacionesRotas(
    repos,
    campos,
    validado.datos,
    actual?.valor ?? {},
  );
  return Object.keys(errores).length > 0 ? { ok: false, errores } : validado;
}

function etiquetaDe(opciones: readonly OpcionAbm[], valor: string): string {
  return opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor;
}

export function crearCasosUsoServicios({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoServicios {
  return {
    listar(parametros) {
      const { buscar, orden, direccion, pagina } = parametrosDe(
        { orden: ORDENES_DE_SERVICIOS, direccionInicial: "desc" },
        parametros,
      );
      const estado = esquemaEstado.safeParse(parametros.estado).data ?? null;
      const clienteId = esquemaId.safeParse(parametros.clienteId).data ?? null;
      return transaccional.ejecutar(async (repos) => {
        const { filas, total } = await repos.servicios.listar({
          buscar,
          estado,
          clienteId,
          orden,
          direccion,
          saltear: (pagina - 1) * REGISTROS_POR_PAGINA,
          cantidad: REGISTROS_POR_PAGINA,
        });
        return {
          cabeceras: CABECERAS,
          ordenes: ORDENES_DE_SERVICIOS.map((columna) => ({
            columna,
            etiqueta: ETIQUETAS_DE_ORDEN[columna],
          })),
          registros: filas.map(({ id }) => ({ valor: { id } })),
          celdas: Object.fromEntries(
            filas.map((fila) => [
              fila.id,
              [
                fila.codigo,
                fila.titulo,
                fila.cliente,
                fila.tipo,
                ETIQUETAS_DE_ESTADO[fila.estado],
                fila.responsable,
                diaConBarras(fila.fechaPedido),
              ],
            ]),
          ),
          total,
          pagina,
          paginas: Math.max(1, Math.ceil(total / REGISTROS_POR_PAGINA)),
          buscar,
          orden,
          direccion,
          filtros: [
            {
              columna: "estado",
              etiqueta: "Estado",
              opciones: ESTADOS_SERVICIO.map((valor) => ({
                valor,
                texto: ETIQUETAS_DE_ESTADO[valor],
              })),
              elegido: estado ?? "",
            },
            {
              columna: "clienteId",
              etiqueta: "Cliente",
              opciones: await conDefinicion("Cliente", (clientes) =>
                opcionesDe(repos, clientes, "razonSocial"),
              ),
              elegido: clienteId ?? "",
            },
          ],
        };
      });
    },

    formulario(id) {
      return transaccional.ejecutar(async (repos) => {
        const actual = id === undefined ? null : await vigente(repos, id);
        const guardado: ValoresAbm = actual?.valor ?? {
          modalidad: "puntual",
        };
        const campos = camposDeServicio(
          await responsables(repos, actual?.valor.responsableId),
        );
        return {
          campos,
          elegibles: await elegiblesDe(repos, campos, guardado),
          escrito: Object.fromEntries(
            campos.flatMap(([nombre]) => {
              const valor = guardado[nombre];
              return typeof valor === "string" ? [[nombre, valor]] : [];
            }),
          ),
        };
      });
    },

    ver(id) {
      return transaccional.ejecutar(async (repos) => {
        const { valor } = await vigente(repos, id);
        const historial = await historialDe(repos, id);
        const estado = cicloServicio.estadoActual(historial);
        const quien = await nombresDeActores(repos);
        const [cliente] = await repos
          .abm("Cliente")
          .buscarPorIds([valor.clienteId]);
        const [tipo] = await repos
          .abm("TipoServicio")
          .buscarPorIds([valor.tipoServicioId]);
        const { registros: sitios } = await repos.abm("Sitio").listar({
          buscaEn: [],
          filtros: [{ columna: "clienteId", igual: valor.clienteId }],
          marcadas: [],
          mes: null,
          orden: "nombre",
          direccion: "asc",
          saltear: 0,
          cantidad: TODAS,
        });
        const marcados = new Set(await repos.servicios.sitiosDe(id));
        return {
          id: valor.id,
          codigo: valor.codigo,
          titulo: valor.titulo,
          estado: ETIQUETAS_DE_ESTADO[estado],
          datos: [
            ["Cliente", cliente?.valor.razonSocial ?? ""],
            ["Tipo de servicio", tipo?.valor.nombre ?? ""],
            ["Modalidad", etiquetaDe(MODALIDADES, valor.modalidad)],
            [
              "Responsable",
              quien({
                tipo: "persona",
                usuarioId: identificadorDesde<"Usuario">(valor.responsableId),
              }),
            ],
            ["Fecha de pedido", diaConBarras(valor.fechaPedido)],
            ...(valor.vigenciaDesde === null || valor.vigenciaHasta === null
              ? []
              : [
                  [
                    "Vigencia",
                    `${diaConBarras(valor.vigenciaDesde)} a ${diaConBarras(valor.vigenciaHasta)}`,
                  ] as const,
                ]),
            ...(valor.observaciones === null
              ? []
              : [["Observaciones", valor.observaciones] as const]),
          ],
          historial: historial.eventos
            .map(({ de, a, en, actor, origen }) => ({
              cuando: cuandoDe(en),
              de: de === null ? "" : ETIQUETAS_DE_ESTADO[de],
              a: ETIQUETAS_DE_ESTADO[a],
              quien: quien(actor),
              nota: origen ?? "",
            }))
            .reverse(),
          transiciones: transicionesDesde(estado).map((destino) => ({
            valor: destino,
            etiqueta: ETIQUETAS_DE_ESTADO[destino],
          })),
          sitios: sitios.map(({ valor: sitio }) => ({
            id: sitio.id,
            nombre: sitio.nombre,
            marcado: marcados.has(sitio.id),
          })),
          admiteBaja: admiteBaja(estado),
        };
      });
    },

    crear(actor, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const leido = await leer(repos, escrito, null);
        if (!leido.ok) {
          return leido;
        }
        // Una sola lectura del reloj: el año de la secuencia es el del código, y el alta y su evento son el mismo instante.
        const ahora = reloj.ahora();
        const enEsteInstante = RelojFijo(ahora);
        const codigo = generarCodigoLegible(enEsteInstante, {
          prefijo: PREFIJO,
          secuencia: await repos.secuencias.siguiente(PREFIJO, ahora.anio),
        });
        if (!codigo.ok) {
          throw nuevoError(catalogo.DOM_0006, { motivo: codigo.mensaje });
        }
        const id = identificadorDesde<string>(generadorId.generar());
        await repos.servicios.crear(
          actor,
          crearAuditable(
            { ...leido.datos, codigo: codigo.codigo, id },
            actor,
            enEsteInstante,
          ),
        );
        const [alta] = cicloServicio.crear(ESTADO_INICIAL, {
          en: ahora,
          actor,
          origen: null,
        }).eventos;
        await repos.servicios.agregarEvento(actor, id, {
          ...alta,
          posicion: 0,
        });
        return { ok: true, id };
      });
    },

    guardar(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const actual = await vigente(repos, id);
        const leido = await leer(repos, escrito, actual);
        if (!leido.ok) {
          return leido;
        }
        const nuevo = { ...actual.valor, ...leido.datos };
        const guardado: ValoresAbm = actual.valor;
        if (
          Object.entries(nuevo).every(
            ([campo, valor]) => guardado[campo] === valor,
          )
        ) {
          return { ok: true, id };
        }
        if (
          nuevo.clienteId !== actual.valor.clienteId &&
          (await repos.servicios.sitiosDe(id)).length > 0
        ) {
          return {
            ok: false,
            errores: {
              clienteId:
                "Este servicio abarca sitios de su cliente: desmarcalos antes de cambiarlo.",
            },
          };
        }
        const cambiado = marcarActualizado(actual, nuevo, actor, reloj);
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Servicio", id });
        }
        await repos.servicios.actualizar(actor, cambiado.valor, "actualizar");
        return { ok: true, id };
      });
    },

    marcarEliminado(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const actual = await vigente(repos, id);
        const estado = cicloServicio.estadoActual(await historialDe(repos, id));
        if (!admiteBaja(estado)) {
          throw nuevoError(catalogo.DOM_0011, { id, estado });
        }
        const eliminado = marcarEliminado(actual, actor, reloj);
        if (!eliminado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Servicio", id });
        }
        await repos.servicios.actualizar(actor, eliminado.valor, "eliminar");
      });
    },

    cambiarEstado(actor, id, a, nota) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        await vigente(repos, id);
        const destino = esquemaEstado.safeParse(a);
        const leida = esquemaNota.safeParse(nota);
        if (!destino.success || !leida.success) {
          throw nuevoError(catalogo.DOM_0011, { id, a });
        }
        const historial = await historialDe(repos, id);
        const resultado = cicloServicio.agregar(historial, destino.data, {
          en: reloj.ahora(),
          actor,
          origen: leida.data === "" ? null : leida.data,
        });
        if (!resultado.ok) {
          throw nuevoError(catalogo.DOM_0011, {
            id,
            de: resultado.error.de,
            a: resultado.error.a,
          });
        }
        const posicion = historial.eventos.length;
        const evento = resultado.valor.eventos[posicion];
        if (evento === undefined) {
          throw nuevoError(catalogo.INF_0001, {
            motivo: "el historial no agregó el evento",
          });
        }
        await repos.servicios.agregarEvento(actor, id, {
          ...evento,
          posicion,
        });
      });
    },

    guardarSitios(actor, id, sitioIds) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const { valor } = await vigente(repos, id);
        const pedidos = [...new Set(sitioIds)].sort();
        const sitios = pedidos.every(
          (sitioId) => esquemaId.safeParse(sitioId).success,
        )
          ? await repos.abm("Sitio").buscarPorIds(pedidos)
          : [];
        const deSuCliente = sitios.filter(
          (sitio) =>
            sitio.eliminadoEn === undefined &&
            sitio.valor.clienteId === valor.clienteId,
        );
        if (deSuCliente.length !== pedidos.length) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Sitio", id });
        }
        const actuales = await repos.servicios.sitiosDe(id);
        if ([...actuales].sort().join() !== pedidos.join()) {
          await repos.servicios.guardarSitios(
            actor,
            id,
            pedidos,
            reloj.ahora(),
          );
        }
      });
    },
  };
}
