#!/bin/sh
# Imágenes Docker del despliegue: las del sistema y las de ejecución de envíos.
# La lista del juez sale de la tabla language (image_ref de los lenguajes activos), así
# siempre coincide con lo que usa el worker.
#
#   scripts/images.sh pull   descarga las imágenes del juez (requiere la BD arriba)
#   scripts/images.sh save   guarda TODAS en images/concurso-images.tar.gz (≈ 2–3 GB comprimido)
#   scripts/images.sh load   las carga desde ese archivo, sin internet
set -eu
cd "$(dirname "$0")/.."

archive=images/concurso-images.tar.gz
tag=$(grep -E '^IMAGE_TAG=' .env 2>/dev/null | cut -d= -f2)

judge_images() {
    docker compose exec -T postgres sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select distinct image_ref from language where active order by 1"'
}

system_images() {
    echo "concurso-backend:${tag:-latest}"
    echo "concurso-web:${tag:-latest}"
    echo "postgres:14-alpine"
    echo "redis:7-alpine"
}

case "${1:-}" in
    pull)
        for image in $(judge_images); do docker pull "$image"; done
        ;;
    save)
        mkdir -p images
        images="$(system_images) $(judge_images)"
        echo "guardando:" $images
        # shellcheck disable=SC2086
        docker save $images | gzip > "$archive"
        echo "listo: $archive ($(du -h "$archive" | cut -f1))"
        ;;
    load)
        gunzip -c "$archive" | docker load
        ;;
    *)
        echo "uso: scripts/images.sh pull|save|load" >&2
        exit 1
        ;;
esac
