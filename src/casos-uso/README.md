# src/casos-uso

Orquestan el dominio contra los puertos. Importan de `dominio` y `puertos`;
nunca de `adaptadores`, `app`, `worker`, `infraestructura` ni de `@prisma/*`
directamente. dependency-cruiser lo hace cumplir (`npm run limites`, ver
`docs/arquitectura.md`).

Desde F0-30: `usuarios/` (`darDeAlta`, `revocar`, `cambiarRol`), el primer
caso de uso. Recibe un `Actor` obligatorio, exige una persona administradora
y activa (`AUT-0003`), no deja el sistema sin administradores (`AUT-0004`) y
corre entero en una transacción (`Transaccional`, `src/puertos/repositorios/`).
Ver ADR 0024 y `tests/casos-uso/usuarios-casos-uso.test.ts`.

Desde F0-25: `salud/listar-salud.ts` (`listarSalud`: última corrida de cada
job, fallidos pendientes y estado de cada integración; nunca lanza). Lo
consumen el panel de salud (F0-26) y el gasto de IA (F0-28).
