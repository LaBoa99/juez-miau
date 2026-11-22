from html import escape

from PySide6.QtCore import QRectF, QTimer, Qt, Signal
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QAbstractItemView, QBoxLayout, QGridLayout, QHBoxLayout, QHeaderView, QLabel, QPushButton, QScrollArea, QTableWidget,
    QTableWidgetItem, QVBoxLayout, QWidget,
)

from services.submission_service import LANGUAGE_NAMES, VERDICTS, has_cases, is_final, verdict_text
from views.case_table import case_input_text, case_text
from views.style import ACCENT, ERROR, ERROR_BG, LG, MD, TEXT_MUTED, XS

# Tiempo y memoria no se muestran: el veredicto ya dice si se pasó de alguno. "Envío" es #1, #2… del problema
COLUMNS = ("Envío", "Lenguaje", "Veredicto")
CHIP = 32  # lado del cuadro de un caso, en px
LIST_WIDTH = 300  # la lista es angosta: el ancho que sobra es para el detalle

# En lugar del cuadro "Tu salida fue" cuando el programa no dejó un resultado que mostrar
NO_OUTPUT = {
    None: "No se ejecutó: el juez se detuvo en un caso anterior.",
    "WA": "No devolvió un resultado válido.",
    "TLE": "No terminó a tiempo.",
    "MLE": "Usó más memoria de la permitida.",
    "RE": "Tu programa lanzó un error.",
}


