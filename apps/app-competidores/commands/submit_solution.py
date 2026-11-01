from commands.base import Command
from services.api_client import ApiError
from services.submission_service import language_for, read_source


class SubmitSolutionCommand(Command):
    def __init__(self, service, problem_id, path, languages, chosen_language_id):
        self.service = service
        self.problem_id = problem_id
        self.path = path
        self.languages = languages
        self.chosen_language_id = chosen_language_id

    def execute(self):
        # La extensión manda; si no se reconoce, se usa el lenguaje elegido en la lista
        language = language_for(self.path, self.languages)
        language_id = language["id"] if language else self.chosen_language_id
        if not language_id:
            raise ApiError(422, "Elige el lenguaje de tu solución.")
        return self.service.submit(self.problem_id, language_id, read_source(self.path))
