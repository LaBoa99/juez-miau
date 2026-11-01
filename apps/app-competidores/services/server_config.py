import sys
from urllib.parse import urlsplit

from PySide6.QtCore import QSettings

from services.api_client import ApiClient, ApiError

# Nombre de red del servidor en el laboratorio: el DNS o el archivo hosts de cada equipo lo apunta a la IP
# real, así un cambio de IP no obliga a tocar los 90 equipos
DEFAULT_URL = "http://juez.concurso.local"
SETTINGS_KEY = "serverUrl"


def _settings():
    # En Windows va al registro de la máquina (HKLM\SOFTWARE\Concurso\AppCompetidores): cualquiera lo lee, pero solo
    # un administrador lo escribe, así un concursante sin permisos no puede cambiar el servidor.
    # En otros sistemas (desarrollo) basta la configuración del usuario.
    scope = QSettings.Scope.SystemScope if sys.platform == "win32" else QSettings.Scope.UserScope
    return QSettings(QSettings.Format.NativeFormat, scope, "Concurso", "AppCompetidores")


def load_url(settings=None):
    return (settings or _settings()).value(SETTINGS_KEY, DEFAULT_URL)


def save_url(url, settings=None):
    settings = settings or _settings()
    settings.setValue(SETTINGS_KEY, url)
    settings.sync()
    if settings.status() != QSettings.Status.NoError:
        raise PermissionError("Para guardar el servidor abre la app como administrador (clic derecho → Ejecutar como administrador).")


def normalize_url(text):
    """Acepta "192.168.1.10:3000" o "juez.local" y regresa "http://192.168.1.10:3000"; None si no es válida."""
    text = text.strip().rstrip("/")
    if not text:
        return None
    if "://" not in text:
        text = "http://" + text
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.path not in ("", "/") or parts.query:
        return None
    try:
        parts.port  # valida el puerto
    except ValueError:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def verify_server(url, email, password):
    """Comprueba que el servidor responde y que las credenciales son de staff. Regresa el nombre del staff.
    Cierra esa sesión de staff al terminar: solo sirve para autorizar el cambio."""
    api = ApiClient(url, timeout=5)
    health = api.get("/health")
    if not isinstance(health, dict) or health.get("status") != "ok":
        raise ApiError(0, "El servidor respondió, pero no parece el juez del concurso.")
    try:
        data = api.post("/auth/staff/login", {"email": email.strip(), "password": password})
    except ApiError as error:
        if error.status in (400, 401):
            raise ApiError(401, "Correo o contraseña de staff incorrectos.")
        raise
    api.token = data["accessToken"]
    try:
        api.post("/auth/logout")
    except ApiError:
        pass  # no impide guardar el servidor
    return data["user"]["name"]
