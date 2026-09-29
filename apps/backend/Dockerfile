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
# RUNTIME: solo lo necesario para correr
# ===================================
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --chown=node:node apps/backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 3000

# Corre el seeder (SEED_PROFILE, por defecto prod) y después arranca la app
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
