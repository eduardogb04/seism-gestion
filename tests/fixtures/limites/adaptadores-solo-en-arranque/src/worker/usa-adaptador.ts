// Viola `adaptadores-solo-en-arranque`: `worker` importa un adaptador
// directo, sin pasar por el punto de armado.
import { RepositorioEnMemoria } from "../adaptadores/memoria/repositorio-en-memoria.ts";

export const repositorio = new RepositorioEnMemoria();
