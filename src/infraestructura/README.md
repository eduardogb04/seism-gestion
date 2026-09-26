# src/infraestructura

Entorno (validación con Zod), log estructurado (pino) y `arranque/`: el punto
de armado, el único lugar fuera de `src/adaptadores` que importa adaptadores.
Ahí se conecta cada puerto con su adaptador concreto y se arman los casos de
uso que usan `app` y `worker`. El resto de esta carpeta no importa
adaptadores (dependency-cruiser, `npm run limites`; ver
`docs/arquitectura.md` y ADR 0004).

Desde F0-04: `entorno.ts` (el esquema de variables de entorno y su
validación al arrancar) y `version.ts` (cómo se resuelve la versión del
build). Desde F0-24: `log.ts` (el log estructurado: pino, formato y nivel
por entorno, `referencia` por contexto asíncrono con `conReferencia`,
redacción de secretos y datos personales en todo lo que sale) y
`proceso.ts` (excepción o rechazo no capturado → `fatal` con `INF-0001` y
salida con código 1; lo instala `src/instrumentation.ts`). Ver ADR 0021.
`arranque/` llega cuando haya adaptadores.
