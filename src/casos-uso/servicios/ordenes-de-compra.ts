/**
 * Las órdenes de compra de un servicio (F2-06, ADR 0036): adjudican el servicio
 * y fijan el total contra el que se factura. El importe se carga **sin IVA**; el
 * documento es opcional. Una orden no se edita; se anula, y no se anula una
 * que tiene facturas vigentes.
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción: el documento, si hay, la
 *   cabecera y el paso del servicio a «Adjudicado». Se carga solo en
 *   «Cotizado» y se anula solo en «Adjudicado» (`DOM-0018`, F3-01, ADR 0039);
 *   anularla vuelve el servicio a «Cotizado» (F3-03, ADR 0041).
 * - Lo que la persona corrige (un campo o el archivo) vuelve por campo, no se lanza.
 * - El saldo por facturar compara importes sin IVA y puede ser negativo.
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
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import {
  crearImporte,
  formatearImporte,
} from "../../dominio/compartido/importe.ts";
import { formatearISO } from "../../dominio/compartido/reloj.ts";
import { importeConSigno } from "../../dominio/servicios/comprobante.ts";
import {
  saldoDeOrden,
  totalDeOrden,
} from "../../dominio/servicios/orden-compra.ts";
import type {
  DatosOrdenCompra,
  OrdenCompra,
} from "../../puertos/repositorios/ordenes-de-compra.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  nombresDeActores,
  validarEscrito,
} from "../abm/abm.ts";
import { cambioVisible } from "../abm/cambio.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  MONEDAS,
  nombreDeMoneda,
} from "../abm/definicion.ts";
import {
  cambioDeDocumento,
  obligatorio,
  opcional,
} from "../abm/validaciones.ts";
import type {
  ArchivoSubido,
  DependenciasDeAdjuntos,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { cambiarPorCausa, exigirEtapa } from "./ciclo.ts";
import {
  bajaDeAdjuntoOpcional,
  CAMPO_DE_CAMBIO,
  type CambioListado,
  type DocumentoListado,
  documentosListados,
  formularioDeCambio,
  guardarAdjuntoOpcional,
  guardarCambio,
  importeMayorQueCero,
  type ResultadoDeCambio,
  validarAdjuntoOpcional,
} from "./comprobantes.ts";
import { sincronizarRenovacionDeContrato } from "./generacion-de-vencimientos.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const esquemaId = z.uuid();

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeOrden =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Una ampliación de una orden de compra, como se ve debajo de ella. */
export type AmpliacionListada = {
  readonly id: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** Lo que suma, sin IVA, en la moneda de la orden: `ARS 1.000,00`. */
  readonly importe: string;
  /** dd/mm/aaaa si cambió el fin del servicio, `null` si no. */
  readonly nuevaFechaFin: string | null;
  readonly observaciones: string;
  readonly documento: DocumentoListado | null;
};

/** Una orden de compra como se ve en la tabla del servicio. */
export type OrdenListada = {
  readonly id: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** Sin IVA y con las ampliaciones: `ARS 12.500,00`. */
  readonly total: string;
  /** Sin IVA, antes de las ampliaciones. */
  readonly importeOriginal: string;
  /** Las ampliaciones vigentes, la más nueva primero. */
  readonly ampliaciones: readonly AmpliacionListada[];
  /** dd/mm/aaaa si otra orden la reemplazó: queda en la historia, sin ampliar ni anular. */
  readonly reemplazadaEl: string | null;
  /** Las facturas en la moneda de la orden, sin IVA. */
  readonly facturado: string;
  /** El total menos lo facturado; con signo menos si se facturó de más. */
  readonly saldo: string;
  /** Si se facturó de más, cuánto: avisa, no impide. */
  readonly aviso: string | null;
  /** Las facturas en otra moneda, que no suman: `0000-0002 · USD 100,00`. */
  readonly otraMoneda: readonly string[];
  /** Pesos por dólar: solo si es en dólares; avisa si falta. */
  readonly cambio: CambioListado;
  readonly observaciones: string;
  readonly documento: DocumentoListado | null;
  /** El email de quien la cargó. */
  readonly quien: string;
};

