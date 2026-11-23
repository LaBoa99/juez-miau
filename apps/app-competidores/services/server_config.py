import sys
from urllib.parse import urlsplit

from PySide6.QtCore import QSettings

from services.api_client import ApiClient, ApiError
from services.network_route import interface_for

# Servidor de producción. shortcut: IP fija; si cambia, el staff la actualiza con Configurar servidor o se genera otro .exe
DEFAULT_URL = "http://10.225.32.8:3000"
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


def check_server(url):
    """Comprueba sin credenciales que el juez responde. Regresa la interfaz de red usada (None si no se fijó una)."""
    not_judge = "Esa dirección respondió, pero no es el juez del concurso. Avisa al staff."
    try:
        health = ApiClient(url, timeout=5).get("/health")
    except ValueError:  # respondió algo que no es JSON (otro servicio en ese puerto)
        raise ApiError(0, not_judge)
    except ApiError as error:
        if error.status == 0:
            raise ApiError(0, "No se pudo conectar con el servidor. Revisa el cable de red o avisa al staff.")
        if error.status == 503:
            raise ApiError(503, "El servidor está encendido, pero todavía no está listo. Avisa al staff.")
        raise ApiError(error.status, not_judge)
    if not isinstance(health, dict) or health.get("status") != "ok":
        raise ApiError(0, not_judge)
    return interface_for(url)


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
