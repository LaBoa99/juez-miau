import os
import sys
import threading

import psutil
from PySide6.QtCore import QObject, Signal

from services.api_client import ApiError

DEFAULT_INTERVAL_MS = 10_000
MAX_PROCESSES = 2000  # límites del HeartbeatDto del backend
MAX_NAME = 260
MAX_DRIVES = 50
MAX_INTERFACES = 100


def visible_window_pids():
    """PIDs con al menos una ventana en pantalla (también minimizada). Deja fuera lo que solo vive
    en la bandeja o en segundo plano (Edge con arranque rápido, Copilot, Claude cerrado a la bandeja)."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    dwmapi = ctypes.windll.dwmapi
    GWL_EXSTYLE, WS_EX_TOOLWINDOW, DWMWA_CLOAKED = -20, 0x80, 14
    pids = set()

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def on_window(hwnd, _):
        if not user32.IsWindowVisible(hwnd) or user32.GetWindowTextLengthW(hwnd) == 0:
            return True
        if user32.GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW:
            return True
        # Las apps de la tienda suspendidas dejan ventanas "visibles" pero ocultas por el sistema
        cloaked = wintypes.DWORD()
        dwmapi.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
        if cloaked.value:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        pids.add(pid.value)
        return True

    user32.EnumWindows(on_window, 0)
    return pids


def running_processes(platform=sys.platform, window_pids=None):
    """En Windows solo los programas con ventana visible; en otros sistemas (desarrollo) todos."""
    if platform == "win32" and window_pids is None:
        window_pids = visible_window_pids()
    names = set()
    for process in psutil.process_iter(["pid", "name"]):
        name = process.info.get("name")
        if name and (window_pids is None or process.info["pid"] in window_pids):
            names.add(name[:MAX_NAME])
    return sorted(names)[:MAX_PROCESSES]


def monitor_count():
    """Monitores conectados. Se usa la API de Windows porque Qt no permite consultar pantallas
    fuera del hilo de la UI; en otros sistemas se omite (None) y el servidor no evalúa la regla."""
    if sys.platform != "win32":
        return None
    import ctypes

    return ctypes.windll.user32.GetSystemMetrics(80)  # SM_CMONITORS


# BusType de STORAGE_DEVICE_DESCRIPTOR: USB, FireWire (1394), SD y MMC son dispositivos conectados por fuera
EXTERNAL_BUS_TYPES = {7, 4, 0xC, 0xD}


def drive_is_external(device):
    """Pregunta a Windows por la interfaz del disco de la unidad ("E:\\"). Un disco USB suele
    reportarse como fijo, así que no basta con la marca de removible."""
    import ctypes
    from ctypes import wintypes

    class StoragePropertyQuery(ctypes.Structure):
        _fields_ = [("PropertyId", wintypes.DWORD), ("QueryType", wintypes.DWORD), ("Extra", ctypes.c_ubyte * 1)]

    class StorageDeviceDescriptor(ctypes.Structure):
        _fields_ = [
            ("Version", wintypes.DWORD), ("Size", wintypes.DWORD), ("DeviceType", ctypes.c_ubyte),
            ("DeviceTypeModifier", ctypes.c_ubyte), ("RemovableMedia", ctypes.c_ubyte), ("CommandQueueing", ctypes.c_ubyte),
            ("VendorIdOffset", wintypes.DWORD), ("ProductIdOffset", wintypes.DWORD),
            ("ProductRevisionOffset", wintypes.DWORD), ("SerialNumberOffset", wintypes.DWORD),
            ("BusType", wintypes.DWORD), ("RawPropertiesLength", wintypes.DWORD), ("Raw", ctypes.c_ubyte * 512),
        ]

    kernel32 = ctypes.windll.kernel32
    kernel32.CreateFileW.restype = wintypes.HANDLE
    IOCTL_STORAGE_QUERY_PROPERTY, OPEN_EXISTING, SHARE_RW = 0x2D1400, 3, 0x3
    handle = kernel32.CreateFileW("\\\\.\\" + device.rstrip("\\"), 0, SHARE_RW, None, OPEN_EXISTING, 0, None)
    if handle in (None, wintypes.HANDLE(-1).value):
        return False
    try:
        query, descriptor, returned = StoragePropertyQuery(0, 0), StorageDeviceDescriptor(), wintypes.DWORD()
        ok = kernel32.DeviceIoControl(handle, IOCTL_STORAGE_QUERY_PROPERTY, ctypes.byref(query), ctypes.sizeof(query),
                                      ctypes.byref(descriptor), ctypes.sizeof(descriptor), ctypes.byref(returned), None)
        return bool(ok) and (descriptor.BusType in EXTERNAL_BUS_TYPES or bool(descriptor.RemovableMedia))
    finally:
        kernel32.CloseHandle(handle)


def removable_drives(partitions=None, platform=sys.platform, is_external=None, system_drive=None):
    partitions = psutil.disk_partitions(all=False) if partitions is None else partitions
    if platform == "win32":
        is_external = is_external or drive_is_external
        # El disco del sistema nunca cuenta, aunque Windows esté instalado en un disco externo
        system = (system_drive or os.environ.get("SystemDrive", "C:")).upper().rstrip("\\")
        drives = [
            p.device for p in partitions
            if p.device.upper().rstrip("\\") != system and ("removable" in p.opts or is_external(p.device))
        ]
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
