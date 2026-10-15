/**
 * Los cobros de las facturas de un servicio (F2-07, ADR 0037). Un cobro es
 * siempre de una factura; no existen cobros sin factura. La regla de saldo y el
 * tipo de cambio son los de los pagos de egresos (`saldo.ts`, F2-09).
 *
 * - El importe y la retención están en la **moneda de la factura** y los dos
 *   cancelan deuda; solo el importe entra a la cuenta (si es de otra moneda, a
 *   un tipo de cambio cargado a mano ese día).
 * - `registrar` toma la fila del servicio antes de leer el saldo, así dos cobros
 *   a la vez no pasan del total, ni un cobro se cruza con la anulación de la
 *   factura. Corre entero en una transacción; la auditoría la deja el repositorio.
 * - *Cobrada* no se guarda: es saldo cero. Lo que se muestra sale ya escrito
 *   (importes, fechas): `app` no importa el dominio salvo por tipos.
 * - Lo que la persona corrige vuelve por campo, no se lanza. `DOM-0009` si la
 *   factura o el cobro no existen o están dados de baja.
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import {
  formatearImporte,
  formatearValorTipoDeCambio,
  type Importe,
  type Moneda,
  parsearImporte,
} from "../../dominio/compartido/importe.ts";
import {
  diferenciaEnDias,
  formatearISO,
  type Reloj,
} from "../../dominio/compartido/reloj.ts";
import { sumarEnMoneda } from "../../dominio/compartido/saldo.ts";
import {
  type AvanceEnMoneda,
  avancePorMoneda,
  sumaPorMoneda,
} from "../../dominio/servicios/avance.ts";
import {
  type CobroDeFactura,
  estaCobrada,
  type SaldoDeFactura,
  saldoDeFactura,
} from "../../dominio/servicios/cobro.ts";
import { totalConIva } from "../../dominio/servicios/factura.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { Cobro } from "../../puertos/repositorios/cobros.ts";
import type { Factura } from "../../puertos/repositorios/facturas.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  type ErroresPorCampo,
  nombresDeActores,
  type OpcionesPorCampo,
} from "../abm/abm.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  errorDeFecha,
} from "../abm/definicion.ts";
import {
  aFechaHora,
  atrasoDe,
  camposDeMovimiento,
  cuentaElegible,
  cuentasActivas,
  MENSAJE_CUENTA,
  MENSAJE_IMPORTE_ILEGIBLE,
  mensajeDeSaldo,
  monedaDe,
  movimientoEnCuenta,
  type TextosDeSaldo,
} from "../compartido/movimientos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const MAXIMO_OBSERVACIONES = 1000;

const MENSAJE_RETENCION_ILEGIBLE =
  "Escribí la retención con coma para los decimales y, si querés, punto para los miles (por ejemplo 210,00), o dejala vacía.";

const TEXTOS: TextosDeSaldo = {
  verbo: "cobrar",
  deuda: "la factura",
  deLaDeuda: "de la factura",
};

const esquemaId = z.uuid();

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type ResultadoDeCobro =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Un cobro de la lista de una factura, listo para mostrarse. */
export type CobroVisible = {
  readonly id: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** Días entre la fecha de la factura y la del cobro: se calculan, no se guardan. */
  readonly dias: string;
  readonly importe: string;
  /** Vacío si no hubo. */
  readonly retencion: string;
  readonly cuenta: string;
  /** Lo que entró a la cuenta, en su moneda. */
  readonly entrada: string;
  /** `1.184,25 · BNA vendedor`; vacío si no hubo tipo de cambio. */
  readonly cambio: string;
  readonly observaciones: string;
  /** El email de quien lo cargó, o el nombre del proceso. */
  readonly quien: string;
};

/** Una factura con lo cobrado, lo retenido y lo que falta. */
export type CobranzaDeFactura = {
  readonly facturaId: string;
  /** Con IVA. */
  readonly total: string;
  readonly cobrado: string;
  readonly retenido: string;
  readonly saldo: string;
  /** El saldo es cero. */
  readonly cobrada: boolean;
  readonly cobros: readonly CobroVisible[];
};

/** El avance en una moneda, todo escrito. */
export type LineaDeAvance = {
  readonly moneda: Moneda;
  /** De las órdenes de compra, sin IVA. */
  readonly total: string;
  /** De las facturas, con IVA. */
  readonly facturado: string;
  /** Importes más retenciones. */
  readonly cobrado: string;
  /** Facturado menos cobrado. */
  readonly pendiente: string;
};

