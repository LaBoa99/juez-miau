import re
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import NamedTuple
from urllib.parse import urlsplit

import psutil

PROBE_TIMEOUT = 2  # segundos por interfaz, solo la primera vez o tras perder la conexión
WIRELESS = re.compile(r"^wl|wi-?fi|wireless|inal[aá]mbrica", re.IGNORECASE)

_real_connect = socket.socket.connect
_lock = threading.Lock()
_routes = {}  # (ip del servidor, puerto) → Route


class Route(NamedTuple):
    name: str
    ip: str


def candidates(addrs=None, stats=None):
    """Interfaces activas con IPv4; primero las de cable, porque el Wi-Fi del laboratorio no llega al servidor."""
    addrs = psutil.net_if_addrs() if addrs is None else addrs
    stats = psutil.net_if_stats() if stats is None else stats
    found = [
        Route(name, entry.address)
        for name, entries in addrs.items() if name in stats and stats[name].isup
        for entry in entries
        if entry.family == socket.AF_INET and not entry.address.startswith(("127.", "169.254."))
    ]
    return sorted(found, key=lambda route: bool(WIRELESS.search(route.name)))


def _reaches(route, address):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(PROBE_TIMEOUT)
    try:
        sock.bind((route.ip, 0))
        _real_connect(sock, address)
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _system_route(address, options):
    """La interfaz que elige el sistema, si con ella se llega al servidor."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(PROBE_TIMEOUT)
    try:
        _real_connect(sock, address)
        ip = sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()
    return next((route for route in options if route.ip == ip), None)


def choose(address, options=None, reaches=_reaches, system=_system_route):
    """La ruta normal del sistema si llega al servidor; si no (salió por Wi-Fi), la primera interfaz que sí llegue.
    None si ninguna: se deja decidir al sistema."""
    options = candidates() if options is None else options
    if len(options) < 2:
        return options[0] if options else None
    with ThreadPoolExecutor(max_workers=len(options) + 1) as pool:
        preferred = pool.submit(system, address, options)
        results = list(pool.map(lambda route: reaches(route, address), options))
    return preferred.result() or next((route for route, ok in zip(options, results) if ok), None)


def _route_for(address):
    if address[0].startswith("127."):
        return None
    with _lock:
        if address not in _routes:
            route = choose(address)
            if route:
                _routes[address] = route
        return _routes.get(address)


def _connect(sock, address):
    route = None
    if sock.family == socket.AF_INET and sock.type == socket.SOCK_STREAM:
        route = _route_for(address[:2])
        if route:
            sock.bind((route.ip, 0))
    try:
        return _real_connect(sock, address)
    except OSError:
        # Se desconectó el cable o cambió la red: la siguiente conexión vuelve a buscar interfaz
        _routes.pop(address[:2], None)
        raise


def install():
    """Fija la interfaz en toda conexión de la app. Va en socket porque requests y el WebSocket abren
    las suyas por separado, y así las reconexiones también salen por la interfaz correcta."""
    socket.socket.connect = _connect


def interface_for(url):
    parts = urlsplit(url)
    try:
        host = socket.gethostbyname(parts.hostname)
    except OSError:
        return None
    route = _routes.get((host, parts.port or (443 if parts.scheme == "https" else 80)))
    return route.name if route else None
