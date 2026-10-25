/**
 * F4-02 · Los vencimientos de un trabajo terminado, contra el Postgres de verdad
 * del arnés. Al pasar el servicio a «Finalizado» se generan con la regla de su
 * tipo (uno por camión, por sitio o por servicio; ninguno si el tipo no tiene
 * plazo), en la misma transacción del cambio. Después se corrige la fecha, se
 * carga uno a mano o se descarta uno con motivo, solo en «Finalizado». Datos
 * inventados. Necesita Docker corriendo.
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
import { CAMIONES } from "../../src/casos-uso/abm/camiones.ts";
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { SITIOS } from "../../src/casos-uso/abm/sitios.ts";
import { crearCasosUsoPlanificacion } from "../../src/casos-uso/servicios/planificacion.ts";
import { crearCasosUsoServicios } from "../../src/casos-uso/servicios/servicios.ts";
import { crearCasosUsoVencimientos } from "../../src/casos-uso/servicios/vencimientos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { identificadorDesde } from "../../src/dominio/compartido/identificador.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  ESTADOS_SERVICIO,
  type EstadoServicio,
} from "../../src/dominio/servicios/estados.ts";
import type { Transaccional } from "../../src/puertos/repositorios/transaccion.ts";
import {
  ADMIN_UNO,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import { llevarServicioA, sembrarServicio } from "./_arnes/servicio.ts";

// El 9 de julio de 2031 a media mañana: la hora no cuenta, el día sí.
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
let servicioId: string;
let clienteId: string;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function dependencias(transaccional?: Transaccional) {
  return {
    transaccional: transaccional ?? crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY),
    generadorId: crearGeneradorIdCrypto(),
  };
}

const vencimientos = () => crearCasosUsoVencimientos(dependencias());
const servicios = (transaccional?: Transaccional) =>
  crearCasosUsoServicios(dependencias(transaccional));

function llevarA(...recorrido: readonly EstadoServicio[]): Promise<void> {
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

function exigirOk<R extends { readonly ok: boolean }>(resultado: R): void {
  expect(resultado, "no pasó").toMatchObject({ ok: true });
}

/** Los vencimientos de la base como se comparan: el día, no la hora de la columna. */
async function guardados() {
  const filas = await cliente().servicioVencimiento.findMany({
    orderBy: [{ fecha: "asc" }, { descripcion: "asc" }],
  });
  return filas.map((fila) => ({
    ...fila,
    fecha: fila.fecha.toISOString().slice(0, 10),
  }));
}

/** El tipo del servicio con la regla del ejemplo: 60 meses, 36 si el camión pasa de los 10 años. */
async function conRegla(): Promise<void> {
  await cliente().tipoServicio.updateMany({
    data: {
      vencimientoMeses: 60,
      vencimientoMesesAntiguos: 36,
      antiguedadCorteAnios: 10,
    },
  });
}

async function altaDeCamion(patente: string, anio: string): Promise<string> {
  const resultado = await crearCasosUsoAbm(dependencias()).crear(
    admin,
    CAMIONES,
    {
      clienteId,
      tipo: "chasis",
      patenteTractor: patente,
      marcaTractor: "Marca Ejemplo",
      anioTractor: anio,
      patenteCisterna: "",
      marcaCisterna: "",
      anioCisterna: "",
      capacidadLitros: "30000",
    },
  );
  if (!resultado.ok) {
    throw new Error("no se pudo dar de alta el camión");
  }
  return resultado.registro.valor.id;
}

async function altaDeSitio(nombre: string): Promise<string> {
  const resultado = await crearCasosUsoAbm(dependencias()).crear(
    admin,
    SITIOS,
    {
      clienteId,
      nombre,
      provincia: "cordoba",
      localidad: "Ciudad Ejemplo",
      direccion: "",
      latitud: "",
      longitud: "",
      cantidadTanques: "2",
      capacidadTotalLitros: "1000",
      observaciones: "",
    },
  );
  if (!resultado.ok) {
    throw new Error("no se pudo dar de alta el sitio");
  }
  return resultado.registro.valor.id;
}

