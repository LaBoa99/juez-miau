import threading

from services.api_client import ApiError
from collections import namedtuple

from services.integrity_service import (
    MAX_NAME, MAX_PROCESSES, IntegrityService, active_interfaces, heartbeat_payload, removable_drives, running_processes,
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
