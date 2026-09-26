// Fixture (F0-22, R4): un puerto que declara `eliminar` — borrado físico.
// `tests/dominio/puertos-sin-borrado.test.ts` tiene que detectarlo. No se
// corrige: `tests/fixtures/` queda afuera de `npm run limites` y `npm run
// lint`, así que este archivo nunca pasa por las herramientas normales.
export type RepositorioConEliminar = {
  guardar(id: string): Promise<void>;
  eliminar(id: string): Promise<void>;
};
