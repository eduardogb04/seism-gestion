# src/infraestructura

Entorno (validación con Zod), log estructurado (pino) y `arranque/`: el punto
de armado, el único lugar fuera de `src/adaptadores` que importa adaptadores.
Ahí se conecta cada puerto con su adaptador concreto y se arman los casos de
uso que usan `app` y `worker`. El resto de esta carpeta no importa
adaptadores (dependency-cruiser, `npm run limites`; ver
`docs/arquitectura.md` y ADR 0004).

Desde F0-04: `entorno.ts` (el esquema de variables de entorno y su
validación al arrancar) y `version.ts` (cómo se resuelve la versión del
build). El log llega en F0-24. Desde F0-27, `arranque/almacen.ts`: elige el
almacén de documentos (disco o s3) según `ALMACEN` (ADR 0022).
