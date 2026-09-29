#!/bin/sh
# Respaldo completo de Postgres en deploy/backups/. Correr antes de actualizar el código,
# antes de apagar la máquina del concurso y cada 15–30 min durante el concurso (ver README).
#
# uso: scripts/backup.sh [nombre]
set -eu
cd "$(dirname "$0")/.."

mkdir -p backups
file="backups/${1:-concurso}-$(date +%Y%m%d-%H%M%S).dump"

# Formato custom (-Fc): comprimido y restaurable con pg_restore
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file"

echo "respaldo: $file ($(du -h "$file" | cut -f1))"
