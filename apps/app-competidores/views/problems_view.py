from PySide6.QtCore import QPointF, Qt, QUrl, Signal
from PySide6.QtGui import QColor, QDesktopServices, QGuiApplication, QIcon, QPainter, QPen, QPixmap, QTextCursor, QTextFormat
from PySide6.QtWidgets import (
    QComboBox, QFileDialog, QHBoxLayout, QInputDialog, QMessageBox, QLabel, QListWidget, QListWidgetItem, QPushButton, QSplitter,
    QStackedWidget, QTextBrowser, QVBoxLayout, QWidget,
)

from services.submission_service import CODE_TO_EXTENSION, EXTENSION_TO_CODE, LANGUAGE_NAMES, problem_states
from views.attempts_view import AttemptsView
from views.style import ACCENT, BORDER, ERROR, LG, MD, PANEL, SM, TEXT_MUTED, XS

READING_WIDTH = 760  # ~75 caracteres por línea

STATE_LABELS = {None: "sin intentar", "pending": "en juicio", "solved": "aceptado", "rejected": "rechazado"}


def _dot(color, filled):
    """Ícono de estado: punto relleno o anillo, dibujado para no depender de glifos."""
    size = 12
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setPen(QPen(QColor(color), 1.5))
    painter.setBrush(QColor(color) if filled else Qt.BrushStyle.NoBrush)
    painter.drawEllipse(QPointF(size / 2, size / 2), 4, 4)
    painter.end()
    return QIcon(pixmap)


