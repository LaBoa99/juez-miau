# Contrato del backend para el frontend

> Generado leyendo `apps/backend` (NestJS). **Fuente de verdad: el backend.** No explica el código; solo el contrato.

- **Commit del documento:** `f78036e6bbc954fd8c4223169067584936d1fefc`
- **Fecha:** 2026-10-30
- **Cambios sin commit en `apps/backend` al generarlo:** ninguno (árbol limpio).

Para revalidar antes de confiar en una sección: `git diff --stat f78036e6bbc954fd8c4223169067584936d1fefc -- apps/backend` (más los cambios sin commit). Si el dominio no cambió, usa el documento.

## Convenciones globales

- **Prefijo:** todas las rutas HTTP cuelgan de `/api/v1` (`app.setGlobalPrefix('api/v1')`). En este documento las rutas se escriben sin el prefijo. El proxy de desarrollo mapea `/api` → `/api/v1`.
- **Validación:** `ValidationPipe` global con `whitelist + forbidNonWhitelisted + transform`. Un campo desconocido o un tipo inválido → **400** con `{ message: string[] }`. Cuerpo JSON hasta **16 MB**.
- **CORS:** `CORS_ORIGIN` (lista separada por comas), `credentials: true`.

### Autenticación
- **Access token** JWT en `Authorization: Bearer <token>`. Se guarda solo en memoria en el cliente.
  - Staff: expiración por defecto del `JwtModule`. Payload `{ sub, type:'staff' }`.
  - Equipo: expira en `JWT_TEAM_EXPIRES_IN` (def. 12h). Payload `{ sub, type:'team', sid }`; `sid` es la sesión del equipo: si se reemplaza o se cierra, el token deja de valer.
- **Refresh token** en cookie `refresh_token` httpOnly, `sameSite:'strict'`, `path:/api/v1/auth`, TTL `REFRESH_TOKEN_TTL_DAYS` (def. 7). El login de staff la emite; `/auth/refresh` da un nuevo access token; `/auth/logout` la borra.
- **Guard global `JwtAuthGuard`:** toda ruta exige token de **staff** salvo que esté marcada con un decorador. Tokens de equipo solo pasan en rutas `@AllowTeam()`. Sin token válido → **401**. Token de equipo en ruta solo-staff → **403**.
- **Guard global `EditionRoleGuard`:** corre después; solo actúa donde hay `@RequireEditionRole()` o `@SuperadminOnly()`.

### Roles
- **Superadmin:** campo global `is_superadmin` en el usuario de staff; pasa cualquier chequeo de rol. (Nota: hoy **no** se expone en `/auth/me` ni en el login — ver `## no-existe`.)
- **Roles por edición (`StaffRole`):** `ADMIN`, `JUDGE`, `OBSERVER`. Se asignan por edición en `edition_staff`.
- `ANY_EDITION_ROLE` = `[ADMIN, JUDGE, OBSERVER]`.

### Decoradores de acceso (en las tablas, columna "Quién")
| Decorador | Significado |
|---|---|
| (ninguno) | Cualquier token de **staff** autenticado. |
| `@Public()` | Sin token. Si llega uno válido queda en `req.user`. |
| `@AllowTeam()` | Acepta también token de **equipo** con sesión activa. |
| `@SuperadminOnly()` | Solo superadmin. |
| `@RequireEditionRole([roles], scope, param)` | Superadmin, o alguno de `roles` en la edición dueña del recurso. `scope`∈`edition\|room\|category\|team` indica de qué entidad (param de ruta) sale el `editionId`. |

### Errores comunes (no se repiten en cada tabla)
| Código | Cuándo |
|---|---|
| 400 | Validación del DTO / `ParseIntPipe` sobre un id no numérico. |
| 401 | Falta token, o token inválido/expirado. |
| 403 | Rol insuficiente, o token de equipo en ruta solo-staff. |
| 404 | Recurso inexistente (`<entidad> not found #id`). |

---

## auth

Base `/auth`. Tipos: `ILoginResponse`, `IStaffUser`, `IRefreshResponse`, `IMeResponse`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/auth/staff/login` | `@Public` | `{ email (IsEmail, ≤254), password (string, ≤128) }` | `{ accessToken, user:{ id, name, roles:[{editionId, role}] } }` + cookie `refresh_token` | 401 `Credenciales inválidas` (email, contraseña o usuario inactivo). |
| POST | `/auth/team/login` | `@Public` | `{ username (≤100), password (≤128), machineId (≤200) }` | `{ accessToken, sessionId, team:{ id, name, categoryId, editionId, roomId } }` | 401 `Credenciales inválidas`. |
| POST | `/auth/refresh` | `@Public` | — (usa cookie) | `{ accessToken }` | 401 `Sesión expirada` (cookie ausente/revocada o usuario inactivo). |
| POST | `/auth/logout` | `@Public` | — | 204 | — |
| GET | `/auth/me` | `@AllowTeam` | — | staff: `{ type:'staff', id, name, roles[] }`; equipo: `{ type:'team', id, name, team:{…} }` | 401 si staff inactivo. |

Reglas: el login de equipo reemplaza la sesión anterior del equipo; si cambia de máquina, levanta una alerta `SESSION_REPLACED`. `logout` con token de equipo cierra su `team_session`.

---

## editions

Base `/editions`. Tipos: `IEdition`, `IEditionListItem`, `IEditionDetail`, `ICreateEdition`, `IUpdateEdition`, `IScheduleEdition`, `IEditionScheduleResponse`, `EditionStatus`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/editions?status=` | staff | — | `IEditionListItem[]` (con `categories`) | — |
| POST | `/editions` | `@SuperadminOnly` | `ICreateEdition` | `IEdition` | — |
| GET | `/editions/:id` | `RequireEditionRole(ANY)` | — | `IEditionDetail` (con `categories`, `rooms`) | 404 |
| PATCH | `/editions/:id` | `RequireEditionRole([ADMIN])` | `IUpdateEdition` | `IEdition` | 409 si no es DRAFT/SCHEDULED. |
| POST | `/editions/:id/schedule` | `RequireEditionRole([ADMIN])` | `{ scheduled_start: ISO date }` | `IEditionScheduleResponse` | 400 fecha no futura; 409 `{message, errors[]}` o `edition can only be modified before it starts`. |
| DELETE | `/editions/:id` | `RequireEditionRole([ADMIN])` | — | 204 | 409 si no es DRAFT. |