/** Una fila de *Por cobrar*, con todo escrito para mostrarse. */
export type FilaPorCobrar = {
  readonly servicioId: string;
  /** El código del servicio: `SRV-2026-014`. */
  readonly servicio: string;
  readonly cliente: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly vencimiento: string;
  readonly total: string;
  readonly saldo: string;
  /** `10 días`, o vacío si no está vencida. */
  readonly atraso: string;
};

export type CasosUsoCobros = {
  /** Cada factura vigente del servicio con su cobranza, la más nueva primero. */
  cobranza(servicioId: string): Promise<readonly CobranzaDeFactura[]>;
  /** El avance del servicio y de cada una de sus órdenes de compra (por id), por moneda y sin convertir. */
  avance(servicioId: string): Promise<{
    readonly servicio: readonly LineaDeAvance[];
    readonly ordenes: Readonly<Record<string, readonly LineaDeAvance[]>>;
  }>;
  /** Lo que hace falta para cobrar una factura: su número, lo que falta cobrar y el formulario. */
  formulario(facturaId: string): Promise<{
    readonly numero: string;
    readonly saldo: string;
    readonly campos: CamposAbm;
    readonly elegibles: OpcionesPorCampo;
    readonly escrito: Escrito;
  }>;
  /** Las facturas con saldo, por vencimiento, y lo que queda por cobrar en cada moneda. */
  porCobrar(): Promise<{
    readonly filas: readonly FilaPorCobrar[];
    readonly saldos: readonly string[];
  }>;
  registrar(
    actor: Actor,
    facturaId: string,
    escrito: Escrito,
  ): Promise<ResultadoDeCobro>;
  /** La anula (baja lógica): el saldo vuelve. */
  marcarAnulado(actor: Actor, cobroId: string): Promise<void>;
};

type FacturaConCobros = {
  readonly factura: Factura;
  readonly cobros: readonly Cobro[];
  readonly saldo: SaldoDeFactura<Moneda>;
};

function camposDeCobro(moneda: Moneda): CamposAbm {
  return camposDeMovimiento(moneda).flatMap((campo) =>
    campo[0] === "importe"
      ? [
          campo,
          [
            "retencion",
            {
              tipo: "texto",
              etiqueta: `Retención (${moneda}, opcional)`,
              opcional: true,
            },
          ] as const,
        ]
      : [campo],
  );
}

async function facturaVigente(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<Factura> {
  const factura = esquemaId.safeParse(id).success
    ? await repos.facturas.buscarPorId(id)
    : null;
  if (factura === null || factura.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Factura", id });
  }
  return factura;
}

/** La factura vigente, con la fila de su servicio tomada hasta el fin de la transacción. */
async function facturaVigenteBloqueada(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<Factura> {
  const { servicioId } = (await facturaVigente(repos, id)).valor;
  await servicioVigenteBloqueado(repos, servicioId);
  return facturaVigente(repos, id);
}

const totalDe = (factura: Factura) =>
  totalConIva(factura.valor.importe, factura.valor.alicuota);

const cobroDeFactura = ({ valor }: Cobro): CobroDeFactura<Moneda> => ({
  importe: valor.importe,
  retencion: valor.retencion,
});

/** La factura con sus cobros (de entre `todos`, los vigentes de varias facturas) y su saldo. */
function conSusCobros(
  factura: Factura,
  todos: readonly Cobro[],
): FacturaConCobros {
  const cobros = todos.filter(
    ({ valor }) => valor.facturaId === factura.valor.id,
  );
  const saldo = saldoDeFactura(totalDe(factura), cobros.map(cobroDeFactura));
  if (!saldo.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "los cobros guardados de una factura no cierran con su total",
      facturaId: factura.valor.id,
    });
  }
  return { factura, cobros, saldo: saldo.valor };
}

async function conCobrosDe(
  repos: RepositoriosEnTransaccion,
  facturas: readonly Factura[],
): Promise<readonly FacturaConCobros[]> {
  const todos = await repos.cobros.listarDe(
    facturas.map(({ valor }) => valor.id),
  );
  return facturas.map((factura) => conSusCobros(factura, todos));
}

function lineaDeAvance(avance: AvanceEnMoneda): LineaDeAvance {
  return {
    moneda: avance.moneda,
    total: formatearImporte(avance.total),
    facturado: formatearImporte(avance.facturado),
    cobrado: formatearImporte(avance.cobrado),
    pendiente: formatearImporte(avance.pendiente),
  };
}

