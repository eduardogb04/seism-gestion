// Viola `adaptadores-solo-en-arranque`: una página de Next (`.tsx`) importa
// un adaptador directo. Prueba además que las reglas miran los `.tsx`.
import { RepositorioEnMemoria } from "../adaptadores/memoria/repositorio-en-memoria.ts";

export default function Pagina() {
  return <p>{new RepositorioEnMemoria().datos.length}</p>;
}
