# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Windows 10/11, PySide6 QtWidgets nativo; ninguno de los valores web/ios/android aplica)

## Stack
PySide6-Essentials + requests, empaquetado como un solo `.exe` con PyInstaller en GitHub Actions. Decidido con el usuario.

## Users
Equipos de un concurso universitario de programación, en un laboratorio con más de 90 equipos Windows. Programan en su propio IDE; esta app queda en segundo plano y solo la abren para leer un problema, descargar la plantilla, subir su archivo y ver el veredicto.

## Product Purpose
Ser el único canal del equipo con el juez: problemas, envíos, veredictos, marcador y clarificaciones, y además reportar al juez el estado del equipo (procesos, monitores, USB, red) sin que el competidor lo note. Éxito: el equipo nunca duda de si su envío llegó ni de qué veredicto tuvo.

## Operating Context
- La app vive detrás del IDE: los veredictos llegan como notificación nativa de Windows.
- Cerrar la ventana la minimiza a la bandeja; salir pide confirmación.
- La instalación por equipo es copiar solo `app-competidores.exe`. El servidor se encuentra por el nombre de red `juez.concurso.local`; si hace falta otro, el staff lo cambia desde la app con sus credenciales.

## Capabilities and Constraints
- Sin editor de código. Perder el foco o pegar no es trampa.
- El equipo nunca ve detalles por caso de prueba, de infraestructura ni de alertas de integridad.
- Ligera: meta de menos de 60 MB.

## Product Principles
1. Que funcione antes que se vea bonita; el diseño de Stitch es referencia de colores y orden, no un contrato.
2. El estado de cada problema siempre visible; nada de historiales globales.
3. Avisar sin acusar: los mensajes de error dicen qué pasó y qué hacer, nunca exponen al anticheat.
