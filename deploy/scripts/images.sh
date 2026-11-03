#!/bin/sh
# Imágenes Docker del despliegue: las del sistema y las del juez. Todas salen del compose
# (servicios judge-*), así siempre coinciden con lo que usa el worker.
#
#   scripts/images.sh pull   descarga las imágenes (las del juez también las baja "docker compose up")
#   scripts/images.sh save   guarda TODAS en images/concurso-images.tar.gz (≈ 2–3 GB comprimido)
#   scripts/images.sh load   las carga desde ese archivo, sin internet
set -eu
cd "$(dirname "$0")/.."

archive=images/concurso-images.tar.gz

case "${1:-}" in
    pull)
        # Las construidas (api, worker, web) no están en ningún registro
        docker compose pull --ignore-buildable
        ;;
    save)
        mkdir -p images
        images=$(docker compose config --images | sort -u)
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
