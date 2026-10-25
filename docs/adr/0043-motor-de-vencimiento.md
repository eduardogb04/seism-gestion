# ADR 0043 — El vencimiento lo decide una sola función pura del dominio, con la regla en el tipo de servicio

**Fecha:** 2026-10-25
**Estado:** Propuesto
**Tarea:** F4-01
**Decide:** el plan (F4, D1 y D2; a confirmar por Eduardo)

## Contexto

Un trabajo terminado puede vencer: una certificación de camiones, por ejemplo, vale cierto tiempo
desde que se terminó, y menos si el camión es viejo. De esa fecha cuelgan los avisos y los
listados de Fase 4. Hacía falta decidir dónde vive la regla y quién calcula la fecha, para que no
haya dos cuentas que den distinto.

## Decisión

La regla es un dato del **tipo de servicio** y la fecha la decide **una sola función pura**,
`fechaDeVencimiento` (`src/dominio/servicios/vencimiento.ts`); todo lo que necesite un vencimiento
la llama.

- **La regla:** tres columnas opcionales de `tipos_servicio` (migración
  `20261025100000_regla_de_vencimiento`): `vencimiento_meses` (plazo común),
  `vencimiento_meses_antiguos` (plazo para camiones antiguos) y `antiguedad_corte_anios`. Enteros
  positivos; el plazo de antiguos y el corte van juntos o ninguno. Lo validan el ABM (Zod, con el
  mensaje al lado del campo, y un tope de 1200 meses y 100 años) y un CHECK de la base
  (`tipos_servicio_regla_de_vencimiento`), para que tampoco se pueda escribir por otro lado.
- **La función** recibe la fecha de finalización (solo cuenta el día), la regla (`ReglaDeVencimiento`,
  con los nombres de los campos del tipo, así el tipo entero la cumple) y los años del camión, si el
  trabajo tuvo uno. La antigüedad es la de `antiguedadEnAnios` (la de la cisterna si la tiene, si no
  la del tractor) **medida al año de la finalización**. Con más años que el corte, el plazo de
  antiguos; con los mismos o menos, o sin camión, el común. Sin plazo que aplique, `null`: no vence.
- **La suma** es `sumarMeses` de `reloj.ts` (ADR 0012): el día que no existe en el mes destino se
  recorta al último (31 de enero + 1 mes = 28 o 29 de febrero). No hay otra operación de fecha.
- **Sin plazo común pero con el de antiguos** es una regla válida: solo vencen los camiones antiguos.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar la regla en `configuracion` o en una tabla aparte | La regla es de cada vertical; en el tipo se edita con el ABM que ya existe, sin pantalla nueva |
| Calcular el vencimiento en SQL o en cada caso de uso | Dos cuentas terminan dando distinto; en el dominio se prueba con propiedades sin base |
| Una regla de vencimiento como objeto anidado (`antiguos: { meses, corte }`) | Obliga a traducir la fila del tipo; con los mismos nombres de columna, F4-02 le pasa el tipo directo, y el CHECK ya garantiza que van juntos |
| Contar la antigüedad a hoy, como el listado de camiones | El vencimiento de un trabajo no puede cambiar con el paso del tiempo: se mide a la finalización |

## Consecuencias

- Una sola fuente de la fecha; las propiedades de `tests/dominio/vencimiento.test.ts` (nunca antes
  de la finalización, monótona, antiguos según el corte, sin plazo no vence) la sostienen.
- Cambiar la regla de un tipo no recalcula nada guardado: guardar vencimientos es F4-02 y decide
  ahí qué pasa con los ya calculados.
- La función se exporta para F4-02; hasta entonces solo la llaman sus tests (excepción aceptada en
  la ficha de F4-01).
- Lo hacen cumplir: los tests de dominio (propiedades), `tests/casos-uso/abm-tipos-de-servicio.test.ts`
  (validación y CHECK) y el test de migraciones (la migración y su `down.sql`).

## Cómo se revierte

`down.sql` de la migración quita las tres columnas y el CHECK; se sacan los tres campos de
`TIPOS_DE_SERVICIO` y de `EntidadesAbm`, y `vencimiento.ts` con su test. Nada más depende de esto
hasta F4-02.
