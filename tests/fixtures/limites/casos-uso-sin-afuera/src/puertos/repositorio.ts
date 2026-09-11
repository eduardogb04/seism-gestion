export interface Repositorio {
  guardar(dato: string): Promise<void>;
}
