# ADR 0035 — Documentos adjuntos: una fila por archivo, y de qué cuelga lo dice el registro dueño

**Fecha:** 2026-10-02
**Estado:** Aprobado
**Tarea:** F2-05
**Decide:** el plan (F2-05) y el orquestador (R2 a R10 de la ficha); ADR 0022 (el almacén) y ADR 0033 (Servicios)

## Contexto

La cotización se arma afuera (Word, PDF) y se carga al sistema: la cabecera más el documento, que es el detalle.
Es el primer uso del almacén de documentos (ADR 0022) en un registro de negocio, y lo van a repetir las órdenes de
compra, las facturas y los egresos. Había que decidir cómo se guarda el metadato, cómo se valida el archivo, cómo se
baja y qué pasa cuando algo falla a mitad de camino.

## Decisión

**Una tabla `documentos` con el metadato, y el registro dueño apunta a ella con su propio `documento_id`.** Los bytes
van al `AlmacenDocumentos`; en la base quedan la `Referencia`, el nombre original, el tipo MIME y el tamaño, con las
columnas de auditable. No hay columnas polimórficas (`tipo_dueño`/`id_dueño`): "de qué cuelga" es una clave foránea
`ON DELETE RESTRICT` desde cada dueño, así la base impide dejar un documento sin dueño y el dueño sin documento.
`cotizaciones` (servicio, versión, fecha, importe en dos columnas, motivo, observaciones, `documento_id`) es el primero;
`(servicio_id, version)` es único.

- **La pieza reutilizable** está en `src/casos-uso/documentos/`: `validarArchivo` (la extensión del nombre tiene que
  estar en la lista y los primeros bytes tienen que corresponder a esa familia: `%PDF`, `PK\x03\x04` para docx y xlsx,
  `D0 CF 11 E0` para doc y xls, `FF D8 FF`, la firma de PNG; hasta 10 MB, no vacío, nombre de hasta 200 caracteres),
  `registrarDocumento` (guarda los bytes bajo `nuevaClaveDocumento()` y crea la fila **en la transacción del dueño**,
  con `Actor` y auditoría), `marcarDocumentoEliminado` y `descargar`. En la pantalla, `CampoArchivo` y
  `EnlaceDeDescarga` (`src/app/_ui/`), y `FormularioAbm` admite un campo de archivo al final. El tipo MIME que se guarda
  sale de la extensión validada, no de lo que declara el navegador. Sin dependencias nuevas: la firma se compara a mano.
- **Un archivo rechazado vuelve como mensaje al lado del campo**, con todo lo demás que se escribió; el navegador no
  conserva el archivo elegido y el mensaje lo dice.
- **La descarga es `GET /documentos/<id del documento>`** (nunca por la clave del almacén). Sin sesión es un 401 y no sale
  un solo byte; un documento inexistente, dado de baja o que el almacén perdió es 404. Responde con `Content-Type` del
  metadato, `Content-Disposition: attachment` con el nombre **saneado** (sin comillas, barras ni caracteres de control, y
  el nombre completo en `filename*`), `X-Content-Type-Options: nosniff` y `Cache-Control: private, no-store`. `urlTemporal`
  y la ruta `/api/documentos/<clave>` que nombra el adaptador de disco no se usan.
- **La sesión del Route Handler** parte de `src/app/(auth)/sesion-de-cookie.ts`: un Route Handler que importa
  `next/navigation.js` hace fallar `next build` («Could not parse module ... app-router-context.js»), así que
  `sesionActual` salió de `sesion-actual.ts` (que sigue haciendo el `redirect` de las páginas).
- **La versión de una cotización** es la mayor del servicio, también entre las anuladas, más uno, calculada en la
  transacción **después de tomar la fila del servicio** (`SELECT ... FOR UPDATE`): dos altas a la vez se turnan, la
  segunda ve la versión de la primera y, si su formulario se abrió cuando aún era la primera (sin el campo del
  motivo), vuelve con un aviso para cerrar la ventana y reabrirla. El índice único es la red de seguridad.
  Una cotización no se edita; se anula (baja lógica, con la de su documento) y su número no se reutiliza.