async function asignarCamion(camionId: string): Promise<void> {
  exigirOk(
    await crearCasosUsoPlanificacion(dependencias()).crearRecurso(
      admin,
      servicioId,
      {
        tipo: "camion",
        camionId,
        descripcion: "",
        desde: "",
        hasta: "",
      },
    ),
  );
}

/** De «En ejecución» a «Finalizado» por el caso de uso, como lo hace la pantalla. */
async function finalizar(): Promise<void> {
  await llevarA("en_ejecucion");
  await servicios().cambiarEstado(admin, servicioId, "finalizado", "");
}

async function unVencimiento(): Promise<string> {
  const [primero] = await guardados();
  expect(primero, "no hay vencimientos").toBeDefined();
  return primero?.id ?? "";
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await limpiarBase();
  const usuarios = await sembrarUsuarios(cliente(), [ADMIN_UNO, OPERADOR]);
  const primero = usuarios[0];
  if (primero === undefined) {
    throw new Error("no se sembraron los usuarios");
  }
  admin = { tipo: "persona", usuarioId: primero.id };
  servicioId = await sembrarServicio(
    cliente(),
    dependencias(),
    admin,
    primero.id,
  );
  clienteId = (await cliente().cliente.findFirstOrThrow()).id;
  await llevarA("cotizado", "adjudicado");
});

describe("al pasar a «Finalizado»", () => {
  test("con camiones, uno por camión, con la antigüedad de cada uno y los sitios sin contar", async () => {
    await conRegla();
    const antiguo = await altaDeCamion("ZZ001ZZ", "2018");
    const nuevo = await altaDeCamion("ZZ002ZZ", "2028");
    await asignarCamion(antiguo);
    await asignarCamion(nuevo);
    await servicios().guardarSitios(admin, servicioId, [
      await altaDeSitio("Planta Ejemplo Norte"),
    ]);

    await finalizar();

    expect(await estado()).toBe("finalizado");
    expect(
      (await guardados()).map(
        ({ fecha, descripcion, camionId, sitioId, origen, estado: e }) => ({
          fecha,
          descripcion,
          camionId,
          sitioId,
          origen,
          estado: e,
        }),
      ),
    ).toEqual([
      {
        fecha: "2034-07-09",
        descripcion: "Camión ZZ001ZZ",
        camionId: antiguo,
        sitioId: null,
        origen: "calculado",
        estado: "pendiente",
      },
      {
        fecha: "2036-07-09",
        descripcion: "Camión ZZ002ZZ",
        camionId: nuevo,
        sitioId: null,
        origen: "calculado",
        estado: "pendiente",
      },
    ]);
  });

  test("sin camiones y con sitios, uno por sitio", async () => {
    await conRegla();
    const norte = await altaDeSitio("Planta Ejemplo Norte");
    const sur = await altaDeSitio("Planta Ejemplo Sur");
    await servicios().guardarSitios(admin, servicioId, [norte, sur]);

    await finalizar();

    expect(
      (await guardados()).map(({ fecha, descripcion, sitioId, camionId }) => ({
        fecha,
        descripcion,
        sitioId,
        camionId,
      })),
    ).toEqual([
      {
        fecha: "2036-07-09",
        descripcion: "Sitio Planta Ejemplo Norte",
        sitioId: norte,
        camionId: null,
      },
      {
        fecha: "2036-07-09",
        descripcion: "Sitio Planta Ejemplo Sur",
        sitioId: sur,
        camionId: null,
      },
    ]);
  });

  test("sin camiones ni sitios, uno por servicio", async () => {
    await conRegla();

    await finalizar();

    expect(
      (await guardados()).map(({ fecha, descripcion, sitioId, camionId }) => ({
        fecha,
        descripcion,
        sitioId,
        camionId,
      })),
    ).toEqual([
      {
        fecha: "2036-07-09",
        descripcion: "Servicio Auditoría de ejemplo",
        sitioId: null,
        camionId: null,
      },
    ]);
  });

  test("si el tipo no tiene plazo, no se genera ninguno", async () => {
    await asignarCamion(await altaDeCamion("ZZ001ZZ", "2018"));

    await finalizar();

    expect(await estado()).toBe("finalizado");
    expect(await guardados()).toEqual([]);
  });

  test("lo escribe todo con su auditoría: quién y cuándo", async () => {
    await conRegla();

    await finalizar();

    const fila = await cliente().servicioVencimiento.findFirstOrThrow();
    expect(fila.creadoPor).toEqual({
      tipo: "persona",
      usuarioId: (admin as { usuarioId: string }).usuarioId,
    });
    const auditoria = await cliente().auditoria.findMany({
      where: { entidad: "ServicioVencimiento" },
    });
    expect(auditoria.map(({ accion }) => accion)).toEqual(["crear"]);
  });

  test("va en la misma transacción que el cambio: si no se pueden guardar, el servicio no pasa a «Finalizado»", async () => {
    await conRegla();
    const real = crearTransaccionalPrisma(cliente());
    const queFalla: Transaccional = {
      ejecutar: (trabajo) =>
        real.ejecutar((repos) =>
          trabajo({
            ...repos,
            vencimientos: {
              ...repos.vencimientos,
              crear: () => Promise.reject(new Error("falla simulada")),
            },
          }),
        ),
    };
    await llevarA("en_ejecucion");

    await expect(
      servicios(queFalla).cambiarEstado(admin, servicioId, "finalizado", ""),
    ).rejects.toThrow("falla simulada");

    expect(await estado()).toBe("en_ejecucion");
    expect(await guardados()).toEqual([]);
  });

  test("un cambio que el ciclo rechaza no genera nada", async () => {
    await conRegla();

    await expect(
      servicios().cambiarEstado(admin, servicioId, "finalizado", ""),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0011.codigo });

    expect(await guardados()).toEqual([]);
  });
});

