/**
 * Los pagos de egresos (F2-09, ADR 0034). Un pago no es un ABM: su validación
 * depende del saldo en la base, así que tiene su propio caso de uso.
 *
 * - El importe de un pago es **lo que cancela de la deuda**, en la moneda del
 *   egreso. Si la cuenta es de otra moneda, el tipo de cambio se carga a mano y
 *   lo que salió de la cuenta lo calcula el dominio (`importeEnCuenta`).
 * - `registrarPago` toma las filas del egreso y de la cuenta antes de leer el
 *   saldo, así dos pagos a la vez no pasan del total; corre entero en una
 *   transacción y la auditoría la deja el repositorio en esa misma.
 * - Lo que la persona puede corregir vuelve por campo, no se lanza. `DOM-0009`
 *   si el egreso o el pago no existen o están dados de baja.
 * - Anular un pago es una baja lógica: el saldo vuelve y queda en la auditoría.
 * - Lo que se muestra sale ya escrito (importes, fechas): `app` no importa el
 *   dominio salvo por tipos.
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
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { pagar, saldoDe } from "../../dominio/compartido/saldo.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { RegistroAbm } from "../../puertos/repositorios/abm.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import type { ErroresPorCampo, OpcionDeRelacion } from "../abm/abm.ts";
import {
  type CampoAbm,
  type Escrito,
  errorDeFecha,
} from "../abm/definicion.ts";
import { EGRESOS } from "../abm/egresos.ts";
import {
  atrasoDe,
  mensajeDeSaldo,
  monedaDe,
  movimientoEnCuenta,
  type TextosDeSaldo,
} from "../compartido/saldos.ts";
import { exigirRol } from "../usuarios/reglas.ts";

const PAGOS_POR_PAGINA = 25;
/** Prisma toma `take` como entero de 32 bits: el máximo es "todas". */
const TODAS = 2 ** 31 - 1;
const MAXIMO_OBSERVACIONES = 1000;

const MENSAJE_CUENTA = "Elegí una cuenta activa.";

const esquemaId = z.uuid();

type DependenciasPagos = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: GeneradorId;
};

type ResultadoPago =
  | { readonly ok: true }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Un pago de la lista de un egreso, listo para mostrarse. */
type PagoVisible = {
  readonly id: string;
  /** dd/mm/aaaa */
  readonly fecha: string;
  readonly importe: string;
  readonly cuenta: string;
  /** Lo que salió de la cuenta, en su moneda. */
  readonly salida: string;
  /** `1.184,25 · BNA vendedor`; vacío si no hubo tipo de cambio. */
  readonly cambio: string;
  readonly observaciones: string;
  /** El email de quien lo cargó, o el nombre del proceso. */
  readonly quien: string;
};

export type DetalleEgreso = {
  readonly concepto: string;
  /** Los datos del egreso, de solo lectura: se editan desde su listado. */
  readonly datos: readonly {
    readonly etiqueta: string;
    readonly valor: string;
  }[];
  readonly total: string;
  readonly pagado: string;
  readonly saldo: string;
  /** El saldo es cero. */
  readonly saldado: boolean;
  readonly pagos: readonly PagoVisible[];
  /** Las cuentas activas, para elegir de dónde sale un pago. */
  readonly cuentas: readonly OpcionDeRelacion[];
  /** Los campos del formulario de alta de un pago, con el importe en la moneda del egreso. */
  readonly campos: readonly (readonly [string, CampoAbm])[];
};

/** Una fila de *Por pagar*, con todo escrito para mostrarse. */
type FilaPorPagarVista = {
  readonly id: string;
  readonly fecha: string;
  readonly concepto: string;
  readonly centroCosto: string;
  readonly proveedor: string;
  readonly total: string;
  readonly pagado: string;
  readonly saldo: string;
  readonly vencimiento: string;
  /** `10 días`, o vacío si no está vencido. */
  readonly atraso: string;
};

type ListadoPorPagar = {
  readonly filas: readonly FilaPorPagarVista[];
  /** Cuántos egresos hay en todas las páginas. */
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
  readonly incluirPagados: boolean;
  /** Lo que queda por pagar, un total por moneda. */
  readonly saldos: readonly string[];
};

export type CasosUsoPagos = {
  /** El egreso con su saldo, sus pagos y lo que hace falta para cargar uno nuevo. `DOM-0009` si no existe. */
  detalle(egresoId: string): Promise<DetalleEgreso>;
  /** Los egresos con saldo, por vencimiento. */
  porPagar(
    parametros: Readonly<Record<string, unknown>>,
  ): Promise<ListadoPorPagar>;
  registrarPago(
    actor: Actor,
    egresoId: string,
    escrito: Escrito,
  ): Promise<ResultadoPago>;
  marcarPagoAnulado(actor: Actor, pagoId: string): Promise<void>;
};

function diaConBarras(dia: string): string {
  const [anio, mes, numero] = dia.split("-");
  return `${numero}/${mes}/${anio}`;
}

