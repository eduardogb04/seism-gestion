/**
 * Las facturas de un servicio (F2-06, ADR 0036). Se carga el importe **sin IVA**
 * y la alícuota; el IVA y el total se calculan siempre con el dominio y no se
 * guardan. El cliente sale del servicio. Una factura no se edita; se anula, y no
 * se anula una que tiene cobros vigentes (`DOM-0016`).
 *
 * - Toda escritura recibe el `Actor` primero, exige un rol que escriba
 *   (`AUT-0009`) y corre entera en una transacción: el documento, si hay, y la
 *   cabecera. Se anulan de «Adjudicado» a «Finalizado» (`DOM-0018`, F3-01) y se
 *   cargan en las etapas de la modalidad de facturación del servicio; sin
 *   modalidad no se factura (`DOM-0021`, F3-03).
 * - En modalidad mensual la factura lleva el mes que factura (`periodo`), y el
 *   formulario propone ese mes y su cuota; los dos se pueden cambiar.
 * - El número no se repite entre las vigentes. Facturar más que el saldo de la
 *   orden de compra no se impide: la orden lo avisa (`ordenes-de-compra.ts`).
 * - Lo que la persona corrige (un campo o el archivo) vuelve por campo, no se lanza.
 * - Las notas de crédito y de débito y la factura adicional (F6-03, ADR 0050)
 *   se cargan y se anulan en `ajustes.ts`: la lista de acá trae las adicionales
 *   y las notas de débito, que se cobran como una factura, con su tipo; las
 *   notas de crédito no (no se cobran). Un comprobante con notas de crédito
 *   vigentes no se anula (`DOM-0044`).
 */

import { z } from "zod";
import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarEliminado,
  type RegistroAuditoria,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import {
  crearImporte,
  formatearImporte,
  formatearMonto,
  MONEDA_CON_CAMBIO,
  MONEDAS,
} from "../../dominio/compartido/importe.ts";
import {
  esDiaValido,
  formatearISO,
  type Reloj,
  sumarDias,
} from "../../dominio/compartido/reloj.ts";
import {
  admiteAnulacion,
  tieneSaldo,
} from "../../dominio/servicios/comprobante.ts";
import {
  ALICUOTA_POR_DEFECTO,
  ALICUOTAS_IVA,
  ivaDe,
  totalConIva,
} from "../../dominio/servicios/factura.ts";
import type {
  DatosFactura,
  Factura,
} from "../../puertos/repositorios/facturas.ts";
import type {
  RepositoriosEnTransaccion,
  Transaccional,
} from "../../puertos/repositorios/transaccion.ts";
import {
  type CambioAbm,
  cuandoDe,
  type ErroresPorCampo,
  nombresDeActores,
  validarEscrito,
} from "../abm/abm.ts";
import { cambioVisible } from "../abm/cambio.ts";
import {
  type CamposAbm,
  diaConBarras,
  type Escrito,
  nombreDeMoneda,
  type OpcionAbm,
} from "../abm/definicion.ts";
import { cambioDeDocumento, obligatorio } from "../abm/validaciones.ts";
import type {
  ArchivoSubido,
  DependenciasDeAdjuntos,
} from "../documentos/documentos.ts";
import { exigirRol } from "../usuarios/reglas.ts";
import {
  cerrarSiEstaCobrado,
  exigirEtapa,
  exigirEtapaDeFactura,
} from "./ciclo.ts";
import { comprobanteDe } from "./cobranza.ts";
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
import { cuentasDeAjustes } from "./cuentas-de-ajustes.ts";
import { facturaDelMes, nombreDelPeriodo } from "./facturacion.ts";
import { etiquetaDeAlicuota, OPCIONES_DE_ALICUOTA } from "./iva-de-factura.ts";
import {
  ROLES_QUE_ESCRIBEN_SERVICIOS,
  servicioVigente,
  servicioVigenteBloqueado,
} from "./servicios.ts";