describe("a mano", () => {
  async function conUnVencimiento(): Promise<string> {
    await conRegla();
    await finalizar();
    return unVencimiento();
  }

  const escritoDeFecha = (fecha: string): Escrito => ({ fecha });

  test("la fecha se corrige: pasa a origen manual y la auditoría guarda el valor anterior", async () => {
    const id = await conUnVencimiento();

    exigirOk(
      await vencimientos().cambiarFecha(
        admin,
        id,
        escritoDeFecha("2036-08-01"),
      ),
    );

    const [fila] = await guardados();
    expect(fila).toMatchObject({
      fecha: "2036-08-01",
      origen: "manual",
      estado: "pendiente",
    });
    const cambios = await cliente().auditoria.findMany({
      where: { entidad: "ServicioVencimiento", accion: "actualizar" },
    });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.antes).toMatchObject({
      fecha: "2036-07-09",
      origen: "calculado",
    });
    expect(cambios[0]?.despues).toMatchObject({
      fecha: "2036-08-01",
      origen: "manual",
    });
  });

  test("una fecha que no existe, o vacía, vuelve por campo y no cambia nada", async () => {
    const id = await conUnVencimiento();
    const antes = await guardados();

    for (const mala of ["", "2036-02-30"]) {
      expect(
        await vencimientos().cambiarFecha(admin, id, escritoDeFecha(mala)),
      ).toMatchObject({ ok: false, errores: { fecha: expect.any(String) } });
    }

    expect(await guardados()).toEqual(antes);
  });

  test("se agrega uno a mano, de origen manual y pendiente", async () => {
    await conRegla();
    await finalizar();

    exigirOk(
      await vencimientos().crear(admin, servicioId, {
        fecha: "2032-01-15",
        descripcion: "Revisión del precinto",
      }),
    );

    const manual = (await guardados()).find(
      ({ origen }) => origen === "manual",
    );
    expect(manual).toMatchObject({
      fecha: "2032-01-15",
      descripcion: "Revisión del precinto",
      estado: "pendiente",
      servicioId,
      sitioId: null,
      camionId: null,
    });
    expect(
      await vencimientos().crear(admin, servicioId, {
        fecha: "2032-01-15",
        descripcion: "",
      }),
    ).toMatchObject({
      ok: false,
      errores: { descripcion: expect.any(String) },
    });
  });

  test("se descarta con motivo; sin motivo vuelve por campo y sigue pendiente", async () => {
    const id = await conUnVencimiento();

    expect(
      await vencimientos().marcarDescartado(admin, id, { motivo: "  " }),
    ).toMatchObject({ ok: false, errores: { motivo: expect.any(String) } });
    expect((await guardados())[0]?.estado).toBe("pendiente");

    exigirOk(
      await vencimientos().marcarDescartado(admin, id, {
        motivo: "El cliente vendió el camión",
      }),
    );

    expect((await guardados())[0]).toMatchObject({
      estado: "descartado",
      motivoDescarte: "El cliente vendió el camión",
    });
    const cambios = await cliente().auditoria.findMany({
      where: { entidad: "ServicioVencimiento", accion: "actualizar" },
    });
    expect(cambios[0]?.antes).toMatchObject({ estado: "pendiente" });
    expect(cambios[0]?.despues).toMatchObject({ estado: "descartado" });
  });

  test("uno descartado no se corrige ni se descarta de nuevo: DOM-0029", async () => {
    const id = await conUnVencimiento();
    await vencimientos().marcarDescartado(admin, id, {
      motivo: "Ya no aplica",
    });
    const antes = await guardados();

    await expect(
      vencimientos().cambiarFecha(admin, id, escritoDeFecha("2040-01-01")),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0029.codigo });
    await expect(
      vencimientos().marcarDescartado(admin, id, { motivo: "Otra vez" }),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0029.codigo });

    expect(await guardados()).toEqual(antes);
  });

  test("fuera de «Finalizado» no se agrega, ni se corrige, ni se descarta: DOM-0018 y no escribe nada", async () => {
    const id = await conUnVencimiento();

    for (const afuera of ESTADOS_SERVICIO.filter((e) => e !== "finalizado")) {
      await llevarA(afuera);
      const antes = await guardados();
      const rechazadas = [
        () =>
          vencimientos().crear(admin, servicioId, {
            fecha: "2032-01-15",
            descripcion: "Revisión",
          }),
        () =>
          vencimientos().cambiarFecha(admin, id, escritoDeFecha("2040-01-01")),
        () => vencimientos().marcarDescartado(admin, id, { motivo: "Ya no" }),
      ];
      for (const intento of rechazadas) {
        await expect(intento(), afuera).rejects.toMatchObject({
          codigo: catalogo.DOM_0018.codigo,
        });
      }
      expect(await guardados(), afuera).toEqual(antes);
    }
  });
});

