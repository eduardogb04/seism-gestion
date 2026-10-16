# ADR 0040 — Temas por colores con nombre, íconos de Lucide y gráficos de visx

**Fecha:** 2026-10-16
**Estado:** Propuesto
**Tarea:** F3-05
**Decide:** el orquestador (resoluciones R1 a R6 de la ficha)

## Contexto

Las pantallas usaban la paleta cruda de Tailwind (`bg-gray-100`, `text-red-800`...) y no había
modo oscuro. F3-05 pide tema claro, oscuro y el del sistema operativo, elegible y recordado por
navegador, con contraste AA, una barra lateral con íconos y gráficos para el inicio (F3-08).

## Decisión

Los colores son **nombres de rol** (`fondo`, `superficie`, `texto-suave`, `acento`, `peligro`,
`menu`, `serie-1`...) definidos **una sola vez** en `src/app/globales.css`: el tema claro en
`@theme` y el oscuro en un bloque `@variant dark` de `:root`, con los mismos nombres.

- La variante `dark` es un `@custom-variant` sobre `data-tema` en `<html>`: `oscuro`, o `sistema`
  con `prefers-color-scheme: dark`. El bloque oscuro se escribe una vez y Tailwind lo emite para
  los dos casos.
- El tema y el menú contraído se guardan en las cookies `tema` (`claro|oscuro|sistema`, por
  defecto `sistema`) y `menu` (`contraido|expandido`), un año, `SameSite=Lax`. Las escriben dos
  **Server Actions** (`_ui/acciones-de-preferencias.ts`, con sesión); el layout las lee con
  `cookies()`, las valida con Zod (un valor desconocido vale el de por defecto) y pone `data-tema`
  desde el servidor: la página llega con su tema, sin parpadeo. Al guardar, Next vuelve a dibujar
  layout y página con la cookie nueva: cambia sin recargar, y sin JavaScript también anda (es un
  formulario).
- Íconos: `lucide-react` 1.49.0, importados por nombre. Gráficos: `@visx/scale`, `@visx/shape`,
  `@visx/axis` y `@visx/group` 4.0.0: SVG dibujado en el servidor, coloreado con clases del tema
  (`fill-serie-1`).

Lo hacen cumplir dos tests de dominio: `tests/dominio/temas.test.ts` lee los dos temas **de
`globales.css`** y exige contraste WCAG (4.5 para texto, 3 para bordes de controles y series) en
cada par que se usa; `tests/dominio/colores-por-nombre.test.ts` falla si un archivo de `src/app/`
usa la paleta cruda, `white` o un hex.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Los valores en un módulo TS y `globales.css` generado o validado contra él | Dos lugares; el test lee directamente lo que usa el CSS, y ningún código de `src/` necesitaría el módulo |
| Cookie escrita desde el navegador (`document.cookie`) | El repo no carga los tipos del DOM (`lib: ES2023`; sumarlos rompe tipos de Node en otros tests) y Biome lo marca; además sin JavaScript no anda |
| `light-dark()` en cada variable | Más corto, pero depende de `color-scheme` y de lo que haga el compilador de CSS con él; el atributo es explícito y se prueba en el e2e |
| Recharts | Pesa varias veces lo que visx y dibuja en el cliente |

## Consecuencias

- Una pantalla nueva no elige colores: usa los nombres, y en los dos temas se ve bien. Si alguien
  escribe `bg-gray-100`, el test lo frena nombrando archivo y línea.
- Cambiar un color es tocar una línea de `globales.css`; si rompe el contraste, el test lo dice.
- Leer `cookies()` en el layout hace dinámicas todas las rutas (ya lo eran por la sesión).
- `_ui/` suma tres componentes de cliente (`barra-lateral`, `selector-de-tema`,
  `preferencias-en-pantalla`): lo controla `tests/dominio/marco.test.ts`.

## Cómo se revierte

Los nombres quedan; se cambian sus valores en `globales.css`. Para sacar el oscuro, se borra el
bloque `@variant dark` y el elegidor de la cabecera de `marco.tsx`; para cambiar de librería de
gráficos, solo `_ui/grafico.tsx`.
