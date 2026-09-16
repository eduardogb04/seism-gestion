#!/usr/bin/env bash
#
# bootstrap.sh (F0-12) — deja una instancia Oracle Always Free recién creada
# lista para correr contenedores. Reproducible e idempotente: la segunda
# corrida no cambia nada y termina diciendo "Cambios aplicados: 0".
#
# Qué hace, en este orden:
#   1. Actualiza el sistema.
#   2. Deja el swap (2 GB por defecto).
#   3. Crea el usuario de despliegue, sin contraseña, con `sudo` limitado a docker.
#   4. Endurece SSH: solo clave pública, sin contraseña, sin root.
#   5. Abre el puerto HTTP en el firewall local de la imagen y lo persiste.
#   6. Deja journald con rotación y tope de tamaño.
#   7. Instala Docker y el plugin `compose` desde el repositorio oficial de Docker.
#
# Qué NO hace: la lista de seguridad de la VCN (eso es la consola de Oracle:
# RUNBOOK.md, sección 4), TLS, dominio, y levantar la aplicación (F0-13).
#
# Uso, desde la instancia y como root:
#   sudo bash bootstrap.sh --clave-publica /home/ubuntu/deploy.pub
#   sudo CLAVE_PUBLICA=/home/ubuntu/deploy.pub bash bootstrap.sh
#
# Decisiones y porqués: docs/adr/0013-bootstrap-de-la-instancia-oracle.md.
# Paso a paso para una persona: RUNBOOK.md, sección 4.
#
# Este archivo no lleva ninguna IP, usuario, clave ni dato real: todo es
# parámetro o valor de ejemplo (el repositorio es público).

set -euo pipefail

# --- Parámetros -------------------------------------------------------------
# Cada uno se puede pasar por variable de entorno o por opción de línea de
# comandos. Los valores de abajo son los predeterminados, no datos de nadie.

CLAVE_PUBLICA="${CLAVE_PUBLICA:-}"          # archivo .pub, o el texto de la clave
USUARIO_DEPLOY="${USUARIO_DEPLOY:-deploy}"
SWAP_MB="${SWAP_MB:-2048}"                  # 2 GB, el criterio de F0-12
PUERTO_HTTP="${PUERTO_HTTP:-80}"
ARCHIVO_SWAP="${ARCHIVO_SWAP:-/swapfile}"

CLAVE_DE_EJEMPLO='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEJEMPLOEJEMPLOEJEMPLOEJEMPLOEJEMPLOEJEM deploy@ejemplo'
readonly CLAVE_DE_EJEMPLO

CAMBIOS=0            # cuántas cosas cambió esta corrida; la segunda tiene que dar 0
CLAVE_TEXTO=''       # la clave pública ya leída y validada (la llena verificar_entorno)
PAQUETES_NUEVOS=''   # qué instaló la última llamada a instalar_paquetes

uso() {
  cat <<AYUDA
Uso: sudo bash bootstrap.sh --clave-publica <archivo.pub | "ssh-ed25519 AAAA... comentario">

Opciones (todas con valor predeterminado salvo la clave):
  --clave-publica <valor>   Clave pública ed25519 del usuario de despliegue.
                            Un archivo, o el texto entero entre comillas.
                            Ejemplo: "${CLAVE_DE_EJEMPLO}"
  --usuario <nombre>        Usuario de despliegue. Predeterminado: ${USUARIO_DEPLOY}
  --swap-mb <número>        Tamaño del swap en MB. Predeterminado: ${SWAP_MB}
  --puerto-http <número>    Puerto que se abre en el firewall local. Predeterminado: ${PUERTO_HTTP}
  --ayuda                   Esto.

Correrlo dos veces es seguro: la segunda vez no cambia nada.
AYUDA
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clave-publica) CLAVE_PUBLICA="${2:-}"; shift 2 ;;
    --usuario)       USUARIO_DEPLOY="${2:-}"; shift 2 ;;
    --swap-mb)       SWAP_MB="${2:-}"; shift 2 ;;
    --puerto-http)   PUERTO_HTTP="${2:-}"; shift 2 ;;
    --ayuda|-h)      uso; exit 0 ;;
    *) printf 'ERROR: opción desconocida: %s\n\n' "$1" >&2; uso >&2; exit 1 ;;
  esac
