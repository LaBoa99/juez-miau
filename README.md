<div align="center">

<img src="site/assets/gatito.svg" alt="Gatito detective, mascota del Juez Miau" width="160">

# Juez Miau · CUValles

**Juez automático para los concursos de programación del Centro Universitario de los Valles.**<br>
Evalúa cada envío en un contenedor aislado, publica el marcador en vivo y vigila la integridad de cada equipo.

[![app-competidores](https://github.com/LaBoa99/juez-miau/actions/workflows/app-competidores.yml/badge.svg)](https://github.com/LaBoa99/juez-miau/actions/workflows/app-competidores.yml)
[![pages](https://github.com/LaBoa99/juez-miau/actions/workflows/pages.yml/badge.svg)](https://laboa99.github.io/juez-miau/)

[<img src="site/assets/icons/book-open.svg" width="16"> Sitio del proyecto](https://laboa99.github.io/juez-miau/) ·
[<img src="site/assets/icons/download.svg" width="16"> App para equipos (.exe)](https://github.com/LaBoa99/juez-miau/releases)

<br>

<img src="https://skillicons.dev/icons?i=nestjs,angular,ts,python,qt,docker,postgres,redis&perline=8" alt="NestJS, Angular, TypeScript, Python, Qt, Docker, PostgreSQL, Redis">

</div>

---

## Qué es

Un sistema completo para organizar concursos de programación universitarios. El **staff** prepara cada
**edición** (categorías, salones, equipos, problemas con sus casos de prueba y lenguajes permitidos);
los **equipos** programan en su propio IDE y envían desde una app de escritorio; un **juez automático**
evalúa en Docker y el **marcador** se actualiza en tiempo real.

## Funciones

| | Función | Qué hace |
|:-:|---|---|
| <img src="site/assets/icons/box.svg" width="22"> | **Juez en contenedores** | Compila y ejecuta cada envío en Docker, con límites de tiempo y memoria y un núcleo de CPU reservado por caso. |
| <img src="site/assets/icons/trophy.svg" width="22"> | **Marcador en vivo** | Resueltos y penalización se recalculan con cada veredicto y llegan al instante por WebSocket. |
| <img src="site/assets/icons/presentation.svg" width="22"> | **Modo proyector** | Vista pública del marcador y el reloj para la pantalla grande. |
| <img src="site/assets/icons/message-question.svg" width="22"> | **Aclaraciones** | Los equipos preguntan sobre un problema y la respuesta se publica para todos los equipos. |
| <img src="site/assets/icons/shield-check.svg" width="22"> | **Integridad del equipo** | Latidos de la app, procesos, monitores y USB; alertas para el staff y suspensión de equipos. |
| <img src="site/assets/icons/monitor.svg" width="22"> | **App de escritorio** | Un solo `.exe` para Windows: problemas, envíos y veredictos como notificación nativa. |
| <img src="site/assets/icons/timer.svg" width="22"> | **Reloj del concurso** | Inicio, pausa y congelamiento del marcador, sincronizados en todas las pantallas. |
| <img src="site/assets/icons/users.svg" width="22"> | **Ediciones, salones y staff** | Roles por edición: administrador, juez y observador, más bitácora de auditoría. |

**Lenguajes que juzga:** C, C++, Java, Python, JavaScript y C#.
**Veredictos:** `AC` · `WA` · `TLE` · `MLE` · `RE` · `CE`.

## Arquitectura

Todo corre en una sola máquina con Docker Compose:

```
                 :80 / :443
Navegadores ───────► web (Caddy) ──┬── /            panel de staff (Angular, estáticos)
App de escritorio ─┘               ├── /api/*       ─► api (NestJS) ─► postgres
de los equipos                     └── /socket.io/* ─►                └► redis ◄─ worker ─► docker.sock
                                                                                   (juez)
```

## Estructura del monorepo

| Carpeta | Qué es | Stack |
|---|---|---|
| [`apps/backend`](apps/backend) | API y worker del juez | NestJS · TypeORM · BullMQ · Socket.io |
| [`apps/frontend-staff`](apps/frontend-staff) | Panel del staff y proyector | Angular |
| [`apps/app-competidores`](apps/app-competidores) | App de escritorio de los equipos | Python · PySide6 · PyInstaller |
| [`packages/shared-types`](packages/shared-types) | Interfaces y enums compartidos | TypeScript |
| [`deploy`](deploy) | Despliegue del concurso | Docker Compose · Caddy |
| [`site`](site) | Esta página y el design system | HTML · CSS |

## Inicio rápido

<img src="site/assets/icons/server.svg" width="18"> **Montar el concurso** (detalles en [deploy/README.md](deploy/README.md)):

```bash
cd deploy
cp .env.example .env       # PUBLIC_URL, contraseñas y secretos
docker compose up -d --build
```

<img src="site/assets/icons/file-code.svg" width="18"> **Desarrollar** (detalles en [README-pnpm.md](README-pnpm.md)):

```bash
pnpm install
pnpm --filter @concurso/shared-types build
docker compose -f deploy/docker-compose.yml up -d postgres redis
pnpm --filter backend start:dev        # API
pnpm --filter frontend-staff start     # panel de staff
```

<img src="site/assets/icons/monitor.svg" width="18"> **App de equipos:** el `.exe` se compila en GitHub Actions y se publica
como Release con cada tag `competidores-v*`.

## Documentación

- <img src="site/assets/icons/book-open.svg" width="16"> [Arquitectura y funcionamiento](docs/arquitectura.md)
- <img src="site/assets/icons/box.svg" width="16"> [Evaluación del juez](docs/design/judge-evaluation.md)
- <img src="site/assets/icons/server.svg" width="16"> [Despliegue](deploy/README.md) · [Especificaciones del servidor](docs/design/server-specs.md)
- <img src="site/assets/icons/file-code.svg" width="16"> [Guía de pnpm](README-pnpm.md) · [API del backend](docs/backend-api.md)
- <img src="site/assets/icons/layers.svg" width="16"> [DESIGN.md](docs/design/DESIGN.md)

## Créditos

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="site/assets/logo-cuvalles-blanco.svg">
  <img src="site/assets/logo-cuvalles.svg" alt="Universidad de Guadalajara, Centro Universitario de los Valles" width="260">
</picture>

**Juez Miau · CUValles** (versión 1.0) es un proyecto de la **Maestría en Ingeniería de Software** del
Centro Universitario de los Valles, hecho para que la universidad tenga un juez propio, a la medida de sus
laboratorios y de sus concursos.

| Integrante | Programa | Contacto |
|---|---|---|
| **Ing. Gael Rodríguez** | Maestría en Ingeniería de Software | <img src="site/assets/icons/mail.svg" width="14"> por confirmar · <img src="site/assets/icons/linkedin.svg" width="14"> por confirmar |
| **Ing. Maribel Navarro** | Maestría en Ingeniería de Software | <img src="site/assets/icons/mail.svg" width="14"> por confirmar · <img src="site/assets/icons/linkedin.svg" width="14"> por confirmar |
