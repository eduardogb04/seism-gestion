# src/app

Next.js (App Router). Solo habla con `casos-uso`, `puertos` e
`infraestructura`. Los adaptadores le llegan a través del punto de armado
(`infraestructura/arranque`), nunca importándolos directo. Del `dominio` solo
lee tipos, con `import type`; para escribir pasa por un caso de uso.
dependency-cruiser lo hace cumplir (`npm run limites`, ver
`docs/arquitectura.md` y ADR 0004).

Desde F0-04: `layout.tsx` (el layout raíz mínimo que exige el App Router),
`page.tsx` (la página de inicio) y `api/salud/route.ts` (el latido público,
`{ ok: true, version }`). `src/instrumentation.ts`, en la raíz de `src/`, es
parte de esta entrada: valida el entorno al arrancar (ADR 0005).

Desde F0-32: `administracion/` (inicio y `usuarios/`: lista, alta, revocar y
cambiar rol con Server Actions y formularios HTML, sin JavaScript de cliente).
Toda página de ahí llama a `accesoDeAdministrador()` antes de leer datos; un
operador ve `AUT-0003`. Ver ADR 0028.

Desde F0-26: `salud/` (`/salud`, el panel de salud: cada job con su última corrida y
su color, fallidos pendientes, integraciones y gasto de IA). Server Component, sin
`"use client"`, sin `<script>` ni librerías de UI; se recarga con F5. Empieza con
`await accesoDeAdministrador()` como las páginas de administración; `/api/salud`
sigue pública. El color lo trae ya decidido `listarSalud`: la página solo lo muestra.

Desde F1-02: `globales.css` (Tailwind 4 por CSS, importado en `layout.tsx`) y
`_ui/`: `Marco` (menú lateral y cabecera con *Salir*, que cada página de detrás
del login renderiza después de su control de acceso), `Tarjeta` (pantallas sin
marco: entrar y sus errores) y los componentes de las pantallas (`Boton`,
`CampoTexto`, `Selector`, `Tabla`, `ErrorEnPantalla`). Todo es HTML del
servidor: ningún archivo lleva `"use client"`, salvo `formulario-abm.tsx`
(`tests/dominio/marco.test.ts`).

Desde F1-03 (ADR 0031): `catalogo/`, los ABM. `_abm/` es el molde —la pantalla
(`paginas.tsx`) y las acciones (`acciones.ts`) de cualquier ABM— y cada entidad
tiene su carpeta (`grupos/`) con una `page.tsx` de pocas líneas: llama a
`sesionExigida()` antes que nada (los catálogos los ve cualquier usuario activo)
y le pasa la definición al molde. Alta, edición y baja (F1-09) son una `Ventana`
de `_ui/` sobre ese mismo listado, según `?nuevo=1`, `?editar=<id>` o `?baja=<id>`.
En `_ui/`, `ListadoAbm` y `FormularioAbm`: este es de cliente (`useActionState`) para volver con lo escrito
y el mensaje al lado del campo, y funciona igual sin JavaScript. Ver *Cómo se
agrega...un ABM* en `AGENTS.md`.
