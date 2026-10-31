Au# Plan del frontend — Panel de staff (Juez Virtual)

Leer este archivo solo cuando un prompt lo pida ("Haz el paso N de docs/frontend-plan.md").
Las reglas generales están en CLAUDE.md / docs/frontend-claude.md; este archivo NO las repite.

## Cómo trabajar un paso

1. Lee la sección del dominio en docs/backend-api.md. Antes de confiar en ella, ejecuta
   git diff --stat <hash del documento> -- apps/backend (más los cambios sin commit). Si no cambió nada de ese dominio,
   usa el documento. Si cambió, revisa solo esos archivos, actualiza la sección y el hash, y avisa qué cambió.
   El backend sigue siendo la fuente de verdad: NO modificarlo.
2. Implementar solo lo del paso. Si falta algo en el backend, no inventarlo: dejarlo fuera o deshabilitado y avisar.
3. Tipos nuevos en @concurso/shared-types copiados del backend. Mocks del paso en src/app/dev/mocks/.
4. Terminar con `ng build` sin errores y la lista de archivos creados o cambiados.
5. Al terminar, marcar el paso como hecho en la tabla "Estado" de este archivo.

## Decisiones ya tomadas (no volver a preguntar)

### Generales
- Guards (authGuard, guestGuard, role.guard) implementados pero DESACTIVADOS hasta el paso Final. No activarlos antes.
- Navegación por rol (header y barra de la edición): preparada, no aplicada hasta el paso Final.
- Modo de prueba: `useMocks` en environments (true en dev, false en prod). Franja ámbar "Datos de prueba" en el shell.
- Patrón de formularios: CREAR con formulario inline a la derecha de la tabla ("Agregar…"). EDITAR, PROGRAMAR, VER
  DETALLES y CONFIRMAR con `oj-modal` / `oj-confirm-dialog`.
- Modales: siempre `showModal()`, nunca el atributo `open`; un modal a la vez; pie con `gap: 8px`.
- Acciones de fila: `ojButton variant="secondary" size="sm"`; destructivas `variant="danger-outline"`.
- Markdown: componente `oj-markdown` (marked + DOMPurify, o solo DOMPurify si el backend ya devuelve HTML).
  Nunca `bypassSecurityTrustHtml`.
- Fechas y horas en `oj-mono`. Duración y congelamiento: se muestran y capturan en MINUTOS; el backend usa ms.
- Valores no configurados (null o 0) se muestran como "—".

### Sesión
- Access token JWT (15 min) en el body, guardado solo en memoria (signal). Refresh en cookie httpOnly.
- `/auth/staff/login` → `{ accessToken, user }`. `/auth/refresh` → `{ accessToken }`. `/auth/logout` → 204.
- Prefijo `/api/v1`; el proxy de desarrollo mapea `/api` → `/api/v1`.

### Ediciones
- Estados: DRAFT → SCHEDULED → RUNNING ⇄ PAUSED → FINISHED. No se puede volver a DRAFT.
- `POST /editions/:id/schedule` guarda SOLO `scheduled_start` (futuro) y pasa a SCHEDULED. Solo en DRAFT o SCHEDULED.
  409 `{ message, errors[] }` si: duración <= 0, no hay problemas publicados, no hay equipos o hay usuarios repetidos
  en otra edición activa. En SCHEDULED se puede reprogramar con otra fecha.
- Duración y congelamiento se editan con el PATCH de la edición (Editar datos), en DRAFT o SCHEDULED.
- DELETE solo en DRAFT. El reloj solo arranca desde SCHEDULED; un tick cada 5 s arranca y termina solo.
- Anti-trampas: `forbidden_processes` (lista de textos) se edita en la pestaña "Anti-trampas" con un catálogo del
  frontend (`features/editions/anti-cheat/forbidden-processes.catalog.ts`) + "Otros procesos". No va en el alta.
- `block_submissions_on_alert`: checkbox en la pestaña Anti-trampas.
- Salones: observadores con endpoint aparte (`POST/DELETE /rooms/:roomId/observers/...`); se eligen en el formulario
  de agregar salón y en el modal de editar salón. Token de proyector: se genera, pero el backend NO lo valida todavía.

### Problemas y testsets
- Evaluación por FUNCIÓN: cada problema tiene firma (nombre de función, parámetros con tipo, tipo de retorno).
  La firma se edita en Problemas (sección "Firma de la función"); en Testsets solo se muestra con enlace "Editar firma".
