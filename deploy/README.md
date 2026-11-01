# Despliegue del concurso

Todo el sistema en una sola máquina con Docker Compose. Pensado para montarse unos días antes
de cada concurso (2 veces al año, 2–4 h) y desmontarse después. Requisitos de hardware en
[docs/design/server-specs.md](../docs/design/server-specs.md).

```
                 :80 / :443
Navegadores ───────► web (Caddy) ──┬── /            panel de staff (Angular, estáticos)
App de escritorio ─┘               ├── /api/*       ─► api (NestJS) ─► postgres
de los equipos                     └── /socket.io/* ─►                └► redis ◄─ worker ─► docker.sock
                                                                                   (juez, perfil "judge")
```

| Servicio | Qué es | Puertos |
|---|---|---|
| `web` | Caddy: sirve `apps/frontend-staff` y hace proxy a la API | 80, 443 publicados |
| `api` | Backend NestJS. Al arrancar corre el seeder (`SEED_PROFILE`) | interno |
| `worker` | Juez. Mismo código que la API, arranca `dist/worker.js`. **Aún no existe**: está en el perfil `judge` | ninguno |
| `postgres` | Base de datos | interno |
| `redis` | Cola de envíos (BullMQ) | interno |

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
git clone <repo> && cd mi-concurso-monorepo/deploy
cp .env.example .env
# Editar .env: PUBLIC_URL, contraseñas y secretos (openssl rand -hex 32)
docker compose up -d --build
docker compose ps              # todo "Up"; postgres y redis "(healthy)"
```

Entrar a `PUBLIC_URL` con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Ejecutar localmente solo el panel, la API y sus dependencias

El Compose completo también sirve para probar el panel y el backend localmente. Desde la raíz:

```bash
cp deploy/.env.example deploy/.env
```

En `deploy/.env`, configura `PUBLIC_URL=http://localhost:8080`, `HTTP_PORT=8080`,
`SITE_ADDRESS=:80`, `COOKIE_SECURE=false`, `DB_SYNCHRONIZE=false` y `SEED_PROFILE=base`.
Define valores locales para las contraseñas y secretos (`DB_PASSWORD`, `REDIS_PASSWORD`,
`JWT_SECRET`, `PASSWORD_ADMIN_MASTERKEY`, `TEAM_SALT` y `SEED_ADMIN_PASSWORD`); no uses los
marcadores `cambia_esto`.

Después levanta los servicios necesarios:

```bash
docker compose -f deploy/docker-compose.yml up -d --build postgres redis api web
docker compose -f deploy/docker-compose.yml ps
```

Abre `http://localhost:8080`. El superadmin inicial usa `SEED_ADMIN_EMAIL` y
`SEED_ADMIN_PASSWORD` de `deploy/.env`. Esta configuración usa volúmenes propios de Compose, por
lo que no comparte la base de datos de `apps/backend/docker-compose.yml`. El worker de evaluación
no se inicia con este comando; para juzgar envíos se necesita configurarlo aparte con acceso al
Docker del host.

Para ver errores de API y web:

```bash
docker compose -f deploy/docker-compose.yml logs -f api web
```

Para detener los servicios sin borrar sus datos:

```bash
docker compose -f deploy/docker-compose.yml down
```

**Sin internet en el laboratorio:** en una máquina con internet, `docker compose build` y
`scripts/images.sh save`; copiar la carpeta del repo (con `images/`) y en la máquina del
concurso `scripts/images.sh load` y después `docker compose up -d` (sin `--build`).

## Ciclo por semestre

| Cuándo | Qué | Comando |
|---|---|---|
| 2–3 semanas antes | Levantar en cualquier máquina para que los jueces capturen problemas | `docker compose up -d --build` |
| 1 semana antes | Respaldar la captura y llevarla a la máquina del concurso | `scripts/backup.sh captura` → copiar el `.dump` → `scripts/restore.sh <archivo>` |
| | Descargar las imágenes del juez | `scripts/images.sh pull` |
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

El servicio `worker` (`apps/backend/src/worker.ts`) arranca junto con los demás. Antes del primer
`docker compose up`:

1. `sudo mkdir -p /var/lib/concurso/submissions && sudo chown 1000:1000 /var/lib/concurso/submissions`
   (UID del usuario `node` de la imagen; ruta = `SUBMISSIONS_DIR`)
2. `DOCKER_GID` = `getent group docker | cut -d: -f3`
3. `JUDGE_CPUS` con una CPU lógica por núcleo físico que se reserve para juzgar (`lscpu -e`), y
   `WORKER_CONCURRENCY` con la misma cantidad
4. Descargar las imágenes de los lenguajes (~4.4 GB):
   `for i in gcc:14 eclipse-temurin:21-jdk python:3.12-slim node:24-slim mcr.microsoft.com/dotnet/sdk:8.0; do docker pull $i; done`

El worker monta `docker.sock`, que equivale a root en el host: por eso no publica puertos ni
comparte proceso con la API. Los requisitos de ejecución (variables de .NET, detección de MLE,
límites) están en [server-specs.md](../docs/design/server-specs.md#requisitos-que-el-worker-debe-cumplir).

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
