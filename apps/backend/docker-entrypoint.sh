#!/bin/sh
set -e

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