- Casos manuales: JSON con un valor por parámetro de la firma (no archivos .in). Se agregan y editan en DRAFT con un
  modal que arma un campo por parámetro según su tipo. El DTO (`ICreateTestCase`) es solo `{ input, visibility? }`;
  **el caso manual NO lleva `group`** (solo los generados lo tienen) — enviarlo daría 400. El `ordinal` lo asigna el
  backend. La **salida esperada NO se escribe a mano: la calcula la solución oficial al construir**.
- Tipos que acepta la firma: escalares `int`, `long`, `float`, `bool`, `string` y `array` anidado de cualquiera de ellos.
  El backend valida: identificador (≤64, sin palabras reservadas), nombres de parámetro únicos, ≤16 parámetros, ningún
  parámetro igual al nombre de la función. El cliente valida lo mismo antes de enviar.
- Visibilidad de un caso: `public` ("Público (ejemplo del enunciado)") u `hidden` ("Oculto"); por defecto oculto.
- Condiciones para publicar un problema (las valida el backend; el panel las muestra como lista ✓/✕ y deshabilita
  "Publicar" mientras falten): firma definida · solución oficial cargada · testset vigente **READY** (que a su vez exige
  ≥1 caso, ≥1 caso público y todas las salidas calculadas). Enunciado/formatos vacíos no ocurren porque el formulario
  los exige.
- Estados del testset con pipe en español (`testsetStatus`): DRAFT→"Borrador" (neutral), BUILDING→"Construyendo"
  (warning), READY→"Lista" (success), FAILED→"Falló" (danger). Nunca el valor crudo.
- Errores del backend: se traducen con `core/http/backend-error.mapper` (ver "Reglas de errores y estados" en
  frontend-claude.md). Nunca se muestra el texto crudo en inglés; el original va a la consola.
- Generación: solo generador en código (`generate(seed, group, index)`) por ahora; el esquema declarativo queda fuera.
- Testset: DRAFT → BUILDING → READY / FAILED. READY es inmutable (se crea otra versión). compare_mode: exacto,
  tolerancia, checker.
- Modo "nuevo" de Problemas: la ruta `problemas/nuevo` NO lleva `:problemId`; el panel detecta el modo por el último
  segmento de su propia ruta (`route.url`), no por `paramMap`, para no disparar `GET /problems/0` y mostrar un error falso.
- La letra del problema se fuerza a mayúscula en el cliente (el backend valida `/^[A-Z]{1,2}$/`, hasta 2 letras).
  Puntos: solo se envían al crear; en edición el campo se muestra deshabilitado (el PATCH del backend omite `points`).
- "Activar una versión READY no vigente" (que el plan de §12 menciona) NO se implementa: el backend no expone endpoint
  para cambiar el testset vigente sin reconstruir. El vigente solo cambia al construir (`POST /testsets/:id/build`) una
  versión editable (DRAFT/FAILED). Por eso el panel de testsets solo ofrece "Construir", con confirmación de re-evaluación
  si el problema ya está publicado.
- `oj-segmented` acepta ahora un input `disabled` (se usa para deshabilitar "Vista previa" en el modo nuevo de Problemas).
- Navegación (header y barra de la edición): los enlaces nunca se subrayan (ni hover/visited/focus); el activo se marca
  solo con fondo (header) o borde inferior (barra). Se conserva el `outline` de `:focus-visible`.

### Staff (usuarios)
- `/staff` es superadmin-only en el backend. Página: tabla (Nombre, Correo mono, Alta mono AAAA-MM-DD, Estado badge) +
  formulario inline "Agregar usuario" (nombre, correo, contraseña ≥8). Filtros: "Solo activos" (default activado) y
  búsqueda con debounce 300 ms (nombre o correo). GET `/staff` NO pagina: se cargan todos.
- Editar en `oj-modal` (nombre, correo, contraseña opcional: vacía = no cambiarla; el PATCH acepta `Partial<{name,email,password}>`).
- **Desactivar es irreversible**: el backend solo expone `POST /staff/:id/deactivate` y el PATCH no acepta `active`.
  No hay "Reactivar" — por eso no se ofrece en la UI. "Desactivar" solo aparece en usuarios activos, con confirmación.
- La pestaña Staff de Configuración ya usaba este catálogo (`GET /staff`) con fallback silencioso; no tenía ningún aviso
  de "lista no disponible" que quitar.

### Lenguajes (catálogo global)
- `GET /languages` es para cualquier staff; `POST` y `PATCH` son superadmin-only. Se reutiliza `EditionLanguagesService`
  (ya tenía `catalog()`), extendido con `create()` y `toggleActive()`.