done

# --- Salida y utilidades -----------------------------------------------------

paso()       { printf '\n==> %s\n' "$1"; }
info()       { printf '    %s\n' "$1"; }
cambio()     { printf '    hecho: %s\n' "$1"; CAMBIOS=$((CAMBIOS + 1)); }
sin_cambio() { printf '    ya estaba: %s\n' "$1"; }
error()      { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

# Escribe un archivo solo si su contenido cambió (el contenido llega por la
# entrada estándar). Devuelve 0 si lo escribió, 1 si ya estaba igual: así el
# que llama decide si hace falta reiniciar un servicio.
escribir_archivo() {
  local ruta="$1" modo="$2" contenido
  contenido="$(cat)"
  if [[ -f "$ruta" && "$(cat -- "$ruta")" == "$contenido" ]]; then
    chmod "$modo" -- "$ruta"
    return 1
  fi
  mkdir -p -- "$(dirname -- "$ruta")"
  printf '%s\n' "$contenido" >"$ruta"
  chmod "$modo" -- "$ruta"
  return 0
}

# Instala solo los paquetes que falten. Devuelve 0 si instaló algo (y deja la
# lista en PAQUETES_NUEVOS), 1 si ya estaban todos. La salida de apt va a la
# consola, no a una variable: si algo falla, se ve.
instalar_paquetes() {
  local faltan=() paquete
  PAQUETES_NUEVOS=''
  for paquete in "$@"; do
    dpkg-query --show --showformat='${Status}' "$paquete" 2>/dev/null |
      grep -q '^install ok installed$' || faltan+=("$paquete")
  done
  [[ ${#faltan[@]} -gt 0 ]] || return 1
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${faltan[@]}"
  PAQUETES_NUEVOS="${faltan[*]}"
  return 0
}

# --- 0. Verificaciones previas ----------------------------------------------

verificar_entorno() {
  paso "Verificaciones previas"

  [[ "$(id -u)" -eq 0 ]] || error "hay que correrlo como root: sudo bash bootstrap.sh …"

  # El script instala Docker desde el repositorio de Docker para Ubuntu y toca
  # archivos propios de Ubuntu (sshd_config.d, iptables-persistent). En otra
  # imagen no hace nada, en vez de hacer algo a medias (ADR 0013).
  local id_distro='' version_distro=''
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    id_distro="${ID:-}"
    version_distro="${VERSION_ID:-}"
  fi
  [[ "$id_distro" == "ubuntu" ]] ||
    error "esta imagen es '${id_distro:-desconocida}' y el script es para Ubuntu (al crear la instancia se elige Canonical Ubuntu: RUNBOOK.md, sección 4)"
  info "Ubuntu ${version_distro:-?} · $(uname -m)"

  command -v systemctl >/dev/null || error "no hay systemd: el script no sabe operar esta imagen"
  command -v iptables >/dev/null  || error "no hay iptables: el script no sabe abrir el puerto en esta imagen"

  [[ "$SWAP_MB" =~ ^[0-9]+$ && "$SWAP_MB" -gt 0 ]] ||
    error "--swap-mb tiene que ser un número de MB mayor que cero (llegó: '${SWAP_MB}')"
  [[ "$PUERTO_HTTP" =~ ^[0-9]+$ && "$PUERTO_HTTP" -gt 0 && "$PUERTO_HTTP" -lt 65536 ]] ||
    error "--puerto-http tiene que ser un puerto válido (llegó: '${PUERTO_HTTP}')"
  [[ "$USUARIO_DEPLOY" =~ ^[a-z_][a-z0-9_-]*$ ]] ||
    error "--usuario tiene que ser un nombre de usuario válido (llegó: '${USUARIO_DEPLOY}')"

  # La clave: un archivo, o el texto pegado. Solo ed25519, que es lo que pide
  # el criterio de F0-12.
  [[ -n "$CLAVE_PUBLICA" ]] ||
    error "falta la clave pública del usuario '${USUARIO_DEPLOY}'. Ejemplo: --clave-publica /home/ubuntu/deploy.pub (--ayuda para ver el uso)"
  if [[ -f "$CLAVE_PUBLICA" ]]; then
    CLAVE_TEXTO="$(tr -d '\r' <"$CLAVE_PUBLICA" | grep -m1 -v '^[[:space:]]*$' || true)"
  else
    CLAVE_TEXTO="$(printf '%s' "$CLAVE_PUBLICA" | tr -d '\r\n')"
  fi
  [[ "$CLAVE_TEXTO" == ssh-ed25519\ * ]] ||
    error "la clave pública tiene que ser ed25519 y empezar con 'ssh-ed25519 ' (se genera con 'ssh-keygen -t ed25519'; si pasaste un archivo, fijate que sea el .pub y no la clave privada)"
  [[ "$CLAVE_TEXTO" != "$CLAVE_DE_EJEMPLO" ]] ||
    error "esa es la clave de ejemplo de la ayuda, no una clave de verdad: generá la tuya con 'ssh-keygen -t ed25519 -f deploy -C deploy@seism'"
  info "Clave ed25519 para '${USUARIO_DEPLOY}': …${CLAVE_TEXTO: -24}"
}

# --- 1. Sistema actualizado --------------------------------------------------

actualizar_sistema() {
  paso "Actualizar el sistema"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # --force-confold: si un paquete trae una versión nueva de un archivo de
  # configuración que ya tocamos, gana el que está, y nadie queda esperando
  # una pregunta que nunca se contesta.
  apt-get upgrade -y -qq \
    -o Dpkg::Options::=--force-confold \
    -o Dpkg::Options::=--force-confdef
  # No cuenta como cambio: correrlo de nuevo sin nada pendiente no toca nada,
  # y su propia salida ya dice qué actualizó.
  info "paquetes al día"
}

# --- 2. Swap -----------------------------------------------------------------

configurar_swap() {
  paso "Swap de ${SWAP_MB} MB en ${ARCHIVO_SWAP}"

  local bytes_pedidos=$((SWAP_MB * 1024 * 1024)) bytes_actuales=''

  if [[ -f "$ARCHIVO_SWAP" ]]; then
    bytes_actuales="$(stat -c %s -- "$ARCHIVO_SWAP")"
    if [[ "$bytes_actuales" -ne "$bytes_pedidos" ]]; then
      info "el archivo existe con otro tamaño ($((bytes_actuales / 1024 / 1024)) MB): se rehace"
      swapoff -- "$ARCHIVO_SWAP" 2>/dev/null || true
      rm -f -- "$ARCHIVO_SWAP"
    fi
  fi

  if [[ -f "$ARCHIVO_SWAP" ]]; then
    chmod 600 -- "$ARCHIVO_SWAP"
    sin_cambio "archivo de swap de ${SWAP_MB} MB"
  else
    # fallocate deja agujeros en algunos sistemas de archivos y el swap no los
    # admite; dd lo escribe entero y funciona en todos.
    dd if=/dev/zero of="$ARCHIVO_SWAP" bs=1M count="$SWAP_MB" status=none
    chmod 600 -- "$ARCHIVO_SWAP"
    cambio "archivo de swap creado (${SWAP_MB} MB)"
  fi

  if swapon --show=NAME --noheadings | grep -qxF -- "$ARCHIVO_SWAP"; then
    sin_cambio "swap activo"
  else
    # mkswap solo corre cuando el swap no está activo: la primera vez, o si
    # alguien lo apagó. Sobre un archivo ya formateado es inofensivo.
    mkswap -- "$ARCHIVO_SWAP" >/dev/null
    swapon -- "$ARCHIVO_SWAP"
    cambio "swap activado"
  fi

  # Que vuelva solo después de un reinicio.
  if grep -qE "^[[:space:]]*${ARCHIVO_SWAP}[[:space:]]+none[[:space:]]+swap" /etc/fstab; then
    sin_cambio "entrada en /etc/fstab"
  else
    printf '%s none swap sw 0 0\n' "$ARCHIVO_SWAP" >>/etc/fstab
    cambio "entrada en /etc/fstab"
  fi
}

# --- 3. Usuario de despliegue ------------------------------------------------

crear_usuario_deploy() {
  paso "Usuario '${USUARIO_DEPLOY}' (sin contraseña, sudo limitado a docker)"

  if id -u "$USUARIO_DEPLOY" >/dev/null 2>&1; then
    sin_cambio "el usuario existe"
  else
    useradd --create-home --shell /bin/bash "$USUARIO_DEPLOY"
    cambio "usuario creado"
  fi

  # Sin contraseña: no hay ninguna que adivinar ni que perder. Se entra solo
  # por clave, y a root se llega por el sudo acotado de más abajo.
  if passwd --status "$USUARIO_DEPLOY" | awk '{ print $2 }' | grep -qE '^(L|LK)$'; then
    sin_cambio "contraseña bloqueada"
  else
    passwd --lock "$USUARIO_DEPLOY" >/dev/null
    cambio "contraseña bloqueada"
  fi

  local casa ssh_dir autorizadas
  casa="$(getent passwd "$USUARIO_DEPLOY" | cut -d: -f6)"
  ssh_dir="${casa}/.ssh"
  autorizadas="${ssh_dir}/authorized_keys"

  mkdir -p -- "$ssh_dir"
  touch -- "$autorizadas"
  chmod 700 -- "$ssh_dir"
  chmod 600 -- "$autorizadas"
  chown -R "${USUARIO_DEPLOY}:${USUARIO_DEPLOY}" -- "$ssh_dir"

  # Se agrega, no se reemplaza: volver a correr el script con otra clave suma
  # una llave más (es como F0-13 va a poner la clave exclusiva de CI).
  if grep -qxF -- "$CLAVE_TEXTO" "$autorizadas"; then
    sin_cambio "la clave ya estaba autorizada"
  else
    printf '%s\n' "$CLAVE_TEXTO" >>"$autorizadas"
    cambio "clave autorizada"
  fi

  # sudo solo para docker. `docker compose` es un subcomando del mismo
  # binario, así que con esta regla alcanza para los dos.
  #
  # Que quede dicho qué se está dando: poder correr docker es equivalente a
  # ser root en la máquina (ADR 0013). La diferencia con meter al usuario en
  # el grupo `docker` es que acá la puerta tiene nombre y cada invocación
  # queda en el log de sudo.
  local sudoers=/etc/sudoers.d/seism-deploy temporal
  temporal="$(mktemp)"
  {
    printf '# Generado por infra/oracle/bootstrap.sh (F0-12). No editar a mano.\n'
    printf '# Solo docker, sin contraseña. Nada más.\n'
    printf '%s ALL=(root) NOPASSWD: /usr/bin/docker\n' "$USUARIO_DEPLOY"
  } >"$temporal"
  # Un archivo inválido en /etc/sudoers.d/ rompe sudo para todo el mundo: se
  # valida antes de ponerlo en su lugar.
  visudo --check --file="$temporal" >/dev/null ||
    { rm -f -- "$temporal"; error "el archivo de sudoers generado no es válido"; }
  if [[ -f "$sudoers" ]] && cmp -s -- "$temporal" "$sudoers"; then
    chmod 440 -- "$sudoers"
    rm -f -- "$temporal"
    sin_cambio "sudo limitado a docker"
  else
    install -o root -g root -m 440 -- "$temporal" "$sudoers"
    rm -f -- "$temporal"
    cambio "sudo limitado a docker"
  fi
}

# --- 4. SSH ------------------------------------------------------------------

endurecer_ssh() {
  paso "SSH: solo clave pública"

  # El nombre empieza con 10- a propósito: sshd toma el PRIMER valor que
  # encuentra para cada opción, y la imagen de OCI trae un
  # 50-cloud-init.conf. Con 10- manda este archivo, diga lo que diga el otro.
  local conf=/etc/ssh/sshd_config.d/10-seism.conf cambio_conf=0
  if escribir_archivo "$conf" 644 <<'CONF'
# Generado por infra/oracle/bootstrap.sh (F0-12). No editar a mano.
# Se lee antes que 50-cloud-init.conf: sshd usa el primer valor que encuentra.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
CONF
  then
    cambio_conf=1
  fi

  # Nunca se recarga sshd con una configuración que no valida: sería quedarse
  # afuera de la máquina.
  sshd -t || error "la configuración de sshd no valida; no se recargó nada (mirá ${conf})"

  if [[ "$cambio_conf" -eq 1 ]]; then
    # En Ubuntu 24.04 el servicio se llama `ssh`. `reload` no corta la sesión
    # abierta: si algo saliera mal, todavía estás adentro.
    systemctl reload ssh 2>/dev/null || systemctl restart ssh
    cambio "sshd recargado con ${conf}"
  else
    sin_cambio "$conf"
  fi
}

# --- 5. Firewall local de la imagen ------------------------------------------

# La causa número uno de tardes perdidas en OCI: la imagen viene con el INPUT
# cerrado salvo el 22, y abrir el puerto en la lista de seguridad de la VCN no
# alcanza. Hay que abrirlo también acá adentro.
#
# Este paso corre ANTES de instalar Docker a propósito: `netfilter-persistent
# save` guarda la tabla entera, y con Docker corriendo guardaría también sus
# cadenas dinámicas. En una segunda corrida ya no hace falta guardar (la regla
# está en la tabla y en el archivo), así que tampoco pasa entonces.
abrir_puerto_http() {
  paso "Firewall local: puerto ${PUERTO_HTTP}/tcp"

  local regla=(INPUT -p tcp -m conntrack --ctstate NEW --dport "$PUERTO_HTTP" -j ACCEPT)

  if iptables -C "${regla[@]}" 2>/dev/null; then
    sin_cambio "la regla ya estaba en la tabla"
  else
    # Va ANTES del primer REJECT/DROP del INPUT, o al final si no hay
    # ninguno: una regla puesta después del rechazo no la mira nadie.
    local posicion
    posicion="$(iptables -L INPUT --line-numbers -n |
      awk '$2 == "REJECT" || $2 == "DROP" { print $1; exit }')"
    if [[ -n "$posicion" ]]; then
      iptables -I INPUT "$posicion" "${regla[@]:1}"
    else
      iptables -A "${regla[@]}"
    fi
    cambio "regla agregada al INPUT"
  fi

  # Sin preguntas: el paquete ofrece guardar las reglas al instalarse, y acá
  # se guardan más abajo, cuando corresponde.
  debconf-set-selections <<'SELECCIONES'
iptables-persistent iptables-persistent/autosave_v4 boolean false
iptables-persistent iptables-persistent/autosave_v6 boolean false
SELECCIONES
  if instalar_paquetes iptables-persistent; then
    cambio "instalado: ${PAQUETES_NUEVOS}"
  fi

  # Que sobreviva al reinicio.
  local persistido=/etc/iptables/rules.v4
  if [[ -f "$persistido" ]] && grep -q -- "--dport ${PUERTO_HTTP} -j ACCEPT" "$persistido"; then
    sin_cambio "la regla ya estaba en ${persistido}"
  else
    netfilter-persistent save >/dev/null
    cambio "reglas guardadas en ${persistido}"
  fi

  info "la lista de seguridad de la VCN es aparte y se hace en la consola de Oracle (RUNBOOK.md, sección 4)"
}

# --- 6. journald -------------------------------------------------------------

configurar_journald() {
  paso "journald con rotación"

  # 1 GB de RAM y un disco compartido con todo lo demás: el log tiene techo y
  # vencimiento, o algún día llena la máquina.
  if escribir_archivo /etc/systemd/journald.conf.d/10-seism.conf 644 <<'CONF'
# Generado por infra/oracle/bootstrap.sh (F0-12). No editar a mano.
[Journal]
Storage=persistent
SystemMaxUse=200M
SystemMaxFileSize=20M
SystemKeepFree=500M
RuntimeMaxUse=50M
MaxRetentionSec=1month
CONF
  then
    systemctl restart systemd-journald
    cambio "journald configurado y reiniciado"
  else
    sin_cambio "configuración de journald"
  fi
}

# --- 7. Docker ---------------------------------------------------------------

instalar_docker() {
  paso "Docker y el plugin compose"

  if instalar_paquetes ca-certificates curl gnupg; then
    cambio "instalado: ${PAQUETES_NUEVOS}"
  fi

  # Repositorio oficial de Docker: el `docker.io` de Ubuntu no trae el plugin
  # `compose` v2 (ADR 0013). La clave y la lista se escriben solo si cambian.
  local llavero=/etc/apt/keyrings/docker.asc
  local lista=/etc/apt/sources.list.d/docker.list
  local repo_nuevo=0

  if [[ -s "$llavero" ]]; then
    sin_cambio "clave del repositorio de Docker"
  else
    install -m 0755 -d /etc/apt/keyrings
    curl --fail --silent --show-error --location --retry 3 \
      https://download.docker.com/linux/ubuntu/gpg -o "$llavero"
    chmod a+r -- "$llavero"
    repo_nuevo=1
    cambio "clave del repositorio de Docker"
  fi

  local arquitectura nombre_version
  arquitectura="$(dpkg --print-architecture)"
  nombre_version="$(. /etc/os-release && printf '%s' "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")"
  [[ -n "$nombre_version" ]] || error "no se pudo leer el nombre de la versión de Ubuntu de /etc/os-release"

  if escribir_archivo "$lista" 644 <<CONF
# Generado por infra/oracle/bootstrap.sh (F0-12). No editar a mano.
deb [arch=${arquitectura} signed-by=${llavero}] https://download.docker.com/linux/ubuntu ${nombre_version} stable
CONF
  then
    repo_nuevo=1
    cambio "repositorio de Docker"
  else
    sin_cambio "repositorio de Docker"
  fi

  [[ "$repo_nuevo" -eq 0 ]] || apt-get update -qq

  if instalar_paquetes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
    cambio "instalado: ${PAQUETES_NUEVOS}"
  else
    sin_cambio "Docker y sus plugins"
  fi

  # Que arranque solo después de un reinicio: la app tiene que volver sola.
  if systemctl is-enabled --quiet docker && systemctl is-active --quiet docker; then
    sin_cambio "servicio docker habilitado y corriendo"
  else
    systemctl enable --now docker >/dev/null
    cambio "servicio docker habilitado y arrancado"
  fi
}

# --- Resumen -----------------------------------------------------------------

resumen() {
  paso "Resumen"

  local casa
  casa="$(getent passwd "$USUARIO_DEPLOY" | cut -d: -f6)"

  printf '    %-26s %s\n' "Docker"   "$(docker --version 2>/dev/null || echo 'no responde')"
  printf '    %-26s %s\n' "Compose"  "$(docker compose version 2>/dev/null || echo 'no responde')"
  printf '    %-26s %s\n' "Swap"     "$(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
  printf '    %-26s %s\n' "Usuario"  "$(id "$USUARIO_DEPLOY" 2>/dev/null || echo 'no existe')"
  printf '    %-26s %s\n' "Claves autorizadas" "$(grep -c '^ssh-' "${casa}/.ssh/authorized_keys" 2>/dev/null || echo 0)"
  printf '    %-26s %s\n' "sudo del usuario" "$(sudo -n -l -U "$USUARIO_DEPLOY" 2>/dev/null | tail -n1 | sed 's/^[[:space:]]*//' || echo '?')"
  printf '    %-26s %s\n' "Puerto ${PUERTO_HTTP} en INPUT" \
    "$(iptables -C INPUT -p tcp -m conntrack --ctstate NEW --dport "$PUERTO_HTTP" -j ACCEPT 2>/dev/null && echo abierto || echo NO)"
  printf '    %-26s %s\n' "SSH con contraseña" "$(sshd -T 2>/dev/null | awk '$1 == "passwordauthentication" { print $2 }')"
  printf '    %-26s %s\n' "journald" "$(journalctl --disk-usage 2>/dev/null | tail -n1)"

  printf '\nCambios aplicados: %d\n' "$CAMBIOS"
  if [[ "$CAMBIOS" -eq 0 ]]; then
    printf 'La instancia ya estaba como tiene que estar.\n'
  else
    printf 'Listo. Probalo con: sudo -u %s sudo docker run --rm hello-world\n' "$USUARIO_DEPLOY"
  fi
  printf 'Falta, y es en la consola de Oracle: la lista de seguridad de la VCN (RUNBOOK.md, sección 4).\n'
}

main() {
  verificar_entorno
  actualizar_sistema
  configurar_swap
  crear_usuario_deploy
  endurecer_ssh
  abrir_puerto_http
  configurar_journald
  instalar_docker
  resumen
}

main
