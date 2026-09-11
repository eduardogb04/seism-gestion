// Viola `no-circular`: cierra el ciclo con `a.ts`.
import { a } from "./a.ts";

export const b = (n: number): number => (n <= 0 ? 1 : a(n - 1));
