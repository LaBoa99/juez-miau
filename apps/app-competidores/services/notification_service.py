from PySide6.QtCore import QObject, QTimer, Signal
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

# Varios avisos seguidos (p. ej. "Envío recibido" y, si la plantilla no compila, el veredicto
# casi al instante) hacen que Windows interrumpa el toast anterior antes de pintarlo: se ve como
# ventanas parpadeando. BATCH_MS agrupa lo que llega junto; COOLDOWN_MS obliga a esperar entre
# un toast mostrado y el siguiente, para que a Windows le dé tiempo de pintarlo.
BATCH_MS = 400
COOLDOWN_MS = 3000


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
        self._queue = []
        self._cooling_down = False
        self._batch_timer = QTimer(self)
        self._batch_timer.setSingleShot(True)
        self._batch_timer.timeout.connect(self._flush)
        self._cooldown_timer = QTimer(self)
        self._cooldown_timer.setSingleShot(True)
        self._cooldown_timer.timeout.connect(self._cooldown_done)
        self.tray.show()

    def notify(self, title, message, on_click=None):
        """on_click: qué abrir si le dan clic al aviso (solo cuenta el último aviso mostrado)."""
        self._on_click = on_click
        self._queue.append((title, message))
        if not self._cooling_down:
            self._batch_timer.start(BATCH_MS)

    def _flush(self):
        if not self._queue:
            return
        if len(self._queue) == 1:
            title, message = self._queue[0]
        else:
            title = f"{len(self._queue)} avisos"
            message = "\n".join(f"{t}: {m}" for t, m in self._queue)
        self._queue.clear()
        self.tray.showMessage(title, message, QSystemTrayIcon.MessageIcon.Information, 6000)
        self._cooling_down = True
        self._cooldown_timer.start(COOLDOWN_MS)

    def _cooldown_done(self):
        self._cooling_down = False
        if self._queue:
            self._batch_timer.start(BATCH_MS)

    def _on_message_clicked(self):
        self.open_requested.emit()
        if self._on_click:
            self._on_click()

    def _on_activated(self, reason):
        if reason in (QSystemTrayIcon.ActivationReason.Trigger, QSystemTrayIcon.ActivationReason.DoubleClick):
            self.open_requested.emit()
