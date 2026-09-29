# Especificaciones del servidor

- **Estado:** Propuesta
- **Fecha:** 2026-09-29
- **Relacionado:** [judge-evaluation.md](judge-evaluation.md)

## Resumen

| | Mínimo | Recomendado |
|---|---|---|
| CPU | 4 núcleos físicos (2 para juzgar) | 8 núcleos físicos (6 para juzgar) |
| RAM | 8 GB | 16 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| Red | 100 Mbps, IP pública o acceso en LAN | Igual |
| SO | Linux x86_64 con cgroup v2 | Igual |
| Software | Docker Engine 24+ | Docker Engine 24+ |

**Preferir más canales de memoria y más caché L3** (servidor EPYC/Xeon, o Ryzen X3D) sobre
más núcleos: los programas que usan mucha memoria se frenan entre sí aunque cada uno tenga
su núcleo. Ver [Contención de memoria](#contención-de-memoria).

**La CPU no debe ser compartida ni con créditos de ráfaga** (instancias `t3`/`e2-micro` de
nube, VPS con vCPU compartidas, etc.). Si otro cliente del host consume CPU, los tiempos de
ejecución cambian y un envío correcto puede dar TLE. Usar núcleos dedicados o una máquina
física.

## Imágenes de ejecución

Descargadas y probadas el 2026-09-29:

| Lenguaje | Imagen | Versión real | Tamaño en disco |
|---|---|---|---|
| C / C++ | `gcc:14` | GCC 14.4.0 | 2.15 GB |
| Java | `eclipse-temurin:21-jdk` | OpenJDK 21.0.12 | 725 MB |
| C# | `mcr.microsoft.com/dotnet/sdk:8.0` | .NET SDK 8.0.425 | 1.23 GB |
| JavaScript / TypeScript | `node:24-slim` | Node.js 24.21.0 | 330 MB |
| **Total** | | | **≈ 4.4 GB** |

Python (`python:3.12-slim`, ≈ 150 MB) está en el diseño, pero todavía no tiene seeder.

Descargarlas antes del concurso, no durante:

```bash
docker pull gcc:14
docker pull eclipse-temurin:21-jdk
docker pull mcr.microsoft.com/dotnet/sdk:8.0
docker pull node:24-slim
```

Las etiquetas son móviles (`gcc:14` apunta al último 14.x). Para que las versiones no
cambien entre el simulacro y el concurso, fijar el digest (`gcc:14@sha256:...`) en
`Language.image_ref` una vez validadas.

## Mediciones

Máquina de prueba: AMD Ryzen 5 5500 (6 núcleos / 12 hilos), Docker 29.8.1, cgroup v2.
Comandos exactos del seeder (`base/language.seeder.ts`) con el aislamiento del diseño:

```
--network none --read-only --tmpfs /tmp:size=64m,exec --user <no root>
--cpus 1 --cpuset-cpus N --memory 512m --pids-limit 256
```

Programa: criba de Eratóstenes hasta 5·10⁷ (N leído de stdin para que el compilador no la
precalcule). Dos corridas por lenguaje, resultados estables (±5 %).

| Lenguaje | Compilación (con contenedor) | Memoria al compilar | Programa | Relativo a C | Memoria al ejecutar |
|---|---|---|---|---|---|
| C | 0.4 s | ≈ 10 MB | 290 ms | 1.00× | 49 MB |
| C++ | 0.7 s | ≈ 60 MB | 285 ms | 0.98× | 49 MB |
| Java | 1.0 s | ≈ 45 MB | 380 ms | 1.31× | 72 MB |
| C# | 2.8 s | ≈ 150 MB | 335 ms | 1.16× | 54 MB |
| JavaScript | 0.35 s | ≈ 12 MB | 390 ms | 1.34× | 60 MB |
| TypeScript | 0.37 s | ≈ 25 MB | 430 ms | 1.48× | 76 MB |

- **Arrancar un contenedor cuesta ≈ 0.3–0.4 s**, sin importar el lenguaje. Cada envío
  compilado paga dos arranques (compilar y ejecutar).
- La memoria es el pico del cgroup (`memory.peak`). Las librerías que ya estaban en la caché
  de páginas se le cobran al primer contenedor que las cargó, así que los runtimes grandes
  (JVM, .NET) pueden aparecer más bajos de lo real. Sirve como orden de magnitud, no como
  límite exacto.
- C# compila en ≈ 2.8 s con `dotnet build`, menos que los 5–10 s estimados en el diseño.
  Funciona sin red: el proyecto no tiene paquetes NuGet.
- Una sola prueba no basta para calibrar `time_multiplier`. Los valores del seeder
  (2× para Java, C#, JS y TS) son conservadores respecto a esta medición; ajustar con varias
  soluciones oficiales reales.

### Requisitos que el worker debe cumplir

Salieron de las pruebas; sin ellos algún lenguaje falla o da un veredicto incorrecto:

- **Variables de entorno para .NET** (con `--read-only` y usuario no root no hay `HOME`
  escribible): `HOME=/tmp`, `DOTNET_CLI_HOME=/tmp`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`,
  `DOTNET_NOLOGO=1`, `DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1` y
  **`DOTNET_EnableWriteXorExecute=0`**. Sin la última, .NET crea un archivo de memoria
  compartida de más de 1 MB y el límite de tamaño de salida (`RLIMIT_FSIZE`) lo mata con
  `SIGXFSZ`: todo envío de C# da RE. Se pueden pasar a todos los lenguajes sin efecto en
  los demás. `Language` no tiene columna de entorno, así que las pone el worker.
- **Java necesita `-XX:MaxRAMPercentage=75`** (ya está en el `run_cmd` del seeder). Por
  defecto la JVM usa como heap solo ¼ del límite del contenedor: con 256 MB, un arreglo
  de 100 MB daba error en una solución correcta.
- **MLE en lenguajes con runtime.** Java, .NET y Node abortan por su cuenta al llenar su
  heap (`OutOfMemoryError`, `Out of memory.`, `JavaScript heap out of memory`) antes de
  que actúe el OOM killer del cgroup, y el proceso termina como RE. El worker debe guardar
  stderr y, si un RE contiene esos textos, reportarlo como MLE. En C/C++ el MLE se detecta
  con `oom_kill` en `/sys/fs/cgroup/memory.events`.
- **`--memory-swap` igual a `--memory`**, para que pasarse del límite dé MLE y no use swap
  del host.
- **Directorio de trabajo montado con escritura al compilar** y en solo lectura al ejecutar.
  La salida del programa va a `/tmp` (tmpfs), no al directorio de trabajo.
- **`/tmp` con `exec`**: gcc y dotnet ejecutan binarios temporales ahí.
- **64 MB de tmpfs alcanzan** para todos los lenguajes; lo compilado por C# ocupa ≈ 300 KB.
- **Compilar con un límite de memoria aparte** (p. ej. 1 GB): `dotnet build` llega a ≈ 280 MB,
  más que un límite típico de 256 MB para el programa.

## Prueba de carga

Banco en [`scripts/judge-bench/`](../../scripts/judge-bench/): simula al worker sin
levantar el backend (cola, un contenedor a la vez por núcleo con `--cpuset-cpus`, compilación
y ejecución en contenedores separados, 10 casos por envío, se detiene en el primer fallo).
Un `runner` estático en C mide por caso tiempo de CPU, tiempo de reloj y RSS máximo.

```bash
node scripts/judge-bench/bench.mjs --subs 120                 # ráfaga mixta
node scripts/judge-bench/bench.mjs --only ac --cpus 1         # referencia sin concurrencia
```

Problema: contar primos ≤ N, N de 1 a 5·10⁷. Por lenguaje hay una solución por veredicto
(AC, WA, TLE, MLE, CE). Límites: 256 MB, TL 1 s × `time_multiplier`. Máquina: Ryzen 5 5500,
DDR4 de doble canal, CPUs 1–5 para juzgar (un hilo por núcleo físico), equipo en reposo.

**Veredictos:** 150 envíos de los 6 lenguajes, todos con el veredicto esperado salvo 2,
ambos por la contención de memoria descrita abajo.

### Ráfaga de 120 envíos mixtos (5 núcleos)

| Métrica | Resultado |
|---|---|
| Mezcla | 42 AC, 27 WA, 22 TLE, 15 MLE, 14 CE |
| Duración | 67 s → **107 envíos/min** |
| Latencia (en cola + juicio) | p50 36 s, p95 64 s |
| Tiempo de núcleo por envío | CE 0.9 s · WA 1.7 s · MLE 2.9 s · AC 3.1 s · TLE 4.3 s |
| RAM del host (pico) | **+600 MB** sobre la línea base |
| Suma de contenedores (pico) | 608 MB con 5 simultáneos |
| Mayor contenedor | 256 MB (MLE, en el límite) |

Los TLE son los envíos más caros: ocupan el núcleo hasta agotar el tiempo. La RAM real
quedó muy por debajo del peor caso (`concurrency × --memory`), porque pocos envíos llegan
al límite al mismo tiempo.

### Por lenguaje (solo AC, caso mayor N = 5·10⁷)

| Lenguaje | Compilar | Memoria al compilar | 10 casos | Caso mayor, solo | Caso mayor, 5 simultáneos | RSS caso mayor |
|---|---|---|---|---|---|---|
| C | 0.35 s | 9 MB | 0.8 s | 287 ms | 526 ms | 50 MB |
| C++ | 0.7 s | 93 MB | 0.8 s | 291 ms | 586 ms | 51 MB |
| C# | 2.9 s | 278 MB | 1.2 s | 330 ms | 615 ms | 75 MB |
| Java | 1.05 s | 128 MB | 1.45 s | 373 ms | 663 ms | 92 MB |
| JavaScript | 0.36 s | 65 MB | 1.2 s | 393 ms | 739 ms | 101 MB |
| TypeScript | 0.36 s | 30 MB | 1.6 s | 427 ms | 809 ms | 121 MB |

Los tiempos incluyen el arranque de cada contenedor (≈ 0.3 s). Con 5 núcleos ocupados,
compilar tarda ≈ 1.5–2× más porque Docker arranca los contenedores con más carga.

### Contención de memoria

**Fijar un núcleo por contenedor no aísla los tiempos.** Los núcleos comparten la caché L3
(16 MB en el Ryzen 5500) y el ancho de banda a la RAM. Medido con el runner, la misma
solución en C:

| Programa | Solo | 2 simult. | 3 simult. | 5 simult. |
|---|---|---|---|---|
| División por tentativa (casi sin memoria) | 98 ms | — | — | 98 ms |
| Criba N = 10⁷ (10 MB, cabe en L3) | 16 ms | — | — | 18–24 ms |
| Criba N = 3·10⁷ (30 MB) | 144 ms | — | — | 560–720 ms |
| Criba N = 5·10⁷ (50 MB) | 287 ms | 490 ms | 755 ms | 1225–1420 ms |

Un programa que usa mucha CPU pero poca memoria no se ve afectado. Uno cuyos datos no caben
en L3 corre **hasta 5 veces más lento** según cuántos envíos se estén juzgando a la vez.
En la prueba, una solución AC de C++ dio TLE (1056 ms con TL de 1 s) solo por coincidir con
otros envíos. Es el mismo envío que, juzgado solo, tarda 291 ms.

Mitigaciones, de más simple a más compleja:

1. **Confirmar los TLE en exclusiva.** Si un envío da TLE mientras había otros en
   ejecución, volver a juzgarlo con los demás núcleos en pausa antes de publicar el
   veredicto. Los TLE son ≈ 20 % de los envíos y el re-juicio solo afecta a esos.
   **Recomendado; hay que implementarlo en el worker.**
2. **Calcular el TL con la solución oficial bajo carga**, no en reposo, y dejar margen
   (TL ≥ 3× el tiempo de la oficial).
3. **Hardware con más canales de memoria y más L3**: servidores EPYC/Xeon (8–12 canales)
   o Ryzen X3D (96 MB de L3) sufren mucho menos que un equipo de escritorio de doble canal.
4. **Menos concurrencia** cuando el problema usa mucha memoria (p. ej. `concurrency`
   por problema).
5. **Partición de L3 y de ancho de banda** con `resctrl` (AMD `cat_l3`/`mba`, Intel RDT).
   El Ryzen 5500 lo soporta; no se probó.

## Dimensionamiento

### CPU

Según el diseño, un contenedor por núcleo con `--cpuset-cpus`:

| Núcleos | Uso |
|---|---|
| 0–1 | SO, Postgres, Redis, API, worker (el proceso Node, no los envíos) |
| 2…N | Un envío a la vez por núcleo → `concurrency = N - 1` |

**Contar núcleos físicos, no hilos.** Con SMT/Hyper-Threading, dos hilos del mismo núcleo
se roban tiempo entre sí. Asignar un solo hilo por núcleo físico a los envíos (p. ej. en
un Ryzen de 6 núcleos: CPUs lógicas 2, 3, 4, 5 si los hermanos son 8, 9, 10, 11; ver
`lscpu -e`) o desactivar SMT en la BIOS.

### Rendimiento esperado

Medido: **≈ 107 envíos/min con 5 núcleos** en una mezcla realista (≈ 2.8 s de núcleo por
envío). Escala casi lineal con los núcleos si los problemas no usan mucha memoria; con
problemas que sí la usan, 5 núcleos rindieron solo ≈ 2.7× lo que rinde 1.

| Núcleos para juzgar | Envíos/min (aprox.) | Ráfaga de 30 envíos |
|---|---|---|
| 2 | ≈ 40 | ≈ 45 s |
| 5 | ≈ 107 (medido) | ≈ 17 s |
| 6 | ≈ 125 | ≈ 15 s |

Con 30 equipos, aun si todos envían en el mismo minuto al final, el último veredicto llega
en menos de un minuto con 5–6 núcleos.

### RAM

| Componente | Memoria |
|---|---|
| SO + Docker | 1 GB |
| Postgres | 1 GB |
| Redis | 256 MB |
| API (Node) | 300 MB |
| Worker (Node) | 300 MB |
| Envíos, peor caso: `concurrency × max(límite del problema, 280 MB de compilar C#)` | 6 × 280 MB ≈ 1.7 GB |
| Caché de páginas para imágenes y BD | 2 GB o más |
| **Total** | **≈ 6.5 GB en el peor caso → 8 GB mínimo, 16 GB con margen** |

Medido en la ráfaga de 120 envíos: +600 MB en el host con 5 envíos simultáneos. El peor
caso solo ocurre si todos los envíos en curso llegan al límite a la vez. Con problemas de
512 MB o más, recalcular con `concurrency × límite`.

### Disco

| Componente | Espacio |
|---|---|
| SO | 10 GB |
| Imágenes de ejecución | 4.4 GB (5 GB con Python) |
| Imagen del backend + Postgres + Redis | ≈ 1 GB |
| Base de datos (envíos, casos de prueba) | < 1 GB por edición |
| Logs y capas temporales de Docker | 5–10 GB |
| **Total** | **≈ 25 GB → 40 GB mínimo, 80 GB recomendado** |

SSD obligatorio: cada envío crea y borra dos contenedores; en disco mecánico el arranque
pasa de 0.3 s a varios segundos.

## Checklist antes del concurso

1. `docker pull` de las cuatro imágenes (y fijar digests).
2. Confirmar cgroup v2: `stat -fc %T /sys/fs/cgroup` debe decir `cgroup2fs`.
3. Revisar la topología con `lscpu -e` y configurar qué CPUs lógicas usa el worker.
4. Correr `scripts/judge-bench/bench.mjs` en el servidor real con las CPUs asignadas;
   todos los veredictos deben coincidir y los tiempos deben estar cerca de los de aquí.
5. Simulacro: un envío por lenguaje y problema.
6. Verificar que la máquina no tenga otros procesos pesados durante el concurso. Una
   primera corrida de esta prueba con un videojuego abierto dio tiempos el doble de altos.
