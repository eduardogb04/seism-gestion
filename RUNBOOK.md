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

---

## 1. Prerrequisitos de la máquina

**Qué hace falta:** Node 24 (ver `.nvmrc`), git, Docker Desktop corriendo (desde el lote 2), GitHub
CLI autenticado.

**Cómo verificar:**
```
node --version        → v24.x (.nvmrc pide 24)
git --version
docker run hello-world     # recién hace falta desde F0-08
gh auth status              → "Logged in to github.com"
```

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
