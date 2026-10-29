import sys
import uuid

from services.api_client import ApiError


def machine_id():
    """Id estable del equipo: MachineGuid de Windows; en desarrollo, la MAC."""
    if sys.platform == "win32":
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            return winreg.QueryValueEx(key, "MachineGuid")[0]
    return f"dev-{uuid.getnode():x}"


class AuthService:
    def __init__(self, api):
        self.api = api
        self.team = None

    def login(self, username, password):
        data = self.api.post("/auth/team/login", {"username": username, "password": password, "machineId": machine_id()})
        self.api.token = data["accessToken"]
        self.team = data["team"]
        return self.team

    def logout(self):
        """Cierra la sesión en el servidor; si no hay red se cierra igual en la app."""
        try:
            self.api.post("/auth/logout")
        except ApiError:
            pass
        finally:
            self.forget()

    def forget(self):
        self.api.token = None
        self.team = None
