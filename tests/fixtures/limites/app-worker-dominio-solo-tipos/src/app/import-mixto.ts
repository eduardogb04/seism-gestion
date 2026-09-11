// Viola `app-worker-dominio-solo-tipos`: un import que trae un tipo y un
// valor es un import de valor.
import { crearEntidad, type Entidad } from "../dominio/entidad.ts";

export const entidad: Entidad = crearEntidad("tres");
