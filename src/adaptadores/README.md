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
