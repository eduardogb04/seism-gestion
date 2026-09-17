# tests/extraccion

Golden files: regresión de la extracción de documentos.

Es un nivel propio (proyecto `extraccion` de Vitest, F0-14): corre con
`npm run test:todo` o con `npx vitest run --project extraccion`, y no entra en
`npm test`. Hoy tiene el test de humo que confirma que la tanda corre; el arnés
(`compararConGolden`, `npm run test:golden:update`) llega en F0-16 y los casos
reales son Fase 1.
