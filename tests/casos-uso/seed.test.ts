/**
 * Test del mecanismo de semilla (F0-10, cimiento 3): `sembrar` corrida dos
 * veces contra un Postgres de verdad deja la base exactamente igual.
 *
 * Corre contra la base compartida del arnés de casos de uso (F0-14), que el
 * `globalSetup` deja migrada una vez por corrida; `limpiarBase()` la vacía
 * antes de cada test. Usa el cliente real (`crearClientePrisma`, con el
 * adaptador `@prisma/adapter-pg`) para correr `sembrar` dos veces y comparar
 * las filas de `configuracion` entre las dos corridas: tienen que coincidir
 * fila por fila, `id` y `creado_en` incluidos (si `sembrar` recreara o tocara
 * una fila sin necesidad, esos campos —o `actualizado_en`— cambiarían entre
 * corridas).
 *
 * Desde F1-03 también siembra los **datos de demostración** (tres grupos
 * inventados), con el actor `db-seed` y su auditoría, en `local` y en `ci`;
 * en `servidor` no.
 *
 * Necesita Docker corriendo (RUNBOOK, sección 1).
 */

import { readdir } from "node:fs/promises";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { sembrar } from "../../prisma/seed.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { referenciaDesde } from "../../src/puertos/almacen-documentos.ts";
import {
  type AlmacenTemporal,
  crearAlmacenTemporal,
} from "./_arnes/almacen-temporal.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let temporal: AlmacenTemporal | undefined;

/** Desde F0-30 la semilla también pide el administrador inicial (inventado) y el reloj. */
function opciones(appEntorno: "local" | "ci" | "servidor" = "local") {
  const fecha = crearFechaHora({
    anio: 2031,
    mes: 1,
    dia: 2,
    hora: 3,
    minuto: 4,
    segundo: 5,
    milisegundo: 6,
  });
  if (!fecha.ok) {
    throw new Error(fecha.mensaje);
  }
  return {
    adminInicialEmail: "admin@ejemplo.test",
    appEntorno,
    reloj: RelojFijo(fecha.fechaHora),
    almacen: almacenDePrueba().almacen,
  };
}

function almacenDePrueba(): AlmacenTemporal {
  expect(temporal, "el almacén temporal no se armó").toBeDefined();
  return temporal as AlmacenTemporal;
}

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

