# Diseño del juez: ejecución, casos de prueba y evaluación

- **Estado:** Aceptado — en implementación (fase 3 lista: drivers, worker y build de testsets)
- **Fecha:** 2026-09-29

## Contexto

El concurso necesita calificar automáticamente las soluciones de los participantes en
C, C++, Java, Python, TypeScript y C#. Los jueces que escriben los problemas deben poder
usar el lenguaje que dominen, y los resultados deben ser comparables sin importar el
lenguaje de la solución oficial ni el del participante.

## Decisiones

### 1. Problemas por función, no por stdin/stdout

El participante implementa una función con la firma definida en el problema
(p. ej. `helloWorld(a: string, b: int): string`). Si el lenguaje requiere clase, se llama `Main`.

- El sistema genera un **driver** por lenguaje a partir de la firma: lee la entrada en JSON
  por stdin, llama a la función y escribe el resultado en JSON.
- El resultado se escribe en un **canal aparte** (p. ej. un archivo), no en stdout, para que
  los `print` del participante no afecten la comparación.
- **Formato canónico JSON** en todos los lenguajes (`true`, `5.0`, `[1,2]`), así Python,
  Java, etc. se comparan igual.
- Tipos soportados desde el inicio: `int`, `long`, `float`, `bool`, `string`, `enum`,
  `array`, `object`. En TypeScript, valores mayores a 2⁵³ requieren `BigInt`.
- Las salidas tipo "dibujo" (tableros, representaciones verticales) se modelan como
  estructuras (listas de líneas, matrices), no como texto libre.

### 2. Ejecución en Docker

| Lenguaje   | Imagen (`Language.image_ref`)        |
|------------|--------------------------------------|
| C / C++    | `gcc:14`                             |
| Java       | `eclipse-temurin:21-jdk`             |
| Python     | `python:3.12-slim`                   |
| JavaScript | `node:24-slim`                       |
| TypeScript | `node:24-slim` (type-stripping nativo) |
| C#         | `mcr.microsoft.com/dotnet/sdk:8.0`   |

- Las imágenes se descargan al desplegar.
- **Un contenedor por envío** que ejecuta todos los casos. En lenguajes compilados,
  compilación y ejecución van en pasos separados para no contar la compilación en el límite.
- Aislamiento: `--network none`, `--memory`, `--cpus`, `--pids-limit`, `--read-only`,
  `--tmpfs /tmp:size=64m` (para compilar sin permitir llenar el disco), `timeout`.
