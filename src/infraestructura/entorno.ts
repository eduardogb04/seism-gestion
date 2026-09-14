/**
 * Variables de entorno validadas con Zod (F0-04). Todo borde externo se
 * valida, y el entorno es el primero: si falta una variable o tiene un valor
 * que no corresponde, la app no arranca (`src/instrumentation.ts` llama a
 * `exigirEntornoValido` al levantar el servidor), y tampoco arranca ningún
 * script de base (`scripts/db-migrate.ts`, F0-08).
 *
 * Se valida al **arrancar**, no al compilar: `npm run build` no necesita
 * `.env`, y la misma imagen corre en `local`, `ci` y `servidor` con distintas
 * variables (ADR 0005).
 *
 * Cada variable nueva entra al esquema y a `.env.example` en la misma tarea
 * (sin valor si es secreta).
 */

import { z } from "zod";

const VALORES_APP_ENTORNO = ["local", "ci", "servidor"] as const;

export const esquemaEntorno = z.object({
  /** Dónde corre la app. No es secreto: `.env.example` trae `local`. */
  APP_ENTORNO: z.enum(VALORES_APP_ENTORNO),
  /**
   * La base de datos (F0-08): una URL `postgresql://` o `postgres://`. En el
   * servidor lleva la clave de la base, así que es secreta; la de
   * `.env.example` es la del Postgres local de `docker-compose.yml`
   * (ficticia, ADR 0008).
   */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

export type ResultadoEntorno =
  | { readonly ok: true; readonly entorno: Entorno }
  | { readonly ok: false; readonly mensaje: string };

/**
 * Qué se espera de cada variable, para el mensaje cuando el valor es
 * inválido y Zod no lo dice solo (en un `z.enum`, los valores válidos salen
 * del propio error).
 */
const FORMATO_ESPERADO = new Map<string, string>([
  [
    "DATABASE_URL",
    " Tiene que ser una URL de Postgres: postgresql://usuario:clave@servidor:puerto/base (o postgres://).",
  ],
]);

/**
 * Valida un conjunto de variables (en la app, `process.env`) contra el
 * esquema. Pura: no lee el entorno real ni termina el proceso; eso lo hace
 * quien la llama. El mensaje nombra cada variable que falta o es inválida y
 * **no repite el valor recibido**: `DATABASE_URL` lleva la clave de la base.
 * `proceso` es lo que no arranca, para el mensaje: la app, o el script que
 * valida antes de tocar la base.
 */
export function validarEntorno(
  variables: Readonly<Record<string, string | undefined>>,
  proceso = "la app",
): ResultadoEntorno {
  const resultado = esquemaEntorno.safeParse(variables);
  if (resultado.success) {
    return { ok: true, entorno: resultado.data };
  }

  const problemas = resultado.error.issues.map((problema) => {
    const variable = problema.path.map(String).join(".");
    const valor = variables[variable];
    if (valor === undefined || valor === "") {
      return `- ${variable}: falta (no está definida o está vacía).`;
    }
    const validos =
      problema.code === "invalid_value"
        ? ` Valores válidos: ${problema.values.map(String).join(", ")}.`
        : (FORMATO_ESPERADO.get(variable) ?? "");
    return `- ${variable}: tiene un valor inválido.${validos}`;
  });

  return {
    ok: false,
    mensaje: [
      `Entorno inválido: ${proceso} no arranca.`,
      ...problemas,
      "Para levantar en local, copiá .env.example a .env (ver README.md).",
    ].join("\n"),
  };
}

/**
 * Lo que corre al arrancar el servidor (solo en Node) o un script de base:
 * valida `process.env` y, si falla, escribe el mensaje en stderr y termina el
 * proceso con código 1. Sin `console`: los logs estructurados llegan en F0-24.
 */
export function exigirEntornoValido(proceso = "la app"): Entorno {
  const resultado = validarEntorno(process.env, proceso);
  if (!resultado.ok) {
    process.stderr.write(`${resultado.mensaje}\n`);
    process.exit(1);
  }
  return resultado.entorno;
}