**`ICreateEdition`:** `name` (≤255), `duration_ms` (int ≥1, **milisegundos**), `freeze_duration_ms` (int ≥0, **milisegundos**), `block_submissions_on_alert` (bool), `forbidden_processes?` (string[], ≤200, cada uno 1–100 chars **sin coma**). `IUpdateEdition` = todo opcional.

**Reglas:**
- **Estados:** `DRAFT → SCHEDULED → RUNNING ⇄ PAUSED → FINISHED` (el reloj los mueve, ver `## contest-clock`).
- **Editar (PATCH) y categorías/salones/etc.:** solo en `DRAFT` o `SCHEDULED`.
- **Eliminar:** solo en `DRAFT`.
- **Programar (`schedule`):** solo en `DRAFT`/`SCHEDULED`; `scheduled_start` debe ser futuro. Errores de negocio (409, lista en `errors`): sin duración (`duration_ms<=0`), sin problemas publicados, sin equipos, o usernames repetidos en otra edición activa (`SCHEDULED/RUNNING/PAUSED`). En `SCHEDULED` se puede reprogramar.
- **Unidades:** duración y congelamiento en **ms** en el backend; la UI los muestra/captura en minutos.
- `forbidden_processes`: nombres de proceso que el cliente del concursante reporta como alerta. `block_submissions_on_alert`: si hay una alerta abierta, se bloquean los envíos del equipo.

---

## categories

Rutas de alta/listado bajo la edición (`/editions/:editionId/categories`) y edición/borrado por id (`/categories/:id`). Tipos: `ICategory`, `ICreateCategory`, `IUpdateCategory`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| GET | `/editions/:editionId/categories` | `RequireEditionRole(ANY)` | — | `ICategory[]` |
| POST | `/editions/:editionId/categories` | `RequireEditionRole([ADMIN])` | `{ name (≤255), code (≤255) }` | `ICategory` |
| PATCH | `/categories/:id` | `RequireEditionRole([ADMIN], scope=category)` | `Partial<ICreateCategory>` | `ICategory` |
| DELETE | `/categories/:id` | `RequireEditionRole([ADMIN], scope=category)` | — | 204 |

`ICategory` = `{ id, edition_id, code, name, sort_order }`. Modificar categorías requiere edición en DRAFT/SCHEDULED.

---

## rooms

Alta/listado bajo la edición; edición/borrado por id. Tipos: `IRoom`, `IRoomListItem`, `ICreateRoom`, `IUpdateRoom`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| GET | `/editions/:editionId/rooms` | `RequireEditionRole(ANY)` | — | `IRoomListItem[]` (con `observers`) |
| POST | `/editions/:editionId/rooms` | `RequireEditionRole([ADMIN])` | `{ name (≤255), category_id? (int≥1 o null) }` | `IRoom` |
| PATCH | `/rooms/:id` | `RequireEditionRole([ADMIN], scope=room)` | `Partial<ICreateRoom>` | `IRoom` |
| DELETE | `/rooms/:id` | `RequireEditionRole([ADMIN], scope=room)` | — | 204 |

`IRoom` = `{ id, edition_id, category_id (number\|null), name }`. `category_id` null = salón sin categoría.

### Observadores del salón (`/rooms/:roomId/observers`)
| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| POST | `/rooms/:roomId/observers` | `RequireEditionRole([ADMIN], scope=room)` | `{ staff_user_id (int≥1) }` | `IRoomObserver` |
| DELETE | `/rooms/:roomId/observers/:staffUserId` | `RequireEditionRole([ADMIN], scope=room)` | — | 204 |

### Token de proyector (`/rooms/:roomId/board-token`)
| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| POST | `/rooms/:roomId/board-token` | `RequireEditionRole([ADMIN], scope=room)` | `IProjectorTokenResponse` = `{ token, url, qr_png (base64) }` |
| DELETE | `/rooms/:roomId/board-token` | `RequireEditionRole([ADMIN], scope=room)` | 204 |

El token en claro solo se devuelve al generarlo (en BD va su hash). **El backend todavía NO valida este token** (ver `## no-existe`).

