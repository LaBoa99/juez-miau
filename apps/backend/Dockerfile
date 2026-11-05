# Se construye desde la RAÍZ del monorepo (necesita el workspace para @concurso/shared-types):
#   docker build -f apps/backend/Dockerfile -t concurso-backend .

# ===================================
# BUILD: instala todo, compila shared-types y backend
# ===================================
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@11
WORKDIR /repo

# Primero solo manifiestos: si no cambian las dependencias, Docker reutiliza la capa del install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter backend...

COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend
RUN pnpm --filter backend... build

# Carpeta autónoma con dist + node_modules de producción (sin devDependencies)
RUN pnpm --filter backend deploy --prod --legacy /out \
 && cp -r apps/backend/dist /out/dist

# ===================================
# RUNNER: mide tiempo de CPU y memoria de cada caso. Estático para montarlo en cualquier imagen
# ===================================
FROM gcc:14 AS runner
COPY apps/backend/judge/runner.c /src/runner.c
RUN gcc -O2 -static /src/runner.c -o /src/runner

# ===================================
# RUNTIME: solo lo necesario para correr
# ===================================
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# El worker lanza los contenedores de los envíos con el CLI de Docker sobre docker.sock.
# La API usa la misma imagen pero no monta el socket, así que el CLI no le sirve de nada
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=runner /src/runner /app/judge/runner
ENV JUDGE_RUNNER_BIN=/app/judge/runner

COPY --from=build --chown=node:node /out ./
COPY --chown=node:node apps/backend/docker-entrypoint.sh apps/backend/healthcheck.mjs ./
RUN chmod +x docker-entrypoint.sh

# Valores de la instalación con deploy/docker-compose.yml: el .env solo lleva URL y secretos.
# Cualquiera se puede cambiar desde el .env
ENV PORT=3000 \
    DB_HOST=postgres DB_PORT=5432 DB_USERNAME=concurso DB_DATABASE=concurso_db \
    REDIS_HOST=redis REDIS_PORT=6379 \
    TZ=America/Mexico_City \
    SEED_PROFILE=prod \
    DOCKER_TMP_DIR=/var/lib/concurso/submissions \
    API_HEALTH_URL=http://api:3000/api/v1/health \
    JUDGE_IMAGE_GCC=gcc:14 \
    JUDGE_IMAGE_DOTNET=mcr.microsoft.com/dotnet/sdk:8.0 \
    JUDGE_IMAGE_JAVA=eclipse-temurin:21-jdk \
    JUDGE_IMAGE_NODE=node:24-slim \
    JUDGE_IMAGE_PYTHON=python:3.12-slim

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD ["node", "healthcheck.mjs"]

# Arranca como root: el entrypoint prepara el juez (si es el worker) y baja a "node" (uid 1000).
# Migra, siembra (SEED_PROFILE) y arranca la API; con "worker" como comando arranca el juez
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
