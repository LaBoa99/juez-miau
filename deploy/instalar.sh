#!/bin/sh
# Instala Juez Miau en esta máquina: baja el compose, genera el .env con secretos nuevos y arranca.
#
#   mkdir concurso && cd concurso
#   curl -fsSL https://raw.githubusercontent.com/LaBoa99/juez-miau/main/deploy/instalar.sh | sh
#
# Si ya hay un .env aquí, lo respeta (no cambia secretos ni contraseñas).
set -eu

RAW=https://raw.githubusercontent.com/LaBoa99/juez-miau/main/deploy

command -v docker >/dev/null || { echo "Falta Docker: https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Falta Docker Compose v2 (docker compose)" >&2; exit 1; }

[ -f docker-compose.yml ] || curl -fsSL "$RAW/docker-compose.yml" -o docker-compose.yml

secret() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
# Las preguntas se leen de la terminal: con "curl | sh" la entrada estándar es el script.
# Sin terminal (automatizado) se usa el valor por defecto
ask() {
    answer=
    # En subshell: en dash, un error de redirección en un builtin especial termina el script
    if (true > /dev/tty) 2>/dev/null; then
        printf '%s [%s]: ' "$1" "$2" > /dev/tty
        read -r answer < /dev/tty || answer=
    fi
    echo "${answer:-$2}"
}

if [ -f .env ]; then
    echo ".env ya existe: se conserva"
else
    # IP con la que esta máquina sale a la red (hostname -I no existe en todas las distros)
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
    url=$(ask "Dirección para entrar al panel" "http://${ip:-localhost}")
    email=$(ask "Correo del superadmin" "admin@concurso.local")
    password=$(secret | cut -c1-16)
    umask 077
    cat > .env <<EOF
# Generado por instalar.sh. Guárdalo junto con los respaldos: sin PASSWORD_ADMIN_MASTERKEY y
# TEAM_SALT no se restauran. Opciones extra: $RAW/.env.example
PUBLIC_URL=$url
COOKIE_SECURE=false

DB_PASSWORD=$(secret)
JWT_SECRET=$(secret)
PASSWORD_ADMIN_MASTERKEY=$(secret)
TEAM_SALT=$(secret)

SEED_ADMIN_EMAIL=$email
SEED_ADMIN_PASSWORD=$password
EOF
    echo ".env creado"
fi

docker compose pull
docker compose up -d

. ./.env
cat <<EOF

Listo. La primera vez el juez tarda unos minutos en bajar las imágenes de los lenguajes
(docker compose logs -f worker).

  Panel:      $PUBLIC_URL
  Usuario:    $SEED_ADMIN_EMAIL
  Contraseña: $SEED_ADMIN_PASSWORD   (cámbiala en Staff después de entrar)
EOF
