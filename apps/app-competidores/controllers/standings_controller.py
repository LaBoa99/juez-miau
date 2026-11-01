from PySide6.QtCore import QObject, Signal, Slot

from commands.load_standings import LoadStandingsCommand
from services.standings_service import category_of


class StandingsController(QObject):
    session_lost = Signal(str)

    def __init__(self, service, invoker, window, auth, realtime):
        super().__init__()
        self.service = service
        self.invoker = invoker
        self.window = window
        self.auth = auth
        realtime.standings_update.connect(self._render)
        realtime.connected.connect(self.load)

    @Slot()
    def load(self):
        if self.auth.team:
            self.invoker.run(LoadStandingsCommand(self.service, self.auth.team["editionId"]), self._render, self._failed)

    @Slot(object)
    def _render(self, standings):
        team = self.auth.team
        if not team or standings["editionId"] != team["editionId"]:
            return
        self.window.standings.set_standings(standings, category_of(standings, team["categoryId"]), team["id"])

    @Slot(object)
    def _failed(self, error):
        status = getattr(error, "status", None)
        if status == 401:
            self.session_lost.emit(error.message)
        elif status == 404:
            # La edición aún no tiene marcador (no ha iniciado)
            self.window.standings.show_empty()
        else:
            self.window.show_error(getattr(error, "message", str(error)))
