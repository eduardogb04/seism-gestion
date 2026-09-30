/**
 * Puerto de identidad (F0-31, ADR 0027): *"Identidad delegada en Google. El
 * sistema nunca guarda una contraseña."* Quién es la persona lo dice un
 * proveedor de afuera; el sistema solo decide si la deja entrar (eso es el
 * caso de uso `completarSesion`, en `src/casos-uso/sesion/`, contra la lista
 * blanca de `usuarios`).
 *
 * El login es de dos pasos, con la redirección del navegador en el medio:
 *
 * 1. `iniciarLogin(estado)` → la dirección adonde mandar al navegador. El
 *    `state` y el verificador PKCE los genera la app y los guarda en una
 *    cookie temporal: el puerto no guarda nada entre un paso y el otro.
 * 2. `completarLogin(codigo, { guardado, stateRecibido })` → la
 *    `IdentidadVerificada`, o un `ErrorSistema`:
 *    - `AUT-0002` si el `state` que volvió no es el guardado (o no volvió
 *      ninguno): el login no es el que empezó este navegador, o venció;
 *    - `AUT-0001` si el proveedor no reconoce el código o la identidad no se
 *      puede verificar (firma, emisor, audiencia, vencimiento, email sin
 *      verificar).
 *
 * Implementaciones: `src/adaptadores/identidad-falsa/` (dev, CI y e2e;
 * prohibida en el servidor por el esquema del entorno) y
 * `src/adaptadores/identidad-google/` (OIDC con `arctic`). Suite de contrato:
 * `tests/contratos/identidad.ts`.
 */

/** Quién verificó la identidad. */
export type ProveedorIdentidad = "falsa" | "google";

/** Lo que el proveedor garantiza de quien entró. */
export type IdentidadVerificada = {
  readonly proveedor: ProveedorIdentidad;
  /** El identificador estable de la persona en el proveedor. */
  readonly sub: string;
  /** Tal como lo dio el proveedor; el caso de uso lo pasa a minúsculas. */
  readonly email: string;
  readonly emailVerificado: boolean;
};

/** Lo que la app guarda en la cookie temporal entre los dos pasos. */
export type EstadoLogin = {
  /** Aleatorio: ata la vuelta del proveedor a este navegador. */
  readonly state: string;
  /** PKCE: el proveedor exige el mismo verificador al canjear el código. */
  readonly verificadorPkce: string;
};

/** El `state` guardado y el que volvió del proveedor (si volvió alguno). */
export type RespuestaLogin = {
  readonly guardado: EstadoLogin;
  readonly stateRecibido: string | null;
};

export type Identidad = {
  /** Adónde mandar al navegador para que la persona se identifique. */
  iniciarLogin(estado: EstadoLogin): string;
  /** Canjea el código y verifica la identidad. Rechaza con `AUT-0002` o `AUT-0001`. */
  completarLogin(
    codigo: string,
    estado: RespuestaLogin,
  ): Promise<IdentidadVerificada>;
};
