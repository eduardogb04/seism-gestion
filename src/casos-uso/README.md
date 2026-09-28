# src/casos-uso

Orquestan el dominio contra los puertos. Importan de `dominio` y `puertos`;
nunca de `adaptadores`, `app`, `worker`, `infraestructura` ni de `@prisma/*`
directamente. dependency-cruiser lo hace cumplir (`npm run limites`, ver
`docs/arquitectura.md`).

Desde F0-28, `ia/`: `interpretar` (la única puerta a la IA: tope de gasto mensual, validación
con el esquema Zod del que llama y registro en `uso_ia` antes de devolver; `IA-0001` e `IA-0002`)
y `gastoDelMes` (gasto del mes contra el tope, para `/salud`). ADR 0026.
