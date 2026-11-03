# Cliente de concursantes (app de equipo)

## Contexto
El backend ya tiene envíos, juez, reloj, marcador, tiempo real e integridad. `apps/app-competidores` está vacío: solo hay un `requirements.txt` con PySide6 y PyInstaller. Este documento fija qué hace la app de equipo, qué muestra, qué oculta y qué corre en segundo plano, antes de escribir código.

Requisitos no funcionales:
- Debe ser portable entre equipos Windows 10/11.
- Debe compilarse en un solo `.exe`.
- Debe acceder al sistema: procesos, monitores, USB y red.
- Debe ser ligera, para preparar más de 90 equipos rápido.

## Decisiones cerradas

- **Stack:** PySide6 con QtWidgets nativos, sin QtWebEngine, porque mete Chromium y pasa de 150 MB. Primero que funcione; lo visual va después, y el diseño de Stitch solo sirve de referencia de colores y orden.
- **Dependencias:** usar `PySide6-Essentials` en lugar del metapaquete `PySide6`, porque `PySide6_Addons` trae WebEngine, Multimedia y otros módulos que no usamos. Además: `requests`, `python-socketio[client]` y `psutil`.
- **Build:**
  - PyInstaller `--onefile` en GitHub Actions (`windows-latest`); PyInstaller no compila en cruzado desde Linux.
  - Meta: menos de 60 MB.
- **Sin editor de código.** El concursante programa en su IDE. La app solo descarga problemas y sube archivos.
  - Por eso perder el foco o pegar desde el portapapeles es normal y **no** es señal de trampa.
- **Recursos que se vigilan:** procesos, monitores, USB y red.
- **Notificaciones:** como la app vive detrás del IDE, los veredictos llegan como notificación nativa de Windows con `QSystemTrayIcon.showMessage`.
- **Bandeja:** cerrar la ventana minimiza a la bandeja, para que no se pierda el heartbeat.
- **Clarificaciones:** se incluyen, pero dependen de un módulo nuevo en el backend.

## Arquitectura

### Patrón
- **MVC con servicios en lugar de modelo:** los servicios hacen la lógica y la red, las vistas solo tienen widgets, y los controladores los unen.
- **Command:** cada acción del usuario es un objeto `Command`.
  - El `CommandInvoker` lo corre en `QThreadPool` y emite `succeeded` o `failed`.
  - Los eventos que no vienen del usuario (socket y heartbeat) no son Commands. El servicio emite una señal Qt y el controlador reacciona.

```
Vista --señal--> Controlador --crea--> Command --Invoker/QThreadPool--> Servicio --HTTP--> backend
  ^                   |                                                     |
  +---actualiza-------+<------------ succeeded / failed --------------------+

realtime_service / integrity_service --señal Qt--> Controlador --> Vista + toast
```

### Estructura
```
apps/app-competidores/
├── app.py                         arranque: config, QApplication; conecta servicios → controladores → vistas
├── services/                      lógica y acceso a datos (sin widgets)
│   ├── api_client.py              requests.Session + token; errores HTTP → ApiError con mensaje
│   ├── auth_service.py            login (machineId), logout, me
│   ├── contest_service.py         GET /contest, reloj (offset con serverTime, congelado), marcador por categoría
│   ├── submission_service.py      submit, historial, detalle; lenguaje por extensión, validación de 64 KB
│   ├── realtime_service.py        cliente socketio a /ws (sus propios hilos) → señales Qt por evento
│   ├── integrity_service.py       hilo de heartbeat (psutil) mientras haya sesión; solo emite session_lost
│   └── notification_service.py    toasts con QSystemTrayIcon
├── commands/
│   ├── base.py                    Command + CommandInvoker
│   └── login.py load_contest.py load_submissions.py submit_solution.py save_template.py
├── controllers/
│   ├── session_controller.py      login, logout, sesión reemplazada (401)
│   ├── contest_controller.py      problemas, reloj, marcador
│   ├── submission_controller.py   envío, historial, veredictos en vivo + toast
│   └── integrity_controller.py    estado "envíos bloqueados"
├── views/                         solo widgets; emiten señales y nunca llaman servicios
│   └── login_view.py main_window.py problems_view.py attempts_view.py help_view.py style.py
├── tests/                         pytest de servicios y commands, sin abrir ventanas
├── PRODUCT.md                     contexto de producto para impeccable (diseño)
└── requirements.txt
.github/workflows/app-competidores.yml
```

