// Viola `app-worker-dominio-solo-tipos`: `app` importa un valor del dominio
// (para ejecutar una regla se pasa por un caso de uso).
import { crearEntidad } from "../dominio/entidad.ts";

export const entidad = crearEntidad("uno");
