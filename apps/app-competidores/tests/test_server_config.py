import sys

import pytest
from PySide6.QtCore import QSettings

from commands.configure_server import ConfigureServerCommand
from services.api_client import ApiError
from services.server_config import DEFAULT_URL, load_url, normalize_url, save_url


@pytest.mark.parametrize("text, expected", [
    ("juez.concurso.local", "http://juez.concurso.local"),
    ("  192.168.1.10:3000/ ", "http://192.168.1.10:3000"),
    ("https://juez.uni.mx", "https://juez.uni.mx"),
    ("", None),
    ("ftp://juez", None),
    ("http://juez/otra/ruta", None),
    ("juez:99999", None),
])
def test_normalize_url(text, expected):
    assert normalize_url(text) == expected


def test_settings_default_and_save(tmp_path):
    settings = QSettings(str(tmp_path / "s.ini"), QSettings.Format.IniFormat)
    assert load_url(settings) == DEFAULT_URL
    save_url("http://192.168.1.10:3000", settings)
    assert load_url(QSettings(str(tmp_path / "s.ini"), QSettings.Format.IniFormat)) == "http://192.168.1.10:3000"


def test_command_normalizes_then_verifies():
    calls = []
    verify = lambda url, email, password: calls.append((url, email)) or "Juez Demo"
    assert ConfigureServerCommand("10.0.0.5:3000", "juez@x", "pw", verify).execute() == ("http://10.0.0.5:3000", "Juez Demo")
    assert calls == [("http://10.0.0.5:3000", "juez@x")]


def test_command_rejects_bad_input_without_network():
    verify = lambda *a: pytest.fail("no debe llamar al servidor")
    with pytest.raises(ApiError):
        ConfigureServerCommand("ftp://x", "a@b", "pw", verify).execute()
    with pytest.raises(ApiError):
        ConfigureServerCommand("juez.local", " ", "pw", verify).execute()


@pytest.mark.skipif(sys.platform == "win32", reason="en Windows chmod no impide que Qt reemplace el archivo")
def test_save_without_permission_raises(tmp_path):
    path = tmp_path / "s.ini"
    path.write_text("")
    path.chmod(0o444)  # como HKLM para un usuario sin permisos de administrador
    with pytest.raises(PermissionError):
        save_url("http://x", QSettings(str(path), QSettings.Format.IniFormat))
