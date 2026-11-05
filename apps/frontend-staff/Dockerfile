# Se construye desde la RAÍZ del monorepo (necesita el workspace para @concurso/shared-types):
#   docker build -f apps/frontend-staff/Dockerfile -t concurso-web .
#
# La imagen final es Caddy con el build de Angular en /srv y deploy/Caddyfile. El dominio/HTTPS
# se cambia sin reconstruir con SITE_ADDRESS.

# ===================================
# BUILD: compila shared-types y el frontend
# ===================================
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@11
WORKDIR /repo

# Primero solo manifiestos: si no cambian las dependencias, Docker reutiliza la capa del install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/frontend-staff/package.json apps/frontend-staff/
RUN pnpm install --frozen-lockfile --filter frontend-staff...

COPY packages/shared-types packages/shared-types
COPY apps/frontend-staff apps/frontend-staff
RUN pnpm --filter frontend-staff... build

# ===================================
# RUNTIME: Caddy sirve los estáticos y hace de proxy hacia la API
# ===================================
FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/frontend-staff/dist/frontend-staff/browser /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
