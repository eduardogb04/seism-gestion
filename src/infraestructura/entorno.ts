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

/** Los niveles de log que acepta `LOG_NIVEL` (F0-24), del más grave al más detallado. */
export const NIVELES_LOG = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export type NivelLog = (typeof NIVELES_LOG)[number];

/** Quién verifica la identidad de quien entra (F0-31, ADR 0027). */
const VALORES_IDENTIDAD = ["falsa", "google"] as const;

/**
 * Una variable que solo hace falta en algunos casos (las de Google, con
 * `IDENTIDAD=falsa`): vacía cuenta como ausente, que es como la deja
 * `.env.example` (`GOOGLE_CLIENT_SECRET=`).
 */
function opcional<T extends z.ZodType>(esquema: T) {
  return z.preprocess(
    (valor) => (valor === "" ? undefined : valor),
    esquema.optional(),
  );
}

/** Lo que exige `IDENTIDAD=google`: sin cualquiera de las tres no hay login. */
const VARIABLES_DE_GOOGLE = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APP_URL_PUBLICA",
] as const;

export const esquemaVariables = z.object({
  /** Dónde corre la app. No es secreto: `.env.example` trae `local`. */
  APP_ENTORNO: z.enum(VALORES_APP_ENTORNO),
  /**
   * La base de datos (F0-08): una URL `postgresql://` o `postgres://`. En el
   * servidor lleva la clave de la base, así que es secreta; la de
   * `.env.example` es la del Postgres local de `docker-compose.yml`
   * (ficticia, ADR 0008).
   */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /**
   * Nivel del log (F0-24). Opcional: sin ella, `debug` en `local` e `info`
   * en `ci` y `servidor` (lo resuelve `src/infraestructura/log.ts`). Vacía
   * cuenta como no definida: así viene en `.env.example`.
   */
  LOG_NIVEL: z.preprocess(
    (valor) => (valor === "" ? undefined : valor),
    z.enum(NIVELES_LOG).optional(),
  ),
  /**
   * El email del primer administrador (F0-30): `npm run db:seed` lo da de
   * alta si no existe (ADR 0024). Obligatoria: sin ella no hay forma de
   * entrar a administrar usuarios. No es secreta, pero es un dato personal:
   * el de `.env.example` es inventado (`admin@ejemplo.test`) y el real
   * nunca se escribe en el repo.
   */
  ADMIN_INICIAL_EMAIL: z.email(),
  /**
   * Quién verifica la identidad (F0-31, ADR 0027): `google` (OIDC) o
   * `falsa` (una pantalla que lista emails de prueba, para dev, CI y el
   * e2e). Obligatoria. `falsa` **no se acepta con `APP_ENTORNO=servidor`**:
   * la app no arranca (ver el `superRefine` de abajo).
   */
  IDENTIDAD: z.enum(VALORES_IDENTIDAD),
  /** El cliente OAuth de Google. Obligatoria con `IDENTIDAD=google`. */
  GOOGLE_CLIENT_ID: opcional(z.string()),
  /** El secreto de ese cliente: **secreta**, nunca en el repo. Obligatoria con `IDENTIDAD=google`. */
  GOOGLE_CLIENT_SECRET: opcional(z.string()),
  /**
   * La URL con que el navegador llega a la app (`https://...`; en local,
   * `http://localhost:3000`). Google vuelve a `<APP_URL_PUBLICA>/ingresar/callback`.
   * Obligatoria con `IDENTIDAD=google`.
   */
  APP_URL_PUBLICA: opcional(z.url({ protocol: /^https?$/ })),
});

export const esquemaEntorno = esquemaVariables.superRefine((entorno, ctx) => {
  if (entorno.IDENTIDAD === "falsa" && entorno.APP_ENTORNO === "servidor") {
    ctx.addIssue({
      code: "custom",
      path: ["IDENTIDAD"],
      message:
        "la identidad falsa no se puede usar con APP_ENTORNO=servidor: en el servidor va IDENTIDAD=google (RUNBOOK, sección de Google).",
    });
  }
  if (entorno.IDENTIDAD === "google") {
    for (const variable of VARIABLES_DE_GOOGLE) {
      if (entorno[variable] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [variable],
          message: "Hace falta con IDENTIDAD=google.",
        });
      }
    }
  }
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
  ["ADMIN_INICIAL_EMAIL", " Tiene que ser un email: nombre@dominio."],
  [
    "APP_URL_PUBLICA",
    " Tiene que ser una URL http:// o https:// (la dirección con que el navegador llega a la app).",
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
      const cuando = problema.code === "custom" ? ` ${problema.message}` : "";
      return `- ${variable}: falta (no está definida o está vacía).${cuando}`;
    }
    if (problema.code === "custom") {
      return `- ${variable}: tiene un valor inválido: ${problema.message}`;
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
 * proceso con código 1. Sin `console` ni el log estructurado (F0-24): el log
 * todavía no sabe su formato ni su nivel si el entorno es inválido.
 */
export function exigirEntornoValido(proceso = "la app"): Entorno {
  const resultado = validarEntorno(process.env, proceso);
  if (!resultado.ok) {
    process.stderr.write(`${resultado.mensaje}\n`);
    process.exit(1);
  }
  return resultado.entorno;
}
