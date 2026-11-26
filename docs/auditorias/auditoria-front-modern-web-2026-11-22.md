# Auditoría del front contra *modern-web-guidance* — 2026-11-22

> Auditoría **estática**: lectura de código y consultas a la skill `modern-web-guidance`
> (plugin de GoogleChrome, guías versión `2026_11_10-47b4c80e`). No se levantó la app, no se
> corrieron tests ni builds y no se tocó código. Las correcciones van en otra tanda, una vez
> aprobado este informe.
>
> Alcance: `src/app/` (≈11.200 líneas: `_ui/`, paneles por etapa de `servicios/[id]/`,
> listados ABM, calendario, tablero, egresos, administración) y los adaptadores de fecha que
> alimentan la pantalla (`src/adaptadores/reloj/`, `src/adaptadores/prisma/conversiones.ts`).

## Resumen ejecutivo

El front tiene buenas bases: casi todo es HTML de servidor que anda sin JavaScript, los colores
salen de tokens con contraste AA verificado por test, el foco visible es global, los iconos van
con texto para lectores de pantalla, no hay `innerHTML` y la descarga de adjuntos sanea las
cabeceras. Las brechas importantes están en **cuatro piezas compartidas** que repite cada
pantalla, así que corregirlas una vez arregla toda la app:

1. **Fecha de "hoy" en hora de Argentina (alta, bug probable).** El reloj real lee la zona
   horaria de la máquina, y la imagen Docker (Alpine) no fija ninguna: corre en UTC. Desde las
   21:00 de Argentina, "hoy" pasa a ser mañana (vencidos, días de atraso, mes del tablero), y los
   instantes que se guardan quedan corridos 3 h.
2. **La ventana (`Ventana`, 31 archivos la usan) no es un diálogo modal de verdad (alta).** Es un
   `<div role="dialog">` sin foco contenido: con Tab se sale a la página de atrás, Escape solo
   anda si el foco está dentro de un formulario y al cerrar el foco no vuelve al botón que la
   abrió. La guía `dialog` pide `<dialog>` nativo con `showModal()`.
3. **El formulario del molde (`FormularioAbm`) no lleva el foco al primer error (alta)** ni
   marca los campos obligatorios (`required`). Quien usa teclado o lector de pantalla no se
   entera de qué falló.
4. **Falta el enlace "Saltar al contenido" (alta, nivel A de WCAG):** antes del contenido hay
   hasta 20 paradas de Tab (menú, tema, salir) en cada página.

Después vienen brechas medias que **justifican el rediseño del front** propuesto en la auditoría
de arquitectura del 10/11: el layout depende solo del ancho de la ventana del navegador (ningún
*container query*), aunque los paneles viven dentro de columnas de ancho variable; la navegación
mezcla `<a>` común (recarga completa, incluido todo el menú lateral) con `Link` de Next; no hay
estados de carga (`loading.tsx`); la tabla compartida no tiene `<caption>`, `scope` ni
contenedor desplazable con teclado; y las páginas no mandan cabeceras de seguridad (CSP,
`frame-ancestors`, `Referrer-Policy`).

| Prioridad | Cantidad | Esfuerzo total estimado |
|---|---|---|
| Alta | 5 | ≈ 3–4 días |
| Media | 9 | ≈ 4–5 días |
| Baja | 9 | ≈ 1–2 días |

Esfuerzo: **S** = hasta 2 h · **M** = medio día a 1 día · **L** = más de 1 día.

## Brechas — prioridad alta

### A1. El reloj del sistema usa la zona horaria del host; el contenedor corre en UTC

- **Dónde:** `src/adaptadores/reloj/sistema.ts:28-36` y `:51` (`getFullYear()`, `getHours()`…
  sobre `new Date()`); `Dockerfile:66-88` (etapa `final`, sin `TZ`); lo consumen
  `src/infraestructura/arranque/armado.ts:168`, `almacen.ts:27` y `salud.ts:45`.
