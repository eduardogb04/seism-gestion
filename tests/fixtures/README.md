# tests/fixtures

Archivos que una herramienta **tiene que rechazar**. Nunca corren como test
de negocio: cada subcarpeta tiene su propio script `*:fixtures` que invierte
el código de salida (0 si la herramienta rechazó todo, 1 si aceptó algo).

- `typecheck/` — `any` explícito y variable sin usar (F0-01, `npm run
  typecheck:fixtures`).
- `lint/` — dos fixtures, los dos por Biome (`npm run lint:fixtures`).
  `debe-fallar.ts`: `any` explícito y variable sin usar, mismas reglas que
  `typecheck/` (F0-02); usa el `biome.json` de esta carpeta (con
  `"root": true`) porque el de la raíz excluye `tests/fixtures/` del lint
  normal. `reloj-inyectado/`: la regla del reloj, que marca la global `Date`
  **solo** bajo `src/dominio/**` (F0-18); replica esa estructura y su
  `biome.json` **extiende** el de la raíz, así prueba la regla de verdad y no
  una copia, y trae el caso permitido (`src/adaptadores/`) para detectar si
  la regla se pasa de alcance.
- `limites/` — una carpeta por regla de `.dependency-cruiser.cjs`, con el
  nombre de la regla (F0-03, `npm run limites:fixtures`). Cada carpeta
  replica la estructura `src/...` que la regla necesita y trae archivos que
  la violan y archivos que no (el caso permitido). El script corre
  dependency-cruiser sobre cada carpeta por separado y exige que la rechace
  **su** regla, desde los archivos declarados en
  `scripts/limites-fixtures.ts`.
