# RUNBOOK — manual de operaciones humanas

> Todo lo que solo puede hacer una persona, paso a paso. Cada paso dice **en qué pantalla se
> hace, qué se pega dónde, y cómo verificar que salió bien**. Ninguna tarea cierra si dejó un paso
> manual sin documentar acá.
>
> Prueba de fuego: dentro de tres meses, sin acordarse de nada, Eduardo tiene que poder seguirlo y
> llegar al mismo lugar.
>
> **Nunca se escriben valores de secretos acá.** Solo sus nombres y dónde viven.

## Índice

1. Prerrequisitos de la máquina
2. Repositorio y GitHub
3. Proteger la rama principal
4. Oracle: cuenta, instancia, red y firewall
5. Secretos en CI (nombres)
6. Deploy: qué hacer si falla, cómo volver atrás
7. Proyecto de Google y pantalla de consentimiento
8. Postgres gratuito del ensayo
9. Cloudflare R2
10. Secretos del servidor (nombres)
11. Usuarios: alta, revocación, cambio de rol
12. Si Oracle recupera la instancia
13. Si un secreto entró al repo
14. Probar la imagen Docker en tu máquina
15. La imagen publicada en GHCR: hacerla pública y la retención

---

## 1. Prerrequisitos de la máquina

**Qué hace falta:** Node 24 (ver `.nvmrc`), git, **WSL** (en Windows, antes de Docker Desktop),
Docker Desktop corriendo, GitHub CLI autenticado. Docker hace falta para la base local (desde F0-08),
para la sección 14 y **para `npm test`** (desde F0-09, ver *Docker para los tests* más abajo).

**Cómo verificar:**
```
node --version        → v24.x (.nvmrc pide 24)
git --version
wsl --status          → muestra la distribución y la versión 2 (solo Windows)
docker run hello-world     → "Hello from Docker!"
gh auth status              → "Logged in to github.com"
```

Node 24 corre `.ts` directo (type stripping nativo, sin `tsx` ni `ts-node`): `node
scripts/sin-any.ts` funciona tal cual, sin paso de compilación previo.

### WSL (Windows, una sola vez, antes de Docker Desktop)

Docker Desktop en Windows corre sobre WSL 2. **Síntoma si falta:** al abrir Docker Desktop aparece
el cartel *"WSL not installed"* y Docker no arranca.

1. Menú Inicio → escribí `PowerShell` → clic derecho → *Ejecutar como administrador*.
2. Pegá `wsl --install` y Enter. Tarda unos minutos; al final pide reiniciar.
3. **Reiniciá la máquina.**
4. Abrí Docker Desktop (la primera vez pide aceptar sus términos) y esperá a que el ícono de la
   barra diga *running*.

**Cómo verificar:** `docker run hello-world` imprime `Hello from Docker!`.

**Si falla:** si `wsl --install` dice que la virtualización está deshabilitada, hay que activarla
en el firmware de la máquina (BIOS/UEFI: *Intel VT-x* o *AMD-V/SVM*) y repetir. Si Docker Desktop
sigue con el cartel después de reiniciar, `wsl --update` en PowerShell como administrador y abrirlo
de nuevo.

### Docker para los tests (desde F0-09)

`npm test` corre el test de migraciones, que levanta su propio Postgres 16 en un contenedor
(Testcontainers) y lo borra al terminar. No usa la base de compose ni `.env`, pero **necesita
Docker Desktop corriendo**. En Windows, Testcontainers lo encuentra solo, sin configurar nada.

1. Abrí Docker Desktop y esperá a que el ícono de la barra diga *running*.
2. Parado en la carpeta del repo: `npm test`.

**Cómo verificar que salió bien:**
- `npm test` termina con `Test Files … passed` y ningún `failed`. La primera vez tarda más (baja la
  imagen de Postgres y la de Ryuk, el recolector de Testcontainers).
- Unos segundos después de terminar, `docker ps -a` no muestra contenedores `postgres:16…` de la
  prueba ni `testcontainers-ryuk-…` (los de compose, si los levantaste, siguen ahí).

**Si falla:**
- `Could not find a working container runtime strategy` o un error de conexión con Docker al
  empezar `tests/casos-uso/migraciones.test.ts` → Docker Desktop no está corriendo (o todavía está
  arrancando). Abrilo y repetí.
- El test de migraciones en rojo con Docker andando → no es la máquina: `schema.prisma` y las
  migraciones no coinciden, o un `down.sql` no revierte bien. `docs/convenciones-base.md`, *El test
  de migraciones*, explica cada mensaje.

### La base local (desde F0-08)

