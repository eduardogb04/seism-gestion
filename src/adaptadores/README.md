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

Desde F0-22: `memoria/auditoria.ts`, doble en memoria de `Auditoria` con
`registrados()` para inspección.

Desde F0-29: `memoria/correo.ts` (doble de `Correo`, con `sembrar()` y
`procesados()`) y `memoria/notificaciones.ts` (doble de `Notificaciones`,
con `enviados()`). Los dos pasan la suite de contrato de
`tests/contratos/`, la misma que va a exigir a Gmail/WhatsApp/Telegram/SMTP
en Fase 1 (`AGENTS.md`, *Cómo se agrega...un adaptador real de un puerto con
suite de contrato*).
