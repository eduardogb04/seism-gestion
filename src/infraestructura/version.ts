/**
 * La versión de la app que devuelve `GET /api/salud` (F0-04). Se resuelve
 * **en el build**, en `next.config.ts`, y Next la deja fija en el código
 * compilado (opción `env`): la app ya no depende de git ni del entorno de
 * ejecución para saber qué versión es (ADR 0005).
 *
 * Orden: `APP_VERSION` si viene definida (la pasa el build de Docker desde
 * F0-07, que no tiene `.git`); si no, el SHA corto de git. Sin ninguna de las
 * dos, el build falla: una imagen que no sabe qué versión es no se despliega.
 */

export type ResultadoVersion =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly mensaje: string };

/**
 * Pura: la lectura de git se inyecta (`leerShaGit` devuelve `undefined` si
 * no hay repositorio o git no está), para poder probarla sin correr procesos.
 */
export function resolverVersion(
  appVersion: string | undefined,
  leerShaGit: () => string | undefined,
): ResultadoVersion {
  if (appVersion !== undefined && appVersion !== "") {
    return { ok: true, version: appVersion };
  }
  const sha = leerShaGit();
  if (sha !== undefined && sha !== "") {
    return { ok: true, version: sha };
  }
  return {
    ok: false,
    mensaje:
      "No se pudo determinar la versión de la app: APP_VERSION no está definida y no se pudo leer el SHA de git (¿no hay .git o git no está instalado?). Definí APP_VERSION al compilar.",
  };
}
