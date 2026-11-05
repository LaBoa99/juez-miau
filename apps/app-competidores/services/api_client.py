import requests

# Mensajes para el equipo por código HTTP. 403 es neutro a propósito: no debe delatar al anticheat.
MESSAGES = {
    0: "Sin conexión con el servidor. Revisa la red o avisa al staff.",
    401: "Tu sesión terminó. Inicia sesión de nuevo.",
    403: "Tu envío no se pudo registrar. Avisa al staff.",
    404: "Ese problema no está disponible para tu categoría.",
    409: "El concurso no está en curso.",
    422: "El lenguaje no está habilitado o el archivo pesa más de 64 KB.",
    429: "Espera unos segundos antes de volver a enviar.",
}


class ApiError(Exception):
    def __init__(self, status, message, detail=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail  # mensaje original del servidor, si lo hubo


class ApiClient:
    """Único dueño del token y de la red."""

    def __init__(self, public_url, timeout=10):
        self.set_server(public_url)
        self.timeout = timeout
        self.session = requests.Session()
        self.token = None

    def set_server(self, public_url):
        self.server_url = public_url.rstrip("/")
        self.base_url = self.server_url + "/api/v1"

    def request(self, method, path, json=None):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        try:
            res = self.session.request(method, self.base_url + path, json=json, headers=headers, timeout=self.timeout)
        except requests.RequestException:
            raise ApiError(0, MESSAGES[0])
        if res.ok:
            return res.json() if res.content else None
        detail = _server_message(res)
        raise ApiError(res.status_code, MESSAGES.get(res.status_code) or detail, detail)

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, json=None):
        return self.request("POST", path, json)


def _server_message(res):
    try:
        message = res.json().get("message")
    except ValueError:
        message = None
    # class-validator responde una lista de mensajes
    if isinstance(message, list):
        message = message[0] if message else None
    return message or f"Error inesperado del servidor ({res.status_code}). Avisa al staff."