### Hilos
| Hilo | Qué hace |
|---|---|
| Principal (Qt) | Vistas y controladores. Nadie más toca widgets. |
| `QThreadPool` | Commands (llamadas HTTP que pidió el usuario). |
| socketio (`realtime_service`) | Hilos propios de python-socketio, con reconexión automática; emiten señales Qt. |
| `integrity_service` | Heartbeat cada `nextHeartbeatMs` (30 s). |

- Los hilos se comunican solo con señales Qt, que son seguras entre hilos.
- El token vive únicamente en `api_client`.

## Qué muestra (contrato del backend)

| Pantalla | Fuente | Contenido |
|---|---|---|
| Login | `POST /auth/team/login {username, password, machineId}` | Token de 12 h sin refresh y una sesión por equipo. |
| Barra de estado | `GET /contest` (`clock`), `clock:update` | Equipo, categoría, estado del concurso, tiempo restante (offset con `serverTime`), aviso de congelado y estado de conexión/bloqueo. |
| Problemas | `GET /contest` | Letra, título, enunciado (markdown en `QTextBrowser`), formatos, `signature`, límites, ejemplos con botón de copiar. **"Descargar plantilla"** guarda el `starterCode` como archivo con la extensión del lenguaje; el concursante lo abre en su IDE y después lo sube. |
| Enviar | `POST /submissions` | Elegir archivo, lenguaje inferido por extensión (editable), validación de 64 KB y mensajes por código: 409 concurso no activo, 403 bloqueado, 404 problema no válido, 422 lenguaje o tamaño, 429 espera de 5 s. |
| Estado por problema | `GET /submissions`, `submission:update`, `submission:progress` | No hay un historial global. Cada problema muestra su estado (sin intentar, en juicio, aceptado, rechazado) y sus intentos: veredicto, progreso judged/total, tiempo, memoria, `compileLog` (solo en CE) y `reviewComment`. Ver "UX de problemas". |
| Marcador (pestaña) | `GET /public/editions/:id/standings`, `standings:update` | Lo mismo que se proyecta: solo la categoría del equipo, congelado igual que para el público. |
| Clarificaciones (pestaña) | `GET/POST /contest/clarifications`, `clarification:update` | Preguntas por problema; las respuestas son visibles para todos los equipos. |

## Qué NO muestra
Esta lista sale de revisar el HTML de Stitch.

| En el diseño | Motivo |
|---|---|
| Selector Admin/Juez/Equipo/Proyector | El cliente es solo para equipos. |
| Editor de código y botón "Limpiar" | Se programa en el IDE. |
| "Fallo en caso oculto #2 / 48", "WA (Caso 2)" | Filtraría los casos de prueba; el backend no lo manda al equipo. |
| "Dificultad", "Identificador de cola" | No existen en el backend. |
| Sandbox, kernel, latencia, versión del sistema | Es información de infraestructura. |
| "Sin límites de intentos" | Hay una espera de 5 s entre envíos. |
| "Ver log" en veredictos que no son CE | Solo CE trae `compileLog`. |
| "Entrada estándar / Salida" | Los problemas son por función con JSON (`judge-evaluation.md`); usar `signature`. |
| Detalle de flags de integridad | El equipo solo ve "envíos bloqueados hasta revisión del staff". |

## Eventos en segundo plano

| Evento | Acción en la UI | ¿Toast? |
|---|---|---|
| `submission:update` con veredicto final | Actualiza el historial | Sí: "Problema A: Aceptado" |
| `submission:update` con `PENDING_REVIEW` | Actualiza | Sí: "en revisión manual" |
| `submission:update` por revisión o rejudge | Actualiza | Sí, si cambia el veredicto |
| `submission:progress` | Barra judged/total | No |
| `clock:update` | Reloj; si pasa a RUNNING, recarga `GET /contest` | Sí (inicio, pausa, fin) |
| `standings:update` | Refresca el marcador | No |
| Reconexión del socket | Recarga `/submissions` y el reloj | No |
| 401 en cualquier llamada | Pantalla "sesión iniciada en otro equipo", regresa al login | Sí |
| Proceso prohibido detectado | Nada; solo lo ve el juez (ver Anticheat) | No |
| 403 al enviar | Mensaje neutro: "Tu envío no se pudo registrar. Avisa al staff." | No |