/** Lo que una factura aporta al avance: su total con IVA y lo cobrado con sus retenciones. */
function paraAvance({ saldo }: FacturaConCobros) {
  return {
    total: saldo.total,
    cobrado: sumarEnMoneda(saldo.cobrado, saldo.retenido),
  };
}

export function crearCasosUsoCobros({
  transaccional,
  reloj,
  generadorId,
}: Dependencias): CasosUsoCobros {
  return {
    cobranza(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const facturas = await conCobrosDe(
          repos,
          await repos.facturas.listarDe(servicioId),
        );
        const cuentas = new Map<string, string>(
          (
            await repos
              .abm("Cuenta")
              .buscarPorIds(
                facturas.flatMap(({ cobros }) =>
                  cobros.map(({ valor }) => valor.cuentaId),
                ),
              )
          ).map(({ valor }) => [valor.id, valor.nombre]),
        );
        const quien = await nombresDeActores(repos);
        return facturas.map(({ factura, cobros, saldo }) => ({
          facturaId: factura.valor.id,
          total: formatearImporte(saldo.total),
          cobrado: formatearImporte(saldo.cobrado),
          retenido: formatearImporte(saldo.retenido),
          saldo: formatearImporte(saldo.saldo),
          cobrada: estaCobrada(saldo),
          cobros: cobros.map(({ valor, creadoPor }) => ({
            id: valor.id,
            fecha: diaConBarras(valor.fecha),
            dias: String(
              diferenciaEnDias(
                aFechaHora(valor.fecha),
                aFechaHora(factura.valor.fecha),
              ),
            ),
            importe: formatearImporte(valor.importe),
            retencion:
              valor.retencion === null ? "" : formatearImporte(valor.retencion),
            cuenta: cuentas.get(valor.cuentaId) ?? "",
            entrada: formatearImporte(valor.entrada),
            cambio:
              valor.cambioValor === null
                ? ""
                : `${formatearValorTipoDeCambio(valor.cambioValor)} · ${valor.cambioFuente ?? ""}`,
            observaciones: valor.observaciones ?? "",
            quien: quien(creadoPor),
          })),
        }));
      });
    },

    avance(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const ordenes = await repos.ordenesCompra.listarDe(servicioId);
        const facturas = await conCobrosDe(
          repos,
          await repos.facturas.listarDe(servicioId),
        );
        return {
          servicio: avancePorMoneda(
            ordenes.map(({ valor }) => valor.importe),
            facturas.map(paraAvance),
          ).map(lineaDeAvance),
          ordenes: Object.fromEntries(
            ordenes.map(({ valor: orden }) => [
              orden.id,
              avancePorMoneda(
                [orden.importe],
                facturas
                  .filter(
                    ({ factura }) => factura.valor.ordenCompraId === orden.id,
                  )
                  .map(paraAvance),
              ).map(lineaDeAvance),
            ]),
          ),
        };
      });
    },

    formulario(facturaId) {
      return transaccional.ejecutar(async (repos) => {
        const factura = await facturaVigente(repos, facturaId);
        const { saldo } = conSusCobros(
          factura,
          await repos.cobros.listarDe([facturaId]),
        );
        return {
          numero: factura.valor.numero,
          saldo: formatearImporte(saldo.saldo),
          campos: camposDeCobro(factura.valor.importe.moneda),
          elegibles: { cuentaId: await cuentasActivas(repos) },
          escrito: { fecha: formatearISO(reloj.ahora()).slice(0, 10) },
        };
      });
    },

    porCobrar() {
      return transaccional.ejecutar(async (repos) => {
        const vigentes = await repos.facturas.vigentesConServicio();
        const cobros = await repos.cobros.listarDe(
          vigentes.map(({ factura }) => factura.valor.id),
        );
        const hoy = reloj.ahora();
        const pendientes = vigentes
          .map((vigente) => ({
            ...vigente,
            ...conSusCobros(vigente.factura, cobros),
          }))
          .filter(({ saldo }) => !estaCobrada(saldo));
        return {
          filas: pendientes.map(
            ({ factura, servicioCodigo, cliente, saldo }) => ({
              servicioId: factura.valor.servicioId,
              servicio: servicioCodigo,
              cliente,
              numero: factura.valor.numero,
              vencimiento: diaConBarras(factura.valor.vencimiento),
              total: formatearImporte(saldo.total),
              saldo: formatearImporte(saldo.saldo),
              atraso: atrasoDe(hoy, factura.valor.vencimiento),
            }),
          ),
          saldos: sumaPorMoneda(pendientes.map(({ saldo }) => saldo.saldo)).map(
            formatearImporte,
          ),
        };
      });
    },

    registrar(actor, facturaId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const factura = await facturaVigenteBloqueada(repos, facturaId);
        const errores: Record<string, string> = {};

        const dia = escrito.fecha ?? "";
        const errorDeDia = errorDeFecha(
          { tipo: "fecha", etiqueta: "Fecha" },
          dia,
        );
        if (errorDeDia !== undefined) {
          errores.fecha = errorDeDia;
        }
        const observaciones = (escrito.observaciones ?? "").trim();
        if (observaciones.length > MAXIMO_OBSERVACIONES) {
          errores.observaciones = `No puede pasar de ${MAXIMO_OBSERVACIONES} caracteres.`;
        }
        const cuenta = await cuentaElegible(repos, escrito.cuentaId ?? "");
        if (cuenta === null) {
          errores.cuentaId = MENSAJE_CUENTA;
        }

        const { moneda } = factura.valor.importe;
        const importeLeido = parsearImporte(escrito.importe ?? "", moneda);
        let importe: Importe<Moneda> | null = null;
        if (!importeLeido.ok) {
          errores.importe = MENSAJE_IMPORTE_ILEGIBLE;
        } else if (importeLeido.valor.centavos < 0n) {
          errores.importe = "El importe no puede ser negativo.";
        } else {
          importe = importeLeido.valor;
        }
        const retencionEscrita = (escrito.retencion ?? "").trim();
        const retencionLeida =
          retencionEscrita === ""
            ? null
            : parsearImporte(retencionEscrita, moneda);
        let retencion: Importe<Moneda> | null = null;
        if (retencionLeida?.ok === false) {
          errores.retencion = MENSAJE_RETENCION_ILEGIBLE;
        } else if (retencionLeida?.ok === true) {
          if (retencionLeida.valor.centavos < 0n) {
            errores.retencion = "La retención no puede ser negativa.";
          } else if (retencionLeida.valor.centavos > 0n) {
            retencion = retencionLeida.valor;
          }
        }

        let aceptado: Importe<Moneda> | null = null;
        if (importe !== null && errores.retencion === undefined) {
          const actual = conSusCobros(
            factura,
            await repos.cobros.listarDe([facturaId]),
          );
          const nuevo = saldoDeFactura(totalDe(factura), [
            ...actual.cobros.map(cobroDeFactura),
            { importe, retencion },
          ]);
          if (nuevo.ok) {
            aceptado = importe;
          } else {
            errores.importe = mensajeDeSaldo(
              nuevo.error.motivo,
              actual.saldo,
              TEXTOS,
            );
          }
        }

        const {
          cambio,
          enCuenta,
          errores: deCambio,
        } = movimientoEnCuenta({
          escrito,
          actor,
          dia,
          diaValido: errores.fecha === undefined,
          importe: aceptado,
          monedaDeLaCuenta:
            cuenta === null ? null : monedaDe(cuenta.valor.moneda),
          textos: TEXTOS,
        });
        Object.assign(errores, deCambio);

        if (
          aceptado === null ||
          enCuenta === null ||
          cuenta === null ||
          Object.keys(errores).length > 0
        ) {
          return { ok: false, errores };
        }
        await repos.cobros.crear(
          actor,
          crearAuditable(
            {
              id: identificadorDesde<string>(generadorId.generar()),
              facturaId,
              fecha: dia,
              importe: aceptado,
              retencion,
              cuentaId: cuenta.valor.id,
              entrada: enCuenta,
              cambioValor: cambio?.valor ?? null,
              cambioFuente: cambio === null ? null : cambio.fuente.trim(),
              observaciones: observaciones === "" ? null : observaciones,
            },
            actor,
            reloj,
          ),
        );
        return { ok: true };
      });
    },

    marcarAnulado(actor, cobroId) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        const registro = esquemaId.safeParse(cobroId).success
          ? await repos.cobros.buscarPorId(cobroId)
          : null;
        const anulado =
          registro === null ? null : marcarEliminado(registro, actor, reloj);
        if (registro === null || anulado === null || !anulado.ok) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Cobro",
            id: cobroId,
          });
        }
        await repos.cobros.actualizar(actor, anulado.valor, "eliminar");
      });
    },
  };
}
