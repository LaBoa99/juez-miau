from PySide6.QtCore import QObject, Signal, Slot
from PySide6.QtWidgets import QApplication

from commands.login import LoginCommand
from commands.logout import LogoutCommand


class SessionController(QObject):
    logged_in = Signal()
    logged_out = Signal()

    def __init__(self, auth, invoker, window, notifier):
        super().__init__()
        self.auth = auth
        self.invoker = invoker
        self.window = window
        self.login_view = window.login
        self.notifier = notifier
        self._tray_hint_shown = False

        self.login_view.submitted.connect(self.login)
        window.hidden_to_tray.connect(self._on_hidden)
        window.logout_requested.connect(self.logout)
        notifier.open_requested.connect(self._open)
        notifier.quit_requested.connect(self._quit)

    @Slot(str, str)
    def login(self, username, password):
        self.login_view.set_busy(True)
        self.invoker.run(LoginCommand(self.auth, username, password), self._logged_in, self._login_failed)

    @Slot(object)
    def _logged_in(self, team):
        self.login_view.set_busy(False)
        self.window.set_team(team)
        self.window.show_contest()
        self.notifier.notify("Sesión iniciada", f"Equipo {team['name']}. Los veredictos te llegarán aquí.")
        self.logged_in.emit()

    @Slot(object)
    def _login_failed(self, error):
        self.login_view.set_busy(False)
        self.login_view.show_error(getattr(error, "message", str(error)))
        if getattr(error, "status", None) == 0:
            self.login_view.show_server_hint()

    @Slot()
    def logout(self):
        if self.window.confirm_logout():
            # Se deja de reportar de inmediato; el aviso al servidor va en segundo plano
            self.logged_out.emit()
            self.invoker.run(LogoutCommand(self.auth), self._logged_out, self._logged_out)

    @Slot(object)
    def _logged_out(self, _):
        self.window.show_login()
        self.login_view.password.clear()
        self.login_view.show_info("Sesión cerrada.")

    @Slot(str)
    def session_lost(self, message):
        self.auth.forget()
        self.window.show_login()
        self._open()
        self.login_view.show_error(message)
        self.notifier.notify("Sesión terminada", message)

    @Slot()
    def _on_hidden(self):
        if not self._tray_hint_shown:
            self._tray_hint_shown = True
            self.notifier.notify("La app sigue activa", "Ábrela desde el ícono de la bandeja.")

    @Slot()
    def _open(self):
        self.window.show()
        self.window.raise_()
        self.window.activateWindow()

    @Slot()
    def _quit(self):
        if not self.auth.team or self.window.confirm_quit():
            QApplication.quit()
