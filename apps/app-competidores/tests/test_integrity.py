import threading

import psutil
from services.api_client import ApiError
from collections import namedtuple

from services.integrity_service import (
    MAX_NAME, MAX_PROCESSES, IntegrityService, active_interfaces, heartbeat_payload, kill_processes,
    normalize_process_name, removable_drives, running_processes,
)

Part = namedtuple("Part", "device mountpoint opts")
Stat = namedtuple("Stat", "isup")


class FakeApi:
    def __init__(self, responses, stop):
        self.responses = list(responses)
        self.stop = stop
        self.sent = []

    def post(self, path, body):
        self.sent.append((path, body))
        if not self.responses:
            self.stop.set()
            return {"nextHeartbeatMs": 0}
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_running_processes_respects_backend_limits():
    names = running_processes()
    assert names and len(names) <= MAX_PROCESSES
    assert all(isinstance(n, str) and 0 < len(n) <= MAX_NAME for n in names)


def test_sends_processes_and_keeps_going_after_network_errors():
    stop = threading.Event()
    api = FakeApi([{"nextHeartbeatMs": 0}, ApiError(0, "sin red")], stop)
    IntegrityService(api, collect=lambda: {"processes": ["code.exe"]}, retry_ms=0).run(stop)
    assert len(api.sent) == 3
    assert api.sent[0] == ("/contest/heartbeat", {"processes": ["code.exe"]})


def test_401_stops_and_reports_session_lost():
    stop = threading.Event()
    lost = []
    api = FakeApi([ApiError(401, "Tu sesión terminó.")], stop)
    service = IntegrityService(api, collect=dict)
    service.session_lost.connect(lost.append)
    service.run(stop)
    assert lost == ["Tu sesión terminó."] and len(api.sent) == 1


def test_removable_drives_by_platform():
    parts = [Part("C:\\", "C:\\", "rw,fixed"), Part("E:\\", "E:\\", "rw,removable"),
             Part("/dev/sdb1", "/run/media/ana/USB", "rw"), Part("/dev/sda1", "/", "rw")]
    assert removable_drives(parts, "win32", is_external=lambda d: False, system_drive="C:") == ["E:\\"]
    assert removable_drives(parts, "linux") == ["/run/media/ana/USB"]


def test_active_interfaces_skip_loopback_down_and_veth():
    stats = {"Ethernet": Stat(True), "Wi-Fi": Stat(False), "lo": Stat(True),
             "Loopback Pseudo-Interface 1": Stat(True), "veth12ab": Stat(True), "wlan0": Stat(True)}
    assert active_interfaces(stats) == ["Ethernet", "wlan0"]


def test_heartbeat_payload_shape():
    payload = heartbeat_payload()
    assert {"processes", "usbStorage", "networkInterfaces"} <= payload.keys()
    assert "monitors" not in payload or isinstance(payload["monitors"], int)


def test_running_processes_on_windows_keeps_only_windowed_pids():
    import os

    import psutil

    me = psutil.Process(os.getpid()).name()
    assert running_processes(platform="win32", window_pids={os.getpid()}) == [me]
    assert running_processes(platform="win32", window_pids=set()) == []


def test_windows_counts_usb_disks_reported_as_fixed_but_never_the_system_drive():
    parts = [Part("C:\\", "C:\\", "rw,fixed"), Part("D:\\", "D:\\", "rw,fixed"), Part("F:\\", "F:\\", "rw,fixed")]
    usb = {"F:\\", "C:\\"}  # aunque el sistema estuviera en USB, no se reporta
    assert removable_drives(parts, "win32", is_external=lambda d: d in usb, system_drive="C:") == ["F:\\"]


def test_normalize_process_name_strips_path_case_and_exe():
    assert normalize_process_name("C:\\Program Files\\Google\\Chrome.EXE") == "chrome"
    assert normalize_process_name("discord") == "discord"
    assert normalize_process_name("/usr/bin/code") == "code"


class FakeProcess:
    def __init__(self, pid, name, raises=None):
        self.info = {"pid": pid, "name": name}
        self._raises = raises
        self.killed = False

    def kill(self):
        if self._raises:
            raise self._raises
        self.killed = True


def test_kill_processes_only_kills_matches_and_survives_denied_access(monkeypatch):
    procs = [
        FakeProcess(1, "chrome.exe"),
        FakeProcess(2, "steam.exe", raises=psutil.AccessDenied(2)),
        FakeProcess(3, "code.exe"),
    ]
    monkeypatch.setattr(psutil, "process_iter", lambda attrs: procs)

    kill_processes(["chrome", "steam"])  # nombres ya normalizados, como los manda el servidor

    assert procs[0].killed is True
    assert procs[1].killed is False  # sin permisos: no truena, se ignora
    assert procs[2].killed is False  # no estaba en la lista


def test_kill_processes_does_nothing_without_names(monkeypatch):
    called = []
    monkeypatch.setattr(psutil, "process_iter", lambda attrs: called.append(1) or [])
    kill_processes([])
    assert called == []


def test_run_kills_the_processes_the_server_flags(monkeypatch):
    stop = threading.Event()
    killed = []
    monkeypatch.setattr("services.integrity_service.kill_processes", killed.append)
    api = FakeApi([{"nextHeartbeatMs": 0, "killProcesses": ["chrome"]}], stop)
    IntegrityService(api, collect=lambda: {"processes": ["chrome.exe"]}, retry_ms=0).run(stop)
    # FakeApi hace una llamada extra al agotar las respuestas (sin killProcesses) antes de frenar el hilo.
    assert killed == [["chrome"], []]
