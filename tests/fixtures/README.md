# tests/fixtures

Archivos que una herramienta **tiene que rechazar**. Nunca corren como test
de negocio: cada subcarpeta tiene su propio script `*:fixtures` que invierte
el código de salida (0 si la herramienta rechazó todo, 1 si aceptó algo).

- `typecheck/` — `any` explícito y variable sin usar (F0-01, `npm run
  typecheck:fixtures`).
- `lint/` — `any` explícito y variable sin usar, mismas reglas que
  `typecheck/` pero por Biome (F0-02, `npm run lint:fixtures`). Tiene su
  propio `biome.json` (con `"root": true`) porque el de la raíz excluye esta
  carpeta del lint normal.
- `limites/` — una carpeta por regla de `.dependency-cruiser.cjs`, con el
  nombre de la regla (F0-03, `npm run limites:fixtures`). Cada carpeta
  replica la estructura `src/...` que la regla necesita y trae archivos que
  la violan y archivos que no (el caso permitido). El script corre
  dependency-cruiser sobre cada carpeta por separado y exige que la rechace
  **su** regla, desde los archivos declarados en
  `scripts/limites-fixtures.ts`.