Postgres 16 en un contenedor, definido en `docker-compose.yml`. No hace falta instalar Postgres.
Las credenciales son de desarrollo, ficticias, y ya están en `.env.example`.

1. Docker Desktop corriendo.
2. Parado en la carpeta del repo:
   ```
   docker compose up -d --wait     # levanta Postgres y espera a que esté sano
   cp .env.example .env            # si todavía no tenés .env (cmd: copy .env.example .env)
   npm run db:migrate              # aplica las migraciones
   ```

**Cómo verificar que salió bien:**
- `docker compose ps` muestra el servicio `postgres` con estado `Up … (healthy)` y el puerto
  `127.0.0.1:5432->5432/tcp`.
- `npm run db:migrate` termina con `All migrations have been successfully applied.` (o, si ya
  estaba al día, `No pending migrations to apply.`).
- `docker compose exec postgres psql -U seism -d seism_gestion -c "\dt"` lista `configuracion` (y
  `_prisma_migrations`, el registro de Prisma).

**Revertir la última migración** (desde F0-09): `npm run db:migrate:down`. Imprime
`db:migrate:down: revertida <carpeta> …`. `npm run db:migrate` la vuelve a aplicar. Si dice que no
hay migraciones aplicadas, no había nada que revertir. Nunca se cambia la base con SQL a mano
(`docs/convenciones-base.md`).

**Sembrar datos mínimos** (desde F0-10): `npm run db:seed`, después de `npm run db:migrate`.
Idempotente: correrlo dos veces (`npm run db:seed` otra vez) deja la base igual. Hoy carga una sola
clave de `configuracion` (`ia.tope_mensual_usd` en `"0"`); en el servidor exige
`SEED_PERMITIDO=si` además de `APP_ENTORNO=servidor`, para que no se corra ahí por accidente.

**Apagarla:** `docker compose down` (los datos quedan en el volumen `seism-gestion_postgres-datos`).
`docker compose down -v` la apaga **y borra el volumen**: la próxima vez arranca vacía.

**Si falla:**
- `Entorno inválido: db:migrate no arranca.` y una lista → falta `.env` o le falta la variable que
  nombra (`DATABASE_URL`, `APP_ENTORNO`): copiá `.env.example` a `.env`. Es a propósito: sin
  `DATABASE_URL` válida no arranca ni la app ni ningún script de base.
- `Can't reach database server at localhost:5432` → la base no está levantada o todavía no está
  sana: `docker compose up -d --wait` y `docker compose ps`.
- `docker compose up` dice que el puerto `5432` está ocupado → hay otro Postgres escuchando en esta
  máquina (uno instalado aparte u otro contenedor). Apagalo y repetí.
- `unhealthy` en `docker compose ps` → `docker compose logs postgres` dice por qué.

## 2. Repositorio y GitHub

**Cuándo hace falta:** ya se hizo el 2026-09-11 (repo creado antes del kickoff). F0-01 la
**verifica** y deja registro; si algo faltara, se repone acá con `gh`.
**Quién:** Eduardo (dueño de la cuenta `eduardogb04`).
**Necesitás antes:** cuenta personal de Eduardo en GitHub, `gh` autenticado con permisos de admin
sobre el repo.

### Estado verificado (2026-09-11, en F0-01)

- Repo `eduardogb04/seism-gestion`, **público**, con un commit inicial (`README.md`).
- `secret_scanning`: **enabled**. `secret_scanning_push_protection`: **enabled**. Verificado con:
  ```
  gh api repos/eduardogb04/seism-gestion --jq .security_and_analysis
  ```
- Clon local en la máquina de Eduardo, remoto `origin` apuntando al repo de arriba.

### Prueba de push protection (F0-01, 2026-09-11)

Para probar que push protection realmente bloquea, no alcanza con un token cualquiera: GitHub
reconoce el formato de los tokens clásicos de GitHub (prefijo `ghp_` + 30 caracteres aleatorios +
6 caracteres de checksum CRC32 en base62) y los push protege con alta confianza porque el
checksum es verificable sin llamar a la API de GitHub. Se generó un token **falso** con ese mismo
formato (checksum válido, pero nunca asociado a ninguna cuenta real):

1. Rama descartable `prueba-push-protection`, creada desde `main`.
2. Un archivo (`prueba-push-protection.txt`, fuera de cualquier carpeta de código) con el token
   falso, commiteado.
3. `git push origin prueba-push-protection`.

**Resultado:** rechazado por GitHub (`GH013: Repository rule violations found... GITHUB PUSH
PROTECTION... GitHub Personal Access Token`). El push nunca llegó al remoto. Rama local borrada
después (`git branch -D prueba-push-protection`); no quedó rama remota porque el push no se
completó.

