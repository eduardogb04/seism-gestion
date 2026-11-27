/**
 * Los ajustes de facturación propuestos (R5, SYSTEM_SPEC §5.4 y §6.1): un
 * recargo o un descuento que cualquiera que escriba servicios propone en
 * «En ejecución» o «Finalizado» y que solo un administrador aprueba o rechaza
 * (con motivo). Un pendiente lo anula quien lo cargó.
 *
 * - Un recargo aprobado queda «por facturar»: su factura adicional sale desde
 *   su fila (`ajustes.ts`, que lo liga con `ligarAjuste`).
 * - Un descuento aprobado baja el saldo de la orden vigente; si ya se facturó
 *   todo, el exceso se acredita con una nota de crédito desde su fila.
 * - Las cuentas están en `cuentas-de-ajustes.ts`.
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
  formatearImporte,
  type Importe,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import {
  CLASES_DE_AJUSTE,
  type ClaseDeAjuste,
  type EstadoDeAjuste,
  importeDeAjuste,
} from "../../dominio/servicios/ajuste-facturacion.ts";
import { admiteCarga, cicloServicio } from "../../dominio/servicios/estados.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { DatosAjusteFacturacion } from "../../puertos/repositorios/ajustes-facturacion.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  cuandoDe,
  type ErroresPorCampo,
  nombresDeActores,
  validarEscrito,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  type Escrito,
  leerImporte,
  nombreDeMoneda,
} from "../abm/definicion.ts";
import { obligatorio, opcional } from "../abm/validaciones.ts";
import type {
  ArchivoSubido,
  DependenciasDeAdjuntos,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { historialDe } from "./ciclo.ts";
import {
  bajaDeAdjuntoOpcional,
  guardarAdjuntoOpcional,
  validarAdjuntoOpcional,
} from "./comprobantes.ts";
import {
  ajusteVigente,
  cuentasDeAjustes,
  importeAFacturar,
} from "./cuentas-de-ajustes.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const ETIQUETAS_DE_CLASE: Readonly<Record<ClaseDeAjuste, string>> = {
  recargo: "Recargo",
  descuento: "Descuento",
};

/** Un ajuste propuesto como se ve en la lista. */
export type AjustePropuesto = {
  readonly id: string;
  readonly clase: ClaseDeAjuste;
  readonly claseTexto: string;
  readonly concepto: string;
  /** Vacío si no se cargó. */
  readonly cantidad: string;
  readonly motivo: string;
  /** `+ ARS 1.000,00` o `− ARS 1.000,00`. */
  readonly importe: string;
  readonly estado: EstadoDeAjuste;
  readonly motivoRechazo: string;
  /** dd/mm/aaaa hh:mm de la carga. */
  readonly cargadoEn: string;
  readonly quien: string;
  readonly cargadoPorId: string;
  /** El número de la factura adicional o la nota de crédito que salió de él; vacío si no. */
  readonly factura: string;
  /** Aprobado y todavía sin comprobante: qué se puede emitir desde su fila. */
  readonly porEmitir: {
    readonly tipo: "adicional" | "nota_credito";
    /** El importe sin IVA que trae precargado. */
    readonly importe: string;
  } | null;
};

export type AjustesDelServicio = {
  readonly ajustes: readonly AjustePropuesto[];
  /** Si en la etapa actual del servicio se emiten las facturas adicionales y las notas de crédito. */
  readonly admiteEmitir: boolean;
};

type Resultado =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

