# src/adaptadores

Implementaciones concretas de los puertos: `prisma/`, `disco/`, `s3/`,
`ia-doble/`, `identidad-google/`, `identidad-falsa/`, `memoria/`. Importan de
`dominio`, `puertos` e `infraestructura`; nunca de `casos-uso`, `app` ni
`worker`. Fuera de esta carpeta, solo `infraestructura/arranque` los importa
(el punto de armado). dependency-cruiser lo hace cumplir (`npm run limites`,
ver `docs/arquitectura.md`).

Vacío hasta el lote 2 (F0-08 agrega `prisma/`).
