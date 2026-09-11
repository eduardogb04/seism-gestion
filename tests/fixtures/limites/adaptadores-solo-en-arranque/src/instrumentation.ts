// Viola `adaptadores-solo-en-arranque`: `src/instrumentation.ts` es parte de
// `app` (lo levanta Next al arrancar, ADR 0005) e importa un adaptador
// directo, sin pasar por el punto de armado.
import { RepositorioEnMemoria } from "./adaptadores/memoria/repositorio-en-memoria.ts";

export const repositorio = new RepositorioEnMemoria();
