/**
 * F0-28 · Tope de gasto mensual de IA contra Postgres de verdad (criterio 4;
 * R6, R7). Reloj fijo y tope bajo: 0.01 USD = 10.000 micro-dólares.
 *
 * - `acumulado + estimado > tope` (estrictamente): no se llama al adaptador
 *   (el doble cuenta cero llamadas), `IA-0001` con `{ acumulado, estimado,
 *   tope, mes }`, aviso en el log con el código y ninguna fila nueva.
 * - Igual al tope se permite (borde exacto); un micro-dólar más, no.
 * - El mes es el mes civil del reloj inyectado: la fila del mes anterior no
 *   cuenta, y cambiar de mes libera el tope.
 * - El que llamó atrapa `IA-0001` por su código y sigue "por reglas".
 *
 * Necesita Docker corriendo.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { z } from "zod";
import {
  type CasoIaDoble,
  crearIaDoble,
} from "../../src/adaptadores/ia-doble/ia-doble.ts";
import { crearNotificacionesEnMemoria } from "../../src/adaptadores/memoria/notificaciones.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearLectorConfiguracion } from "../../src/adaptadores/prisma/configuracion.ts";
import { crearRepositorioUsoIa } from "../../src/adaptadores/prisma/uso-ia.ts";
import { crearRepositorioUsuariosPrisma } from "../../src/adaptadores/prisma/usuarios.ts";
import { gastoDelMes } from "../../src/casos-uso/ia/gasto-del-mes.ts";
import { crearInterpretar } from "../../src/casos-uso/ia/interpretar.ts";
import { ErrorSistema } from "../../src/dominio/compartido/errores/error-sistema.ts";
import type { MicroUsd } from "../../src/dominio/compartido/micro-usd.ts";
import {
  type FechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import {
  crearAvisarAdministradores,
  crearAvisosIa,
} from "../../src/infraestructura/arranque/avisos.ts";
import type { Notificaciones } from "../../src/puertos/notificaciones.ts";
import {
  ADMIN_DOS,
  ADMIN_UNO,
  EX_ADMIN,
  OPERADOR,
  sembrarUsuarios,
} from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";
import {
  type ClientePrisma,
  capturarLog,
  fecha,
  fijarConfiguracion,
} from "./_arnes/ia.ts";

const PERFIL = "remito-ficticio";
const ENTRADA = "Remito 0001 de Ferretería Inventada";

const CASOS: readonly CasoIaDoble[] = [
  {
    perfil: PERFIL,
    entrada: ENTRADA,
    respuesta: {
      salida: { proveedor: "Ferretería Inventada" },
      modelo: "modelo-de-prueba",
      versionPrompt: "v-prueba-1",
      costoMicroUsd: 3_000n,
      tokens: 10,
    },
  },
];

const esquemaRemito = z.object({ proveedor: z.string() });

/** Tope bajo: 0.01 USD. Estimado por defecto: 0.004 USD. */
const CONFIGURACION = {
  "ia.tope_mensual_usd": "0.01",
  "ia.costo_estimado_usd.defecto": "0.004",
};

const MEDIADOS_DE_SEPTIEMBRE = fecha({
  anio: 2026,
  mes: 9,
  dia: 15,
  hora: 14,
  minuto: 30,
});

let prisma: ClientePrisma | undefined;

function db(): ClientePrisma {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ClientePrisma;
}

/** `canal`: por dónde salen los avisos (por defecto, el doble en memoria). */
function armar(
  ahora: FechaHora,
  canal: Notificaciones = crearNotificacionesEnMemoria(),
) {
  const doble = crearIaDoble(CASOS);
  const log = capturarLog();
  const interpretar = crearInterpretar({
    adaptador: doble,
    usos: crearRepositorioUsoIa(db()),
    configuracion: crearLectorConfiguracion(db()),
    reloj: RelojFijo(ahora),
    avisos: crearAvisosIa(
      crearAvisarAdministradores({
        notificaciones: canal,
        usuarios: crearRepositorioUsuariosPrisma(db()),
        log: log.log,
      }),
    ),
  });
  return { doble, interpretar, log };
}

/** Un doble en memoria de `Notificaciones` y el `armar` que sale por él. */
function armarConDoble(ahora: FechaHora) {
  const notificaciones = crearNotificacionesEnMemoria();
  return { ...armar(ahora, notificaciones), notificaciones };
}

/** Una fila de uso ya gastada, en la fecha dada. */
async function gastado(en: FechaHora, costoMicroUsd: MicroUsd): Promise<void> {
  await crearRepositorioUsoIa(db()).registrar({
    en,
    perfil: PERFIL,
    modelo: "modelo-de-prueba",
    versionPrompt: "v-prueba-1",
    costoMicroUsd,
    tokens: 1,
    propuesta: { previa: true },
    propuestaValida: true,
  });
}

/** Lo que rechazó la promesa, o falla el test si se cumplió. */
async function rechazo(promesa: Promise<unknown>): Promise<ErrorSistema> {
  const motivo = await promesa.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(motivo).toBeInstanceOf(ErrorSistema);
  return motivo as ErrorSistema;
}