- Página: tabla (Lenguaje = `code` en 600 + `.ext` mono gris debajo; Imagen Docker mono; Compilar/Ejecutar en dos líneas
  mono, ejecutar en gris, "—" si no compila; Tiempo `×{mult}` a la derecha) + formulario inline "Agregar lenguaje"
  (nombre+extensión en la misma fila, campos técnicos mono, flags opcional, multiplicador, checkbox Activo).
- **El backend NO edita los campos de un lenguaje**: `PATCH /languages/:id` solo **alterna `active`** (ignora el body).
  Por eso "Editar" abre un `oj-modal` que muestra los campos en solo lectura y ofrece la única acción real:
  **Activar / Desactivar**. Si cambian los comandos, se crea un lenguaje nuevo (nota en el modal).
- El backend **no expone** si un lenguaje está en uso, así que no se puede deshabilitar "Editar" por uso (lo pide el
  diseño 08, pero no hay dato). Los inactivos se muestran atenuados y con "· inactivo" junto al nombre.

### Tiempo real (socket)
- `socket.io-client` **4.8.4** (servidor `socket.io` 4.8.3: mismo protocolo v4 / Engine.IO v6).
- `core/realtime/realtime.service.ts`: una conexión por pestaña al namespace `/ws`, creada al primer uso y cerrada al
  cerrar sesión (un `effect` la cierra cuando `AuthService` deja de estar autenticado). `auth` como función → relee el
  token en cada reconexión; al reconectar se repone a las salas (`joinEdition`/`joinPublic`). Métodos tipados:
  `onClock`, `onStandings`, `onSubmission`, `onSubmissionProgress`, `onFlag` (Observables). Señales `connectionState`
  (`connecting|connected|disconnected`) y `active`.
- Indicador en `oj-header` a la derecha del nombre: punto 8px + texto 12px "En vivo" (verde) / "Reconectando…" (ámbar) /
  "Sin conexión" (gris), solo cuando `rt.active()`.
- Proxy de desarrollo: se agregó `/socket.io` con `ws: true` en `src/proxy.conf.json` (no toca la regla de `/api`).
- `/dev/realtime` (fuera del shell, solo desarrollo): id de edición, "Unirse como staff/público" y los últimos 20 eventos.
- **No se agregó mock de eventos** (el plan lo sugería): la tarea pidió no agregar mocks; se prueba con el backend real
  vía `/dev/realtime`.
- **El backend NO emite un evento al terminar de construir un testset** (solo `clock/standings/submission*/flag`). Por eso
  el paso 12 mantiene el poll cada 2 s para el build; no hay evento que lo reemplace (paso 7 no aplica).

### Concurso en vivo y público
- Socket.io en `/ws`. Staff: `edition:join` (con token). Público: `public:join { editionId }` sin token.
- Eventos: `clock:update`, `standings:update` (público y staff), `submission:update`, `submission:progress`,
  `flag:update` (solo staff).
- Marcador ICPC: resueltos, luego penalización (minuto del AC + 20 por rechazo previo; CE no cuenta).
  Staff siempre completo; público congelado en los últimos minutos.
- Proyector: ruta pública `/proyector/:editionId` (por id, sin token). No hay marcador por categoría en el backend:
  la rotación por categoría se hace en el cliente.
- Alertas: `GET /editions/:id/flags` filtra solo por `open` y `teamId`. El filtro por salón se arma en el cliente
  (equipo → salón). No existe lectura de heartbeats; la pérdida se ve como alerta HEARTBEAT_LOST.
- NO existen en el backend: listado público de ediciones, resultados públicos agregados, vista por salón.

## Pantallas y rutas

Diseño de referencia: canvas "Juez Virtual — Panel de staff" (pantallas numeradas 01–17).

| Pantalla | Ruta | Carpeta |
|---|---|---|
| 01 Login | /login | features/auth/login-staff |
| 02 Ediciones | /ediciones | features/editions/pages/edition-list |
| 03 Configuración | /ediciones/:id/configuracion (pestañas: categorias, salones, lenguajes, staff, anti-trampas) | features/editions/pages/edition-layout, edition-detail |
| 04 Equipos | /ediciones/:id/equipos | features/teams |
| 05 Problemas | /ediciones/:id/problemas[/:problemId] | features/problems |
| 07 Casos de prueba | /ediciones/:id/problemas/:problemId/casos | features/testsets |
| 06 Staff | /staff | features/staff |
| 08 Lenguajes | /lenguajes | features/languages |
| 09 Concurso | /ediciones/:id/concurso | features/contest |
| 10 Envíos | /ediciones/:id/envios | features/submissions |
| 11 Detalle de envío | /ediciones/:id/envios/:submissionId | features/submissions |
| 12 Marcador | /ediciones/:id/marcador | features/standings |
| 13 Revisión | /ediciones/:id/revision | features/review |
| 14 Alertas | /ediciones/:id/alertas | features/flags |
| 15 Auditoría | /auditoria | features/audit |
| 16 Errores | /403 y ** | core/layout |
| 17 Proyector | /proyector/:editionId (fuera del shell, sin login) | features/projector |

