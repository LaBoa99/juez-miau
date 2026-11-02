# Brief del sitio público (`site/`) — v2

Reemplaza la dirección "tablero de llegadas" (split-flap, andenes, vuelos JM 101…).

## Público

Organizadores de otras escuelas y universidades que evalúan si usar Juez Miau en sus propios concursos.

## Mensaje en 5 segundos

**Juez Miau califica rápido y justo.** Cada envío corre aislado y con su propio núcleo, el marcador se actualiza al instante y el staff ve cualquier trampa.

## Tono

Lúdico, con el gatito como guía. Cercano y simpático, sin perder la seriedad técnica: el humor va en la voz y la mascota, los datos (tiempos, límites, reglas) se dicen tal cual.

## Lo que el organizador debe poder responder al terminar

1. **¿Es rápido?** Compila una vez, corre todos los casos, veredicto en segundos.
2. **¿Es justo?** Contenedor sin red, 1 núcleo por caso, límites de tiempo y memoria, reglas ICPC (penalización 20 min, CE no cuenta), congelamiento del marcador.
3. **¿Detecta trampas?** Latido de la app: procesos, monitores, USB; alertas solo para el staff y suspensión.
4. **¿Lo puedo montar yo?** Un servidor con Docker Compose, guía de despliegue, código abierto.
5. **¿Quién lo hizo?** Maestría en Ingeniería de Software del CUValles (va al final, como respaldo, no como mensaje principal).

## Orden propuesto

1. Hero: gatito + "rápido y justo" + botones *Ver cómo juzga* / *Instálalo en tu escuela*.
2. Rápido: recorrido de un envío (archivo → veredicto → notificación → marcador).
3. Justo: aislamiento, reglas de marcador, reloj y congelamiento.
4. Sin trampas: integridad y alertas.
5. Para organizadores: roles, credenciales PDF, aclaraciones, bitácora.
6. Móntalo tú: `docker compose up`, requisitos del servidor, enlaces a guía y repo.
7. Hecho en CUValles: equipo y créditos.

## Qué se va

- Metáfora de aeropuerto: vuelos, andenes, "en servicio", paletas split-flap.
- Énfasis en la autoridad del CUValles como lector principal.

## Qué se conserva

- Los ejemplos de pantalla (envío #1042, notificación, aclaración, marcador, alertas, terminal): son la prueba concreta y funcionan bien con cualquier estilo.
- Tema claro/oscuro, logos, nombre "Juez Miau".