---

## edition-staff

Base `/editions/:editionId/staff`. Tipos: `IEditionStaff`, `IEditionStaffListItem`, `ICreateEditionStaff`, `StaffRole`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| GET | `/editions/:editionId/staff` | `RequireEditionRole(ANY)` | — | `EditionStaff[]` (incluye `name`) |
| POST | `/editions/:editionId/staff` | `RequireEditionRole([ADMIN])` | `{ staff_user_id (int≥1), role (StaffRole) }` | `IEditionStaff` |
| DELETE | `/editions/:editionId/staff/:staffUserId` | `RequireEditionRole([ADMIN])` | — | 204 |

---

## edition-languages

Base `/editions/:id/languages`. Tipos: `IEditionLanguage`, `ILanguageSetEdition`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| GET | `/editions/:id/languages` | `RequireEditionRole(ANY)` | — | `IEditionLanguage[]` = `{ code, active, time_multiplier }` (sin `id`; se cruza con el catálogo por `code`) |
| PUT | `/editions/:id/languages` | `RequireEditionRole([ADMIN])` | `{ ids: string[] (UUID) }` | lenguajes habilitados |

Reemplaza el conjunto de lenguajes habilitados de la edición (ids del catálogo de `## languages`).

---

## teams

Alta/listado/importación bajo la edición; operaciones por id en `/teams/:id`. Tipos: `ICreateTeam`, `IUpdateTeam`, `ITeamListItem`, `ITeamsPage`, `ITeamImportValidation`, `ITeamImportResult`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/editions/:editionId/teams?categoryId&roomId&search&page&pageSize` | `RequireEditionRole(ANY)` | — | `ITeamsPage` = `{ items: ITeamListItem[], total }` | — |
| POST | `/editions/:editionId/teams/import/validate` | `RequireEditionRole([ADMIN])` | `multipart/form-data` campo `file` (CSV ≤5 MB) | `ITeamImportValidation` = `{ validRows, errors[], preview[] }` | 422 archivo inválido/grande. |
| POST | `/editions/:editionId/teams/import` | `RequireEditionRole([ADMIN])` | `file` (CSV ≤5 MB) | `ITeamImportResult` = `{ created, errors[], credentials[] }` | 422 |
| GET | `/teams/:id` | `RequireEditionRole(ANY, scope=team)` | — | equipo | 404 |
| PATCH | `/teams/:id` | `RequireEditionRole([ADMIN], scope=team)` | `IUpdateTeam` (`name?`, `room_id?`, `members?`) | equipo | — |
| POST | `/teams/:id/reset-password` | `RequireEditionRole([ADMIN], scope=team)` | — | `{ …, password }` (contraseña nueva en claro) | 404 |
| DELETE | `/teams/:id` | `RequireEditionRole([ADMIN], scope=team)` | — | 204 | — |
| DELETE | `/teams/:id/sessions` | `RequireEditionRole([ADMIN], scope=team)` | — | 204 (cierra sesiones del equipo) | — |

**`ICreateTeam`:** `name` (1–255), `category_id` (int+), `members: { name, career, semestre? }[]`. **`IUpdateTeam`:** miembros con `id` = editar, sin `id` = alta. `username` es único por edición (el login lo busca entre ediciones activas). `ITeamListItem` incluye `online` (sesión activa con heartbeat).

---

## staff

Base `/staff`, clase entera `@SuperadminOnly`. Tipos: `IStaffListItem`, `CreateStaffDto`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/staff?active=&search=` | superadmin | — | `IStaffListItem[]` | — |
| POST | `/staff` | superadmin | `{ name (≤255), email (IsEmail ≤254), password (8–128) }` | `{ id, name, email, active }` | 409 `El email … ya está registrado`. |
| PATCH | `/staff/:id` | superadmin | `Partial<CreateStaffDto>` | `{ id, name, email, active }` | 404; 409 email duplicado. |
| POST | `/staff/:id/deactivate` | superadmin | — | `{ id, active:false }` | 404 |

`IStaffListItem` = `{ id, name, email, active, isSuperadmin, createdAt }`. Desactivar no borra (conserva historial) y revoca sus refresh tokens. `search` busca por nombre o email (insensible a mayúsculas).

---

## languages

Base `/languages` (catálogo global). Tipos: `ILanguage`, `ICreateLanguage`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/languages` | staff | — | `ILanguage[]` | — |
| POST | `/languages` | `@SuperadminOnly` | `ICreateLanguage` | `ILanguage` | 400 `code`/`file_ext` no disponibles. |
| PATCH | `/languages/:uuid` | `@SuperadminOnly` | — | lenguaje con `active` invertido | 404 |

**`ICreateLanguage`:** `code` (≤100, se guarda en minúsculas), `image_ref`, `compile_cmd`, `run_cmd`, `compiler_version`, `flags?`, `file_ext` (1–4, `[a-z0-9]`), `time_multiplier` (número >0, ≤99.99, 2 decimales), `active?`. **PATCH solo alterna `active`**; no hay edición de los demás campos (ver `## no-existe`).

---

## problems

