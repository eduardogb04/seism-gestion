// NO viola nada: `app` lee tipos del dominio con `import type`.
import type { Entidad } from "../dominio/entidad.ts";

export const mostrar = (entidad: Entidad): string => entidad.id;
