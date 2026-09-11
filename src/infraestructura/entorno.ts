/**
 * Variables de entorno validadas con Zod (F0-04). Todo borde externo se
 * valida, y el entorno es el primero: si falta una variable o tiene un valor
 * que no corresponde, la app no arranca (`src/instrumentation.ts` llama a
 * `exigirEntornoValido` al levantar el servidor).
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
});

export type Entorno = z.infer<typeof esquemaEntorno>;

export type ResultadoEntorno =
  | { readonly ok: true; readonly entorno: Entorno }
  | { readonly ok: false; readonly mensaje: string };

/**
 * Valida un conjunto de variables (en la app, `process.env`) contra el
 * esquema. Pura: no lee el entorno real ni termina el proceso; eso lo hace
 * quien la llama. El mensaje nombra cada variable que falta o es inválida y
 * **no repite el valor recibido**: el día que haya secretos en el esquema,
 * este mensaje no los tiene que imprimir.
 */
export function validarEntorno(
  variables: Readonly<Record<string, string | undefined>>,
): ResultadoEntorno {
  const resultado = esquemaEntorno.safeParse(variables);
  if (resultado.success) {
    return { ok: true, entorno: resultado.data };
  }

  const problemas = resultado.error.issues.map((problema) => {
    const variable = problema.path.map(String).join(".");
    const valor = variables[variable];
    const validos =
      problema.code === "invalid_value"
        ? ` Valores válidos: ${problema.values.map(String).join(", ")}.`
        : "";
    const que =
      valor === undefined || valor === ""
        ? "falta (no está definida o está vacía)"
        : "tiene un valor inválido";
    return `- ${variable}: ${que}.${validos}`;
  });

  return {
    ok: false,
    mensaje: [
      "Entorno inválido: la app no arranca.",
      ...problemas,
      "Para levantar en local, copiá .env.example a .env (ver README.md).",
    ].join("\n"),
  };
}

/**
 * Lo que corre al arrancar el servidor (solo en Node): valida `process.env`
 * y, si falla, escribe el mensaje en stderr y termina el proceso con código
 * 1. Sin `console`: los logs estructurados llegan en F0-24.
 */
export function exigirEntornoValido(): void {
  const resultado = validarEntorno(process.env);
  if (!resultado.ok) {
    process.stderr.write(`${resultado.mensaje}\n`);
    process.exit(1);
  }
}
