# Arquitectura y funcionamiento de la aplicación

- **Fecha:** 2026-10-28
- **Estado:** Descripción del estado actual del código (no es una propuesta)
- **Relacionado:** [design/judge-evaluation.md](design/judge-evaluation.md) · [design/server-specs.md](design/server-specs.md) · [../README-pnpm.md](../README-pnpm.md)

Este documento describe **qué es la aplicación, cómo funciona según el backend y qué stack usan el
backend y el frontend por separado**. Para el detalle del juez (ejecución en Docker, casos de prueba,
arquitectura API/worker) y del hardware del servidor, ver los documentos de diseño enlazados arriba;
aquí solo se resumen.

---

## 1. Qué es

Es un **sistema de gestión de concursos de programación** (estilo ICPC/competitivo). El personal
(*staff*) organiza **ediciones** de concurso; cada edición tiene **categorías**, **salones** (rooms),
**equipos** y **staff asignado**, además de un catálogo de **problemas** con sus **casos de prueba**
(testsets) y los **lenguajes** permitidos. Durante el concurso los equipos envían soluciones, un
**juez automático** las evalúa en contenedores Docker y se publica un **marcador**.

Es un **monorepo pnpm** con tres aplicaciones y un paquete de tipos compartidos:

| Carpeta | Paquete | Qué es |
|---|---|---|
| `apps/backend` | `backend` | API (y futuro worker) en **NestJS** |
| `apps/frontend-staff` | `frontend-staff` | Panel del staff en **Angular** |
| `apps/app-competidores` | — (Python, sin `package.json`, lo ignora pnpm) | App de competidores (gestionada con `pip`) |
| `packages/shared-types` | `@concurso/shared-types` | Interfaces y enums TypeScript compartidos entre back y front |

---

## 2. Cómo funciona (según el backend)

### Flujo general

1. **Autenticación del staff.** `POST /api/v1/auth/staff/login` valida email + contraseña (bcrypt).
   Devuelve un **access token JWT** (15 min) en el cuerpo y un **refresh token** en una **cookie
   httpOnly** (`refresh_token`, `SameSite=strict`, path `/api/v1/auth`). El cliente renueva el access
   token con `POST /auth/refresh` (lee la cookie) y cierra sesión con `POST /auth/logout` (revoca el
   refresh y borra la cookie). `GET /auth/me` (protegido por `JwtAuthGuard`) devuelve el usuario y sus
   roles por edición.
2. **Montaje de una edición.** El staff crea una edición (`POST /editions`) y le añade **categorías**,
   **salones** (con observadores y proyectores), **lenguajes** permitidos (`edition-languages`) y
   **staff** con rol por edición. Los **equipos** se dan de alta o se **importan por CSV**
   (`EditionTeamsController`, usa `csv-parse` + `multer`); cada equipo pertenece a una categoría y,
   opcionalmente, a un salón.
3. **Programación.** `POST /editions/:id/schedule` fija `scheduled_start`, `duration_ms` y
   `freeze_duration_ms` (congelado del marcador). La edición transita por estados `EditionStatus`
   (DRAFT → programada → en curso → finalizada).
4. **Problemas y casos de prueba.** El catálogo de **problemas** (CRUD en `ProblemsService`) y los
   **testsets** (entidades `Testset`, `TestCase`, `Generator`, `RefSolution`) definen entradas,
   salidas esperadas y la solución oficial. El diseño completo de generación y evaluación está en
   [design/judge-evaluation.md](design/judge-evaluation.md).
5. **Durante el concurso** (diseñado, aún no implementado como módulo): el equipo envía código →
   la API lo guarda y lo encola en **BullMQ/Redis** → un **worker** lo compila y ejecuta en Docker,
   un contenedor por núcleo → emite el **veredicto** (`AC`, `WA`, `TLE`, `RE`, `CE`, `PENDING_REVIEW`)
   → se notifica por **WebSocket** y se actualiza el marcador. Ver §6 de
   [design/judge-evaluation.md](design/judge-evaluation.md).

