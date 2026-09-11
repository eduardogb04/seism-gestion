# src/casos-uso

Orquestan el dominio contra los puertos. Importan de `dominio` y `puertos`;
nunca de `adaptadores`, `app`, `infraestructura` ni de `@prisma/*`
directamente (dependency-cruiser lo hace cumplir desde F0-03).

Vacío hasta que exista dominio y puertos que orquestar (lote 5 en adelante).
