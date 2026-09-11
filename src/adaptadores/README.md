# src/adaptadores

Implementaciones concretas de los puertos: `prisma/`, `disco/`, `s3/`,
`ia-doble/`, `identidad-google/`, `identidad-falsa/`, `memoria/`. Importan de
`dominio`, `puertos` e `infraestructura`; nunca de `app` ni de `casos-uso`
(dependency-cruiser lo hace cumplir desde F0-03).

Vacío hasta el lote 2 (F0-08 agrega `prisma/`).