- **Hoy:** `crearRelojSistema()` arma la `FechaHora` civil con los componentes **locales** del
  proceso. ADR 0012 define que todo el dominio trabaja en fecha civil argentina, y
  `adaptadores/prisma/conversiones.ts:38-39` convierte esa fecha a instante pegándole `-03:00`.
  En Windows (`npm run dev`) la máquina está en hora argentina y todo cuadra; en la imagen
  `node:24-alpine` sin `TZ` el proceso corre en UTC.
- **Qué indica la guía:** `coordinate-global-events` y `capture-location-agnostic-data`:
  *"identify time zones by IANA name … and never by a fixed UTC offset"*; la fecha civil se saca
  de un instante con una zona explícita (`Temporal.Now.plainDateTimeISO(zona)` /
  `toZonedDateTimeISO(zona)`), no de la zona implícita del entorno.
- **Impacto:** de 21:00 a 23:59 (hora argentina) el sistema cree que ya es el día siguiente:
  un vencimiento figura "Vencido" un día antes, el atraso suma un día, el tablero cambia de mes
  el último día a las 21 h, y cada suceso, cobro o cambio de estado se guarda con un instante
  3 h posterior al real (y se muestra 3 h tarde).
- **Recomendación:** que el reloj real pida la fecha civil **en una zona IANA explícita**,
  `America/Argentina/Catamarca` (la base es Andalgalá), con `Temporal` en el adaptador (el
  ADR 0012 ya prevé que entre por ahí; en Node 24 hace falta `temporal-polyfill`, que va del
  lado del servidor y no pesa en el navegador) o, sin dependencia, con
  `Intl.DateTimeFormat("en-CA", { timeZone, … })`. Además, `ENV TZ=America/Argentina/Catamarca`
  en la imagen como red de seguridad, no como solución.
- **Esfuerzo:** S–M (un adaptador, su test con zona fija y la línea del Dockerfile).
- **Confirmar con la app andando:** `docker compose exec app date` y un suceso cargado después
  de las 21:00.

### A2. `Ventana` no es un diálogo modal: foco suelto, Escape parcial, sin retorno de foco

- **Dónde:** `src/app/_ui/ventana.tsx:23-39` (la usan 31 archivos: alta/edición/baja de cada
  ABM, pagos, cobros, transiciones y renovaciones de los paneles por etapa);
  `src/app/_ui/formulario-abm.tsx:235-239` (el único Escape).
- **Hoy:** un `<div class="fixed inset-0">` con un `<section role="dialog" aria-modal="true">`
  dibujado por el servidor según la URL. La página de atrás no queda inerte (Tab sale de la
  ventana y recorre el listado tapado por el velo), sigue desplazándose detrás, Escape solo
  cierra si el foco está dentro de `FormularioAbm` (las ventanas sin formulario, como "El egreso
  ya está pagado" o un error, no cierran con Escape) y al cerrar no se devuelve el foco al botón
  que la abrió.
- **Qué indica la guía:** `dialog` (Regla 1): *"Use `<dialog>` opened as a modal … with
  `showModal()`"*; *"DON'T add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling or
  an `Esc` handler"*; el navegador da página inerte, foco contenido, `::backdrop`, Escape y
  retorno de foco. *"DON'T open it with `show()` or the `open` attribute."* Para el scroll de
  atrás: `dialog:modal { overscroll-behavior: contain }` y lo mismo en `::backdrop`.
- **Impacto:** es el patrón de interacción principal de todos los paneles por etapa. Teclado y
  lector de pantalla se pierden detrás de la ventana; incumple WCAG 2.4.3 (orden del foco) y
  2.1.2 en la práctica.
- **Recomendación:** un componente de cliente que envuelva el contenido en `<dialog>`, llame a
  `showModal()` al montarse y, en el evento `close`, navegue a `rutaAlCerrar` (la URL sigue
  siendo la fuente de verdad, así el patrón "ventana por parámetro" no cambia). `closedby="any"`
  si se quiere cerrar tocando afuera. Sin JavaScript se conserva el dibujo actual como respaldo.
  Las 31 llamadas no cambian.
- **Esfuerzo:** M.
- **Confirmar con la app andando:** dónde queda el foco después de cerrar con *Cancelar* (un
  `Link` de Next con `scroll={false}`).

### A3. `FormularioAbm`: después de un envío rechazado el foco no va al primer error

- **Dónde:** `src/app/_ui/formulario-abm.tsx:222`, `:242-244`, `:283`;
  `src/app/_ui/campo-texto.tsx:21-25`.
- **Hoy:** la acción del servidor devuelve los errores por campo y el formulario se vuelve a
  dibujar con `aria-invalid` y `aria-describedby` (bien), pero el foco se queda en el botón de
  enviar, que además estuvo `disabled` durante el envío (al deshabilitarse, el navegador suelta
  el foco al `<body>`). Los mensajes por campo no se anuncian; solo el error general tiene
  `role="alert"`.
- **Qué indica la guía:** `forms` §4: *"DO move focus to the first invalid field (or an error
  summary) when a form submission fails validation."* `accessible-error-announcement`:
  *"After a failed submit, move focus to the first invalid field so that its error is announced
  instead."*
