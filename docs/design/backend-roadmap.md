# Orden de implementación del backend

## Contexto
Ya está la administración: ediciones, salas, categorías, lenguajes, equipos, problemas y login de staff. Falta el núcleo del concurso: login de equipos, el juez, los envíos, el reloj, el marcador y el tiempo real. Este plan ordena ese trabajo según las dependencias. La meta es llegar a un primer simulacro completo: un equipo entra, envía código, recibe veredicto y aparece en el marcador.

Hallazgos que cambian el orden:
- El worker no existe. Solo está `BullModule.forRootAsync`. La base para construirlo es `scripts/judge-bench/{bench.mjs,runner.c}`.
- `problem.entity.ts` y el seeder de lenguajes leen la entrada por stdin y escriben por stdout. El diseño de `judge-evaluation.md` pide problemas por función, con entrada y salida en JSON.
- Hoy no se puede publicar ningún problema. `findPublishErrors` exige un testset `READY`, y nada en el código llena testsets.
- Los frontends todavía no consumen el backend. Los tipos de Submission en `packages/shared-types` están desactualizados.
- Bugs:
  - `teams.service.ts:169` (`resetPassword`) guarda la contraseña en claro.
  - `auth/guards/auth.guard.ts` tiene errores y nadie lo usa.

## Fases

0. **Decisiones y limpieza (S).** Resolver las decisiones abiertas de abajo. Borrar `auth.guard.ts`. Arreglar `resetPassword`. Rehacer los contratos en shared-types: Submission, Verdict, Standings y TeamLogin.
1. **Seguridad y accesos (M).**
   - `JwtAuthGuard` como APP_GUARD global, con `@Public()` en login, refresh, logout y health.
   - `EditionStaffService.assertRole(userId, editionId, roles[])`, que generaliza `assertCanJudge`, aplicado dentro de los servicios.
   - `/staff`, `/languages` y `POST /editions` solo para superadmin.
   - Staff CRUD y la relación ManyToOne a `StaffUser`.
   - `teamLogin`, logout y me para equipos, con `AccessTokenPayloadFactory.forTeam` y un `TeamSessionGuard`.
   - Las tres validaciones TODO (salas, categorías y RF-06).
2. **Contenido y testsets (M, puede ir en paralelo con la fase 1).**
   - Tabla `blob(sha, bytes)` para guardar contenido.
   - `TestsetsService` para casos manuales, solución de referencia, límites y build.
   - Mostrar los ejemplos públicos en el preview (`problems.service.ts:170`).
3. **Runner y worker (L, ruta crítica).**
   - `src/worker.ts`, `WorkerModule`, y las colas `submissions` y `testset-build`.
   - `DockerRunner` portado de `bench.mjs`: cpuset, tiempo de CPU, detección de MLE y límites de salida.
   - Job de build que corre la solución oficial y deja el testset en `READY`.
4. **Concurso en vivo (M-L).** Programar la edición. Contest-clock con start, pause y finish; hace falta la columna `paused_total_ms`. Entidad `Submission` con el testset fijado. `POST /submissions`. judging-events. Gateway de Socket.io.
5. **Marcador (M).** `StandingsService` por categoría, con congelamiento. Vista pública para el proyector y actualizaciones por Socket.io.
   → **Simulacro 1**
6. **Resiliencia del juez (L).** Rejudge, que es obligatorio antes del concurso real. Confirmar los TLE en exclusiva. Cola de revisión manual. Checker y tolerancia. Generadores. Drivers por función.
7. **Integridad (M).** Heartbeat, procesos prohibidos, flags, `block_submissions_on_alert`, audit con un interceptor y exports.
8. **Producción (S-M).** Migraciones TypeORM, credenciales de Observe por env, `health` (BD y Redis), compose con API y worker separados.