### Cómo verificar que salió bien

- `gh api repos/eduardogb04/seism-gestion --jq .security_and_analysis` muestra
  `secret_scanning.status` y `secret_scanning_push_protection.status` en `"enabled"`.
- Repetir la prueba de arriba con un token falso nuevo (mismo formato, otro valor al azar) tiene
  que volver a ser rechazada.

### Si falla

- Si `secret_scanning_push_protection` apareciera `disabled`: activarlo en *Settings → Code
  security* del repo (requiere ser dueño/admin). No hace falta plan pago: el repo es público.
- Si un push con un token de formato conocido **no** es rechazado: es un hallazgo, no un
  paso manual pendiente — se reporta y se revisa la configuración de *Settings → Code security*
  antes de seguir.

### Secretos que quedan (solo nombres)

Ninguno todavía. El token falso de la prueba nunca fue real ni quedó en ningún commit de `main`
ni en el historial de una rama que sobreviva.

## 3. Proteger la rama principal

**Cuándo hace falta:** ya se hizo el 2026-09-15 (F0-06), con el OK explícito de Eduardo en el chat
del orquestador ese mismo día para tocar la configuración del repo en GitHub (D1: repo público →
protección de rama gratis). Esta sección **verifica** que sigue así; si algo faltara, se repone acá.
**Quién:** Eduardo (dueño de la cuenta `eduardogb04`) o un agente con su OK explícito, registrado en
el chat con fecha.
**Necesitás antes:** `gh` autenticado con permisos de admin sobre el repo.

### Qué hace el ruleset

Un *ruleset* de GitHub sobre `main` (no la protección de rama "clásica": los rulesets son la forma
actual y admiten `bypass_actors: []`, sin excepción ni para el dueño). Nombre **"Proteger rama
principal"**, `target: branch`, `enforcement: active`, aplicado sobre `~DEFAULT_BRANCH`. Reglas:

- `deletion` — no se puede borrar `main`.
- `non_fast_forward` — prohíbe force-push.
- `pull_request` — exige que todo cambio entre por PR (esto es lo que prohíbe el push directo),
  con `required_approving_review_count: 0` (en Fase 0 el revisor es el agente tester, no una
  aprobación de GitHub — DISENO, *Quién hace qué*) y `required_review_thread_resolution: true`
  (toda conversación del PR se resuelve antes de fusionar).
- `required_status_checks` — exige el check `ci` en verde, con
  `strict_required_status_checks_policy: true` (*strict*: la rama tiene que estar al día con `main`
  antes de fusionar; si `main` avanzó mientras el PR estaba abierto, hay que actualizar la rama).
- `bypass_actors: []` — nadie lo saltea, ni Eduardo. Verificado en la respuesta de la API:
  `"current_user_can_bypass":"never"`.

Aplicado con `gh api repos/eduardogb04/seism-gestion/rulesets -X POST --input ruleset-main.json`,
con este JSON (sin tokens ni datos sensibles: es configuración pública del repo):

```json
{
  "name": "Proteger rama principal",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [{ "context": "ci" }],
        "strict_required_status_checks_policy": true
      }
    }
  ]
}
```

Resultado: ruleset creado con `id: 23473097`, `enforcement: "active"`,
`current_user_can_bypass: "never"`.

### Los tres intentos (F0-06, 2026-09-15)

**1. Push directo a `main` — tiene que ser rechazado.**
Con `main` local al día con `origin/main`, un commit vacío (`git commit --allow-empty`) y
`git push origin main`. Resultado: rechazado —
`remote: error: GH013: Repository rule violations found for refs/heads/main.` con
`Changes must be made through a pull request.` y `Required status check "ci" is expected.`. El
commit vacío nunca llegó al remoto. Después, `git reset --hard origin/main` en el local: quedó
idéntico a `origin/main`, sin el commit de prueba.

**2. Un PR con `ci` en rojo bloquea la fusión.**
Sobre el PR #16 de esta misma tarea (F0-06), commit `548c1ab`: rompe a propósito
`tests/dominio/humo.test.ts` (`expect(1 + 1).toBe(3)`). Resultado: los dos checks `ci` (push y
pull_request) quedaron en rojo, `gh pr view 16 --json mergeStateStatus` devolvió `BLOCKED`, y
`gh pr merge 16 --squash` (probado solo mientras `ci` estaba en rojo) falló con:
`X Pull request eduardogb04/seism-gestion#16 is not mergeable: the base branch policy prohibits
the merge.`.

