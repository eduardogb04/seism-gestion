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

**Qué hace falta:** Node 24 (ver `.nvmrc`), git, Docker Desktop corriendo (para la sección 14 y,
desde el lote 2, para la base), GitHub CLI autenticado.

**Cómo verificar:**
```
node --version        → v24.x (.nvmrc pide 24)
git --version
docker run hello-world     # ver sección 14; hace falta de verdad desde F0-08
gh auth status              → "Logged in to github.com"
```

**Docker todavía no corre en esta máquina** (está instalado, pero nunca se aceptaron los términos
de Docker Desktop). Nada de Fase 0 está bloqueado por eso: la imagen se construye y se prueba en
CI (F0-07, ADR 0007). Cuando lo abras, la sección 14 dice cómo repetir esa misma prueba acá.

Node 24 corre `.ts` directo (type stripping nativo, sin `tsx` ni `ts-node`): `node
scripts/sin-any.ts` funciona tal cual, sin paso de compilación previo.

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

*(F0-06 completa esta sección.)*

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
   docker run --rm -p 3000:3000 -e APP_ENTORNO=local seism-gestion:local
   ```
   y abrí `http://localhost:3000` y `http://localhost:3000/api/salud`. Se corta con `Ctrl+C`.

### Cómo verificar que salió bien

- `npm run imagen` termina con `OK: imagen construida (seism-gestion:local).`
- `npm run imagen:prueba` imprime, en este orden: `HEALTHCHECK: healthy.`, `GET / → 200`,
  `GET /api/salud → 200 {"ok":true,"version":"<SHA corto del commit>"}`,
  `Archivos .env adentro de la imagen: ninguno`, la lista de variables de la imagen (tienen que ser
  solo `PATH`, `NODE_VERSION`, `YARN_VERSION`, `NEXT_TELEMETRY_DISABLED`, `NODE_ENV`, `PORT` y
  `HOSTNAME`), `Sin APP_ENTORNO el contenedor salió 1: … Entorno inválido: la app no arranca.`, el
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
  docker run --rm -p 3000:3000 -e APP_ENTORNO=local ghcr.io/eduardogb04/seism-gestion:latest
  ```
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
