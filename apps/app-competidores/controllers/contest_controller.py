import time

from PySide6.QtCore import QObject, QTimer, Signal, Slot

from commands.load_contest import LoadContestCommand, LoadStatementPdfCommand
from services.contest_service import format_hms, is_frozen, remaining_ms

CLOCK_NOTICES = {
    "RUNNING": "El concurso está en curso.",
    "PAUSED": "El concurso está en pausa.",
    "FINISHED": "El concurso terminó. Ya no se reciben envíos.",
}


class ContestController(QObject):
    session_lost = Signal(str)

    def __init__(self, contest, invoker, window, notifier, realtime):
        super().__init__()
        self.contest = contest
        self.invoker = invoker
        self.window = window
        self.notifier = notifier
        self.status = None
        self.clock = None
        self.clock_received = 0.0
        self.ask_language = False

        self.ticker = QTimer(self)
        self.ticker.timeout.connect(self._tick)
        self.ticker.start(1000)

        window.problems.refresh_requested.connect(self.load)
        window.problems.pdf_requested.connect(self._load_pdf)
        realtime.clock_update.connect(self._on_clock)
        realtime.connected.connect(self.load)

    @Slot()
    def load_after_login(self):
        self.ask_language = True
        self.load()

    @Slot()
    def load(self):
        self.invoker.run(LoadContestCommand(self.contest), self._loaded, self._failed)

    @Slot(int)
    def _load_pdf(self, problem_id):
        self.invoker.run(LoadStatementPdfCommand(self.contest, problem_id), self._pdf_loaded, self._pdf_failed)

    @Slot(object)
    def _pdf_loaded(self, result):
        self.window.problems.set_statement_pdf(*result)

    @Slot(object)
    def _pdf_failed(self, error):
        self.window.problems.forget_pdf_requests()
        if getattr(error, "status", None) == 401:
            self.session_lost.emit(error.message)
        else:
            self.window.problems.show_message("No se pudo cargar el enunciado. Vuelve a abrir el problema o avisa al staff.", error=True)

    @Slot(object)
    def _loaded(self, view):
        self.status = view["clock"]["status"]
        self._set_clock(view["clock"])
        self.window.set_contest(view)
        # Una vez por inicio de sesión, en cuanto se conocen los lenguajes de la edición
        if self.ask_language and view["languages"]:
            self.ask_language = False
            self.window.problems.ask_preferred_language()

    @Slot(dict)
    def _on_clock(self, clock):
        self._set_clock(clock)
        if clock["status"] == self.status:
            return
        if clock["status"] in CLOCK_NOTICES:
            self.notifier.notify("Concurso", CLOCK_NOTICES[clock["status"]])
        # Al iniciar se publican los problemas: se recarga la vista completa
        self.load()

    def _set_clock(self, clock):
        self.clock = clock
        self.clock_received = time.monotonic()
        self._tick()

    @Slot()
    def _tick(self):
        if not self.clock:
            return
        since = int((time.monotonic() - self.clock_received) * 1000)
        status = self.clock["status"]
        if status in ("DRAFT", "SCHEDULED"):
            text, note = "–:––:––", "Aún no inicia"
        else:
            text = format_hms(remaining_ms(self.clock, since))
            note = {"PAUSED": "En pausa", "FINISHED": "Terminado"}.get(status, "Tiempo restante")
            if status == "RUNNING" and is_frozen(self.clock, since):
                note = "Tiempo restante · marcador congelado"
        self.window.set_clock(text, note)

    @Slot(object)
    def _failed(self, error):
        if getattr(error, "status", None) == 401:
            self.session_lost.emit(error.message)
        else:
            self.window.show_error(getattr(error, "message", str(error)))
