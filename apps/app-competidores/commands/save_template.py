from pathlib import Path

from commands.base import Command
from services.api_client import ApiError


class SaveTemplateCommand(Command):
    def __init__(self, path, code):
        self.path = path
        self.code = code

    def execute(self):
        try:
            Path(self.path).write_text(self.code, encoding="utf-8")
        except OSError:
            raise ApiError(0, "No se pudo guardar la plantilla. Elige otra carpeta.")
        return self.path
