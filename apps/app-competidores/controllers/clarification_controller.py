from PySide6.QtCore import QObject, Signal, Slot

from commands.clarifications import AskClarificationCommand, LoadClarificationsCommand
from services.clarification_service import merge


class ClarificationController(QObject):
    session_lost = Signal(str)

    def __init__(self, service, invoker, window, notifier, realtime):
        super().__init__()
        self.service = service
        self.invoker = invoker
        self.window = window
        self.notifier = notifier
        self.clarifications = []
        window.clarifications.ask_requested.connect(self.ask)
        realtime.clarification_update.connect(self._on_update)
        realtime.clarification_delete.connect(self._on_delete)
        realtime.connected.connect(self.load)

    @Slot()
    def load(self):
        self.invoker.run(LoadClarificationsCommand(self.service), self._loaded, self._failed)

    @Slot(object)
    def _loaded(self, clarifications):
        self.clarifications = clarifications
        self.window.clarifications.set_clarifications(clarifications)

    @Slot(object, str)
    def ask(self, problem_id, question):
        self.window.clarifications.set_sending(True)
        self.invoker.run(AskClarificationCommand(self.service, problem_id, question), self._asked, self._ask_failed)

    @Slot(object)
    def _asked(self, clarification):
        view = self.window.clarifications
        view.set_sending(False)
        view.clear_question()
        view.show_message("Pregunta enviada. Te avisamos cuando el staff responda.")
        self.clarifications = [clarification] + [c for c in self.clarifications if c["id"] != clarification["id"]]
        view.set_clarifications(self.clarifications)

    @Slot(object)
    def _ask_failed(self, error):
        self.window.clarifications.set_sending(False)
        if getattr(error, "status", None) == 401:
            self.session_lost.emit(error.message)
        else:
            self.window.clarifications.show_message(getattr(error, "message", str(error)), error=True)

    @Slot(dict)
    def _on_update(self, incoming):
        visible = {p["id"] for p in self.window.problems.problems}
        self.clarifications, previous, accepted = merge(self.clarifications, incoming, visible)
        if not accepted:
            return
        self.window.clarifications.set_clarifications(self.clarifications)
        if incoming["answer"] and (not previous or previous["answer"] != incoming["answer"]):
            mine = previous and previous.get("mine")
            self.notifier.notify("Respondieron tu pregunta" if mine else "Nueva clarificación", incoming["answer"][:200])

    @Slot(dict)
    def _on_delete(self, payload):
        # Eliminada o rechazada por el staff; si es tuya y la rechazaron, enseguida llega su versión nueva
        self.clarifications = [c for c in self.clarifications if c["id"] != payload["id"]]
        self.window.clarifications.set_clarifications(self.clarifications)

    @Slot(object)
    def _failed(self, error):
        if getattr(error, "status", None) == 401:
            self.session_lost.emit(error.message)
        else:
            self.window.show_error(getattr(error, "message", str(error)))