- **Cargar la primera pasa el servicio de «Solicitado» a «Cotizado»** en la misma transacción y por el camino de
  siempre (`registrarCambioDeEstado`, el que ya usa `cambiarEstado`: el ciclo del dominio decide y se agrega el evento,
  con la nota `Cotización v<n> cargada`). En otro estado no cambia nada, y anular no devuelve el estado. Un servicio con
  cotizaciones no se da de baja por la regla que ya había (`admiteBaja`: solo en «Solicitado»), porque ningún ciclo vuelve
  a ese estado.
- **El tope de Next.** Las Server Actions cortan el cuerpo en 1 MB; `next.config.ts` lo sube a `11mb` (el tope del
  documento más lo que suma el `multipart`), para que el rechazo de un archivo de más de 10 MB lo dé el caso de uso con su
  mensaje. **Por encima de 11 MB lo corta Next con su error genérico**, sin el formulario ni el mensaje al lado del campo.
- **Los archivos huérfanos se aceptan.** Los bytes se guardan antes de que la transacción del dueño confirme; si falla
  después, el archivo queda en el almacén sin fila que lo nombre. No hay limpieza: es raro, no pierde datos y borrar del
  almacén desde un `catch` agrega un modo de fallar (borrar lo que sí quedó referenciado). Un barrido por referencias, si
  alguna vez molesta, es una tarea aparte.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `documentos` con `tipo_dueño` y `id_dueño` | Sin clave foránea: nada impide un dueño que no existe ni un documento suelto, y "en uso" no se podría consultar |
| Guardar el archivo en la base (`bytea`) | Es lo que el almacén resuelve (ADR 0022); la base crece con lo que no se consulta |
| Validar solo la extensión o el tipo MIME que manda el navegador | Un ejecutable renombrado a `.pdf` pasaría; el navegador dice lo que quiere |
| Una biblioteca de detección de tipos | Dependencia nueva para cinco prefijos que se comparan en una línea |
| Calcular la versión con `max + 1` sin tomar el servicio | Dos altas a la vez leen lo mismo y una cae en el índice único con un error crudo |
| Enlace temporal (`urlTemporal`) para bajar | Quien tenga el enlace baja sin sesión hasta que venza; por ruta propia se exige sesión en cada pedido |
| Borrar del almacén si la transacción falla | Agrega un modo de fallar y no cierra la carrera: el archivo puede estar referenciado por otro intento |

## Consecuencias

- Órdenes de compra, facturas y egresos suman su `documento_id` y llaman a `registrarDocumento` en su transacción; no
  escriben otra validación, otra pantalla de descarga ni otro campo de archivo.
- La base garantiza que un documento con dueño no se borra; el sistema no tiene borrado físico.
- Un archivo de más de 10 MB y hasta 11 MB vuelve con su mensaje; de más de 11 MB, con el error genérico de Next.
- La descarga lee el archivo entero a memoria (hasta 10 MB): alcanza para el tamaño y el uso de hoy.
- Lo hacen cumplir `tests/casos-uso/cotizaciones.test.ts` (versión, motivo, firma y tope, estado, anulación, baja,
  concurrencia), `tests/casos-uso/documentos-pantalla.test.ts` (acciones, descarga, nombre hostil, sin sesión, 404, tope de
  Next), `tests/casos-uso/seed.test.ts` (la semilla) y `tests/e2e/cotizaciones.spec.ts` (de punta a punta, con un archivo
  de ~2 MB).

## Cómo se revierte

Se borran `src/casos-uso/documentos/`, `src/casos-uso/servicios/cotizaciones.ts`, `src/app/documentos/`, la sección
`src/app/servicios/[id]/cotizaciones.tsx`, los dos repositorios y su línea en `transaccion.ts`, `prisma/seed-cotizaciones.ts`
y el `bodySizeLimit`; la migración `20261002180000_documentos_y_cotizaciones` se revierte con su `down.sql`. Los bytes ya
guardados quedan en el almacén. `CampoArchivo`, `EnlaceDeDescarga` y el campo de archivo de `FormularioAbm` pueden quedar:
no cambian lo que hace nada más.
