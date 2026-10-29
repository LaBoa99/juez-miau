import sys
import threading

import psutil
from PySide6.QtCore import QObject, Signal

from services.api_client import ApiError

DEFAULT_INTERVAL_MS = 30_000
MAX_PROCESSES = 2000  # límites del HeartbeatDto del backend
MAX_NAME = 260
MAX_DRIVES = 50
MAX_INTERFACES = 100


def running_processes():
    names = set()
    for process in psutil.process_iter(["name"]):
        name = process.info.get("name")
        if name:
            names.add(name[:MAX_NAME])
    return sorted(names)[:MAX_PROCESSES]


def monitor_count():
    """Monitores conectados. Se usa la API de Windows porque Qt no permite consultar pantallas
    fuera del hilo de la UI; en otros sistemas se omite (None) y el servidor no evalúa la regla."""
    if sys.platform != "win32":
        return None
    import ctypes

    return ctypes.windll.user32.GetSystemMetrics(80)  # SM_CMONITORS


def removable_drives(partitions=None, platform=sys.platform):
    partitions = psutil.disk_partitions(all=False) if partitions is None else partitions
    if platform == "win32":
        drives = [p.device for p in partitions if "removable" in p.opts]
    else:
        drives = [p.mountpoint for p in partitions if p.mountpoint.startswith(("/media/", "/run/media/"))]
    return [d[:MAX_NAME] for d in drives][:MAX_DRIVES]


def active_interfaces(stats=None):
    stats = psutil.net_if_stats() if stats is None else stats
    names = [
        name for name, s in stats.items()
        # loopback no es red real; veth son enlaces efímeros de contenedores (solo en Linux de desarrollo)
        if s.isup and name != "lo" and "loopback" not in name.lower() and not name.startswith("veth")
    ]
    return sorted(n[:MAX_NAME] for n in names)[:MAX_INTERFACES]


def heartbeat_payload():
    payload = {"processes": running_processes(), "usbStorage": removable_drives(), "networkInterfaces": active_interfaces()}
    monitors = monitor_count()
    if monitors is not None:
        payload["monitors"] = monitors
    return payload


class IntegrityService(QObject):
    """Heartbeat en su propio hilo mientras haya sesión. Silencioso: el equipo no ve nada de esto;
    lo que el servidor detecta solo le llega al juez."""

    session_lost = Signal(str)

    def __init__(self, api, collect=heartbeat_payload, retry_ms=DEFAULT_INTERVAL_MS):
        super().__init__()
        self.api = api
        self.collect = collect
        self.retry_ms = retry_ms
        self._stop = None

    def start(self):
        self.stop()
        self._stop = threading.Event()
        threading.Thread(target=self.run, args=(self._stop,), daemon=True).start()

    def stop(self):
        if self._stop:
            self._stop.set()
            self._stop = None

    def run(self, stop):
        while not stop.is_set():
            interval = self.retry_ms
            try:
                interval = self.api.post("/contest/heartbeat", self.collect())["nextHeartbeatMs"]
            except ApiError as error:
                if error.status == 401:
                    self.session_lost.emit(error.message)
                    return
                # Sin red u otro error: se reintenta en el siguiente ciclo sin molestar al equipo
            stop.wait(interval / 1000)
