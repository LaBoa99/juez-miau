---
name: Juez Miau · CUValles
description: Página pública del juez automático del CUValles, armada como una bodega de paquetería donde cada envío corre en su propia caja.
colors:
  kraft: "#C99A5E"
  kraft-2: "#B88A50"
  kraft-3: "#D9B07A"
  kraft-in: "#7A5630"
  ink: "#1E1A16"
  ink-2: "#2A2016"
  rule: "rgb(30 26 22 / 0.28)"
  tape: "#1F4FD8"
  on-tape: "#FFFFFF"
  sticker: "#D92A1E"
  label: "#FFFFFF"
  label-ink: "#141210"
  label-dim: "#57514A"
  ok: "#0F7140"
  bad: "#C2261E"
  warn: "#8A5A00"
  term: "#1C1A17"
  term-ink: "#EDE6D8"
  kraft-dark: "#3B2C1C"
  kraft-2-dark: "#2E2216"
  kraft-3-dark: "#5E482D"
  kraft-in-dark: "#160F08"
  ink-dark: "#F2E8D8"
  ink-2-dark: "#D2BFA3"
  rule-dark: "rgb(242 232 216 / 0.22)"
  tape-dark: "#3463EC"
  sticker-dark: "#C8261E"
  label-dark: "#EDE8DF"
  label-ink-dark: "#16130F"
  label-dim-dark: "#554D44"
  term-dark: "#120F0B"
typography:
  display:
    fontFamily: "Big Shoulders Stencil, Inter, sans-serif"
    fontSize: "clamp(3.4rem, 7.4vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.005em"
    fontVariation: "'opsz' 72"
  headline:
    fontFamily: "Big Shoulders Stencil, Inter, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 4.25rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.005em"
    fontVariation: "'opsz' 72"
  stencil-band:
    fontFamily: "Big Shoulders Stencil, Inter, sans-serif"
    fontSize: "clamp(1.4rem, 2.6vw, 2rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.06em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  label-name:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2.6vw, 1.75rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "'cv11', 'ss01'"
  lead:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
rounded:
  hairline: "2px"
  sm: "3px"
  md: "4px"
spacing:
  s1: "0.25rem"
  s2: "0.5rem"
  s3: "0.75rem"
  s4: "1rem"
  s5: "1.5rem"
  s6: "2rem"
  s7: "3rem"
  s8: "5rem"
  s9: "8rem"
  page: "76rem"
components:
  button-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.2rem"
  button-tape:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.on-tape}"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.2rem"
  thermal-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.sm}"
    padding: "1.1rem 1.25rem 1.25rem"
  tape-band:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.on-tape}"
    typography: "{typography.stencil-band}"
    padding: "0.55rem 0"
  tape-band-warn:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.on-tape}"
    typography: "{typography.stencil-band}"
    padding: "0.55rem 0"
  sticker:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.on-tape}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.7rem"
  verdict-ac:
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.08em 0.4em"
  verdict-bad:
    textColor: "{colors.bad}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.08em 0.4em"
  verdict-warn:
    textColor: "{colors.warn}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.08em 0.4em"
  terminal:
    backgroundColor: "{colors.term}"
    textColor: "{colors.term-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "1rem 1.1rem"
---

# Design System: Juez Miau · CUValles

> Este archivo describe lo que está construido en `site/index.html`, `site/styles.css` y `site/caja.js`. Reemplaza por completo al sistema anterior del «tablero de llegadas» split-flap, que ya no existe. `site/design-system.html` es una hoja de estilo sobrante de ese mundo anterior: está desactualizada y no debe usarse como referencia.

## Overview

**Creative North Star: "La bodega de paquetería"**

A los gatos les encantan las cajas, y a Juez Miau también: cada envío corre en su propia caja sellada, sin red, con un núcleo y los mismos límites para todos. La página entera es una bodega: el suelo es cartón corrugado, la información vive en etiquetas térmicas blancas pegadas encima, cada capítulo se abre con un tramo de cinta de empaque impresa, y los veredictos caen como sellos de tinta. Nada es una «tarjeta» genérica ni una terminal oscura disfrazada; todo es un material que existe en un almacén.

