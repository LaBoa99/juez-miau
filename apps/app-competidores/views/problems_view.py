from PySide6.QtCore import QBuffer, QByteArray, QEvent, QIODevice, QPointF, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import (
    QColor, QDesktopServices, QFont, QIcon, QPainter, QPen, QPixmap, QTextBlockFormat, QTextCharFormat,
    QTextCursor, QTextFormat,
)
from PySide6.QtWidgets import (
    QComboBox, QFileDialog, QFrame, QHBoxLayout, QInputDialog, QMessageBox, QLabel, QListWidget, QListWidgetItem, QPushButton, QSplitter,
    QStackedWidget, QTextBrowser, QVBoxLayout, QWidget,
)

from PySide6.QtPdf import QPdfDocument
from PySide6.QtPdfWidgets import QPdfView

from services.submission_service import CODE_TO_EXTENSION, EXTENSION_TO_CODE, LANGUAGE_NAMES, problem_states
from views.attempts_view import AttemptsView
from views.case_table import case_input_text, case_text, insert_example
from views.style import ACCENT, BORDER, ERROR, LG, MD, SM, TEXT_MUTED, XS

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
    pdf_requested = Signal(int)  # problemId cuyo enunciado es PDF y aún no se descarga

    def __init__(self):
        super().__init__()
        self.problems = []
        self.pdfs = {}  # problemId → bytes del enunciado en PDF (solo en memoria)
        self.pdf_pending = set()  # descargas en curso, para no pedir dos veces el mismo
        self.languages = []
        self.submissions = []
        self.progress = {}
        self.paused = False
        self.submitting = False
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

        # Fila propia para las acciones, como botones normales: lenguaje y plantilla a la izquierda, enviar a la derecha
        actions = QHBoxLayout()
        actions.setSpacing(SM)
        actions.addWidget(self.language)
        actions.addWidget(self.template_button)
        actions.addStretch()
        actions.addWidget(self.submit_button)

        self.body = QTextBrowser()
        self.body.setOpenLinks(False)
        self.body.anchorClicked.connect(QDesktopServices.openUrl)  # los enlaces del enunciado se abren fuera
        self.body.document().setDocumentMargin(0)
        self.attempts = AttemptsView()

        # Enunciado en PDF: se abre aquí mismo, sin navegador y sin escribirlo a disco
        self.pdf_document = QPdfDocument(self)
        self.pdf_buffer = None
        self.pdf_view = QPdfView()
        self.pdf_view.setAccessibleName("Enunciado")
        self.pdf_view.setDocument(self.pdf_document)
        self.pdf_view.setPageMode(QPdfView.PageMode.MultiPage)
        self.pdf_view.setZoomMode(QPdfView.ZoomMode.FitToWidth)
        self.pdf_view.installEventFilter(self)  # para ajustar el zoom cuando cambia su ancho
        self.pdf_view.hide()

        # Arriba el enunciado (con PDF: el PDF y debajo los ejemplos); abajo los intentos junto a su detalle
        reading = self.reading = QSplitter(Qt.Orientation.Vertical)
        reading.addWidget(self.pdf_view)
        reading.addWidget(self.body)
        reading.addWidget(self.attempts)
        reading.setStretchFactor(0, 2)
        reading.setStretchFactor(1, 2)
        reading.setStretchFactor(2, 1)
        reading.setSizes([380, 380, 280])
        reading.setChildrenCollapsible(False)
        # El divisor es solo zona de arrastre; la línea entre enunciado e intentos la pinta el panel de intentos
        reading.setObjectName("sections")
        reading.setHandleWidth(MD)

        # A todo el ancho: la ventana suele compartir pantalla con el IDE, así que no se fija su tamaño
        detail = QWidget()
        detail.setObjectName("detail")
        column_layout = QVBoxLayout(detail)
        column_layout.setContentsMargins(LG, LG, LG, MD)
        column_layout.setSpacing(0)
        column_layout.addWidget(self.title)
        column_layout.addSpacing(MD)
        column_layout.addLayout(actions)
        column_layout.addSpacing(XS)
        column_layout.addWidget(self.message)
        column_layout.addSpacing(MD)
        rule = QFrame()  # separa el encabezado (título y acciones) del enunciado
        rule.setObjectName("rule")
        rule.setFixedHeight(1)
        column_layout.addWidget(rule)
        column_layout.addSpacing(MD)
        column_layout.addWidget(reading, 1)

        split = QSplitter()
        split.addWidget(left)
        split.addWidget(detail)
        split.setStretchFactor(1, 1)
        split.setSizes([200, 1000])
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
        text = QLabel("Los problemas aparecerán aquí cuando inicie el concurso. Mientras tanto, prepara tu IDE.")
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

    def show_attempt(self, problem_id, submission_id, switch=False):
        """Selecciona un intento si su problema está abierto; con switch, primero abre el problema."""
        row = next((i for i, p in enumerate(self.problems) if p["id"] == problem_id), None)
        if row is None:
            return
        if switch:
            self.sidebar.setCurrentRow(row)
        if row == self.sidebar.currentRow():
            self.attempts.select(submission_id)

    def set_clock(self, text, note):
        self.clock.setText(text)
        self.clock_note.setText(note)

    def ask_preferred_language(self):
        names = [LANGUAGE_NAMES.get(lang["code"], lang["code"]) for lang in self.languages]
        dialog = QInputDialog(self.window())
        dialog.setWindowTitle("Lenguaje preferido")
        dialog.setLabelText("¿En qué lenguaje vas a programar?\nSe usará en plantillas y envíos. Puedes cambiarlo después.")
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
        self.submitting = busy
        self._refresh_submit()
        if busy:
            self.message.hide()

    def set_paused(self, paused):
        self.paused = paused
        self._refresh_submit()

    def _refresh_submit(self):
        self.submit_button.setDisabled(self.submitting or self.paused)
        self.submit_button.setText("Enviando…" if self.submitting else "Concurso en pausa" if self.paused else "Enviar solución")

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
        self.message.hide()
        render_problem(self.body.document(), problem)
        self.body.moveCursor(QTextCursor.MoveOperation.Start)  # el enunciado se lee desde arriba
        self._show_pdf(problem)
        self._refresh_attempts()

    def set_statement_pdf(self, problem_id, data):
        self.pdf_pending.discard(problem_id)
        self.pdfs[problem_id] = data
        problem = self._current()
        if problem and problem["id"] == problem_id:
            self._show_pdf(problem)

    def eventFilter(self, watched, event):
        if watched is self.pdf_view and event.type() == QEvent.Type.Resize:
            self._fit_pdf_zoom()
        return super().eventFilter(watched, event)

    def _fit_pdf_zoom(self):
        """Ajustado al ancho, salvo que sobre espacio: ahí la hoja va a su tamaño real y no con letras enormes."""
        page = self.pdf_document.pagePointSize(0).width() * 96 / 72  # ancho de la hoja en px a 100 %
        wide = page > 0 and self.pdf_view.viewport().width() > page + 2 * LG
        if wide:
            self.pdf_view.setZoomMode(QPdfView.ZoomMode.Custom)
            self.pdf_view.setZoomFactor(1.0)
        else:
            self.pdf_view.setZoomMode(QPdfView.ZoomMode.FitToWidth)

    def _fit_pdf_layout(self):
        """Con PDF, abajo de él solo van los ejemplos: ocupan lo que miden (hasta un tercio) y el resto es del PDF."""
        sizes = self.reading.sizes()
        total = sizes[0] + sizes[1]
        if total <= 0:
            return
        examples = int(self.body.document().size().height()) + 2 * self.body.frameWidth()
        examples = min(examples, total // 3)
        self.reading.setSizes([total - examples, examples, sizes[2]])

    def forget_pdf_requests(self):
        """Tras un error de red: al volver a abrir el problema se intenta de nuevo."""
        self.pdf_pending.clear()

    def _show_pdf(self, problem):
        if not problem.get("hasStatementPdf"):
            self.pdf_view.hide()
            return
        if self.pdf_view.isHidden():
            self.pdf_view.show()
            QTimer.singleShot(0, self._fit_pdf_layout)
        data = self.pdfs.get(problem["id"])
        if data is None:
            self.pdf_document.close()
            if problem["id"] not in self.pdf_pending:
                self.pdf_pending.add(problem["id"])
                self.pdf_requested.emit(problem["id"])
            return
        # El buffer debe vivir mientras el documento esté abierto
        self.pdf_document.close()
        self.pdf_buffer = QBuffer(self)
        self.pdf_buffer.setData(QByteArray(data))
        self.pdf_buffer.open(QIODevice.OpenModeFlag.ReadOnly)
        self.pdf_document.load(self.pdf_buffer)
        self._fit_pdf_zoom()

    # ── Acciones ───────────────────────────────────────────

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
        solved = problem_states(self.submissions).get(problem["id"], (None, 0))[0] == "solved"
        if solved and not self._confirm_resubmit(problem):
            return
        patterns = " ".join(f"*{ext}" for ext in EXTENSION_TO_CODE)
        path = self._file_dialog(
            f"Enviar solución de {problem['letter']}", filters=[f"Código fuente ({patterns})", "Todos los archivos (*)"]
        )
        if path:
            self.submit_requested.emit(problem["id"], path, self.language.currentData() or "")

    def _confirm_resubmit(self, problem):
        box = QMessageBox(self.window())
        box.setIcon(QMessageBox.Icon.Warning)
        box.setWindowTitle("Problema ya resuelto")
        box.setText(f"Ya resolviste el problema {problem['letter']}.")
        box.setInformativeText("Otro envío no cambia tu lugar en el marcador. ¿Quieres enviarlo de todos modos?")
        cancel = box.addButton("Cancelar", QMessageBox.ButtonRole.RejectRole)
        cancel.setObjectName("secondary")
        send = box.addButton("Enviar de todos modos", QMessageBox.ButtonRole.AcceptRole)
        box.setDefaultButton(cancel)
        box.exec()
        return box.clickedButton() is send

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
    """Más aire arriba de cada encabezado que abajo, y aire después de cada bloque de código."""
    block = document.begin()
    while block.isValid():
        fmt = block.blockFormat()
        if fmt.headingLevel():
            fmt.setTopMargin(LG)
            fmt.setBottomMargin(XS)
            QTextCursor(block).setBlockFormat(fmt)
        elif fmt.hasProperty(QTextFormat.Property.BlockCodeFence):
            # Cada línea del bloque es un bloque de Qt: el margen va solo en la última
            if not block.next().blockFormat().hasProperty(QTextFormat.Property.BlockCodeFence):
                fmt.setBottomMargin(SM)
            QTextCursor(block).setBlockFormat(fmt)
        block = block.next()


def problem_markdown(problem):
    # La firma no se muestra: la plantilla ya la trae. Los ejemplos los agrega render_problem
    parts = [problem["statement"]] if problem.get("statement") else []
    if problem.get("signature") and problem.get("fullProgram"):
        # Categoría especial: programa completo que lee de la entrada; los ejemplos ya vienen como texto
        order = ", ".join(f"`{p['name']}`" for p in problem["signature"]["params"])
        parts.append(
            "### Cómo resolverlo\n\n"
            "Escribe un programa completo:\n\n"
            f"1. Lee los datos en este orden: {order}.\n"
            "2. Calcula la respuesta.\n"
            "3. Imprime solo la respuesta.\n\n"
            "**Descargar plantilla** ya incluye la lectura de los datos."
        )
    if problem.get("inputFormat"):
        parts.append(f"### Entrada\n\n{problem['inputFormat']}")
    if problem.get("outputFormat"):
        parts.append(f"### Salida\n\n{problem['outputFormat']}")
    return "\n\n".join(parts)


def render_problem(document, problem):
    """Enunciado en markdown y al final los ejemplos, cada uno con su columna Entrada y su columna Salida."""
    document.setMarkdown(problem_markdown(problem))
    cursor = QTextCursor(document)
    cursor.movePosition(QTextCursor.MoveOperation.End)
    for i, sample in enumerate(problem.get("samples") or []):
        insert_heading(cursor, f"Ejemplo {i + 1}")
        insert_example(cursor, case_input_text(sample["input"]), case_text(sample["output"]))
    tune_rhythm(document)


def insert_heading(cursor, text):
    """Encabezado como los ### del markdown, en un bloque propio (insertHtml lo pegaría al párrafo anterior)."""
    if cursor.block().text():
        cursor.insertBlock()
    block = QTextBlockFormat()
    block.setHeadingLevel(3)
    cursor.setBlockFormat(block)
    char = QTextCharFormat()
    char.setFontWeight(QFont.Weight.Bold)
    char.setProperty(QTextFormat.Property.FontSizeAdjustment, 1)  # el mismo tamaño que da Qt a un ###
    cursor.insertText(text, char)
