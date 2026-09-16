# ADR 0012 — Bootstrap de la instancia Oracle: Ubuntu, Docker oficial y `sudo` acotado

> Archivo: `docs/adr/0012-bootstrap-de-la-instancia-oracle.md`. Numeración correlativa, nunca se
> reutiliza. Un ADR aprobado no se edita: si cambia la decisión, se escribe otro que lo reemplaza y
> este se marca *Reemplazado por NNNN*.

**Fecha:** 2026-09-15
**Estado:** Propuesto
**Tarea:** F0-12
**Decide:** el plan (F0-12: qué tiene que dejar el script) y DISENO (sección 7, *El entorno de
prueba: Oracle Always Free*: la máquina nunca compila, nada vive ahí, el levantado se documenta
como script reproducible); el cómo, el dev de F0-12

## Contexto

F0-12 pide un script que deje una instancia Always Free recién creada lista para correr
contenedores, **idempotente**, y con una lista concreta de cosas resueltas: sistema actualizado,
Docker y compose, usuario `deploy` sin contraseña con `sudo` limitado a docker, 2 GB de swap, el
puerto 80 abierto en el firewall local de la imagen, y `journald` con rotación. La instancia todavía
no existe: la cuenta de Oracle pide tarjeta y la crea Eduardo a mano (D4). O sea que el script se
escribe **antes** de poder correrlo contra una máquina real, y cada decisión tiene que quedar
escrita para que la primera corrida no sea una sorpresa.

Tres cosas del contexto mandan sobre el resto: la máquina tiene **1 GB de RAM** y nunca compila;
**nada irrecuperable vive ahí** (si Oracle la recupera, se levanta otra con este mismo script); y
el repositorio es **público**, así que el archivo no puede llevar ninguna IP, usuario ni clave real.

## Decisión

**Un solo `bash` idempotente (`infra/oracle/bootstrap.sh`) sobre Ubuntu LTS, con Docker del
repositorio oficial de Docker, y el usuario de despliegue sin grupo `docker` pero con `sudo`
acotado a ese binario.** En detalle:

1. **La imagen es Ubuntu LTS (Canonical), no Oracle Linux.** El script lee `/etc/os-release` y
   **se niega a correr** en otra cosa, en vez de hacer algo a medias. Ubuntu es lo que hace que el
   resto de las decisiones sean directas: repositorio oficial de Docker, `sshd_config.d`,
   `iptables-persistent`.
2. **Docker viene del repositorio oficial de Docker** (`docker-ce`, `docker-ce-cli`,
   `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`), con la clave en
   `/etc/apt/keyrings/docker.asc` y la lista en `/etc/apt/sources.list.d/docker.list`. El
   `docker.io` de Ubuntu no trae el plugin `compose` v2, y F0-13 levanta la app con
   `docker compose`.
3. **El usuario de despliegue no entra al grupo `docker`: entra a `sudo`, y solo para
   `/usr/bin/docker`** (`/etc/sudoers.d/seism-deploy`, validado con `visudo --check` antes de
   moverlo a su lugar). Las dos formas son equivalentes a ser root en la máquina; esta deja la
   puerta con nombre y cada invocación en el log de `sudo`. `docker compose` es un subcomando del
   mismo binario, así que una sola regla alcanza. **Consecuencia para F0-13: en el servidor los
   comandos son `sudo docker …`, no `docker …`.**
4. **La clave es ed25519 y es un parámetro.** El script la exige (`--clave-publica`, archivo o
   texto), rechaza cualquier otro tipo y rechaza también la clave de ejemplo de su propia ayuda.
   **La agrega, no la reemplaza**: volver a correrlo con otra clave suma una llave más, que es como
   F0-13 va a poner la clave exclusiva de CI. Contraseña bloqueada (`passwd --lock`) y
   `PasswordAuthentication no` en `/etc/ssh/sshd_config.d/**10**-seism.conf`: el `10-` es a
   propósito, porque sshd usa el **primer** valor que encuentra y la imagen de OCI trae un
   `50-cloud-init.conf`. Antes de recargar sshd corre `sshd -t`; si no valida, no se recarga nada
   (recargar una configuración rota es quedarse afuera de la máquina).
5. **El firewall local se toca con `iptables` + `netfilter-persistent`, que es el mecanismo que la
   imagen ya trae** (no `ufw`, que se pelea con lo que viene puesto). La regla se inserta **antes
   del primer `REJECT`/`DROP` del `INPUT`** —después del rechazo no la mira nadie— y se persiste en
   `/etc/iptables/rules.v4`. Ese paso corre **antes** de instalar Docker: `netfilter-persistent
   save` guarda la tabla entera, y con Docker corriendo guardaría también sus cadenas dinámicas.
6. **La lista de seguridad de la VCN no la toca el script**: es la consola de Oracle o la CLI de
   OCI con credenciales, y el script corre adentro de la instancia, sin credenciales de la cuenta.
   Queda como paso del `RUNBOOK.md` (sección 4), que es donde vive lo manual.
7. **Idempotencia por comparación de estado, no por marcas.** Cada paso mira cómo está la máquina
   antes de tocar nada (`iptables -C`, `dpkg-query`, comparar el contenido del archivo,
   `swapon --show`, `systemctl is-enabled`). El script cuenta lo que cambió e imprime al final
   **`Cambios aplicados: N`**: la segunda corrida tiene que decir **0**. Eso es lo que se verifica,
   y no hace falta leer el script para verificarlo.
