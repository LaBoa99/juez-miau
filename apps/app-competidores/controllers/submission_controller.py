from PySide6.QtCore import QObject, Signal, Slot

from commands.load_submissions import LoadSubmissionsCommand
from commands.save_template import SaveTemplateCommand
from commands.submit_solution import SubmitSolutionCommand
from services.submission_service import is_final, normalize, verdict_text


class SubmissionController(QObject):
    session_lost = Signal(str)

    def __init__(self, service, invoker, window, notifier, realtime):
        super().__init__()
        self.service = service
        self.invoker = invoker
        self.window = window
        self.notifier = notifier
        self.submissions = {}
        self.progress = {}
        self._awaiting = None  # envío cuyo aviso "Envío recibido" sigue en pantalla

        view = window.problems
        view.submit_requested.connect(self.submit)
        view.template_requested.connect(self.save_template)
        realtime.submission_update.connect(self._on_update)
        realtime.submission_progress.connect(self._on_progress)
        # Al reconectar se recarga todo para no perder veredictos que llegaron sin conexión
        realtime.connected.connect(self.load)

    @Slot()
    def load(self):
        self.invoker.run(LoadSubmissionsCommand(self.service), self._loaded, self._failed_slot)

    @Slot(object)
    def _loaded(self, submissions):
        self.submissions = {s["id"]: normalize(s) for s in submissions}
        self._render()

    @Slot(int, str, str)
    def submit(self, problem_id, path, language_id):
        view = self.window.problems
        view.set_submitting(True)
        command = SubmitSolutionCommand(self.service, problem_id, path, view.languages, language_id or None)
        self.invoker.run(command, self._submitted, self._submit_failed)

    @Slot(object)
    def _failed_slot(self, error):
        self._failed(error)

    @Slot(object)
    def _submitted(self, submission):
        self.window.problems.set_submitting(False)
        self.window.problems.show_message("✓ Envío recibido. Te avisamos cuando tenga veredicto.", success=True)
        self.notifier.notify(f"Problema {self._letter(submission)}", "Envío recibido")
        self._awaiting = submission["id"]
        self._on_update(submission)

    @Slot(object)
    def _submit_failed(self, error):
        self.window.problems.set_submitting(False)
        self._failed(error, inline=True)

    @Slot(str, str)
    def save_template(self, path, code):
        self.invoker.run(SaveTemplateCommand(path, code), self._template_saved, self._inline_failed)

    @Slot(object)
    def _inline_failed(self, error):
        self._failed(error, inline=True)

    @Slot(object)
    def _template_saved(self, path):
        self.window.problems.show_message(f"Plantilla guardada en {path}")
        self.window.problems.offer_open_template(path)

    @Slot(dict)
    def _on_update(self, submission):
        submission = normalize(submission)
        previous = self.submissions.get(submission["id"])
        self.submissions[submission["id"]] = submission
        if is_final(submission):
            self.progress.pop(submission["id"], None)
            if submission["id"] == self._awaiting:
                # Ya tiene veredicto: el aviso de "recibido" sobra
                self._awaiting = None
                self.window.problems.message.hide()
            changed = not previous or (previous["status"], previous["verdict"]) != (submission["status"], submission["verdict"])
            if changed:
                self.notifier.notify(f"Problema {self._letter(submission)}", verdict_text(submission))
        self._render()

    @Slot(dict)
    def _on_progress(self, progress):
        self.progress[progress["submissionId"]] = (progress["judged"], progress["total"])
        self._render()

    def _render(self):
        self.window.problems.set_submissions(list(self.submissions.values()), self.progress)

    def _letter(self, submission):
        problem = next((p for p in self.window.problems.problems if p["id"] == submission["problemId"]), None)
        return problem["letter"] if problem else "?"

    def _failed(self, error, inline=False):
        message = getattr(error, "message", str(error))
        if getattr(error, "status", None) == 401:
            self.session_lost.emit(message)
        elif inline:
            self.window.problems.show_message(message, error=True)
        else:
            self.window.show_error(message)
