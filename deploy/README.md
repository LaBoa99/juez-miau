# Despliegue del concurso

Todo el sistema en una sola máquina con Docker Compose. Pensado para montarse unos días antes
de cada concurso (2 veces al año, 2–4 h) y desmontarse después.

```
                 :80 / :443
Navegadores ───────► web (Caddy) ──┬── /            panel de staff (Angular, estáticos)
App de escritorio ─┘               ├── /api/*       ─► api (NestJS) ─► postgres
de los equipos                     └── /socket.io/* ─►                └► redis ◄─ worker ─► docker.sock
                                                                                   (juez)
```

| Servicio | Qué es | Puertos |
|---|---|---|
| `web` | Caddy: sirve `apps/frontend-staff` y hace proxy a la API | 80, 443 publicados |
| `api` | Backend NestJS. Al arrancar corre el seeder (`SEED_PROFILE`) | interno |
| `worker` | Juez. Mismo código que la API, arranca `dist/worker.js` | ninguno |
| `postgres` | Base de datos | solo `127.0.0.1:5432` (desarrollo) |
| `redis` | Cola de envíos (BullMQ) | solo `127.0.0.1:6379` (desarrollo) |
| `judge-*` | Imágenes de los lenguajes. Solo sirven para que `up` las descargue; terminan en `Exited (0)` | ninguno |

Este es el **único** docker-compose del proyecto: sirve para el concurso y para desarrollo.

**Frontend:** el panel llama a la API con rutas relativas `/api/...` (mismo origen), no con una URL
fija. Caddy las adapta al prefijo `/api/v1` del backend y reescribe el path de la cookie de sesión.
Así la misma imagen sirve en cualquier máquina sin reconstruir.

`apps/app-competidores` (PySide6) no va aquí: se instala en las máquinas de los equipos y
se conecta a `PUBLIC_URL`/`api/v1`.

## Requisitos de la máquina

- Linux x86_64 con Docker 24+ y Docker Compose v2 (`docker compose version`)
- cgroup v2: `stat -fc %T /sys/fs/cgroup` → `cgroup2fs`
- ≈ 20 GB libres; IP fija o reservada en la red del laboratorio

## Instalación

```bash
git clone <repo> && cd juez-miau/deploy
cp .env.example .env
# Editar .env: PUBLIC_URL, contraseñas y secretos (openssl rand -hex 32)
docker compose up -d --build
docker compose ps              # todo "Up"; postgres y redis "(healthy)"
```

Entrar a `PUBLIC_URL` con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

No hay más pasos: el worker crea solo la carpeta de envíos (`SUBMISSIONS_DIR`), toma el grupo
de `docker.sock` y `up` descarga las imágenes de los lenguajes antes de arrancarlo.

### Desarrollo local con el mismo compose

Para probar todo como en el concurso, en `deploy/.env` pon `PUBLIC_URL=http://localhost:8080`,
`HTTP_PORT=8080`, `COOKIE_SECURE=false` y `SEED_PROFILE=base` (o `dev`), con contraseñas locales,
y `docker compose up -d --build`. Abre `http://localhost:8080`.

Para trabajar en el backend con recarga en caliente, levanta solo la base de datos y Redis
(quedan en `127.0.0.1`, no se ven desde la red):

```bash
docker compose -f deploy/docker-compose.yml up -d postgres redis
cd apps/backend && pnpm start:dev
```

`apps/backend/.env` debe usar `DB_USERNAME`, `DB_PASSWORD` y `REDIS_PASSWORD` iguales a los de
`deploy/.env`. Para no mezclar datos, usa otra base (`DB_DATABASE=concurso_dev`; se crea con
`docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" concurso_dev'`). No corras un
worker local mientras el del compose esté arriba: comparten la cola de Redis y se repartirían
los envíos.

```bash
docker compose -f deploy/docker-compose.yml logs -f api web   # errores de API y web
docker compose -f deploy/docker-compose.yml down              # detener sin borrar datos
```

**Sin internet en el laboratorio:** en una máquina con internet, `docker compose build` y
`scripts/images.sh save` (guarda las del sistema y las del juez, según el compose); copiar la
carpeta del repo (con `images/`) y en la máquina del concurso `scripts/images.sh load` y después `docker compose up -d` (sin `--build`).

## Ciclo por semestre

| Cuándo | Qué | Comando |
|---|---|---|
| 2–3 semanas antes | Levantar en cualquier máquina para que los jueces capturen problemas | `docker compose up -d --build` |
| 1 semana antes | Respaldar la captura y llevarla a la máquina del concurso | `scripts/backup.sh captura` → copiar el `.dump` → `scripts/restore.sh <archivo>` |
| | Probar el juez en esa máquina | `node ../scripts/judge-bench/bench.mjs --only ac --cpus 1` |
| | Simulacro: un envío por lenguaje y problema | |
| Día del concurso | Llegar 1 h antes: `docker compose ps`, red, hora del sistema | |
| Durante | Respaldo cada 15–30 min (o con cron) | `scripts/backup.sh` |
| Después | Respaldo final y copiarlo fuera de la máquina | `scripts/backup.sh final` |
| | Desmontar | `docker compose down` (conserva datos) o `down -v` (los borra) |

Los respaldos se restauran en cualquier otra instalación **con los mismos
`PASSWORD_ADMIN_MASTERKEY` y `TEAM_SALT`**; guardar el `.env` junto con los respaldos, en
un lugar seguro.

