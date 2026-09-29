#!/bin/sh
set -e

# SEED_PROFILE: base | dev | prod | none (none = no sembrar). Los seeders son idempotentes,
# así que es seguro correrlos en cada arranque del contenedor
SEED_PROFILE="${SEED_PROFILE:-prod}"

if [ "$SEED_PROFILE" != "none" ]; then
    node dist/database/seeds/seed.js "$SEED_PROFILE"
fi

# exec: la app reemplaza al shell y recibe directo las señales (docker stop → SIGTERM)
exec "$@"
