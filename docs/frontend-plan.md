Au# Plan del frontend — Panel de staff (Juez Virtual)

Leer este archivo solo cuando un prompt lo pida ("Haz el paso N de docs/frontend-plan.md").
Las reglas generales están en CLAUDE.md / docs/frontend-claude.md; este archivo NO las repite.

## Cómo trabajar un paso

1. Revisar primero el backend de ese dominio (controladores, DTOs, entidades, guards), incluidos cambios sin commit.
   El backend es la fuente de verdad: NO modificarlo. Si algo no coincide con este plan, avisar y esperar.
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
  modal que arma un campo por parámetro según su tipo.
- Generación: solo generador en código (`generate(seed, group, index)`) por ahora; el esquema declarativo queda fuera.
- Testset: DRAFT → BUILDING → READY / FAILED. READY es inmutable (se crea otra versión). compare_mode: exacto,
  tolerancia, checker.

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
| 11 | Problemas (+ firma de la función) | en curso |
| 12 | Casos de prueba | pendiente |
| 13 | Staff | pendiente |
| 14 | Lenguajes | pendiente |
| 15 | Tiempo real | pendiente |
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
