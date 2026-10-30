/**
 * La modalidad de facturación de un servicio, su cuota mensual y lo devengado
 * (F3-03, ADR 0041). La modalidad se elige y se cambia solo en «Adjudicado»
 * (un servicio que llegó a «En ejecución» sin ella todavía puede elegirla) y
 * la cuota se ajusta en «Adjudicado» y «En ejecución» (`DOM-0018`, F6-02);
 * la modalidad no cambia si hay facturas vigentes (`DOM-0019`). Un ajuste rige
 * desde su mes en adelante y ese mes no puede haber pasado según el reloj inyectado (`DOM-0020`): así nunca
 * cambia lo ya devengado.
 *
 * Lo que se muestra por moneda sale del dominio: el devengado y el por facturar
 * de `devengadoPorMoneda`, el saldo de la orden de `saldoDeOrden` (F2-06) y el
 * por cobrar del saldo de cada factura (`conCobrosDe`, F2-07). A la orden y a lo
 * devengado los mueven las facturas no adicionales y las notas que cuelgan de
 * ellas, con su signo (`cuentaParaLaOrden`, F6-03): la factura adicional suma a
 * lo facturado y a lo por cobrar, no a lo que falta facturar.
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
  formatearMonto,
  type Importe,
  type Moneda,
} from "../../dominio/compartido/importe.ts";
import type { FechaHora, Reloj } from "../../dominio/compartido/reloj.ts";
import { sumaEn } from "../../dominio/servicios/avance.ts";
import {
  cuentaParaLaOrden,
  importeConSigno,
} from "../../dominio/servicios/comprobante.ts";
import {
  type Cuota,
  cuotaDelMes,
  devengadoPorMoneda,
  periodoAFacturar,
} from "../../dominio/servicios/devengado.ts";
import {
  cicloServicio,
  MODALIDADES_DE_FACTURACION,
  type ModalidadDeFacturacion,
} from "../../dominio/servicios/estados.ts";
import { saldoDeOrden } from "../../dominio/servicios/orden-compra.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { CuotaGuardada } from "../../puertos/repositorios/cuotas.ts";
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
  errorDeFecha,
  leerImporte,
  nombreDeMoneda,
} from "../abm/definicion.ts";
import { nombreDelMes } from "../compartido/meses.ts";
import { mesDe, primerDia } from "../tablero/mes.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import { exigirEtapa, historialDe } from "./ciclo.ts";
import { comprobanteDe, conCobrosDe } from "./cobranza.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type ResultadoDeFacturacion =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

const ETIQUETAS_DE_MODALIDAD: Readonly<Record<ModalidadDeFacturacion, string>> =
  {
    puntual: "Puntual",
    por_hitos: "Por hitos (libre)",
    mensual: "Mensual",
  };

/** Una cuota o un ajuste, como se ve en el historial. */
export type CuotaListada = {
  readonly id: string;
  /** `agosto de 2031`. */
  readonly desde: string;
  readonly importe: string;
  /** dd/mm/aaaa hh:mm. */
  readonly cuando: string;
  readonly quien: string;
};

/** Lo de una moneda a la fecha del reloj, todo sin IVA salvo lo por cobrar. */
export type LineaDeFacturacion = {
  readonly moneda: Moneda;
  readonly devengado: string;
  /** Negativo si se facturó de más. */
  readonly porFacturar: string;
  /** El saldo de la orden de compra si es de esta moneda; si no, vacío. */
  readonly saldoDeOrden: string;
  /** El saldo de las facturas vigentes, con IVA. */
  readonly porCobrar: string;
};

export type Facturacion = {
  /** La etiqueta, o `null` si todavía no se eligió. */
  readonly modalidad: string | null;
  readonly esMensual: boolean;
  /** La cuota inicial primero y después los ajustes, en el orden en que se cargaron. */
  readonly cuotas: readonly CuotaListada[];
  /** `octubre de 2026`: el mes del reloj, al que se calcula lo devengado. */
  readonly alMes: string;
  readonly lineas: readonly LineaDeFacturacion[];
};