Alta/listado bajo la edición; detalle/edición por id; la firma vive en `/problems/:problemId/signature` (ver `## testsets`). Tipos: `IProblem`, `IProblemListItem`, `IProblemDetail`, `IProblemPreview`, `ICreateProblem`, `IUpdateProblem`, `ICreateProblemResponse`, `IPublishProblemResponse`, `IProblemSignature`, `ProblemStatus`.

| Método | Ruta | Quién | Body | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/editions/:editionId/problems?categoryId=` | staff (juez de la edición; se valida en el servicio) | — | `IProblemListItem[]` | 403 si no es juez. |
| POST | `/editions/:editionId/problems` | staff (juez) | `ICreateProblem` | `ICreateProblemResponse` = `{ id, status, testsetId }` | 409 letra ocupada; 404 categoría. |
| GET | `/problems/:id` | staff (juez) | — | `IProblemDetail` | 404 |
| PATCH | `/problems/:id` | staff (juez) | `IUpdateProblem` | `IProblem` | 409 letra ocupada. |
| GET | `/problems/:id/preview` | staff (juez) | — | `IProblemPreview` | 404 |
| POST | `/problems/:id/publish` | staff (juez) | — | `IPublishProblemResponse` = `{ status }` | 422 `{ errors[] }`. |
| DELETE | `/problems/:id` | staff (juez) | — | 204 | 409 si no es DRAFT. |

> Las rutas `/problems/:id*` no llevan decorador de rol: `ProblemsService` valida que el usuario sea juez de la edición del problema (`assertCanJudge`), si no → 403.

**`ICreateProblem`:** `categoryId` (int≥1), `letter` (`^[A-Z]{1,2}$`), `title` (≤255), `statement` (markdown, no vacío), `inputFormat`, `outputFormat`, `points?` (int 0–100000). **`IUpdateProblem`** = `Partial<{title, statement, inputFormat, outputFormat, letter}>` — **no** cambia `categoryId` ni `points`.

**Reglas:**
- Al crear nace también su **testset v1 vacío** (DRAFT); `testsetId` lo identifica.
- `letter` única por categoría dentro de la edición.
- **Estados** (`ProblemStatus`): `draft` → `published`. Eliminar solo en `draft`.
- **Firma (`IProblemSignature`)** (`PATCH /problems/:problemId/signature`, en `## testsets`): `{ functionName, params:[{name, type}], returns }`. `type` es `TypeRef`: `{type:'int'|'long'|'float'|'bool'|'string'}` o `{type:'array', items:TypeRef}` (arrays anidables hasta `MAX_TYPE_DEPTH`). Validaciones: `functionName` y cada `name` son identificadores (letras/dígitos/`_`, ≤64), sin palabras reservadas de C/C++/Java/Python/TS/C#, sin duplicados, y ningún parámetro igual al nombre de la función; **≤16 parámetros**. Solo se puede cambiar mientras el problema es **draft** y su testset actual es **editable** (DRAFT/FAILED), y los casos/esquema existentes deben seguir siendo compatibles con la nueva firma (si no, 422 con la lista).
- **Publicar valida** (422 `{errors}`): `statement`, `inputFormat` u `outputFormat` vacíos; firma sin definir; sin testset actual; el testset actual no está `ready`; sin solución de referencia; sin casos; sin casos públicos; casos sin salida esperada.
- `IProblemPreview` (vista del equipo): sin solución, generador, semilla ni casos ocultos; `samples` = casos públicos ya con salida; `limits` = `{timeLimitMs, memoryLimitMb}` del testset actual.

---

## testsets

Firma y nueva versión bajo `/problems/:problemId`; el resto bajo `/testsets/:id`. Tipos: `IProblemTestset`, `ITestsetDetail`, `ITestsetSummary`, `ITestCase`, `ITestCaseContent`, `ICreateTestCase`, `IUpdateTestCase`, `IUpdateTestset`, `ISetRefSolution`, `ISetChecker`, `ISetGenerator`, `ICreateTestsetVersion`, `IGenerateTestsetResponse`, `IProblemSource`, `TestsetStatus`, `TestCaseVisibility`, `TestCaseOrigin`, `CompareMode`.

| Método | Ruta | Quién | Body | Respuesta | Códigos |
|---|---|---|---|---|---|
| PATCH | `/problems/:problemId/signature` | juez de la edición | `IProblemSignature` | `IProblem` | 409/422 (ver `## problems`). |
| POST | `/problems/:problemId/testsets` | juez | `{ reason (≤500) }` | `ITestsetSummary` | 409 si el actual no es READY o ya hay una versión en progreso. |
| GET | `/testsets/:id` | juez | — | `ITestsetDetail` (con `cases`) | 404 |
| PATCH | `/testsets/:id` | juez | `IUpdateTestset` | `IProblemTestset` | 409 si no editable. |
| POST | `/testsets/:id/generate` | juez | — | `IGenerateTestsetResponse` = `{ generatedCount }` | 200; requiere `schema`. |
| PUT | `/testsets/:id/ref-solution` | juez | `{ languageId (UUID), source (≤256KB) }` | `IProblemSource` | — |
| PUT | `/testsets/:id/checker` | juez | `ISetChecker` (= ref-solution) | `IProblemSource` | — |
| DELETE | `/testsets/:id/checker` | juez | — | 204 | — |
| PUT | `/testsets/:id/generator` | juez | `ISetGenerator` | `IProblemSource` | — |
| DELETE | `/testsets/:id/generator` | juez | — | 204 | — |
| POST | `/testsets/:id/build` | juez | — | `ITestsetSummary` (status `building`) | **202**; 422 `{errors}`; 409 ya construyéndose / 503 no se pudo encolar. |
| POST | `/testsets/:id/cases` | juez | `ICreateTestCase` | `ITestCase` | 422 input inválido. |
| GET | `/testsets/:id/cases/:caseId` | juez | — | `ITestCaseContent` | 404 |
| PATCH | `/testsets/:id/cases/:caseId` | juez | `IUpdateTestCase` | `ITestCase` | 409/422 |
| DELETE | `/testsets/:id/cases/:caseId` | juez | — | 204 | — |

