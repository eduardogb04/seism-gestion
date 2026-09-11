// Viola `casos-uso-sin-afuera`: un caso de uso importa un adaptador concreto
// en vez de recibir el puerto.
import { RepositorioEnMemoria } from "../adaptadores/memoria/repositorio-en-memoria.ts";

export const repositorio = new RepositorioEnMemoria();
