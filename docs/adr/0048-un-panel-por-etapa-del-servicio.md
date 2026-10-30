# ADR 0048 — Un panel por etapa del servicio

**Fecha:** 2026-10-29
**Estado:** Aprobado
**Tarea:** F6-01
**Decide:** Eduardo (la tanda 6: cada etapa es una pantalla propia) y el orquestador (R1 a R12 de la ficha);
reemplaza la parte de pantalla del ADR 0039 (F3-06), no su recorrido

## Contexto

Desde F3-06 el servicio era una sola página, `/servicios/<id>`, que mostraba u ocultaba secciones según la tabla
`VISTAS` y miraba una etapa pasada con `?etapa=`. Eduardo la rechazó: pidió que cada etapa sea un panel propio,
armado alrededor de lo que se hace en ese momento, con lo fijo (encabezado, sucesos, historial) siempre igual.

## Decisión

Cada etapa del servicio es una ruta con su página, y lo común es un `layout.tsx`.

- **Rutas.** `src/app/servicios/[id]/<segmento>/page.tsx` para `creado`, `cotizado`, `adjudicado`, `en-ejecucion`,
  `finalizado`, `cerrado` y `salida` (perdido, sin respuesta y cancelado comparten panel). El estado ↔ segmento vive
  en una sola tabla (`SEGMENTOS` de `[id]/rutas.ts`, con `rutaDeEtapa` y `etapaDeLaRuta`), que usan la redirección, la
  línea de etapas, el listado y la guarda de cada página.
- **`/servicios/<id>` redirige** al panel de la etapa actual con los mismos parámetros: los enlaces de siempre
  (calendario, inicio, vencimientos, renovación) y las acciones que vuelven a `/servicios/<id>` o con `?error=` siguen
  sirviendo sin tocarlas.
- **Guarda de etapa.** Cada página: si es la etapa actual, panel editable; si el servicio ya la recorrió, el mismo panel
  en solo lectura (sin carga ni transiciones, sin abrir ventanas) con el aviso y «Volver a la etapa actual»; si no,
  redirige a la actual. `?etapa=` desaparece.
- **El layout** (`[id]/layout.tsx`) dibuja el encabezado (código, título, cliente, sitios, responsable, tipo, chip de
  estado con color por etapa, Editar y Dar de baja donde valen), la línea de etapas, la columna «Observaciones y
  sucesos» (debajo del panel en menos de 1024 px) y el historial plegado en un `<details>`. Un layout de Next no recibe
  los parámetros de la dirección: sus botones apuntan al panel de la etapa actual, y es esa página la que dibuja las
  ventanas (`?editar=1`, `?baja=1`, `?pasar=`, `?suceso=1`, `?anularSuceso=`). El servicio se lee una vez por pedida
  (`servicioDe`, con `cache` de React) aunque lo pidan el layout y la página.
- **Piezas del panel** en `src/app/_ui/panel.tsx`: cabecera de panel (qué toca hacer y la línea de contexto), grilla de
  métricas (sobre `TarjetaKpi`), lista de control (con ícono y texto, no solo color) y barra de acciones (una principal,
  las demás secundarias, las salidas negativas aparte con la variante `discreto` de `boton.tsx`). Solo tokens de color.
- **Paneles.** «Creado» y «Cotizado» tienen el suyo (`panel-creado.tsx`, `panel-cotizado.tsx`). De «Adjudicado» en
  adelante y las salidas, hasta F6-04, cada página dibuja las secciones que les asigna `VISTAS` dentro del layout.
- **Sucesos con tipo** (observación, hallazgo, aclaración del cliente): columna `tipo` nula en `servicios_sucesos`;
  nulo se muestra como observación. Las etapas en que se cargan no cambian.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una página con `?etapa=` y secciones que se muestran u ocultan (F3-06) | Es lo que Eduardo rechazó: no es un panel por etapa |
| Un segmento dinámico `[etapa]/page.tsx` | Una sola página con un `switch` por etapa: vuelve a ser la pantalla única, y F6-04 tendría que tocar el mismo archivo para cada panel |
| Leer los parámetros de la dirección en el layout con un componente de cliente | Suma JavaScript propio solo para abrir ventanas que el servidor ya dibuja desde la página |
| Que las acciones redirijan a la ruta de etapa | Habría que tocar cada acción; con la redirección que conserva los parámetros siguen valiendo como estaban |

## Consecuencias

- Cada panel es un archivo: F6-04 reemplaza las secciones de una etapa sin tocar las demás ni el layout.
- Un enlace a una etapa que el servicio no alcanzó no rompe: lleva a la actual.
- Las ventanas del encabezado y de la columna se abren sobre el panel de la etapa actual aunque se esté mirando una
  recorrida.
- Lo hacen cumplir `tests/e2e/etapas.spec.ts` (rutas, paneles, lo que no se ve, solo lectura, redirección),
  `tests/casos-uso/sucesos.test.ts` (tipo con y sin valor), `tests/dominio/proteccion-administracion.test.ts` (cada
  `page.tsx` nueva pide la sesión) y `colores-por-nombre` (solo tokens).

## Cómo se revierte

Borrar las carpetas de etapa, `layout.tsx`, `panel*.tsx` y `rutas.ts`, y volver `[id]/page.tsx` a la página única con
`VISTAS` completa. La columna `tipo` se quita con el `down.sql` de `20261029100000_tipo_de_suceso`.