const esquemaId = z.uuid();

/** Los días entre la fecha de la factura y su vencimiento, si no se elige otro. */
export const DIAS_AL_VENCIMIENTO = 30;

const MENSAJE_NUMERO_REPETIDO = "Ya hay una factura vigente con ese número.";

type Dependencias = DependenciasDeAdjuntos & {
  readonly transaccional: Transaccional;
};

type ResultadoDeFactura =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

/** Una factura como se ve en la tabla del servicio. */
export type FacturaListada = {
  readonly id: string;
  /** `Factura`, `Factura adicional`, `Nota de débito` o `Nota de crédito`. */
  readonly tipo: string;
  readonly numero: string;
  /** dd/mm/aaaa. */
  readonly fecha: string;
  /** dd/mm/aaaa. */
  readonly vencimiento: string;
  /** El mes que factura en modalidad mensual (`agosto de 2031`), o vacío. */
  readonly periodo: string;
  /** El número de su orden de compra, o vacío. */
  readonly ordenCompra: string;
  /** Lo que se cargó: `ARS 400,00`. */
  readonly sinIva: string;
  /** Pesos por dólar: solo si es en dólares; avisa si falta. */
  readonly cambio: CambioListado;
  /** `21 %`. */
  readonly alicuota: string;
  /** Calculado, no guardado. */
  readonly iva: string;
  /** Calculado, no guardado: lo que se cobra. */
  readonly total: string;
  readonly documento: DocumentoListado | null;
  /** Un anticipo: va con una etiqueta en la lista. */
  readonly anticipo: boolean;
  /** Un comprobante interno de un servicio sin factura (R8): sin IVA, se descarga aparte. */
  readonly interno: boolean;
  /** El email de quien la cargó. */
  readonly quien: string;
};

/** Una factura con su servicio y los cambios de su tipo de cambio: lo único que se corrige en una factura ya cargada. */
export type DetalleDeFactura = FacturaListada & {
  readonly servicioId: string;
  /** El código del servicio: `SRV-2026-014`. */
  readonly servicio: string;
  /** Del más nuevo al más viejo. */
  readonly cambios: readonly CambioAbm[];
};

/** Lo que muestra el comprobante interno imprimible (R8), todo ya escrito. */
export type ComprobanteInterno = {
  readonly numero: string;
  readonly fecha: string;
  readonly vencimiento: string;
  readonly cliente: string;
  readonly servicioCodigo: string;
  readonly servicioTitulo: string;
  /** Lo cotizado (cotización vigente); vacío si no hay. */
  readonly cotizado: string;
  readonly ajustes: readonly {
    readonly concepto: string;
    /** `+ ARS 1.000,00` o `− ARS 1.000,00`. */
    readonly importe: string;
  }[];
  /** Cotizado más recargos menos descuentos aprobados; vacío si no hay cotización. */
  readonly totalDelServicio: string;
  /** Lo que se cobra con este comprobante. */
  readonly total: string;
};

export type CasosUsoFacturas = {
  /** El comprobante interno vigente para imprimirlo. `DOM-0009` si no existe, está anulado o no es interno. */
  comprobanteInterno(
    servicioId: string,
    id: string,
  ): Promise<ComprobanteInterno>;
  /** Las no anuladas, la más nueva primero. */
  listar(servicioId: string): Promise<readonly FacturaListada[]>;
  /** Una factura vigente con su servicio y sus cambios. `DOM-0009` si no existe o está anulada. */
  ver(id: string): Promise<DetalleDeFactura>;
  /** El formulario de la próxima: las órdenes de compra del servicio, el 21 % y la fecha de hoy; en mensual, el período y su cuota. */
  formulario(
    servicioId: string,
    anticipo?: boolean,
  ): Promise<{
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
    /** El servicio no lleva factura: se emite un comprobante interno (R8). */
    readonly interno: boolean;
  }>;
  /** `archivo` es `null` si no se eligió ninguno: el documento es opcional. */
  crear(
    actor: Actor,
    servicioId: string,
    escrito: Escrito,
    archivo: ArchivoSubido | null,
  ): Promise<ResultadoDeFactura>;
  /** El formulario para completar o cambiar su tipo de cambio, con lo que ya tiene. */
  formularioDeCambio(id: string): Promise<{
    readonly numero: string;
    readonly campos: CamposAbm;
    readonly escrito: Escrito;
  }>;
  /** Completa o cambia el tipo de cambio de una factura ya cargada, con las reglas del alta. */
  guardarTipoDeCambio(
    actor: Actor,
    id: string,
    escrito: Escrito,
  ): Promise<ResultadoDeCambio>;
  /** La anula (baja lógica, con su documento): su número queda libre. */
  marcarEliminado(actor: Actor, id: string): Promise<void>;
};

