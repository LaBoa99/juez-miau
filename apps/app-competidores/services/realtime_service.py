import threading

import socketio
from PySide6.QtCore import QObject, Signal

NAMESPACE = "/ws"


class RealtimeService(QObject):
    """Socket.io a /ws. python-socketio llama desde sus propios hilos; las señales Qt llevan
    cada evento al hilo de la UI."""

    submission_update = Signal(dict)
    submission_progress = Signal(dict)
    clock_update = Signal(dict)
    standings_update = Signal(dict)
    clarification_update = Signal(dict)
    clarification_delete = Signal(dict)
    connected = Signal()
    disconnected = Signal()

    def __init__(self, public_url):
        super().__init__()
        self.url = public_url.rstrip("/")
        self.sio = None

    def start(self, token):
        self.stop()
        sio = socketio.Client(reconnection=True)
        for event, signal in (
            ("submission:update", self.submission_update),
            ("submission:progress", self.submission_progress),
            ("clock:update", self.clock_update),
            ("standings:update", self.standings_update),
            ("clarification:update", self.clarification_update),
            ("clarification:delete", self.clarification_delete),
        ):
            sio.on(event, signal.emit, namespace=NAMESPACE)
        sio.on("connect", lambda: self.connected.emit(), namespace=NAMESPACE)
        sio.on("disconnect", lambda *_: self.disconnected.emit(), namespace=NAMESPACE)
        self.sio = sio
        threading.Thread(target=self._connect, args=(sio, token), daemon=True).start()

    def _connect(self, sio, token):
        try:
            sio.connect(self.url, namespaces=[NAMESPACE], auth={"token": token}, transports=["websocket"], retry=True)
        except socketio.exceptions.ConnectionError:
            self.disconnected.emit()

    def stop(self):
        if self.sio:
            self.sio.disconnect()
            self.sio = None
