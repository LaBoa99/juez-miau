from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from services.api_client import ApiError
from services.auth_service import AuthService


class Api:
    def __init__(self, error=None):
        self.token, self.error, self.calls = "t", error, []

    def post(self, path, body=None):
        self.calls.append(path)
        if self.error:
            raise self.error


def test_logout_closes_server_session_and_forgets_token():
    api = Api()
    auth = AuthService(api)
    auth.team = {"id": 1}
    auth.logout()
    assert api.calls == ["/auth/logout"] and api.token is None and auth.team is None


def test_logout_without_network_still_forgets():
    api = Api(ApiError(0, "sin red"))
    auth = AuthService(api)
    auth.team = {"id": 1}
    auth.logout()
    assert api.token is None and auth.team is None


def test_server_shortcut_only_on_login_page():
    from views.main_window import MainWindow

    QApplication.instance() or QApplication([])
    window = MainWindow()
    window.show()
    window.activateWindow()
    QApplication.processEvents()
    hits = []
    window.server_requested.connect(lambda: hits.append(1))
    press = lambda: QTest.keyClick(window.login.username, Qt.Key.Key_S, Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.ShiftModifier)

    press()
    assert hits == [1]
    assert window.logout_button.isHidden()

    window.show_contest()
    assert not window.logout_button.isHidden()
    press()
    assert hits == [1]

    window.show_login()  # como después de cerrar sesión
    press()
    assert hits == [1, 1]
