#!/bin/sh
# Imágenes Docker del despliegue: las del compose y las del juez (JUDGE_IMAGE_* de la imagen del
# backend, más las que cambies en el .env). Sirve para instalar sin internet.
#
#   scripts/images.sh pull   descarga todas (el worker baja las del juez solo al arrancar)
#   scripts/images.sh save   guarda TODAS en images/concurso-images.tar.gz (≈ 2–3 GB comprimido)
#   scripts/images.sh load   las carga desde ese archivo, sin internet
set -eu
cd "$(dirname "$0")/.."

archive=images/concurso-images.tar.gz

judge_images() {
    backend=$(docker compose config --images | grep concurso-backend | head -n 1)
    {
        docker run --rm --entrypoint env "$backend"
        [ -f .env ] && cat .env
    } | sed -n 's/^JUDGE_IMAGE_[A-Z]*=//p' | sort -u
}

case "${1:-}" in
    pull)
        docker compose pull
        for image in $(judge_images); do docker pull "$image"; done
        ;;
    save)
        mkdir -p images
        images="$(docker compose config --images | sort -u) $(judge_images)"
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