/** Lo que se escribe en el formulario: la cabecera sin lo que pone el sistema. */
type DatosEscritos = Omit<
  DatosFactura,
  | "servicioId"
  | "documentoId"
  | "periodo"
  | "tipo"
  | "adicional"
  | "anticipo"
  | "comprobanteAsociadoId"
  | "motivoAnulacion"
>;

/** Cómo se nombra cada comprobante en las listas. */
export function tipoVisible({
  tipo,
  adicional,
}: Pick<DatosFactura, "tipo" | "adicional">): string {
  switch (tipo) {
    case "factura":
      return adicional ? "Factura adicional" : "Factura";
    case "nota_debito":
      return "Nota de débito";
    case "nota_credito":
      return "Nota de crédito";
    case "interno":
      return adicional
        ? "Comprobante interno adicional"
        : "Comprobante interno";
  }
}

/** La alícuota elegida en el selector, en milésimas. */
export const alicuotaElegida = z.string().transform((valor, contexto) => {
  const alicuota = ALICUOTAS_IVA.find((a) => String(a) === valor);
  if (alicuota === undefined) {
    contexto.addIssue({ code: "custom", message: "Elegí una alícuota." });
    return z.NEVER;
  }
  return alicuota;
});

/** El vencimiento no puede ser anterior a la fecha; dos días `aaaa-mm-dd` se comparan como texto. */
export function vencimientoNoAnterior(
  datos: { readonly fecha: string; readonly vencimiento: string },
  contexto: z.RefinementCtx,
): void {
  if (
    esDiaValido(datos.fecha) &&
    esDiaValido(datos.vencimiento) &&
    datos.vencimiento < datos.fecha
  ) {
    contexto.addIssue({
      code: "custom",
      path: ["vencimiento"],
      message: "No puede ser anterior a la fecha de la factura.",
    });
  }
}

/** Los campos de un comprobante interno (R8): sin número (lo da la secuencia), sin IVA y sin orden de compra. */
const SOLO_DE_FACTURA = ["numero", "alicuota", "ordenCompraId"];

function camposDeFactura(
  ordenes: readonly OpcionAbm[],
  mensual: boolean,
  anticipo = false,
  interno = false,
): CamposAbm {
  return camposCompletos(ordenes, mensual, anticipo).filter(
    ([nombre]) => !(interno && SOLO_DE_FACTURA.includes(nombre)),
  );
}

function camposCompletos(
  ordenes: readonly OpcionAbm[],
  mensual: boolean,
  anticipo: boolean,
): CamposAbm {
  return [
    ...(mensual && !anticipo
      ? [
          [
            "periodo",
            {
              tipo: "fecha",
              etiqueta: "Período que factura (cualquier día del mes)",
            },
          ] as const,
        ]
      : []),
    ["numero", { tipo: "texto", etiqueta: "Número" }],
    ["fecha", { tipo: "fecha", etiqueta: "Fecha" }],
    ["vencimiento", { tipo: "fecha", etiqueta: "Vencimiento" }],
    ["importe", { tipo: "importe", etiqueta: "Importe sin IVA" }],
    CAMPO_DE_CAMBIO,
    [
      "alicuota",
      { tipo: "opcion", etiqueta: "IVA", opciones: OPCIONES_DE_ALICUOTA },
    ],
    [
      "ordenCompraId",
      {
        tipo: "opcion",
        etiqueta: "Orden de compra",
        opciones: ordenes,
        opcional: true,
      },
    ],
  ];
}