**3. Arreglado, el mismo PR vuelve a poder fusionarse.**
Commit `c65f96c`: revierte el anterior (test otra vez en `toBe(2)`). Con `ci` en verde de nuevo,
`gh pr view 16 --json mergeStateStatus` devolvió `CLEAN`. (Después, `main` avanzó dos veces más
con PRs de otros agentes en paralelo — #14 y #15 — y la rama de F0-06 se actualizó con
`git merge origin/main`, como exige *strict*; `mergeStateStatus` volvió a `CLEAN` en cada
actualización.)

### Cómo verificar que sigue así

- `gh api repos/eduardogb04/seism-gestion/rulesets --jq '.[] | {name,enforcement}'` muestra
  `"Proteger rama principal"` en `"active"`.
- `gh api repos/eduardogb04/seism-gestion/rulesets/<id>` muestra `bypass_actors: []` y las cuatro
  reglas (`deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` con contexto
  `ci` y `strict_required_status_checks_policy: true`).
- Un `git push origin main` directo, con cualquier commit, es rechazado.

### Si hay que desactivarlo en una emergencia (y volver a activarlo)

**Cuándo:** un incidente donde hay que fusionar o pushear a `main` sin pasar por PR/CI (por
ejemplo, revertir algo roto en producción más rápido de lo que tarda el ciclo normal). Solo
Eduardo decide esto; queda en el registro de auditoría de GitHub (*Settings → Audit log*) con
quién y cuándo.

1. `https://github.com/eduardogb04/seism-gestion/settings/rules` (o *Settings → Rules → Rulesets*
   en la interfaz) → abrir **"Proteger rama principal"**.
2. Cambiar **Enforcement status** de *Active* a *Disabled* (no borrar el ruleset: queda la
   configuración lista para reactivar). Guardar.
   Por API: `gh api repos/eduardogb04/seism-gestion/rulesets/<id> -X PUT -f enforcement=disabled`.
3. Hacer el cambio de emergencia (push directo, force-push, lo que haga falta).
4. **Reactivar de inmediato después:** mismo lugar, *Enforcement status* de vuelta a *Active*
   (o `gh api .../rulesets/<id> -X PUT -f enforcement=active`).

**Cómo verificar que quedó reactivado:**
`gh api repos/eduardogb04/seism-gestion/rulesets/<id> --jq .enforcement` → `"active"`. Un push
directo de prueba (commit vacío descartable) vuelve a ser rechazado.

## 4. Oracle: cuenta, instancia, red y firewall

**Cuándo hace falta:** una vez, para tener el servidor del ensayo (F0-12). Y de nuevo cada vez que
haya que levantar otro: Oracle recupera las instancias con uso bajo sostenido, y la respuesta es
volver a correr esto, no rescatar la máquina. Nada que no esté en git vive en ese servidor.
**Quién:** Eduardo (es su cuenta y su tarjeta).
**Necesitás antes:** una tarjeta de crédito (Oracle la pide para validar identidad; la capa Always
Free no cobra — paso 1), un teléfono, y el repositorio clonado, que es de donde sale
`infra/oracle/bootstrap.sh`.
**Cuánto lleva:** la cuenta, unos 20 minutos. Conseguir la instancia, entre 5 minutos y varios días
(paso 4). El script, unos 10 minutos la primera vez.

> **Las pantallas de Oracle cambian de nombre seguido.** Si algo no está donde dice acá, buscalo
> por el nombre parecido en el menú y **corregí este archivo en el mismo momento**: es lo único que
> hace que dentro de tres meses siga sirviendo.

### Pasos

**1. Crear la cuenta, y dejarla sin upgrade automático a pago.**

1. `https://www.oracle.com/cloud/free/` → *Start for free*. Mail, teléfono y tarjeta. Oracle hace
   una retención temporal de alrededor de USD 1 para validar la tarjeta, y la libera.
2. **La región de origen (*Home Region*) se elige una sola vez y no se cambia nunca más.** Elegí
   **São Paulo (`sa-saopaulo-1`)**: los usuarios están en Argentina y el diseño pide que el
   servidor y la base queden geográficamente cerca.
3. Terminado el registro entrás a la consola. **No aprietes *Upgrade to Paid Account*.** La cuenta
   arranca como prueba con crédito por 30 días; cuando ese crédito vence, si no la pasaste a paga,
   **sigue funcionando solo lo Always Free y no se cobra nada**. Eso es exactamente lo que
   queremos.
4. Verificá el tipo de cuenta: menú ☰ → *Billing & Cost Management* → *Upgrade and Payment Method*.
   Tiene que figurar como cuenta de prueba / Always Free, **no** como *Pay As You Go*.