- Límite de tamaño para stdout y para el archivo de resultado (p. ej. 1 MB).
- Los envíos pasan por una **cola** (BullMQ + Redis); el veredicto se notifica por WebSocket.
  Ver [Arquitectura API / worker](#6-arquitectura-api--worker).
- Las diferencias de velocidad entre lenguajes se compensan con `Language.time_multiplier`.

**Un contenedor ejecutando a la vez por núcleo.** El worker limita la concurrencia al número
de núcleos reservados para juzgar y fija cada contenedor a un núcleo libre con
`--cpuset-cpus=N --cpus=1`. Si dos contenedores comparten núcleo, cada uno corre a la mitad
de velocidad y un envío correcto puede dar TLE. El tiempo se mide como **tiempo de CPU**,
no de reloj.
Esto no aísla la caché L3 ni el ancho de banda de memoria: medido, un programa que usa
mucha memoria corre hasta 5× más lento con otros 4 al lado. Por eso los TLE se confirman
re-juzgando en exclusiva; ver [server-specs.md](server-specs.md#contención-de-memoria).

Ejemplo con 8 núcleos:

| Núcleos | Uso |
|---------|-----|
| 0–1 | API, Postgres, Redis y sistema operativo |
| 2–7 | Ejecución de envíos → `concurrency: 6` |

Tiempos aproximados por envío (contenedor + compilación + ejecución): Python y TS ≈ 1 s,
C y C++ ≈ 1–1.5 s, Java ≈ 2 s, C# ≈ 3.5 s (`dotnet build` tarda ≈ 2.8 s; se puede bajar
compilando con `csc` directamente). Medido en [server-specs.md](server-specs.md).

### 3. Generación de casos de prueba

Los casos se generan **una sola vez, al crear el problema**, no en cada envío.

Dos modos de generación, combinables con casos escritos a mano:

| Modo | Uso |
|------|-----|
| **Esquema declarativo** | Por defecto. El juez configura tipos y rangos; el backend genera los casos con un PRNG con semilla, sin contenedor. |
| **Generador en código** | Entradas con reglas que el esquema no expresa (dependencias entre campos, grafos, estados válidos, formatos especiales). El juez lo escribe en cualquier lenguaje soportado y corre en su contenedor. |
| **Casos manuales** | Casos límite (vacío, un elemento, máximos). |

Tipos del esquema: `int`, `long`, `float`, `bool`, `string` (`length`, `charset`), `enum`,
`array` (`length`, `items`, `unique`, `sorted`), `object` (`fields`). Son anidables.

Ejemplo:

```json
{
  "schema": {
    "nums": { "type": "array", "items": { "type": "int" } }
  },
  "groups": [
    { "name": "pequeños", "seeds": [1, 2, 3], "overrides": { "nums": { "length": [1, 5], "items": { "min": -10, "max": 10 } } } },
    { "name": "grandes",  "seeds": [21],      "overrides": { "nums": { "length": [100000, 100000], "items": { "min": -1000000000, "max": 1000000000 } } } }
  ],
  "manual": [ { "input": { "nums": [] } } ]
}
```

**Descartado: esquema con referencias entre campos** (p. ej. `"max": { "ref": "n" }`).
Cubre pocos casos adicionales y complica el esquema; esos problemas se resuelven con el
generador en código.

### 4. Salidas esperadas y solución oficial

- La **solución oficial** puede estar en cualquier lenguaje soportado. Se ejecuta una vez
  contra cada entrada generada y su salida se guarda como `expected_output`.
- Se guardan las **entradas generadas**, no solo las semillas: cada lenguaje tiene un PRNG
  distinto y la misma semilla no produce los mismos datos.
- Antes de publicar un problema, el sistema ejecuta la solución oficial contra los ejemplos
  del enunciado y **bloquea la publicación si no coinciden**.
- Enunciados y ejemplos se capturan en la plataforma (ejemplos como JSON), no en documentos
  de Word, para evitar que el formato corrompa los datos.

```
TestCase {
  group            // "pequeños", "grandes", "manual"...
  seed             // trazabilidad (null en manuales)
  params           // trazabilidad (null en manuales)
  input            // JSON — fuente de verdad
  expected_output  // JSON — fuente de verdad
  is_sample        // se muestra en el enunciado
}
```

Descartado: generar casos aleatorios nuevos en cada envío y ejecutar la solución oficial en
paralelo. Duplica el costo, no es justo entre equipos y no es reproducible.

### 5. Evaluación

| Modo | Cuándo |
|------|--------|
| Comparación exacta (JSON) | Por defecto |
| Comparación con tolerancia (`1e-6`) | Resultados decimales |
| **Checker** escrito por el juez | Varias respuestas válidas |
| **Revisión manual (híbrida)** | Requisitos no verificables automáticamente (p. ej. "no usar `sorted()`"). Primero corren los casos automáticos; si pasan, el envío queda en `PENDING_REVIEW` para un juez. |

Veredictos: `AC`, `WA`, `TLE`, `RE`, `CE`, `PENDING_REVIEW`.

### 6. Arquitectura API / worker

Un **worker** es un proceso que no recibe peticiones HTTP: toma trabajos de una cola y los
ejecuta.

```
Participante ──POST /submissions──► API (NestJS)
                                      │ 1. guarda el código en Postgres
                                      │ 2. mete {submissionId} en la cola
                                      │ 3. responde "en cola" (milisegundos)
                                      ▼
                                   Redis (cola)
                                      │
                                      ▼
                                   Worker (NestJS) ──► docker run ... ──► veredicto
                                      │
                                      └─► guarda el veredicto en Postgres y avisa por WebSocket
```

| Pieza | Qué es | Qué hace |
|-------|--------|----------|
| Redis | Base de datos en memoria | **Solo guarda** la cola de trabajos pendientes. No ejecuta nada. |
| BullMQ | Librería de Node | Mete trabajos en Redis y los saca |
| `@Processor` | Clase NestJS | La lógica de juzgar: compilar, ejecutar, comparar |
| Proceso Node | `node dist/worker.js` | Donde corre realmente el `@Processor` |

**Mismo código, arrancado dos veces.** La API y el worker son el mismo proyecto NestJS y la
misma imagen Docker, con distinto punto de entrada:

```ts
// src/main.ts — API
const app = await NestFactory.create(AppModule)
await app.listen(3000)

// src/worker.ts — worker (NestJS completo, sin servidor HTTP)
await NestFactory.createApplicationContext(WorkerModule)
```

- `AppModule` registra la cola (`BullModule.registerQueue`) solo para **agregar** trabajos.
- `WorkerModule` registra la cola **y** `JudgeProcessor`, así que solo el worker **consume**.
- `@Processor('submissions', { concurrency: N })`, con N = núcleos reservados para juzgar.

```yaml
api:
  image: concurso-backend
  command: node dist/main.js
  ports: ["3000:3000"]                                   # expuesto, sin docker.sock
worker:
  image: concurso-backend
  command: node dist/worker.js
  volumes: ["/var/run/docker.sock:/var/run/docker.sock"] # docker.sock, sin puertos
```

**Por qué separarlos:**

1. **La API sigue respondiendo.** Un envío tarda 1–10 s; si la API los ejecutara, el login
   y el marcador se volverían lentos en los picos.
2. **Seguridad.** Acceso a `docker.sock` equivale a root en el host. La API está expuesta a
   internet; el worker no. Ningún proceso tiene ambas cosas.
3. **Fallos aislados.** Si el worker se cae, la API sigue y el trabajo vuelve a la cola.
4. **Escala.** En picos se pueden arrancar más workers, incluso en otra máquina.

En desarrollo es válido poner `JudgeProcessor` dentro de `AppModule` (un solo proceso).
Pasar a dos procesos es solo mover el provider de módulo; el processor no cambia.

### 7. Resiliencia

| Riesgo | Mitigación |
|--------|------------|
| Un caso de prueba estaba mal y ya hay veredictos emitidos | **Rejudge** por problema, caso o envío. Prioritario. |
| Salida gigante (`while(true) print`) | Límite de tamaño de stdout y del resultado |
| Escritura a disco | `--read-only` + `--tmpfs /tmp:size=64m` |
| El worker se cae a mitad de un envío | Guardar el código en la BD **antes** de encolar; reintentos de BullMQ; trabajos idempotentes |
| Ruido en los tiempos | Tiempo de CPU, concurrencia = núcleos, `--cpuset-cpus` |
| Pico de envíos al final del concurso | Más workers; mostrar la posición en la cola |
| Aislamiento de Docker | Suficiente para un concurso universitario. Si el juez se hace público, migrar el runner a `isolate` o gVisor sin cambiar el resto. |

### 8. Costo de implementación de los drivers

Es la pieza con más trabajo: 6 lenguajes × tipos anidables.

| Lenguajes | Dificultad |
|-----------|------------|
| Python, TypeScript | Trivial (JSON nativo) |
| Java, C# | Moderada |
| C, C++ | Alta: sin JSON en la librería estándar; incluir `cJSON` / `nlohmann/json` en la imagen. En C, arrays y strings requieren pasar longitudes. |

Plan: empezar con `int`, `long`, `float`, `bool`, `string` y sus `array`; agregar `object` después.

#### Implementación (fase 3, `apps/backend/src/judge/drivers/`)

El driver lee la entrada en JSON por stdin, llama a la función y escribe el resultado en
`/tmp/result.json`. La salida estándar del participante se descarta. El JSON del resultado no
tiene que ser canónico: el worker lo revisa contra el tipo de retorno y lo reescribe en forma
canónica antes de comparar. Si el tipo no coincide, el veredicto es WA con el motivo.

| Lenguaje | Dónde va la función | `long` | `float` | arrays |
|----------|---------------------|--------|---------|--------|
| Python | función libre | `int` | `float` | `list` |
| JS / TS | función libre (puede ser `export` o `async`) | `bigint` (de regreso acepta `number`) | `number` | `T[]` |
| Java | método estático de `class Main` | `long` | `double` | `T[]` |
| C# | método estático de `class Main`, sin namespace | `long` | `double` | `T[]` |
| C++ | función libre; por valor, `&` o `const&` | `long long` | `double` | `std::vector<T>` |
| C | función libre | `long long` | `double` | structs `IntArray { data, len }`, `IntArray2D`... de `judge.h` |

- En C y C++ el driver incluye `Main.c`/`Main.cpp` en la misma unidad de compilación. Un `main()`
  propio del participante, para probar en su máquina, no estorba, y `#define int long long`
  funciona.
- En C, para regresar un array o un string se reserva con `malloc`.
- La recursión profunda funciona en todos: el runner sube el stack al máximo, Java usa `-Xss64m`,
  Node `--stack-size` y C# corre en un hilo de 256 MB.
- `starterCode()` genera la plantilla de cada lenguaje a partir de la firma.
- Pruebas reales en Docker: `pnpm test:judge` (los 7 lenguajes y cada veredicto).

## Tiempo estimado para montar una edición

Con el sistema construido, casi todo es trabajo humano; la parte de la máquina tarda minutos.

**Por problema:**

| Paso | Quién | Tiempo aprox. |
|------|-------|---------------|
| Enunciado | Juez | 30–60 min |
| Firma + esquema (o generador en código) | Juez | 10–20 min (generador: 30–60 min) |
| Solución oficial | Juez | 15–60 min |
| Casos manuales de límite | Juez | 10 min |
| Generar casos + ejecutar la oficial + validar ejemplos | Sistema | 5–30 s |
| Revisión por otro juez | Juez | 15 min |
| **Total** | | **≈ 1.5–3 h** |

**Por edición:**

| Paso | Tiempo aprox. |
|------|---------------|
| Configurar edición (lenguajes, salas, staff, equipos, horario) | 15–30 min |
| Descargar imágenes Docker (~4.4 GB, solo la primera vez) | 5–10 min |
| 9 problemas por juez, dos jueces en paralelo | ≈ 2–3 días de trabajo por juez |
| Simulacro: un envío de prueba por lenguaje y problema | 30 min |

La primera edición toma más: los jueces tienen que acostumbrarse al formato por función y al esquema.

## Pendiente

1. ~~Tipos del esquema y del problema en `shared-types`~~ (hecho: `signature.interface.ts`, `testset.interface.ts`)
2. ~~Generador con semilla en el backend~~ (hecho: `src/testsets/generation/`)
3. Entidades `Problem`, `TestCase`, `Submission`
4. ~~Templates de driver por lenguaje generados desde la firma~~ (hecho para tipos simples y arrays; faltan `enum` y `object`)
5. ~~Worker de ejecución: `src/worker.ts`, `WorkerModule`, BullMQ + Redis~~ (hecho: build de testsets; los envíos llegan en la fase 4)
6. ~~Asignación de núcleos (`--cpuset-cpus`, `JUDGE_CPUS`), medición de tiempo de CPU (`apps/backend/judge/runner.c`)~~; falta la confirmación de TLE en exclusiva
7. ~~Validación de la solución oficial contra los ejemplos~~ (ya no aplica: las salidas esperadas, incluidas las de los ejemplos, salen de la solución oficial; el build falla si truena o pasa el TL)
8. Rejudge
9. Cola de revisión manual en el panel de staff
10. Migraciones de TypeORM antes de producción