describe("semilla", () => {
  beforeAll(async () => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    // Un almacén limpio por test: cada corrida de la semilla escribe sus PDF.
    await temporal?.borrar();
    temporal = await crearAlmacenTemporal();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await temporal?.borrar();
  });

  test("es idempotente y tarda menos de 2 minutos en una base recién migrada", async () => {
    const db = cliente();
    const inicio = Date.now();

    await sembrar(db, opciones());
    expect(Date.now() - inicio).toBeLessThan(120_000);

    const primeraVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });
    // Valores inventados (F0-28, R6): el tope del mes y el costo estimado
    // por defecto de una llamada a la IA, en dólares con punto decimal.
    expect(primeraVez.map((fila) => [fila.clave, fila.valor])).toEqual([
      ["ia.costo_estimado_usd.defecto", "0.01"],
      ["ia.tope_mensual_usd", "10.00"],
    ]);

    await sembrar(db, opciones());
    const segundaVez = await db.configuracion.findMany({
      orderBy: { clave: "asc" },
    });

    expect(segundaVez).toEqual(primeraVez);
  }, 120_000);

  test("siembra tres grupos de demostración con su auditoría, una sola vez", async () => {
    const db = cliente();
    const foto = async () => ({
      grupos: await db.grupo.findMany({ orderBy: { nombre: "asc" } }),
      auditoria: await db.auditoria.findMany({
        where: { entidad: "Grupo" },
        orderBy: { id: "asc" },
      }),
    });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(primeraVez.grupos.map(({ nombre }) => nombre)).toEqual([
      "Grupo Centro",
      "Grupo Norte",
      "Grupo Sur",
    ]);
    const semilla = { tipo: "sistema", proceso: "db-seed" };
    for (const grupo of primeraVez.grupos) {
      expect(grupo).toMatchObject({ creadoPor: semilla, eliminadoEn: null });
    }
    expect(primeraVez.auditoria).toHaveLength(3);
    for (const registro of primeraVez.auditoria) {
      expect(registro).toMatchObject({ accion: "crear", actor: semilla });
    }
    expect(await foto()).toEqual(primeraVez);
  });

  test("un grupo de demostración dado de baja no vuelve a aparecer al sembrar otra vez", async () => {
    const db = cliente();
    await sembrar(db, opciones());
    await db.grupo.updateMany({
      where: { nombre: "Grupo Norte" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });

    await sembrar(db, opciones());

    expect(await db.grupo.count()).toBe(3);
  });

  test("siembra cinco sitios de demostración, uno solo con coordenadas, y no los repite ni repone uno dado de baja", async () => {
    const db = cliente();

    await sembrar(db, opciones());
    await db.sitio.updateMany({
      where: { nombre: "Depósito Ejemplo" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });
    await sembrar(db, opciones());

    expect(await db.sitio.count()).toBe(5);
    expect(await db.sitio.count({ where: { latitud: { not: null } } })).toBe(1);
    expect(await db.auditoria.count({ where: { entidad: "Sitio" } })).toBe(5);
  });

  test("siembra cuatro camiones de demostración (dos semis, un chasis y un otro), no los repite ni repone uno dado de baja, y no en el servidor", async () => {
    const db = cliente();
    const tipos = async () =>
      (await db.camion.findMany({ select: { tipo: true } }))
        .map(({ tipo }) => tipo)
        .sort();

    await sembrar(db, opciones("servidor"));
    expect(await db.camion.count()).toBe(0);

    await sembrar(db, opciones());
    await db.camion.updateMany({
      where: { patenteTractor: "ZZ001ZZ" },
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });
    await sembrar(db, opciones());

    expect(await tipos()).toEqual([
      "chasis",
      "otro",
      "semi_con_cisterna",
      "semi_con_cisterna",
    ]);
    expect(await db.auditoria.count({ where: { entidad: "Camion" } })).toBe(4);
  });

  test("siembra los cinco tipos de servicio activos, uno solo recurrente, una sola vez y no en el servidor", async () => {
    const db = cliente();
    const tipos = () =>
      db.tipoServicio.findMany({
        orderBy: { nombre: "asc" },
        select: { nombre: true, modalidad: true, activo: true },
      });

    await sembrar(db, opciones("servidor"));
    expect(await tipos()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    expect(await tipos()).toEqual([
      { nombre: "Auditoría de tanques", modalidad: "puntual", activo: true },
      {
        nombre: "Certificación de camiones",
        modalidad: "puntual",
        activo: true,
      },
      { nombre: "Informes", modalidad: "puntual", activo: true },
      { nombre: "Logística", modalidad: "puntual", activo: true },
      {
        nombre: "Servicio de operación / alquiler de tanques",
        modalidad: "recurrente",
        activo: true,
      },
    ]);
  });

  test("siembra seis egresos, en pesos y en dólares y de dos meses, una sola vez y no en el servidor", async () => {
    const db = cliente();
    const egresos = () =>
      db.egreso.findMany({
        orderBy: [{ fecha: "asc" }, { concepto: "asc" }],
        select: { fecha: true, importeMoneda: true, proveedorId: true },
      });

    await sembrar(db, opciones("servidor"));
    expect(await egresos()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    const sembrados = await egresos();
    expect(sembrados).toHaveLength(6);
    expect(
      new Set(sembrados.map(({ importeMoneda }) => importeMoneda)),
    ).toEqual(new Set(["ARS", "USD"]));
    expect(
      new Set(sembrados.map(({ fecha }) => fecha.toISOString().slice(0, 7))),
    ).toEqual(new Set(["2026-09", "2026-10"]));
    expect(sembrados.some(({ proveedorId }) => proveedorId !== null)).toBe(
      true,
    );
    expect(await db.auditoria.count({ where: { entidad: "Egreso" } })).toBe(6);
  });

  test("el egreso de un centro de proyecto dice de qué servicio es y lleva su comprobante; los demás, ninguno", async () => {
    const db = cliente();

    await sembrar(db, opciones());

    const egresos = await db.egreso.findMany({
      include: { centroCosto: true, servicio: true, comprobante: true },
    });
    const deProyecto = egresos.filter(
      ({ centroCosto }) => centroCosto.clase === "proyecto",
    );
    expect(deProyecto).toHaveLength(1);
    expect(deProyecto[0]?.servicio?.titulo).toBe(
      "Operación de tanques — ejemplo",
    );
    expect(deProyecto[0]?.comprobante?.tipoMime).toBe("application/pdf");
    expect(
      egresos
        .filter(({ centroCosto }) => centroCosto.clase !== "proyecto")
        .every(({ servicioId }) => servicioId === null),
    ).toBe(true);
  });

  test("siembra tres pagos —uno salda, uno parcial, uno en dólares desde una cuenta en pesos—, una sola vez y no en el servidor", async () => {
    const db = cliente();
    const pagos = () =>
      db.pago.findMany({
        orderBy: { fecha: "asc" },
        select: {
          importeCentavos: true,
          importeMoneda: true,
          salidaCentavos: true,
          salidaMoneda: true,
          cambioNumerador: true,
          egreso: { select: { importeCentavos: true } },
        },
      });

    await sembrar(db, opciones("servidor"));
    expect(await pagos()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    const sembrados = await pagos();
    expect(sembrados).toHaveLength(3);
    expect(
      sembrados.filter((p) => p.importeCentavos === p.egreso.importeCentavos),
    ).toHaveLength(1);
    expect(
      sembrados.filter((p) => p.importeCentavos < p.egreso.importeCentavos),
    ).toHaveLength(2);
    const enDolares = sembrados.filter((p) => p.importeMoneda === "USD");
    expect(enDolares).toEqual([
      expect.objectContaining({
        salidaMoneda: "ARS",
        salidaCentavos: 36_000_000n,
        cambioNumerador: 1200n,
      }),
    ]);
    expect(await db.auditoria.count({ where: { entidad: "Pago" } })).toBe(3);
  });

  test("siembra cinco servicios en distintos estados, con su historial, uno con dos sitios y la modalidad de facturación de los que facturan (F3-03), una sola vez y no en el servidor", async () => {
    const db = cliente();
    const servicios = () =>
      db.servicio.findMany({
        orderBy: { codigo: "asc" },
        include: {
          eventos: { orderBy: { posicion: "asc" } },
          sitios: true,
          responsable: true,
        },
      });

    await sembrar(db, opciones("servidor"));
    expect(await servicios()).toEqual([]);

    await sembrar(db, opciones());
    await sembrar(db, opciones());

    const sembrados = await servicios();
    expect(
      sembrados.map(
        ({
          codigo,
          modalidad,
          eventos,
          sitios,
          vigenciaDesde,
          facturacion,
        }) => [
          codigo,
          modalidad,
          eventos.map(({ a }) => a),
          sitios.length,
          vigenciaDesde !== null,
          facturacion,
        ],
      ),
    ).toEqual([
      ["SRV-2031-001", "puntual", ["creado"], 2, false, null],
      ["SRV-2031-002", "puntual", ["creado", "cotizado"], 0, false, null],
      [
        "SRV-2031-003",
        "recurrente",
        ["creado", "cotizado", "adjudicado", "en_ejecucion"],
        0,
        true,
        "por_hitos",
      ],
      [
        "SRV-2031-004",
        "puntual",
        [
          "creado",
          "cotizado",
          "adjudicado",
          "en_ejecucion",
          "finalizado",
          "cerrado",
        ],
        0,
        false,
        null,
      ],
      [
        "SRV-2031-005",
        "recurrente",
        ["creado", "cotizado", "adjudicado", "en_ejecucion"],
        0,
        true,
        "mensual",
      ],
    ]);
    for (const { eventos, responsable } of sembrados) {
      expect(eventos.map(({ de }) => de)).toEqual([
        null,
        ...eventos.slice(0, -1).map(({ a }) => a),
      ]);
      expect(responsable.email).toBe("admin@ejemplo.test");
    }
    // Cinco altas y el cambio de sitios de uno.
    expect(await db.auditoria.count({ where: { entidad: "Servicio" } })).toBe(
      6,
    );
    expect(await db.secuencia.findMany()).toEqual([
      { prefijo: "SRV", anio: 2031, ultimo: 5 },
    ]);
  });

  test("siembra el servicio mensual con su orden de compra, la cuota inicial y un ajuste (F3-03), sin repetir filas, y no en el servidor", async () => {
    const db = cliente();
    const delMensual = {
      servicio: { titulo: "Alquiler mensual de tanques — ejemplo" },
    };
    const foto = async () => ({
      ordenes: await db.ordenCompra.findMany({ where: delMensual }),
      cuotas: await db.servicioCuota.findMany({
        where: delMensual,
        orderBy: { posicion: "asc" },
      }),
    });

    await sembrar(db, opciones("servidor"));
    expect(await foto()).toEqual({ ordenes: [], cuotas: [] });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(await foto()).toEqual(primeraVez);
    expect(
      primeraVez.ordenes.map(({ importeCentavos, importeMoneda }) => [
        importeCentavos,
        importeMoneda,
      ]),
    ).toEqual([[120_000_000n, "ARS"]]);
    expect(
      primeraVez.cuotas.map(
        ({ posicion, desdeMes, importeCentavos, importeMoneda }) => [
          posicion,
          desdeMes.toISOString().slice(0, 10),
          importeCentavos,
          importeMoneda,
        ],
      ),
    ).toEqual([
      [0, "2026-08-01", 9_000_000n, "ARS"],
      [1, "2026-10-01", 9_500_000n, "ARS"],
    ]);
    expect(
      await db.auditoria.count({ where: { entidad: "ServicioCuota" } }),
    ).toBe(2);
  });

  test("siembra dos cotizaciones del servicio cotizado, con su PDF en el almacén, sin repetir filas ni archivos, y no en el servidor", async () => {
    const db = cliente();
    const { almacen, carpeta } = almacenDePrueba();
    const archivos = async () =>
      (await readdir(carpeta, { recursive: true, withFileTypes: true })).filter(
        (entrada) => entrada.isFile(),
      ).length;
    const foto = async () => ({
      cotizaciones: await db.cotizacion.findMany({
        orderBy: { version: "asc" },
      }),
      documentos: await db.documento.findMany({
        where: { nombre: { startsWith: "cotizacion" } },
        orderBy: { nombre: "asc" },
      }),
      archivos: await archivos(),
    });

    await sembrar(db, opciones("servidor"));
    expect(await foto()).toEqual({
      cotizaciones: [],
      documentos: [],
      archivos: 0,
    });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(await foto()).toEqual(primeraVez);
    // Dos cotizaciones, el PDF de una factura (F2-06) y el comprobante del egreso de proyecto (F2-08).
    expect(primeraVez.archivos).toBe(4);
    expect(
      primeraVez.cotizaciones.map(({ version, motivo, importeCentavos }) => [
        version,
        motivo === null,
        importeCentavos,
      ]),
    ).toEqual([
      [1, true, 125_000_000n],
      [2, false, 118_000_000n],
    ]);
    const servicio = await db.servicio.findFirstOrThrow({
      where: { titulo: "Certificación de camiones — ejemplo" },
    });
    expect(
      primeraVez.cotizaciones.every(
        ({ servicioId }) => servicioId === servicio.id,
      ),
    ).toBe(true);
    for (const documento of primeraVez.documentos) {
      const bytes = await almacen.leer(referenciaDesde(documento.referencia));
      expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("%PDF-1.4");
      expect(bytes.length).toBe(documento.tamano);
      expect(documento).toMatchObject({
        tipoMime: "application/pdf",
        creadoPor: { tipo: "sistema", proceso: "db-seed" },
      });
    }
    // Las dos cotizaciones y sus dos PDF, el PDF de la factura (F2-06) y el comprobante del egreso (F2-08).
    expect(
      await db.auditoria.count({
        where: { entidad: { in: ["Cotizacion", "Documento"] } },
      }),
    ).toBe(6);
  });

  test("siembra una orden de compra y tres facturas del servicio en ejecución (la tercera, en dólares, es de F2-07), con el PDF de una, sin repetir filas, y no en el servidor", async () => {
    const db = cliente();
    const foto = async () => ({
      ordenes: await db.ordenCompra.findMany({
        where: { servicio: { titulo: "Operación de tanques — ejemplo" } },
      }),
      facturas: await db.factura.findMany({ orderBy: { numero: "asc" } }),
    });

    await sembrar(db, opciones("servidor"));
    expect(await foto()).toEqual({ ordenes: [], facturas: [] });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(await foto()).toEqual(primeraVez);
    const [orden] = primeraVez.ordenes;
    expect(primeraVez.ordenes).toHaveLength(1);
    expect(orden).toMatchObject({
      importeCentavos: 100_000_000n,
      importeMoneda: "ARS",
      documentoId: null,
    });
    const servicio = await db.servicio.findFirstOrThrow({
      where: { titulo: "Operación de tanques — ejemplo" },
    });
    expect(orden?.servicioId).toBe(servicio.id);
    expect(
      primeraVez.facturas.map(
        ({
          numero,
          importeCentavos,
          alicuotaIva,
          ordenCompraId,
          documentoId,
        }) => [
          numero,
          importeCentavos,
          alicuotaIva,
          ordenCompraId === orden?.id,
          documentoId !== null,
        ],
      ),
    ).toEqual([
      ["0000-00000001", 40_000_000n, 210, true, true],
      ["0000-00000002", 25_000_000n, 105, true, false],
      ["0000-00000003", 1_000_000n, 210, false, false],
    ]);
    expect(primeraVez.facturas[2]?.importeMoneda).toBe("USD");
    expect(
      await db.auditoria.count({
        where: { entidad: { in: ["OrdenCompra", "Factura"] } },
      }),
    ).toBe(5);
  });

  test("siembra dos cobros, uno con retención en pesos y uno en pesos de una factura en dólares con su tipo de cambio, sin repetir filas, y no en el servidor", async () => {
    const db = cliente();
    const foto = () => db.cobro.findMany({ orderBy: { fecha: "asc" } });

    await sembrar(db, opciones("servidor"));
    expect(await foto()).toEqual([]);

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(await foto()).toEqual(primeraVez);
    const [enPesos, enDolares] = primeraVez;
    expect(primeraVez).toHaveLength(2);
    expect(enPesos).toMatchObject({
      importeCentavos: 20_000_000n,
      importeMoneda: "ARS",
      retencionCentavos: 800_000n,
      entradaCentavos: 20_000_000n,
      entradaMoneda: "ARS",
      cambioNumerador: null,
      creadoPor: { tipo: "sistema", proceso: "db-seed" },
    });
    expect(enDolares).toMatchObject({
      importeCentavos: 500_000n,
      importeMoneda: "USD",
      retencionCentavos: null,
      entradaCentavos: 600_000_000n,
      entradaMoneda: "ARS",
      cambioNumerador: 1200n,
      cambioDenominador: 1n,
      cambioFuente: "Cotización de ejemplo",
    });
    const factura = await db.factura.findUniqueOrThrow({
      where: { id: enDolares?.facturaId ?? "" },
    });
    expect(factura).toMatchObject({
      numero: "0000-00000003",
      importeMoneda: "USD",
    });
    expect(await db.auditoria.count({ where: { entidad: "Cobro" } })).toBe(2);
  });

  test("siembra dos hitos, uno realizado, y un camión del servicio en ejecución, sin repetir filas, y no en el servidor", async () => {
    const db = cliente();
    const foto = async () => ({
      hitos: await db.servicioHito.findMany({ orderBy: { orden: "asc" } }),
      recursos: await db.servicioRecurso.findMany(),
    });

    await sembrar(db, opciones("servidor"));
    expect(await foto()).toEqual({ hitos: [], recursos: [] });

    await sembrar(db, opciones());
    const primeraVez = await foto();
    await sembrar(db, opciones());

    expect(await foto()).toEqual(primeraVez);
    expect(
      primeraVez.hitos.map((hito) => [hito.orden, hito.realizadoEn !== null]),
    ).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(primeraVez.recursos).toHaveLength(1);
    expect(primeraVez.recursos[0]).toMatchObject({
      tipo: "camion",
      descripcion: null,
    });
    expect(primeraVez.recursos[0]?.camionId).not.toBeNull();
  });

  describe("tolera que alguien haya editado un dato de demostración (M-14)", () => {
    /** Cuántas filas hay de cada cosa que siembra la semilla, para ver que no se duplicó nada. */
    async function contarTodo() {
      const db = cliente();
      return {
        grupos: await db.grupo.count(),
        clientes: await db.cliente.count(),
        sitios: await db.sitio.count(),
        camiones: await db.camion.count(),
        tiposServicio: await db.tipoServicio.count(),
        centrosCosto: await db.centroCosto.count(),
        cuentas: await db.cuenta.count(),
        servicios: await db.servicio.count(),
        egresos: await db.egreso.count(),
        pagos: await db.pago.count(),
        cotizaciones: await db.cotizacion.count(),
        ordenesCompra: await db.ordenCompra.count(),
        facturas: await db.factura.count(),
        cobros: await db.cobro.count(),
        cuotas: await db.servicioCuota.count(),
        hitos: await db.servicioHito.count(),
        recursos: await db.servicioRecurso.count(),
      };
    }

    test("un camión al que le cambiaron la patente del tractor no se vuelve a crear con su cisterna", async () => {
      const db = cliente();
      await sembrar(db, opciones());
      const antes = await contarTodo();
      await db.camion.updateMany({
        where: { patenteTractor: "ZZ001ZZ" },
        data: { patenteTractor: "ZZ900ZZ" },
      });

      await expect(sembrar(db, opciones())).resolves.toBeUndefined();

      expect(await contarTodo()).toEqual(antes);
      expect(
        await db.camion.count({ where: { patenteCisterna: "ZZ101ZZ" } }),
      ).toBe(1);
    });

    test("un camión cuya patente de cisterna cambió, o que se dio de baja, tampoco se vuelve a crear", async () => {
      const db = cliente();
      await sembrar(db, opciones());
      const antes = await contarTodo();
      await db.camion.updateMany({
        where: { patenteTractor: "ZZ001ZZ" },
        data: { patenteCisterna: "ZZ901ZZ" },
      });
      await db.camion.updateMany({
        where: { patenteTractor: "ZZ002ZZ" },
        data: {
          patenteTractor: "ZZ902ZZ",
          eliminadoEn: new Date(),
          eliminadoPor: { tipo: "sistema" },
        },
      });

      await expect(sembrar(db, opciones())).resolves.toBeUndefined();

      expect(await contarTodo()).toEqual(antes);
    });

    test("un cliente al que le cambiaron el CUIT, pero no la razón social, no se vuelve a crear", async () => {
      const db = cliente();
      await sembrar(db, opciones());
      const antes = await contarTodo();
      await db.cliente.updateMany({
        where: { cuit: "30000000015" },
        data: { cuit: "30000000060" },
      });

      await expect(sembrar(db, opciones())).resolves.toBeUndefined();

      expect(await contarTodo()).toEqual(antes);
    });

    // La base compara sin distinguir mayúsculas (`lower(...)`): un nombre
    // escrito distinto choca igual con el de la semilla.
    test.each([
      { tabla: "grupos", columna: "nombre" },
      { tabla: "tipos_servicio", columna: "nombre" },
      { tabla: "centros_costo", columna: "nombre" },
      { tabla: "cuentas", columna: "nombre" },
      { tabla: "sitios", columna: "nombre" },
      { tabla: "camiones", columna: "patente_tractor" },
    ])(
      "si pasaron a minúsculas $columna de $tabla, la semilla no los vuelve a crear",
      async ({ tabla, columna }) => {
        const db = cliente();
        await sembrar(db, opciones());
        const antes = await contarTodo();
        await db.$executeRawUnsafe(
          `UPDATE "${tabla}" SET "${columna}" = lower("${columna}")`,
        );

        await expect(sembrar(db, opciones())).resolves.toBeUndefined();

        expect(await contarTodo()).toEqual(antes);
      },
    );

    test("si el servicio de las facturas cambió de título, la semilla no repite los números de factura", async () => {
      const db = cliente();
      await sembrar(db, opciones());
      const antes = await contarTodo();
      await db.servicio.updateMany({
        where: { titulo: "Operación de tanques — ejemplo" },
        data: { titulo: "Operación editada" },
      });

      await expect(sembrar(db, opciones())).resolves.toBeUndefined();

      const despues = await contarTodo();
      expect(despues.facturas).toBe(antes.facturas);
      expect(despues.ordenesCompra).toBe(antes.ordenesCompra);
      expect(despues.cobros).toBe(antes.cobros);
    });

    test("si el número de la factura en dólares ya lo usa otra, la semilla no la repite", async () => {
      const db = cliente();
      await sembrar(db, opciones());
      const otroServicio = await db.servicio.findFirstOrThrow({
        where: { titulo: "Informe técnico — ejemplo" },
      });
      await db.cobro.deleteMany();
      await db.factura.updateMany({
        where: { numero: "0000-00000003" },
        data: { servicioId: otroServicio.id },
      });
      const antes = await contarTodo();

      await expect(sembrar(db, opciones())).resolves.toBeUndefined();

      expect(await contarTodo()).toEqual(antes);
    });
  });

  test("en el servidor no siembra ningún grupo; en ci, sí", async () => {
    const db = cliente();

    await sembrar(db, opciones("servidor"));

    expect(await db.grupo.count()).toBe(0);
    expect(await db.sitio.count()).toBe(0);
    expect(await db.configuracion.count()).toBeGreaterThan(0);

    await sembrar(db, opciones("ci"));

    expect(await db.grupo.count()).toBe(3);
  });
});