5. **Red de seguridad, en la misma sección:** *Billing & Cost Management* → *Budgets* → *Create
   Budget* sobre el compartimento raíz, monto **USD 1**, alerta al **100 %** a tu mail. Si alguna
   vez algo empieza a facturar en silencio, te enterás el primer día.

**2. Generar la clave SSH ed25519, en tu máquina.**

En Git Bash (no en PowerShell), una sola vez:

```
ssh-keygen -t ed25519 -f "$HOME/.ssh/seism-deploy" -C "deploy@seism"
```

- Te pide una *passphrase*: ponele una y anotala donde guardás las contraseñas. Te la va a pedir
  cada vez que te conectes.
- Quedan dos archivos en `C:\Users\<vos>\.ssh\`: `seism-deploy` (la **privada**, no sale nunca de
  tu máquina y **nunca va al repositorio**) y `seism-deploy.pub` (la pública, que es la que se pega
  en todos lados).
- Para verla: `cat "$HOME/.ssh/seism-deploy.pub"`. Empieza con `ssh-ed25519 `.

**3. Crear la instancia Always Free.**

Menú ☰ → *Compute* → *Instances* → *Create instance*.

| Campo | Qué poner |
|---|---|
| *Name* | `gestion-ensayo` |
| *Image* | *Change image* → **Canonical Ubuntu 24.04**. El script **solo** corre en Ubuntu: si elegís Oracle Linux, se niega a arrancar y te lo dice |
| *Shape* | *Change shape* → *Virtual machine* → *Specialty and previous generation* → **VM.Standard.E2.1.Micro** (AMD, 1 OCPU, 1 GB). Tiene que aparecer la etiqueta **Always Free eligible** |
| *Primary VNIC / Networking* | Dejá que cree una VCN nueva con subred **pública**, y **Assign a public IPv4 address: Yes** |
| *Add SSH keys* | *Paste public keys* → pegá el contenido entero de `seism-deploy.pub` |
| *Boot volume* | No lo toques (los 47 GB por defecto entran en Always Free) |

*Create*. Cuando el estado pase a **Running**, anotá la **Public IP address**: es la que vas a usar
en todos los pasos siguientes, y la que va a ir a los secretos de CI en F0-13.

**4. Si dice *Out of capacity* (primera aspereza conocida).**

Es normal y no es un error tuyo: la capa gratuita no tiene capacidad reservada.

- Volvé a intentar *Create instance* más tarde (temprano a la mañana suele haber más lugar), y
  probá **otro *Availability Domain*** si tu región tiene más de uno.
- **No** automatices reintentos cada pocos segundos: Oracle lo trata como abuso.
- Si pasa más de una semana: está previsto probar la **ARM Ampere** (también Always Free), pero eso
  obliga a construir la imagen para dos arquitecturas (F0-07) y **es otra decisión, con su ADR**.
  Avisá antes de tomarla.

**5. Abrir 22 y 80 en la lista de seguridad de la VCN, solo desde tu IP.**

1. Averiguá tu IP pública: `curl -s https://ifconfig.me` (o abrí `https://ifconfig.me` en el
   navegador).
2. Menú ☰ → *Networking* → *Virtual Cloud Networks* → la VCN de la instancia → *Security Lists* →
   *Default Security List*.
3. En *Ingress Rules*, la regla que ya existe para el puerto 22 dice *Source* `0.0.0.0/0`
   (cualquiera). Editala: *Source CIDR* = `TU.IP.PU.BLICA/32`.
4. *Add Ingress Rule*: *Source CIDR* = `TU.IP.PU.BLICA/32`, *IP Protocol* = **TCP**, *Destination
   Port Range* = `80`.
5. Guardá. No hace falta reiniciar nada: es inmediato.

**Cómo cambiarla cuando cambie tu IP:** tu conexión es residencial, así que la IP **va a cambiar**,
y el día que cambie no vas a poder entrar por SSH ni abrir la página. Se arregla en esta misma
pantalla: `curl -s https://ifconfig.me` para ver la nueva, y editás las dos reglas con el nuevo
`/32`. **No te podés dejar afuera para siempre:** la lista de seguridad se edita desde la consola
web, que no depende de poder entrar a la máquina.

**6. Copiar el script y correrlo.**

En Git Bash, parado en la carpeta del repositorio, con `<IP>` reemplazada por la Public IP:

```
scp -i "$HOME/.ssh/seism-deploy" infra/oracle/bootstrap.sh "$HOME/.ssh/seism-deploy.pub" ubuntu@<IP>:
ssh -i "$HOME/.ssh/seism-deploy" ubuntu@<IP>
```