const VALIDACION: z.ZodType<DatosEscritos> = z
  .object({
    numero: obligatorio("el número", 40),
    fecha: z.string(),
    vencimiento: z.string(),
    importe: importeMayorQueCero,
    cambio: cambioDeDocumento,
    alicuota: alicuotaElegida,
    ordenCompraId: z.string().nullable(),
  })
  .superRefine(vencimientoNoAnterior);

/** La validación de un comprobante interno: lo de la factura menos lo que pone el sistema (R8). */
export const VALIDACION_INTERNA: z.ZodType<DatosEscritos> = z
  .object({
    fecha: z.string(),
    vencimiento: z.string(),
    importe: importeMayorQueCero,
    cambio: cambioDeDocumento,
  })
  .superRefine(vencimientoNoAnterior)
  .transform((datos) => ({
    ...datos,
    numero: "",
    alicuota: 0,
    ordenCompraId: null,
  }));

/** El prefijo de la numeración propia del comprobante interno. */
export const PREFIJO_DE_INTERNO = "CI";

/** El próximo número del comprobante interno del año: `CI-2026-0001`. */
export async function numeroInterno(
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
): Promise<string> {
  const { anio } = reloj.ahora();
  const siguiente = await repos.secuencias.siguiente(PREFIJO_DE_INTERNO, anio);
  return `${PREFIJO_DE_INTERNO}-${anio}-${String(siguiente).padStart(4, "0")}`;
}

/** Las órdenes de compra no reemplazadas del servicio, para elegir a cuál corresponde la factura. */
async function ordenesParaElegir(
  repos: RepositoriosEnTransaccion,
  servicioId: string,
) {
  const sinReemplazar = (await repos.ordenesCompra.listarDe(servicioId)).filter(
    ({ valor }) => valor.reemplazadaEn === null,
  );
  return sinReemplazar.map(({ valor }) => ({
    valor: valor.id,
    etiqueta: `${valor.numero} · ${formatearImporte(valor.importe)}`,
    moneda: valor.importe.moneda,
  }));
}

