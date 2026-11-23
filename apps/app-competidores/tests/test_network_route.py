import socket
import threading
from types import SimpleNamespace

import pytest

from services import network_route
from services.network_route import Route, candidates, choose

SERVER = ("10.225.32.8", 3000)
CABLE = Route("Ethernet", "10.1.0.5")
WIFI = Route("Wi-Fi", "192.168.0.9")


def addr(ip, family=socket.AF_INET):
    return SimpleNamespace(family=family, address=ip)


def test_candidates_put_cable_first_and_skip_unusable_addresses():
    addrs = {
        "Wi-Fi": [addr("192.168.0.9"), addr("fe80::1", socket.AF_INET6)],
        "Ethernet": [addr("10.1.0.5")],
        "Loopback": [addr("127.0.0.1")],
        "Sin DHCP": [addr("169.254.1.2")],
        "Apagada": [addr("10.9.9.9")],
    }
    stats = {name: SimpleNamespace(isup=name != "Apagada") for name in addrs}
    assert candidates(addrs, stats) == [CABLE, WIFI]


def test_system_route_wins_when_it_reaches_the_server():
    assert choose(SERVER, [CABLE, WIFI], lambda *_: True, lambda *_: WIFI) == WIFI


def test_when_system_route_fails_cable_goes_first():
    no_system = lambda *_: None
    assert choose(SERVER, [CABLE, WIFI], lambda route, _: True, no_system) == CABLE
    assert choose(SERVER, [CABLE, WIFI], lambda route, _: route == CABLE, no_system) == CABLE
    assert choose(SERVER, [CABLE, WIFI], lambda route, _: route == WIFI, no_system) == WIFI
    assert choose(SERVER, [CABLE, WIFI], lambda route, _: False, no_system) is None


def test_single_interface_needs_no_probe():
    assert choose(SERVER, [CABLE], lambda *_: pytest.fail("no debe probar")) == CABLE
    assert choose(SERVER, [], lambda *_: pytest.fail("no debe probar")) is None


def test_connect_binds_the_chosen_interface_and_forgets_it_on_failure(monkeypatch):
    # Servidor real en loopback: 127.0.0.2 entra como "interfaz" para comprobar el bind
    server = socket.create_server(("127.0.0.1", 0))
    address = server.getsockname()
    seen = []
    thread = threading.Thread(target=lambda: seen.append(server.accept()[1][0]), daemon=True)
    thread.start()

    monkeypatch.setattr(network_route, "_routes", {})
    monkeypatch.setattr(network_route, "_route_for", lambda target: network_route._routes.setdefault(target, Route("Prueba", "127.0.0.2")))
    client = socket.socket()
    network_route._connect(client, address)
    thread.join(2)
    client.close()
    assert seen == ["127.0.0.2"]

    server.close()
    client = socket.socket()
    with pytest.raises(OSError):
        network_route._connect(client, address)
    client.close()
    assert address not in network_route._routes


def test_loopback_is_never_routed(monkeypatch):
    monkeypatch.setattr(network_route, "choose", lambda *_: pytest.fail("no debe buscar interfaz"))
    assert network_route._route_for(("127.0.0.1", 3000)) is None
