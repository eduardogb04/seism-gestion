// Viola `adaptadores-sin-casos-uso-ni-entradas`: un adaptador importa un
// caso de uso (conoce a quien lo usa).
import { registrar } from "../../casos-uso/registrar.ts";

export const alGuardar = registrar;
