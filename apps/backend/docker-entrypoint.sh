#!/bin/sh
# Arranque de la imagen. La misma imagen es la API (por defecto) o el juez ("command: worker").
set -e

if [ "${1:-}" = "worker" ]; then
    shift
    set -- node dist/worker.js "$@"
    export ROLE=worker
fi

# El panel y la API comparten origen (Caddy), así que ambas URLs son la pública
export FRONT_END_URL="${FRONT_END_URL:-${PUBLIC_URL:-}}"
export CORS_ORIGIN="${CORS_ORIGIN:-$FRONT_END_URL}"

# La imagen arranca como root solo para preparar el juez; después todo corre como "node" (uid 1000)
if [ "$(id -u)" = "0" ]; then
    groups=1000
    if [ -S /var/run/docker.sock ]; then
        # Carpeta de los envíos: misma ruta en el host y aquí (los contenedores de los envíos
        # los crea el Docker del host, que resuelve las rutas del host)
        mkdir -p "$DOCKER_TMP_DIR"
        chown 1000:1000 "$DOCKER_TMP_DIR"
        groups="$groups,$(stat -c %g /var/run/docker.sock)"

        # Imágenes de los lenguajes: se bajan antes del primer envío, no a mitad de una compilación
        # (eso daba CE falsos por el límite de tiempo). Sin internet, cárgalas con scripts/images.sh
        for image in $(env | sed -n 's/^JUDGE_IMAGE_[A-Z]*=//p' | sort -u); do
            docker image inspect "$image" >/dev/null 2>&1 && continue
            echo "descargando $image (solo la primera vez; puede tardar varios minutos)"
            docker pull -q "$image" || echo "AVISO: no se pudo descargar $image"
        done
    fi
    # HOME de node: el CLI de Docker lee ~/.docker y /root no es legible para uid 1000
    export HOME=/home/node
    exec setpriv --reuid=1000 --regid=1000 --groups="$groups" "$0" "$@"
fi

if [ "${ROLE:-}" = "worker" ]; then
    # Las migraciones las aplica la API: el juez espera a que responda antes de tomar la cola
    until node healthcheck.mjs "$API_HEALTH_URL"; do
        echo "esperando a la API ($API_HEALTH_URL)"
        sleep 3
    done
else
    # Migraciones pendientes antes de sembrar. Postgres puede tardar unos segundos en aceptar
    # conexiones en el primer arranque, por eso se reintenta. Si la BD se creó con
    # DB_SYNCHRONIZE=true, la primera vez hay que marcar la inicial como aplicada:
    #   docker compose run --rm -e RUN_MIGRATIONS=false -e SEED_PROFILE=none api node dist/database/migrate.js baseline
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
        tries=0
        until node dist/database/migrate.js; do
            tries=$((tries + 1))
            [ "$tries" -ge 20 ] && exit 1
            sleep 3
        done
    fi

    # SEED_PROFILE: base | dev | prod | none. Los seeders son idempotentes: seguros en cada arranque
    if [ "$SEED_PROFILE" != "none" ]; then
        node dist/database/seeds/seed.js "$SEED_PROFILE"
    fi
fi

# exec: la app reemplaza al shell y recibe directo las señales (docker stop → SIGTERM)
exec "$@"