describe("la base", () => {
  test("no deja un sitio y un camión a la vez, ni un origen ni un estado que el dominio no conoce", async () => {
    await conRegla();
    await finalizar();
    const {
      servicioId: duenio,
      fecha,
      creadoEn,
      actualizadoEn,
    } = await cliente().servicioVencimiento.findFirstOrThrow();
    const base = {
      servicioId: duenio,
      fecha,
      descripcion: "Con una restricción rota",
      origen: "manual",
      estado: "pendiente",
      creadoEn,
      creadoPor: { tipo: "sistema" },
      actualizadoEn,
      actualizadoPor: { tipo: "sistema" },
    };
    const sitioId = await altaDeSitio("Planta Ejemplo Norte");
    const camionId = await altaDeCamion("ZZ001ZZ", "2018");

    for (const [restriccion, cambio] of [
      ["a_lo_sumo_uno", { sitioId, camionId }],
      ["origen", { origen: "otro" }],
      ["estado", { estado: "vencido" }],
    ] as const) {
      await expect(
        cliente().servicioVencimiento.create({ data: { ...base, ...cambio } }),
        restriccion,
      ).rejects.toThrow(restriccion);
    }
    expect(await guardados()).toHaveLength(1);
  });
});

describe("lo que se ve", () => {
  test("la lista trae fecha, descripción, origen y estado; se edita en «Finalizado» y en «Cerrado» solo se ve", async () => {
    await conRegla();
    await finalizar();
    const id = await unVencimiento();
    await vencimientos().cambiarFecha(admin, id, { fecha: "2036-08-01" });

    const finalizado = await vencimientos().ver(servicioId);

    expect(finalizado.editable).toBe(true);
    expect(finalizado.vencimientos).toEqual([
      {
        id,
        fecha: "01/08/2036",
        dia: "2036-08-01",
        descripcion: "Servicio Auditoría de ejemplo",
        origen: "Manual",
        estado: "Pendiente",
        motivoDeDescarte: null,
        pendiente: true,
        renovacion: null,
      },
    ]);

    await llevarA("cerrado");

    const cerrado = await vencimientos().ver(servicioId);

    expect(cerrado.editable).toBe(false);
    expect(cerrado.vencimientos).toHaveLength(1);
  });

  test("uno dado de baja no aparece", async () => {
    await conRegla();
    await finalizar();
    await cliente().servicioVencimiento.updateMany({
      data: { eliminadoEn: new Date(), eliminadoPor: { tipo: "sistema" } },
    });

    expect((await vencimientos().ver(servicioId)).vencimientos).toEqual([]);
  });
});

