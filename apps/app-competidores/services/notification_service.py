from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QMenu, QStyle, QSystemTrayIcon


class NotificationService(QObject):
    """Ícono en la bandeja + notificaciones nativas de Windows."""

    open_requested = Signal()
    quit_requested = Signal()

    def __init__(self, app):
        super().__init__()
        self.tray = QSystemTrayIcon(app.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon))
        self.tray.setToolTip("Concurso")
        menu = QMenu()
        menu.addAction("Abrir", self.open_requested.emit)
        menu.addAction("Salir", self.quit_requested.emit)
        self.tray.setContextMenu(menu)
        self._menu = menu
        self.tray.activated.connect(self._on_activated)
        self.tray.show()

    def notify(self, title, message):
        self.tray.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 6000)

    def _on_activated(self, reason):
        if reason in (QSystemTrayIcon.ActivationReason.Trigger, QSystemTrayIcon.ActivationReason.DoubleClick):
            self.open_requested.emit()
