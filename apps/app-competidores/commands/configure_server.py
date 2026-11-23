from commands.base import Command
from services.api_client import ApiError
from services.server_config import check_server, normalize_url, verify_server


class CheckServerCommand(Command):
    """Prueba la conexión sin credenciales: cualquiera puede usarla desde el login."""

    def __init__(self, url, check=check_server):
        self.url = url
        self.check = check

    def execute(self):
        return self.check(self.url)


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
            raise ApiError(400, "Escribe una dirección válida, por ejemplo 10.225.32.8:3000.")
        if not self.email.strip() or not self.password:
            raise ApiError(400, "Escribe el correo y la contraseña de staff.")
        return url, self.verify(url, self.email, self.password)
