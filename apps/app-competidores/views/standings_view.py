from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import QAbstractItemView, QHeaderView, QLabel, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget

from services.standings_service import cell_text
from views.style import ACCENT, ERROR, LG, MD, SELECTED, SM, TEXT_MUTED, XS

# Cómo leer cada celda; los colores son los mismos de la tabla
LEGEND = (
    f"<span style='color:{ACCENT}'><b>42′</b></span> resuelto en el minuto 42 &nbsp;·&nbsp; "
    f"<span style='color:{ACCENT}'>(+2)</span> rechazos antes de resolverlo &nbsp;·&nbsp; "
    f"<span style='color:{ERROR}'>−3</span> rechazos sin resolverlo &nbsp;·&nbsp; "
    f"<span style='color:{TEXT_MUTED}'>? 2</span> envíos pendientes &nbsp;·&nbsp; "
    "<b>negritas</b> primero en resolverlo &nbsp;·&nbsp; <s>tachado</s> equipo suspendido<br>"
    "Se ordena por problemas resueltos y, en empate, por menor penalización: minuto de cada problema resuelto "
    "más 20 minutos por cada rechazo previo (los errores de compilación no cuentan)."
)


class StandingsView(QWidget):
    """Marcador de la categoría del equipo, con su fila resaltada."""

    def __init__(self):
        super().__init__()
        self.setObjectName("detail")

        self.title = QLabel("Marcador")
        self.title.setObjectName("title")
        self.subtitle = QLabel()
        self.subtitle.setObjectName("muted")
        self.subtitle.setWordWrap(True)
        self.legend = QLabel(LEGEND)
        self.legend.setObjectName("muted")
        self.legend.setWordWrap(True)
        self.legend.hide()
        self.empty = QLabel("El marcador aparece en cuanto inicia el concurso.")
        self.empty.setObjectName("muted")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        self.table = QTableWidget()
        self.table.verticalHeader().hide()
        self.table.setShowGrid(False)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        self.table.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.table.horizontalHeader().setDefaultAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.table.hide()

        layout = QVBoxLayout(self)
        layout.setContentsMargins(LG, LG, LG, MD)
        layout.setSpacing(0)
        layout.addWidget(self.title)
        layout.addSpacing(XS)
        layout.addWidget(self.subtitle)
        layout.addSpacing(SM)
        layout.addWidget(self.legend)
        layout.addSpacing(MD)
        layout.addWidget(self.empty)
        layout.addWidget(self.table, 1)
        layout.addStretch(0)

    def set_standings(self, standings, category, team_id):
        if not category:
            self.show_empty()
            return
        frozen = (
            f" · Congelado desde el minuto {standings['freezeMinute']}: los envíos posteriores salen como pendientes (?)"
            if standings["frozen"] else ""
        )
        self.subtitle.setText(f"Categoría {category['name']}{frozen}")
        self.empty.hide()
        self.legend.show()
        self.table.show()

        problems = category["problems"]
        # Orden: lugar, equipo, un resultado por problema y al final los totales
        headers = ["#", "Equipo"] + [p["letter"] for p in problems] + ["Resueltos", "Penalización"]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        for col, problem in enumerate(problems, start=2):
            self.table.horizontalHeaderItem(col).setToolTip(problem["title"])
        self.table.setRowCount(len(category["rows"]))

        bold = QFont()
        bold.setWeight(QFont.Weight.DemiBold)
        for r, row in enumerate(category["rows"]):
            mine = row["teamId"] == team_id
            suspended = row.get("suspended", False)
            rank = "–" if row["rank"] is None else str(row["rank"])
            items = [QTableWidgetItem(rank), QTableWidgetItem(row["teamName"] + ("  (tu equipo)" if mine else ""))]
            for cell in row["cells"]:
                item = QTableWidgetItem(cell_text(cell))
                if cell["solved"]:
                    item.setForeground(QColor(ACCENT))
                    if cell["firstToSolve"]:
                        item.setFont(bold)
                        item.setToolTip("Primero en resolverlo")
                elif cell["rejected"]:
                    item.setForeground(QColor(ERROR))
                elif cell["pending"]:
                    item.setForeground(QColor(TEXT_MUTED))
                items.append(item)
            items += [QTableWidgetItem(str(row["solved"])), QTableWidgetItem(str(row["penalty"]))]
            for c, item in enumerate(items):
                if c != 1:
                    item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                if mine:
                    item.setBackground(QColor(SELECTED))
                    if c < 2:
                        item.setFont(bold)
                if suspended:
                    # Tachado y apagado: el backend ya lo manda al final y sin lugar
                    font = item.font()
                    font.setStrikeOut(True)
                    item.setFont(font)
                    item.setForeground(QColor(TEXT_MUTED))
                    item.setToolTip("Equipo suspendido por el staff")
                self.table.setItem(r, c, item)

        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        for col in range(len(headers)):
            if col != 1:
                self.table.horizontalHeaderItem(col).setTextAlignment(Qt.AlignmentFlag.AlignCenter)

    def show_empty(self):
        self.subtitle.setText("")
        self.legend.hide()
        self.table.hide()
        self.empty.show()