### Sesión de equipos

Los equipos tienen **una sola sesión activa a la vez** (entidad `team_session`, con índice único
parcial sobre `team_id` donde `ended_at IS NULL`). El login de equipo cerrará la sesión previa
(`end_reason` `replaced`) y puede generar una alerta si cambia la máquina. *El login de equipo está
pendiente de implementar* (ver §3).

### Convenciones de la API

- Prefijo global **`/api/v1`**; `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`
  (rechaza campos no declarados en los DTO) y `transform`.
- **CORS con credenciales** (el origen no puede ser `*` porque viaja la cookie); orígenes en
  `CORS_ORIGIN`. `cookie-parser` habilitado. Ver `apps/backend/src/app.setup.ts`.
- DTOs validados con **class-validator**; serialización con **class-transformer** (campos sensibles
  como `password`/`password_hash` marcados con `@Exclude`).

---

## 3. Mapa de módulos del backend (estado real)

| Módulo | Estado | Notas |
|---|---|---|
| `auth` | **Implementado (parcial)** | Login/refresh/logout/me de **staff** completos (JWT + cookie refresh, guards). **Login de equipo y `me` de equipo = TODO** (`NotImplementedException`). |
| `staff` | **Implementado** | Usuarios de staff (`StaffUser`), superadmin, activo/inactivo. |
| `editions` | **Implementado** | Ediciones + subdominios: `categories`, `rooms`, `room-observers`, `room-proyectors`, `edition-staff`, `edition-teams` (import CSV), `edition-languages`, `edition-problems`. |
| `teams` | **Implementado** | Equipos, miembros (`team-members`) y sesiones (`team-sessions`). |
| `languages` | **Implementado** | Catálogo de lenguajes (imagen Docker, comandos, `time_multiplier`). |
| `problems` | **Implementado** | CRUD de problemas + filtros + tests e2e. |
| `testsets` | **Entidades definidas** | `Testset`, `TestCase`, `Generator`, `RefSolution` (sin controlador/servicio aún). |
| `utils` | **Implementado** | `CsvService`, `PasswordService`, validadores, `CoolNames`. |
| `database/seeds` | **Implementado** | Seeders base (superadmin, lenguajes) y dev (ediciones, equipos, etc.). |
| `submissions`, `judging-events`, `standings`, `contest-clock`, `proctoring`, `integrity`, `flags`, `audit`, `exports`, `public`, `realtime`, `health` | **Declarados / stub** | `@Module({})` vacíos; funcionalidad aún por construir (ver "Pendiente" en los docs de diseño). |

---

## 4. Especificaciones — Backend

| Aspecto | Detalle |
|---|---|
| Lenguaje | **TypeScript 6** (módulos **ESM**, `"type": "module"`, imports con extensión `.js`) |
| Runtime | **Node.js 24** (según imágenes de despliegue) |
| Framework | **NestJS 12** (`@nestjs/common`, `core`, `platform-express`) |
| HTTP | Express 5 (`@nestjs/platform-express`), prefijo `api/v1`, `cookie-parser`, CORS con credenciales |
| ORM / BD | **TypeORM 1.x** + **PostgreSQL** (`pg`); tipos `citext`, `enum`, `bigint` (con `bigintTransformer`), `timestamptz`; `synchronize` activable por `.env` (migraciones pendientes para prod) |
| Colas | **BullMQ** (`@nestjs/bullmq`) sobre **Redis** |
| Autenticación | **JWT** (`@nestjs/jwt`, access 15 min) + refresh token en cookie httpOnly; hashing con **bcrypt**; cifrado reversible de contraseñas de equipo (scrypt, `PASSWORD_ADMIN_MASTERKEY`) |
| Validación / serialización | **class-validator** + **class-transformer** (`ValidationPipe` global whitelist) |
| Tiempo real | **WebSocket** vía `@nestjs/websockets` + `@nestjs/platform-socket.io` |
| Utilidades | **csv-parse** + **multer** (import de equipos por CSV), **qrcode** (URL de proyector) |
| Docs API | **Swagger** (`@nestjs/swagger`) |
| Config | `@nestjs/config` (`.env`, ver `apps/backend/.env.example`) |
| Pruebas | **Vitest** (unit + `test:e2e` con Supertest) |
| Lint / formato | **oxlint** (type-aware) + **Prettier** |
| Observabilidad | `@nestjs/observe` (tracing/logs/métricas) |

