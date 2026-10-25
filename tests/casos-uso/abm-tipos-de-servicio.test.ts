/**
 * Lo propio de Tipos de servicio desde F4-01 contra el Postgres de verdad del
 * arnés: la regla de vencimiento (plazo común, plazo de antiguos y antigüedad
 * de corte), opcional, en enteros positivos, y el plazo de antiguos con el
 * corte juntos o ninguno, en la validación del ABM y en el CHECK de la base.
 * Lo común a todos los ABM está en `abm.test.ts`.
 *
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
import type { Escrito } from "../../src/casos-uso/abm/definicion.ts";
import { TIPOS_DE_SERVICIO } from "../../src/casos-uso/abm/tipos-de-servicio.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const HOY = crearFechaHora({
  anio: 2031,
  mes: 7,
  dia: 9,
  hora: 10,
  minuto: 30,
  segundo: 0,
  milisegundo: 0,
});

const ENTERO_POSITIVO = "Tiene que ser un número entero mayor que 0.";
const FALTA_CORTE =
  "Escribí la antigüedad de corte: va junto con el plazo para camiones antiguos.";
const FALTAN_ANTIGUOS =
  "Escribí el plazo para camiones antiguos: va junto con la antigüedad de corte.";

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

function casos() {
  if (!HOY.ok) {
    throw new Error(HOY.mensaje);
  }
  return crearCasosUsoAbm({
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(HOY.fechaHora),
    generadorId: crearGeneradorIdCrypto(),
  });
}

/** Un tipo válido sin regla de vencimiento; cada test cambia lo suyo. */
function escritoDeTipo(cambios: Escrito = {}): Escrito {
  return {
    nombre: "Certificación de ejemplo",
    descripcion: "",
    modalidad: "puntual",
    activo: "si",
    vencimientoMeses: "",
    vencimientoMesesAntiguos: "",
    antiguedadCorteAnios: "",
    ...cambios,
  };
}