export type CasosUsoAjustesDeFacturacion = {
  listar(servicioId: string): Promise<AjustesDelServicio>;
  /** El formulario de la propuesta: la moneda de la orden vigente va en las etiquetas. */
  formulario(
    servicioId: string,
  ): Promise<{ readonly campos: CamposAbm; readonly escrito: Escrito }>;
  proponer(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<Resultado>;
  /** Solo administrador. */
  aprobar(actor: Actor, id: string): Promise<void>;
  /** Solo administrador; el motivo en `escrito.motivo` es obligatorio. */
  rechazar(actor: Actor, id: string, escrito: Escrito): Promise<Resultado>;
  /** Solo quien lo cargó y mientras está pendiente. */
  anular(actor: Actor, id: string): Promise<void>;
};

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

function camposDe(moneda: Moneda | null): CamposAbm {
  const en = moneda === null ? "" : ` (${moneda})`;
  return [
    [
      "clase",
      {
        tipo: "opcion",
        etiqueta: "Qué es",
        opciones: CLASES_DE_AJUSTE.map((valor) => ({
          valor,
          etiqueta: ETIQUETAS_DE_CLASE[valor],
        })),
      },
    ],
    ["concepto", { tipo: "texto", etiqueta: "Concepto" }],
    [
      "cantidad",
      {
        tipo: "texto",
        etiqueta: "Cantidad (por ejemplo, 3 días)",
        opcional: true,
      },
    ],
    [
      "precioUnitario",
      {
        tipo: "texto",
        etiqueta: `Precio unitario sin IVA${en}, si hay cantidad`,
        opcional: true,
      },
    ],
    [
      "importe",
      {
        tipo: "texto",
        etiqueta: `Importe sin IVA${en}, si no hay precio unitario`,
        opcional: true,
      },
    ],
    ["motivo", { tipo: "textoLargo", etiqueta: "Motivo" }],
  ];
}

const VALIDACION = z.object({
  clase: z.enum(CLASES_DE_AJUSTE),
  concepto: obligatorio("el concepto", 200),
  cantidad: opcional(60),
  precioUnitario: opcional(40),
  importe: opcional(40),
  motivo: obligatorio("el motivo", 500),
});

const VALIDACION_DE_RECHAZO = z.object({
  motivo: obligatorio("el motivo del rechazo", 500),
});

const CAMPOS_DE_RECHAZO: CamposAbm = [
  ["motivo", { tipo: "textoLargo", etiqueta: "Motivo del rechazo" }],
];

export function crearCasosUsoAjustesDeFacturacion({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoAjustesDeFacturacion {
  const { reloj, generadorId } = adjuntos;

  async function exigirEtapa(
    repos: RepositoriosEnTransaccion,
    servicioId: string,
  ) {
    const estado = cicloServicio.estadoActual(
      await historialDe(repos, servicioId),
    );
    if (!admiteCarga(estado, "ajusteDeFacturacion")) {
      throw nuevoError(catalogo.DOM_0018, {
        id: servicioId,
        estado,
        carga: "ajusteDeFacturacion",
      });
    }
  }

  const exigirAdministrador = (
    repos: RepositoriosEnTransaccion,
    actor: Actor,
  ) => exigirRol(repos.usuarios, actor, ["administrador"], catalogo.AUT_0003);

  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const cuentas = await cuentasDeAjustes(repos, servicioId);
        const quien = await nombresDeActores(repos);
        const numeros = new Map<string, string>(
          (await repos.facturas.listarDe(servicioId)).map(({ valor }) => [
            valor.id,
            valor.numero,
          ]),
        );
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
        return {
          admiteEmitir: admiteCarga(estado, "ajuste"),
          ajustes: cuentas.ajustes.map((ajuste) => {
            const { valor } = ajuste;
            const aFacturar = importeAFacturar(cuentas, ajuste);
            const porEmitir =
              valor.estado === "aprobado" &&
              valor.facturaId === null &&
              aFacturar.centavos > 0n
                ? {
                    tipo:
                      valor.clase === "recargo"
                        ? ("adicional" as const)
                        : ("nota_credito" as const),
                    importe: formatearImporte(aFacturar),
                  }
                : null;
            return {
              id: valor.id,
              clase: valor.clase,
              claseTexto: ETIQUETAS_DE_CLASE[valor.clase],
              concepto: valor.concepto,
              cantidad: valor.cantidad ?? "",
              motivo: valor.motivo,
              importe: `${valor.clase === "recargo" ? "+" : "−"} ${formatearImporte(valor.importe)}`,
              estado: valor.estado,
              motivoRechazo: valor.motivoRechazo ?? "",
              cargadoEn: cuandoDe(ajuste.creadoEn),
              quien: quien(ajuste.creadoPor),
              cargadoPorId:
                ajuste.creadoPor.tipo === "persona"
                  ? ajuste.creadoPor.usuarioId
                  : "",
              factura:
                valor.facturaId === null
                  ? ""
                  : (numeros.get(valor.facturaId) ?? ""),
              porEmitir,
            };
          }),
        };
      });
    },

    formulario(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const orden = await repos.ordenesCompra.vigenteDe(servicioId);
        return {
          campos: camposDe(orden?.valor.importe.moneda ?? null),
          escrito: { clase: "recargo" },
        };
      });
    },

    proponer(actor, servicioId, escrito, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        await servicioVigenteBloqueado(repos, servicioId);
        await exigirEtapa(repos, servicioId);
        const orden = await repos.ordenesCompra.vigenteDe(servicioId);
        const moneda = orden?.valor.importe.moneda ?? null;
        const validado = validarEscrito(camposDe(moneda), VALIDACION, escrito);
        const adjunto = validarAdjuntoOpcional(archivo);
        const errores: Record<string, string> = validado.ok
          ? {}
          : { ...validado.errores };
        if (!adjunto.ok) {
          errores.archivo = adjunto.mensaje;
        }
        let precio: Importe<Moneda> | null = null;
        let directo: Importe<Moneda> | null = null;
        if (moneda === null) {
          errores.importe =
            "Cargá antes la orden de compra: el ajuste va en su moneda.";
        } else if (validado.ok) {
          for (const campo of ["precioUnitario", "importe"] as const) {
            const texto = validado.datos[campo];
            if (texto === null || texto === "") {
              continue;
            }
            const leido = leerImporte(campo, {
              [campo]: texto,
              [nombreDeMoneda(campo)]: moneda,
            } as Escrito);
            if ("error" in leido) {
              errores[campo] = leido.error;
            } else if (leido.valor.centavos <= 0n) {
              errores[campo] = "Tiene que ser mayor que cero.";
            } else if (campo === "precioUnitario") {
              precio = leido.valor;
            } else {
              directo = leido.valor;
            }
          }
        }
        const importe =
          validado.ok && moneda !== null
            ? importeDeAjuste(validado.datos.cantidad, precio, directo)
            : null;
        if (
          validado.ok &&
          moneda !== null &&
          importe === null &&
          Object.keys(errores).length === 0
        ) {
          if (precio === null) {
            errores.importe = "Escribí el importe o el precio unitario.";
          } else {
            errores.cantidad =
              "Con precio unitario, la cantidad empieza con un número (por ejemplo, 3 días).";
          }
        }
        if (
          !validado.ok ||
          !adjunto.ok ||
          importe === null ||
          Object.keys(errores).length > 0
        ) {
          return { ok: false, errores };
        }
        const { datos } = validado;
        const documentoId = await guardarAdjuntoOpcional(
          actor,
          repos,
          adjuntos,
          adjunto.archivo,
        );
        await repos.ajustesFacturacion.crear(
          actor,
          crearAuditable(
            {
              id: identificadorDesde<string>(generadorId.generar()),
              servicioId,
              clase: datos.clase,
              concepto: datos.concepto,
              cantidad: datos.cantidad === "" ? null : datos.cantidad,
              precioUnitario: precio,
              importe,
              motivo: datos.motivo,
              documentoId,
              estado: "pendiente",
              resueltoEn: null,
              resueltoPor: null,
              motivoRechazo: null,
              facturaId: null,
            } satisfies DatosAjusteFacturacion & { readonly id: string },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    aprobar(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirAdministrador(repos, actor);
        const ajuste = await ajusteVigente(repos, id);
        await servicioVigenteBloqueado(repos, ajuste.valor.servicioId);
        await exigirEtapa(repos, ajuste.valor.servicioId);
        if (ajuste.valor.estado !== "pendiente") {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Ajuste propuesto",
            id,
          });
        }
        const resuelto = marcarActualizado(
          ajuste,
          {
            ...ajuste.valor,
            estado: "aprobado",
            resueltoEn: reloj.ahora(),
            resueltoPor: actor.tipo === "persona" ? actor.usuarioId : null,
          },
          actor,
          reloj,
        );
        if (resuelto.ok) {
          await repos.ajustesFacturacion.actualizar(
            actor,
            resuelto.valor,
            "actualizar",
          );
        }
      });
    },

    rechazar(actor, id, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirAdministrador(repos, actor);
        const ajuste = await ajusteVigente(repos, id);
        await servicioVigenteBloqueado(repos, ajuste.valor.servicioId);
        await exigirEtapa(repos, ajuste.valor.servicioId);
        if (ajuste.valor.estado !== "pendiente") {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Ajuste propuesto",
            id,
          });
        }
        const validado = validarEscrito(
          CAMPOS_DE_RECHAZO,
          VALIDACION_DE_RECHAZO,
          escrito,
        );
        if (!validado.ok) {
          return validado;
        }
        const resuelto = marcarActualizado(
          ajuste,
          {
            ...ajuste.valor,
            estado: "rechazado",
            resueltoEn: reloj.ahora(),
            resueltoPor: actor.tipo === "persona" ? actor.usuarioId : null,
            motivoRechazo: validado.datos.motivo,
          },
          actor,
          reloj,
        );
        if (resuelto.ok) {
          await repos.ajustesFacturacion.actualizar(
            actor,
            resuelto.valor,
            "actualizar",
          );
        }
        return { ok: true };
      });
    },

    anular(actor, id) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const ajuste = await ajusteVigente(repos, id);
        const suyo =
          actor.tipo === "persona" &&
          ajuste.creadoPor.tipo === "persona" &&
          ajuste.creadoPor.usuarioId === actor.usuarioId;
        if (!suyo || ajuste.valor.estado !== "pendiente") {
          throw nuevoError(catalogo.AUT_0009, {
            actor: actor.tipo === "persona" ? actor.usuarioId : actor.proceso,
          });
        }
        await servicioVigenteBloqueado(repos, ajuste.valor.servicioId);
        const anulado = marcarEliminado(ajuste, actor, reloj);
        if (anulado.ok) {
          await repos.ajustesFacturacion.actualizar(
            actor,
            anulado.valor,
            "eliminar",
          );
          await bajaDeAdjuntoOpcional(
            actor,
            repos,
            reloj,
            ajuste.valor.documentoId,
          );
        }
      });
    },
  };
}