describe("cotizar la renovación", () => {
  async function conUnVencimientoDeCamion(): Promise<{
    readonly id: string;
    readonly camionId: string;
    readonly sitioId: string;
  }> {
    await conRegla();
    const camionId = await altaDeCamion("ZZ001ZZ", "2028");
    await asignarCamion(camionId);
    const sitioId = await altaDeSitio("Planta Ejemplo Norte");
    await servicios().guardarSitios(admin, servicioId, [sitioId]);
    await finalizar();
    return { id: await unVencimiento(), camionId, sitioId };
  }

  /** Quien pide la renovación: la operadora sembrada, que no es la responsable del original. */
  async function operadora() {
    const { id } = await cliente().usuario.findFirstOrThrow({
      where: { email: OPERADOR.email },
    });
    const actor: Actor = {
      tipo: "persona",
      usuarioId: identificadorDesde<"Usuario">(id),
    };
    return { id, actor };
  }

  async function cantidadDeServicios(): Promise<number> {
    return cliente().servicio.count();
  }

  test("crea el servicio nuevo en «Creado» con el cliente, el tipo, los sitios y los camiones del original, y enlaza los dos", async () => {
    const { id, camionId, sitioId } = await conUnVencimientoDeCamion();
    const original = await cliente().servicio.findUniqueOrThrow({
      where: { id: servicioId },
    });
    const quien = await operadora();

    const { servicioId: nuevoId } = await vencimientos().renovar(
      quien.actor,
      id,
    );

    const nuevo = await cliente().servicio.findUniqueOrThrow({
      where: { id: nuevoId },
    });
    expect(nuevo).toMatchObject({
      clienteId: original.clienteId,
      tipoServicioId: original.tipoServicioId,
      titulo: `Renovación de ${original.codigo}`,
      modalidad: "puntual",
      vigenciaDesde: null,
      vigenciaHasta: null,
      responsableId: quien.id,
    });
    expect(nuevo.codigo).not.toBe(original.codigo);
    expect(
      (
        await cliente().servicioEvento.findMany({
          where: { servicioId: nuevoId },
        })
      ).map(({ a }) => a),
    ).toEqual(["creado"]);
    expect(
      (
        await cliente().servicioSitio.findMany({
          where: { servicioId: nuevoId },
        })
      ).map(({ sitioId: copiado }) => copiado),
    ).toEqual([sitioId]);
    expect(
      (
        await cliente().servicioRecurso.findMany({
          where: { servicioId: nuevoId },
        })
      ).map(({ tipo, camionId: copiado }) => ({ tipo, camionId: copiado })),
    ).toEqual([{ tipo: "camion", camionId }]);
    expect(
      await cliente().servicioVencimiento.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ estado: "renovado", servicioRenovacionId: nuevoId });
    const [fila] = (await vencimientos().ver(servicioId)).vencimientos;
    expect(fila).toMatchObject({
      estado: "Renovado",
      pendiente: false,
      renovacion: { id: nuevoId, codigo: nuevo.codigo },
    });
    expect((await servicios().ver(nuevoId)).renueva).toEqual({
      id: servicioId,
      codigo: original.codigo,
    });
    expect((await servicios().ver(servicioId)).renueva).toBeNull();
  });

  test("copia la modalidad del original: uno recurrente da uno recurrente, con la vigencia del original", async () => {
    const { id } = await conUnVencimientoDeCamion();
    await cliente().servicio.update({
      where: { id: servicioId },
      data: {
        modalidad: "recurrente",
        vigenciaDesde: new Date("2031-01-01"),
        vigenciaHasta: new Date("2031-12-31"),
      },
    });

    const { servicioId: nuevoId } = await vencimientos().renovar(admin, id);

    const nuevo = await cliente().servicio.findUniqueOrThrow({
      where: { id: nuevoId },
    });
    expect(nuevo.modalidad).toBe("recurrente");
    expect(nuevo.vigenciaDesde?.toISOString().slice(0, 10)).toBe("2031-01-01");
    expect(nuevo.vigenciaHasta?.toISOString().slice(0, 10)).toBe("2031-12-31");
  });

  test("también se renueva con el servicio ya «Cerrado»", async () => {
    const { id } = await conUnVencimientoDeCamion();
    await llevarA("cerrado");

    const { servicioId: nuevoId } = await vencimientos().renovar(
      (await operadora()).actor,
      id,
    );

    expect(await cantidadDeServicios()).toBe(2);
    expect((await servicios().ver(nuevoId)).renueva?.id).toBe(servicioId);
  });

  test("uno renovado no se vuelve a renovar: DOM-0036, y no crea ningún servicio más", async () => {
    const { id } = await conUnVencimientoDeCamion();
    await vencimientos().renovar(admin, id);
    const antes = await cantidadDeServicios();

    await expect(vencimientos().renovar(admin, id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0036.codigo,
    });

    expect(await cantidadDeServicios()).toBe(antes);
  });

  test("uno descartado tampoco se renueva: DOM-0036", async () => {
    const { id } = await conUnVencimientoDeCamion();
    exigirOk(
      await vencimientos().marcarDescartado(admin, id, { motivo: "Se vendió" }),
    );

    await expect(vencimientos().renovar(admin, id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0036.codigo,
    });

    expect(await cantidadDeServicios()).toBe(1);
  });

  test("si el servicio nuevo no se puede dar de alta (el tipo ya no está activo): DOM-0037 y no queda nada", async () => {
    const { id } = await conUnVencimientoDeCamion();
    await cliente().tipoServicio.updateMany({ data: { activo: false } });

    await expect(vencimientos().renovar(admin, id)).rejects.toMatchObject({
      codigo: catalogo.DOM_0037.codigo,
    });

    expect(await cantidadDeServicios()).toBe(1);
    expect(
      await cliente().servicioVencimiento.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ estado: "pendiente", servicioRenovacionId: null });
  });

  test("un vencimiento que no existe: DOM-0009; quien no puede escribir: AUT-0009", async () => {
    const { id } = await conUnVencimientoDeCamion();
    const { actor: revocada } = await operadora();
    await cliente().usuario.updateMany({
      where: { email: OPERADOR.email },
      data: { estado: "revocado" },
    });

    await expect(
      vencimientos().renovar(admin, "00000000-0000-4000-8000-000000000999"),
    ).rejects.toMatchObject({ codigo: catalogo.DOM_0009.codigo });
    await expect(vencimientos().renovar(revocada, id)).rejects.toMatchObject({
      codigo: catalogo.AUT_0009.codigo,
    });

    expect(await cantidadDeServicios()).toBe(1);
  });
});