Barra de la edición (todas las páginas de una edición): Configuración · Equipos · Problemas · Concurso · Envíos ·
Marcador · Revisión (contador ámbar) · Alertas (contador rojo).

## Estado

| Paso | Nombre | Estado |
|---|---|---|
| 0–4 | Base: tokens y componentes de shared/ui | hecho |
| 5 | Shell y rutas (header: Ediciones, Lenguajes, Staff, Auditoría) | hecho |
| 6 / 6.5 | Sesión / roles preparados | hecho |
| 7 | Login con diseño | hecho |
| Mocks | Modo de datos de prueba | hecho |
| 8 | Lista de ediciones | hecho |
| 9 – 9.3.2 | Configuración, programar, modales, observadores | hecho |
| 10 – 10.1 | Equipos y plantilla CSV | hecho |
| 11 | Problemas (+ firma de la función) | hecho |
| 12 | Casos de prueba | hecho (sin "Activar": no hay endpoint; el vigente cambia al construir — ver decisiones) |
| 13 | Staff | hecho (sin "Reactivar": el backend no lo permite — ver decisiones) |
| 14 | Lenguajes | hecho (sin edición de campos: el backend solo alterna `active` — ver decisiones) |
| 15 | Tiempo real | hecho (sin mock de eventos; sin evento de build — ver decisiones) |
| 16 | Control del concurso | pendiente |
| 17 | Envíos y detalle | pendiente |
| 18 | Marcador de staff | pendiente |
| 19 | Proyector | pendiente |
| 20 | Revisión manual | pendiente |
| 21 | Alertas | pendiente |
| 22 | Auditoría | pendiente |
| 23 | Páginas de error | pendiente |
| Final | Antes del deploy | pendiente |

(Ajustar esta tabla al estado real del proyecto.)

## Especificación de los pasos pendientes

### 11 · Problemas
- Columna izquierda (máx. 300px): problemas agrupados por categoría; botón con letra mono 700, título y badge
  Borrador/Publicado; seleccionado con aria-current. "+ Nuevo problema" (y "Agregar desde el catálogo" en modal si el
  backend usa catálogo general).
- Panel: "<letra> · <título>" + oj-segmented Editar / Vista previa.
  Editar: campos del backend; textos largos en textarea mono; sección "Firma de la función".
  Vista previa: endpoint de preview con oj-markdown; "Implementa: <firma>".
- Caja "Casos de prueba": versión vigente, estado, número de casos y "Gestionar casos de prueba" → /casos.
- Botones: Eliminar (danger-outline) | Guardar (secondary) · Publicar (success). Errores 422/409 en oj-alert.
- Confirmar si hay cambios sin guardar al cambiar de problema.

### 12 · Casos de prueba
- Izquierda: versiones (v<N> mono, nota, badge de estado), "+ Nueva versión desde v<vigente>".
- Panel: "Versión N" + badge; "Vigente para el concurso" en verde. Acciones según estado: Construir (DRAFT),
  Activar (READY no vigente, con confirmación sobre re-evaluación).
- Firma como referencia (mono) + "Editar firma". Sin firma: empty state y todo deshabilitado.
- Avisos: READY inmutable (info), BUILDING con progreso (consulta cada 2 s), FAILED con errores.
- Cajas: Evaluación (segmented Exacta / Con tolerancia / Checker, límites ms y MB) y Solución oficial + Generador en
  código (filas con archivo, lenguaje, hash corto y "Reemplazar" en modal).
- Tabla de casos: #, Origen, Grupo, Visibilidad (chip), Parámetros (resumen mono en una línea con title), Tiempo ref.
  "+ Agregar caso" (modal con un campo por parámetro). En DRAFT: Editar / Eliminar por fila.

### 13 · Staff
- Tabla (Nombre, Correo mono, Alta mono, Estado badge, Editar en modal, Desactivar danger-outline con confirmación)
  + formulario inline "Agregar usuario". Filtros: "Solo activos" y búsqueda con debounce.
- Nota gris: "Desactivar no borra al usuario: conserva su historial."

