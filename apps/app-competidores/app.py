import sys

from PySide6.QtCore import QLibraryInfo, QTranslator
from PySide6.QtWidgets import QApplication

from commands.base import CommandInvoker
from controllers.clarification_controller import ClarificationController
from controllers.contest_controller import ContestController
from controllers.server_controller import ServerController
from controllers.session_controller import SessionController
from controllers.standings_controller import StandingsController
from controllers.submission_controller import SubmissionController
from services.api_client import ApiClient
from services.auth_service import AuthService
from services.clarification_service import ClarificationService
from services.contest_service import ContestService
from services.integrity_service import IntegrityService
from services.notification_service import NotificationService
from services.realtime_service import RealtimeService
from services.server_config import load_url
from services.standings_service import StandingsService
from services.submission_service import SubmissionService
from views.main_window import MainWindow
from views.style import apply_theme


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    apply_theme(app)
    # Textos de Qt (diálogos de archivo, botones estándar) en español
    translator = QTranslator(app)
    if translator.load("qtbase_es", QLibraryInfo.path(QLibraryInfo.LibraryPath.TranslationsPath)):
        app.installTranslator(translator)

    # Sin archivo de configuración: nombre de red por defecto o lo que guardó el staff
    url = load_url()
    api = ApiClient(url)

    auth = AuthService(api)
    invoker = CommandInvoker()
    notifier = NotificationService(app)
    window = MainWindow()

    realtime = RealtimeService(url)
    # Slots de QObject (no lambdas): las señales del socket llegan desde otro hilo
    realtime.connected.connect(window.set_online)
    realtime.disconnected.connect(window.set_offline)

    contest = ContestController(ContestService(api), invoker, window, notifier, realtime)
    submissions = SubmissionController(SubmissionService(api), invoker, window, notifier, realtime)
    standings = StandingsController(StandingsService(api), invoker, window, auth, realtime)
    clarifications = ClarificationController(ClarificationService(api), invoker, window, notifier, realtime)
    session = SessionController(auth, invoker, window, notifier)
    server = ServerController(invoker, window, api, realtime)  # noqa: F841 (vive mientras corre la app)
    session.logged_in.connect(contest.load_after_login)
    session.logged_in.connect(submissions.load)
    session.logged_in.connect(standings.load)
    session.logged_in.connect(clarifications.load)
    # Concurso y envíos se recargan también en cada (re)conexión del socket
    session.logged_in.connect(lambda: realtime.start(api.token))
    # Heartbeat del anticheat en su propio hilo mientras haya sesión
    integrity = IntegrityService(api)
    session.logged_in.connect(integrity.start)
    for source in (contest, submissions, standings, clarifications, integrity):
        source.session_lost.connect(realtime.stop)
        source.session_lost.connect(integrity.stop)
        source.session_lost.connect(session.session_lost)
    session.logged_out.connect(realtime.stop)
    session.logged_out.connect(integrity.stop)
    app.aboutToQuit.connect(realtime.stop)
    app.aboutToQuit.connect(integrity.stop)

    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
