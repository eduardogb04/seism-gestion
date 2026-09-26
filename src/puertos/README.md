# src/puertos

Interfaces: repositorios, almacén de documentos, IA, correo, notificaciones,
identidad, reloj, generador de id, secuencias. Solo importan de `dominio`.

Cada puerto tiene un doble (en `src/adaptadores/memoria/` o similar) y, donde
corresponda, un adaptador real. Las suites de contrato en `tests/contratos/`
corren contra los dos (vacío todavía: `tests/contratos/README.md` dice que
espera a que un puerto tenga más de una implementación).

Desde F0-19, los dos primeros: `secuencias.ts` (el número de
`CodigoLegible`, con doble en memoria) y `generador-id.ts` (el UUID de
`Identificador<Marca>`, con adaptador de `node:crypto` — no hace falta un
doble de test distinto: generar un UUID no depende de dónde se guarda).

Desde F0-22: `auditoria.ts` (`Auditoria { registrar(r: RegistroAuditoria):
Promise<void> }`, con doble en memoria en
`src/adaptadores/memoria/auditoria.ts` con `registrados()` para
inspección; el adaptador de Prisma llega en F0-30). Ningún puerto de acá
declara un método de borrado físico (`eliminar`, `borrar`, `delete`,
`remove`, `destroy`, `purgar`): lo prueba
`tests/dominio/puertos-sin-borrado.test.ts` (regla no negociable 16 de
`AGENTS.md`).

Desde F0-29: `correo.ts` (`Correo { listarNuevos(desde: Cursor, limite?):
Promise<{ mensajes, cursor }>; marcarProcesado(idExterno) }`, idempotente
por `idExterno`) y `notificaciones.ts` (`Notificaciones { enviar(destinatario:
Actor, mensaje) }`, un único destinatario por aviso: dirigidas, no
difundidas). Dobles en `src/adaptadores/memoria/{correo,notificaciones}.ts`;
las suites de contrato de `tests/contratos/` son la base que Gmail, WhatsApp,
Telegram y SMTP (Fase 1) van a tener que pasar.
