# Panel de staff — Juez Virtual (Angular)

## Contexto
- App Angular del monorepo mi-concurso-monorepo. Carpeta: apps/frontend-staff
- Backend NestJS con prefijo /api/v1. El proxy de desarrollo mapea /api -> /api/v1.
- Tipos compartidos en @concurso/shared-types. Todo DTO nuevo se agrega ahí, copiando la forma del backend.
- Diseño: ver docs/design/DESIGN.md. Resumen: Inter + JetBrains Mono, bordes 1px, radio 4px, SIN sombras.

## Estructura (obligatoria)
src/app/
  core/      auth/, http/, layout/       -> servicios y piezas globales (sesión, interceptores, shell)
  shared/    ui/, pipes/, styles/        -> componentes de presentación, sin servicios ni HttpClient
  features/  <dominio>/data/             -> servicios HTTP del dominio
             <dominio>/pages/            -> páginas (componentes con datos)
             <dominio>/<dominio>.routes.ts
  dev/       ui-showcase/                -> página /dev/ui con todos los componentes

## Componentes existentes (reusar, no duplicar)
shared/ui: ojButton (directiva sobre <button> y <a>; variantes primary, secondary, danger, danger-outline, success),
oj-badge, oj-alert, oj-form-field, oj-segmented, oj-page-header, oj-breadcrumb, oj-empty-state, oj-side-panel,
oj-tab-nav, oj-confirm-dialog, oj-file-drop, oj-modal, oj-code-block (código con números de línea, solo lectura).
Tablas: <div class="oj-table-wrap"><table class="oj-table">. Números, fechas y códigos: clase oj-mono.
Regla: crear con formulario inline (Agregar…); editar, programar, ver detalles y confirmar con oj-modal.
Si hace falta un componente nuevo, propónlo y espera confirmación antes de crearlo.

## Estilos
- Variables de diseño en src/app/shared/styles/tokens.css (var(--oj-...)).
- Colores, tipografía, radios y espaciado SOLO con esas variables. Nada de colores hex sueltos.
- Sin box-shadow en ningún elemento.

## Reglas de Angular
- Componentes standalone, ChangeDetectionStrategy.OnPush, inject() en lugar de constructor.
- input(), output(), model(), computed() y signal(). Plantillas con @if / @for / @switch.
- shared/ui: un solo archivo <nombre>.component.ts con template y styles en línea.
  Si la plantilla pasa de ~30 líneas, se separa en carpeta con .html y .css.
- Páginas de features: carpeta con .ts, .html y .css.
- Selectores con prefijo oj-.
- shared/ no importa nada de features/. Las páginas no usan HttpClient directo: usan el servicio de su feature.
- No instalar librerías de UI (Material, PrimeNG, Tailwind, Bootstrap) ni otras dependencias sin preguntar.

## Accesibilidad
- <label for> en cada campo de formulario.
- Botones reales (<button type="button">), nunca div o span con click.
- aria-pressed en toggles, aria-current en la navegación activa, role="alert" en errores.

## Idioma
- Textos de la interfaz en español.

## Antes del deploy
Pendientes de seguridad/permisos que hoy están preparados pero NO activados:

- **Reactivar los guards de sesión**: quitar el atajo de `src/app/app.routes.ts` que desactiva `authGuard`/`guestGuard`
  (comentario `shortcut:`) y volver a poner `canActivate: [authGuard]` en el Shell (`''`) y `[guestGuard]` en `login`.
- **Backend debe exponer `is_superadmin`** en `/auth/me` y en el login de staff. Hoy no lo hace, así que
  `AuthService.isSuperadmin()` siempre es `false` y el gating de superadmin no funciona hasta que llegue ese flag.
- **Aplicar `superadminGuard`** (`core/auth/role.guard.ts`) en las rutas que en el backend son superadmin-only:
  - `/staff` → superadmin-only completo (`StaffController` es `@SuperadminOnly()` a nivel de clase).
  - `/ediciones` y `/lenguajes` son **mixtos**: su listado/lectura está abierto a cualquier staff autenticado, así que
    NO se gatea la ruta entera. Las acciones superadmin-only van a nivel de UI/acción, no de ruta:
    crear edición (`POST /editions`) y crear/editar lenguaje (`POST`/`PATCH /languages`). Editar dentro de una edición
    (schedule, borrar, subrecursos) es rol `ADMIN` de esa edición (usar `roleInEdition(editionId)`), con bypass de superadmin.
- **Header: mostrar solo los enlaces usables**: ocultar "Staff" si el usuario no es superadmin.
- **Barra de la edición por rol — vista de observador**: un OBSERVER solo debe ver Envíos, Marcador y Alertas
  (filtrar `sections` en `edition-layout` según `roleInEdition(editionId)`). Preparado pero NO aplicado hasta
  activar la navegación por rol (va junto con los guards diferidos).
- **Auditoría (`/auditoria`) es superadmin-only en el backend** (`AuditController` es `@SuperadminOnly()`): aplicar
  `superadminGuard` (`core/auth/role.guard.ts`) a la ruta `auditoria` en `app.routes.ts` y ocultar su enlace del header
  si el usuario no es superadmin (igual que "Staff"). Hoy la ruta está abierta mientras los guards siguen diferidos.
- **Probar el acceso** con: (a) un superadmin, (b) un staff sin ese rol, (c) sin sesión → cada uno debe ver/redirigir como corresponde.

