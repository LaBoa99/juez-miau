from collections import Counter
from html import escape

from PySide6.QtCore import QDateTime, Qt, Signal
from PySide6.QtWidgets import (
    QComboBox, QHBoxLayout, QLabel, QPlainTextEdit, QPushButton, QTextBrowser, QVBoxLayout, QWidget,
)

from services.clarification_service import ALL_TOPICS, by_topic
from views.style import ACCENT, LG, MD, SM, TEXT_MUTED, XS

GENERAL = "General del concurso"
ALL = "Todos los temas"

READING_WIDTH = 760


class ClarificationsView(QWidget):
    """Preguntar al staff y leer las respuestas publicadas para la categoría."""

    ask_requested = Signal(object, str)  # problemId o None, pregunta

    def __init__(self):
        super().__init__()
        self.setObjectName("detail")
        self.problems = []
        self.items = []

        title = QLabel("Clarificaciones")
        title.setObjectName("title")
        hint = QLabel("Pregunta al staff si algo de un enunciado no es claro. Las respuestas las ven todos los equipos, sin tu nombre.")
        hint.setObjectName("muted")
        hint.setWordWrap(True)

        self.topic = QComboBox()
        self.topic.setAccessibleName("Tema de la pregunta y filtro de la lista")
        # El mismo tema sirve para preguntar y para filtrar la lista
        self.topic.currentIndexChanged.connect(lambda _: self._render())
        self.question = QPlainTextEdit()
        self.question.setAccessibleName("Pregunta")
        self.question.setPlaceholderText("Escribe tu pregunta…")
        self.question.setFixedHeight(84)
        self.send_button = QPushButton("Enviar pregunta")
        self.send_button.clicked.connect(self._send)
        self.message = QLabel()
        self.message.setWordWrap(True)
        self.message.hide()

        # Orden de lectura: tema, pregunta, enviar
        topic_row = QHBoxLayout()
        topic_row.setSpacing(SM)
        topic_row.addWidget(QLabel("Sobre"))
        topic_row.addWidget(self.topic)
        topic_row.addStretch()
        send_row = QHBoxLayout()
        send_row.addStretch()
        send_row.addWidget(self.send_button)

        self.list = QTextBrowser()
        self.list.setObjectName("clarifications")
        self.list.document().setDocumentMargin(0)

        column = QWidget()
        column.setMaximumWidth(READING_WIDTH + 2 * LG)
        layout = QVBoxLayout(column)
        layout.setContentsMargins(LG, LG, LG, MD)
        layout.setSpacing(0)
        layout.addWidget(title)
        layout.addSpacing(XS)
        layout.addWidget(hint)
        layout.addSpacing(MD)
        layout.addLayout(topic_row)
        layout.addSpacing(SM)
        layout.addWidget(self.question)
        layout.addSpacing(SM)
        layout.addLayout(send_row)
        layout.addSpacing(XS)
        layout.addWidget(self.message)
        layout.addSpacing(LG)
        layout.addWidget(self.list, 1)

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(column, 1)
        outer.addStretch()

    def set_problems(self, problems):
        self.problems = problems
        current = self.topic.currentData()
        self.topic.blockSignals(True)
        self.topic.clear()
        # Solo filtra: para preguntar hay que elegir un tema concreto
        self.topic.addItem(ALL, ALL_TOPICS)
        self.topic.addItem(GENERAL, None)
        for problem in problems:
            self.topic.addItem(f"{problem['letter']}. {problem['title']}", problem["id"])
        self.topic.setCurrentIndex(max(self.topic.findData(current), 0))
        self.topic.blockSignals(False)
        # Los títulos de los problemas pueden llegar después que las clarificaciones
        self.set_clarifications(self.items)

    def set_clarifications(self, clarifications):
        self.items = clarifications
        # Cuántas hay por tema, en el propio selector
        counts = Counter(c["problemId"] for c in clarifications)
        counts[ALL_TOPICS] = len(clarifications)
        titles = [ALL, GENERAL] + [f"{p['letter']}. {p['title']}" for p in self.problems]
        for index, title in enumerate(titles):
            n = counts.get(self.topic.itemData(index), 0)
            self.topic.setItemText(index, f"{title} ({n})" if n else title)
        self._render()

    def _render(self):
        shown = by_topic(self.items, self.topic.currentData())
        if not shown:
            self.list.setHtml(f"<p style='color:{TEXT_MUTED}'>Aún no hay clarificaciones sobre este tema.</p>")
            return
        blocks = []
        for i, c in enumerate(shown):
            mine = " · <b>Tu pregunta</b>" if c.get("mine") else ""
            sent = f"Enviada {_when(c['createdAt'])}"
            answered = f" · Respondida {_when(c['answeredAt'])}" if c.get("answeredAt") else ""
            answer = (
                f"<p style='margin:{XS}px 0 0 0'><b style='color:{ACCENT}'>Respuesta:</b> {_text(c['answer'])}</p>"
                if c["answer"] else
                f"<p style='margin:{XS}px 0 0 0; color:{TEXT_MUTED}'>Esperando respuesta del staff.</p>"
            )
            # El texto enriquecido de Qt ignora márgenes de <div>: la separación va en el primer párrafo
            gap = 0 if i == 0 else LG
            blocks.append(
                f"<p style='margin:{gap}px 0 0 0; color:{TEXT_MUTED}'>{sent}{answered}{mine}</p>"
                f"<p style='margin:{XS}px 0 0 0'>{_text(c['question'])}</p>{answer}"
            )
        self.list.setHtml("".join(blocks))

    def set_sending(self, busy):
        self.send_button.setDisabled(busy)
        self.send_button.setText("Enviando…" if busy else "Enviar pregunta")
        if busy:
            self.message.hide()

    def show_message(self, text, error=False):
        self.message.setObjectName("error" if error else "muted")
        self.message.style().polish(self.message)
        self.message.setText(text)
        self.message.show()

    def clear_question(self):
        self.question.clear()

    def _send(self):
        if self.topic.currentData() == ALL_TOPICS:
            self.show_message("Elige en «Sobre» si tu pregunta es general o de qué problema es.", error=True)
            self.topic.setFocus()
            return
        self.ask_requested.emit(self.topic.currentData(), self.question.toPlainText())


def _when(iso):
    # Hora local de la computadora del equipo; el día solo si no es hoy
    moment = QDateTime.fromString(iso, Qt.DateFormat.ISODateWithMs).toLocalTime()
    if not moment.isValid():
        return ""
    same_day = moment.date() == QDateTime.currentDateTime().date()
    return moment.toString("HH:mm" if same_day else "dd/MM HH:mm")


def _text(value):
    # Texto del usuario o del staff: se escapa y se respetan los saltos de línea
    return escape(value).replace("\n", "<br>")
