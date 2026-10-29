from commands.base import Command
from services.api_client import ApiError
from services.server_config import normalize_url, verify_server


class ConfigureServerCommand(Command):
    """Valida la dirección y las credenciales de staff contra ese servidor. No guarda: eso lo hace el controlador."""

    def __init__(self, address, email, password, verify=verify_server):
        self.address = address
        self.email = email
        self.password = password
        self.verify = verify

    def execute(self):
        url = normalize_url(self.address)
        if not url:
            raise ApiError(400, "Escribe una dirección válida, por ejemplo juez.concurso.local o 192.168.1.10:3000.")
        if not self.email.strip() or not self.password:
            raise ApiError(400, "Escribe el correo y la contraseña de staff.")
        return url, self.verify(url, self.email, self.password)