class AttemptsView(QWidget):
    """Intentos de un solo problema (del más nuevo al más viejo) y, a su lado, el detalle del elegido."""

    feedback_requested = Signal(int)  # submissionId rechazado cuyo detalle aún no se tiene

    def __init__(self):
        super().__init__()
        self.setObjectName("attemptsPane")  # su borde superior separa los intentos del enunciado
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground)
        self.rows = []
        self.feedback = {}  # submissionId → feedback del backend (por qué se rechazó)
        self.requested = set()  # pedidos en curso, para no pedir dos veces el mismo
        self.picked = {}  # submissionId → número de caso abierto por el equipo
        self.chips_per_row = 0  # con cuántos por fila se acomodaron los cuadros la última vez

        heading = QLabel("Intentos")
        heading.setObjectName("section")
        self.empty = QLabel("Aún no envías este problema.")
        self.empty.setObjectName("muted")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        self.table = QTableWidget(0, len(COLUMNS))
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.verticalHeader().hide()
        self.table.setShowGrid(False)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setDefaultAlignment(Qt.AlignmentFlag.AlignLeft)
        self.table.itemSelectionChanged.connect(self._show_detail)

        listing = self.listing = QWidget()
        listing_layout = QVBoxLayout(listing)
        listing_layout.setContentsMargins(0, 0, 0, 0)
        listing_layout.setSpacing(XS)
        listing_layout.addWidget(heading)
        listing_layout.addSpacing(XS)
        listing_layout.addWidget(self.empty)
        listing_layout.addWidget(self.table, 1)
        listing_layout.addStretch(0)

        # Del intento elegido: comentario del juez, log de compilación o en qué caso falló
        self.detail_body = QWidget()
        self.detail_body.setObjectName("detail")
        self.detail_layout = QVBoxLayout(self.detail_body)
        self.detail_layout.setContentsMargins(0, 0, 0, 0)
        self.detail_layout.setSpacing(MD)
        self.detail = QScrollArea()
        self.detail.setAccessibleName("Detalle del intento")
        self.detail.setWidgetResizable(True)
        self.detail.setFrameShape(QScrollArea.Shape.NoFrame)
        self.detail.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.detail.setWidget(self.detail_body)
        self.detail.setMinimumHeight(160)  # con el divisor muy abajo, el detalle aún se lee y se desplaza
        self.detail.hide()

        layout = self.box = QHBoxLayout(self)
        layout.setContentsMargins(0, MD, 0, 0)
        layout.setSpacing(LG)
        layout.addWidget(listing)
        layout.addWidget(self.detail, 1)
        layout.addStretch(0)
        self._arrange(wide=True)

    def resizeEvent(self, event):
        # Con la ventana a media pantalla junto al IDE no caben lado a lado: el detalle pasa debajo de la lista
        self._arrange(wide=event.size().width() >= 2 * LIST_WIDTH)
        super().resizeEvent(event)
        QTimer.singleShot(0, self._reflow)

    def _reflow(self):
        # Los cuadros de casos van en una fila mientras quepan: si cambió cuántos caben, se vuelven a acomodar
        if self._chips_per_row() != self.chips_per_row and self.detail.isVisible():
            self._show_detail()
        self._fit_detail()

    def _chips_per_row(self):
        # Se descuenta la barra de desplazamiento aunque aún no salga: si aparece después, ningún cuadro se corta
        width = self.detail.width() - self.detail.verticalScrollBar().sizeHint().width()
        return max(1, (width + XS) // (CHIP + XS))

    def _fit_detail(self):
        """QScrollArea no respeta el alto que piden las etiquetas con varias líneas: las aplasta en vez de
        desplazarse. Se le fija al contenido el alto que necesita para el ancho que tiene."""
        width = self.detail.viewport().width()
        if width > 0:
            height = self.detail_layout.totalHeightForWidth(width)  # -1 si nada depende del ancho
            self.detail_body.setMinimumHeight(height if height > 0 else self.detail_layout.sizeHint().height())

    def _arrange(self, wide):
        self.box.setDirection(QBoxLayout.Direction.LeftToRight if wide else QBoxLayout.Direction.TopToBottom)
        self.listing.setMinimumWidth(LIST_WIDTH if wide else 0)
        self.listing.setMaximumWidth(LIST_WIDTH if wide else 16777215)
        # Apilados, la lista deja ver tres intentos y el resto del alto es para el detalle
        rows = self.table.horizontalHeader().sizeHint().height() + 3 * self.table.verticalHeader().defaultSectionSize()
        self.table.setMaximumHeight(16777215 if wide else rows + 2 * self.table.frameWidth())

    def set_attempts(self, submissions, languages, progress):
        names = {lang["id"]: LANGUAGE_NAMES.get(lang["code"], lang["code"]) for lang in languages}
        selected = self._selected_id()
        self.rows = sorted(submissions, key=lambda s: s["id"], reverse=True)
        self.empty.setVisible(not self.rows)
        self.table.setVisible(bool(self.rows))
        self.table.setRowCount(len(self.rows))
        for row, sub in enumerate(self.rows):
            values = (
                f"#{self._number(sub)}",
                names.get(sub["languageId"], "?"),
                verdict_text(sub, progress.get(sub["id"])),
            )
            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                if col == 0:
                    item.setToolTip(f"Enviado en el minuto {sub['contestMs'] // 60000} del concurso")
                if col == 2:
                    item.setForeground(QColor(_verdict_color(sub)))
                    if sub["compileLog"] or sub["reviewComment"] or has_cases(sub):
                        item.setToolTip("Selecciona el intento para ver el detalle")
                self.table.setItem(row, col, item)
            if sub["id"] == selected:
                self.table.selectRow(row)
        # Todos en el mismo lenguaje: la columna no dice nada
        self.table.setColumnHidden(1, len({sub["languageId"] for sub in self.rows}) <= 1)
        self._show_detail()

    def _number(self, sub):
        """#1 es el primer envío del equipo a este problema."""
        return len(self.rows) - self.rows.index(sub)

    def _selected_id(self):
        rows = self.table.selectionModel().selectedRows() if self.table.selectionModel() else []
        return self.rows[rows[0].row()]["id"] if rows and rows[0].row() < len(self.rows) else None

    def select(self, submission_id):
        row = next((i for i, sub in enumerate(self.rows) if sub["id"] == submission_id), None)
        if row is not None:
            self.table.selectRow(row)
            self.table.scrollToItem(self.table.item(row, 0))

    def set_feedback(self, submission_id, feedback):
        self.requested.discard(submission_id)
        self.feedback[submission_id] = feedback
        self._show_detail()

    def forget_feedback(self, submission_id=None):
        """Tras un rejudge (un id) o un error de red (todos): al volver a elegir el intento se pide de nuevo."""
        if submission_id is None:
            self.requested.clear()
        else:
            self.feedback.pop(submission_id, None)
            self.requested.discard(submission_id)

    def detail_text(self):
        """Lo que se lee en el detalle, en orden y sin formato (los cuadros dan su texto tal cual)."""
        labels = [label for label in self.detail_body.findChildren(QLabel) if label.text()]
        return "\n".join(label.accessibleDescription() or label.text() for label in labels)

    def _show_detail(self):
        sub = next((s for s in self.rows if s["id"] == self._selected_id()), None)
        _clear(self.detail_layout)
        if sub and sub["reviewComment"]:
            self.detail_layout.addWidget(_text(sub["reviewComment"]))
        if sub and sub["compileLog"]:
            self.detail_layout.addLayout(_case("Error de compilación", sub["compileLog"]))
        missing = sub and has_cases(sub) and sub["id"] not in self.feedback
        if missing:
            self.detail_layout.addWidget(_text("Cargando el detalle…", muted=True))
        elif sub and has_cases(sub):
            self._show_feedback(sub["id"], self.feedback[sub["id"]])
        shown = self.detail_layout.count() > 0
        self.detail_layout.addStretch()
        self.detail.setVisible(shown)
        self._fit_detail()
        QTimer.singleShot(0, self._reflow)  # con el ancho ya acomodado, por si caben más o menos cuadros
        self.detail.verticalScrollBar().setValue(0)
        # Al final: si la respuesta llega en el acto, vuelve a pintar el detalle completo
        if missing and sub["id"] not in self.requested:
            self.requested.add(sub["id"])
            self.feedback_requested.emit(sub["id"])

    def _show_feedback(self, submission_id, feedback):
        if not feedback:
            return
        cases = feedback["cases"]
        failed = next((case for case in cases if case["verdict"] not in (None, "AC")), None)
        # Dónde falló y cuántos pasaron se ve a simple vista en los cuadros
        caption = QLabel("Revisión")
        caption.setObjectName("section")  # mismo estilo que "Intentos", que va al lado
        self.detail_layout.addWidget(caption)

        # Por omisión se abre el ejemplo que falló; si no hay, el primer ejemplo
        examples = [case for case in cases if case["example"]]
        default = failed if failed and failed["example"] else (examples[0] if examples else None)
        picked = next((case for case in examples if case["number"] == self.picked.get(submission_id)), default)

        per_row = self.chips_per_row = self._chips_per_row()
        grid = QGridLayout()
        grid.setSpacing(XS)
        for i, case in enumerate(cases):
            grid.addWidget(self._chip(submission_id, case, case is picked), i // per_row, i % per_row)
        grid.setColumnStretch(min(per_row, len(cases)), 1)
        self.detail_layout.addLayout(grid)
        self.detail_layout.addWidget(_text(
            "Da clic en un ejemplo del enunciado para ver su entrada y salida. Los casos con candado son ocultos: "
            "solo dicen si pasaron.", muted=True))
        if picked:
            self._show_case(picked)

    def _chip(self, submission_id, case, picked):
        """Cuadro de un caso: verde si pasó, rojo si falló, punteado si no se ejecutó. Solo los ejemplos se abren;
        los ocultos llevan candado."""
        chip = _Chip(str(case["number"]), locked=case["example"] is None)
        chip.setObjectName("caseChip")
        chip.setProperty("state", "skip" if case["verdict"] is None else "ok" if case["verdict"] == "AC" else "bad")
        result = _case_verdict(case["verdict"])
        if case["example"]:
            chip.setCheckable(True)
            chip.setChecked(picked)
            chip.setToolTip(f"Ejemplo {case['example']['number']}: {result}")
            chip.clicked.connect(lambda: self._pick(submission_id, case["number"]))
        else:
            chip.setEnabled(False)
            chip.setToolTip(f"Caso oculto: {result}")
        chip.setAccessibleName(f"Caso {case['number']}, {'ejemplo' if case['example'] else 'oculto'}, {result}")
        return chip

    def _pick(self, submission_id, number):
        self.picked[submission_id] = number
        self._show_detail()

    def _show_case(self, case):
        example = case["example"]
        title = QLabel(f"Caso {case['number']}  ·  Ejemplo {example['number']}  ·  {_case_verdict(case['verdict'])}")
        title.setObjectName("section")
        self.detail_layout.addWidget(title)
        self.detail_layout.addLayout(_case("La entrada fue", case_input_text(example["input"])))
        # Como en el panel de staff: las dos salidas lado a lado, con la primera línea distinta marcada
        expected = case_text(example["expected"])
        actual = case_text(example["actual"]) if example["actual"] is not None else None
        diff = _first_diff_line(expected, actual) if actual is not None and case["verdict"] != "AC" else None
        compare = QHBoxLayout()
        compare.setSpacing(MD)
        mine = _case("Tu salida fue", actual, diff=diff) if actual is not None else _missing("Tu salida fue", NO_OUTPUT.get(case["verdict"], "—"))
        for column in (mine, _case("Se esperaba", expected, diff=diff)):
            compare.addLayout(column, 1)
            compare.setAlignment(column, Qt.AlignmentFlag.AlignTop)  # junto a un cuadro más alto, el otro queda arriba
        self.detail_layout.addLayout(compare)
        if example["stderr"]:
            self.detail_layout.addLayout(_case("El error fue", example["stderr"]))


class _Chip(QPushButton):
    """Botón del cuadro de un caso; si es oculto, con un candado dibujado en la esquina superior derecha."""

    def __init__(self, text, locked):
        super().__init__(text)
        self.locked = locked

    def paintEvent(self, event):
        super().paintEvent(event)
        if not self.locked:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        color = QColor(TEXT_MUTED)
        x, y = self.width() - 10, 3  # esquina superior derecha, dentro del borde redondeado
        painter.setPen(QPen(color, 1.2))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawArc(QRectF(x + 1.5, y, 4, 5), 0, 180 * 16)  # arco del candado
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(color)
        painter.drawRoundedRect(QRectF(x, y + 2.5, 7, 5), 1, 1)  # cuerpo
        painter.end()


def _case_verdict(verdict):
    return "no se ejecutó" if verdict is None else VERDICTS.get(verdict, verdict).lower()


def _text(text, muted=False):
    label = QLabel(text)
    label.setWordWrap(True)
    if muted:
        label.setObjectName("muted")
    return label


def _case(title, text, diff=None):
    """Etiqueta gris y abajo el cuadro monoespaciado, igual que los casos del panel de staff."""
    column = QVBoxLayout()
    column.setSpacing(XS)
    label = QLabel(title)
    label.setObjectName("caseLabel")
    column.addWidget(label)

    box = QLabel()
    box.setObjectName("caseBox")
    box.setAccessibleName(title)
    box.setAccessibleDescription(text)
    box.setWordWrap(True)
    box.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    lines = [escape(line) or "&nbsp;" for line in text.split("\n")]
    if diff is not None and diff < len(lines):
        lines[diff] = f"<span style='background:{ERROR_BG}'>{lines[diff]}</span>"
    box.setText("<div style='white-space: pre-wrap'>" + "<br>".join(lines) + "</div>")
    column.addWidget(box)
    return column


def _missing(title, why):
    column = QVBoxLayout()
    column.setSpacing(XS)
    label = QLabel(title)
    label.setObjectName("caseLabel")
    column.addWidget(label)
    column.addWidget(_text(why, muted=True))
    return column


def _first_diff_line(expected, actual):
    a, b = expected.split("\n"), actual.split("\n")
    return next((i for i in range(max(len(a), len(b))) if i >= len(a) or i >= len(b) or a[i].strip() != b[i].strip()), None)


def _clear(layout):
    while layout.count():
        item = layout.takeAt(0)
        widget = item.widget()
        if widget:
            widget.setParent(None)  # sale del árbol ya, no hasta el siguiente ciclo de eventos
            widget.deleteLater()
        elif item.layout():
            _clear(item.layout())


def _verdict_color(sub):
    if not is_final(sub) or sub["verdict"] == "PENDING_REVIEW":
        return TEXT_MUTED
    return ACCENT if sub["verdict"] == "AC" else ERROR
