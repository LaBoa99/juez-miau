from PySide6.QtCore import QObject, Slot

from commands.configure_server import ConfigureServerCommand
from services.server_config import save_url
from views.server_view import ServerDialog


class ServerController(QObject):
    """Cambio de servidor por el staff (Ctrl+Shift+S en el login, o desde el aviso de sin conexión)."""

    def __init__(self, invoker, window, api, realtime):
        super().__init__()
        self.invoker = invoker
        self.window = window
        self.api = api
        self.realtime = realtime
        self.dialog = None
        window.server_requested.connect(self.open)
        window.login.server_requested.connect(self.open)

    @Slot()
    def open(self):
        self.dialog = ServerDialog(self.window, self.api.server_url)
        self.dialog.configure_requested.connect(self.configure)
        self.dialog.exec()
        self.dialog = None

    @Slot(str, str, str)
    def configure(self, address, email, password):
        self.dialog.set_busy(True)
        self.invoker.run(ConfigureServerCommand(address, email, password), self._configured, self._failed)

    @Slot(object)
    def _configured(self, result):
        url, staff_name = result
        try:
            save_url(url)
        except PermissionError as error:
            self._failed(error)
            return
        self.api.set_server(url)
        self.realtime.url = url
        if self.dialog:
            self.dialog.accept()
        self.window.login.show_info(f"Servidor configurado por {staff_name}: {url}")

    @Slot(object)
    def _failed(self, error):
        if self.dialog:
            self.dialog.set_busy(False)
            self.dialog.show_error(getattr(error, "message", None) or str(error))
