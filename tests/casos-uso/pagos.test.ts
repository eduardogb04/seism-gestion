/**
 * Pagos de egresos (F2-09, ADR 0034), contra el Postgres de verdad del
 * arnés: pago parcial y saldo, pago que salda, pago de más, tipo de cambio,
 * redondeo, dos pagos a la vez, anulación, auditoría, *Por pagar* y lo que la
 * base impide mientras hay pagos vigentes. Datos inventados. Necesita Docker.
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
import { CENTROS_DE_COSTO } from "../../src/casos-uso/abm/centros-de-costo.ts";
import { CUENTAS } from "../../src/casos-uso/abm/cuentas.ts";
import type {
  DefinicionAbm,
  Escrito,
} from "../../src/casos-uso/abm/definicion.ts";
import { EGRESOS } from "../../src/casos-uso/abm/egresos.ts";
import { crearCasosUsoPagos } from "../../src/casos-uso/egresos/pagos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import type { EntidadAbm } from "../../src/puertos/repositorios/abm.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const HOY = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;
let emailAdmin: string;
let centroId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

const dependencias = () => ({
  transaccional: crearTransaccionalPrisma(cliente()),
  reloj: RelojFijo(HOY),
  generadorId: crearGeneradorIdCrypto(),
});

const abm = () => crearCasosUsoAbm(dependencias());
const pagos = () => crearCasosUsoPagos(dependencias());

async function alta<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
  escrito: Escrito,
): Promise<string> {
  const resultado = await abm().crear(admin, definicion, escrito);
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.registro.valor.id;
}

function altaDeCuenta(
  nombre: string,
  moneda: "ARS" | "USD",
  activa = true,
): Promise<string> {
  return alta(CUENTAS, {
    nombre,
    tipo: "banco",
    moneda,
    observaciones: "",
    activa: activa ? "si" : "",
  });
}

function altaDeEgreso(cambios: Escrito = {}): Promise<string> {
  return alta(EGRESOS, {
    fecha: "2031-06-01",
    concepto: "Combustible",
    centroCostoId: centroId,
    proveedorId: "",
    numeroComprobante: "",
    importe: "1.000,00",
    importeMoneda: "ARS",
    vencimiento: "",
    observaciones: "",
    ...cambios,
  });
}

function pago(cuentaId: string, cambios: Escrito = {}): Escrito {
  return {
    fecha: "2031-07-01",
    importe: "400,00",
    cuentaId,
    tipoDeCambio: "",
    fuenteDelCambio: "",
    observaciones: "",
    ...cambios,
  };
}

/** Registra un pago que tiene que pasar, o el test se cae con lo que faltó. */
async function pagado(
  egresoId: string,
  cuentaId: string,
  cambios: Escrito = {},
): Promise<void> {
  const resultado = await pagos().registrarPago(
    admin,
    egresoId,
    pago(cuentaId, cambios),
  );
  if (!resultado.ok) {
    throw new Error(`el pago no pasó: ${JSON.stringify(resultado.errores)}`);
  }
}

async function cantidadDePagos(): Promise<number> {
  return cliente().pago.count();
}