function preguntar(interpretar: ReturnType<typeof crearInterpretar>) {
  return interpretar({
    perfil: PERFIL,
    entrada: ENTRADA,
    esquemaSalida: esquemaRemito,
  });
}

beforeAll(() => {
  prisma = crearClientePrisma(uriBaseCompartida());
});

beforeEach(async () => {
  await limpiarBase();
  await fijarConfiguracion(db(), CONFIGURACION);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("tope mensual de gasto de IA", () => {
  test("borde exacto: acumulado + estimado igual al tope se permite y llama al adaptador", async () => {
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 6_000n);
    const { interpretar, doble } = armar(MEDIADOS_DE_SEPTIEMBRE);

    await expect(preguntar(interpretar)).resolves.toMatchObject({
      propuesta: { proveedor: "Ferretería Inventada" },
    });
    expect(doble.llamadas()).toBe(1);
    expect(await db().usoIa.count()).toBe(2);
  });

  test("un micro-dólar arriba del tope: no llama al adaptador, IA-0001 con el detalle, un aviso por administrador activo y sin fila nueva", async () => {
    const [uno, dos] = await sembrarUsuarios(db(), [
      ADMIN_UNO,
      ADMIN_DOS,
      OPERADOR,
      EX_ADMIN,
    ]);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 6_001n);
    const { interpretar, doble, notificaciones } = armarConDoble(
      MEDIADOS_DE_SEPTIEMBRE,
    );

    const error = await rechazo(preguntar(interpretar));

    expect(doble.llamadas()).toBe(0);
    expect(error.codigo).toBe("IA-0001");
    expect(error.detalles).toEqual({
      acumulado: "0.006001",
      estimado: "0.004",
      tope: "0.01",
      mes: "2026-09",
      perfil: PERFIL,
    });
    expect(await db().usoIa.count()).toBe(1);
    const enviados = notificaciones.enviados();
    expect(enviados.map((envio) => envio.destinatario)).toEqual([
      { tipo: "persona", usuarioId: uno?.id },
      { tipo: "persona", usuarioId: dos?.id },
    ]);
    for (const envio of enviados) {
      expect(JSON.stringify(envio.mensaje)).toContain("IA-0001");
      expect(envio.mensaje.cuerpo).toContain("mes: 2026-09");
      expect(envio.mensaje.cuerpo).toContain("tope: 0.01");
      expect(JSON.stringify(envio.mensaje)).not.toContain(ENTRADA);
    }
  });

  test("un administrador revocado no recibe el aviso del tope", async () => {
    const [vigente] = await sembrarUsuarios(db(), [ADMIN_UNO, EX_ADMIN]);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 10_000n);
    const { interpretar, notificaciones } = armarConDoble(
      MEDIADOS_DE_SEPTIEMBRE,
    );

    await rechazo(preguntar(interpretar));

    expect(notificaciones.enviados().map((e) => e.destinatario)).toEqual([
      { tipo: "persona", usuarioId: vigente?.id },
    ]);
  });

  test("sin administradores activos: IA-0001 igual, cero envíos y un warn con el código", async () => {
    await sembrarUsuarios(db(), [OPERADOR, EX_ADMIN]);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 10_000n);
    const { interpretar, notificaciones, log } = armarConDoble(
      MEDIADOS_DE_SEPTIEMBRE,
    );

    expect((await rechazo(preguntar(interpretar))).codigo).toBe("IA-0001");

    expect(notificaciones.enviados()).toEqual([]);
    expect(log.lineas()).toHaveLength(1);
    expect(log.lineas()[0]).toMatchObject({ level: "warn", codigo: "IA-0001" });
  });

  test("si enviar lanza, el aviso no tapa el IA-0001: se sigue lanzando y la falla se loguea con su código", async () => {
    await sembrarUsuarios(db(), [ADMIN_UNO]);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 10_000n);
    const canalCaido: Notificaciones = {
      enviar: () => Promise.reject(new Error("canal caído")),
    };
    const { interpretar, doble, log } = armar(
      MEDIADOS_DE_SEPTIEMBRE,
      canalCaido,
    );

    const error = await rechazo(preguntar(interpretar));

    expect(error.codigo).toBe("IA-0001");
    expect(doble.llamadas()).toBe(0);
    expect(log.lineas()).toHaveLength(1);
    expect(log.lineas()[0]).toMatchObject({
      level: "error",
      codigo: "INF-0001",
      aviso: "IA-0001",
    });
  });

  test("el costo estimado del perfil manda sobre el de defecto", async () => {
    await fijarConfiguracion(db(), {
      ...CONFIGURACION,
      [`ia.costo_estimado_usd.${PERFIL}`]: "0.005",
    });
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 6_000n);
    const { interpretar, doble } = armar(MEDIADOS_DE_SEPTIEMBRE);

    const error = await rechazo(preguntar(interpretar));

    expect(error.codigo).toBe("IA-0001");
    expect(error.detalles).toMatchObject({ estimado: "0.005" });
    expect(doble.llamadas()).toBe(0);
  });

  test("la fila del mes anterior no cuenta: cambiar de mes libera el tope", async () => {
    const finDeAgosto = fecha({
      anio: 2026,
      mes: 8,
      dia: 31,
      hora: 23,
      minuto: 59,
      segundo: 59,
      milisegundo: 999,
    });
    await gastado(finDeAgosto, 10_000n);

    const enAgosto = armar(finDeAgosto);
    expect(
      (await rechazo(preguntar(enAgosto.interpretar))).detalles,
    ).toMatchObject({ mes: "2026-08", acumulado: "0.01" });
    expect(enAgosto.doble.llamadas()).toBe(0);

    const primeroDeSeptiembre = armar(fecha({ anio: 2026, mes: 9, dia: 1 }));
    await expect(
      preguntar(primeroDeSeptiembre.interpretar),
    ).resolves.toMatchObject({ costoUsd: 3_000n });
    expect(primeroDeSeptiembre.doble.llamadas()).toBe(1);
  });

  test("el mes es civil argentino: las 22 h del último día todavía son de ese mes", async () => {
    // 31/8 22:00 en la Argentina es 1/9 01:00 UTC: tiene que contar para agosto.
    await gastado(fecha({ anio: 2026, mes: 8, dia: 31, hora: 22 }), 10_000n);

    const septiembre = armar(fecha({ anio: 2026, mes: 9, dia: 1, hora: 0 }));
    await expect(preguntar(septiembre.interpretar)).resolves.toBeDefined();

    const agosto = armar(fecha({ anio: 2026, mes: 8, dia: 31, hora: 23 }));
    expect((await rechazo(preguntar(agosto.interpretar))).codigo).toBe(
      "IA-0001",
    );
  });

  test("el que llamó atrapa IA-0001 por su código y sigue por reglas", async () => {
    await gastado(fecha({ anio: 2026, mes: 9, dia: 2 }), 10_000n);
    const { interpretar, doble } = armar(MEDIADOS_DE_SEPTIEMBRE);

    // Un llamador de ejemplo (no es un caso de uso real): propone el
    // proveedor con IA y, si se pasó el tope, con una regla fija.
    async function proponerProveedor(texto: string) {
      try {
        const { propuesta } = await interpretar({
          perfil: PERFIL,
          entrada: texto,
          esquemaSalida: esquemaRemito,
        });
        return { origen: "ia", proveedor: propuesta.proveedor };
      } catch (error) {
        if (error instanceof ErrorSistema && error.codigo === "IA-0001") {
          return { origen: "reglas", proveedor: texto.split(" de ")[1] };
        }
        throw error;
      }
    }

    await expect(proponerProveedor(ENTRADA)).resolves.toEqual({
      origen: "reglas",
      proveedor: "Ferretería Inventada",
    });
    expect(doble.llamadas()).toBe(0);
  });

  test("un tope que no se puede leer es INF-0001 con la clave, y tampoco llama al adaptador", async () => {
    await fijarConfiguracion(db(), {
      ...CONFIGURACION,
      "ia.tope_mensual_usd": "diez dólares",
    });
    const { interpretar, doble } = armar(MEDIADOS_DE_SEPTIEMBRE);

    const error = await rechazo(preguntar(interpretar));

    expect(error.codigo).toBe("INF-0001");
    expect(error.detalles).toMatchObject({ clave: "ia.tope_mensual_usd" });
    expect(doble.llamadas()).toBe(0);
  });
});