- **Impacto:** todos los ABM, cobros, pagos, cotizaciones y transiciones usan este molde. Quien
  no ve la pantalla no sabe que el guardado falló ni dónde.
- **Recomendación:** al volver `estado.errores` con contenido, enfocar el primer control con
  `aria-invalid="true"` (o un resumen de errores con enlaces si son muchos). Es un efecto en un
  único componente.
- **Esfuerzo:** S.

### A4. Falta "Saltar al contenido" antes del menú lateral

- **Dónde:** `src/app/_ui/marco.tsx:174-226`.
- **Hoy:** cada página detrás del login arranca con la barra lateral (hasta 17 enlaces), el
  selector de tema (3 botones), el correo y *Salir* antes del `<main>`.
- **Qué indica la guía:** `accessibility`, *Skip links*: *"Provide skip links prior to repeated
  content like site headers with navigation"* (WCAG 2.4.1, nivel A); apuntar al `<h1>` con
  `tabindex="-1"` para que lo sigan las lupas.
- **Impacto:** unas 20 pulsaciones de Tab en cada página para llegar al contenido.
- **Recomendación:** un `<a href="#contenido">` visualmente oculto hasta recibir foco, primero
  en el marco; `id="contenido"` en el `<h1>` (o en el `<main>`).
- **Esfuerzo:** S.

### A5. Campos obligatorios sin `required` ni marca visible

- **Dónde:** `src/app/_ui/formulario-abm.tsx:83-89` (props comunes de cada control);
  `src/app/_ui/campo-texto.tsx:17-19` (etiqueta).
- **Hoy:** la obligatoriedad solo la conoce el servidor; ningún control lleva `required` y la
  etiqueta no dice que el campo es obligatorio. La persona se entera recién después de enviar.
- **Qué indica la guía:** `forms` §2: *"DO indicate clearly which fields are required both
  visually in the label and programmatically with the `required` attribute."*
  `required-field-feedback`: estilar con `:user-invalid` (Baseline amplio desde 2023) para no
  marcar errores antes de que la persona toque el campo.
- **Impacto:** idas y vueltas al servidor en cada formulario; el lector de pantalla no anuncia
  "obligatorio".
- **Recomendación:** que la definición del campo (`CampoAbm`) exponga si es obligatorio y que
  `Control` lo pase como `required` + asterisco con `aria-hidden` y una nota "Los campos con * son
  obligatorios". La validación del servidor sigue siendo la que manda.
- **Esfuerzo:** M (toca la definición del molde y sus tests).

