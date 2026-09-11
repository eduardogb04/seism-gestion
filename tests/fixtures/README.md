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
- `limites/` — llega en F0-03 (`npm run limites:fixtures`).
