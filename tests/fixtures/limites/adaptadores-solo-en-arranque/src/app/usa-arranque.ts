// NO viola nada: `app` recibe los adaptadores a través del punto de armado.
import { armar } from "../infraestructura/arranque/armado.ts";

export const repositorio = armar();