## Revisión visual antes de terminar un paso
Cada paso debe revisar esta lista y reportar el resultado (qué se revisó y qué se corrigió):
- Los controles (input, select, textarea) usan los estilos globales de `styles.css`; no se ponen tamaños (font-size,
  height, padding) ni colores propios en ellos. El select se ve igual de alto que un input.
- Botones con `ojButton` (primary / secondary / success / danger-outline; `sm` en tablas). Ningún `<button>`/`<a>` de
  acción con estilo propio (nada de "link" subrayado ni "×" sueltos salvo la × interna de un chip o del modal).
- Botones agrupados con `.oj-actions` (gap 8px; 6px en filas de tablas) o con `gap` en su propio flex; nunca pegados ni
  separados con `margin` o espacios en el HTML.
- `oj-segmented` en tamaño `sm` (el `lg` es solo para el proyector).
- Solo colores de `tokens.css` (nada de hex/rgb/nombres en `.css` ni en `style=""`).
- Cada página muestra su título en todos sus estados (cargando, vacío, nuevo, edición, error).
- Navegación sin subrayado (ni hover/visited/focus); los enlaces de acción van como `ojButton`. Se conserva el
  `outline` de `:focus-visible`.
- Crear con formulario inline; editar, programar, ver detalles y confirmar con `oj-modal`; pie de modal con gap 8px.
- Estados vacíos con `oj-empty-state`; errores con `oj-alert`.
- Comparar con la pantalla correspondiente del diseño y anotar las diferencias.
- Al terminar un paso, revisar la consola del navegador: sin errores en rojo.
- Ningún mensaje crudo del backend ni valor técnico en inglés en pantalla: todo pasa por el traductor de errores y por
  pipes de estado en español.
- Las acciones con requisitos muestran la lista ✓/✕ antes y quedan deshabilitadas mientras falte algo.
- No mostrar controles que no hacen nada en el estado actual (por ejemplo, Vista previa antes de crear).

## Reglas de errores y estados
- **Nunca** se muestra en pantalla el texto crudo del backend ni valores técnicos en inglés (estados, códigos, mensajes
  de clase-validator). Todo error del backend pasa por `core/http/backend-error.mapper` (`backendMessage` para un string,
  `translateBackendError` para una lista con título). El mensaje original va SOLO a la consola.
- Los estados se muestran con pipes en español (`editionStatus`, `testsetStatus`, veredictos…), nunca el valor crudo del
  enum. El badge usa el `tone` del pipe.
- Si una acción tiene requisitos (p. ej. publicar), mostrarlos antes como lista con ✓ (`--oj-success`) / ✕ (`--oj-danger`),
  con el ícono `aria-hidden` y el estado también en texto, y deshabilitar la acción mientras falte algo.

## Reglas de datos y navegación
- Los datos que se muestran viven en signals; nada de propiedades normales con `OnPush`.
- Los parámetros de ruta se leen como signals de la ruta propia del componente (`toSignal` de `paramMap`/`url`) o con
  `withComponentInputBinding`; **nunca** con `snapshot`, `firstChild` ni `parent` (el snapshot del hijo puede llegar
  `undefined` al activarse la ruta). Si el componente es hijo de la página, lee el id en el hijo, no en el padre.
- Las cargas que dependen de la edición esperan a que exista su id (signal/servicio de la edición actual); nunca se pide
  con `undefined`/`null`.
- Las suscripciones se limpian solas (`toSignal` o `takeUntilDestroyed`) y manejan errores (callback `error:`).
- Toda página tiene estados de cargando, vacío y error; nunca queda en blanco (muestra al menos el título y "Cargando…").
- Navegar entre rutas hijas de la misma página recarga sus datos sin recargar el navegador (reacciona al cambio de ruta).
- Después de crear, editar o eliminar, la vista se actualiza sin recargar (volver a pedir la lista o actualizar el signal).

## Tiempo real (RealtimeService)
- Una sola conexión Socket.io por pestaña (`core/realtime/realtime.service.ts`, namespace `/ws`). Se crea al primer uso
  (`joinEdition` / `joinPublic` / `onXxx`) y se cierra sola al cerrar sesión. El token sale de `AuthService` y se vuelve
  a leer en cada reconexión; las salas se reponen al reconectar.
- **Regla de oro**: cargar por HTTP al entrar, actualizar con los eventos, y dejar de escuchar al salir (desuscribir los
  Observables con `takeUntilDestroyed` o `toSignal`). Los eventos no sustituyen la carga inicial.
- Uso típico en una página de una edición:
  ```ts
  constructor() {
    this.rt.joinEdition(this.editionId);                     // o joinPublic en el proyector
    this.rt.onStandings().pipe(takeUntilDestroyed()).subscribe((s) => this.standings.set(s));
    this.rt.onClock().pipe(takeUntilDestroyed()).subscribe((c) => this.clock.set(c));
  }
  ```
  Métodos tipados: `onClock`, `onStandings`, `onSubmission`, `onSubmissionProgress`, `onFlag`. Estado de conexión:
  `connectionState()` (`connecting|connected|disconnected`) y `active()` (hay una edición seguida). El indicador "En vivo"
  del header ya los usa; no lo dupliques.
- No existe evento de "testset construido": el progreso del build se sigue por HTTP (poll cada 2 s en Casos de prueba).

## Antes de terminar una tarea
- ng build sin errores ni warnings nuevos.
- No tocar archivos fuera de lo que pide la tarea.
- Resumir qué archivos se crearon o cambiaron.
