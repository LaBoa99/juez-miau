from PySide6.QtWidgets import QDialog, QDialogButtonBox, QTextBrowser, QVBoxLayout

from views.problems_view import tune_rhythm
from views.style import LG, MD

HELP = """
# Cómo usar la app del concurso

La app es tu canal con el juez: aquí lees los problemas, envías tus soluciones y recibes los veredictos.
**Programa en tu IDE**; la app solo sirve para descargar plantillas y subir archivos.

## 1. Iniciar sesión
Usa el usuario y la contraseña que te dio el staff. Marca *Mostrar contraseña* si quieres revisar lo que escribiste.
Al entrar te preguntamos tu lenguaje preferido; puedes cambiarlo después en la lista de cada problema.

## 2. Leer un problema
- A la izquierda están los problemas. El punto junto a cada uno indica su estado:
  anillo gris claro = sin intentar, anillo gris = en juicio, punto verde = aceptado, punto rojo = rechazado.
  El número entre paréntesis es cuántas veces lo has enviado.
- Arriba de la lista está el **tiempo restante** del concurso.
- A la derecha está el enunciado, los límites de tiempo y memoria, y los ejemplos. Con **Copiar** pasas un ejemplo al portapapeles.

## 3. Descargar la plantilla
1. Elige tu lenguaje en la lista.
2. Pulsa **Descargar plantilla** y elige dónde guardarla.
3. Ábrela en tu IDE (la app te ofrece abrirla).

La plantilla ya trae la función que debes completar. No cambies su nombre ni sus parámetros:
el juez llama a esa función con la entrada en JSON, así que no leas de la entrada estándar.

## 4. Enviar una solución
1. Pulsa **Enviar solución** y elige tu archivo.
2. El lenguaje se detecta por la extensión (`.py`, `.cpp`, `.c`…); si no se reconoce, se usa el de la lista.

El archivo debe estar en UTF-8 y pesar menos de 64 KB. Entre un envío y otro hay que esperar unos segundos.

## 5. Veredictos
Debajo del enunciado ves tus intentos de ese problema, del más nuevo al más viejo.
Aunque la app esté detrás de tu IDE, te llega una notificación con cada veredicto.

| Veredicto | Qué significa |
|---|---|
| Aceptado | Tu solución pasó todos los casos. |
| Respuesta incorrecta | Algún caso dio un resultado distinto al esperado. |
| Tiempo límite excedido | Tardó más que el límite del problema. |
| Memoria excedida | Usó más memoria que el límite. |
| Error en ejecución | El programa terminó con un error. |
| Error de compilación | No compiló. Selecciona el intento para ver el mensaje del compilador. |
| En revisión del juez | Un juez lo revisa a mano; te avisamos cuando termine. |

Cada envío rechazado suma 20 minutos de penalización, pero solo si después resuelves ese problema.
Los errores de compilación no cuentan.

## 6. Clarificaciones
Si algo de un enunciado no es claro, ve a la pestaña **Clarificaciones**, elige el problema (o *General del concurso*)
y escribe tu pregunta. El mismo selector filtra la lista: ves las clarificaciones de ese tema, de la más reciente
a la más antigua, con la hora en que se enviaron y se respondieron; el número entre paréntesis es cuántas hay. Cuando el staff responda te llega una notificación.
Las respuestas las ven todos los equipos de tu categoría, sin tu nombre; revísalas de vez en cuando.

## 7. Durante el concurso
- **Deja la app abierta todo el concurso.** Si cierras la ventana, la app se cierra por completo y deja de
  estar conectada con el juez (el staff lo ve).
- En la pestaña **Marcador** ves la tabla de tu categoría (tu equipo va resaltado). En cada problema:
  `42′` = resuelto en el minuto 42, `(+2)` = rechazos antes de resolverlo, `−3` = rechazos sin resolverlo.
  La leyenda está arriba de la tabla. Los equipos suspendidos por el staff aparecen tachados, al final y sin lugar.
- Cuando falta poco para el final, el marcador se congela: los envíos posteriores salen como `?` hasta que termine el concurso.
  Tus propios veredictos siguen llegando normal.
- Abajo a la derecha ves si la app está *Sincronizado* o *Sin conexión*.
- **Cerrar sesión** (arriba a la derecha) desconecta la app del juez hasta que vuelvas a entrar; úsalo solo si el staff te lo pide.

## ¿Algo no funciona?
Si ves *Sin conexión* por más de un minuto, si tu sesión se cierra sola o si un envío no se registra,
**levanta la mano y avisa al staff**. No intentes iniciar sesión en otra computadora.
"""


class HelpDialog(QDialog):
    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("Ayuda")
        self.resize(min(parent.width(), 760), parent.height())

        body = QTextBrowser()
        body.setOpenExternalLinks(False)
        body.document().setDocumentMargin(0)
        body.setMarkdown(HELP)
        tune_rhythm(body.document())

        buttons = QDialogButtonBox()
        buttons.addButton("Cerrar", QDialogButtonBox.ButtonRole.RejectRole)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(LG, LG, LG, MD)
        layout.setSpacing(MD)
        layout.addWidget(body, 1)
        layout.addWidget(buttons)
