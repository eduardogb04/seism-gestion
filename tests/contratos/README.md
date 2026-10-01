# tests/contratos

Suites de test compartidas por puerto, que corren tanto contra el doble
(memoria) como contra el adaptador real (Postgres, S3, Gmail, etc.): un
puerto y su doble cumplen el mismo contrato.

Cada archivo exporta una función `suite<Nombre>(nombre, fabrica)` (`describe`
+ `it` de Vitest adentro). La fábrica no expone los métodos de inspección del
doble en memoria (`sembrar`, `enviados`...): devuelve el puerto **y** una
forma de preparar o leer estado (`preparar`, `leerEnviados`...) que un
adaptador real de Fase 1 puede implementar con su propia API, sin heredar
nada del doble. Un archivo por doble, en el proyecto de Vitest que
corresponda (`tests/dominio/` si no necesita red ni base; `tests/casos-uso/`
si necesita Docker), invoca la suite con su fábrica.

Desde F0-29: `correo.ts` (`suiteCorreo`, contrato de `Correo`: idempotencia
por `idExterno`, paginado con `Cursor` verificado con una propiedad de
fast-check) y `notificaciones.ts` (`suiteNotificaciones`, contrato de
`Notificaciones`: título y cuerpo no vacíos, un único destinatario). Los dos
corren hoy contra `src/adaptadores/memoria/` desde `tests/dominio/`; toda
implementación real de Fase 1 (Gmail, WhatsApp, Telegram, SMTP) tiene que
pasar la misma suite (`AGENTS.md`, *Cómo se agrega...un adaptador real de un
puerto con suite de contrato*).

Desde M-05, `suiteNotificaciones` también la corre el adaptador `notificaciones-por-log`
(`tests/dominio/adaptadores-log-notificaciones.test.ts`): el envío queda como una línea `warn` del
log, y la fábrica lo lee de ahí.

Una suite es una función que recibe una fábrica del adaptador; la llama el
archivo de test de cada implementación (AGENTS.md, *Cómo se agrega... un
adaptador que tiene que pasar una suite de contrato*).

Desde F0-27: `almacen-documentos.ts` (`suiteAlmacenDocumentos`), que corren
`tests/casos-uso/almacen-disco.test.ts` y `tests/casos-uso/almacen-s3.test.ts`.
