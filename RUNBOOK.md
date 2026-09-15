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
