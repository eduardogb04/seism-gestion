// NO viola nada: `app` lee un tipo del dominio con `import("...")` en
// posición de tipo (también se borra al compilar).
export type Referencia = import("../dominio/entidad.ts").Entidad;