Ya adentro de la instancia (el prompt dice `ubuntu@gestion-ensayo`):

```
sudo bash bootstrap.sh --clave-publica ~/seism-deploy.pub 2>&1 | tee bootstrap.log
```

Tarda unos 10 minutos la primera vez (actualiza el sistema e instala Docker). `tee` deja la salida
en `bootstrap.log` por si hay que mirarla después; ese archivo **no va al repositorio**.

El script deja: el sistema al día, 2 GB de swap, el usuario `deploy` sin contraseña con `sudo` solo
para docker, SSH sin contraseña, el puerto 80 abierto en el firewall local, journald con rotación,
y Docker con su plugin `compose`.

**7. Correrlo una segunda vez, a propósito.**

```
sudo bash bootstrap.sh --clave-publica ~/seism-deploy.pub
```

Tiene que terminar con **`Cambios aplicados: 0`**. Esa línea es la prueba de que el script es
idempotente: correrlo de nuevo no rompe nada.

**8. De acá en adelante se entra como `deploy`.**

```
ssh -i "$HOME/.ssh/seism-deploy" deploy@<IP>
sudo docker run --rm hello-world
```

`deploy` **no** está en el grupo `docker`: sus comandos de contenedores van con `sudo docker …` (y
`sudo docker compose …`). Es a propósito, para que cada uso quede registrado — ver
`docs/adr/0012-bootstrap-de-la-instancia-oracle.md`. El usuario `ubuntu` sigue existiendo con la
misma clave; el deploy automático de F0-13 usa `deploy`.

**9. Reiniciar y ver que vuelve solo.**

```
sudo reboot
```

Esperá un minuto, volvé a entrar y comprobá que el swap sigue activo y Docker corriendo (los
comandos están abajo).

### Cómo verificar que salió bien

Adentro de la instancia:

- El script termina con el bloque *Resumen*, y la segunda corrida dice `Cambios aplicados: 0`.
- `free -h` → la fila `Swap` muestra `2,0Gi`. `swapon --show` muestra `/swapfile`.
- `sudo docker run --rm hello-world` → `Hello from Docker!`.
- `docker compose version` → `Docker Compose version v2.x`.
- `sudo -u deploy sudo docker ps` → la tabla vacía de contenedores, no un error de permisos.
- `sudo -l -U deploy` → una sola línea: `(root) NOPASSWD: /usr/bin/docker`.
- `sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin)"` → `no` en las dos.
- `sudo iptables -L INPUT -n --line-numbers | grep "dpt:80"` → la regla `ACCEPT` con un número de
  línea **menor** que el de la línea `REJECT`.
- `sudo journalctl --disk-usage` → menos de 200 MB.
- Después del `sudo reboot`: `swapon --show` sigue mostrando `/swapfile` y `systemctl is-active
  docker` dice `active`.

Desde tu máquina:

- `ssh -i "$HOME/.ssh/seism-deploy" deploy@<IP>` entra.
- `ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no deploy@<IP>` es rechazado con
  `Permission denied (publickey)`: no hay contraseña que adivinar.

### Si falla

- ***Out of capacity*** al crear la instancia → paso 4. Es la aspereza conocida número uno.
- **`ssh: connect to host <IP> port 22: Connection timed out`** → casi siempre **te cambió la IP de
  tu casa** y la lista de seguridad apunta todavía a la vieja: paso 5. Si tu IP no cambió, mirá en
  la consola que la instancia esté *Running*.
- **`Permission denied (publickey)`** → estás usando otra clave u otro usuario. Probá con
  `-i "$HOME/.ssh/seism-deploy"` y `ubuntu@` (antes del script) o `deploy@` (después).
- **`http://<IP>/` no responde, pero adentro de la instancia `curl localhost` sí** → son **dos**
  puertas y hay que abrir las dos: la lista de seguridad de la VCN (paso 5) **y** el firewall local
  de la imagen (lo abre el script). Es la aspereza número tres, y la causa número uno de tardes
  perdidas en OCI. La de adentro se comprueba con `sudo iptables -L INPUT -n | grep "dpt:80"`.
  **Una sutileza que conviene saber:** un contenedor con el puerto publicado **no pasa por esa
  regla** (Docker desvía ese tráfico por sus propias cadenas), así que quién puede llegar al puerto
  80, en los hechos, lo decide la lista de seguridad de la VCN. Está explicado en el ADR 0012.
- **El script dice `esta imagen es 'ol' y el script es para Ubuntu`** → la instancia se creó con
  Oracle Linux. Se borra y se crea otra con Canonical Ubuntu (paso 3): es más rápido que adaptar la
  máquina.