export type CasosUsoOrdenesDeCompra = {
  /** Las no anuladas, la más nueva primero, con su saldo. */
  listar(servicioId: string): Promise<readonly OrdenListada[]>;
  /** El formulario de la próxima: trae la fecha de hoy. */
  formulario(servicioId: string): Promise<{
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** `archivo` es `null` si no se eligió ninguno: el documento es opcional. */
  crear(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeOrden>;
  /** Carga una orden nueva que reemplaza a la vigente: la anterior queda en la historia con sus facturas. */
  reemplazar(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeOrden>;
  /** El formulario de una ampliación de la orden: trae la fecha de hoy y la moneda de la orden. */
  formularioDeAmpliacion(ordenId: string): Promise<{
    readonly numero: string;
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** Suma importe a la orden vigente; si trae nueva fecha de fin, mueve la vigencia del servicio. */
  ampliar(
    actor: Actor,
    ordenId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeOrden>;
  /** Anula una ampliación (baja lógica, con su documento); la fecha de fin no se revierte. */
  anularAmpliacion(actor: Actor, id: string): Promise<void>;
  /** El formulario para completar o cambiar su tipo de cambio, con lo que ya tiene. */
  formularioDeCambio(id: string): Promise<{
    readonly numero: string;
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** Completa o cambia el tipo de cambio de una orden ya cargada, con las reglas del alta. */
  guardarTipoDeCambio(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeCambio>;
  /** La anula (baja lógica, con su documento). `DOM-0014` si tiene facturas vigentes. */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
};

const CAMPOS: CamposAbm = [
  ["numero", { tipo: "texto", etiqueta: "Número" }],
  ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
  ["importe", { tipo: "importe", etiqueta: "Importe sin IVA" }],
  CAMPO_DE_CAMBIO,
  ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
];

/** Lo que se escribe en el formulario: la cabecera sin lo que pone el sistema. */
type DatosEscritos = Omit<
  DatosOrdenCompra,
  "servicioId" | "documentoId" | "reemplazadaEn" | "reemplazadaPorId"
>;

const CAMPOS_DE_AMPLIACION: CamposAbm = [
  ["numero", { tipo: "texto", etiqueta: "Número" }],
  ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
  ["importe", { tipo: "importe", etiqueta: "Monto adicional sin IVA" }],
  [
    "nuevaFechaFin",
    { tipo: "fecha", etiqueta: "Nueva fecha de fin", opcional: true },
  ],
  ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
];

type AmpliacionEscrita = {
  readonly numero: string;
  readonly fecha: string;
  readonly importe: {
    readonly centavos: bigint;
    readonly moneda: "ARS" | "USD";
  };
  readonly nuevaFechaFin: string | null;
  readonly observaciones: string | null;
};

const VALIDACION_DE_AMPLIACION: z.ZodType<AmpliacionEscrita> = z.object({
  numero: obligatorio("el número", 40),
  fecha: z.string(),
  importe: importeMayorQueCero,
  nuevaFechaFin: z.string().nullable(),
  observaciones: opcional(2000),
});

/** El total de la orden: su importe más sus ampliaciones vigentes. */
export async function totalConAmpliaciones(
  repos: RepositoriosEnTransaccion,
  orden: OrdenCompra,
) {
  const ampliaciones = await repos.ampliaciones.listarDe([orden.valor.id]);
  return totalDeOrden(
    orden.valor.importe,
    ampliaciones.map(({ valor }) => ({
      importe: crearImporte(valor.importeCentavos, orden.valor.importe.moneda),
    })),
  );
}

async function ordenVigenteDe(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<OrdenCompra> {
  const orden = esquemaId.safeParse(id).success
    ? await repos.ordenesCompra.buscarPorId(id)
    : null;
  if (
    orden === null ||
    orden.eliminadoEn !== undefined ||
    orden.valor.reemplazadaEn !== null
  ) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Orden de compra", id });
  }
  return orden;
}

const VALIDACION: z.ZodType<DatosEscritos> = z.object({
  numero: obligatorio("el número", 40),
  fecha: z.string(),
  importe: importeMayorQueCero,
  cambio: cambioDeDocumento,
  observaciones: opcional(2000),
});

export function crearCasosUsoOrdenesDeCompra({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoOrdenesDeCompra {
  const { reloj, generadorId } = adjuntos;
  /** La carga normal (Cotizado → Adjudicado) o el reemplazo de la vigente, que no cambia la etapa. */
  function cargar(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
    reemplaza: boolean,
  ): Promise<ResultadoDeOrden> {
    return transaccional.ejecutar(async (repos) => {
      await exigirRol(
        repos.usuarios,
        actor,
        ROLES_QUE_ESCRIBEN_SERVICIOS,
        catalogo.AUT_0009,
      );
      await servicioVigenteBloqueado(repos, servicioId);
      await exigirEtapa(
        repos,
        servicioId,
        reemplaza ? "reemplazoDeOrden" : "ordenDeCompra",
      );
      const anterior = reemplaza
        ? await repos.ordenesCompra.vigenteDe(servicioId)
        : undefined;
      if (reemplaza && anterior === undefined) {
        throw nuevoError(catalogo.DOM_0009, {
          entidad: "Orden de compra",
          id: servicioId,
        });
      }
      const validado = validarEscrito(CAMPOS, VALIDACION, escrito);
      const adjunto = validarAdjuntoOpcional(archivo);
      if (!validado.ok || !adjunto.ok) {
        return {
          ok: false,
          errores: {
            ...(validado.ok ? {} : validado.errores),
            ...(adjunto.ok ? {} : { archivo: adjunto.mensaje }),
          },
        };
      }
      const documentoId = await guardarAdjuntoOpcional(
        actor,
        repos,
        adjuntos,
        adjunto.archivo,
      );
      const id = identificadorDesde<string>(generadorId.generar());
      await repos.ordenesCompra.crear(
        actor,
        crearAuditable(
          {
            ...validado.datos,
            servicioId,
            documentoId,
            reemplazadaEn: null,
            reemplazadaPorId: null,
            id,
          },
          actor,
          reloj,
        ),
      );
      if (anterior !== undefined) {
        const marcada = marcarActualizado(
          anterior,
          {
            ...anterior.valor,
            reemplazadaEn: reloj.ahora(),
            reemplazadaPorId: id,
          },
          actor,
          reloj,
        );
        if (!marcada.ok) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Orden de compra",
            id: anterior.valor.id,
          });
        }
        await repos.ordenesCompra.actualizar(
          actor,
          marcada.valor,
          "actualizar",
        );
      } else {
        await cambiarPorCausa(
          actor,
          repos,
          reloj,
          servicioId,
          "ordenDeCompra",
          `Orden de compra ${validado.datos.numero} cargada`,
        );
      }
      return { ok: true, id };
    });
  }

  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const ordenes = await repos.ordenesCompra.listarDe(servicioId);
        const deLaFactura = await repos.facturas.listarDe(servicioId);
        const documento = await documentosListados(
          repos,
          ordenes.map(({ valor }) => valor.documentoId),
        );
        const quien = await nombresDeActores(repos);
        const deLaOrden = await repos.ampliaciones.listarDe(
          ordenes.map(({ valor }) => valor.id),
        );
        const documentoDeAmpliacion = await documentosListados(
          repos,
          deLaOrden.map(({ valor }) => valor.documentoId),
        );
        return ordenes.map(({ valor, creadoPor }) => {
          const ampliaciones = deLaOrden.filter(
            ({ valor: a }) => a.ordenCompraId === valor.id,
          );
          const { total, facturado, saldo, otraMoneda } = saldoDeOrden(
            totalDeOrden(
              valor.importe,
              ampliaciones.map(({ valor: a }) => ({
                importe: crearImporte(a.importeCentavos, valor.importe.moneda),
              })),
            ),
            deLaFactura
              .filter(
                ({ valor: factura }) => factura.ordenCompraId === valor.id,
              )
              .map(({ valor: { numero, tipo, importe } }) => ({
                numero,
                importe: importeConSigno(tipo, importe),
              })),
          );
          return {
            id: valor.id,
            numero: valor.numero,
            fecha: diaConBarras(valor.fecha),
            total: formatearImporte(total),
            importeOriginal: formatearImporte(valor.importe),
            ampliaciones: ampliaciones.map(({ valor: a }) => ({
              id: a.id,
              numero: a.numero,
              fecha: diaConBarras(a.fecha),
              importe: formatearImporte(
                crearImporte(a.importeCentavos, valor.importe.moneda),
              ),
              nuevaFechaFin:
                a.nuevaFechaFin === null ? null : diaConBarras(a.nuevaFechaFin),
              observaciones: a.observaciones ?? "",
              documento: documentoDeAmpliacion(a.documentoId),
            })),
            reemplazadaEl:
              valor.reemplazadaEn === null
                ? null
                : diaConBarras(formatearISO(valor.reemplazadaEn).slice(0, 10)),
            facturado: formatearImporte(facturado),
            saldo: formatearImporte(saldo),
            aviso:
              saldo.centavos < 0n
                ? `Se facturó ${formatearImporte(crearImporte(-saldo.centavos, saldo.moneda))} más que la orden de compra`
                : null,
            otraMoneda: otraMoneda.map(
              (factura) =>
                `${factura.numero} · ${formatearImporte(factura.importe)}`,
            ),
            cambio: cambioVisible(valor.cambio, valor.importe.moneda),
            observaciones: valor.observaciones ?? "",
            documento: documento(valor.documentoId),
            quien: quien(creadoPor),
          };
        });
      });
    },

    formulario(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        return {
          campos: CAMPOS,
          escrito: {
            fecha: formatearISO(reloj.ahora()).slice(0, 10),
            [nombreDeMoneda("importe")]: MONEDAS[0],
          },
        };
      });
    },

    crear(actor, servicioId, escrito, archivo) {
      return cargar(actor, servicioId, escrito, archivo, false);
    },

    reemplazar(actor, servicioId, escrito, archivo) {
      return cargar(actor, servicioId, escrito, archivo, true);
    },

    formularioDeAmpliacion(ordenId) {
      return transaccional.ejecutar(async (repos) => {
        const orden = await ordenVigenteDe(repos, ordenId);
        return {
          numero: orden.valor.numero,
          campos: CAMPOS_DE_AMPLIACION,
          escrito: {
            fecha: formatearISO(reloj.ahora()).slice(0, 10),
            [nombreDeMoneda("importe")]: orden.valor.importe.moneda,
          },
        };
      });
    },

    ampliar(actor, ordenId, escrito, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const orden = await ordenVigenteDe(repos, ordenId);
        const { servicioId } = orden.valor;
        const servicio = await servicioVigenteBloqueado(repos, servicioId);
        await exigirEtapa(repos, servicioId, "ampliacionDeOrden");
        const validado = validarEscrito(
          CAMPOS_DE_AMPLIACION,
          VALIDACION_DE_AMPLIACION,
          escrito,
        );
        const adjunto = validarAdjuntoOpcional(archivo);
        const laMoneda =
          validado.ok &&
          validado.datos.importe.moneda !== orden.valor.importe.moneda;
        if (!validado.ok || !adjunto.ok || laMoneda) {
          return {
            ok: false,
            errores: {
              ...(validado.ok ? {} : validado.errores),
              ...(laMoneda
                ? {
                    importe: `Tiene que ser en la moneda de la orden (${orden.valor.importe.moneda}).`,
                  }
                : {}),
              ...(adjunto.ok ? {} : { archivo: adjunto.mensaje }),
            },
          };
        }
        const documentoId = await guardarAdjuntoOpcional(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        const id = identificadorDesde<string>(generadorId.generar());
        const { importe, ...datos } = validado.datos;
        await repos.ampliaciones.crear(
          actor,
          crearAuditable(
            {
              ...datos,
              importeCentavos: importe.centavos,
              ordenCompraId: ordenId,
              documentoId,
              id,
            },
            actor,
            reloj,
          ),
        );
        // La nueva fecha de fin mueve la vigencia del servicio; anular la ampliación no la revierte.
        const fin = validado.datos.nuevaFechaFin;
        if (fin !== null && fin !== servicio.valor.vigenciaHasta) {
          const movido = marcarActualizado(
            servicio,
            { ...servicio.valor, vigenciaHasta: fin },
            actor,
            reloj,
          );
          if (!movido.ok) {
            throw nuevoError(catalogo.DOM_0009, {
              entidad: "Servicio",
              id: servicioId,
            });
          }
          await repos.servicios.actualizar(actor, movido.valor, "actualizar");
          await sincronizarRenovacionDeContrato(
            actor,
            repos,
            reloj,
            generadorId,
            servicioId,
            fin,
          );
        }
        return { ok: true, id };
      });
    },

    anularAmpliacion(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const actual = esquemaId.safeParse(id).success
          ? await repos.ampliaciones.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (actual === null || eliminada === null || !eliminada.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Ampliación", id });
        }
        const orden = await ordenVigenteDe(repos, actual.valor.ordenCompraId);
        await servicioVigenteBloqueado(repos, orden.valor.servicioId);
        await exigirEtapa(repos, orden.valor.servicioId, "ampliacionDeOrden");
        await repos.ampliaciones.actualizar(actor, eliminada.valor, "eliminar");
        await bajaDeAdjuntoOpcional(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
      });
    },

    formularioDeCambio(id) {
      return transaccional.ejecutar(async (repos) => {
        const orden = esquemaId.safeParse(id).success
          ? await repos.ordenesCompra.buscarPorId(id)
          : null;
        if (orden === null || orden.eliminadoEn !== undefined) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Orden de compra",
            id,
          });
        }
        return {
          numero: orden.valor.numero,
          ...formularioDeCambio(orden.valor),
        };
      });
    },

    guardarTipoDeCambio(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        return guardarCambio(
          actor,
          reloj,
          repos.ordenesCompra,
          "Orden de compra",
          id,
          escrito,
        );
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
        const actual = esquemaId.safeParse(id).success
          ? await repos.ordenesCompra.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (
          actual === null ||
          actual.valor.reemplazadaEn !== null ||
          eliminada === null ||
          !eliminada.ok
        ) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Orden de compra",
            id,
          });
        }
        // Con la fila del servicio tomada, una factura de esta orden no se carga a la vez.
        await servicioVigenteBloqueado(repos, actual.valor.servicioId);
        await exigirEtapa(
          repos,
          actual.valor.servicioId,
          "anulacionDeOrdenDeCompra",
        );
        const facturas = await repos.facturas.listarDe(actual.valor.servicioId);
        if (facturas.some(({ valor }) => valor.ordenCompraId === id)) {
          throw nuevoError(catalogo.DOM_0014, { id });
        }
        await repos.ordenesCompra.actualizar(
          actor,
          eliminada.valor,
          "eliminar",
        );
        await bajaDeAdjuntoOpcional(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
        // La que esta había reemplazado vuelve a ser la vigente.
        for (const { valor, ...anterior } of await repos.ordenesCompra.listarDe(
          actual.valor.servicioId,
        )) {
          if (valor.reemplazadaPorId === id) {
            const vuelta = marcarActualizado(
              { valor, ...anterior },
              { ...valor, reemplazadaEn: null, reemplazadaPorId: null },
              actor,
              reloj,
            );
            if (vuelta.ok) {
              await repos.ordenesCompra.actualizar(
                actor,
                vuelta.valor,
                "actualizar",
              );
            }
          }
        }
        // Sin orden vigente vuelve a «Cotizado» (F3-03, ADR 0041); la modalidad y las cuotas quedan.
        if (
          (await repos.ordenesCompra.listarDe(actual.valor.servicioId))
            .length === 0
        ) {
          await cambiarPorCausa(
            actor,
            repos,
            reloj,
            actual.valor.servicioId,
            "anulacionDeOrdenDeCompra",
            `Orden de compra ${actual.valor.numero} anulada`,
          );
        }
      });
    },
  };
}
