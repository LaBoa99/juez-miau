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
shared/ui: ojButton (directiva sobre <button> y <a>), oj-badge, oj-alert, oj-form-field, oj-segmented,
oj-page-header, oj-breadcrumb, oj-empty-state, oj-side-panel, oj-tab-nav, oj-confirm-dialog, oj-file-drop.
Tablas: <div class="oj-table-wrap"><table class="oj-table">. Números, fechas y códigos: clase oj-mono.
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
- **Probar el acceso** con: (a) un superadmin, (b) un staff sin ese rol, (c) sin sesión → cada uno debe ver/redirigir como corresponde.

## Antes de terminar una tarea
- ng build sin errores ni warnings nuevos.
- No tocar archivos fuera de lo que pide la tarea.
- Resumir qué archivos se crearon o cambiaron.
