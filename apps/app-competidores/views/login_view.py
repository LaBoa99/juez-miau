from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QCheckBox, QHBoxLayout, QLabel, QLineEdit, QPushButton, QVBoxLayout, QWidget

from views.style import LG, MD, SM, XS


class LoginView(QWidget):
    """Página de login dentro de la ventana principal (mismo tamaño que el resto de la app)."""

    submitted = Signal(str, str)
    server_requested = Signal()

    def __init__(self):
        super().__init__()
        self.setObjectName("login")

        title = QLabel("Inicia sesión con tu equipo")
        title.setObjectName("title")
        hint = QLabel("Usa el usuario y la contraseña que te dio el staff.")
        hint.setObjectName("muted")
        hint.setWordWrap(True)

        self.username = QLineEdit()
        self.username.setAccessibleName("Usuario")
        self.password = QLineEdit()
        self.password.setAccessibleName("Contraseña")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.show_password = QCheckBox("Mostrar contraseña")
        self.show_password.toggled.connect(
            lambda on: self.password.setEchoMode(QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password)
        )
        self.error = QLabel()
        self.error.setObjectName("error")
        self.error.setWordWrap(True)
        self.error.hide()
        self.button = QPushButton("Entrar")
        self.button.setDefault(True)
        # Solo aparece si no hay conexión; pide credenciales de staff
        self.server_button = QPushButton("Configurar servidor (staff)")
        self.server_button.setObjectName("secondary")
        self.server_button.clicked.connect(self.server_requested.emit)
        self.server_button.hide()

        form = QWidget()
        form.setFixedWidth(360)
        layout = QVBoxLayout(form)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(title)
        layout.addSpacing(XS)
        layout.addWidget(hint)
        layout.addSpacing(LG)
        for text, field in (("Usuario", self.username), ("Contraseña", self.password)):
            label = QLabel(text)
            label.setBuddy(field)
            layout.addWidget(label)
            layout.addSpacing(XS)
            layout.addWidget(field)
            layout.addSpacing(MD if field is self.username else SM)
        layout.addWidget(self.show_password)
        layout.addSpacing(MD)
        layout.addWidget(self.error)
        layout.addSpacing(SM)
        buttons = QHBoxLayout()
        buttons.setSpacing(SM)
        buttons.addWidget(self.server_button)
        buttons.addStretch()
        buttons.addWidget(self.button)
        layout.addLayout(buttons)

        page = QHBoxLayout(self)
        page.addWidget(form, alignment=Qt.AlignmentFlag.AlignCenter)

        self.button.clicked.connect(self._submit)
        self.username.returnPressed.connect(self.password.setFocus)
        self.password.returnPressed.connect(self._submit)

    def _submit(self):
        self.submitted.emit(self.username.text(), self.password.text())

    def set_busy(self, busy):
        self.button.setDisabled(busy)
        self.button.setText("Entrando…" if busy else "Entrar")
        if busy:
            self.error.hide()

    def show_server_hint(self):
        self.server_button.show()

    def show_info(self, message):
        self.server_button.hide()
        self.error.setObjectName("muted")
        self.error.style().polish(self.error)
        self.error.setText(message)
        self.error.show()

    def show_error(self, message):
        self.error.setObjectName("error")
        self.error.style().polish(self.error)
        self.error.setText(message)
        self.error.show()
        self.password.selectAll()
        self.password.setFocus()
