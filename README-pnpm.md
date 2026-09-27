# Guía de pnpm en `mi-concurso-monorepo`

Este repositorio es un **monorepo** gestionado con [pnpm workspaces](https://pnpm.io/workspaces). Esta guía explica cómo instalar, ejecutar y gestionar dependencias en el proyecto.

---

## 1. ¿Qué es pnpm y por qué lo usamos?

pnpm es un gestor de paquetes para Node.js, similar a `npm` o `yarn`, pero:

- **Ahorra espacio**: guarda cada versión de cada paquete una sola vez en un *store* global y la enlaza (hard links) en cada proyecto.
- **Es más estricto**: un paquete solo puede importar lo que declara en su `package.json`. Esto evita dependencias "fantasma".
- **Soporta workspaces de forma nativa**: varias apps y librerías comparten un único `pnpm-lock.yaml` y un único `node_modules` raíz.

> ⚠️ En este repo **no uses `npm install` ni `yarn`**. Generarían otro lockfile y romperían los enlaces entre paquetes.

---

## 2. Estructura del workspace

```
mi-concurso-monorepo/
├── package.json            # scripts globales del monorepo
├── pnpm-workspace.yaml     # define qué carpetas son paquetes del workspace
├── pnpm-lock.yaml          # lockfile único (¡se commitea!)
├── .npmrc                  # configuración de pnpm (save-exact=true)
├── apps/
│   ├── backend/            # API NestJS          → nombre: "backend"
│   ├── frontend-staff/     # App Angular         → nombre: "frontend-staff"
│   └── app-competidores/   # App Python (NO usa pnpm, ver sección 9)
└── packages/
    └── shared-types/       # Tipos compartidos   → nombre: "@concurso/shared-types"
```

`pnpm-workspace.yaml` indica que todo lo que esté en `apps/*` y `packages/*` con un `package.json` es parte del workspace:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Importante:** para pnpm, cada paquete se identifica por el campo `name` de su `package.json`, no por el nombre de la carpeta.

| Carpeta                  | Nombre del paquete        |
| ------------------------ | ------------------------- |
| `apps/backend`           | `backend`                 |
| `apps/frontend-staff`    | `frontend-staff`          |
| `packages/shared-types`  | `@concurso/shared-types`  |

---

## 3. Instalación de pnpm

El proyecto requiere **pnpm 11.9 o superior** (declarado en `devEngines` del `package.json` raíz).

La forma recomendada es usar **Corepack**, que viene incluido con Node.js:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Alternativas:

```bash
npm install -g pnpm        # con npm
# o
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

---

## 4. Primeros pasos (clonar y arrancar)

```bash
git clone <url-del-repo>
cd mi-concurso-monorepo

# Instala las dependencias de TODOS los paquetes del workspace
pnpm install

# Compila los tipos compartidos (backend y frontend dependen de ellos)
pnpm --filter @concurso/shared-types build
```

Después, en terminales separadas:

```bash
# Terminal 1: tipos compartidos en modo watch
pnpm dev:types

# Terminal 2: backend NestJS en modo desarrollo
pnpm --filter backend start:dev

# Terminal 3: frontend Angular
pnpm --filter frontend-staff start
```

> El backend necesita PostgreSQL y Redis. Levántalos con Docker desde `apps/backend`:
> `docker compose -f apps/backend/docker-compose.yml up -d`

---

## 5. Ejecutar scripts

### Desde la raíz del monorepo

Scripts definidos en el `package.json` raíz:

| Comando          | Qué hace                                                     |
| ---------------- | ------------------------------------------------------------ |
| `pnpm build`     | Ejecuta `build` en **todos** los paquetes (`pnpm -r build`)  |
| `pnpm dev:types` | Compila `@concurso/shared-types` en modo watch               |

### En un paquete concreto con `--filter`

`--filter` (o `-F`) ejecuta un comando solo en el paquete indicado, **sin tener que hacer `cd`**:

```bash
pnpm --filter backend start:dev
pnpm -F backend test
pnpm -F backend lint
pnpm -F frontend-staff build
pnpm -F @concurso/shared-types build
```

Scripts útiles por paquete:

**backend**

| Script        | Descripción                        |
| ------------- | ---------------------------------- |
| `start:dev`   | Nest en modo watch                 |
| `start:debug` | Nest en modo debug + watch         |
| `build`       | Compila a `dist/`                  |
| `start:prod`  | Ejecuta `dist/main`                |
| `test`        | Tests con Vitest                   |
| `test:watch`  | Tests en modo watch                |
| `test:cov`    | Tests con cobertura                |
| `test:e2e`    | Tests end-to-end                   |
| `lint`        | Oxlint                             |
| `format`      | Prettier                           |

**frontend-staff**

| Script  | Descripción                  |
| ------- | ---------------------------- |
| `start` | `ng serve` (servidor de dev) |
| `build` | `ng build`                   |
| `watch` | Build en modo watch          |
| `test`  | `ng test`                    |

**@concurso/shared-types**

| Script  | Descripción               |
| ------- | ------------------------- |
| `build` | Compila con `tsc`         |
| `dev`   | `tsc --watch`             |

### Desde dentro de la carpeta del paquete

También puedes entrar en la carpeta y ejecutar el script directamente:

```bash
cd apps/backend
pnpm start:dev      # equivalente a "pnpm run start:dev"
```

### En todos los paquetes a la vez

```bash
pnpm -r build                 # recursivo, respeta el orden de dependencias
pnpm -r --parallel dev        # en paralelo (útil para modos watch)
pnpm -r test                  # tests en todos los paquetes que tengan script "test"
```

> `pnpm -r` compila primero `shared-types` y después las apps que dependen de él, porque pnpm conoce el grafo de dependencias.

### Ejecutar binarios sin instalarlos globalmente

```bash
pnpm -F backend exec nest generate module usuarios   # usa el Nest CLI local
pnpm -F frontend-staff exec ng generate component foo
pnpm dlx <paquete>    # equivalente a "npx": descarga y ejecuta una sola vez
```

---

## 6. Gestionar dependencias

### Añadir una dependencia a un paquete

```bash
# Dependencia normal en el backend
pnpm -F backend add dayjs

# Dependencia de desarrollo en el frontend
pnpm -F frontend-staff add -D @types/lodash

# Dependencia en la raíz del monorepo (herramientas globales como prettier, husky…)
pnpm add -D -w prettier
```

- `-D` → `devDependencies`
- `-w` (`--workspace-root`) → instalar en el `package.json` raíz. Sin `-w`, pnpm no deja instalar en la raíz por seguridad.

> Como `.npmrc` tiene `save-exact=true`, las versiones se guardan **exactas** (`1.2.3` en lugar de `^1.2.3`).

### Enlazar un paquete del workspace con otro

Para que una app use `@concurso/shared-types`:

```bash
pnpm -F backend add @concurso/shared-types --workspace
```

Esto escribe en el `package.json`:

```json
"@concurso/shared-types": "workspace:*"
```

El protocolo `workspace:*` significa "usa siempre la versión local de este monorepo". pnpm crea un enlace simbólico, así que los cambios en `packages/shared-types` se ven al instante en las apps (tras recompilar `dist/`, por eso existe `pnpm dev:types`).

### Eliminar y actualizar

```bash
pnpm -F backend remove dayjs         # eliminar
pnpm -F backend update dayjs         # actualizar respetando el rango
pnpm -F backend update dayjs --latest  # saltar a la última versión
pnpm outdated -r                     # ver qué está desactualizado en todo el repo
pnpm update -r -i --latest           # actualización interactiva en todo el repo
```

### Consultar dependencias

```bash
pnpm list -r --depth 0         # dependencias directas de cada paquete
pnpm why -r typescript         # ¿quién instala este paquete y por qué?
```

---

## 7. Scripts de build de dependencias (`allowBuilds`)

Por seguridad, pnpm **no ejecuta automáticamente** los scripts `postinstall` de las dependencias (compilación de binarios nativos, telemetría, etc.). En `pnpm-workspace.yaml` se declara explícitamente qué paquetes pueden hacerlo:

```yaml
allowBuilds:
  '@parcel/watcher': false
  '@scarf/scarf': false
  bcrypt: false
  esbuild: false
  lmdb: false
  msgpackr-extract: false
```

- `true` → pnpm ejecutará el script de build de ese paquete.
- `false` → se bloquea (el paquete usa sus binarios precompilados).

Si al instalar ves un aviso de *"Ignored build scripts"* para un paquete nuevo, puedes revisarlo y aprobarlo con:

```bash
pnpm approve-builds
```

Solo aprueba paquetes en los que confíes.

---

## 8. El lockfile (`pnpm-lock.yaml`)

- Hay **un único lockfile** para todo el monorepo, en la raíz.
- **Siempre se commitea** junto con los cambios en cualquier `package.json`.
- En CI o para reproducir exactamente un entorno, usa:

  ```bash
  pnpm install --frozen-lockfile
  ```

  Falla si el lockfile no coincide con los `package.json`, en lugar de modificarlo.

- Si hay conflictos de merge en el lockfile, normalmente basta con resolver los `package.json` y ejecutar `pnpm install` para regenerarlo.

---

## 9. `app-competidores` (Python)

`apps/app-competidores` es una aplicación Python con `requirements.txt` y un `venv`. **No tiene `package.json`**, así que pnpm la ignora aunque esté dentro de `apps/*`. Sus dependencias se gestionan con `pip`:

```bash
cd apps/app-competidores
source venv/bin/activate         # en fish: source venv/bin/activate.fish
pip install -r requirements.txt
```

---

## 10. Solución de problemas

| Problema | Solución |
| --- | --- |
| `Cannot find module '@concurso/shared-types'` | Compila los tipos: `pnpm -F @concurso/shared-types build` |
| Los cambios en `shared-types` no se reflejan | Ten corriendo `pnpm dev:types` (recompila `dist/` al guardar) |
| `ERR_PNPM_ADDING_TO_ROOT` | Añade `-w` si de verdad quieres instalar en la raíz, o usa `-F <paquete>` |
| Un paquete importa algo que "debería estar instalado" pero falla | pnpm es estricto: añádelo al `package.json` de ese paquete con `pnpm -F <paquete> add <dep>` |
| `node_modules` en estado raro | `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install` |
| Store corrupto o muy grande | `pnpm store prune` |
| Versión de pnpm incorrecta | `corepack prepare pnpm@latest --activate` |

---

## 11. Chuleta rápida

```bash
pnpm install                          # instalar todo
pnpm install --frozen-lockfile        # instalar sin tocar el lockfile (CI)
pnpm build                            # build de todo el monorepo
pnpm dev:types                        # shared-types en watch
pnpm -F backend start:dev             # backend en desarrollo
pnpm -F frontend-staff start          # frontend en desarrollo
pnpm -F backend test                  # tests del backend
pnpm -F backend add <dep>             # añadir dependencia
pnpm -F backend add -D <dep>          # añadir devDependency
pnpm add -D -w <dep>                  # añadir a la raíz
pnpm -F backend remove <dep>          # quitar dependencia
pnpm -r <script>                      # script en todos los paquetes
pnpm outdated -r                      # ver dependencias desactualizadas
pnpm why -r <dep>                     # por qué está instalada una dependencia
pnpm dlx <paquete>                    # ejecutar un paquete sin instalarlo
```

Documentación oficial: <https://pnpm.io/motivation>
