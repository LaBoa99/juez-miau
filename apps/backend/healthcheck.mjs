// HEALTHCHECK de la imagen. Sin argumento revisa este contenedor: la API debe responder /health
// (BD y Redis arriba) y el worker, que no tiene HTTP, se da por sano. Con una URL revisa esa
// (el worker la usa para esperar a la API antes de arrancar).
import { readFileSync } from 'node:fs'

const url = process.argv[2]
if (!url && readFileSync('/proc/1/cmdline', 'utf8').includes('worker.js')) process.exit(0)

fetch(url ?? `http://localhost:${process.env.PORT ?? 3000}/api/v1/health`)
    .then((res) => process.exit(res.ok ? 0 : 1), () => process.exit(1))