/** `DOM-0016` si tiene cobros vigentes y `DOM-0044` si tiene notas de crédito vigentes: se anulan primero ellos. */
export async function exigirSinCobrosNiCreditos(
  repos: RepositoriosEnTransaccion,
  { valor }: Factura,
): Promise<void> {
  if ((await repos.cobros.listarDe([valor.id])).length > 0) {
    throw nuevoError(catalogo.DOM_0016, { id: valor.id });
  }
  const vigentes = await repos.facturas.listarDe(valor.servicioId);
  if (!admiteAnulacion(vigentes.map(comprobanteDe), valor.id).ok) {
    throw nuevoError(catalogo.DOM_0044, { id: valor.id });
  }
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

function filaDeFactura(
  { valor }: Factura,
  ordenCompra: string,
  documento: DocumentoListado | null,
  quien: string,
): FacturaListada {
  return {
    id: valor.id,
    tipo: tipoVisible(valor),
    numero: valor.numero,
    fecha: diaConBarras(valor.fecha),
    vencimiento: diaConBarras(valor.vencimiento),
    periodo: valor.periodo === null ? "" : nombreDelPeriodo(valor.periodo),
    ordenCompra,
    sinIva: formatearImporte(valor.importe),
    cambio: cambioVisible(valor.cambio, valor.importe.moneda),
    alicuota: etiquetaDeAlicuota(valor.alicuota),
    iva: formatearImporte(ivaDe(valor.importe, valor.alicuota)),
    total: formatearImporte(totalConIva(valor.importe, valor.alicuota)),
    documento,
    anticipo: valor.anticipo,
    interno: valor.tipo === "interno",
    quien,
  };
}

/** Cómo guarda la auditoría el tipo de cambio: los enteros grandes van como texto. */
const esquemaDeCambioAuditado = z
  .object({
    valor: z.object({ numerador: z.string(), denominador: z.string() }),
    fuente: z.string(),
  })
  .nullable()
  .catch(null);

function textoDeCambioAuditado(foto: unknown): string {
  const cambio = esquemaDeCambioAuditado.parse(foto);
  return (
    cambioVisible(
      cambio === null
        ? null
        : {
            valor: {
              numerador: BigInt(cambio.valor.numerador),
              denominador: BigInt(cambio.valor.denominador),
            },
            fuente: cambio.fuente,
          },
      MONEDA_CON_CAMBIO,
    )?.texto ?? ""
  );
}

/** El cambio del tipo de cambio que describe un registro de auditoría (la alta y la baja no cambian nada). */
function cambiosDeTipoDeCambio(
  registro: RegistroAuditoria,
  quien: string,
): readonly CambioAbm[] {
  if (registro.antes === null || registro.despues === null) {
    return [];
  }
  const de = textoDeCambioAuditado(registro.antes.cambio);
  const a = textoDeCambioAuditado(registro.despues.cambio);
  return de === a
    ? []
    : [
        {
          cuando: cuandoDe(registro.en),
          quien,
          campo: CAMPO_DE_CAMBIO[1].etiqueta,
          de,
          a,
        },
      ];
}

export function crearCasosUsoFacturas({
  transaccional,
  ...adjuntos
}: Dependencias): CasosUsoFacturas {
  const { reloj, generadorId } = adjuntos;
  return {
    listar(servicioId) {
      return transaccional.ejecutar(async (repos) => {
        await servicioVigente(repos, servicioId);
        const facturas = (await repos.facturas.listarDe(servicioId)).filter(
          (factura) => tieneSaldo(comprobanteDe(factura)),
        );
        const ordenes = await repos.ordenesCompra.listarDe(servicioId);
        const documento = await documentosListados(
          repos,
          facturas.map(({ valor }) => valor.documentoId),
        );
        const quien = await nombresDeActores(repos);
        return facturas.map((factura) =>
          filaDeFactura(
            factura,
            ordenes.find(
              ({ valor }) => valor.id === factura.valor.ordenCompraId,
            )?.valor.numero ?? "",
            documento(factura.valor.documentoId),
            quien(factura.creadoPor),
          ),
        );
      });
    },

    comprobanteInterno(servicioId, id) {
      return transaccional.ejecutar(async (repos) => {
        const factura = await facturaVigente(repos, id);
        const { valor } = factura;
        if (valor.tipo !== "interno" || valor.servicioId !== servicioId) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Factura", id });
        }
        const servicio = await servicioVigente(repos, servicioId);
        const [cliente] = await repos
          .abm("Cliente")
          .buscarPorIds([servicio.valor.clienteId]);
        const cotizacion = (await repos.cotizaciones.listarDe(servicioId))[0];
        const aprobados = (
          await repos.ajustesFacturacion.listarDe(servicioId)
        ).filter(
          ({ valor: ajuste }) =>
            ajuste.estado === "aprobado" &&
            ajuste.importe.moneda === cotizacion?.valor.importe.moneda,
        );
        const neto = aprobados.reduce(
          (suma, { valor: ajuste }) =>
            suma +
            (ajuste.clase === "recargo"
              ? ajuste.importe.centavos
              : -ajuste.importe.centavos),
          cotizacion?.valor.importe.centavos ?? 0n,
        );
        return {
          numero: valor.numero,
          fecha: diaConBarras(valor.fecha),
          vencimiento: diaConBarras(valor.vencimiento),
          cliente: cliente?.valor.razonSocial ?? "",
          servicioCodigo: servicio.valor.codigo,
          servicioTitulo: servicio.valor.titulo,
          cotizado:
            cotizacion === undefined
              ? ""
              : formatearImporte(cotizacion.valor.importe),
          ajustes: aprobados.map(({ valor: ajuste }) => ({
            concepto: ajuste.concepto,
            importe: `${ajuste.clase === "recargo" ? "+" : "−"} ${formatearImporte(ajuste.importe)}`,
          })),
          totalDelServicio:
            cotizacion === undefined
              ? ""
              : formatearImporte(
                  crearImporte(neto, cotizacion.valor.importe.moneda),
                ),
          total: formatearImporte(valor.importe),
        };
      });
    },

    ver(id) {
      return transaccional.ejecutar(async (repos) => {
        const factura = await facturaVigente(repos, id);
        const { servicioId, ordenCompraId, documentoId } = factura.valor;
        const servicio = await servicioVigente(repos, servicioId);
        const orden =
          ordenCompraId === null
            ? null
            : await repos.ordenesCompra.buscarPorId(ordenCompraId);
        const documento = await documentosListados(repos, [documentoId]);
        const quien = await nombresDeActores(repos);
        return {
          ...filaDeFactura(
            factura,
            orden?.valor.numero ?? "",
            documento(documentoId),
            quien(factura.creadoPor),
          ),
          servicioId,
          servicio: servicio.valor.codigo,
          cambios: (await repos.auditoria.registrosDe("Factura", id)).flatMap(
            (registro) =>
              cambiosDeTipoDeCambio(registro, quien(registro.actor)),
          ),
        };
      });
    },

    formulario(servicioId, anticipo = false) {
      return transaccional.ejecutar(async (repos) => {
        const { valor } = await servicioVigente(repos, servicioId);
        const interno = !valor.llevaFactura;
        const ordenes = await ordenesParaElegir(repos, servicioId);
        const [masNueva] = ordenes;
        // Sin factura, el importe viene de lo que queda por emitir y la moneda es la de la cotización.
        const cuentas = interno
          ? await cuentasDeAjustes(repos, servicioId)
          : null;
        const aEmitir =
          cuentas?.saldo != null && cuentas.saldo.centavos > 0n && !anticipo
            ? cuentas.saldo
            : null;
        const hoy = reloj.ahora();
        const mensual = valor.modalidadFacturacion === "mensual" && !anticipo;
        const delMes = mensual
          ? await facturaDelMes(repos, servicioId, hoy)
          : null;
        return {
          interno,
          campos: camposDeFactura(ordenes, mensual, anticipo, interno).filter(
            ([nombre]) => !(anticipo && nombre === "ordenCompraId"),
          ),
          escrito: {
            fecha: formatearISO(hoy).slice(0, 10),
            vencimiento: formatearISO(
              sumarDias(hoy, DIAS_AL_VENCIMIENTO),
            ).slice(0, 10),
            alicuota: String(ALICUOTA_POR_DEFECTO),
            // La factura no hereda la moneda de su orden: se propone la de la última.
            [nombreDeMoneda("importe")]:
              cuentas?.total?.moneda ?? masNueva?.moneda ?? MONEDAS[0],
            ...(aEmitir === null
              ? {}
              : {
                  importe: formatearMonto(aEmitir),
                  [nombreDeMoneda("importe")]: aEmitir.moneda,
                }),
            ...(delMes === null ? {} : { periodo: delMes.periodo }),
            ...(delMes === null || delMes.cuota === null
              ? {}
              : {
                  importe: formatearMonto(delMes.cuota),
                  [nombreDeMoneda("importe")]: delMes.cuota.moneda,
                }),
          },
        };
      });
    },

    crear(actor, servicioId, escrito, archivo) {
      return transaccional.ejecutar(async (repos) => {
        await exigirRol(
          repos.usuarios,
          actor,
          ROLES_QUE_ESCRIBEN_SERVICIOS,
          catalogo.AUT_0009,
        );
        // Con la fila del servicio tomada, la orden elegida no puede anularse a la vez.
        const { valor: servicio } = await servicioVigenteBloqueado(
          repos,
          servicioId,
        );
        const anticipo = escrito.anticipo === "1";
        if (anticipo) {
          await exigirEtapa(repos, servicioId, "anticipo");
        } else {
          await exigirEtapaDeFactura(
            repos,
            servicioId,
            servicio.modalidadFacturacion,
          );
        }
        const mensual =
          servicio.modalidadFacturacion === "mensual" && !anticipo;
        const interno = !servicio.llevaFactura;
        const ordenes = await ordenesParaElegir(repos, servicioId);
        const validado = validarEscrito(
          camposDeFactura(ordenes, mensual, anticipo, interno),
          interno ? VALIDACION_INTERNA : VALIDACION,
          // Un anticipo va siempre contra la orden vigente, si hay.
          anticipo
            ? { ...escrito, ordenCompraId: ordenes[0]?.valor ?? "" }
            : escrito,
        );
        const adjunto = validarAdjuntoOpcional(archivo);
        const repetido =
          validado.ok &&
          !interno &&
          (await repos.facturas.existeNumero(validado.datos.numero, "factura"));
        if (!validado.ok || !adjunto.ok || repetido) {
          return {
            ok: false,
            errores: {
              ...(validado.ok ? {} : validado.errores),
              ...(repetido ? { numero: MENSAJE_NUMERO_REPETIDO } : {}),
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
        await repos.facturas.crear(
          actor,
          crearAuditable(
            {
              ...validado.datos,
              ...(interno ? { numero: await numeroInterno(repos, reloj) } : {}),
              // Ya validado como día por el campo `fecha`: se guarda su mes.
              periodo: mensual
                ? `${(escrito.periodo ?? "").slice(0, 7)}-01`
                : null,
              servicioId,
              documentoId,
              tipo: interno ? "interno" : "factura",
              adicional: false,
              anticipo,
              comprobanteAsociadoId: null,
              motivoAnulacion: null,
              id,
            },
            actor,
            reloj,
          ),
        );
        return { ok: true, id };
      });
    },

    formularioDeCambio(id) {
      return transaccional.ejecutar(async (repos) => {
        const factura = await facturaVigente(repos, id);
        return {
          numero: factura.valor.numero,
          ...formularioDeCambio(factura.valor),
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
          repos.facturas,
          "Factura",
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
          ? await repos.facturas.buscarPorId(id)
          : null;
        const eliminada =
          actual === null ? null : marcarEliminado(actual, actor, reloj);
        if (actual === null || eliminada === null || !eliminada.ok) {
          throw nuevoError(catalogo.DOM_0009, { entidad: "Factura", id });
        }
        const { servicioId } = actual.valor;
        if (
          (actual.valor.tipo !== "factura" &&
            actual.valor.tipo !== "interno") ||
          actual.valor.adicional
        ) {
          throw nuevoError(catalogo.DOM_0045, { id });
        }
        // Con la fila del servicio tomada, un cobro o una nota de crédito de esta factura no se carga a la vez.
        await servicioVigenteBloqueado(repos, servicioId);
        await exigirEtapa(repos, servicioId, "factura");
        await exigirSinCobrosNiCreditos(repos, actual);
        await repos.facturas.actualizar(actor, eliminada.valor, "eliminar");
        await bajaDeAdjuntoOpcional(
          actor,
          repos,
          reloj,
          actual.valor.documentoId,
        );
        // Si la que se anula era la única con saldo, lo que queda está cobrado (F6-03).
        await cerrarSiEstaCobrado(actor, repos, reloj, servicioId);
      });
    },
  };
}
