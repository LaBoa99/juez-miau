from commands.base import Command
from services.api_client import ApiError


class LoginCommand(Command):
    def __init__(self, auth, username, password):
        self.auth = auth
        self.username = username.strip()
        self.password = password

    def execute(self):
        if not self.username or not self.password:
            raise ApiError(400, "Escribe tu usuario y tu contraseña.")
        try:
            return self.auth.login(self.username, self.password)
        except ApiError as error:
            if error.status == 401:
                raise ApiError(401, "Usuario o contraseña incorrectos.")
            if error.status == 403:
                raise ApiError(403, "Tu equipo está suspendido. Habla con el staff.")
            raise