class ProblemsView(QWidget):
    """Lista de problemas a la izquierda y el detalle del elegido a la derecha."""

    refresh_requested = Signal()
    submit_requested = Signal(int, str, str)  # problemId, ruta, languageId elegido
    template_requested = Signal(str, str)  # ruta, código

    def __init__(self):
        super().__init__()
        self.problems = []
        self.languages = []
        self.submissions = []
        self.progress = {}
        self.icons = {
            None: _dot(BORDER, False),
            "pending": _dot(TEXT_MUTED, False),
            "solved": _dot(ACCENT, True),
            "rejected": _dot(ERROR, True),
        }

        self.sidebar = QListWidget()
        self.sidebar.setObjectName("sidebar")
        self.sidebar.setAccessibleName("Problemas")
        self.sidebar.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.sidebar.setTextElideMode(Qt.TextElideMode.ElideRight)
        self.sidebar.currentRowChanged.connect(self._show_problem)

        # Cronómetro del concurso, siempre visible arriba de la lista
        self.clock = QLabel("–:––:––")
        self.clock.setObjectName("clock")
        self.clock.setAccessibleName("Tiempo restante del concurso")
        self.clock_note = QLabel()
        self.clock_note.setObjectName("muted")
        left = QWidget()
        left.setObjectName("sidebarPanel")
        left.setAttribute(Qt.WidgetAttribute.WA_StyledBackground)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(0)
        clock_box = QVBoxLayout()
        clock_box.setContentsMargins(MD, MD, MD, SM)
        clock_box.setSpacing(0)
        clock_box.addWidget(self.clock_note)
        clock_box.addWidget(self.clock)
        left_layout.addLayout(clock_box)
        left_layout.addWidget(self.sidebar, 1)

        self.title = QLabel()
        self.title.setObjectName("title")
        self.title.setWordWrap(True)
        self.limits = QLabel()
        self.limits.setObjectName("muted")

        self.language = QComboBox()
        self.language.setAccessibleName("Lenguaje")
        self.template_button = QPushButton("Descargar plantilla")
        self.template_button.setObjectName("secondary")
        self.template_button.clicked.connect(self._save_template)
        self.submit_button = QPushButton("Enviar solución")
        self.submit_button.clicked.connect(self._choose_file)
        self.message = QLabel()
        self.message.setWordWrap(True)
        self.message.hide()

        actions = QHBoxLayout()
        actions.setSpacing(SM)
        actions.addWidget(self.language)
        actions.addWidget(self.template_button)
        actions.addStretch()
        actions.addWidget(self.submit_button)

        self.body = QTextBrowser()
        self.body.setOpenLinks(False)
        self.body.anchorClicked.connect(self._on_link)
        self.body.document().setDocumentMargin(0)
        self.attempts = AttemptsView()

        reading = QSplitter(Qt.Orientation.Vertical)
        reading.addWidget(self.body)
        reading.addWidget(self.attempts)
        reading.setStretchFactor(0, 1)
        reading.setSizes([380, 300])
        reading.setChildrenCollapsible(False)

        column = QWidget()
        column.setMaximumWidth(READING_WIDTH + 2 * LG)
        detail_layout = QVBoxLayout(column)
        detail_layout.setContentsMargins(LG, LG, LG, MD)
        detail_layout.setSpacing(0)
        detail_layout.addWidget(self.title)
        detail_layout.addSpacing(XS)
        detail_layout.addWidget(self.limits)
        detail_layout.addSpacing(MD)
        detail_layout.addLayout(actions)
        detail_layout.addSpacing(XS)
        detail_layout.addWidget(self.message)
        detail_layout.addSpacing(MD)
        detail_layout.addWidget(reading, 1)

        detail = QWidget()
        detail.setObjectName("detail")
        QHBoxLayout(detail).addWidget(column)
        detail.layout().setContentsMargins(0, 0, 0, 0)
        detail.layout().addStretch()
        detail.layout().setStretch(0, 1)

        split = QSplitter()
        split.addWidget(left)
        split.addWidget(detail)
        split.setStretchFactor(1, 1)
        split.setSizes([240, 760])
        split.setChildrenCollapsible(False)

        self.stack = QStackedWidget()
        self.stack.addWidget(split)
        self.stack.addWidget(self._empty_state())

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.stack)

    def _empty_state(self):
        title = QLabel("El concurso aún no inicia")
        title.setObjectName("title")
        text = QLabel("Los problemas aparecen aquí en cuanto empiece. Mientras tanto, ten listo tu IDE.")
        text.setObjectName("muted")
        text.setWordWrap(True)
        button = QPushButton("Revisar de nuevo")
        button.setObjectName("secondary")
        button.clicked.connect(self.refresh_requested.emit)

        box = QWidget()
        box.setMaximumWidth(420)
        inner = QVBoxLayout(box)
        inner.setSpacing(0)
        inner.addWidget(title)
        inner.addSpacing(SM)
        inner.addWidget(text)
        inner.addSpacing(LG)
        inner.addWidget(button, alignment=Qt.AlignmentFlag.AlignLeft)

        page = QWidget()
        page.setObjectName("detail")
        outer = QHBoxLayout(page)
        outer.addWidget(box, alignment=Qt.AlignmentFlag.AlignCenter)
        return page

    # ── Datos ──────────────────────────────────────────────

    def set_contest(self, problems, languages):
        self.problems = problems
        if [lang["id"] for lang in languages] != [lang["id"] for lang in self.languages]:
            chosen = self.language.currentData()
            self.languages = languages
            self.language.clear()
            for lang in languages:
                self.language.addItem(LANGUAGE_NAMES.get(lang["code"], lang["code"]), lang["id"])
            if chosen:
                self.language.setCurrentIndex(max(self.language.findData(chosen), 0))
        if not problems:
            self.stack.setCurrentIndex(1)
            return
        self.stack.setCurrentIndex(0)
        current = max(self.sidebar.currentRow(), 0)
        self.sidebar.blockSignals(True)
        self.sidebar.clear()
        for problem in problems:
            item = QListWidgetItem(problem["title"])
            item.setToolTip(problem["title"])
            self.sidebar.addItem(item)
        self.sidebar.blockSignals(False)
        self._refresh_states()
        self.sidebar.setCurrentRow(min(current, len(problems) - 1))
        self._show_problem(self.sidebar.currentRow())

    def set_submissions(self, submissions, progress):
        self.submissions = submissions
        self.progress = progress
        self._refresh_states()
        self._refresh_attempts()

    def set_clock(self, text, note):
        self.clock.setText(text)
        self.clock_note.setText(note)

    def ask_preferred_language(self):
        names = [LANGUAGE_NAMES.get(lang["code"], lang["code"]) for lang in self.languages]
        dialog = QInputDialog(self.window())
        dialog.setWindowTitle("Lenguaje preferido")
        dialog.setLabelText("¿En qué lenguaje vas a programar?\nLo dejamos elegido para plantillas y envíos; puedes cambiarlo cuando quieras.")
        dialog.setComboBoxItems(names)
        dialog.setTextValue(self.language.currentText() or names[0])
        dialog.setOkButtonText("Usar este lenguaje")
        dialog.setCancelButtonText("Después")
        for button in dialog.findChildren(QPushButton):
            if button.text() == "Después":
                button.setObjectName("secondary")
                button.style().unpolish(button)
                button.style().polish(button)
        if dialog.exec():
            self.language.setCurrentIndex(names.index(dialog.textValue()))

    def set_submitting(self, busy):
        self.submit_button.setDisabled(busy)
        self.submit_button.setText("Enviando…" if busy else "Enviar solución")
        if busy:
            self.message.hide()

    def offer_open_template(self, path):
        box = QMessageBox(self.window())
        box.setWindowTitle("Plantilla guardada")
        box.setText(f"La plantilla quedó en:\n{path}")
        open_button = box.addButton("Abrir plantilla", QMessageBox.ButtonRole.AcceptRole)
        box.addButton("Cerrar", QMessageBox.ButtonRole.RejectRole).setObjectName("secondary")
        box.setDefaultButton(open_button)
        box.exec()
        if box.clickedButton() is open_button and not QDesktopServices.openUrl(QUrl.fromLocalFile(path)):
            self.show_message("No hay un programa asociado a ese tipo de archivo. Ábrelo desde tu IDE.", error=True)

    def show_message(self, text, error=False, success=False):
        self.message.setObjectName("error" if error else "success" if success else "muted")
        self.message.style().polish(self.message)
        self.message.setText(text)
        self.message.show()

    def _current(self):
        row = self.sidebar.currentRow()
        return self.problems[row] if 0 <= row < len(self.problems) else None

    def _refresh_states(self):
        states = problem_states(self.submissions)
        for row, problem in enumerate(self.problems):
            item = self.sidebar.item(row)
            if not item:
                continue
            state, attempts = states.get(problem["id"], (None, 0))
            count = f"  ({attempts})" if attempts else ""
            item.setText(f"{problem['letter']}   {problem['title']}{count}")
            item.setIcon(self.icons[state])
            item.setData(Qt.ItemDataRole.AccessibleTextRole, f"{problem['letter']} {problem['title']}, {STATE_LABELS[state]}")

    def _refresh_attempts(self):
        problem = self._current()
        if problem:
            mine = [s for s in self.submissions if s["problemId"] == problem["id"]]
            self.attempts.set_attempts(mine, self.languages, self.progress)

    def _show_problem(self, row):
        problem = self._current()
        if not problem:
            return
        self.title.setText(f"{problem['letter']}. {problem['title']}")
        limits = problem.get("limits")
        self.limits.setText(
            f"Tiempo {limits['timeLimitMs'] / 1000:g} s  ·  Memoria {limits['memoryLimitMb']} MB" if limits else ""
        )
        self.message.hide()
        self.body.setMarkdown(problem_markdown(problem))
        tune_rhythm(self.body.document())
        self._refresh_attempts()

    # ── Acciones ───────────────────────────────────────────

    def _on_link(self, url: QUrl):
        # copy:<índice>:<input|output>
        _, index, field = url.toString().split(":")
        QGuiApplication.clipboard().setText(self._current()["samples"][int(index)][field])
        self.show_message("Ejemplo copiado.")

    def _language_code(self):
        return next((lang["code"] for lang in self.languages if lang["id"] == self.language.currentData()), None)

    def _save_template(self):
        problem, code = self._current(), self._language_code()
        if not problem or not code:
            return
        starter = problem.get("starterCode", {}).get(code)
        if starter is None:
            self.show_message("Este problema no tiene plantilla para ese lenguaje.", error=True)
            return
        suggested = f"{problem['letter']}{CODE_TO_EXTENSION.get(code, '.txt')}"
        path = self._file_dialog("Guardar plantilla", save_as=suggested)
        if path:
            self.template_requested.emit(path, starter)

    def _choose_file(self):
        problem = self._current()
        if not problem:
            return
        patterns = " ".join(f"*{ext}" for ext in EXTENSION_TO_CODE)
        path = self._file_dialog(
            f"Enviar solución de {problem['letter']}", filters=[f"Código fuente ({patterns})", "Todos los archivos (*)"]
        )
        if path:
            self.submit_requested.emit(problem["id"], path, self.language.currentData() or "")

    def _file_dialog(self, title, save_as=None, filters=()):
        # Diálogo de Qt (no el nativo) para que respete el tema claro, del tamaño de la ventana
        dialog = QFileDialog(self.window(), title)
        dialog.setOption(QFileDialog.Option.DontUseNativeDialog)
        dialog.resize(self.window().size())
        # La traducción de Qt es de España ("fichero"); estas etiquetas van en español de México
        label = QFileDialog.DialogLabel
        for key, text in ((label.LookIn, "Buscar en:"), (label.FileName, "Nombre del archivo:"),
                          (label.FileType, "Tipo de archivo:"), (label.Reject, "Cancelar")):
            dialog.setLabelText(key, text)
        dialog.setLabelText(label.Accept, "Guardar" if save_as else "Abrir")
        if save_as:
            dialog.setAcceptMode(QFileDialog.AcceptMode.AcceptSave)
            dialog.selectFile(save_as)
        else:
            dialog.setFileMode(QFileDialog.FileMode.ExistingFile)
            dialog.setNameFilters(list(filters))
        return dialog.selectedFiles()[0] if dialog.exec() else None


