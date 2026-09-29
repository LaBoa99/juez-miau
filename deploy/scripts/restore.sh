#!/bin/sh
# Restaura un respaldo de scripts/backup.sh. REEMPLAZA la base de datos actual.
# El respaldo debe venir de un despliegue con los mismos PASSWORD_ADMIN_MASTERKEY y TEAM_SALT,
# si no, las contraseñas de los equipos no se pueden descifrar.
#
# uso: scripts/restore.sh backups/concurso-20260929-180000.dump
set -eu
cd "$(dirname "$0")/.."

file="${1:?uso: scripts/restore.sh <archivo.dump>}"
[ -f "$file" ] || { echo "no existe $file" >&2; exit 1; }

printf 'Se reemplazará la base de datos con %s. ¿Continuar? [s/N] ' "$file"
read -r answer
[ "$answer" = "s" ] || { echo "cancelado"; exit 1; }

# Sin escrituras mientras se restaura
docker compose stop api worker 2>/dev/null || docker compose stop api

docker compose exec -T postgres sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"

docker compose up -d
echo "restaurado: $file"