export type CasosUsoFacturacion = {
  ver(servicioId: string): Promise<Facturacion>;
  /** Para elegir la modalidad: con la que tiene y, si es mensual, su cuota y su mes de inicio. */
  formularioDeModalidad(servicioId: string): Promise<{
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** Para ajustar la cuota: propone el mes del reloj. */
  formularioDeAjuste(servicioId: string): Promise<{
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** Elige o cambia la modalidad; en mensual, con la cuota y el mes de inicio. Da de baja las cuotas que tenía. */
  cambiarModalidad(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<ResultadoDeFacturacion>;
  /** Un ajuste de la cuota mensual, desde el mes de `escrito.desde`. */
  registrarAjuste(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
  ): Promise<ResultadoDeFacturacion>;
};

const OPCIONES_DE_MODALIDAD = MODALIDADES_DE_FACTURACION.map((valor) => ({
  valor,
  etiqueta: ETIQUETAS_DE_MODALIDAD[valor],
}));

const VALIDACION_DE_MODALIDAD = z.object({
  modalidad: z.enum(MODALIDADES_DE_FACTURACION),
});

const CAMPO_DESDE = { tipo: "fecha", etiqueta: "Rige desde" } as const;

function campoDeCuota(moneda: Moneda | null) {
  return {
    tipo: "texto",
    etiqueta:
      moneda === null
        ? "Cuota mensual sin IVA"
        : `Cuota mensual sin IVA (${moneda})`,
  } as const;
}

function camposDeModalidad(moneda: Moneda | null): CamposAbm {
  return [
    [
      "modalidad",
      {
        tipo: "opcion",
        etiqueta: "Modalidad de facturación",
        opciones: OPCIONES_DE_MODALIDAD,
      },
    ],
    [
      "cuota",
      {
        ...campoDeCuota(moneda),
        etiqueta: `${campoDeCuota(moneda).etiqueta}, solo si es mensual`,
        opcional: true,
      },
    ],
    [
      "desde",
      {
        tipo: "fecha",
        etiqueta: "Mes de inicio (cualquier día del mes), solo si es mensual",
        opcional: true,
      },
    ],
  ];
}

function camposDeAjuste(moneda: Moneda | null): CamposAbm {
  return [
    ["cuota", campoDeCuota(moneda)],
    ["desde", CAMPO_DESDE],
  ];
}

/** El día 1 del mes de un día `aaaa-mm-dd` ya validado. */
function primerDiaDe(dia: string): FechaHora {
  const mes = primerDia(dia.slice(0, 7));
  if (mes === null) {
    throw nuevoError(catalogo.INF_0001, { motivo: "un día que no es un día" });
  }
  return mes;
}

const cuotasDelDominio = (cuotas: readonly CuotaGuardada[]): readonly Cuota[] =>
  cuotas.map(({ valor }) => ({
    desde: primerDiaDe(valor.desdeMes),
    importe: valor.importe,
  }));

/** La moneda de la cuota: la de la orden de compra vigente del servicio, si tiene. */
async function monedaDeLaOrden(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
): Promise<Moneda | null> {
  const [orden] = await repos.ordenesCompra.listarDe(servicioId);
  return orden?.valor.importe.moneda ?? null;
}

type CuotaLeida =
  | {
      readonly ok: true;
      readonly importe: Importe<Moneda>;
      /** `aaaa-mm-01`. */
      readonly desdeMes: string;
    }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** La cuota (en la moneda de la orden) y el mes desde el que rige, o lo que la persona tiene que corregir. */
function leerCuota(escrito: Escrito, moneda: Moneda | null): CuotaLeida {
  const errores: Record<string, string> = {};
  let importe: Importe<Moneda> | null = null;
  if (moneda === null) {
    errores.cuota = "Cargá antes la orden de compra: la cuota va en su moneda.";
  } else {
    const leido = leerImporte("cuota", {
      cuota: escrito.cuota ?? "",
      [nombreDeMoneda("cuota")]: moneda,
    });
    if ("error" in leido) {
      errores.cuota = leido.error;
    } else if (leido.valor.centavos <= 0n) {
      errores.cuota = "La cuota tiene que ser mayor que cero.";
    } else {
      importe = leido.valor;
    }
  }
  const desde = escrito.desde ?? "";
  const errorDelMes = errorDeFecha(CAMPO_DESDE, desde);
  if (errorDelMes !== undefined) {
    errores.desde = errorDelMes;
  }
  return importe === null || errorDelMes !== undefined
    ? { ok: false, errores }
    : { ok: true, importe, desdeMes: `${desde.slice(0, 7)}-01` };
}

async function exigirParaEscribir(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  servicioId: string,
  carga: "modalidad" | "cuota",
) {
  await exigirRol(
    repos.usuarios,
    actor,
    ROLES_QUE_ESCRIBEN_SERVICIOS,
    catalogo.AUT_0009,
  );
  const servicio = await servicioVigenteBloqueado(repos, servicioId);
  // Los servicios que ya estaban en ejecución antes de que la modalidad se fijara en «Adjudicado» no podrían facturar.
  const eligeLaQueFalta =
    carga === "modalidad" &&
    servicio.valor.modalidadFacturacion === null &&
    cicloServicio.estadoActual(await historialDe(repos, servicioId)) ===
      "en_ejecucion";
  if (!eligeLaQueFalta) {
    await exigirEtapa(repos, servicioId, carga);
  }
  return servicio;
}

export function crearCasosUsoFacturacion({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoFacturacion {
  async function agregarCuota(
    actor: Actor,
    repos: RepositoriosEnTransaccion,
    servicioId: string,
    { importe, desdeMes }: Extract<CuotaLeida, { readonly ok: true }>,
  ): Promise<void> {
    await repos.cuotas.crear(
      actor,
      crearAuditable(
        {
          importe,
          desdeMes,
          servicioId,
          posicion: await repos.cuotas.cantidadDe(servicioId),
          id: identificadorDesde<string>(generadorId.generar()),
        },
        actor,
        reloj,
      ),
    );
  }

  return {
    ver(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const servicio = await servicioVigente(repos, servicioId);
        const { modalidadFacturacion } = servicio.valor;
        const estado = cicloServicio.estadoActual(
          await historialDe(repos, servicioId),
        );
        const [orden] = await repos.ordenesCompra.listarDe(servicioId);
        const vigentes = await repos.facturas.listarDe(servicioId);
        const facturas = await conCobrosDe(repos, vigentes);
        const comprobantes = vigentes.map(comprobanteDe);
        const sinIva = vigentes
          .filter((factura) =>
            cuentaParaLaOrden(comprobanteDe(factura), comprobantes),
          )
          .map(({ valor }) => importeConSigno(valor.tipo, valor.importe));
        const cuotas = await repos.cuotas.listarDe(servicioId);
        const quien = await nombresDeActores(repos);
        const hoy = reloj.ahora();
        const saldo =
          orden === undefined
            ? null
            : saldoDeOrden(
                orden.valor.importe,
                sinIva.map((importe) => ({ importe })),
              ).saldo;
        return {
          modalidad:
            modalidadFacturacion === null
              ? null
              : ETIQUETAS_DE_MODALIDAD[modalidadFacturacion],
          esMensual: modalidadFacturacion === "mensual",
          cuotas: cuotas.map(({ valor, creadoEn, creadoPor }) => ({
            id: valor.id,
            desde: nombreDelMes(primerDiaDe(valor.desdeMes)),
            importe: formatearImporte(valor.importe),
            cuando: cuandoDe(creadoEn),
            quien: quien(creadoPor),
          })),
          alMes: nombreDelMes(hoy),
          lineas: devengadoPorMoneda({
            modalidad: modalidadFacturacion,
            estado,
            orden: orden?.valor.importe ?? null,
            facturas: sinIva,
            cuotas: cuotasDelDominio(cuotas),
            fecha: hoy,
          }).map(({ moneda, devengado, porFacturar }) => ({
            moneda,
            devengado: formatearImporte(devengado),
            porFacturar: formatearImporte(porFacturar),
            saldoDeOrden:
              saldo?.moneda === moneda ? formatearImporte(saldo) : "",
            porCobrar: formatearImporte(
              sumaEn(
                moneda,
                facturas.map(({ saldo: deLaFactura }) => deLaFactura.saldo),
              ),
            ),
          })),
        };
      });
    },

    formularioDeModalidad(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        const { valor } = await servicioVigente(repos, servicioId);
        const [inicial] = await repos.cuotas.listarDe(servicioId);
        return {
          campos: camposDeModalidad(await monedaDeLaOrden(repos, servicioId)),
          escrito: {
            ...(valor.modalidadFacturacion === null
              ? {}
              : { modalidad: valor.modalidadFacturacion }),
            ...(inicial === undefined
              ? {}
              : {
                  cuota: formatearMonto(inicial.valor.importe),
                  desde: inicial.valor.desdeMes,
                }),
          },
        };
      });
    },

    formularioDeAjuste(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        return {
          campos: camposDeAjuste(await monedaDeLaOrden(repos, servicioId)),
          escrito: { desde: `${mesDe(reloj.ahora())}-01` },
        };
      });
    },

    cambiarModalidad(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const servicio = await exigirParaEscribir(
          actor,
          repos,
          servicioId,
          "modalidad",
        );
        if ((await repos.facturas.listarDe(servicioId)).length > 0) {
          throw nuevoError(catalogo.DOM_0019, { id: servicioId });
        }
        const moneda = await monedaDeLaOrden(repos, servicioId);
        const elegida = validarEscrito(
          camposDeModalidad(moneda),
          VALIDACION_DE_MODALIDAD,
          escrito,
        );
        if (!elegida.ok) {
          return elegida;
        }
        const { modalidad } = elegida.datos;
        const cuota =
          modalidad === "mensual" ? leerCuota(escrito, moneda) : null;
        if (cuota !== null && !cuota.ok) {
          return cuota;
        }
        const anteriores = await repos.cuotas.listarDe(servicioId);
        const [inicial] = anteriores;
        const igual =
          modalidad === servicio.valor.modalidadFacturacion &&
          (cuota === null ||
            (anteriores.length === 1 &&
              inicial?.valor.desdeMes === cuota.desdeMes &&
              inicial.valor.importe.centavos === cuota.importe.centavos));
        if (igual) {
          return { ok: true };
        }
        const cambiado = marcarActualizado(
          servicio,
          { ...servicio.valor, modalidadFacturacion: modalidad },
          actor,
          reloj,
        );
        if (!cambiado.ok) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Servicio",
            id: servicioId,
          });
        }
        await repos.servicios.actualizar(actor, cambiado.valor, "actualizar");
        for (const anterior of anteriores) {
          const eliminada = marcarEliminado(anterior, actor, reloj);
          if (eliminada.ok) {
            await repos.cuotas.actualizar(actor, eliminada.valor, "eliminar");
          }
        }
        if (cuota !== null) {
          await agregarCuota(actor, repos, servicioId, cuota);
        }
        return { ok: true };
      });
    },

    registrarAjuste(actor, servicioId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        const servicio = await exigirParaEscribir(
          actor,
          repos,
          servicioId,
          "cuota",
        );
        if (servicio.valor.modalidadFacturacion !== "mensual") {
          throw nuevoError(catalogo.DOM_0022, { id: servicioId });
        }
        const cuota = leerCuota(
          escrito,
          await monedaDeLaOrden(repos, servicioId),
        );
        if (!cuota.ok) {
          return cuota;
        }
        const [inicial] = await repos.cuotas.listarDe(servicioId);
        // Dos `aaaa-mm-01` se comparan como texto.
        const desdeMes = cuota.desdeMes;
        if (
          desdeMes < `${mesDe(reloj.ahora())}-01` ||
          (inicial !== undefined && desdeMes < inicial.valor.desdeMes)
        ) {
          throw nuevoError(catalogo.DOM_0020, { id: servicioId, desdeMes });
        }
        await agregarCuota(actor, repos, servicioId, cuota);
        return { ok: true };
      });
    },
  };
}

/** Lo que trae propuesto la factura del mes: el período (`aaaa-mm-01`) y la cuota que rige en él, si hay. */
export async function facturaDelMes(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
  hoy: FechaHora,
): Promise<{
  readonly periodo: string;
  readonly cuota: Importe<Moneda> | null;
}> {
  const cuotas = cuotasDelDominio(await repos.cuotas.listarDe(servicioId));
  const facturados = (await repos.facturas.listarDe(servicioId)).flatMap(
    ({ valor }) => (valor.periodo === null ? [] : [primerDiaDe(valor.periodo)]),
  );
  const periodo = periodoAFacturar(cuotas, hoy, facturados);
  return {
    periodo: `${mesDe(periodo)}-01`,
    cuota: cuotaDelMes(cuotas, periodo),
  };
}

/** `agosto de 2031` de un período `aaaa-mm-01`. */
export const nombreDelPeriodo = (periodo: string): string =>
  nombreDelMes(primerDiaDe(periodo));