La densidad es de documento de embarque: etiquetas compactas con datos en monoespaciada, separadas por mucho cartón vacío entre capítulos (5 a 8rem). Las piezas de papel se pegan a mano, apenas chuecas (entre −1.5° y 2°), y la sombra es la de un papel sobre una caja, no la de una tarjeta flotante. El gatito detective es protagonista: asoma de la caja del primer viewport y vuelve como inspector en la sección de integridad.

En modo oscuro la bodega apaga la luz: el cartón se vuelve café profundo, pero las etiquetas siguen siendo papel claro (#EDE8DF) con tinta oscura. El papel no cambia de tema.

**Key Characteristics:**
- Cartón kraft con textura (ruido de fibras + canales verticales cada 10px) como fondo de toda la página.
- Etiquetas térmicas blancas con encabezado monoespaciado en mayúsculas y regla negra de 2px.
- Cinta de empaque azul impresa, girada ~1°, que abre cada capítulo con texto en estarcido repetido.
- Sellos de tinta con doble borde, mezcla `multiply` y máscara de ruido para el entintado irregular.
- Pictogramas de manejo enmarcados en 4px de tinta, como los impresos en una caja.
- Tres familias con papeles fijos: estarcido para lo pintado, Inter para leer, mono para lo impreso.

## Colors

Una paleta de materiales: cartón, tinta, papel, cinta azul y calcomanía roja; los colores de veredicto son tintas de impresora y solo aparecen sobre papel.

### Primary
- **Cinta de Empaque Azul** (tape): la cinta impresa que abre los capítulos, el botón principal, la franja sobre la cara de la caja y las cajas de la banda, el sello del marcador y la selección de texto. También es el color del anillo de foco. En oscuro sube a la variante tape-dark para conservar contraste.

### Secondary
- **Calcomanía Roja** (sticker): la calcomanía «Sin red» pegada en la caja y la cinta de «Precaución · Zona de inspección». Solo advertencias físicas; nunca un veredicto.

### Neutral
- **Cartón Kraft** (kraft): el suelo de toda la página y el fondo translúcido de la barra fija.
- **Cartón en Sombra** (kraft-2): cara frontal de la caja, cajas de la banda, hover de los controles de la barra.
- **Solapa Iluminada** (kraft-3): solapas abiertas y el borde superior iluminado de la caja.
- **Interior de Caja** (kraft-in): el fondo de la caja abierta detrás del gatito y la barra de desplazamiento.
- **Tinta sobre Cartón** (ink): texto, titulares en estarcido, marcos de pictogramas y números de paso (6.9:1 sobre kraft).
- **Tinta Secundaria** (ink-2): párrafos de apoyo; mínimo 4.5:1 sobre el canal más oscuro del cartón.
- **Regla** (rule): líneas punteadas y divisores sobre cartón, borde del selector de tema.
- **Papel Térmico** (label) con **Tinta de Etiqueta** (label-ink) y **Tinta Tenue** (label-dim): toda superficie de papel y sus textos.
- **Terminal** (term / term-ink): solo para los bloques de comandos de las instrucciones de armado.

### Tertiary: tintas de veredicto
- **Verde Aceptado** (ok), **Rojo Rechazo** (bad), **Ocre Límite** (warn): AC; WA/RE/CE y alertas; TLE/MLE y avisos. Se usan como color de texto y de borde, no como relleno, salvo en los cuadritos de casos y de problemas resueltos.

### Named Rules
**The Paper Never Changes Rule.** Toda superficie de papel (etiquetas, botones, avisos, cajas de la banda) conserva tinta oscura en ambos temas, y cada una redeclara localmente `--ok`, `--bad` y `--warn` con sus valores claros. Si un componente de papel hereda los colores de veredicto del tema oscuro, está roto.

**The One Blue Rule.** El azul es cinta. Aparece donde habría cinta de empaque (encabezados de capítulo, botón principal, franjas de caja, sello) o como foco. No se usa para enlaces, íconos sueltos ni fondos de sección.

**The Verdicts Live On Paper Rule.** Los colores de veredicto solo se aplican sobre papel o sobre la terminal (donde `ok` sube a #6BE09A). Sobre cartón no hay verde ni rojo de estado.

## Typography

**Display Font:** Big Shoulders Stencil (con Inter de respaldo), eje `opsz` en 72
**Body Font:** Inter (con system-ui), con `cv11` y `ss01`
**Label/Mono Font:** JetBrains Mono (con ui-monospace), cifras tabulares

**Character:** El estarcido es lo que se pinta con plantilla sobre la caja: grueso, en mayúsculas y apretado. Inter es lo que se lee con calma. JetBrains Mono es lo que imprime la etiqueta: números de envío, horas, límites y encabezados de etiqueta.

### Hierarchy
- **Display** (900, clamp(3.4rem, 7.4vw, 6rem), 0.92, mayúsculas): solo el titular del primer viewport, a no más de 9ch.
- **Headline** (900, clamp(2.4rem, 5vw, 4.25rem), 0.92, mayúsculas): titulares de capítulo, a no más de 14–16ch. El remitente baja a clamp(2.2rem, 4.4vw, 3.5rem).
- **Stencil band** (900, clamp(1.4rem, 2.6vw, 2rem), 0.06em, mayúsculas): texto de cintas; en el sello ACEPTADO (clamp(1.6rem, 3vw, 2.1rem)) y los números de paso (1.9rem) la misma voz cambia de tamaño. Por debajo de 1.4rem el estarcido se lee mal: la calcomanía, la cinta del marcador, los nombres de pictograma y el sello «Revisado» van en Inter 800 en mayúsculas (0.82–0.95rem).
- **Title** (Inter 800, 1.1–1.2rem, 1.25, −0.01em): subtítulos h3 de reglas y pasos.
- **Label name** (Inter 800, clamp(1.35rem, 2.6vw, 1.75rem), 1.05, −0.025em): el destinatario de la etiqueta de envío.
- **Body** (Inter 400, 1rem, 1.6): texto corrido; entradilla a 1.125rem y 46ch, párrafos de capítulo a 1.0625rem y 58–60ch.
- **Label** (Mono 700, 0.75rem, 0.06–0.08em, mayúsculas): encabezados de etiqueta y de tabla.
- **Data** (Mono 400–500, 0.75–0.85rem): renglones de datos, tiempos, alertas y comandos.

### Named Rules
**The Three Voices Rule.** Cada familia tiene un solo papel: estarcido para lo pintado sobre cartón o cinta, Inter para leer, mono para lo impreso por la etiqueta. Nunca estarcido en párrafos ni Inter en una cinta.

**The Stencil Is Uppercase Rule.** El estarcido siempre va en mayúsculas, peso 900 y con interlineado cerrado (0.92 en titulares, 1 en cintas y sellos).

**The 12px Floor Rule.** Ningún texto baja de 0.75rem (12px). Medido con la auditoría de contraste: todo texto pasa 4.5:1 en ambos temas, contra el canal más oscuro del cartón.

## Layout

Contenedor único de 76rem con 1rem de margen a cada lado (`min(100% - 2rem, 76rem)`). La escala de espaciado va de 0.25rem a 8rem (s1–s9); el ritmo entre capítulos es grande (s8 arriba del primero, s9 entre capítulos) y dentro de un capítulo el encabezado deja s7 antes del contenido.

- **Primer viewport:** a partir de 62rem, dos columnas (1fr y 1.02fr) con el titular a la izquierda y la caja abierta a la derecha; altura mínima `min(100svh − 11.5rem, 46rem)` para que la banda transportadora asome abajo. Debajo de 62rem se apila.
- **Split:** el patrón de dos columnas de capítulo (1.1fr / 0.9fr desde 62rem; la lista de empaque usa 1.45fr / 0.75fr). Debajo, una sola columna.
- **Banda transportadora:** a todo el ancho, fuera del contenedor, entre el primer viewport y el primer capítulo.
- **Cintas:** se salen 2rem del contenedor por cada lado (`margin: 0 -2rem`) para que parezcan pegadas de canto a canto.
- **Pictogramas:** 2 columnas en móvil, 4 desde 48rem. Pasos de armado: 2 columnas desde 56rem.
- **Barra:** fija arriba, 4rem de alto; debajo de 54rem la navegación baja a un segundo renglón con desplazamiento horizontal y el `scroll-padding-top` sube de 5rem a 7rem.
- Por debajo de 30rem la caja del primer viewport se compacta (gatito a 9.5rem, solapas más bajas, datos de etiqueta a 0.72rem).

## Elevation & Depth

La profundidad es física: papel pegado sobre cartón. Las sombras son tibias (canal `--shadow` = 40 25 5 en claro, negro en oscuro), con un contacto de 1px y una caída larga con dispersión negativa, de modo que la sombra queda pegada debajo de la pieza. La caja del primer viewport es el único volumen: interior en sombra interna, borde superior iluminado (`inset 0 4px 0 kraft-3`) y sombra larga al piso. La banda transportadora se hunde con una sombra interna.

### Shadow Vocabulary
- **Papel pegado** (`0 1px 1px rgb(var(--shadow) / 0.16), 0 14px 28px -16px rgb(var(--shadow) / 0.6)`): etiquetas, nota de aclaración y lista de veredictos.
- **Botón** (`0 1px 1px rgb(var(--shadow) / 0.18), 0 8px 18px -12px rgb(var(--shadow) / 0.6)`; en hover `0 2px 2px … / 0.18, 0 14px 24px -12px … / 0.65`).
- **Cinta** (`0 4px 10px -6px rgb(0 0 0 / 0.5)`): cintas de capítulo y sello del marcador.
- **Caja** (`0 28px 40px -24px rgb(var(--shadow) / 0.7)` más los dos `inset`): solo la cara frontal de la caja del primer viewport.
- **Recorte** (`drop-shadow(0 6px 8px rgb(0 0 0 / 0.25))` / `drop-shadow(0 12px 16px rgb(var(--shadow) / 0.45))`): el gatito, que es una ilustración recortada.

### Named Rules
**The Stuck-Down Rule.** Toda sombra lleva dispersión negativa y queda debajo de la pieza; nada flota. No hay sombras duras desplazadas ni brillos de color.

## Shapes

Esquinas casi rectas: 2px para cuadritos, pictogramas y la nota; 3px para etiquetas, botones y chips de veredicto; 4px para sellos, calcomanía, selector de tema y terminal. Lo único redondo son los números de paso (círculo de 3px de tinta) y los puntos del rastreo. Los bordes de tinta son gruesos y rectos: 4px en pictogramas y su marco, 3px doble en sellos, 2px como regla bajo el encabezado de etiqueta, 1.5px en chips de veredicto. Las solapas de la caja se recortan con `clip-path` trapezoidal. Las piezas pegadas a mano rotan entre −1.5° y 2°; la calcomanía (7°) y los sellos (−9°, −6°) giran más porque se aplican de golpe.

## Components

### Buttons
Papel o cinta, pegados a la página; al pasar el cursor se despegan un poco.
- **Shape:** esquinas de 3px.
- **Primario (cinta):** fondo azul de cinta con brillo vertical (`linear-gradient(180deg, rgb(255 255 255 / 0.16), transparent 45%, rgb(0 0 0 / 0.08))`), texto blanco, Inter 700 0.95rem, padding 0.85rem × 1.2rem, ícono de 1.15rem a 0.55rem del texto.
- **Secundario (etiqueta):** papel blanco con tinta de etiqueta, mismas medidas.
- **Hover / Active:** sube 2px y gira −0.5° en 180ms con `cubic-bezier(0.16, 1, 0.3, 1)`; la sombra crece. Al presionar vuelve a su lugar.
- **Focus:** anillo azul de 3px a 3px de distancia, global para todo elemento interactivo.

### Etiqueta térmica (signature)
La superficie de información de todo el sitio: envío, rastreo, marcador, reporte de inspección, lista de empaque y remitente son variantes de la misma etiqueta.
- **Fondo:** papel (label) con tinta de etiqueta; esquinas de 3px; sombra de papel pegado; rotación propia por variante.
- **Encabezado:** a la izquierda qué es la etiqueta, a la derecha su identificador en mono; ambos en Label, separados del cuerpo por una regla de 2px de tinta.
- **Tablas:** encabezados en Label tenue con regla de 1.5px; renglones separados por línea discontinua `rgb(0 0 0 / 0.22)`; números alineados a la derecha en mono tabular.
- **Ejemplo:** todo dato ilustrativo lleva la marca «Ejemplo» en mono 0.75rem, mayúsculas, abajo a la derecha.

### Sellos de tinta
- **Estilo:** estarcido 900 en mayúsculas, doble borde de 3px en `currentColor`, mezcla `multiply`, opacidad 0.85–0.9 y máscara de ruido fractal para el entintado.
- **Variantes:** «Aceptado» en verde de veredicto sobre la etiqueta de envío; la huella «Revisado» en azul de cinta sobre el reporte de inspección.
- **Movimiento:** entra en 320ms de escala 1.7 y desenfoque 4px a su lugar.

### Chips de veredicto
- **Estilo:** mono 700 0.72rem en mayúsculas, borde de 1.5px en `currentColor`, sin relleno, ancho mínimo 2.6em.
- **Color:** AC en ok; WA, RE, CE y alertas en bad; TLE, MLE y avisos en warn. En la terminal el borde baja a 1px.

### Cinta de capítulo
- **Estilo:** tramo de cinta azul a todo el ancho más 2rem por lado, girado −1.2° (la variante alterna gira 0.9°), con brillo vertical y sombra de cinta. Texto repetido en Stencil band: «Juez Miau · Frágil: código adentro», «Este lado arriba», «Hecho en el CUValles».
- **Variante de advertencia:** en rojo de calcomanía para la zona de inspección.
- Es decorativa (`aria-hidden`); el titular real del capítulo va debajo en estarcido.

### Pictogramas de manejo
- **Estilo:** marco de 4px de tinta y 2px de esquina, 5.25rem de lado, ícono de trazo a 3.6rem; nombre debajo en estarcido 1.3rem. Toda la fila va dentro de otro marco de 4px.

### Banda transportadora
- **Estilo:** banda gris oscura con rodillos cada 44px y bordes metálicos de 5px; cajas de cartón con franja de cinta al centro y una etiqueta blanca en mono 0.75rem con número, problema, equipo y chip de veredicto.
- **Movimiento:** recorre −50% en 48s lineal e infinito; se pausa al pasar el cursor. El contenido se duplica por script para que el ciclo no salte.

### Caja abierta con el gatito (signature)
La caja del primer viewport: interior oscuro, dos solapas trapezoidales, el gatito asomado, franja de cinta vertical en la cara frontal, calcomanía «Sin red» girada 7° y la etiqueta de envío #1042. Al entrar en pantalla (50% visible) los 12 casos se marcan uno por uno cada 110–230ms, el gatito baja 0.9rem mientras se juzga y al final cae el sello. El HTML ya trae el estado final; sin movimiento, se muestra tal cual.

### Navigation
- **Barra:** fija, cartón al 90% con desenfoque de 8px y regla inferior. Marca (gatito de 34px + «Juez Miau» en Inter 800), enlaces en Inter 600 0.925rem que se subrayan al pasar el cursor, enlace a GitHub como ícono de 2.25rem y selector de tema.
- **Selector de tema:** tres opciones (claro, oscuro, sistema) en un marco de 1.5px; la elegida se invierte a tinta sobre cartón.

### Íconos
Íconos SVG de trazo en `site/assets/icons/`, pintados como máscara sobre `currentColor` a 1.15rem por defecto; heredan el color del texto que acompañan.

### Terminal
Bloque de comandos de las instrucciones de armado: fondo term, texto term-ink en mono 0.8rem/1.7, esquinas de 4px, prompt `$` atenuado. Es el único lugar oscuro dentro del contenido.

## Do's and Don'ts

### Do:
- **Do** poner cualquier información nueva sobre una etiqueta térmica, con encabezado en Label y regla de 2px, en lugar de inventar una tarjeta.
- **Do** abrir cada capítulo nuevo con una cinta impresa y un titular en estarcido debajo.
- **Do** redeclarar `--ok`, `--bad` y `--warn` con los valores claros en todo componente de papel nuevo.
- **Do** girar las piezas pegadas a mano entre −1.5° y 2°, y usar la sombra de papel pegado.
- **Do** marcar como «Ejemplo» todo dato ilustrativo (envíos, marcadores, alertas, aclaraciones).
- **Do** entregar el estado final en el HTML y animar solo encima, respetando `prefers-reduced-motion`.

### Don't:
- **Don't** usar el estarcido en párrafos, en minúsculas o en pesos menores a 900.
- **Don't** usar el azul de cinta para enlaces, fondos de sección o íconos sueltos.
- **Don't** poner colores de veredicto directamente sobre el cartón.
- **Don't** oscurecer las etiquetas en el tema oscuro: el papel se queda claro.
- **Don't** convertir la página en un hero con rejilla de tarjetas ni en una terminal oscura.
- **Don't** usar globos de colores ni referencias a ICPC u otros jueces.
- **Don't** tomar `site/design-system.html` como referencia: pertenece al tablero split-flap anterior.


## Movimiento y sellos (agregado)

- **Íconos como sellos:** los pictogramas de manejo y los números de paso llevan la máscara de tinta `--ink-mask-light` (feTurbulence), marco grueso y una rotación ligera distinta cada uno, como si se hubieran estampado a mano. El sello ACEPTADO usa `--ink-mask`, que es más gastada. Los íconos de botones y de la barra se quedan limpios porque son controles.
- **Coreografía:** el script agrega `.motion` a `<html>` solo si no hay movimiento reducido. Al entrar en pantalla, las cintas y la cinta del marcador se desenrollan de izquierda a derecha (`clip-path`, 900ms). Los pictogramas y el sello «Revisado» se estampan en orden (escala 1.6 → 1 con desenfoque, 140ms entre uno y otro). El rastreo avanza paso a paso (380ms) hasta que «Entregado» se pone verde.
- **Al pasar el cursor:** el gatito de la caja se asoma 0.6rem, el inspector inclina la cabeza y cada pictograma se hunde como un sello al presionarse.
- Sin JS o con movimiento reducido, todo se ve en su estado final.

## Cinta, pisadas y más movimiento (agregado)

- **Toda pieza de papel va pegada con cinta** (`.taped`): etiquetas, tablas, notas, la notificación, las terminales y el remitente. Las angostas llevan un tramo al centro; las anchas (`.taped--corners`) llevan dos tramos en las esquinas. Ningún papel va derecho: cada uno gira entre −1° y 2°. Lo que está impreso directo en la caja (panel de manejo, pasos de armado) sí va derecho.
- **Terminales:** van envueltas en `.term-wrap` para que la cinta no se recorte con el desplazamiento horizontal. Las ligaduras de la monoespaciada están apagadas para que los diagramas ASCII conserven sus columnas.
- **Docker Compose** (`#compose`): cada servicio es una caja con su etiqueta (nombre, rol, puertos), el diagrama de la guía de despliegue en ASCII y una etiqueta con la documentación del repo.
- **Checklist de la máquina:** casillas estampadas que el organizador palomea; la palomita es un trazo de cinta azul y se recuerda en `localStorage`.
- **Pisadas:** el script dibuja huellas que bajan por el margen (o pegadas a la orilla derecha en pantallas angostas) y cada una aparece cuando el scroll la alcanza. Con movimiento reducido se ven todas desde el inicio.
- **Gatito vivo:** los dos gatitos parpadean cada 3 a 6 s; el párpado (`.lid`) es una elipse del color de la cara posicionada sobre cada ojo del dibujo. En la sección de inspección el gatito voltea y se inclina hacia el cursor.
- **Marcador:** el HTML trae el orden final. Con movimiento, Quetzal Greedy empieza tercero, resuelve B en el minuto 107 (penalización 190 → 297), sube al primer lugar con una animación FLIP y después la cinta sella el marcador.
- **Terminal de «Levántalo»:** el comando se teclea con cursor y los servicios aparecen en `Up` uno por uno.
- **Notificación:** cuando cae el sello ACEPTADO, una copia de la notificación de Windows entra desde la esquina inferior derecha y sale a los 4.8 s (o al hacer clic).
- **Mascota:** `assets/gatito.svg` ahora tiene gabardina (#a8743f, del mismo café del sombrero) bajo la cara; `gatito-512.png` se regeneró desde el SVG.
