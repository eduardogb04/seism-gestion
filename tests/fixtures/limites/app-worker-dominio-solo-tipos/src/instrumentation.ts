// Viola `app-worker-dominio-solo-tipos`: `src/instrumentation.ts` es parte de
// `app` (ADR 0005) e importa un valor del dominio.
import { crearEntidad } from "./dominio/entidad.ts";

export const entidad = crearEntidad("cuatro");