## HTTP o HTTPS

| Situación | `.env` |
|---|---|
| Red del laboratorio, entrada por IP | `SITE_ADDRESS=:80`, `PUBLIC_URL=http://<ip>`, `COOKIE_SECURE=false` |
| Dominio público apuntando a la máquina | `SITE_ADDRESS=concurso.midominio.mx`, `PUBLIC_URL=https://concurso.midominio.mx`, `COOKIE_SECURE=true` |

Con dominio, Caddy obtiene el certificado solo (necesita los puertos 80 y 443 abiertos desde
internet). `COOKIE_SECURE=true` sobre HTTP rompe la sesión del staff: el navegador descarta la
cookie de refresh.

## El juez

El servicio `worker` (`apps/backend/src/worker.ts`) arranca junto con los demás, ya sin pasos a mano:

- Arranca como root solo para crear `SUBMISSIONS_DIR` (dueño uid 1000) y leer el grupo de
  `docker.sock`; después `docker-entrypoint.sh` baja al usuario `node` con ese grupo.
- Las imágenes de los lenguajes (~4.4 GB) están declaradas como servicios `judge-*`; el worker
  espera a que `up` las descargue. Así ningún envío las descarga a mitad de la compilación (eso
  daba CE falsos por el límite de 60 s, o CE en todo el lenguaje sin internet).
- Las versiones se cambian en `.env` (`JUDGE_IMAGE_GCC`, `JUDGE_IMAGE_PYTHON`, …; ver
  `.env.example`). Al arrancar, la API actualiza la imagen de los 7 lenguajes base en la BD.
  Un lenguaje creado desde el panel con otra imagen hay que agregarlo también al compose.
- Ajusta `JUDGE_CPUS` con una CPU lógica por núcleo físico que se reserve para juzgar
  (`lscpu -e`), y `WORKER_CONCURRENCY` con la misma cantidad.

El worker monta `docker.sock`, que equivale a root en el host: por eso no publica puertos ni
comparte proceso con la API. Los requisitos de ejecución (variables de .NET, detección de MLE,
límites) los aplica el propio worker.

## Pendiente con el hardware nuevo

Se hace en la máquina donde correrá el concurso, porque los tiempos dependen del hardware:

1. **Calibrar `time_multiplier`** (sobre todo Python, hoy en 3 sin medir) con
   `node scripts/judge-bench/bench.mjs` y ajustar los lenguajes en el panel o en el seeder.
2. **Simulacro completo**: app de competidores en las máquinas del laboratorio, panel de staff
   y proyector; un AC, un WA y un TLE por lenguaje; entrar como superadmin, admin, juez,
   observador y sin sesión; reemplazar la sesión de un equipo en otra máquina.

## Instalar en otra máquina con imágenes de ghcr.io

Las imágenes de `api`/`worker` y `web` se publican en GitHub Container Registry (paquetes
públicos), así la otra máquina no necesita el código ni construir.

**Publicar:** lo hace solo el workflow `.github/workflows/imagenes.yml` en cada push a `main`
que toque el backend, el panel o `packages/` (o a mano: Actions → imagenes → Run workflow).
No hace falta token propio. Sube `latest` y la versión del commit (`IMAGE_TAG=<sha>` para volver
a una anterior).

La primera vez, en GitHub → Packages → `concurso-backend` y `concurso-web` → Package settings →
Change visibility → Public.

**Instalar** (en la otra máquina; sin token): copiar la carpeta `deploy/` con su `.env`
(con el mismo `IMAGE_PREFIX`) y:

```bash
docker compose pull
docker compose up -d        # sin --build
```

Para restaurar un respaldo de otra instalación, el `.env` debe tener los mismos
`PASSWORD_ADMIN_MASTERKEY` y `TEAM_SALT`.

## Actualizar el código

```bash
scripts/backup.sh antes-de-actualizar
git pull && docker compose up -d --build
```

La API aplica las migraciones pendientes al arrancar (`RUN_MIGRATIONS=true` en el compose).
El worker espera a que la API esté sana para arrancar. Aun así, respalda antes de actualizar:
una migración puede borrar columnas.

### Migraciones

- `DB_SYNCHRONIZE=false` en producción. El esquema cambia solo con migraciones
  (`apps/backend/src/database/migrations/`).
- **BD creada antes con `DB_SYNCHRONIZE=true`** (despliegues anteriores a las migraciones): ya
  tiene el esquema, y la migración inicial fallaría con "relation already exists". La primera vez,
  márcala como aplicada sin ejecutarla y luego arranca normal:

  ```bash
  scripts/backup.sh antes-de-migraciones
  # RUN_MIGRATIONS=false: si no, el entrypoint intenta la migración normal primero y falla
  docker compose run --rm -e RUN_MIGRATIONS=false -e SEED_PROFILE=none api node dist/database/migrate.js baseline
  docker compose up -d
  ```

- Para un cambio de entidades, genera la migración en desarrollo con
  `pnpm migration:generate src/database/migrations/<Nombre>` y súbela con el código.
  Antes de desplegar, `pnpm migration:check` (en `apps/backend`) arma una BD vacía solo con las
  migraciones y falla si alguna entidad cambió sin su migración.

## Comandos útiles

```bash
docker compose logs -f api            # logs de la API
curl -s localhost/api/v1/health        # BD, Redis, jueces conectados y envíos en cola
docker compose restart api            # reiniciar un servicio
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'   # consola SQL
```
