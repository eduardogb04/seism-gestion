# src/adaptadores

Implementaciones concretas de los puertos: `prisma/`, `disco/`, `s3/`,
`ia-doble/`, `identidad-google/`, `identidad-falsa/`, `memoria/`. Importan de
`dominio`, `puertos` e `infraestructura`; nunca de `casos-uso`, `app` ni
`worker`. Fuera de esta carpeta, solo `infraestructura/arranque` los importa
(el punto de armado). dependency-cruiser lo hace cumplir (`npm run limites`,
ver `docs/arquitectura.md`).

Desde F0-08: `prisma/generado/`, el cliente que escribe `prisma generate`
(en `postinstall` o con `npm run db:generar`). **No se versiona y no se edita**:
nada escrito a mano va en esa carpeta. El código propio que use el cliente
(repositorios, la semilla) llega en las tareas siguientes, en `prisma/` al lado
de `generado/`. Ver `docs/convenciones-base.md` y ADR 0008.

Desde F0-19: `memoria/`, con los primeros adaptadores de `src/puertos/`:
`secuencias.ts` (contador en memoria, uno por prefijo y año) y
`generador-id.ts` (UUIDs con `node:crypto` — no es un doble de test, es la
implementación real; alcanza para lo que sigue).

Desde F0-28: `ia-doble/` (doble determinista del puerto de IA: responde por una tabla de casos
fijada al construirse, error explícito si la pregunta no está), `prisma/uso-ia.ts` y
`prisma/configuracion.ts` (los repositorios de `src/puertos/repositorios/`), `prisma/fecha-hora.ts`
(`FechaHora` civil argentina → instante `timestamptz`) y `log/avisos-ia.ts` (el aviso de tope de IA
por el log, hasta que el puerto de notificaciones esté en `main`). ADR 0026.
