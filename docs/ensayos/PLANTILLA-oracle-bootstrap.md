# PLANTILLA — Ensayo de bootstrap de la instancia Oracle (F0-12)

> **Esto es una plantilla en blanco. No es el registro de ningún ensayo: el ensayo todavía no
> ocurrió.** Al 2026-09-15 la instancia no existe (la cuenta de Oracle pide tarjeta y la crea
> Eduardo a mano, decisión D4), así que `infra/oracle/bootstrap.sh` nunca corrió contra una máquina
> real.
>
> **Cómo se usa:** copiá este archivo a `docs/ensayos/AAAA-MM-DD-oracle-bootstrap.md` con la fecha
> del día, completá los campos mientras seguís el `RUNBOOK.md`, sección *4. Oracle: cuenta,
> instancia, red y firewall*, y subilo en un PR. **Los campos se completan con lo que pasó, no con
> lo que tendría que pasar:** si algo falló, se anota que falló. Un ensayo que solo dice "todo bien"
> no sirve para nada.
>
> **No pongas acá la IP de la instancia, tu IP de casa, ni ninguna clave.** El repositorio es
> público. Donde haga falta nombrarlas, escribí `<IP de la instancia>`.

## Quién y cuándo

| | |
|---|---|
| **Quién lo hizo** | |
| **Fecha y hora de inicio** | |
| **Fecha y hora de fin** | |
| **Commit del repositorio** | `` (salida de `git rev-parse --short HEAD`) |
| **Región de origen (*Home Region*)** | |
| **Forma (*shape*) e imagen** | |

## Qué salió

Una línea por paso del RUNBOOK. *Resultado:* **ok** · **ok con desvío** · **falló**.

| Paso del RUNBOOK | Resultado | Cuánto tardó | Qué pasó |
|---|---|---|---|
| 1. Cuenta creada, sin upgrade a pago, con el presupuesto de USD 1 | | | |
| 2. Clave `ed25519` generada | | | |
| 3. Instancia Always Free creada | | | |
| 4. Reintentos por *Out of capacity* (cuántos) | | | |
| 5. Lista de seguridad de la VCN (22 y 80 desde una sola IP) | | | |
| 6. Primera corrida del `bootstrap.sh` | | | |
| 7. Segunda corrida (`Cambios aplicados: 0`) | | | |
| 8. Entrar como `deploy` y `sudo docker run --rm hello-world` | | | |
| 9. `sudo reboot` y todo vuelve solo | | | |

## Verificaciones

Las de la sección 4 del RUNBOOK, *Cómo verificar que salió bien*. Pegá la salida real, recortada,
sin la IP.

| Verificación | ¿Pasó? | Salida |
|---|---|---|
| `Cambios aplicados: 0` en la segunda corrida | | |
| `free -h` muestra 2 GB de swap | | |
| `sudo docker run --rm hello-world` | | |
| `docker compose version` | | |
| `sudo -l -U deploy` → solo `/usr/bin/docker` | | |
| `sudo sshd -T` → `passwordauthentication no` y `permitrootlogin no` | | |
| Regla del puerto 80 antes del `REJECT` en el `INPUT` | | |
| `sudo journalctl --disk-usage` por debajo de 200 MB | | |
| Entrar por SSH con contraseña es rechazado | | |
| Después del reinicio: swap activo y `docker` `active` | | |

## Desvíos respecto del RUNBOOK

Todo lo que no estaba escrito, o estaba escrito distinto de como resultó ser. **Cada línea de acá
se corrige en el `RUNBOOK.md` en el mismo PR**, o no sirvió de nada haber hecho el ensayo.

| Qué decía el RUNBOOK | Qué pasó en realidad | ¿Corregido? |
|---|---|---|
| | | |

## Qué quedó pendiente

- 

## Conclusión

Una o dos frases: ¿la instancia quedó lista para F0-13 (deploy trivial), sí o no?
