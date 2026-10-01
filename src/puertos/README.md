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

Desde F0-30: `repositorios/`, con `usuarios.ts` (`RepositorioUsuarios`: la
lista blanca, email en minúsculas, sin método de borrado: revocar es
`estado: "revocado"`), `sesiones.ts` (`RepositorioSesiones`: el `id` es el
token de 256 bits; `cerrarTodasDe` sí quita las filas, porque una sesión es una
credencial y no un dato de negocio) y `transaccion.ts` (`Transaccional`: corre
un trabajo contra los repositorios en una sola transacción). Adaptadores
Prisma en `src/adaptadores/prisma/`. Ver ADR 0024.

Desde F0-25: `cola-fallidos.ts` (`ColaFallidos { encolar, contarPendientes }`),
`repositorios/corridas-worker.ts` (`RegistroCorridas`) y
`sonda-integracion.ts` (`SondaIntegracion { nombre, probar }`), con
adaptadores de Prisma en `src/adaptadores/prisma/` (una sola implementación
cada uno: sin doble ni suite de contrato todavía).

Desde F0-28: `ia.ts` (`AdaptadorIa`, que devuelve la salida **sin validar**, y `AvisosIa`, el
aviso de tope superado; desde M-05 devuelve `Promise<void>` y no lanza, ADR 0030) y `repositorios/` (`uso-ia.ts`, el registro de uso de IA, y
`configuracion.ts`, la lectura de `configuracion`). El doble de IA está en
`src/adaptadores/ia-doble/`; los repositorios, con Prisma en `src/adaptadores/prisma/`. ADR 0026.

Desde F0-32: `RepositorioUsuarios.listar()` (todos, también los revocados, por
email), para la pantalla de usuarios.

Desde F0-33: `RepositorioUsuarios.crear(actor, usuario)` y
`.actualizar(actor, usuario, accion)` reciben el `Actor` primero y el adaptador
deja la auditoría en la misma transacción; `RepositoriosEnTransaccion` ya no
trae `auditoria`. `RepositorioSesiones` queda sin actor: una sesión es una
credencial (ADR 0024 y 0029).

Desde F0-27: `almacen-documentos.ts` (el almacén de documentos, con la única
validación de claves y `claveDocumento`), con dos adaptadores reales, disco y
s3, que pasan la suite `tests/contratos/almacen-documentos.ts` (ADR 0022).

Desde F1-03: `repositorios/abm.ts`, el puerto genérico de los ABM (ADR 0031).
`EntidadesAbm` dice la forma de los datos de cada entidad y
`RepositoriosEnTransaccion.abm(entidad)` entrega su repositorio: un ABM nuevo
no suma un puerto ni una propiedad a `transaccion.ts`.
