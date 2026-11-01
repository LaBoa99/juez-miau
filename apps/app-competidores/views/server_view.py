from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QDialog, QHBoxLayout, QLabel, QLineEdit, QPushButton, QVBoxLayout

from views.style import LG, MD, SM, XS


class ServerDialog(QDialog):
    """Solo para el staff: cambia el servidor tras validar credenciales de staff contra él."""

    configure_requested = Signal(str, str, str)  # dirección, correo, contraseña

    def __init__(self, parent, current_url):
        super().__init__(parent)
        self.setWindowTitle("Configurar servidor")
        self.setFixedWidth(440)

        title = QLabel("Configurar servidor")
        title.setObjectName("title")
        hint = QLabel(
            "Solo para el staff. La app probará la conexión y validará tus credenciales en ese servidor antes de guardarlo."
        )
        hint.setObjectName("muted")
        hint.setWordWrap(True)

        self.address = QLineEdit(current_url)
        self.address.setAccessibleName("Dirección del servidor")
        self.address.setPlaceholderText("juez.concurso.local o 192.168.1.10:3000")
        self.email = QLineEdit()
        self.email.setAccessibleName("Correo de staff")
        self.password = QLineEdit()
        self.password.setAccessibleName("Contraseña de staff")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.message = QLabel()
        self.message.setWordWrap(True)
        self.message.hide()

        self.save_button = QPushButton("Probar y guardar")
        self.save_button.setDefault(True)
        self.save_button.clicked.connect(self._submit)
        cancel = QPushButton("Cancelar")
        cancel.setObjectName("secondary")
        cancel.clicked.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(LG, LG, LG, LG)
        layout.setSpacing(0)
        layout.addWidget(title)
        layout.addSpacing(XS)
        layout.addWidget(hint)
        layout.addSpacing(LG)
        for text, field in (("Dirección del servidor", self.address), ("Correo de staff", self.email), ("Contraseña", self.password)):
            label = QLabel(text)
            label.setBuddy(field)
            layout.addWidget(label)
            layout.addSpacing(XS)
            layout.addWidget(field)
            layout.addSpacing(MD)
        layout.addWidget(self.message)
        layout.addSpacing(SM)
        buttons = QHBoxLayout()
        buttons.setSpacing(SM)
        buttons.addStretch()
        buttons.addWidget(cancel)
        buttons.addWidget(self.save_button)
        layout.addLayout(buttons)

        self.password.returnPressed.connect(self._submit)

    def _submit(self):
        self.configure_requested.emit(self.address.text(), self.email.text(), self.password.text())

    def set_busy(self, busy):
        self.save_button.setDisabled(busy)
        self.save_button.setText("Probando…" if busy else "Probar y guardar")
        if busy:
            self.message.hide()

    def show_error(self, text):
        self.message.setObjectName("error")
        self.message.style().polish(self.message)
        self.message.setText(text)
        self.message.show()
        self.password.selectAll()
        self.password.setFocus()