## Brechas — prioridad media

### M1. Layout solo con *media queries* del viewport; ningún *container query*

- **Dónde:** `src/app/servicios/[id]/layout.tsx:205` (`lg:grid-cols-[minmax(0,1fr)_20rem]`),
  `src/app/_ui/formulario-abm.tsx:245` (`md:grid-cols-2` dentro de una ventana de `max-w-xl`),
  `src/app/servicios/[id]/estado-del-servicio.tsx:61`, tablero (`xl:grid-cols-*`). Cero usos de
  `@container` en `src/app/`.
- **Hoy:** el ancho real del panel depende de la barra lateral (60 o 16 rem) y de la columna de
  sucesos (20 rem), pero los cortes miran el ancho de la ventana. A 1.024–1.280 px con el menú
  expandido el panel de la etapa queda en ~420 px y conserva el diseño "ancho"; el formulario
  pasa a dos columnas aunque la ventana mida 576 px.
- **Qué indica la guía:** `responsive-design`: *"Use `@container` queries to create
  component-driven responsive layouts that adapt to their parent container's size rather than
  the viewport"* (ver también `size-aware-styling`).
- **Impacto:** los paneles por etapa que pidió Eduardo (cada uno con su UI) no pueden ser
  piezas reutilizables que se acomoden solas donde se las ponga. Es la brecha que más pesa para
  el rediseño del front.
- **Recomendación:** `@container` (Tailwind 4 trae `@container` y variantes `@md:`) en el
  contenedor del panel, de la ventana y de las tarjetas; dejar los cortes del viewport solo para
  el armado general (menú lateral).
- **Esfuerzo:** M (piezas de `_ui/`), L si se rehace cada panel.

### M2. Navegación mezclada: el menú lateral y varios enlaces internos recargan la página entera

- **Dónde:** `src/app/_ui/marco.tsx:200` (todas las secciones del menú), `listado-abm.tsx:243-247`
  (paginado), `tabla.tsx:76` (orden), `calendario/page.tsx:74-89` y `calendario/grilla.tsx:94`,
  `servicios/[id]/layout.tsx:181,197`. 35 `<a>` internos contra 62 `Enlace` (`Link`).
- **Hoy:** cada clic en el menú hace una navegación de documento completa: vuelve a bajar y
  ejecutar el JavaScript de Next, re-hidrata y pierde el estado del cliente; los `Link` en
  cambio navegan con la carga útil del servidor y se precargan.
- **Qué indica la guía:** `performance` (navegaciones y LCP de la página siguiente) y
  `improve-next-page-load-performance`: precargar lo que la persona va a abrir después;
  *"DO NOT use speculation rules on Single Page Applications"*, así que en el App Router la vía es
  el `Link` del framework.
- **Impacto:** navegación más lenta y desigual (unas secciones van rápido, otras recargan), justo
  en el recorrido más usado.
- **Recomendación:** usar `Enlace` para toda ruta interna (dejar `<a>` común solo para descargas
  y `/salir`); el menú se puede dibujar igual desde el servidor.
- **Esfuerzo:** S–M.
- **Confirmar con la app andando:** medir la diferencia en el panel *Performance* del navegador.

### M3. Sin estados de carga (`loading.tsx`, `Suspense`)

- **Dónde:** no existe ningún `loading.tsx`, `error.tsx` ni `<Suspense>` en `src/app/`.
- **Hoy:** cada página espera todas sus consultas antes de dibujar nada. Con `Link`, el clic no
  muestra respuesta hasta que llega la página entera.
- **Qué indica la guía:** `interaction-paint-timing` (el tiempo hasta que una interacción o una
  navegación del cliente pinta contenido nuevo) y `performance` (INP): dar respuesta visual
  inmediata a la interacción.
- **Impacto:** sensación de botón "que no anduvo" en los paneles con más consultas (tablero,
  servicio con facturas, cobros, OC y sucesos), y doble clic.