- **El script dice `la clave pública tiene que ser ed25519`** → pasaste una clave RSA, o la privada
  en vez de la `.pub`. Volvé al paso 2.
- **La instancia desapareció o quedó apagada sin que la toques** → es la aspereza número dos:
  **Oracle recupera las instancias Always Free con uso bajo sostenido**, y un entorno de prueba es
  justo ese perfil. No se pierde nada (ahí no vive nada que no esté en git): creás otra instancia
  (paso 3), corrés el script (paso 6) y volvés a desplegar. Si pasara seguido, la decisión a tomar
  es otra y va con su ADR.
- **`apt-get` falla por falta de espacio** → `df -h /`, y `sudo docker system prune -a` para sacar
  imágenes viejas.

### Secretos que quedan (solo nombres)

- `seism-deploy` — la clave **privada** ed25519. Vive únicamente en `C:\Users\<vos>\.ssh\` de tu
  máquina. No se copia al servidor, no se pega en GitHub, **no entra al repositorio**.
- `seism-deploy.pub` — la pública. No es secreta, pero tampoco tiene por qué estar en el
  repositorio.
- La **IP pública de la instancia** y **tu IP de casa** no son secretos, pero no van al repositorio
  (es público): viven en la consola de Oracle y en tu `.env` local.
- Los secretos del deploy automático (`ENSAYO_SSH_KEY`, `ENSAYO_KNOWN_HOSTS`, `ENSAYO_HOST`,
  `ENSAYO_USER`) los crea **F0-13**, con su propia clave exclusiva de CI. No son estos.

## 14. Probar la imagen Docker en tu máquina

**Cuándo hace falta:** cuando abras Docker Desktop por primera vez, para ver con tus ojos lo que
hoy solo se ve en el log de CI: que la imagen levanta y sirve `/` y `/api/salud`. También cada vez
que toques el `Dockerfile` y no quieras esperar a CI.
**Quién:** cualquiera con el repo clonado y Docker corriendo.
**Necesitás antes:** Docker Desktop abierto (la primera vez pide aceptar sus términos), Node 24 y
el repo clonado. **No hace falta `npm ci`:** el script corre con Node pelado y la app se compila
adentro de la imagen.

### Pasos

1. Abrí Docker Desktop y esperá a que el ícono de la barra diga *running*.
2. En una terminal, parado en la carpeta del repo:
   ```
   npm run imagen          # construye seism-gestion:local (tarda ~1 min la primera vez)
   npm run imagen:prueba   # la levanta y la verifica sola
   ```
3. Si querés verla con el navegador, en vez del paso 2:
   ```
   docker run --rm -p 3000:3000 -e APP_ENTORNO=local -e DATABASE_URL=postgresql://prueba:prueba@127.0.0.1:5432/prueba seism-gestion:local
   ```
   y abrí `http://localhost:3000` y `http://localhost:3000/api/salud`. Se corta con `Ctrl+C`.
   La app todavía no se conecta a la base: alcanza con una `DATABASE_URL` de Postgres válida, como
   esa, ficticia. Sin ella el contenedor no arranca (F0-08).

### Cómo verificar que salió bien

- `npm run imagen` termina con `OK: imagen construida (seism-gestion:local).`
- `npm run imagen:prueba` imprime, en este orden: `HEALTHCHECK: healthy.`, `GET / → 200`,
  `GET /api/salud → 200 {"ok":true,"version":"<SHA corto del commit>"}`,
  `Archivos .env adentro de la imagen: ninguno`, la lista de variables de la imagen (tienen que ser
  solo `PATH`, `NODE_VERSION`, `YARN_VERSION`, `NEXT_TELEMETRY_DISABLED`, `NODE_ENV`, `PORT` y
  `HOSTNAME`), `Sin APP_ENTORNO ni DATABASE_URL el contenedor salió 1: …` con las dos variables
  nombradas, el
  tamaño de la imagen, y al final `OK: el contenedor sirve / y /api/salud…`. Sale con código 0.
- Con el paso 3: `http://localhost:3000` muestra `SeisM · gestión · fase 0` y
  `http://localhost:3000/api/salud` devuelve `{"ok":true,"version":"…"}`, con la misma versión que
  imprime `git rev-parse --short HEAD`.
- El contenedor de prueba no queda vivo: `docker ps` no muestra `seism-gestion-prueba`.

### Si falla

- `no se pudo ejecutar 'docker …'` o `failed to connect to the docker API` → Docker Desktop no está
  corriendo (o todavía está arrancando). Abrilo y repetí.