> Ninguna lleva decorador de rol: el servicio exige que el usuario sea **ADMIN o JUDGE** de la edición del problema.

**Estados (`TestsetStatus`):** `draft` → `building` → `ready` | `failed`.
- **Editable** = `draft` o `failed`. Todo lo que cambia casos, límites, esquema, firma, solución, checker o generador exige testset editable (si no, 409 `; create a new version`). Editar un `failed` lo regresa a `draft`. Un `ready` es **inmutable**: para cambiarlo se crea otra versión.

**Caso manual — `ICreateTestCase`:**
```
{ input: Record<string, unknown>,   // una llave por parámetro de la firma
  visibility?: 'public' | 'hidden' } // TestCaseVisibility; por defecto 'hidden'
```
- `input`: un valor por parámetro, validado contra la firma (`normalizeInput`): `int` entero de 32 bits; `long` de 64 bits (**valores fuera de ±2^53 como string**); `float` finito; `bool`; `string`; `array` anidado. Llaves faltantes o de más → 422.
- **`group`, `seed`:** null en los manuales (se asignan a los generados).
- **Orden (`ordinal`):** un manual nuevo se agrega al final (`max(ordinal)+1`).
- **La salida esperada (`.out`) NO se escribe a mano:** la **calcula la solución oficial al construir** (`build`); en `ITestCase` queda `outputSha`/`outputBytes` null hasta entonces, y el preview de casos muestra solo el input.
- `IUpdateTestCase`: en manuales se puede cambiar `input` y `visibility`; en generados solo `visibility`.

**Generador en código — `ISetGenerator`** = `{ languageId, source, groups: {name, seeds:number[]}[] }`. Es una función `generate(seed: long, group: string, index: int) -> string` (JSON del input, un campo por parámetro). `name` 1–32 (`[\w-]`), `seeds` 1..`MAX_TESTSET_CASES`. Los casos del generador **no existen hasta construir**: el build los crea. (El esquema declarativo `schema` + `generate` es una vía alterna que precrea casos; `generate` los materializa.)

**Checker — `ISetChecker`** (= ref-solution): función `check(<params>, expectedOutput, actualOutput) -> bool` en cualquier lenguaje. Necesario si `compareMode = 'checker'`.

**`IUpdateTestset`:** `timeLimitMs?` (100–30000, **ms**), `memoryLimitMb?` (16–2048, **MB**), `compareMode?` (`exact|tolerance|checker`), `floatTolerance?` (>0, ≤1, o null para quitar), `schema?` (null lo quita y borra casos generados), `manualReview?` (bool: los AC quedan `PENDING_REVIEW`), `reviewInstructions?` (≤2000 o null).

**Construir (`build`):** deja el testset en `building` (**202**) y encola el trabajo; el worker ejecuta la solución oficial sobre cada caso, llena las salidas y pasa a `ready` o `failed`. Valida antes (422 `{errors}`): sin firma, sin solución de referencia, `checker` sin checker, sin casos, o sin casos públicos.

**Progreso del build:** no hay endpoint de progreso; se consulta con **`GET /testsets/:id`** (el frontend hace polling cada ~2 s). `failed` trae `buildLog`.

**Activar una versión:** **no hay endpoint de activar**. El testset vigente del problema (`currentTestsetId`) cambia **automáticamente cuando un build termina en `ready`**. Si el problema está **publicado** y la versión vigente cambia, el worker **re-evalúa** los envíos. Por eso la única acción para volver vigente una versión nueva es **construirla** (sobre una versión DRAFT/FAILED; un `ready` es inmutable).

---

## contest-clock

Reloj de la edición. Tipos: `IContestClock`, `EditionStatus`.

| Método | Ruta | Quién | Respuesta | Errores |
|---|---|---|---|---|
| GET | `/editions/:editionId/clock` | `RequireEditionRole(ANY)` | `IContestClock` | 404 |
| GET | `/public/editions/:editionId/clock` | `@Public` | `IContestClock` | 404 |
| POST | `/editions/:editionId/clock/start` | `RequireEditionRole([ADMIN])` | `IContestClock` | 409 si no es `SCHEDULED`. |
| POST | `/editions/:editionId/clock/pause` | `RequireEditionRole([ADMIN])` | `IContestClock` | 409 si no es `RUNNING`. |
| POST | `/editions/:editionId/clock/resume` | `RequireEditionRole([ADMIN])` | `IContestClock` | 409 si no es `PAUSED`. |
| POST | `/editions/:editionId/clock/finish` | `RequireEditionRole([ADMIN])` | `IContestClock` | 409 si no es `RUNNING`/`PAUSED`. |

