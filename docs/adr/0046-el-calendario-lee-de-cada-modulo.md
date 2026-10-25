# ADR 0046 — El calendario lee de cada módulo y no guarda nada propio

**Fecha:** 2026-10-25
**Estado:** Propuesto
**Tarea:** F4-04
**Decide:** el plan (F4, módulo C; a confirmar por Eduardo)

## Contexto

Hacía falta un solo lugar donde ver cuándo entra y sale plata y qué vence: los vencimientos de
los trabajos (F4-02), las facturas con saldo, los egresos sin pagar y los inicios estimados de
los servicios adjudicados (F3-02).

## Decisión

`/calendario` no tiene tabla propia: el caso de uso `src/casos-uso/calendario/` arma el mes con
una consulta por tipo de entrada, cada una sobre el módulo dueño del dato.

- Facturas y egresos salen de `facturasPorCobrar` y de `pagos.porPagar`, los mismos que *Por
  cobrar* y *Por pagar*: el saldo de cada entrada es el que ya calculan, nunca una suma nueva.
- Los vencimientos pendientes (`RepositorioVencimientos.pendientesEntre`) y los inicios estimados
  (`RepositorioServicios.inicioEstimadoEntre`, solo los que hoy están «Adjudicado») son las dos
  consultas nuevas, de lectura.
- Una entrada es vencida si su fecha es anterior a hoy (reloj inyectado): todas están pendientes
  por construcción. Los vencimientos de trabajo y de contrato son el mismo tipo.
- El mes (`?mes=`) y el filtro (`?tipo=`, uno o varios) van en la dirección.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una tabla `calendario` que cada módulo alimenta | Duplica datos que ya existen y se desincroniza al cobrar, pagar o corregir una fecha. |
| Una consulta SQL única con `UNION` de los cuatro orígenes | Obliga a repetir en SQL la regla de saldo de F2-07 y F3-07. |

## Consecuencias

- Lo que se ve es siempre lo que muestran los módulos de origen.
- Las facturas y los egresos con saldo se traen enteros y se filtran por mes en memoria: alcanza
  para el volumen de la empresa; si deja de alcanzar, el filtro por rango se agrega a esas dos
  consultas.
- Un tipo de entrada nuevo es una consulta más en `calendario.ts` y un color en `grilla.tsx`.
  Lo hace cumplir `tests/casos-uso/calendario.test.ts`.

## Cómo se revierte

Se borran `src/casos-uso/calendario/`, `src/app/calendario/`, la entrada del menú y las dos
consultas de lectura de los repositorios. Ningún dato ni migración depende de esto.
