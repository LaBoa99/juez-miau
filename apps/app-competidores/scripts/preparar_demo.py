"""Deja la "Edición Demo" lista para probar la app de equipo: lenguajes habilitados, dos problemas
publicados por categoría y el concurso en curso. Solo para desarrollo.

Requisitos: API y worker del backend corriendo, `pnpm seed:base` y `pnpm seed:dev` aplicados.
Uso: venv/bin/python scripts/preparar_demo.py [--url http://localhost:3000]
Las credenciales salen de SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (entorno o apps/backend/.env).
"""
import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

EDITION = "Edición Demo"
LANGUAGES = ("python", "c", "cpp")  # los que tienen imagen del juez en desarrollo

PROBLEMS = [
    {
        "letter": "A", "title": "Suma de una lista",
        "statement": "Dada una lista de enteros `nums`, regresa la suma de todos sus elementos.\n\nSi la lista está vacía, la suma es 0.",
        "inputFormat": "`nums`: lista de enteros (0 ≤ n ≤ 10⁵, |nums[i]| ≤ 10⁹).",
        "outputFormat": "Un entero: la suma.",
        "signature": {"functionName": "suma", "params": [{"name": "nums", "type": {"type": "array", "items": {"type": "long"}}}], "returns": {"type": "long"}},
        "cases": [([1, 2, 3], "public"), ([], "public"), ([10**9, 10**9, 10**9], "hidden"), ([-5, 5, -7], "hidden")],
        "ref": "def suma(nums):\n    return sum(nums)\n",
    },
    {
        "letter": "B", "title": "Contar pares",
        "statement": "Dada una lista de enteros `nums`, regresa cuántos de ellos son pares.",
        "inputFormat": "`nums`: lista de enteros (0 ≤ n ≤ 10⁵).",
        "outputFormat": "Un entero: la cantidad de pares.",
        "signature": {"functionName": "contar_pares", "params": [{"name": "nums", "type": {"type": "array", "items": {"type": "int"}}}], "returns": {"type": "int"}},
        "cases": [([1, 2, 3, 4], "public"), ([7], "public"), ([0, -2, 5], "hidden"), ([], "hidden")],
        "ref": "def contar_pares(nums):\n    return sum(1 for x in nums if x % 2 == 0)\n",
    },
]


def admin_credentials():
    env = dict(os.environ)
    dotenv = Path(__file__).resolve().parents[2] / "backend" / ".env"
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() not in env:
                env[key.strip()] = value.strip()
    try:
        return env["SEED_ADMIN_EMAIL"], env["SEED_ADMIN_PASSWORD"]
    except KeyError:
        sys.exit("Faltan SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD")


class Api:
    def __init__(self, url):
        self.base = url.rstrip("/") + "/api/v1"
        self.session = requests.Session()

    def call(self, method, path, body=None, ok=(200, 201, 202, 204)):
        res = self.session.request(method, self.base + path, json=body, timeout=30)
        if res.status_code not in ok:
            sys.exit(f"{method} {path} → {res.status_code}: {res.text[:500]}")
        return res.json() if res.content else None


def wait_built(api, testset_id):
    for _ in range(180):
        testset = api.call("GET", f"/testsets/{testset_id}")
        if testset["status"] != "building":  # TestsetStatus va en minúsculas
            if testset["status"] != "ready":
                sys.exit(f"El testset {testset_id} no se construyó: {testset['buildLog']}")
            return
        time.sleep(1)
    sys.exit(f"El testset {testset_id} tardó demasiado. ¿Está corriendo el worker (pnpm start:worker)?")


def create_problem(api, edition_id, category, spec, language_ids):
    problem = api.call("POST", f"/editions/{edition_id}/problems", {
        "categoryId": category["id"], "title": spec["title"],
        "statement": spec["statement"], "inputFormat": spec["inputFormat"], "outputFormat": spec["outputFormat"],
    })
    api.call("PATCH", f"/problems/{problem['id']}/signature", spec["signature"])
    param = spec["signature"]["params"][0]["name"]
    for value, visibility in spec["cases"]:
        api.call("POST", f"/testsets/{problem['testsetId']}/cases", {"input": {param: value}, "visibility": visibility})
    api.call("PUT", f"/testsets/{problem['testsetId']}/ref-solution", {"languageId": language_ids["python"], "source": spec["ref"]})
    api.call("POST", f"/testsets/{problem['testsetId']}/build")
    wait_built(api, problem["testsetId"])
    api.call("POST", f"/problems/{problem['id']}/accept")
    print(f"  {category['code']} {spec['letter']}. {spec['title']}: publicado")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3000")
    api = Api(parser.parse_args().url)

    email, password = admin_credentials()
    token = api.call("POST", "/auth/staff/login", {"email": email, "password": password})["accessToken"]
    api.session.headers["Authorization"] = f"Bearer {token}"

    editions = api.call("GET", "/editions")
    editions = editions.get("data", editions) if isinstance(editions, dict) else editions
    edition = next((e for e in editions if e["name"] == EDITION), None)
    if not edition:
        sys.exit(f'No existe "{EDITION}". Corre pnpm seed:dev en apps/backend.')
    if edition["status"] != "DRAFT":
        sys.exit(f'"{EDITION}" está en {edition["status"]}; este script solo prepara una edición en DRAFT.')

    languages = {lang["code"]: lang["id"] for lang in api.call("GET", "/languages")}
    api.call("PUT", f"/editions/{edition['id']}/languages", {"ids": [languages[code] for code in LANGUAGES]})
    print("Lenguajes habilitados:", ", ".join(LANGUAGES))

    existing = api.call("GET", f"/editions/{edition['id']}/problems")
    existing = existing.get("data", existing) if isinstance(existing, dict) else existing
    # La letra se asigna al iniciar el concurso: se reconocen por título
    taken = {(p["categoryId"], p["title"]): p for p in existing}
    print("Problemas (cada build tarda unos segundos):")
    for category in api.call("GET", f"/editions/{edition['id']}/categories"):
        for spec in PROBLEMS:
            problem = taken.get((category["id"], spec["title"]))
            if not problem:
                create_problem(api, edition["id"], category, spec, languages)
            elif problem["status"] != "published":
                # Quedó a medias en una corrida anterior: se acepta si su build ya terminó
                api.call("POST", f"/problems/{problem['id']}/accept")
                print(f"  {category['code']} {spec['letter']}. {spec['title']}: publicado")

    start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    api.call("POST", f"/editions/{edition['id']}/schedule", {"scheduled_start": start})
    api.call("POST", f"/editions/{edition['id']}/clock/start")
    print(f'\n"{EDITION}" en curso. Entra con equipo01 / dev12345 (los equipos del seed usan la misma contraseña).')


if __name__ == "__main__":
    main()