- **Recomendación:** `loading.tsx` con esqueleto en `servicios/[id]/` y en el inicio; `Suspense`
  alrededor de las partes lentas del panel (la columna de sucesos, las tablas de facturación);
  `error.tsx` por segmento con `ErrorEnPantalla`.
- **Esfuerzo:** M.

### M4. La tabla compartida no tiene `<caption>`, `scope` ni contenedor desplazable con teclado

- **Dónde:** `src/app/_ui/tabla.tsx:104-123` (y `calendario/grilla.tsx:67-70`, que sí tiene
  `caption`).
- **Hoy:** `<div class="overflow-x-auto">` sin `tabindex`, `role` ni nombre; `<th>` sin `scope`;
  la tabla no tiene nombre accesible. En el celular las tablas anchas se desplazan dentro de su
  caja, pero con teclado no se puede llegar a las columnas de la derecha si no hay enlaces.
- **Qué indica la guía:** `responsive-table`: *"Add a `tabindex="0"` attribute to the container
  … Give the wrapper a `role="region"` … with an accessible name"*; `accessibility`: *"Do use the
  `scope` attribute on `<th>` elements"* y `<caption>` como nombre de la tabla.
- **Impacto:** todos los listados y tablas de los paneles.
- **Recomendación:** `Tabla` con prop `titulo` (obligatoria) que va a `<caption>` (visible u
  oculta) y nombra la región; `scope="col"` en las cabeceras.
- **Esfuerzo:** S en el componente, M sumando el título en cada uso.
- **Nota:** el orden por columna con `<a>` en el `<th>` es correcto **para este diseño**: ordena
  en el servidor cambiando la URL. La guía `sortable-table` exige `<button>` solo para el orden
  en el cliente. No es brecha.

### M5. Calendario: el tipo de cada entrada se distingue solo por color

- **Dónde:** `src/app/calendario/grilla.tsx:13-18` y `:94-105`.
- **Hoy:** dentro de la grilla del mes, vencimiento, factura, egreso e inicio solo se diferencian
  por el color del borde izquierdo (`border-serie-1..4`). Lo dice el texto en la lista de abajo y
  en el filtro, pero no en la celda.
