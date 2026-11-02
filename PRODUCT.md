# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Página pública en `site/`: HTML y CSS estáticos sin build, publicada con GitHub Pages (`.github/workflows/pages.yml`). El producto en sí es un monorepo pnpm: backend NestJS, panel de staff Angular y app de escritorio PySide6 (ver `docs/arquitectura.md`).

## Users
- **Página pública:** organizadores de concursos de programación de otras escuelas y universidades (profes, coordinadores, clubes) que evalúan si usar Juez Miau en sus propios concursos. Llegan desde un enlace (README, correo, presentación) y deben salir convencidos de que el juez es rápido y justo, y de que lo pueden montar ellos mismos. Brief completo: `docs/design/site-brief.md`.
- **Producto:** staff del concurso (superadmin, administrador, juez, observador) en el panel web; equipos de estudiantes en un laboratorio con más de 90 equipos Windows usando la app de escritorio.

## Product Purpose
Juez Miau organiza de punta a punta los concursos universitarios de programación del CUValles: ediciones, categorías, salones, equipos, problemas con casos de prueba, evaluación automática de envíos, marcador en vivo, aclaraciones e integridad de los equipos. Éxito: un concurso oficial corre completo sobre él sin depender de jueces externos.

## Positioning
Es un juez hecho en casa, en la Maestría en Ingeniería de Software del CUValles, a la medida de cómo se corre aquí un concurso: un laboratorio de 90+ equipos Windows, una sola máquina servidor que se monta días antes, staff con roles por edición y vigilancia de integridad del equipo (procesos, monitores, USB) que los jueces públicos en línea no hacen.

## Operating Context
- Se monta en una sola máquina con Docker Compose unos días antes del concurso (2 veces al año, 2–4 h) y se desmonta después.
- Los equipos programan en su IDE; la app de escritorio vive en segundo plano y avisa los veredictos con notificaciones de Windows.
- Un proyector en el auditorio muestra marcador y reloj; el marcador se congela al final.

## Capabilities and Constraints
- Juez en contenedores Docker sin red, con límites de tiempo y memoria y un núcleo de CPU reservado por caso.
- Lenguajes: C, C++, Java, Python, JavaScript, C#. Veredictos: AC, WA, TLE, MLE, RE, CE y revisión pendiente.
- Marcador y reloj en tiempo real por Socket.io; modo proyector; congelamiento del marcador.
- Aclaraciones entre equipos y jueces; suspensión de equipos; integridad (latidos, procesos, monitores, USB).
- Roles por edición (superadmin, administrador, juez, observador) y bitácora de auditoría.
- App de escritorio: un solo `.exe` publicado como GitHub Release con tags `competidores-v*`.
- Sin métricas de uso, número de concursos realizados ni testimonios confirmados: no se inventan.

## Brand Commitments
- Nombre: **Juez Miau · CUValles**, versión 1.0 (antes «Juez Virtual»; el nombre cambió a petición del usuario).
- Mascota: gatito detective con lupa (`site/assets/gatito.svg`), protagonista de la marca.
- Identidad institucional: logo UdeG con "Centro Universitario de los Valles" (`site/assets/logo-cuvalles.svg` y `-blanco.svg`).
- Tipografías: Inter y JetBrains Mono, las mismas del panel de staff. En la página pública se suma Big Shoulders Stencil para los estarcidos de caja (titulares, cintas y sellos).
- Crédito explícito: producto de la Maestría en Ingeniería de Software; integrantes con nombre completo, correo y LinkedIn.
- Textos en español de México.
- Identidad original: sin globos de colores ni referencias o comparaciones con ICPC u otros concursos o jueces.

## Evidence on Hand
- Código, documentación (`docs/`, `deploy/README.md`) y workflow de CI del `.exe`.
- Marcadores, envíos y equipos mostrados en la página son ilustrativos y deben marcarse como ejemplo.
- Pendiente del usuario: nombres completos, correos y LinkedIn de los integrantes y nombre exacto del programa.
- Ausentes: capturas reales del panel, fotos de concursos, cifras de uso.

## Product Principles
1. Rápido y justo, dicho con simpatía: el gatito guía en tono lúdico, pero los datos técnicos (límites, reglas, aislamiento) se dicen tal cual.
2. Demostrar, no prometer: cada función se muestra funcionando con datos de ejemplo marcados como tales.
3. Crédito a quien lo hizo: la maestría y su equipo cierran la página como respaldo.
4. Móntalo tú: todo lo que un organizador necesita para desplegarlo en su propio laboratorio debe estar a un clic.

## Accessibility & Inclusion
WCAG 2.1 AA en ambos temas; navegación completa con teclado; respeta `prefers-reduced-motion`.