- `ERROR: el contenedor nunca quedó 'healthy'` → el script imprime arriba el `docker logs` del
  contenedor: ahí está el motivo (lo más común, que la app no arranque por el entorno).
- `no se pudo resolver la versión` → estás fuera del repo o sin git: corré el comando parado en la
  carpeta del repo, o definí `APP_VERSION` a mano (`APP_VERSION=prueba npm run imagen`).
- La imagen pesa más que el tope → no es un problema de tu máquina: es el control de tamaño del
  criterio de F0-07. Se resuelve en un PR, no acá.

### Secretos que quedan (solo nombres)

Ninguno. La imagen no lleva ni `.env` ni variables propias: es justo lo que verifica el paso 2.

## 15. La imagen publicada en GHCR: hacerla pública y la retención

**Cuándo hace falta:** una sola vez, **después del primer merge a `main` que publique la imagen**
(el job `publicar` de `.github/workflows/ci.yml`). GHCR crea los paquetes **privados** aunque el
repositorio sea público: hay que cambiarlo a mano una vez, y queda así para siempre.
**Quién:** Eduardo (dueño de la cuenta `eduardogb04`).
**Necesitás antes:** que el job `publicar` haya terminado en verde en `main`
(`gh run list --branch main`).

### Pasos

1. Abrí `https://github.com/users/eduardogb04/packages/container/package/seism-gestion`
   (también se llega por *tu perfil → Packages → seism-gestion*).
2. Barra de la derecha: *Package settings*.
3. Abajo de todo, *Danger Zone → Change visibility → Public*. Confirmá escribiendo
   `seism-gestion`.
4. En la misma pantalla, *Manage Actions access*: tiene que estar el repositorio
   `eduardogb04/seism-gestion` con rol **Admin**. Si está como `Write`, cambialo a `Admin`; si no
   está, *Add repository* → `seism-gestion` → `Admin`. Eso es lo que le permite al paso de
   retención borrar versiones viejas con el `GITHUB_TOKEN` de la corrida, sin ningún secreto nuevo.

### Cómo verificar que salió bien

- Sin estar logueado (o en una ventana privada), `https://github.com/eduardogb04/seism-gestion/pkgs/container/seism-gestion`
  abre y muestra las etiquetas `latest` y el SHA del último commit de `main`.
- Desde cualquier máquina con Docker, **sin `docker login`**:
  ```
  docker pull ghcr.io/eduardogb04/seism-gestion:latest
  docker run --rm -p 3000:3000 -e APP_ENTORNO=local -e DATABASE_URL=postgresql://prueba:prueba@127.0.0.1:5432/prueba ghcr.io/eduardogb04/seism-gestion:latest
  ```
  (desde F0-08 la imagen exige `DATABASE_URL`; la app todavía no se conecta, alcanza con esa URL
  ficticia)
  y `http://localhost:3000/api/salud` devuelve la versión del último commit de `main`.
- Después del sexto merge a `main`, el paso *Retención en GHCR (últimas 5)* del job `publicar`
  imprime `Borrando la versión …` y en la página del paquete quedan **5** versiones.

### Si falla

- El paso de retención en rojo con `403` o `Package not found` → falta el rol *Admin* del paso 4
  (o el paquete todavía no existe porque nunca se publicó). Arreglá el acceso y volvé a correr el
  job: `gh run rerun <id> --failed`. **No se saca el paso ni se tapa el error.**
- `docker pull` pide credenciales → el paquete quedó privado: rehacé el paso 3.
- El paquete no aparece en tu perfil → el job `publicar` no llegó a correr (solo corre en `push` a
  `main`) o quedó en rojo: `gh run list --branch main`.

### Secretos que quedan (solo nombres)

Ninguno. La publicación usa el `GITHUB_TOKEN` que GitHub Actions le da a la corrida, con
`packages: write` y solo en el job `publicar`.

---

## Formato de cada sección

```
## N. Título

**Cuándo hace falta:** en qué tarea o situación.
**Quién:** Eduardo | quien tenga acceso a X.
**Necesitás antes:** cuentas, accesos, archivos.

### Pasos
1. Abrí <pantalla exacta: menú → submenú>.
2. Hacé <acción>. Pegá <qué> en <dónde>.
3. ...

### Cómo verificar que salió bien
- <comando o pantalla> tiene que mostrar <qué>.

### Si falla
- <síntoma> → <qué hacer>.

### Secretos que quedan (solo nombres)
- `NOMBRE_DE_LA_VARIABLE` — dónde vive (GitHub Environment `ensayo` / `/etc/gestion/app.env`).
```
