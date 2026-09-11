# ADR 0001 — Excepción puntual a "repo tool-neutral": existe `CLAUDE.md`

**Fecha:** 2026-09-11
**Estado:** Aprobado
**Tarea:** F0-01
**Decide:** DISENO (decisión 10)

## Contexto

DISENO.md, decisión 10, fija el repo como *"tool-neutral, multi-CLI"*: nada de configuración
atada a un editor o a un CLI de agente en particular, para que cualquier agente (Claude Code,
Codex, Antigravity) o cualquier persona pueda clonar y trabajar igual, con `AGENTS.md` como
única puerta de entrada. Claude Code, sin embargo, no lee `AGENTS.md` por convención propia: busca
un archivo llamado `CLAUDE.md` en la raíz. Sin él, una sesión de Claude Code no encuentra las
instrucciones del repo salvo que alguien se lo diga a mano en cada sesión.

## Decisión

Existe `CLAUDE.md` en la raíz, con una única línea que remite a `AGENTS.md` y no contiene ninguna
regla propia:

```
Leé AGENTS.md. Ahí está todo. Este archivo existe solo porque Claude Code lo busca por nombre.
```

Es la única excepción a la decisión 10. Ningún otro archivo de configuración de editor o de CLI de
agente entra al repo.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| No tener `CLAUDE.md` y pedirle a cada agente que lea `AGENTS.md` a mano | Depende de que quien arranca la sesión se acuerde de decirlo cada vez; falla silenciosamente en la primera sesión de alguien nuevo |
| Duplicar las reglas de `AGENTS.md` dentro de `CLAUDE.md` | Dos fuentes de verdad que se desincronizan con el primer PR que actualice solo una |
| Un símlink `CLAUDE.md → AGENTS.md` | No es portable entre Windows y Linux sin configuración extra de git (`core.symlinks`), y complica el checkout en CI |

## Consecuencias

- Se gana: cualquier sesión de Claude Code encuentra el punto de entrada correcto sin
  intervención manual, sin perder la neutralidad real del repo (`AGENTS.md` sigue siendo la única
  fuente de reglas).
- Se pierde: un archivo más en la raíz, pero de una sola línea y sin contenido que mantener.
- Lo hace cumplir la revisión: si `CLAUDE.md` alguna vez creciera con reglas propias, PR rechazado
  por contradecir este ADR.

## Cómo se revierte

Borrar `CLAUDE.md`. No se pierde ninguna regla: todo vive en `AGENTS.md`.
