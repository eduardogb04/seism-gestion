/**
 * F6-03 · Notas de crédito y de débito y la factura adicional, contra el
 * Postgres de verdad del arnés: las reglas de cada una, los números del
 * servicio (facturado, saldo de la orden, por facturar, por cobrar), el cierre
 * automático, la anulación con motivo y lo que ven el inicio y sus listados.
 * Datos inventados. Necesita Docker corriendo.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CUENTAS } from "../../src/casos-uso/abm/cuentas.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import {
  type Ajuste,
  crearCasosUsoAjustes,
} from "../../src/casos-uso/servicios/ajustes.ts";
import { crearCasosUsoCobros } from "../../src/casos-uso/servicios/cobros.ts";
import { crearCasosUsoFacturacion } from "../../src/casos-uso/servicios/facturacion.ts";
import { crearCasosUsoFacturas } from "../../src/casos-uso/servicios/facturas.ts";
import { crearCasosUsoOrdenesDeCompra } from "../../src/casos-uso/servicios/ordenes-de-compra.ts";
import { crearCasosUsoTablero } from "../../src/casos-uso/tablero/tablero.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { EstadoServicio } from "../../src/dominio/servicios/estados.ts";
import { nuevaClaveDocumento } from "../../src/infraestructura/arranque/almacen.ts";
import type { AlmacenDocumentos } from "../../src/puertos/almacen-documentos.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  conModalidad,
  llevarServicioA,
  sembrarServicio,
} from "./_arnes/servicio.ts";

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 20,
    hora: 10,
    minuto: 0,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

const PDF = new TextEncoder().encode("%PDF-1.4\nOrden de pago de ejemplo\n");

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
const almacenes: AlmacenTemporal[] = [];
let almacen: AlmacenDocumentos;
let admin: Actor;
let servicioId: string;
let ordenId: string;
let facturaId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const conAdjuntos = () => ({
  ...dependencias(),
  almacen,
  nuevaClave: nuevaClaveDocumento,
});
const ajustes = () => crearCasosUsoAjustes(conAdjuntos());
const facturas = () => crearCasosUsoFacturas(conAdjuntos());
const ordenes = () => crearCasosUsoOrdenesDeCompra(conAdjuntos());
const cobros = () => crearCasosUsoCobros(conAdjuntos());
const facturacion = () => crearCasosUsoFacturacion(dependencias());
const tablero = () => crearCasosUsoTablero(dependencias());

function llevarA(...recorrido: EstadoServicio[]): Promise<void> {
  return llevarServicioA(
    dependencias().transaccional,
    admin,
    servicioId,
    recorrido,
    HOY,
  );
}

async function estado(): Promise<string | undefined> {
  const [ultimo] = await cliente().servicioEvento.findMany({
    where: { servicioId },
    orderBy: { posicion: "desc" },
    take: 1,
  });
  return ultimo?.a;
}

function exigirOk<R extends { readonly ok: boolean }>(
  resultado: R,
  que: string,
): R {
  if (!resultado.ok) {
    throw new Error(`${que} no pasó: ${JSON.stringify(resultado)}`);
  }
  return resultado;
}

/** Un ajuste de `importe` sin IVA al 21 %, en pesos. */
function escritoDe(cambios: Escrito = {}): Escrito {
  return {
    numero: "0001-00000001",
    fecha: "2031-07-15",
    vencimiento: "2031-08-15",
    importe: "100,00",
    importeMoneda: "ARS",
    alicuota: "210",
    comprobanteAsociadoId: facturaId,
    ...cambios,
  };
}

function cargar(ajuste: Ajuste, cambios: Escrito = {}) {
  return ajustes().crear(admin, servicioId, ajuste, escritoDe(cambios), null);
}

async function cargado(ajuste: Ajuste, cambios: Escrito = {}): Promise<string> {
  exigirOk(await cargar(ajuste, cambios), `el ajuste ${ajuste}`);
  const fila = await cliente().factura.findFirstOrThrow({
    where: {
      numero: escritoDe(cambios).numero ?? "",
      eliminadoEn: null,
      ...(ajuste === "adicional"
        ? { tipo: "factura", adicional: true }
        : { tipo: ajuste }),
    },
  });
  return fila.id;
}