8. **El swap es un archivo (`/swapfile`), 2 GB, con su entrada en `/etc/fstab`.** Se escribe con
   `dd` y no con `fallocate` (un archivo con agujeros no sirve como swap en varios sistemas de
   archivos). Si existe con otro tamaño, se rehace.
9. **`journald` con techo y vencimiento** (`SystemMaxUse=200M`, `MaxRetentionSec=1month`,
   `Storage=persistent`) en un *drop-in*, `/etc/systemd/journald.conf.d/10-seism.conf`: no se edita
   el archivo del sistema.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Oracle Linux 9 (la imagen "de la casa" en OCI) | Docker no publica paquetes para Oracle Linux; quedaría `podman` con alias, o el `docker-engine` de `ol9_addons`, más viejo y sin plugin `compose`. Además el firewall sería `firewalld`, otra herramienta más que aprender y documentar |
| `docker.io` de los repositorios de Ubuntu | No trae `docker compose` v2 (el plugin), que es lo que usa F0-13. Instalarlo aparte es la misma ceremonia sin el respaldo del repositorio oficial |
| Meter al usuario en el grupo `docker` | Mismo poder efectivo (root), pero sin registro: nada queda en el log y la puerta no tiene nombre. Con `sudo` acotado se ve quién corrió qué |
| `ufw` para abrir el puerto | La imagen de OCI trae reglas de `iptables` cargadas y `iptables-persistent`. `ufw` encima de eso deja dos fuentes de verdad, y la que se ve no siempre es la que manda |
| `cloud-init` (user-data al crear la instancia) | Corre una sola vez, al crear; no es idempotente ni se puede volver a correr para arreglar una máquina. Y el criterio de F0-12 es explícitamente "correrlo dos veces no rompe nada" |
| Ansible o Terraform | Una herramienta más que instalar, aprender y versionar, para **una** máquina desechable. DISENO pide un script reproducible, no una plataforma de infraestructura |
| Que el script configure la VCN con la CLI de OCI | Necesita credenciales de la cuenta de Oracle adentro de la instancia. Es exactamente lo que el repositorio público y el diseño no quieren |
| Un marcador de pendiente, o un registro de ensayo vacío pero con pinta de hecho | La instancia no existe todavía: lo que hay es **una plantilla** de registro (`docs/ensayos/`), en blanco y marcada como tal. Inventar un ensayo que no pasó sería mentir en el repositorio |
| `fallocate` para el archivo de swap | Deja agujeros en algunos sistemas de archivos y `swapon` los rechaza |
| Un solo archivo `sshd_config` editado a mano | Se pisa con lo que trae la imagen y con lo que escriba `cloud-init`. El *drop-in* `10-` gana siempre y se ve de dónde salió |

## Consecuencias

- **Se gana** una máquina que se levanta igual todas las veces, y que se puede volver a levantar
  igual cuando Oracle recupere la instancia por uso bajo (que va a pasar: DISENO lo anota como
  riesgo). El script es la documentación de qué hay en el servidor.
- **F0-13 hereda dos cosas:** los comandos en el servidor son `sudo docker …`, y la clave exclusiva
  de CI se agrega corriendo este mismo script con `--clave-publica`.
- **El script no se prueba en CI.** No hay dónde: haría falta una instancia. Lo que CI garantiza
  hoy es que el archivo entra al repositorio sin secretos (gitleaks). La prueba de verdad es la
  corrida manual de Eduardo, y queda registrada en `docs/ensayos/`.
- **Abrir el puerto 80 en el `INPUT` no es lo que deja entrar a un contenedor publicado.** Docker
  desvía el tráfico de un puerto publicado por `nat`/`FORWARD` (cadenas `DOCKER` y `DOCKER-USER`) y
  **no pasa por `INPUT`**. La regla se pone igual porque es el criterio de F0-12 y porque cubre
  cualquier proceso que escuche en el host; pero **quién puede llegar al puerto 80 lo decide la
  lista de seguridad de la VCN**, que es donde está el "solo desde la IP de Eduardo". Si algún día
  hiciera falta filtrar contenedores desde adentro, es `DOCKER-USER`, y es otra decisión.
- **Si Oracle cambiara su imagen de Ubuntu** (por ejemplo, a `nftables` puro sin
  `iptables-persistent`), el paso del firewall es el primero que se rompe. El script falla ahí, con
  mensaje, y no sigue.
- **Lo hace cumplir:** la corrida del propio script (se niega a correr fuera de Ubuntu, valida la
  clave, valida el sudoers, valida sshd) y su línea final `Cambios aplicados: 0` en la segunda
  corrida. No hay test automático.

## Cómo se revierte

- **Otra distribución:** cambian tres pasos (el repositorio de Docker, el firewall y el nombre del
  servicio de ssh). El resto —swap, usuario, sudoers, journald— es igual. Sería un ADR nuevo.
- **Grupo `docker` en vez de `sudo`:** una línea del script (`usermod -aG docker`) y borrar
  `/etc/sudoers.d/seism-deploy`. Hay que tocar también los comandos de F0-13.
- **Sin script (una lista de pasos a mano):** contradice DISENO sección 7 explícitamente. No es una
  reversión, es abandonar el criterio.
