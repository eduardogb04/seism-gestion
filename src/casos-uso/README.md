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

Desde F0-32: `usuarios/` suma `listar`, `formularios.ts` (lo que llega de los
formularios, con Zod: `AUT-0008`) y `roles.ts`; `revocar` y `cambiarRol`
invalidan la caché de sesiones de ese usuario (`invalidarUsuario`). `sesion/`
suma `acceso.ts`: la decisión de acceso de administrador y el `Actor` que sale
de la sesión. Ver ADR 0028.

Desde F0-33: toda escritura recibe `Actor` como **primer parámetro obligatorio**
y su nombre empieza con `crear`, `guardar`, `dar`, `revocar`, `cambiar`,
`marcar` o `registrar`; `tests/dominio/tipos/` lo rechaza si no (llamar sin
actor no compila, y `firmas-de-escritura.test.ts` lista las firmas de esta
carpeta). Los casos de uso ya no llaman a `auditoria.registrar` para usuarios:
el repositorio lo hace con el actor que reciben. Ver ADR 0029 y *Cómo se
agrega...un caso de uso que escribe* en `AGENTS.md`.
