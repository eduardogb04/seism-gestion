// Viola `no-circular`: `a.ts` importa `b.ts`, y `b.ts` importa `a.ts`.
import { b } from "./b.ts";

export const a = (n: number): number => (n <= 0 ? 0 : b(n - 1));
