/**
 * Términos prohibidos de `npm run nombres-prohibidos`, **sin los nombres en
 * claro** (repo público — AGENTS.md, sección *Nombres prohibidos*, explica el
 * mecanismo completo). Cada entrada guarda solo:
 *
 * - `palabras`: cuántas palabras tiene el término, después de tokenizar
 *   (`scripts/lib/deteccion-nombres.ts`: minúsculas, sin diacríticos, letras
 *   + números + `_`).
 * - `hash`: SHA-256 hexadecimal de esas palabras normalizadas, unidas con un
 *   espacio.
 *
 * De acá **no se puede reconstruir el nombre**: un hash no se revierte. Para
 * sumar un término nuevo hace falta tenerlo aparte (nunca en un archivo de
 * este repo) y calcular su hash con la misma normalización — hay un ejemplo
 * en AGENTS.md. Para confirmar qué nombre corresponde a un hash que saltó en
 * CI, hay que tener la lista en claro (fuera del repo) y volver a hashear
 * cada candidato hasta encontrar el que coincide; el script no lo revela.
 *
 * La única entrada que **no** es un nombre real es la marcada como tal: la
 * usan los fixtures (`tests/fixtures/nombres-prohibidos/`, `npm run
 * nombres-prohibidos:fixtures`) para probar que el mecanismo rechaza y
 * acepta como corresponde, sin poner un nombre real en un archivo de test.
 */

import type { TerminoProhibido } from "./deteccion-nombres.ts";

export const TERMINOS_PROHIBIDOS: readonly TerminoProhibido[] = [
  // Clientes y proyectos reales.
  {
    palabras: 2,
    hash: "5ba5dfb5114b73b50e5b364a529dc4348bf2ccb272bad969f25783308b77e191",
  },
  {
    palabras: 1,
    hash: "856ed7b9e6cbde42ff367a44d319bbd064c516f9d13b4e59efab9ba40b3e33c4",
  },
  {
    palabras: 2,
    hash: "088aa4c28a5aa1797b57867becf7daa75d941940e3262a5b08d0fb2816a03a93",
  },
  {
    palabras: 3,
    hash: "ebb674775c397e701f4e658a104636e54235799a302c503280fd1fdb96d8e6d1",
  },
  {
    palabras: 1,
    hash: "8ba7b8d9886a4124617d2f3e06b0506622bad535a28d7cac80ac5b441fadd7f8",
  },
  {
    palabras: 2,
    hash: "54088ee94a38b896682dad15941279dc88679ed5f2724817cdd6fda620480c0c",
  },
  {
    palabras: 1,
    hash: "b30b17507593aa85bebb960e9ebc4dbbcb63f25b55b1f0af637c3df667587900",
  },
  {
    palabras: 1,
    hash: "bab97235db824904ef5f20f5a2402152fcdbe830084ebc0196e15db3aae398ef",
  },
  // Personas reales.
  {
    palabras: 3,
    hash: "a63bca8c0f7ad161f821831bef31cdfe6a25b96a9b59dc2177e4871d8bc55adf",
  },
  {
    palabras: 5,
    hash: "4c1d9f3da20d22b2f00716a527080274914e6f839581eae92f2c96f1754285fd",
  },
  {
    palabras: 2,
    hash: "056345d7469f50785de43f1549d64e19be23983eb765949a94ca20a7f0311944",
  },
  {
    palabras: 1,
    hash: "3ce71f83253831f5f05467254c0d271a089f1c3103e5e5dd854f6c2282fcbc71",
  },
  {
    palabras: 1,
    hash: "400895aea867eb06a42b24b8320aab613acaaadad12b9d7b29198faa8680e719",
  },
  {
    palabras: 1,
    hash: "085caa96e51d45cd769111154aa794047ed7b97a1c8812ae3f472385eaf262ff",
  },
  // Ficticio, solo para los fixtures (no es un cliente real).
  {
    palabras: 4,
    hash: "3d9e082c31588947c3d5035a75a7c84dee58b932e63f7d1850cb08f37d729076",
  },
];
