/**
 * El mecanismo de semilla (F0-10): `npm run db:seed` lo corre después de
 * validar el entorno (`scripts/db-seed.ts`). Acá solo vive **el mecanismo**:
 * los casos reales de la empresa son Fase 1.
 *
 * Desde F0-30 también da de alta al **primer administrador** (el email de
 * `ADMIN_INICIAL_EMAIL`), si no existe: es el único usuario que no crea
 * otro administrador, y por eso no pasa por `darDeAlta` (que exige una
 * persona administradora) sino por este camino aparte, con el actor de
 * sistema `db-seed` (ADR 0024).
 *
 * Importa de `adaptadores` (el cliente de Prisma y los repositorios) y del
 * dominio; nada de entorno: la validación de entorno, el reloj del sistema y
 * el permiso para correr en el servidor viven en `scripts/db-seed.ts`, no
 * acá. Así `sembrar` se prueba sola, dos veces seguidas contra un Postgres
 * real, sin nada de eso en el medio (`tests/casos-uso/seed.test.ts` y
 * `tests/casos-uso/usuarios-semilla.test.ts`).
 *
 * **Las semillas de Fase 1 serán ficticias**: clientes, sitios, personas y
 * montos inventados que respeten la forma de los casos reales de la empresa,
 * sin nombrar ninguno. El repo es público (P14, AGENTS.md regla 1): ni un
 * dato real entra acá, ni ahora ni en Fase 1.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { crearAuditoriaPrisma } from "../src/adaptadores/prisma/auditoria.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import { crearRepositorioUsuariosPrisma } from "../src/adaptadores/prisma/usuarios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { catalogo } from "../src/dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../src/dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../src/dominio/compartido/identificador.ts";
import type { Reloj } from "../src/dominio/compartido/reloj.ts";
import type { DatosUsuario } from "../src/puertos/repositorios/usuarios.ts";

/** Lo que la semilla necesita de afuera: lo arma `scripts/db-seed.ts`. */
export type OpcionesSemilla = {
  /** `ADMIN_INICIAL_EMAIL`, ya validado como email. */
  readonly adminInicialEmail: string;
  readonly reloj: Reloj;
};

/** El actor de lo que crea la semilla. */
function actorSemilla(): Actor {
  const proceso = crearNombreProceso("db-seed");
  if (!proceso.ok) {
    throw nuevoError(catalogo.INF_0001, { motivo: proceso.error });
  }
  return { tipo: "sistema", proceso: proceso.valor };
}

/** Claves de `configuracion` con su valor por defecto. Hoy, una sola. */
const CONFIGURACION_POR_DEFECTO: ReadonlyArray<{
  readonly clave: string;
  readonly valor: string;
}> = [
  // El tope de gasto mensual de IA (lote 7): sin tope hasta que exista.
  { clave: "ia.tope_mensual_usd", valor: "0" },
];

/**
 * Inserta las claves de `configuracion` que todavía no existen y actualiza
 * las que cambiaron de valor. **Idempotente**: si una clave ya tiene el valor
 * por defecto, no la toca (ni una escritura), así correrla dos veces deja la
 * base exactamente igual, `id` y `creado_en` incluidos. Después, el
 * administrador inicial (`sembrarAdministradorInicial`), también idempotente.
 */
export async function sembrar(
  prisma: PrismaClient,
  opciones: OpcionesSemilla,
): Promise<void> {
  for (const { clave, valor } of CONFIGURACION_POR_DEFECTO) {
    const existente = await prisma.configuracion.findUnique({
      where: { clave },
    });
    if (existente === null) {
      await prisma.configuracion.create({ data: { clave, valor } });
    } else if (existente.valor !== valor) {
      await prisma.configuracion.update({ where: { clave }, data: { valor } });
    }
  }
  await sembrarAdministradorInicial(prisma, opciones);
}

/**
 * Da de alta el administrador inicial si **no hay ningún usuario con ese
 * email** (sin distinguir mayúsculas), con su auditoría, en una transacción.
 * Si ya existe —con cualquier rol o estado— no lo toca: la semilla no
 * reactiva a un revocado ni le devuelve el rol a nadie. A los demás usuarios
 * no los mira.
 */
async function sembrarAdministradorInicial(
  prisma: PrismaClient,
  { adminInicialEmail, reloj }: OpcionesSemilla,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const usuarios = crearRepositorioUsuariosPrisma(tx);
    if ((await usuarios.buscarPorEmail(adminInicialEmail)) !== null) {
      return;
    }
    const actor = actorSemilla();
    const admin = crearAuditable<DatosUsuario>(
      {
        id: identificadorDesde<"Usuario">(crearGeneradorIdCrypto().generar()),
        email: adminInicialEmail.trim().toLowerCase(),
        nombre: null,
        rol: "administrador",
        estado: "activo",
      },
      actor,
      reloj,
    );
    await usuarios.crear(admin);
    await crearAuditoriaPrisma(tx).registrar({
      entidad: "Usuario",
      id: admin.valor.id,
      accion: "crear",
      antes: null,
      despues: {
        id: admin.valor.id,
        email: admin.valor.email,
        nombre: admin.valor.nombre,
        rol: admin.valor.rol,
        estado: admin.valor.estado,
      },
      actor,
      en: reloj.ahora(),
    });
  });
}