function camposDePago(
  moneda: Moneda,
): readonly (readonly [string, CampoAbm])[] {
  return [
    ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
    ["importe", { tipo: "texto", etiqueta: `Importe (${moneda})` }],
    [
      "cuentaId",
      {
        tipo: "relacion",
        etiqueta: "Cuenta",
        entidad: "Cuenta",
        mostrar: "nombre",
        obligatoria: true,
      },
    ],
    [
      "tipoDeCambio",
      {
        tipo: "texto",
        etiqueta: "Tipo de cambio (solo si la cuenta es de otra moneda)",
        opcional: true,
      },
    ],
    [
      "fuenteDelCambio",
      { tipo: "texto", etiqueta: "Fuente del tipo de cambio", opcional: true },
    ],
    ["observaciones", { tipo: "textoLargo", etiqueta: "Observaciones" }],
  ];
}

async function egresoVigente(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<RegistroAbm<"Egreso">> {
  const registro = esquemaId.safeParse(id).success
    ? await repos.abm("Egreso").buscarPorId(id)
    : null;
  if (registro === null || registro.eliminadoEn !== undefined) {
    throw nuevoError(catalogo.DOM_0009, { entidad: "Egreso", id });
  }
  return registro;
}

async function cuentaElegible(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<RegistroAbm<"Cuenta"> | null> {
  const registro = esquemaId.safeParse(id).success
    ? await repos.abm("Cuenta").buscarPorId(id)
    : null;
  return registro === null ||
    registro.eliminadoEn !== undefined ||
    !registro.valor.activa
    ? null
    : registro;
}

/** El saldo de un egreso con sus pagos vigentes, del más viejo al más nuevo. */
async function saldoDelEgreso(
  repos: RepositoriosEnTransaccion,
  egreso: RegistroAbm<"Egreso">,
) {
  const { registros } = await repos.pagos.listar({
    buscaEn: [],
    filtros: [{ columna: "egresoId", igual: egreso.valor.id }],
    marcadas: [],
    mes: null,
    orden: "fecha",
    direccion: "asc",
    saltear: 0,
    cantidad: TODAS,
  });
  const saldo = saldoDe(
    egreso.valor.importe,
    registros.map(({ valor }) => valor.importe),
  );
  if (!saldo.ok) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "los pagos guardados de un egreso no cierran con su total",
      egresoId: egreso.valor.id,
    });
  }
  return { saldo: saldo.valor, registros };
}

const TEXTOS: TextosDeSaldo = {
  verbo: "pagar",
  deuda: "el egreso",
  deLaDeuda: "del egreso",
};