## Anticheat

- **Heartbeat actual:** `POST /contest/heartbeat {processes}` cada 30 s.
  - El servidor normaliza los nombres, así que se mandan tal como los da `psutil.process_iter(['name'])`.
  - Si pasan 90 s sin heartbeat, se levanta `HEARTBEAT_LOST`.
- **Monitores, USB y red:** se recolectan con Qt (`QGuiApplication.screens()`, `QStorageInfo.mountedVolumes()` removibles, `QNetworkInterface.allInterfaces()`).
  - El backend aún no los acepta. Mientras tanto no se envían.
- **Política: el competidor no se entera.** Los procesos prohibidos solo se reportan al juez, que decide cómo actuar. Así se puede observar si el equipo sigue haciendo trampa.
  - El backend deja de mandar `forbiddenProcesses` y `submissionsBlocked` en la respuesta del heartbeat; solo responde `nextHeartbeatMs`. Así la lista no se ve ni en el tráfico ni en el `.exe`.
  - La barra de estado solo indica "Sincronizado" o "Sin conexión".
  - Si la edición tiene `block_submissions_on_alert`, el 403 al enviar sí delata el bloqueo; es decisión del staff activarlo.
- **Cerrar la app pide confirmación**, incluso desde la bandeja, porque cerrarla corta el heartbeat.

## Despliegue en más de 90 equipos
- Se copia **un solo archivo** por equipo: `app-competidores.exe`. No hay `config.json` (un archivo editable junto al .exe es un riesgo).
- **Servidor:** la app usa por defecto el nombre de red `http://juez.concurso.local`. El DNS del laboratorio, o el archivo `hosts` de cada equipo, lo apunta a la IP del servidor; si cambia la IP no se toca ningún equipo.
- **Cambiar el servidor (staff):** en el login, Ctrl+Shift+S o el botón *Configurar servidor (staff)* que aparece cuando no hay conexión. Pide la dirección y credenciales de staff; la app comprueba `/health`, valida las credenciales en **ese** servidor (y cierra esa sesión de staff) y solo entonces guarda la dirección en la configuración de Windows del usuario (`HKCU\Software\Concurso\AppCompetidores`).
- `machineId`: un hash estable del equipo (MachineGuid de Windows), sin configuración manual.
- Checklist por equipo: abrir la app, iniciar sesión de prueba, ver el toast de prueba y revisar que el reloj del sistema esté en hora. Se suma a la checklist previa al concurso de `server-specs.md`.
- Riesgo: algunos antivirus marcan como sospechoso un `--onefile` de PyInstaller. Si pasa en el laboratorio, cambiar a `--onedir` o firmar el `.exe`.

## Fases
1. Prueba de concepto: login, lista de problemas, toast de prueba y workflow de build. Medir el tamaño del `.exe`.
2. Envíos, historial y socket con veredictos.
3. Heartbeat de procesos y estado de bloqueo.
4. ~~Marcador y reloj con congelado.~~ Hecho: pestaña Marcador (categoría del equipo, en vivo con `standings:update`) y cronómetro.
5. ~~Monitores, USB y red.~~ Hecho: el heartbeat manda `monitors` (solo Windows), `usbStorage` y `networkInterfaces`; reglas por edición `max_monitors` (1, null = apagada), `watch_usb_storage` y `watch_network`; alertas `EXTRA_MONITOR`, `USB_STORAGE` y `NETWORK_CHANGE` (red: interfaces nuevas respecto al primer heartbeat de la sesión). Migración `IntegrityHardware`.
6. ~~Clarificaciones.~~ Hecho: módulo `clarifications` en el backend (equipo: `POST/GET /contest/clarifications`; staff: `GET /editions/:id/clarifications`, `POST /editions/:id/clarifications/:cid/answer`; evento `clarification:update`; migración `Clarifications`) y pestaña en la app. Las respondidas las ven todos los equipos de la categoría (las generales, todas), sin el nombre del equipo.