describe("gastoDelMes", () => {
  test("suma el gasto del mes civil del reloj y lo muestra contra el tope, en texto y en micro-dólares", async () => {
    await gastado(fecha({ anio: 2026, mes: 8, dia: 31, hora: 22 }), 7_000n);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 1 }), 2_500n);
    await gastado(fecha({ anio: 2026, mes: 9, dia: 30, hora: 23 }), 1_000n);
    await gastado(fecha({ anio: 2026, mes: 10, dia: 1 }), 9_000n);

    const gasto = await gastoDelMes(RelojFijo(MEDIADOS_DE_SEPTIEMBRE), {
      usos: crearRepositorioUsoIa(db()),
      configuracion: crearLectorConfiguracion(db()),
    });

    expect(gasto).toEqual({
      mes: "2026-09",
      gastadoUsd: "0.0035",
      gastadoMicroUsd: 3_500n,
      topeUsd: "0.01",
      topeMicroUsd: 10_000n,
    });
  });

  test("sin gasto en el mes, cero", async () => {
    const gasto = await gastoDelMes(RelojFijo(MEDIADOS_DE_SEPTIEMBRE), {
      usos: crearRepositorioUsoIa(db()),
      configuracion: crearLectorConfiguracion(db()),
    });

    expect(gasto).toMatchObject({ gastadoUsd: "0.00", gastadoMicroUsd: 0n });
  });
});
