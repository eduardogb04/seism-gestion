// Viola `adaptadores-solo-en-arranque`: infraestructura fuera de `arranque/`
// importa un adaptador.
import { RepositorioEnMemoria } from "../../adaptadores/memoria/repositorio-en-memoria.ts";

export const repositorio = new RepositorioEnMemoria();