## Desarrollo local
1. Backend: `pnpm build` y luego `node dist/main` y `node dist/worker` en `apps/backend` (el worker juzga con Docker).
2. `venv/bin/python scripts/preparar_demo.py` en `apps/app-competidores`: habilita python/c/cpp en la "Edición Demo", publica A y B en cada categoría y arranca el concurso. Solo funciona sobre la edición en DRAFT.
3. `venv/bin/python app.py`. La primera vez, en el login: Ctrl+Shift+S (o *Configurar servidor (staff)*), dirección `localhost:3000` y las credenciales `SEED_ADMIN_*` de `apps/backend/.env`. Luego entrar con `equipo01` / `dev12345`.

## Decisiones de la segunda ronda
- El `starterCode` se descarga como archivo y el concursante lo sube desde su IDE.
- No hay historial global de envíos: la vista principal es por problema.
- El marcador vive en su propia pestaña (además de proyectarse).
- Los procesos prohibidos no se notifican al competidor; solo al juez.
- Cerrar la app pide confirmación.
- Las respuestas de clarificaciones son visibles para todos.

## UX de problemas
Lista + detalle (`QSplitter`):

```
+------------------+------------------------------------------+
| PROBLEMAS        | A. Suma de arreglos     1.0 s  128 MB    |
|                  |------------------------------------------|
| > A  Suma    ✗ 2 | Enunciado...                             |
|   B  Camino  ✓ 1 | Ejemplos [copiar]                        |
|   C  Cripto  ·   |                                          |
|   D  Palin   ✓ 3 | [Descargar plantilla] [Enviar archivo]   |
|   E  Flujo   ⧗ 1 |------------------------------------------|
|                  | INTENTOS DE A                            |
|                  | 01:41  Python  WA    0.02 s  14 MB       |
|                  | 01:30  Python  CE    [ver log]           |
+------------------+------------------------------------------+
| Problemas | Marcador | Clarificaciones       ⏱ 03:17:45  ●  |
```

- **Lista de problemas (izquierda):** cada fila tiene la letra, el título, el estado y el número de intentos.
  - Estados: `·` sin intentar, `⧗` en juicio, `✓` aceptado, `✗` rechazado.
  - El estado se calcula con `GET /submissions` y se actualiza con `submission:update`.
- **Detalle (derecha):** arriba el enunciado y los botones; abajo solo los intentos de ese problema, del más nuevo al más viejo.
  - Un intento en juicio muestra su progreso judged/total.
- **Barra superior:** pestañas Problemas, Marcador y Clarificaciones, y Ayuda a la derecha.
- **Barra de estado:** reloj restante y conexión.

## Puntos abiertos
Ninguno. El documento está listo para empezar la fase 1.

## Pendientes del backend
0. ~~Quitar `forbiddenProcesses` y `submissionsBlocked` de `IHeartbeatResponse`.~~ Hecho: el heartbeat solo responde `nextHeartbeatMs`.
1. ~~Módulo de clarificaciones.~~ Hecho (ver fase 6), con la pantalla del staff para responder (Aclaraciones en la edición).
2. ~~Campos de hardware en `HeartbeatDto`, reglas por edición y `FlagType` nuevos.~~ Hecho (ver fase 5).
3. (Opcional) Un evento al equipo cuando cambia `submissionsBlocked` o cuando se reemplaza su sesión.
4. (Opcional) Un evento al entrar en congelado; hoy se calcula en el cliente con `elapsedMs >= durationMs - freezeDurationMs`.
5. Revisar que `packages/shared-types` coincida con los DTOs del backend antes de copiar los contratos a Python.
6. Suspensión de equipos: `Team.suspended_at` (migración `TeamSuspension`) y `PUT /editions/:id/teams/:teamId/suspension {suspended}` (solo admin). En el marcador `IStandingsRow.suspended` y `rank: null`; van al final y no le quitan lugares a nadie. La app los muestra tachados. El staff suspende desde el marcador de la edición. Suspender no bloquea envíos ni el login: si se quiere, es una decisión aparte.