def tune_rhythm(document):
    """Más aire arriba de cada encabezado que abajo, y los bloques de código sobre un fondo propio."""
    block = document.begin()
    while block.isValid():
        fmt = block.blockFormat()
        if fmt.headingLevel():
            fmt.setTopMargin(LG)
            fmt.setBottomMargin(XS)
            QTextCursor(block).setBlockFormat(fmt)
        elif fmt.hasProperty(QTextFormat.Property.BlockCodeFence):
            fmt.setBackground(QColor(PANEL))
            # Cada línea del bloque es un bloque de Qt: el margen va solo en la última
            if not block.next().blockFormat().hasProperty(QTextFormat.Property.BlockCodeFence):
                fmt.setBottomMargin(SM)
            QTextCursor(block).setBlockFormat(fmt)
        block = block.next()


def problem_markdown(problem):
    parts = [problem["statement"]]
    if problem.get("inputFormat"):
        parts.append(f"### Entrada\n\n{problem['inputFormat']}")
    if problem.get("outputFormat"):
        parts.append(f"### Salida\n\n{problem['outputFormat']}")
    for i, sample in enumerate(problem.get("samples") or []):
        parts.append(
            f"### Ejemplo {i + 1}\n\n"
            f"**Entrada** · [Copiar](copy:{i}:input)\n\n```\n{sample['input']}\n```\n\n"
            f"**Salida esperada** · [Copiar](copy:{i}:output)\n\n```\n{sample['output']}\n```"
        )
    return "\n\n".join(parts)