**`IContestClock`** = `{ editionId, status, elapsedMs, durationMs, freezeDurationMs, frozen, serverTime }`. `elapsedMs` no cuenta pausas; `serverTime` es para que el cliente corrija su reloj.

**Reglas/transiciones:** `start` SCHEDULED→RUNNING (se puede iniciar a mano antes de la hora); `pause` RUNNING→PAUSED; `resume` PAUSED→RUNNING; `finish` RUNNING|PAUSED→FINISHED. Un **tick** periódico (cada ~5 s) arranca las `SCHEDULED` cuya hora llegó y termina las `RUNNING` cuyo tiempo se acabó. Todas las transiciones son condicionales (409 si el estado cambió en medio). El marcador se congela en los últimos `freezeDurationMs`.

---

## submissions

Tipos: `ICreateSubmission`, `ISubmission`, `ISubmissionDetail`, `IStaffSubmission`, `IStaffSubmissionDetail`, `ISubmissionCase`, `ISubmissionHistoryEntry`, `IRejudge`, `IRejudgeProblem`, `IRejudgeResponse`, `IReviewSubmission`, `SubmissionStatus`, `Verdict`.

| Método | Ruta | Quién | Body | Respuesta | Códigos |
|---|---|---|---|---|---|
| POST | `/submissions` | `@AllowTeam` (solo equipo) | `{ problemId, languageId (UUID), source }` | `ISubmission` | **202**; 409 concurso no corriendo; 403 envíos bloqueados por alerta; 404 problema; 422 lenguaje/fuente; 429 cooldown. |
| GET | `/submissions` | `@AllowTeam` (equipo) | — | `ISubmission[]` (los suyos) | — |
| GET | `/submissions/:id` | `@AllowTeam` | — | equipo `ISubmissionDetail`; staff `IStaffSubmissionDetail` | 404 |
| GET | `/editions/:editionId/submissions?teamId&problemId&verdict&status&before&limit` | `RequireEditionRole(ANY)` | — | `IStaffSubmission[]` | — |
| POST | `/submissions/:id/rejudge` | staff (juez de la edición; servicio) | `{ reason (≤500) }` | `IRejudgeResponse` = `{ submissionIds }` | 202 |
| POST | `/problems/:problemId/rejudge` | staff (juez) | `{ reason, verdicts? }` | `IRejudgeResponse` | 202 |
| GET | `/submissions/:id/history` | staff (juez; servicio) | — | `ISubmissionHistoryEntry[]` | 404 |
| GET | `/editions/:editionId/review-queue` | `RequireEditionRole([ADMIN,JUDGE])` | — | `IStaffSubmission[]` | — |
| POST | `/submissions/:id/review` | staff (juez; servicio) | `{ accept (bool), comment? (≤1000) }` | `IStaffSubmission` (con el veredicto nuevo) | 200; 409 ya no está pendiente |
| POST | `/submissions/:id/manual-review` | staff (juez; servicio) | — | `IStaffSubmission` (queda `PENDING_REVIEW`) | 200; 409 no se puede mandar a revisión |
| GET | `/submissions/:id/reviews` | staff (cualquier rol; servicio) | — | `ISubmissionReview[]` (la más reciente primero) | 404 |
| GET | `/submissions/:id/cases/:ordinal` | staff (juez/admin; servicio) | — | `ISubmissionCaseDetail` | 403 otros roles; 404 |

**`ISubmissionCase`**: `{ ordinal, verdict, cpuMs, wallMs, memoryKb, exitCode, message }`. `message`: stderr del programa (RE/TLE/MLE) o un texto fijo del juez en WA (`rejected by the checker`, `the program ended without returning a result`, `the result is not valid JSON…`, `result…: expected <tipo>`); `null` en un WA por comparación normal. `exitCode` es `null` en casos juzgados antes de guardarlo.
**`ISubmissionCaseDetail`**: `{ ordinal, input, expected (null si no hay salida esperada), actual (salida canónica del equipo, ≤64 KB; null si no terminó bien o es anterior a guardarla) }`. Incluye casos ocultos: solo ADMIN/JUDGE.
**`ISubmissionReview`**: `{ id, verdict, reviewedBy, reviewerName, comment, createdAt }`. Cada `POST …/review` agrega una; el envío solo guarda la última en `reviewedBy/reviewedAt`.

**`ISubmission`** (equipo): `{ id, problemId, languageId, status, verdict, contestMs, maxTimeMs, maxMemoryKb, compileLog, reviewComment, createdAt, judgedAt }`. **`IStaffSubmission`** añade `teamId, testsetId, judgeRound, reviewedBy, reviewedAt, cases: ISubmissionCase[]`. Los `*Detail` añaden `source`.

**Reglas al crear:** el concurso debe estar `RUNNING` (`acceptsSubmissions`); si `block_submissions_on_alert` y el equipo tiene alerta abierta → 403; el problema debe estar `published`, ser de la **categoría del equipo** y tener testset vigente (si no, 404); el lenguaje debe estar activo, habilitado en la edición y con driver; `source` ≤ **64 KB**; **cooldown de 5 s** entre envíos del mismo equipo (429). Queda `QUEUED`; el veredicto llega por socket (`submission:update`).