export function crearCasosUsoPagos({
  transaccional,
  reloj,
  generadorId,
}: DependenciasPagos): CasosUsoPagos {
  return {
    detalle(egresoId) {
      return transaccional.ejecutar(async (repos) => {
        const egreso = await egresoVigente(repos, egresoId);
        const { saldo, registros } = await saldoDelEgreso(repos, egreso);
        const datos = egreso.valor;
        const cuentas = await repos
          .abm("Cuenta")
          .buscarPorIds(registros.map(({ valor }) => valor.cuentaId));
        const nombresDeCuenta = new Map<string, string>(
          cuentas.map(({ valor }) => [valor.id, valor.nombre]),
        );
        const emails = new Map(
          (await repos.usuarios.listar()).map(({ valor }) => [
            valor.id,
            valor.email,
          ]),
        );
        const centro = await repos
          .abm("CentroCosto")
          .buscarPorId(datos.centroCostoId);
        const proveedor =
          datos.proveedorId === null
            ? null
            : await repos.abm("Cliente").buscarPorId(datos.proveedorId);
        const { registros: activas } = await repos.abm("Cuenta").listar({
          buscaEn: [],
          filtros: [],
          marcadas: ["activa"],
          mes: null,
          orden: "nombre",
          direccion: "asc",
          saltear: 0,
          cantidad: TODAS,
        });
        return {
          concepto: datos.concepto,
          datos: [
            { etiqueta: "Fecha", valor: diaConBarras(datos.fecha) },
            { etiqueta: "Centro de costo", valor: centro?.valor.nombre ?? "" },
            {
              etiqueta: "Proveedor",
              valor: proveedor?.valor.razonSocial ?? "",
            },
            { etiqueta: "Comprobante", valor: datos.numeroComprobante ?? "" },
            {
              etiqueta: "Vencimiento",
              valor:
                datos.vencimiento === null
                  ? ""
                  : diaConBarras(datos.vencimiento),
            },
            { etiqueta: "Observaciones", valor: datos.observaciones ?? "" },
          ],
          total: formatearImporte(saldo.total),
          pagado: formatearImporte(saldo.pagado),
          saldo: formatearImporte(saldo.saldo),
          saldado: saldo.saldo.centavos === 0n,
          pagos: registros.map(({ valor, creadoPor }) => ({
            id: valor.id,
            fecha: diaConBarras(valor.fecha),
            importe: formatearImporte(valor.importe),
            cuenta: nombresDeCuenta.get(valor.cuentaId) ?? "",
            salida: formatearImporte(valor.salida),
            cambio:
              valor.cambioValor === null
                ? ""
                : `${formatearValorTipoDeCambio(valor.cambioValor)} · ${valor.cambioFuente ?? ""}`,
            observaciones: valor.observaciones ?? "",
            quien:
              creadoPor.tipo === "sistema"
                ? creadoPor.proceso
                : (emails.get(creadoPor.usuarioId) ?? creadoPor.usuarioId),
          })),
          cuentas: activas.map(({ valor }) => ({
            valor: valor.id,
            texto: `${valor.nombre} · ${valor.moneda}`,
          })),
          campos: camposDePago(datos.importe.moneda),
        };
      });
    },

    porPagar(parametros) {
      const leidos = z
        .object({
          pagados: z.string().catch(""),
          pagina: z.coerce.number().int().min(1).catch(1),
        })
        .parse(parametros);
      const incluirPagados = leidos.pagados === "si";
      return transaccional.ejecutar(async (repos) => {
        const hoy = reloj.ahora();
        const { filas, total, saldos } = await repos.pagos.porPagar({
          incluirPagados,
          saltear: (leidos.pagina - 1) * PAGOS_POR_PAGINA,
          cantidad: PAGOS_POR_PAGINA,
        });
        return {
          filas: filas.map((fila) => {
            return {
              id: fila.id,
              fecha: diaConBarras(fila.fecha),
              concepto: fila.concepto,
              centroCosto: fila.centroCosto,
              proveedor: fila.proveedor ?? "",
              total: formatearImporte(fila.total),
              pagado: formatearImporte(fila.pagado),
              saldo: formatearImporte(fila.saldo),
              vencimiento:
                fila.vencimiento === null ? "" : diaConBarras(fila.vencimiento),
              atraso:
                fila.vencimiento !== null && fila.saldo.centavos > 0n
                  ? atrasoDe(hoy, fila.vencimiento)
                  : "",
            };
          }),
          total,
          pagina: leidos.pagina,
          paginas: Math.max(1, Math.ceil(total / PAGOS_POR_PAGINA)),
          incluirPagados,
          saldos: saldos.map(formatearImporte),
        };
      });
    },

    registrarPago(actor, egresoId, escrito) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          EGRESOS.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        if (!esquemaId.safeParse(egresoId).success) {
          throw nuevoError(catalogo.DOM_0009, {
            entidad: "Egreso",
            id: egresoId,
          });
        }
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

        // Las filas del egreso y de la cuenta se toman antes de leer el saldo.
        const cuentaId = escrito.cuentaId ?? "";
        if (esquemaId.safeParse(cuentaId).success) {
          await repos.pagos.bloquearParaPagar(egresoId, cuentaId);
        }
        const egreso = await egresoVigente(repos, egresoId);
        const cuenta = await cuentaElegible(repos, cuentaId);
        if (cuenta === null) {
          errores.cuentaId = MENSAJE_CUENTA;
        }

        const { moneda } = egreso.valor.importe;
        const leido = parsearImporte(escrito.importe ?? "", moneda);
        let importe: Importe<Moneda> | null = null;
        if (!leido.ok) {
          errores.importe =
            "Escribí el importe con coma para los decimales y, si querés, punto para los miles (por ejemplo 1.234,50).";
        } else {
          const { saldo } = await saldoDelEgreso(repos, egreso);
          const nuevo = pagar(saldo, leido.valor);
          if (nuevo.ok) {
            importe = leido.valor;
          } else {
            errores.importe = mensajeDeSaldo(nuevo.error.motivo, saldo, TEXTOS);
          }
        }

        const {
          cambio,
          enCuenta: salida,
          errores: deCambio,
        } = movimientoEnCuenta({
          escrito,
          actor,
          dia,
          diaValido: errores.fecha === undefined,
          importe,
          monedaDeLaCuenta:
            cuenta === null ? null : monedaDe(cuenta.valor.moneda),
          textos: TEXTOS,
        });
        Object.assign(errores, deCambio);

        if (
          importe === null ||
          salida === null ||
          cuenta === null ||
          Object.keys(errores).length > 0
        ) {
          return { ok: false, errores };
        }
        await repos.pagos.crear(
          actor,
          crearAuditable(
            {
              id: identificadorDesde<string>(generadorId.generar()),
              egresoId,
              fecha: dia,
              importe,
              cuentaId: cuenta.valor.id,
              salida,
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

    marcarPagoAnulado(actor, pagoId) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          EGRESOS.rolesQueEscriben,
          catalogo.AUT_0009,
        );
        const registro = esquemaId.safeParse(pagoId).success
          ? await repos.pagos.buscarPorId(pagoId)
          : null;
        if (registro === null || registro.eliminadoEn !== undefined) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Pago", id: pagoId });
        }
        const anulado = marcarEliminado(registro, actor, reloj);
        if (!anulado.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Pago", id: pagoId });
        }
        await repos.pagos.actualizar(actor, anulado.valor, "eliminar");
      });
    },
  };
}