## Decisiones tomadas (2026-10-24)
- **Formato:** por función desde el simulacro 1. Los drivers con tipos simples (`int`, `long`, `float`, `bool`, `string` y sus arrays) pasan a la ruta crítica, en la fase 3. Antes de la fase 2, a `Problem`/`Testset` hay que agregarles `signature`, `schema` y `compare_mode`.
- **Hash:** bcrypt. Hay que corregir los TODOs que dicen argon2.
- **Login de equipo:** se busca el `username` solo en ediciones `SCHEDULED`/`RUNNING`. Hay que validar que dos ediciones activas no repitan username.
- **Puntaje:** se define antes de la fase 5.
- Hecho: arreglado `resetPassword` y borrado `auth.guard.ts`.
- Fase 1 implementada (2026-10-24): guards globales `JwtAuthGuard` + `EditionRoleGuard` con decoradores en `auth/decorators/access.decorators.ts`, sesión de equipo con `session_id` en el JWT, CRUD de staff, relaciones a `StaffUser`, validaciones de borrado y `schedule` (RF-06 + usernames únicos entre ediciones activas). Pendiente correr `test/access.e2e-spec.ts` con Postgres.
- Fase 2 implementada (2026-10-24):
  - Tabla `blob` (contenido por sha256) en `src/blobs/`.
  - `Problem.signature`, y en `Testset` las columnas `schema`, `compare_mode` y `float_tolerance`. Se agregó el estado `DRAFT`, que es el único editable; un testset `READY` es inmutable y para cambiarlo se crea la v+1 con `POST /problems/:id/testsets`.
  - `TestsetsService` cubre firma, casos manuales, límites, esquema, `generate` (xoshiro128** con semilla `grupo:semilla`), solución oficial y `build`. El build encola en `testset-build` y deja el testset en `BUILDING`.
  - El preview ya muestra los ejemplos públicos.
  - Las salidas esperadas siempre salen de la solución oficial; el juez solo captura entradas.
  - Pendiente correr `test/testsets.e2e-spec.ts` con Postgres y Redis.
- Para la fase 3, el consumidor de `testset-build` debe:
  - Llenar `output_sha`, `output_bytes` y `ref_time_ms` de cada caso, y `ref_max_time_ms` del testset.
  - Dejar el testset en `READY`, o en `FAILED` con `build_log`.
  - Al quedar `READY`, mover `Problem.current_testset_id` a esa versión. Con el problema publicado, ese cambio implica rejudge (fase 6).

## Decisiones tomadas (2026-10-27)
- **Puntaje:** ICPC. Se ordena por problemas resueltos y luego por penalización: minutos hasta cada AC más 20 min por cada envío rechazado antes de ese AC. Un CE no suma penalización. Desempata el minuto del último AC.
- **Aviso del worker a la API:** `QueueEvents` de BullMQ. Los estados intermedios van con `job.updateProgress`.
- **Drivers:** los 6 lenguajes con tipos simples y sus arrays para el simulacro 1.
- Los e2e de las fases 1 y 2 pasan (50/50) con Postgres y Redis locales.
- **Corrección:** BullMQ 6 no puede cargar `ioredis` en ESM. Ahora `BullModule.forRootAsync` recibe un cliente `Redis` ya creado. Antes la cola nunca se conectaba y el build respondía 503.

## Decisiones abiertas originales
1. **Formato de los problemas.** Para el simulacro, stdin/stdout comparando por tokens (recomendado) o problemas por función desde el inicio.
2. **Hash de contraseñas.** Quedarse con bcrypt, que ya se usa en todo el código (recomendado), o migrar a argon2.
3. **`username` de equipo.** Hoy es único solo por edición y `TeamLoginDto` no trae la edición. Se puede hacer único global o limitar el login a ediciones `SCHEDULED`/`RUNNING`.
4. **Invalidar sesiones de equipo.** El JWT no guarda estado, así que un token reemplazado seguiría sirviendo. Propuesta: una columna `session_nonce` que vaya en el JWT y que el guard compare.
5. **Puntaje.** Por puntos (`Problem.points`) o ICPC con penalización. Falta definir también el desempate.
6. **Aviso del worker a la API.** Con `QueueEvents` de BullMQ o con Redis pub/sub.

## Verificación por fase
- Fase 1: e2e en `test/auth.e2e-spec.ts`. Una llamada sin token a editions, teams o staff da 401; el login de equipo funciona y un token reemplazado da 401.
- Fases 2-3: crear un testset con casos y la solución de referencia, lanzar el build y confirmar que queda `READY`. Después se puede publicar el problema.
- Fases 4-5: correr `pnpm seed:dev`, levantar la API y el worker, e iniciar la edición. Mandar un AC, un WA y un TLE por lenguaje, ver los veredictos por socket y revisar el marcador.