**Estados (`SubmissionStatus`):** `QUEUED → JUDGING → DONE` (o `ERROR` si falla el sistema tras reintentos). **`Verdict`:** `AC, WA, TLE, MLE, RE, CE` (CE solo a nivel envío), `PENDING_REVIEW` (pasó lo automático y espera revisión de juez). `contestMs`/`maxTimeMs` en **ms**; `maxMemoryKb` en **KB**.

---

## review

Revisión manual. **No tiene controlador propio**: usa las rutas de `## submissions`:
- `GET /editions/:editionId/review-queue` (`RequireEditionRole([ADMIN,JUDGE])`) → `IStaffSubmission[]` pendientes (`PENDING_REVIEW`).
- `POST /submissions/:id/review` → `{ accept: boolean, comment?: string }` (`IReviewSubmission`). `accept:true` → `AC`; `false` → `WA` (cuenta como rechazo en la penalización). `comment` lo ve el equipo (`reviewComment`). Cada decisión queda en `GET /submissions/:id/reviews`.
- `POST /submissions/:id/manual-review` → manda a revisión un envío ya juzgado.

Un envío entra a revisión cuando su testset tiene `manualReview: true` (ver `## testsets`).

---

## standings

Marcador ICPC. Tipos: `IStandings`, `IStandingsCategory`, `IStandingsRow`, `IStandingsCell`.

| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| GET | `/public/editions/:editionId/standings` | `@Public` | `IStandings` (`view:'public'`, congelado en los últimos minutos) |
| GET | `/editions/:editionId/standings` | `RequireEditionRole(ANY)` | `IStandings` (`view:'staff'`, siempre completo) |

**`IStandings`** = `{ editionId, view:'public'|'staff', frozen, freezeMinute, generatedAt, categories: IStandingsCategory[] }`. Orden: más resueltos; luego menor penalización (minuto del AC + 20 por rechazo previo; CE no cuenta); luego AC más temprano. `IStandingsCell` trae `solved, rejected, acMinute, firstToSolve, pending`. En la vista pública, los envíos desde `freezeMinute` cuentan como `pending`.

---

## flags

Alertas de integridad. Definidas en `IntegrityController` (no hay controlador `flags` propio). Tipos: `IFlag`, `ICreateFlag`, `IResolveFlag`, `FlagType`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| GET | `/editions/:editionId/flags?open=&teamId=` | `RequireEditionRole(ANY)` | — | `IFlag[]` |
| POST | `/editions/:editionId/flags` | `RequireEditionRole(ANY)` | `{ teamId (int≥1), details (≤1000) }` | `IFlag` (tipo `MANUAL`) |
| POST | `/flags/:id/resolve` | staff con rol en la edición (servicio) | `{ note? (≤1000) }` | `IFlag` |

**`FlagType`:** `SESSION_REPLACED`, `FORBIDDEN_PROCESS`, `HEARTBEAT_LOST`, `MANUAL`. `IFlag` = `{ id, editionId, teamId, type, details, createdAt, resolvedAt, resolvedBy, resolutionNote }`. Filtro `open=true` = sin resolver. Las automáticas se deduplican; las `MANUAL` siempre se crean. Al crear/resolver se emite `flag:update` a la sala de staff. El filtro por salón se arma en el cliente (equipo → salón).

---

## integrity

Heartbeat del cliente del concursante. Tipos: `IHeartbeat`, `IHeartbeatResponse`.

| Método | Ruta | Quién | Body | Respuesta |
|---|---|---|---|---|
| POST | `/contest/heartbeat` | `@AllowTeam` (solo equipo) | `{ processes?: string[] }` | `IHeartbeatResponse` |

**`IHeartbeatResponse`** = `{ forbiddenProcesses: string[], nextHeartbeatMs, submissionsBlocked }`. El cliente lo manda cada **30 s** (`HEARTBEAT_EVERY_MS`); si no llega en **90 s** (`HEARTBEAT_LOST_AFTER_MS`) con el concurso corriendo, se levanta `HEARTBEAT_LOST`. Un proceso de `forbidden_processes` en `processes` → alerta `FORBIDDEN_PROCESS`. `submissionsBlocked` = hay alerta abierta y la edición bloquea envíos. No hay endpoint para leer heartbeats.

---

## audit

Bitácora de cambios (solo lectura). Registro automático por un interceptor global (mutaciones POST/PATCH/PUT/DELETE de staff), con el cuerpo saneado (sin contraseñas, tokens ni código). Tipos: `IAuditEntry`.

| Método | Ruta | Quién | Query | Respuesta |
|---|---|---|---|---|
| GET | `/audit` | `@SuperadminOnly` | `editionId?, staffUserId?, before?, limit? (1–500, def 100)` | `IAuditEntry[]` (orden id desc, paginación hacia atrás con `before`) |

`IAuditEntry` = `{ id, staffUserId, editionId, method, path, statusCode, body, createdAt }`.

---

## exports

CSV. Base `/editions/:editionId/exports`.

| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| GET | `/editions/:editionId/exports/standings.csv` | `RequireEditionRole(ANY)` | `text/csv` (`marcador.csv`) — marcador del staff, sin congelar. Celda: `minuto (+rechazos)` o `-rechazos`. |
| GET | `/editions/:editionId/exports/submissions.csv` | `RequireEditionRole([ADMIN,JUDGE])` | `text/csv` (`envios.csv`) — Envío, Equipo, Problema, Lenguaje, Veredicto, Estado, Minuto, Tiempo (ms), Memoria (KB), Rejudges, Fecha. |

Se descargan como blob con `Content-Disposition: attachment`.

---

## public

No existe un `PublicModule` con controlador; las rutas sin sesión viven en sus dominios con `@Public()`:
- `GET /public/editions/:editionId/clock` → `IContestClock` (ver `## contest-clock`).
- `GET /public/editions/:editionId/standings` → `IStandings` congelado (ver `## standings`).
- `GET /health` (ver `## health`).

El proyector (`/proyector/:editionId`) consume estas rutas públicas y el socket público; **no** hay validación del token de proyector todavía.

---

## health

| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| GET | `/health` | `@Public` | `IHealth`; **503** si la BD o Redis no responden. |

`IHealth` = `{ status:'ok'|'error', database:'up'|'down', redis:'up'|'down', judgeWorkers:number|null, queuedSubmissions:number|null }`. Timeout de 3 s por sonda.

---

## realtime

Socket.io, **namespace `/ws`**. Conexión: `io(url + '/ws', { auth: { token } })`. Mismo CORS que HTTP, `credentials: true`. Tipos: `SOCKET_EVENTS`, `IJoinEdition`, `ISubmissionProgress`, y los payload reusan `ISubmission`/`IStaffSubmission`, `IContestClock`, `IStandings`, `IFlag`.

**Autenticación (handshake):** el `token` va en `handshake.auth.token`.
- **Equipo:** al conectar entra automáticamente a su sala `team:<id>` y a la pública `edition:<editionId>:public`. Si el token/sesión es inválido, se desconecta.
- **Staff:** conecta y luego pide `edition:join` por cada edición que quiera seguir (se valida su rol).
- **Sin token (proyector):** conecta y pide `public:join`.

**Eventos cliente → servidor** (devuelven ack `{ok:true}` | `{ok:false, error}`):
| Evento (`SOCKET_EVENTS`) | Payload | Efecto |
|---|---|---|
| `edition:join` (`JOIN_EDITION`) | `{ editionId }` | Solo staff con rol en la edición. Une a `edition:<id>:staff` y `edition:<id>:public`. Error si no hay token staff o sin rol. |
| `public:join` (`JOIN_PUBLIC`) | `{ editionId }` | Cualquiera. Une a `edition:<id>:public`. Error si la edición no existe. |

**Eventos servidor → cliente** (salas: `team:<id>`, `edition:<id>:staff`, `edition:<id>:public`):
| Evento | Payload | Sala(s) |
|---|---|---|
| `submission:update` (`SUBMISSION_UPDATE`) | `ISubmission` (al equipo) / `IStaffSubmission` (al staff) | `team:<teamId>` y `edition:<id>:staff` |
| `submission:progress` (`SUBMISSION_PROGRESS`) | `ISubmissionProgress` = `{ submissionId, judged, total }` | `team:<teamId>` y `edition:<id>:staff` |
| `clock:update` (`CLOCK_UPDATE`) | `IContestClock` | `edition:<id>:public` (equipos + proyector + staff) |
| `standings:update` (`STANDINGS_UPDATE`) | `IStandings` (`view:'public'` o `'staff'`) | pública **y** staff (payload distinto por sala) |
| `flag:update` (`FLAG_UPDATE`) | `IFlag` | `edition:<id>:staff` (solo staff) |

Regla de uso: cargar por HTTP al entrar, actualizar con eventos, dejar de escuchar al salir.

---

## no-existe

Lo que el frontend podría pedir y el backend **no** ofrece hoy:

- **`is_superadmin` en `/auth/me` y en el login:** `IStaffUser.isSuperadmin` existe en el tipo pero el backend **no lo envía**; llega `undefined` y se trata como `false`. El gating de superadmin en la UI no funciona hasta que se exponga.
- **Editar un lenguaje:** `PATCH /languages/:uuid` solo **alterna `active`**. No hay endpoint para editar `compile_cmd`, `run_cmd`, `image_ref`, `time_multiplier`, etc. (existe `UpdateLanguageDto` pero ninguna ruta lo usa).
- **Activar una versión de testset ya `ready`:** no hay endpoint; el vigente solo cambia construyendo una versión editable (ver `## testsets`).
- **Validación del token de proyector:** se genera y se guarda su hash, pero **ninguna ruta lo valida**; el proyector usa las rutas `/public/...` por `editionId`, sin token.
- **Listado público de ediciones, resultados públicos agregados o vista por salón:** no existen (el filtro por salón se arma en el cliente con equipo→salón).
- **Lectura de heartbeats / vista de monitoreo de conexión:** no hay endpoint; la pérdida se ve como alerta `HEARTBEAT_LOST`.
- **Catálogo de problemas general / "agregar desde catálogo":** no existe; los problemas se crean por edición.
- **`GET /problems/:id` para equipos:** no; el equipo ve los problemas por `GET /contest` (vista del concurso) con `IProblemPreview`.
