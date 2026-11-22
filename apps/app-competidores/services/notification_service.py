from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QMenu, QSystemTrayIcon


class NotificationService(QObject):
    """Ícono en la bandeja + notificaciones nativas de Windows."""

    open_requested = Signal()
    quit_requested = Signal()

    def __init__(self, app):
        super().__init__()
        self.tray = QSystemTrayIcon(app.windowIcon())
        self.tray.setToolTip("Juez Miau")
        menu = QMenu()
        menu.addAction("Abrir", self.open_requested.emit)
        menu.addAction("Salir", self.quit_requested.emit)
        self.tray.setContextMenu(menu)
        self._menu = menu
        self.tray.activated.connect(self._on_activated)
        self.tray.messageClicked.connect(self._on_message_clicked)
        self._on_click = None
        self.tray.show()

    def notify(self, title, message, on_click=None):
        """on_click: qué abrir si le dan clic al aviso (solo cuenta el último aviso mostrado)."""
        self._on_click = on_click
        self.tray.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 6000)

    def _on_message_clicked(self):
        self.open_requested.emit()
        if self._on_click:
            self._on_click()

    def _on_activated(self, reason):
        if reason in (QSystemTrayIcon.ActivationReason.Trigger, QSystemTrayIcon.ActivationReason.DoubleClick):
            self.open_requested.emit()