describe("pagos de egresos", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const [sembrado] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
    if (sembrado === undefined) {
      throw new Error("falta el administrador sembrado");
    }
    admin = { tipo: "persona", usuarioId: sembrado.id };
    emailAdmin = sembrado.email;
    centroId = await alta(CENTROS_DE_COSTO, {
      nombre: "Administración",
      clase: "proyecto",
      descripcion: "",
      activo: "si",
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("pago parcial, pago que salda", () => {
    test("un pago parcial deja pagado y saldo, y se ve en la lista de pagos con quién lo cargó", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta),
      );

      expect(resultado).toEqual({ ok: true });
      const detalle = await pagos().detalle(egreso);
      expect(detalle.total).toBe("ARS 1.000,00");
      expect(detalle.pagado).toBe("ARS 400,00");
      expect(detalle.saldo).toBe("ARS 600,00");
      expect(detalle.saldado).toBe(false);
      expect(detalle.pagos).toHaveLength(1);
      expect(detalle.pagos[0]).toMatchObject({
        fecha: "01/07/2031",
        importe: "ARS 400,00",
        cuenta: "Caja en pesos",
        salida: "ARS 400,00",
        cambio: "",
        quien: emailAdmin,
      });
    });

    test("el pago que salda deja el saldo en cero y el egreso queda pagado", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { importe: "400,00" });

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe: "600,00", fecha: "2031-07-05" }),
      );

      expect(resultado).toEqual({ ok: true });
      const detalle = await pagos().detalle(egreso);
      expect(detalle.pagado).toBe("ARS 1.000,00");
      expect(detalle.saldo).toBe("ARS 0,00");
      expect(detalle.saldado).toBe(true);
      expect(detalle.pagos.map(({ fecha }) => fecha)).toEqual([
        "01/07/2031",
        "05/07/2031",
      ]);
    });

    test("un pago de más se rechaza con DOM-0012 al lado del importe y no guarda nada", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { importe: "900,00" });
      const antes = await cantidadDePagos();
      const auditoriaAntes = await cliente().auditoria.count();

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe: "100,01" }),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.importe).toContain(catalogo.DOM_0012.codigo);
        expect(resultado.errores.importe).toContain("ARS 100,00");
      }
      expect(await cantidadDePagos()).toBe(antes);
      expect(await cliente().auditoria.count()).toBe(auditoriaAntes);
    });

    test.each([
      ["cero", "0,00"],
      ["negativo", "-5,00"],
    ])("un importe %s vuelve en el campo", async (_nombre, importe) => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe }),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.importe).toBe(
          "El importe tiene que ser mayor que cero.",
        );
      }
      expect(await cantidadDePagos()).toBe(0);
    });

    test("lo que falla en el formulario vuelve junto, cada cosa en su campo, sin guardar", async () => {
      const egreso = await altaDeEgreso();

      const resultado = await pagos().registrarPago(admin, egreso, {
        fecha: "2031-02-30",
        importe: "abc",
        cuentaId: "",
        tipoDeCambio: "",
        fuenteDelCambio: "",
        observaciones: "",
      });

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(Object.keys(resultado.errores).sort()).toEqual([
          "cuentaId",
          "fecha",
          "importe",
        ]);
      }
      expect(await cantidadDePagos()).toBe(0);
    });

    test("un egreso que no existe o está dado de baja: DOM-0009", async () => {
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      const egreso = await altaDeEgreso();
      await abm().marcarEliminado(admin, EGRESOS, egreso);

      await expect(
        pagos().registrarPago(admin, egreso, pago(cuenta)),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
      await expect(pagos().detalle(egreso)).rejects.toMatchObject({
        codigo: catalogo.DOM_0009.codigo,
      });
      await expect(
        pagos().registrarPago(admin, "no-es-un-id", pago(cuenta)),
      ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    });

    test("sin un usuario activo con rol que escriba: AUT-0009 y nada guardado", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      const desconocido: Actor = {
        tipo: "persona",
        usuarioId: "00000000-0000-4000-8000-0000000000ff" as never,
      };

      await expect(
        pagos().registrarPago(desconocido, egreso, pago(cuenta)),
      ).rejects.toMatchObject({ codigo: catalogo.AUT_0009.codigo });
      expect(await cantidadDePagos()).toBe(0);
    });
  });

  describe("la cuenta", () => {
    test("una cuenta inactiva no se puede elegir y no aparece en el selector", async () => {
      const egreso = await altaDeEgreso();
      const activa = await altaDeCuenta("Caja en pesos", "ARS");
      const inactiva = await altaDeCuenta("Caja vieja", "ARS", false);

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(inactiva),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.cuentaId).toBe("Elegí una cuenta activa.");
      }
      expect(await cantidadDePagos()).toBe(0);
      const { cuentas } = await pagos().detalle(egreso);
      expect(cuentas).toEqual([
        { valor: activa, texto: "Caja en pesos · ARS" },
      ]);
    });

    test("una cuenta dada de baja tampoco", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await abm().marcarEliminado(admin, CUENTAS, cuenta);

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.cuentaId).toBe("Elegí una cuenta activa.");
      }
    });
  });

  describe("tipo de cambio", () => {
    test("monedas distintas sin tipo de cambio: DOM-0013 al lado del tipo de cambio", async () => {
      const egreso = await altaDeEgreso({
        importe: "100,00",
        importeMoneda: "USD",
      });
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe: "50,00" }),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.tipoDeCambio).toContain(
          catalogo.DOM_0013.codigo,
        );
      }
      expect(await cantidadDePagos()).toBe(0);
    });

    test("monedas iguales con tipo de cambio: sobra, DOM-0013", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, {
          tipoDeCambio: "1.000",
          fuenteDelCambio: "BNA vendedor",
        }),
      );

      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.errores.tipoDeCambio).toContain(
          catalogo.DOM_0013.codigo,
        );
      }
      expect(await cantidadDePagos()).toBe(0);
    });

    test("monedas distintas con valor ilegible o sin fuente: cada cosa en su campo", async () => {
      const egreso = await altaDeEgreso({
        importe: "100,00",
        importeMoneda: "USD",
      });
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const ilegible = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, {
          importe: "50,00",
          tipoDeCambio: "mil",
          fuenteDelCambio: "BNA",
        }),
      );
      const sinFuente = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe: "50,00", tipoDeCambio: "1.184,25" }),
      );

      expect(ilegible.ok).toBe(false);
      expect(!ilegible.ok && Object.keys(ilegible.errores)).toEqual([
        "tipoDeCambio",
      ]);
      expect(sinFuente.ok).toBe(false);
      expect(!sinFuente.ok && Object.keys(sinFuente.errores)).toEqual([
        "fuenteDelCambio",
      ]);
      expect(await cantidadDePagos()).toBe(0);
    });

    test("un egreso en dólares pagado desde una cuenta en pesos: el saldo es exacto en dólares y la cuenta guarda lo convertido, con redondeo del dominio", async () => {
      const egreso = await altaDeEgreso({
        importe: "100,01",
        importeMoneda: "USD",
      });
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      // USD 40,01 × 1.184,25 = ARS 47.381,8425 → 47.381,84
      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, {
          importe: "40,01",
          tipoDeCambio: "1.184,25",
          fuenteDelCambio: "BNA vendedor",
        }),
      );

      expect(resultado).toEqual({ ok: true });
      const detalle = await pagos().detalle(egreso);
      expect(detalle.pagado).toBe("USD 40,01");
      expect(detalle.saldo).toBe("USD 60,00");
      expect(detalle.pagos[0]).toMatchObject({
        importe: "USD 40,01",
        salida: "ARS 47.381,84",
        cambio: "1.184,25 · BNA vendedor",
      });
      const fila = await cliente().pago.findFirstOrThrow();
      expect(fila.importeCentavos).toBe(4_001n);
      expect(fila.importeMoneda).toBe("USD");
      expect(fila.salidaCentavos).toBe(4_738_184n);
      expect(fila.salidaMoneda).toBe("ARS");
      expect(fila.cambioNumerador).toBe(118_425n);
      expect(fila.cambioDenominador).toBe(100n);
      expect(fila.cambioFuente).toBe("BNA vendedor");
    });

    test("un egreso en pesos pagado desde una cuenta en dólares", async () => {
      const egreso = await altaDeEgreso({ importe: "118.425,00" });
      const cuenta = await altaDeCuenta("Caja en dólares", "USD");

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, {
          importe: "118.425,00",
          tipoDeCambio: "0,00085",
          fuenteDelCambio: "Cotización inventada",
        }),
      );

      expect(resultado).toEqual({ ok: true });
      const detalle = await pagos().detalle(egreso);
      expect(detalle.saldado).toBe(true);
      expect(detalle.pagos[0]?.salida).toBe("USD 100,66");
    });
  });

  describe("dos pagos a la vez", () => {
    test("cinco pagos de 400 sobre un total de 1.000 al mismo tiempo: se aceptan dos y nunca se pasa del total", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");

      const resultados = await Promise.all(
        Array.from({ length: 5 }, () =>
          pagos().registrarPago(admin, egreso, pago(cuenta)),
        ),
      );

      expect(resultados.filter(({ ok }) => ok)).toHaveLength(2);
      for (const resultado of resultados.filter(({ ok }) => !ok)) {
        expect(resultado.ok === false && resultado.errores.importe).toContain(
          catalogo.DOM_0012.codigo,
        );
      }
      expect(await cantidadDePagos()).toBe(2);
      expect((await pagos().detalle(egreso)).saldo).toBe("ARS 200,00");
    });
  });

  describe("anular un pago", () => {
    test("el saldo vuelve, el pago ya no se lista y queda en la auditoría", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { importe: "1.000,00" });
      const [{ id }] = (await cliente().pago.findMany({
        select: { id: true },
      })) as [{ id: string }];
      expect((await pagos().detalle(egreso)).saldado).toBe(true);

      await pagos().marcarPagoAnulado(admin, id);

      const detalle = await pagos().detalle(egreso);
      expect(detalle.saldo).toBe("ARS 1.000,00");
      expect(detalle.saldado).toBe(false);
      expect(detalle.pagos).toEqual([]);
      const fila = await cliente().pago.findUniqueOrThrow({ where: { id } });
      expect(fila.eliminadoEn).not.toBeNull();
      const acciones = (
        await cliente().auditoria.findMany({
          where: { entidad: "Pago", entidadId: id },
          orderBy: { en: "asc" },
        })
      ).map(({ accion }) => accion);
      expect(acciones).toEqual(["crear", "eliminar"]);
    });

    test("anular dos veces, o un pago que no existe: DOM-0009", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta);
      const fila = await cliente().pago.findFirstOrThrow();
      await pagos().marcarPagoAnulado(admin, fila.id);

      await expect(
        pagos().marcarPagoAnulado(admin, fila.id),
      ).rejects.toMatchObject({
        codigo: catalogo.DOM_0009.codigo,
      });
      await expect(
        pagos().marcarPagoAnulado(admin, "no-es-un-id"),
      ).rejects.toMatchObject({
        codigo: catalogo.DOM_0009.codigo,
      });
    });

    test("un pago anulado libera el cupo: se puede volver a pagar ese importe", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { importe: "1.000,00" });
      const fila = await cliente().pago.findFirstOrThrow();
      await pagos().marcarPagoAnulado(admin, fila.id);

      const resultado = await pagos().registrarPago(
        admin,
        egreso,
        pago(cuenta, { importe: "1.000,00" }),
      );

      expect(resultado).toEqual({ ok: true });
    });
  });

  describe("auditoría", () => {
    test("cada alta deja su registro, con el actor y lo que se guardó", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { observaciones: "Anticipo" });
      const fila = await cliente().pago.findFirstOrThrow();

      const registros = await cliente().auditoria.findMany({
        where: { entidad: "Pago" },
      });

      expect(registros).toHaveLength(1);
      expect(registros[0]).toMatchObject({
        entidadId: fila.id,
        accion: "crear",
        antes: null,
      });
      expect(registros[0]?.actor).toEqual({
        tipo: "persona",
        usuarioId: admin.tipo === "persona" ? admin.usuarioId : "",
      });
      expect(registros[0]?.despues).toMatchObject({
        egresoId: egreso,
        cuentaId: cuenta,
        fecha: "2031-07-01",
        observaciones: "Anticipo",
      });
    });
  });

  describe("Por pagar", () => {
    async function sembrarPorPagar() {
      const pesos = await altaDeCuenta("Caja en pesos", "ARS");
      const dolares = await altaDeCuenta("Caja en dólares", "USD");
      const sinVencer = await altaDeEgreso({
        concepto: "Sin vencimiento",
        importe: "500,00",
      });
      const tarde = await altaDeEgreso({
        concepto: "Vencido hace diez días",
        importe: "1.000,00",
        vencimiento: "2031-06-29",
      });
      const proximo = await altaDeEgreso({
        concepto: "Vence mañana",
        importe: "300,00",
        vencimiento: "2031-07-10",
      });
      const enDolares = await altaDeEgreso({
        concepto: "Licencia",
        importe: "100,00",
        importeMoneda: "USD",
        vencimiento: "2031-07-09",
      });
      const saldado = await altaDeEgreso({
        concepto: "Ya pagado",
        importe: "200,00",
        vencimiento: "2031-06-01",
      });
      await pagado(tarde, pesos, { importe: "250,00" });
      await pagado(saldado, pesos, { importe: "200,00" });
      await pagado(enDolares, dolares, { importe: "40,00" });
      return { sinVencer, tarde, proximo, enDolares, saldado };
    }

    test("solo los egresos con saldo, por vencimiento (sin vencimiento al final), con días de atraso del reloj", async () => {
      await sembrarPorPagar();

      const listado = await pagos().porPagar({});

      expect(listado.total).toBe(4);
      expect(listado.filas.map(({ concepto }) => concepto)).toEqual([
        "Vencido hace diez días",
        "Licencia",
        "Vence mañana",
        "Sin vencimiento",
      ]);
      expect(listado.filas.map(({ atraso }) => atraso)).toEqual([
        "10 días",
        "",
        "",
        "",
      ]);
      expect(listado.filas[0]).toMatchObject({
        fecha: "01/06/2031",
        centroCosto: "Administración",
        proveedor: "",
        total: "ARS 1.000,00",
        pagado: "ARS 250,00",
        saldo: "ARS 750,00",
        vencimiento: "29/06/2031",
      });
    });

    test("un día de atraso se escribe en singular, y el que vence hoy no está atrasado", async () => {
      await altaDeEgreso({ concepto: "Ayer", vencimiento: "2031-07-08" });
      await altaDeEgreso({ concepto: "Hoy", vencimiento: "2031-07-09" });

      const { filas } = await pagos().porPagar({});

      expect(filas.map(({ concepto, atraso }) => [concepto, atraso])).toEqual([
        ["Ayer", "1 día"],
        ["Hoy", ""],
      ]);
    });

    test("los totales de saldo son uno por moneda, sin mezclar", async () => {
      await sembrarPorPagar();

      const { saldos } = await pagos().porPagar({});

      // Pesos: 500 + 750 + 300 = 1.550 · Dólares: 100 - 40 = 60
      expect(saldos).toEqual(["ARS 1.550,00", "USD 60,00"]);
    });

    test("con la casilla de pagados, también se listan los que no deben nada", async () => {
      await sembrarPorPagar();

      const { filas, total, incluirPagados } = await pagos().porPagar({
        pagados: "si",
      });

      expect(incluirPagados).toBe(true);
      expect(total).toBe(5);
      expect(filas.map(({ concepto }) => concepto)).toContain("Ya pagado");
      expect(
        filas.find(({ concepto }) => concepto === "Ya pagado")?.saldo,
      ).toBe("ARS 0,00");
    });

    test("un egreso dado de baja no está, y un pago anulado devuelve su saldo", async () => {
      const { sinVencer, saldado } = await sembrarPorPagar();
      await abm().marcarEliminado(admin, EGRESOS, sinVencer);
      const fila = await cliente().pago.findFirstOrThrow({
        where: { egresoId: saldado },
      });
      await pagos().marcarPagoAnulado(admin, fila.id);

      const { filas } = await pagos().porPagar({});

      expect(filas.map(({ concepto }) => concepto)).not.toContain(
        "Sin vencimiento",
      );
      expect(
        filas.find(({ concepto }) => concepto === "Ya pagado")?.saldo,
      ).toBe("ARS 200,00");
    });

    test("pagina de a 25", async () => {
      for (let numero = 0; numero < 27; numero += 1) {
        await altaDeEgreso({
          concepto: `Egreso ${String(numero).padStart(2, "0")}`,
          vencimiento: `2031-08-${String(numero + 1).padStart(2, "0")}`,
        });
      }

      const primera = await pagos().porPagar({});
      const segunda = await pagos().porPagar({ pagina: "2" });

      expect(primera.filas).toHaveLength(25);
      expect(primera.paginas).toBe(2);
      expect(segunda.pagina).toBe(2);
      expect(segunda.filas.map(({ concepto }) => concepto)).toEqual([
        "Egreso 25",
        "Egreso 26",
      ]);
      expect(segunda.saldos).toEqual(["ARS 27.000,00"]);
    });
  });

  describe("mientras hay pagos vigentes (la base lo impide)", () => {
    test("la cuenta no se puede dar de baja: DOM-0010; sin pagos vigentes, sí", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta);

      await expect(
        abm().marcarEliminado(admin, CUENTAS, cuenta),
      ).rejects.toMatchObject({
        codigo: catalogo.DOM_0010.codigo,
      });

      const fila = await cliente().pago.findFirstOrThrow();
      await pagos().marcarPagoAnulado(admin, fila.id);
      await abm().marcarEliminado(admin, CUENTAS, cuenta);
      const guardada = await cliente().cuenta.findUniqueOrThrow({
        where: { id: cuenta },
      });
      expect(guardada.eliminadoEn).not.toBeNull();
    });

    test("el egreso no se puede dar de baja: DOM-0010", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta);

      await expect(
        abm().marcarEliminado(admin, EGRESOS, egreso),
      ).rejects.toMatchObject({
        codigo: catalogo.DOM_0010.codigo,
      });
    });

    test("el egreso no baja de lo ya pagado ni cambia de moneda, pero sí se puede subir o editar otra cosa", async () => {
      const egreso = await altaDeEgreso();
      const cuenta = await altaDeCuenta("Caja en pesos", "ARS");
      await pagado(egreso, cuenta, { importe: "400,00" });
      const edicion = (cambios: Escrito) =>
        abm().guardar(admin, EGRESOS, egreso, {
          fecha: "2031-06-01",
          concepto: "Combustible",
          centroCostoId: centroId,
          proveedorId: "",
          numeroComprobante: "",
          importe: "1.000,00",
          importeMoneda: "ARS",
          vencimiento: "",
          observaciones: "",
          ...cambios,
        });

      await expect(edicion({ importe: "399,99" })).rejects.toMatchObject({
        code: "P2003",
      });
      await expect(edicion({ importeMoneda: "USD" })).rejects.toMatchObject({
        code: "P2003",
      });
      expect((await edicion({ importe: "400,00" })).ok).toBe(true);
      expect(
        (await edicion({ importe: "2.000,00", concepto: "Otro" })).ok,
      ).toBe(true);
    });
  });
});
