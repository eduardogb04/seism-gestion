# tests/extraccion

Golden files: regresión de la extracción de documentos.

Es un nivel propio (proyecto `extraccion` de Vitest, F0-14): corre con
`npm run test:todo` o con `npx vitest run --project extraccion`, y no entra en
`npm test`.

- `_arnes/golden.ts` (F0-16): `compararConGolden(nombre, valor)` serializa
  `valor` determinísticamente (claves ordenadas, rechaza cualquier `Date`) y
  lo compara con `golden/<nombre>.json`. Si el golden falta, falla y **no lo
  crea**; eso solo lo hace `npm run test:golden:update`, a propósito y
  avisando en pantalla — CI nunca corre ese comando. `_arnes/golden.test.ts`
  prueba el arnés mismo, contra una carpeta temporal.
- `ejemplo.test.ts` + `golden/ejemplo.json`: el caso de ejemplo con un objeto
  fijo, para demostrar que el arnés compara de verdad (editar el golden a
  mano rompe el test).
- Los casos reales de extracción de documentos son Fase 1.

**Cómo se agrega un golden nuevo:** escribí el test con
`compararConGolden("<nombre>", valorFijo)` (sin golden todavía: va a fallar),
corré `npm run test:golden:update` una vez para que lo escriba, revisá el
diff de `golden/<nombre>.json` a mano y commiteá los dos juntos.
