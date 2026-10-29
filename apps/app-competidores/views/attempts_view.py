from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFontDatabase
from PySide6.QtWidgets import (
    QAbstractItemView, QHeaderView, QLabel, QPlainTextEdit, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from services.submission_service import LANGUAGE_NAMES, is_final, verdict_text
from views.style import ACCENT, ERROR, MD, SM, TEXT_MUTED, XS

COLUMNS = ("Minuto", "Lenguaje", "Veredicto", "Tiempo", "Memoria")


class AttemptsView(QWidget):
    """Intentos de un solo problema, del más nuevo al más viejo."""

    def __init__(self):
        super().__init__()
        self.rows = []

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
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setDefaultAlignment(Qt.AlignmentFlag.AlignLeft)
        self.table.itemSelectionChanged.connect(self._show_detail)

        # Log de compilación o comentario del juez del intento elegido
        self.detail = QPlainTextEdit()
        self.detail.setReadOnly(True)
        self.detail.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        self.detail.setMaximumHeight(88)
        self.detail.hide()

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, MD, 0, 0)
        layout.setSpacing(XS)
        layout.addWidget(heading)
        layout.addSpacing(XS)
        layout.addWidget(self.empty)
        layout.addWidget(self.table, 1)
        layout.addWidget(self.detail)
        # Sin intentos, el espacio sobrante va al final y el aviso queda bajo el título
        layout.addStretch(0)

    def set_attempts(self, submissions, languages, progress):
        names = {lang["id"]: LANGUAGE_NAMES.get(lang["code"], lang["code"]) for lang in languages}
        selected = self._selected_id()
        self.rows = sorted(submissions, key=lambda s: s["id"], reverse=True)
        self.empty.setVisible(not self.rows)
        self.table.setVisible(bool(self.rows))
        self.table.setRowCount(len(self.rows))
        for row, sub in enumerate(self.rows):
            minutes = sub["contestMs"] // 60000
            values = (
                f"{minutes // 60}:{minutes % 60:02d}",
                names.get(sub["languageId"], "?"),
                verdict_text(sub, progress.get(sub["id"])),
                f"{sub['maxTimeMs'] / 1000:.2f} s" if sub["maxTimeMs"] is not None else "–",
                f"{sub['maxMemoryKb'] / 1024:.1f} MB" if sub["maxMemoryKb"] is not None else "–",
            )
            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                if col == 2:
                    item.setForeground(QColor(_verdict_color(sub)))
                    if sub["compileLog"] or sub["reviewComment"]:
                        item.setToolTip("Selecciona el intento para ver el detalle")
                self.table.setItem(row, col, item)
            if sub["id"] == selected:
                self.table.selectRow(row)
        self._show_detail()

    def _selected_id(self):
        rows = self.table.selectionModel().selectedRows() if self.table.selectionModel() else []
        return self.rows[rows[0].row()]["id"] if rows and rows[0].row() < len(self.rows) else None

    def _show_detail(self):
        sub = next((s for s in self.rows if s["id"] == self._selected_id()), None)
        text = "\n\n".join(t for t in ((sub or {}).get("reviewComment"), (sub or {}).get("compileLog")) if t)
        self.detail.setPlainText(text)
        self.detail.setVisible(bool(text))


def _verdict_color(sub):
    if not is_final(sub) or sub["verdict"] == "PENDING_REVIEW":
        return TEXT_MUTED
    return ACCENT if sub["verdict"] == "AC" else ERROR
