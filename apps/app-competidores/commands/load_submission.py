from commands.base import Command


class LoadSubmissionCommand(Command):
    """Un envío con su detalle (para saber en qué ejemplo falló)."""

    def __init__(self, service, submission_id):
        self.service = service
        self.submission_id = submission_id

    def execute(self):
        return self.service.get(self.submission_id)