- **Qué indica la guía:** `forms` §2 y `color`: *"use non-color visual cues (icons, text) to
  communicate state (don't rely on color alone)"* (WCAG 1.4.1).
- **Impacto:** con daltonismo o impreso en blanco y negro no se sabe qué es cada entrada del día.
- **Recomendación:** un icono por tipo (como los del menú) y el tipo en texto oculto para el
  lector de pantalla dentro de cada entrada.
- **Esfuerzo:** S.

### M6. Las páginas no mandan cabeceras de seguridad

- **Dónde:** `next.config.ts:58-62` (sin `headers()`); solo la descarga de documentos
  (`src/app/documentos/cabeceras.ts:40-45`) manda `nosniff`.
- **Hoy:** sin `Content-Security-Policy`, `frame-ancestors`/`X-Frame-Options`,
  `Referrer-Policy`, `X-Content-Type-Options` ni `Permissions-Policy` en las páginas.
- **Qué indica la guía:** `security`: *"Set `Content-Security-Policy: frame-ancestors 'none'`
  alongside `X-Frame-Options: DENY`"*, *"`Referrer-Policy: strict-origin-when-cross-origin`"*,
  *"`X-Content-Type-Options: nosniff`"*, *"Disable unused browser features"*, y una CSP propia en
  modo *report-only* antes de exigirla.
- **Impacto:** hoy corre todo local (menor exposición), pero la app maneja importes, cobros y
  sesiones: con un deploy futuro quedaría expuesta a *clickjacking* y sin defensa en
  profundidad contra XSS.
- **Recomendación:** las cabeceras estáticas en `headers()` de `next.config.ts` ya mismo (S); la
  CSP con *nonce* para los scripts de Next en una segunda pasada (M).
- **Esfuerzo:** S + M.

### M7. Los errores de campo aparecen solo después de ir al servidor

- **Dónde:** `src/app/_ui/formulario-abm.tsx:91-121` (sin `pattern`, `minLength`, `maxLength`;
  los números son `type="text"` con `inputMode`, que está bien).
- **Hoy:** formato de importe, CUIT, número entero o decimal: todo se valida en el servidor y
  vuelve.
- **Qué indica la guía:** `forms` §4: *"DO use native constraints: `required`, `minlength`,
  `maxlength`, `pattern`"*, con `:user-invalid` para no gritar antes de tiempo
  (`validate-input-after-interaction`).
- **Impacto:** menor que A3/A5; sí ahorra idas y vueltas en los formularios largos (cotización,
  factura).
- **Recomendación:** exponer en la definición del molde el `pattern` que ya valida el dominio para
  los tipos con formato fijo (CUIT, importe, número), y mostrar el mensaje con `:user-invalid`.
- **Esfuerzo:** M.

### M8. Ventana de la página no limita el desplazamiento ni se adapta al teclado del celular

- **Dónde:** `src/app/_ui/ventana.tsx:23-28`.
- **Hoy:** el velo es `fixed inset-0`, la página de atrás sigue desplazándose con la rueda o el
  dedo sobre el velo.
- **Qué indica la guía:** `prevent-page-scroll-under-modal-dialog` (citada en `dialog`):
  `overscroll-behavior: contain` en `dialog:modal` y en `::backdrop`; *"DON'T lock scrolling with
  `overflow: hidden` … on `html` or `body`"*.
- **Impacto:** en el celular se pierde la posición del listado al desplazar dentro de una ventana
  larga.
- **Recomendación:** sale gratis con A2; si A2 se demora, `overscroll-behavior: contain` en la
  ventana.
- **Esfuerzo:** S (incluido en A2).

### M9. El gráfico de líneas distingue las series solo por color

- **Dónde:** `src/app/_ui/grafico.tsx:116-125` y la leyenda `:151-162`.
- **Hoy:** con más de una serie, las líneas solo cambian de color y la leyenda es una muestra de
  color; para el lector de pantalla hay tabla oculta (bien).
- **Qué indica la guía:** `color`: no depender solo del color para comunicar.
- **Impacto:** a quien no distingue colores le cuesta leer el tablero.
- **Recomendación:** marcador distinto por serie (círculo, cuadrado…) o rótulo al final de cada
  línea.
- **Esfuerzo:** S.

## Brechas — prioridad baja

| Id | Dónde | Hoy | Guía | Recomendación | Esf. |
|---|---|---|---|---|---|
| B1 | `src/adaptadores/prisma/conversiones.ts:34-35`, `src/adaptadores/identidad-google/verificar-id-token.ts:41` | Desplazamiento fijo `"-03:00"` repetido en dos adaptadores | `coordinate-global-events`: zona por nombre IANA, nunca desplazamiento fijo | Una sola constante de zona (`America/Argentina/Catamarca`) junto con A1. Argentina no tiene horario de verano desde 2009: el riesgo es latente | S |
| B2 | `src/adaptadores/prisma/abm/egresos.ts:27-28`, `repositorio.ts:235-236` | `new Date(`${dia}T00:00:00.000Z`)` armado a mano | `capture-location-agnostic-data`: *"DO NOT construct `Date` objects from hand-built ISO strings"* | Es correcto para columnas `date` de Prisma; documentar la decisión o pasar a `Temporal.PlainDate` cuando entre Temporal | S |
| B3 | `src/app/globales.css:61-62`, `src/app/layout.tsx:22` | `color-scheme: light` por defecto en `:root` y sin `<meta name="color-scheme">` | `dark-mode`: `<meta name="color-scheme" content="light dark">` y `color-scheme: light dark` en `:root` | Poner el `meta` según la cookie (`light`, `dark` o `light dark`). El tema por cookie del servidor ya evita el parpadeo, mejor que el `localStorage` que sugiere la guía | S |
| B4 | `src/app/globales.css` | Casillas y radios nativos con el color del sistema | `dark-mode` / `brand-consistent-forms`: `accent-color` | `accent-color: var(--color-acento)` en `:root` | S |
| B5 | `src/app/_ui/listado-abm.tsx:139`, `calendario/page.tsx:91-112` | Buscador y filtros en `<form>` suelto; las casillas de tipo del calendario sin `<fieldset>`/`<legend>` | `forms` §1: *"DO wrap search forms and filtering controls in a `<search>` element"*; agrupar con `fieldset` | `<search>` alrededor; `fieldset` con `legend` "Tipos" en el calendario | S |
| B6 | `src/app/layout.tsx:22` | `lang="es"` | `forms` §2 / `accessibility`: definir el idioma | `lang="es-AR"`: los selectores de fecha y la voz del lector toman la variante | S |
| B7 | `src/app/_ui/campo-texto.tsx:63-66`, `calendario/grilla.tsx:52-54,125-131` | Casilla de 16 px; "Cotizar renovación" y "+N" en `text-xs` dentro de la grilla | `forms` §5 / `accessibility` (*Target sizes*): objetivo mínimo 24 px (WCAG 2.5.8) | Agrandar el área táctil con *padding* | S |
| B8 | `src/app/_ui/formulario-abm.tsx:283-285` | Mientras envía, el botón se deshabilita sin cambiar de texto | `forms` §4 (deshabilitar tras un envío válido está bien) y §7 (anunciar el resultado con `role="status"`) | Texto "Guardando…" en el botón y aviso de éxito con `role="status"` | S |
| B9 | `src/app/(auth)/cookies.ts:20-21` | Cookies `seism_sesion` y `seism_login` sin prefijo | `security`: *"Name first-party session cookies with the `__Host-` prefix"* | `__Host-seism_sesion` cuando `secure` sea verdadero (entornos no locales) | S |

## Lo que ya cumple

- **Contraste y tema por tokens.** Todos los colores son tokens de `globales.css`, con versión
  oscura de los mismos nombres; `tests/dominio/temas.test.ts` exige contraste AA y
  `colores-por-nombre.test.ts` prohíbe colores sueltos (`color`, `dark-mode`).
- **Tema sin parpadeo:** se elige en el servidor por cookie y llega en `data-tema`; "Como el
  sistema" usa `prefers-color-scheme`; el selector usa `aria-pressed` y anda sin JavaScript.
- **Foco visible global** (`:focus-visible` con contorno de 2 px y desplazamiento) y foco de la
  fila enlazada dibujado alrededor de toda la fila (`accessibility`, *Focus indicators*).
- **Movimiento:** todas las transiciones van con `motion-safe:` (respeta
  `prefers-reduced-motion`).
- **Etiquetas:** cada control tiene `<label for>` con `useId()`; errores enlazados con
  `aria-describedby` y `aria-invalid`; la lista ordenable usa `fieldset`/`legend`
  (`forms` §2).
- **Tipos de control correctos:** `type="date"` nativo; importes y números como
  `type="text"` + `inputMode="decimal|numeric"` (la guía desaconseja `type="number"`);
  `type="search"` en el buscador; botones auxiliares con `type="button"`.
- **Estado no solo por color** en la lista de control del panel (icono + texto oculto), en la
  variación de las tarjetas KPI (signo + icono) y en "Vencido".
- **Gráficos accesibles:** SVG con `role="img"` y nombre, tabla oculta con los datos, `viewBox`
  que reserva el espacio (sin CLS), dibujado en el servidor sin JavaScript de cliente.
- **Línea de etapas** con `<nav aria-label>`, `<ol>` y `aria-current="step"`, como el ejemplo de
  `forms` §11.
- **Menú lateral:** botón con `aria-expanded`/`aria-controls`, cierra con Escape y devuelve el
  foco al botón; objetivos de 44 px en pantallas táctiles (`pointer-coarse:`).
- **Landmarks:** `<nav>`, `<header>`, `<main>` (uno por página), `<aside>` para sucesos;
  historial plegado con `<details>`/`<summary>` nativos.
- **Rendimiento base:** fuente del sistema (sin fuentes web ni su CLS), sin imágenes en el camino
  del LCP, muy pocos componentes de cliente, gráficos en el servidor.
- **Seguridad del cliente:** ningún `dangerouslySetInnerHTML`, `innerHTML` ni `eval`; React
  escapa todo el texto. La descarga de adjuntos sanea el nombre (caracteres de control, comillas,
  barras), usa `filename*` RFC 6266, `nosniff` y `Cache-Control: private, no-store` (correcto
  para datos privados según `performance`). Cookies de sesión `httpOnly` y `SameSite=Lax`.
  Formularios con `POST` para mutaciones y `GET` para buscar y filtrar.
- **Fechas en el dominio:** tipo civil propio sin `Date`, reloj inyectado y aritmética entera
  (ADR 0012), coherente con la idea de `capture-location-agnostic-data` de separar fecha civil
  de instante.

## Lo que no se puede confirmar sin la app andando

- **A1:** la zona horaria real del contenedor (`date` dentro de `app`) y si hay sucesos ya
  guardados con 3 h de corrimiento.
- **A2 / A3:** dónde queda el foco después de cerrar una ventana con `Link` y después de un envío
  rechazado; si `autoFocus` dispara al abrir una ventana por navegación del cliente.
- **Contraste real** de estados combinados (chip "cotizado" `text-aviso` sobre `bg-aviso-suave`,
  "Vencido" sobre `superficie-alta` en la grilla): el test valida pares de tokens, conviene una
  pasada con Lighthouse o axe en claro y oscuro.
- **Core Web Vitals medidos** (LCP, INP, CLS) en el tablero y el panel de un servicio con muchas
  facturas; el costo real de las recargas completas de M2.
- **Comportamiento en *forced colors*** (Windows de alto contraste): no hay reglas
  `forced-colors`; chips y barra de etapas usan borde además de fondo, pero hay que verlo.
- **Lector de pantalla real** (NVDA): anuncio de `aria-live` de IVA en vivo y del aviso de ajuste.

## Cómo encaja con la auditoría de arquitectura del 10/11

Las brechas altas y medias se concentran en el **molde de UI** (`Ventana`, `FormularioAbm`,
`Tabla`, `Marco`) y en cómo se arman los paneles. Corregirlas en el front actual es posible y
barato para A1, A3, A4, M4–M6; pero A2, M1, M2 y M3 piden cambiar cómo se construye un panel
(componente de cliente para el diálogo, *container queries*, `Link` en todos lados, estados de
carga y `Suspense` por sección). Eso es justamente el rediseño del front propuesto: conviene
decidirlo antes de tocar estas cuatro, para no hacerlas dos veces. A1 (fecha en hora argentina)
no depende del rediseño y conviene corregirla ya.

## Guías consultadas

`forms`, `required-field-feedback`, `accessible-error-announcement`, `dialog`,
`sortable-table`, `responsive-table`, `dark-mode-toggle`, `dark-mode`, `color`,
`responsive-design`, `performance`, `improve-next-page-load-performance`,
`capture-location-agnostic-data`, `coordinate-global-events`, `security`, `accessibility`.
Búsquedas que sumaron referencias sin abrirse completas: `prevent-page-scroll-under-modal-dialog`,
`validate-input-after-interaction`, `size-aware-styling`, `interaction-paint-timing`,
`brand-consistent-forms`.