describe("Tipos de servicio: la regla de vencimiento", () => {
  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const [uno] = await sembrarUsuarios(cliente(), [ADMIN_UNO]);
    if (uno === undefined) {
      throw new Error("falta el usuario sembrado");
    }
    admin = { tipo: "persona", usuarioId: uno.id };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const crear = (cambios: Escrito = {}) =>
    casos().crear(admin, TIPOS_DE_SERVICIO, escritoDeTipo(cambios));

  test("los tres plazos se guardan y se vuelven a leer; sin ninguno, quedan vacíos", async () => {
    const conRegla = await crear({
      vencimientoMeses: "60",
      vencimientoMesesAntiguos: "36",
      antiguedadCorteAnios: "10",
    });
    expect(conRegla).toMatchObject({ ok: true });
    const sinRegla = await crear({ nombre: "Informe de ejemplo" });
    expect(sinRegla).toMatchObject({ ok: true });
    if (!conRegla.ok || !sinRegla.ok) {
      return;
    }

    expect(
      await cliente().tipoServicio.findUniqueOrThrow({
        where: { id: conRegla.registro.valor.id },
        select: {
          vencimientoMeses: true,
          vencimientoMesesAntiguos: true,
          antiguedadCorteAnios: true,
        },
      }),
    ).toEqual({
      vencimientoMeses: 60,
      vencimientoMesesAntiguos: 36,
      antiguedadCorteAnios: 10,
    });
    expect(sinRegla.registro.valor).toMatchObject({
      vencimientoMeses: null,
      vencimientoMesesAntiguos: null,
      antiguedadCorteAnios: null,
    });

    // Solo el plazo común, y después editado para sumar los de antiguos.
    const soloComun = await crear({
      nombre: "Auditoría de ejemplo",
      vencimientoMeses: "12",
    });
    expect(soloComun).toMatchObject({
      ok: true,
      registro: { valor: { vencimientoMeses: 12 } },
    });
    if (!soloComun.ok) {
      return;
    }
    expect(
      await casos().guardar(
        admin,
        TIPOS_DE_SERVICIO,
        soloComun.registro.valor.id,
        escritoDeTipo({
          nombre: "Auditoría de ejemplo",
          vencimientoMeses: "24",
          vencimientoMesesAntiguos: "12",
          antiguedadCorteAnios: "5",
        }),
      ),
    ).toMatchObject({
      ok: true,
      registro: {
        valor: {
          vencimientoMeses: 24,
          vencimientoMesesAntiguos: 12,
          antiguedadCorteAnios: 5,
        },
      },
    });
  });

  test("cero, negativo o con decimales vuelve al lado del campo, sin guardar", async () => {
    expect(
      await crear({
        vencimientoMeses: "0",
        vencimientoMesesAntiguos: "-3",
        antiguedadCorteAnios: "0",
      }),
    ).toEqual({
      ok: false,
      errores: {
        vencimientoMeses: ENTERO_POSITIVO,
        vencimientoMesesAntiguos: ENTERO_POSITIVO,
        antiguedadCorteAnios: ENTERO_POSITIVO,
      },
    });
    expect(await crear({ vencimientoMeses: "1,5" })).toEqual({
      ok: false,
      errores: { vencimientoMeses: "Escribí un número entero, sin decimales." },
    });
    // El tope deja afuera lo que no entra en la columna entera de la base.
    expect(
      await crear({
        vencimientoMeses: "1201",
        vencimientoMesesAntiguos: "1201",
        antiguedadCorteAnios: "101",
      }),
    ).toEqual({
      ok: false,
      errores: {
        vencimientoMeses: "No puede pasar de 1200 meses (100 años).",
        vencimientoMesesAntiguos: "No puede pasar de 1200 meses (100 años).",
        antiguedadCorteAnios: "No puede pasar de 100 años.",
      },
    });
    expect(await cliente().tipoServicio.count()).toBe(0);
  });

  test("el plazo de antiguos y el corte van juntos o ninguno: el que falta se pide al lado de su campo", async () => {
    expect(await crear({ vencimientoMesesAntiguos: "36" })).toEqual({
      ok: false,
      errores: { antiguedadCorteAnios: FALTA_CORTE },
    });
    expect(await crear({ antiguedadCorteAnios: "10" })).toEqual({
      ok: false,
      errores: { vencimientoMesesAntiguos: FALTAN_ANTIGUOS },
    });
    expect(await cliente().tipoServicio.count()).toBe(0);

    // Sin plazo común, los de antiguos juntos valen: solo vencen los camiones antiguos.
    expect(
      await crear({
        vencimientoMesesAntiguos: "36",
        antiguedadCorteAnios: "10",
      }),
    ).toMatchObject({ ok: true });
  });

  test("la base rechaza por su cuenta un plazo que no es positivo o el de antiguos sin el corte", async () => {
    const creado = await crear();
    expect(creado).toMatchObject({ ok: true });
    if (!creado.ok) {
      return;
    }
    const donde = { id: creado.registro.valor.id };
    const cambiar = (
      data: Partial<
        Record<
          | "vencimientoMeses"
          | "vencimientoMesesAntiguos"
          | "antiguedadCorteAnios",
          number | null
        >
      >,
    ) => cliente().tipoServicio.update({ where: donde, data });

    await expect(cambiar({ vencimientoMeses: 0 })).rejects.toThrow(
      /tipos_servicio_regla_de_vencimiento/,
    );
    // Juntos, para que lo rechace la regla de positivos y no la de «van juntos».
    await expect(
      cambiar({ vencimientoMesesAntiguos: 0, antiguedadCorteAnios: 10 }),
    ).rejects.toThrow(/tipos_servicio_regla_de_vencimiento/);
    await expect(
      cambiar({ vencimientoMesesAntiguos: 36, antiguedadCorteAnios: -1 }),
    ).rejects.toThrow(/tipos_servicio_regla_de_vencimiento/);
    await expect(cambiar({ vencimientoMesesAntiguos: 36 })).rejects.toThrow(
      /tipos_servicio_regla_de_vencimiento/,
    );
    await expect(cambiar({ antiguedadCorteAnios: 10 })).rejects.toThrow(
      /tipos_servicio_regla_de_vencimiento/,
    );
    await expect(
      cambiar({ vencimientoMesesAntiguos: 36, antiguedadCorteAnios: 10 }),
    ).resolves.toMatchObject({ antiguedadCorteAnios: 10 });
  });
});
