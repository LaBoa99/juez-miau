from html import escape

from PySide6.QtCore import Qt, QTimer, Signal, Slot
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QApplication, QHBoxLayout, QLabel, QMainWindow, QMessageBox, QPushButton, QStackedWidget, QTabBar, QVBoxLayout, QWidget,
)

from views.clarifications_view import ClarificationsView
from views.help_view import HelpDialog
from views.login_view import LoginView
from views.problems_view import ProblemsView
from views.standings_view import StandingsView
from views.style import ERROR, MD, SM

CREDITS = (
    "<p><b>App del concurso de programación</b><br>Versión 1.0</p>"
    "<p>Desarrollado por:<br>Ing. Gael Rodríguez<br>Ing. Maribel Navarro</p>"
)

STATUS = {
    "DRAFT": "En preparación",
    "SCHEDULED": "Programado",
    "RUNNING": "En curso",
    "PAUSED": "En pausa",
    "FINISHED": "Terminado",
}


class MainWindow(QMainWindow):
    close_requested = Signal()
    server_requested = Signal()
    logout_requested = Signal()

    def __init__(self):
        super().__init__()
        self.resize(1100, 720)
        self.status = None
        # Login y concurso son páginas de la misma ventana: no cambia el tamaño al entrar
        self.login = LoginView()
        self.problems = ProblemsView()
        self.standings = StandingsView()
        self.clarifications = ClarificationsView()
        self.pages = QStackedWidget()
        for page in (self.login, self.problems, self.standings, self.clarifications):
            self.pages.addWidget(page)

        # Una sola barra arriba: pestañas del concurso a la izquierda y Ayuda a la derecha
        self.tabs = QTabBar()
        self.tabs.setDrawBase(False)
        self.tabs.setExpanding(False)
        self.tabs.addTab("Problemas")
        self.tabs.addTab("Marcador")
        self.tabs.addTab("Clarificaciones")
        self.tabs.currentChanged.connect(lambda i: self.pages.setCurrentIndex(i + 1))
        help_button = QPushButton("Ayuda")
        help_button.setObjectName("topbarButton")
        help_button.setToolTip("Cómo usar la app (F1)")
        help_button.clicked.connect(self.show_help)
        self.logout_button = QPushButton("Cerrar sesión")
        self.logout_button.setObjectName("topbarButton")
        self.logout_button.clicked.connect(self.logout_requested.emit)
        help_action = QAction(self)
        help_action.setShortcut(QKeySequence.StandardKey.HelpContents)
        help_action.triggered.connect(self.show_help)
        self.addAction(help_action)
        # Atajo del staff para cambiar el servidor; solo desde el login
        server_action = QAction(self)
        server_action.setShortcut(QKeySequence("Ctrl+Shift+S"))
        server_action.triggered.connect(lambda: self.pages.currentWidget() is self.login and self.server_requested.emit())
        self.addAction(server_action)

        topbar = QWidget()
        topbar.setObjectName("topbar")
        topbar.setAttribute(Qt.WidgetAttribute.WA_StyledBackground)
        bar = QHBoxLayout(topbar)
        bar.setContentsMargins(SM, 0, SM, 0)
        bar.addWidget(self.tabs)
        bar.addStretch()
        bar.addWidget(help_button)
        bar.addWidget(self.logout_button)

        central = QWidget()
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(topbar)
        layout.addWidget(self.pages, 1)
        self.setCentralWidget(central)

        # Barra inferior: equipo (o avisos) | Créditos al centro | estado y conexión
        self.team_label = QLabel()
        self.status_label = QLabel()
        self.connection_label = QLabel()
        credits_button = QPushButton("Créditos")
        credits_button.setObjectName("topbarButton")
        credits_button.clicked.connect(self.show_credits)
        self.team_text = ""
        self.message_timer = QTimer(self)
        self.message_timer.setSingleShot(True)
        self.message_timer.timeout.connect(self._clear_message)
        bottom = QWidget()
        row = QHBoxLayout(bottom)
        row.setContentsMargins(MD, 0, MD, 0)
        row.setSpacing(MD)
        left, right = QHBoxLayout(), QHBoxLayout()
        left.addWidget(self.team_label)
        left.addStretch()
        right.addStretch()
        right.addWidget(self.status_label)
        right.addWidget(self.connection_label)
        # Mismo estiramiento a los lados: Créditos queda al centro aunque cambie el texto
        row.addLayout(left, 1)
        row.addWidget(credits_button)
        row.addLayout(right, 1)
        self.statusBar().addPermanentWidget(bottom, 1)
        self.set_offline()
        self.statusBar().setSizeGripEnabled(False)
        self.show_login()

    def show_login(self):
        self.setWindowTitle("Juez Miau · Iniciar sesión")
        for label in (self.team_label, self.status_label, self.connection_label):
            label.hide()
        self.tabs.hide()
        self.logout_button.hide()
        self.pages.setCurrentWidget(self.login)
        self.login.username.setFocus()

    def show_contest(self):
        for label in (self.team_label, self.status_label, self.connection_label):
            label.show()
        self.tabs.show()
        self.logout_button.show()
        self.tabs.setCurrentIndex(0)
        self.pages.setCurrentWidget(self.problems)

    def show_help(self):
        HelpDialog(self).exec()

    def show_credits(self):
        box = QMessageBox(self)
        box.setWindowTitle("Créditos")
        box.setIconPixmap(QApplication.windowIcon().pixmap(160, 160))
        box.setText(CREDITS)
        box.addButton("Cerrar", QMessageBox.ButtonRole.AcceptRole)
        box.exec()

    def set_team(self, team):
        self.team_text = f"Equipo: {team['name']}"
        self._clear_message()

    def set_contest(self, view):
        self.setWindowTitle(f"Juez Miau · {view['edition']['name']}")
        self.set_status(view["clock"])
        self.problems.set_contest(view["problems"], view["languages"])
        self.clarifications.set_problems(view["problems"])

    def set_status(self, clock):
        self.status = STATUS.get(clock["status"], clock["status"])
        self.status_label.setText(self.status)

    def set_clock(self, text, note):
        self.problems.set_clock(text, note)
        # En la barra también, para verlo desde cualquier pestaña
        self.status_label.setText(f"{self.status} · {text}" if self.status else text)

    @Slot()
    def set_online(self):
        self.connection_label.setText("Sincronizado")

    @Slot()
    def set_offline(self):
        self.connection_label.setText("Sin conexión")

    def show_error(self, message):
        # Unos segundos en lugar del nombre del equipo; luego regresa
        self.team_label.setText(f"<span style='color:{ERROR}'>{escape(message)}</span>")
        self.message_timer.start(8000)

    def _clear_message(self):
        self.team_label.setText(self.team_text)

    def confirm_logout(self):
        answer = QMessageBox.question(
            self, "Cerrar sesión",
            "Al cerrar sesión la app deja de estar conectada con el juez hasta que vuelvas a entrar. ¿Quieres cerrar sesión?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        return answer == QMessageBox.StandardButton.Yes

    def confirm_quit(self):
        answer = QMessageBox.question(
            self, "Salir del concurso",
            "Si sales, la app deja de estar conectada con el juez. ¿Quieres salir?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        return answer == QMessageBox.StandardButton.Yes

    def closeEvent(self, event):
        # Sin sesión no hay nada que vigilar: cerrar el login cierra la app
        if self.pages.currentWidget() is self.login:
            QApplication.quit()
            return
        # Con sesión se pide confirmar; si acepta, la app se cierra del todo (no queda en la bandeja,
        # así se puede borrar el .exe y el juez ve que dejó de reportar)
        event.ignore()
        self.close_requested.emit()