### 14 · Lenguajes
- Tabla (Lenguaje + extensión mono, Imagen Docker mono, Compilar/Ejecutar en dos líneas mono, Tiempo "×1.5", Editar
  en modal) + formulario inline "Agregar lenguaje". Respetar si un lenguaje usado no se puede editar.

### 15 · Tiempo real
- Instalar socket.io-client compatible con el servidor.
- core/realtime/realtime.service.ts: una conexión, auth como la espera el backend, joinEdition / joinPublic,
  re-unirse al reconectar, métodos tipados por evento, signal connectionState.
- Indicador en el header: punto + "En vivo" / "Reconectando…" / "Sin conexión".
- Proxy con ws: true. Mock que emite eventos falsos. Página /dev/realtime para probar.
- Regla: cargar por HTTP al entrar, actualizar con eventos, dejar de escuchar al salir.

### 16 · Control del concurso
- Tiempo calculado en el cliente con la diferencia contra la hora del servidor; resincronizar con clock:update.
- Reloj mono 72px; badge de estado; fila Inicio / Duración / Transcurrido / Congela marcador.
- Botones por estado: Iniciar ahora (success) · Pausar (warning) · Reanudar (success) · Finalizar (danger-outline con
  confirmación). Borrador: empty state con enlace a Configuración.
- Columna derecha: /health (workers, cola, BD, Redis cada 10 s) y enlace al proyector.
- Función compartida para formatear ms → HH:MM:SS.

### 17 · Envíos y detalle
- shared/pipes/verdict.pipe.ts (AC success; WA, CE, RE danger; TLE, MLE warning; cola/evaluando neutral;
  PENDING_REVIEW warning punteado). shared/ui/code-block (oj-code-block) con números de línea.
- Lista: 4 contadores, filtros (categoría, problema, equipo, segmentado por veredicto), tabla con progreso
  ("caso 4/20"), filas nuevas resaltadas 2 s, "Descargar CSV" como blob.
- Detalle: encabezado + badge; Descargar código; Re-evaluar (modal con motivo); fila de datos; cuadrícula de casos
  (10 columnas), esperado/obtenido, log de compilación; código; historial de evaluaciones.

### 18 · Marcador de staff
- shared/ui/standings-cell (oj-standings-cell) normal | grande: "+N · min" verde, "−N" rojo, "? N" ámbar.
- Segmentado por categoría; tabla #, Equipo, problemas, Resueltos, Penalización; aviso si el público está congelado;
  "Abrir proyector" y "Descargar CSV"; standings:update.

### 19 · Proyector
- Fuera del shell, sin guards, sin token. Encabezado grande con reloj; banda "Marcador congelado"; segmentado grande con
  rotación cada 20 s (pausable); tabla grande con oj-standings-cell grande; botón Pantalla completa; "Resultados
  finales" al terminar; mensaje si la edición no está disponible. Socket público + respaldo HTTP cada 30 s.

### 20 · Revisión manual
- Lista de pendientes (#id · minuto, letra, equipo, motivo ámbar) + panel con datos, "Por qué está en revisión",
  formulario de decisión (veredicto + nota) con confirmación. Contador en la barra de la edición.

### 21 · Alertas
- "Levantar alerta" (formulario inline). Filtros: Abiertas / Resueltas, salón (cliente), equipo.
- Tarjetas por alerta con borde por tipo, badge en español, mensaje en lenguaje sencillo, aviso de envíos bloqueados,
  "Resolver" en modal con nota. Contador rojo en la barra. flag:update en vivo.
- Vista de observador preparada (solo Envíos, Marcador, Alertas), sin aplicar.

### 22 · Auditoría
- Filtros (persona, acción, recurso, fechas) en barra muted; tabla Fecha mono, Persona, Acción (chip por método),
  Recurso mono, Resumen legible (mapeo en features/audit). Paginación.

### 23 · Páginas de error
- Página reutilizable 403 / 404 dentro del shell; '**' muestra 404; role.guard → /403; interceptor de errores:
  403 → oj-alert, 404 del recurso principal → página 404.

### Final · Antes del deploy
- Activar authGuard, guestGuard y role.guard (Staff, Auditoría y rutas de superadmin).
- Navegación por rol en header, barra de la edición y botones de acción.
- useMocks false en prod; buscar en dist/ "Datos de prueba", "mock-api", "mock-realtime" y la contraseña de prueba.
- /dev/ui y /dev/realtime fuera de producción. URLs de API y socket desde environment.prod.
- Prueba completa contra el backend real con superadmin, admin, juez, observador y sin sesión.
