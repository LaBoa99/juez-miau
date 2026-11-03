#!/bin/sh
set -e

# Worker (user: root en el compose): crea la carpeta de envíos, toma el grupo de docker.sock
# y se vuelve a ejecutar como "node" (uid 1000). Así no hacen falta mkdir/chown ni DOCKER_GID a mano
if [ "$(id -u)" = "0" ]; then
    if [ -n "${DOCKER_TMP_DIR:-}" ]; then
        mkdir -p "$DOCKER_TMP_DIR"
        chown 1000:1000 "$DOCKER_TMP_DIR"
    fi
    groups=1000
    if [ -S /var/run/docker.sock ]; then
        groups="$groups,$(stat -c %g /var/run/docker.sock)"
    fi
    # HOME de node: el CLI de Docker lee ~/.docker y /root no es legible para uid 1000
    export HOME=/home/node
    exec setpriv --reuid=1000 --regid=1000 --groups="$groups" "$0" "$@"
fi

# RUN_MIGRATIONS=true (solo la API): aplica las migraciones pendientes antes de sembrar. Si la BD
# se creó con DB_SYNCHRONIZE=true, la primera vez hay que marcar la inicial como aplicada:
#   docker compose run --rm -e RUN_MIGRATIONS=false -e SEED_PROFILE=none api node dist/database/migrate.js baseline
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    node dist/database/migrate.js
fi

# SEED_PROFILE: base | dev | prod | none (none = no sembrar). Los seeders son idempotentes,
# así que es seguro correrlos en cada arranque del contenedor
SEED_PROFILE="${SEED_PROFILE:-prod}"

if [ "$SEED_PROFILE" != "none" ]; then
    node dist/database/seeds/seed.js "$SEED_PROFILE"
fi

# exec: la app reemplaza al shell y recibe directo las señales (docker stop → SIGTERM)
exec "$@"