async function altaDeCuenta(): Promise<string> {
  const resultado = await crearCasosUsoAbm(dependencias()).crear(
    admin,
    CUENTAS,
    {
      nombre: "Caja en pesos",
      tipo: "banco",
      moneda: "ARS",
      observaciones: "",
      activa: "si",
    },
  );
  if (!resultado.ok) {
    throw new Error(`la cuenta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

async function cobrar(
  id: string,
  importe: string,
  ordenDePago = false,
): Promise<void> {
  exigirOk(
    await cobros().registrar(
      admin,
      id,
      {
        fecha: "2031-07-18",
        importe,
        retencion: "",
        cuentaId: await altaDeCuenta(),
        tipoDeCambio: "",
        fuenteDelCambio: "",
        observaciones: "",
        ordenPagoNumero: ordenDePago ? "OP-0001" : "",
      },
      ordenDePago ? { nombre: "orden-de-pago.pdf", bytes: PDF } : null,
    ),
    "el cobro",
  );
}

/** El saldo con IVA de un comprobante con saldo, como lo muestra la cobranza. */
async function saldoDe(id: string): Promise<string | undefined> {
  return (await cobros().cobranza(servicioId)).find(
    ({ facturaId: deLaFila }) => deLaFila === id,
  )?.saldo;
}

/** Devengado | por facturar | saldo de la orden | por cobrar, en pesos. */
async function numeros(): Promise<string> {
  const [linea] = (await facturacion().ver(servicioId)).lineas;
  return [
    linea?.devengado,
    linea?.porFacturar,
    linea?.saldoDeOrden,
    linea?.porCobrar,
  ].join(" | ");
}

async function facturadoDelAvance(): Promise<string | undefined> {
  return (await cobros().avance(servicioId)).servicio[0]?.facturado;
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
  await Promise.all(almacenes.map((usado) => usado.borrar()));
});

/** Un servicio «Por hitos» con una orden de 5.000,00 y una factura de 1.000,00 (1.210,00 con IVA), en «Finalizado». */
beforeEach(async () => {
  await limpiarBase();
  const temporal = await crearAlmacenTemporal();
  almacenes.push(temporal);
  ({ almacen } = temporal);
  const [usuario] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
  if (usuario === undefined) {
    throw new Error("no se sembró el administrador");
  }
  admin = { tipo: "persona", usuarioId: usuario.id };
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    usuario.id,
  );
  await conModalidad(cliente(), servicioId);
  await llevarA("cotizado");
  const orden = exigirOk(
    await ordenes().crear(
      admin,
      servicioId,
      {
        numero: "OC-0001",
        fecha: "2031-07-01",
        importe: "5.000,00",
        importeMoneda: "ARS",
        observaciones: "",
      },
      null,
    ),
    "la orden",
  );
  ordenId = orden.ok ? orden.id : "";
  await llevarA("en_ejecucion");
  const factura = exigirOk(
    await facturas().crear(
      admin,
      servicioId,
      {
        numero: "0001-00000001",
        fecha: "2031-07-04",
        vencimiento: "2031-08-04",
        importe: "1.000,00",
        importeMoneda: "ARS",
        alicuota: "210",
        ordenCompraId: ordenId,
      },
      null,
    ),
    "la factura",
  );
  facturaId = factura.ok ? factura.id : "";
  await llevarA("finalizado");
});

describe("nota de crédito", () => {
  test("baja el saldo de su factura, lo facturado y el saldo de la orden, y lleva la alícuota de la factura", async () => {
    expect(await numeros()).toBe(
      "ARS 1.000,00 | ARS 4.000,00 | ARS 4.000,00 | ARS 1.210,00",
    );

    const nota = await cargado("nota_credito", {
      importe: "300,00",
      alicuota: "0",
    });

    const fila = await cliente().factura.findUniqueOrThrow({
      where: { id: nota },
    });
    expect(fila).toMatchObject({
      tipo: "nota_credito",
      adicional: false,
      comprobanteAsociadoId: facturaId,
      ordenCompraId: ordenId,
      importeCentavos: 30_000n,
      alicuotaIva: 210,
    });
    expect(await saldoDe(facturaId)).toBe("ARS 847,00");
    expect(await facturadoDelAvance()).toBe("ARS 847,00");
    expect(await numeros()).toBe(
      "ARS 700,00 | ARS 4.300,00 | ARS 4.300,00 | ARS 847,00",
    );
    const [orden] = await ordenes().listar(servicioId);
    expect([orden?.facturado, orden?.saldo]).toEqual([
      "ARS 700,00",
      "ARS 4.300,00",
    ]);
  });

  test("mayor que el saldo pendiente de su comprobante se rechaza (DOM-0043) y no se escribe nada", async () => {
    await cobrar(facturaId, "1.000,00");
    const antes = await cliente().factura.count();

    const resultado = await cargar("nota_credito", { importe: "200,00" });

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errores.importe).toBe(
      `${catalogo.DOM_0043.codigo} · ${catalogo.DOM_0043.descripcion} Quedan ARS 210,00.`,
    );
    expect(await cliente().factura.count()).toBe(antes);
    exigirOk(
      await cargar("nota_credito", { importe: "100,00" }),
      "la nota que entra justo",
    );
  });

  test("sin comprobante, con uno de otra moneda o con una nota de crédito como asociado: DOM-0042", async () => {
    const sinAsociado = await cargar("nota_credito", {
      comprobanteAsociadoId: "",
    });
    expect(!sinAsociado.ok && sinAsociado.errores.comprobanteAsociadoId).toBe(
      "Elegí el comprobante al que corresponde.",
    );
    const otraMoneda = await cargar("nota_credito", {
      importeMoneda: "USD",
      cambio: "1.100,00",
      cambioFuente: "Cotización de ejemplo",
    });
    expect(
      !otraMoneda.ok && otraMoneda.errores.comprobanteAsociadoId,
    ).toContain(catalogo.DOM_0042.codigo);
    const nota = await cargado("nota_credito");
    const sobreNota = await cargar("nota_credito", {
      numero: "0001-00000002",
      comprobanteAsociadoId: nota,
    });
    expect(!sobreNota.ok && sobreNota.errores.comprobanteAsociadoId).toContain(
      catalogo.DOM_0042.codigo,
    );
  });

  test("fuera de «Finalizado» se rechaza con DOM-0018 y no escribe nada", async () => {
    await llevarA("cerrado");
    const antes = await cliente().factura.count();

    await expect(cargar("nota_credito")).rejects.toMatchObject({
      codigo: catalogo.DOM_0018.codigo,
    });
    await expect(cargar("adicional")).rejects.toMatchObject({
      codigo: catalogo.DOM_0018.codigo,
    });
    expect(await cliente().factura.count()).toBe(antes);
  });

  test("no se cobra (DOM-0046) ni aparece en Por cobrar", async () => {
    const nota = await cargado("nota_credito");

    await expect(cobros().formulario(nota)).rejects.toMatchObject({
      codigo: catalogo.DOM_0046.codigo,
    });
    const { filas } = await cobros().porCobrar({});
    expect(filas.map(({ facturaId: id }) => id)).toEqual([facturaId]);
  });

  test("una nota que deja todo en cero cierra el servicio en la misma transacción", async () => {
    await cobrar(facturaId, "1.089,00");
    expect(await estado()).toBe("finalizado");

    await cargado("nota_credito", { importe: "100,00" });

    expect(await saldoDe(facturaId)).toBe("ARS 0,00");
    expect(await estado()).toBe("cerrado");
  });
});

describe("factura adicional", () => {
  test("suma a lo facturado y al por cobrar, no mueve el saldo de la orden ni el por facturar, y se cobra con orden de pago", async () => {
    const adicional = await cargado("adicional", {
      numero: "0001-00000002",
      importe: "500,00",
    });

    expect(
      await cliente().factura.findUniqueOrThrow({ where: { id: adicional } }),
    ).toMatchObject({
      tipo: "factura",
      adicional: true,
      ordenCompraId: null,
      comprobanteAsociadoId: null,
    });
    expect(await numeros()).toBe(
      "ARS 1.000,00 | ARS 4.000,00 | ARS 4.000,00 | ARS 1.815,00",
    );
    expect(await facturadoDelAvance()).toBe("ARS 1.815,00");
    const [orden] = await ordenes().listar(servicioId);
    expect(orden?.saldo).toBe("ARS 4.000,00");
    expect(
      (await facturas().listar(servicioId)).map(({ tipo }) => tipo),
    ).toEqual(["Factura adicional", "Factura"]);

    await cobrar(adicional, "605,00", true);
    expect(await saldoDe(adicional)).toBe("ARS 0,00");
    const [cobro] = await cliente().cobro.findMany({
      where: { facturaId: adicional },
    });
    expect(cobro?.ordenPagoNumero).toBe("OP-0001");
    expect(cobro?.ordenPagoDocumentoId).not.toBeNull();
  });
});

describe("nota de débito", () => {
  test("asociada a la factura suma a lo facturado y a la orden; suelta, solo a lo facturado; las dos se cobran y salen en Por cobrar", async () => {
    const asociada = await cargado("nota_debito", { importe: "200,00" });
    const suelta = await cargado("nota_debito", {
      numero: "0001-00000002",
      importe: "50,00",
      comprobanteAsociadoId: "",
    });

    expect(await numeros()).toBe(
      "ARS 1.200,00 | ARS 3.800,00 | ARS 3.800,00 | ARS 1.512,50",
    );
    const { filas } = await cobros().porCobrar({});
    expect(filas.map(({ facturaId: id }) => id).sort()).toEqual(
      [facturaId, asociada, suelta].sort(),
    );
    await cobrar(asociada, "242,00");
    expect(await saldoDe(asociada)).toBe("ARS 0,00");
  });
});

describe("anular", () => {
  test("un comprobante con notas de crédito vigentes no se anula (DOM-0044); la nota se anula con motivo y el saldo vuelve", async () => {
    const nota = await cargado("nota_credito", { importe: "300,00" });

    await expect(
      facturas().marcarEliminado(admin, facturaId),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0044.codigo });
    await expect(facturas().marcarEliminado(admin, nota)).rejects.toMatchObject(
      { codigo: catalogo.DOM_0045.codigo },
    );
    const sinMotivo = await ajustes().marcarAnulado(admin, nota, {
      motivo: " ",
    });
    expect(sinMotivo.ok).toBe(false);
    expect(await saldoDe(facturaId)).toBe("ARS 847,00");

    exigirOk(
      await ajustes().marcarAnulado(admin, nota, {
        motivo: "Se cargó por error",
      }),
      "la anulación",
    );

    expect(await saldoDe(facturaId)).toBe("ARS 1.210,00");
    expect(
      await cliente().factura.findUniqueOrThrow({ where: { id: nota } }),
    ).toMatchObject({ motivoAnulacion: "Se cargó por error" });
    expect(await ajustes().listar(servicioId)).toEqual([]);
    exigirOk(
      await cargar("nota_credito", { importe: "300,00" }),
      "otra nota con el mismo número",
    );
  });

  test("anular una nota de débito con saldo que era lo único pendiente cierra el servicio", async () => {
    await cobrar(facturaId, "1.210,00");
    const debito = await cargado("nota_debito");
    expect(await estado()).toBe("finalizado");

    exigirOk(
      await ajustes().marcarAnulado(admin, debito, { motivo: "Duplicada" }),
      "la anulación",
    );

    expect(await estado()).toBe("cerrado");
  });
});

describe("inicio y listados", () => {
  test("un mes con una nota de crédito baja la facturación del mes, la rentabilidad y el listado, que dice el tipo y lo filtra", async () => {
    await cargado("nota_credito", { importe: "300,00" });

    const inicio = await tablero().tablero({ mes: "2031-07" });
    const pesos = inicio.delMes.find(({ moneda }) => moneda === "ARS");
    expect(pesos?.facturadoSinIva.valor).toBe("ARS 700,00");
    expect(pesos?.facturadoConIva.valor).toBe("ARS 847,00");
    expect(inicio.convertido.facturado.valor).toBe("ARS 700,00");
    expect(
      inicio.convertido.rentabilidad.map(({ resultado }) => resultado),
    ).toEqual([700]);

    const listado = await tablero().listados.facturas({
      mes: "2031-07",
      moneda: "ARS",
    });
    expect(listado.filas.map(({ tipo, sinIva }) => [tipo, sinIva])).toEqual([
      ["Factura", "1.000,00"],
      ["Nota de crédito", "-300,00"],
    ]);
    expect(listado.totalSinIva).toBe("ARS 700,00");
    const soloNotas = await tablero().listados.facturas({
      mes: "2031-07",
      moneda: "ARS",
      tipo: "nota_credito",
    });
    expect(soloNotas.tipo).toBe("nota_credito");
    expect(soloNotas.filas.map(({ tipo }) => tipo)).toEqual([
      "Nota de crédito",
    ]);
    expect(soloNotas.filas[0]?.conSaldo).toBe(false);
  });
});
