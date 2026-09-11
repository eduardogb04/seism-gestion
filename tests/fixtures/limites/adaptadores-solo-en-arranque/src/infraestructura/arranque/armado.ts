// NO viola nada: el punto de armado es el único lugar fuera de
// `src/adaptadores` que instancia adaptadores.
import { RepositorioEnMemoria } from "../../adaptadores/memoria/repositorio-en-memoria.ts";

export const armar = (): RepositorioEnMemoria => new RepositorioEnMemoria();