Puntos de entrada: `src/main.ts` (API). El **worker** de evaluación (`src/worker.ts`, `WorkerModule`,
`JudgeProcessor`) está en el diseño pero **aún no existe** en el código.

---

## 5. Especificaciones — Frontend (staff)

| Aspecto | Detalle |
|---|---|
| Lenguaje | **TypeScript 6** |
| Framework | **Angular 22** (componentes **standalone**, API de **signals**) |
| Bootstrap | `app.config.ts` con `provideRouter`; `routes` **aún vacío** |
| HTTP | `@angular/common/http` (`HttpClient`) — *el provider de HttpClient aún no está registrado* |
| Formularios | `@angular/forms` |
| Estado reactivo | **RxJS** |
| Tipos compartidos | `@concurso/shared-types` (protocolo `workspace:*`) |
| Pruebas | **Vitest** + **jsdom** |
| Build / dev | Angular CLI (`@angular/build`): `ng serve` (dev), `ng build` |
| Proxy | Las llamadas a `/api` se redirigen al backend (proxy de desarrollo) |

**Estado actual del frontend:** está en fase inicial. El componente raíz `App` (`src/app/app.ts`) es
el scaffold por defecto de Angular (título en un `signal` + `RouterOutlet`); `src/app/app.html`
contiene una **plantilla de login de staff** (marcado + estilos) todavía **sin lógica conectada**
(el `AuthService` previo se eliminó al reestructurar). Rutas y servicios de datos están por construir.

---

## 6. Lenguajes soportados por el juez (resumen)

Catálogo definido en el módulo `languages` y el seeder `base/language.seeder.ts`. Detalle y mediciones
en [design/server-specs.md](design/server-specs.md).

| Lenguaje | Imagen Docker | `time_multiplier` (orientativo) |
|---|---|---|
| C / C++ | `gcc:14` | 1.0 |
| Java | `eclipse-temurin:21-jdk` | ~2.5 |
| C# | `mcr.microsoft.com/dotnet/sdk:8.0` | ~1.5 |
| JavaScript / TypeScript | `node:24-slim` | 1.5 |
| Python | `python:3.12-slim` | 2.0 — *en diseño, sin seeder aún* |

---

## 7. Cómo ejecutar el proyecto

Resumen; la guía completa de pnpm está en [../README-pnpm.md](../README-pnpm.md).

```bash
# 1. Dependencias de todo el monorepo
pnpm install

# 2. Tipos compartidos (back y front dependen de ellos)
pnpm --filter @concurso/shared-types build   # o en watch: pnpm dev:types

# 3. Infraestructura del backend (Postgres + Redis)
docker compose -f apps/backend/docker-compose.yml up -d

# 4. Configurar el backend
cp apps/backend/.env.example apps/backend/.env   # y ajustar secretos/BD

# 5. Levantar (en terminales separadas)
pnpm --filter backend start:dev        # API NestJS → http://localhost:3000/api/v1
pnpm --filter frontend-staff start     # Angular   → http://localhost:4200
```

Para producción/despliegue hay Dockerfiles por app y un stack en `deploy/` (docker-compose + Caddy +
scripts de backup/restore).

---

## 8. Dónde seguir

- Diseño del juez y worker: [design/judge-evaluation.md](design/judge-evaluation.md)
- Requisitos de hardware y banco de pruebas (`scripts/judge-bench/`): [design/server-specs.md](design/server-specs.md)
- Flujo de trabajo con pnpm en el monorepo: [../README-pnpm.md](../README-pnpm.md)
