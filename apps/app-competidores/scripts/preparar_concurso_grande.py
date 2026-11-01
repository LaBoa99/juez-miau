"""Concurso grande para revisar cómo se ve la app con mucho contenido: edición nueva con 2 categorías,
10 problemas publicados por categoría, 40 equipos con envíos variados y muchas clarificaciones.
Solo para desarrollo; no toca otras ediciones.

Requisitos: API y worker del backend corriendo, `pnpm seed:base` aplicado.
Uso: venv/bin/python scripts/preparar_concurso_grande.py [--url http://localhost:3000] [--equipos 20]
Las credenciales de los equipos quedan en scripts/concurso_grande_equipos.csv (no se versiona).
"""
import argparse
import csv
import io
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from preparar_demo import Api, admin_credentials, wait_built

random.seed(7)
LANGUAGES = ("python", "c", "cpp")
HERE = Path(__file__).resolve().parent

ARR_INT = {"type": "array", "items": {"type": "int"}}
INT, LONG, BOOL, STR = {"type": "int"}, {"type": "long"}, {"type": "bool"}, {"type": "string"}


def sig(name, params, returns):
    return {"functionName": name, "params": [{"name": n, "type": t} for n, t in params], "returns": returns}


# (título, enunciado, firma, casos [(entrada, visibilidad)], solución oficial, solución incorrecta)
PROBLEMS = [
    ("Suma de una lista", "Regresa la suma de `nums`. Si está vacía, la suma es 0.",
     sig("suma", [("nums", {"type": "array", "items": LONG})], LONG),
     [({"nums": [1, 2, 3]}, "public"), ({"nums": []}, "public"), ({"nums": [10**9] * 3}, "hidden")],
     "def suma(nums):\n    return sum(nums)\n", "def suma(nums):\n    return sum(nums) + 1\n"),
    ("Contar pares", "Regresa cuántos elementos de `nums` son pares.",
     sig("contar_pares", [("nums", ARR_INT)], INT),
     [({"nums": [1, 2, 3, 4]}, "public"), ({"nums": [0, -2, 5]}, "hidden")],
     "def contar_pares(nums):\n    return sum(1 for x in nums if x % 2 == 0)\n", "def contar_pares(nums):\n    return len(nums) // 2\n"),
    ("Máximo de la lista", "Regresa el mayor elemento de `nums` (la lista nunca está vacía).",
     sig("maximo", [("nums", ARR_INT)], INT),
     [({"nums": [3, 9, 2]}, "public"), ({"nums": [-5, -1, -9]}, "hidden")],
     "def maximo(nums):\n    return max(nums)\n", "def maximo(nums):\n    return nums[0]\n"),
    ("Invertir la lista", "Regresa `nums` en orden inverso.",
     sig("invertir", [("nums", ARR_INT)], ARR_INT),
     [({"nums": [1, 2, 3]}, "public"), ({"nums": [7]}, "hidden")],
     "def invertir(nums):\n    return nums[::-1]\n", "def invertir(nums):\n    return sorted(nums)\n"),
    ("¿Es palíndromo?", "Regresa `true` si `s` se lee igual al derecho y al revés.",
     sig("es_palindromo", [("s", STR)], BOOL),
     [({"s": "anitalavalatina"}, "public"), ({"s": "concurso"}, "public"), ({"s": ""}, "hidden")],
     "def es_palindromo(s):\n    return s == s[::-1]\n", "def es_palindromo(s):\n    return len(s) % 2 == 1\n"),
    ("Suma de dígitos", "Regresa la suma de los dígitos de `n` (0 ≤ n ≤ 10⁹).",
     sig("suma_digitos", [("n", INT)], INT),
     [({"n": 1234}, "public"), ({"n": 0}, "hidden"), ({"n": 999999999}, "hidden")],
     "def suma_digitos(n):\n    return sum(int(d) for d in str(n))\n", "def suma_digitos(n):\n    return n % 10\n"),
    ("Palabra más larga", "Regresa la longitud de la palabra más larga de `s` (palabras separadas por un espacio).",
     sig("mas_larga", [("s", STR)], INT),
     [({"s": "hola concurso de programacion"}, "public"), ({"s": "a"}, "hidden")],
     "def mas_larga(s):\n    return max(len(w) for w in s.split(' '))\n", "def mas_larga(s):\n    return len(s.split(' '))\n"),
    ("Contar positivos", "Regresa cuántos elementos de `nums` son mayores que cero.",
     sig("positivos", [("nums", ARR_INT)], INT),
     [({"nums": [-1, 0, 4, 5]}, "public"), ({"nums": []}, "hidden")],
     "def positivos(nums):\n    return sum(1 for x in nums if x > 0)\n", "def positivos(nums):\n    return sum(1 for x in nums if x >= 0)\n"),
    ("Fibonacci modular con un título muy largo para ver cómo se recorta en la lista",
     "Regresa el `n`-ésimo número de Fibonacci módulo 10⁹+7, con F(0)=0 y F(1)=1 (0 ≤ n ≤ 10⁵).",
     sig("fib", [("n", INT)], INT),
     [({"n": 10}, "public"), ({"n": 0}, "public"), ({"n": 100000}, "hidden")],
     "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, (a + b) % 1000000007\n    return a\n",
     "def fib(n):\n    return n\n"),
    ("Mayúsculas", "Regresa `s` con todas sus letras en mayúsculas.",
     sig("mayusculas", [("s", STR)], STR),
     [({"s": "juez"}, "public"), ({"s": "Concurso 2026"}, "hidden")],
     "def mayusculas(s):\n    return s.upper()\n", "def mayusculas(s):\n    return s\n"),
]

TEAM_WORDS = (["Bytes", "Bits", "Nodos", "Punteros", "Lambdas", "Recursivos", "Compiladores", "Algoritmos", "Grafos", "Hashes"],
              ["Nocturnos", "Veloces", "Dinámicos", "Voraces", "Binarios", "Cuánticos", "Inmutables", "Paralelos"])
QUESTIONS = [
    "¿La lista puede venir vacía?", "¿Los números pueden ser negativos?", "¿Hay que imprimir algo o solo regresar el valor?",
    "¿Cuál es el tamaño máximo de la entrada?", "¿Se distinguen mayúsculas de minúsculas?",
    "En el ejemplo 2, ¿por qué la salida es 0?\nNo entiendo de dónde sale.", "¿Puedo usar librerías externas?",
    "¿El resultado cabe en un entero de 32 bits?", "¿Puede haber espacios dobles?", "¿Qué pasa si n es 0?",
]
GENERAL_QUESTIONS = ["¿Habrá receso para comer?", "¿El marcador se congela la última hora?", "¿Podemos usar documentación impresa?",
                     "¿Se penaliza el error de compilación?", "Nuestra computadora se reinició, ¿perdimos algo?"]
ANSWERS = [
    "Sí.", "No.", "Lee de nuevo el enunciado: viene especificado en la sección de entrada.",
    "Solo regresa el valor; el juez llama a tu función con la entrada en JSON. No imprimas nada.",
    "Sí, el resultado cabe; usa un entero de 64 bits por seguridad.",
    "El caso vacío es válido y está en los casos ocultos.\nRevisa también el caso con un solo elemento.",
    "Sin comentarios: la respuesta se deduce del enunciado.",
]


def teams_csv(per_category, categories):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["NombreEquipo", "Integrante1Nombre", "Integrante1Carrera", "Categoria"])
    used = set()
    for category in categories:
        for _ in range(per_category):
            while (name := f"{random.choice(TEAM_WORDS[0])} {random.choice(TEAM_WORDS[1])} {random.randint(1, 99)}") in used:
                pass
            used.add(name)
            writer.writerow([name, "Estudiante Demo", "Sistemas", category["code"]])
    return out.getvalue().encode("utf-8")


def team_api(url, username, password):
    api = Api(url)
    token = api.call("POST", "/auth/team/login", {"username": username, "password": password, "machineId": "demo-" + username})["accessToken"]
    api.session.headers["Authorization"] = f"Bearer {token}"
    return api


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--equipos", type=int, default=20, help="equipos por categoría")
    args = parser.parse_args()
    staff = Api(args.url)
    email, password = admin_credentials()
    staff.session.headers["Authorization"] = "Bearer " + staff.call("POST", "/auth/staff/login", {"email": email, "password": password})["accessToken"]

    name = f"Concurso Grande {datetime.now():%H%M%S}"
    edition = staff.call("POST", "/editions", {"name": name, "duration_ms": 5 * 3_600_000, "freeze_duration_ms": 3_600_000,
                                                "block_submissions_on_alert": False, "watch_network": False})
    eid = edition["id"]
    print(f'Edición "{name}" (#{eid})')
    categories = [staff.call("POST", f"/editions/{eid}/categories", c) for c in
                  ({"name": "Principiantes", "code": "PRIN"}, {"name": "Avanzados", "code": "AVAN"})]
    langs = {lang["code"]: lang["id"] for lang in staff.call("GET", "/languages")}
    staff.call("PUT", f"/editions/{eid}/languages", {"ids": [langs[c] for c in LANGUAGES]})

    res = staff.session.post(f"{staff.base}/editions/{eid}/teams/import",
                             files={"file": ("equipos.csv", teams_csv(args.equipos, categories), "text/csv")}, timeout=60)
    if res.status_code not in (200, 201):
        sys.exit(f"import → {res.status_code}: {res.text[:300]}")
    credentials = res.json()["credentials"]
    with open(HERE / "concurso_grande_equipos.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["teamName", "username", "password"])
        writer.writeheader()
        writer.writerows(credentials)
    print(f"{len(credentials)} equipos; credenciales en scripts/concurso_grande_equipos.csv")

    print("Problemas (20 builds, tarda unos minutos):")
    problem_ids = {c["id"]: [] for c in categories}
    for category in categories:
        for letter, (title, statement, signature, cases, ref, wrong) in zip("ABCDEFGHIJ", PROBLEMS):
            problem = staff.call("POST", f"/editions/{eid}/problems", {
                "categoryId": category["id"], "letter": letter, "title": title, "statement": statement,
                "inputFormat": "Ver la firma de la función.", "outputFormat": "El valor que regresa la función."})
            staff.call("PATCH", f"/problems/{problem['id']}/signature", signature)
            for value, visibility in cases:
                staff.call("POST", f"/testsets/{problem['testsetId']}/cases", {"input": value, "visibility": visibility})
            staff.call("PUT", f"/testsets/{problem['testsetId']}/ref-solution", {"languageId": langs["python"], "source": ref})
            staff.call("POST", f"/testsets/{problem['testsetId']}/build")
            wait_built(staff, problem["testsetId"])
            staff.call("POST", f"/problems/{problem['id']}/publish")
            problem_ids[category["id"]].append((problem["id"], ref, wrong))
            print(f"  {category['code']} {letter}. {title[:40]}")

    start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    staff.call("POST", f"/editions/{eid}/schedule", {"scheduled_start": start})
    staff.call("POST", f"/editions/{eid}/clock/start")
    print("Concurso en curso. Enviando soluciones…")

    teams_by_name = {t["name"]: t for t in staff.call("GET", f"/editions/{eid}/teams?pageSize=100")["items"]}
    plans = []
    for cred in credentials:
        team = teams_by_name[cred["teamName"]]
        api = team_api(args.url, cred["username"], cred["password"])
        skill = random.random()
        attempts = []
        for problem_id, ref, wrong in problem_ids[team["category"]["id"]]:
            if random.random() > skill:
                continue
            for _ in range(random.choice([0, 0, 1, 2])):
                attempts.append((problem_id, "python", wrong))
            if random.random() < 0.08:
                attempts.append((problem_id, "cpp", "int main( { return 0 }\n"))
            if random.random() < 0.85:
                attempts.append((problem_id, "python", ref))
        plans.append((cred, api, attempts))

    # Por rondas para respetar la espera de 5 s entre envíos de un mismo equipo
    sent, last = 0, {}
    for round_ in range(max(len(p[2]) for p in plans)):
        for cred, api, attempts in plans:
            if round_ >= len(attempts):
                continue
            wait = 5.3 - (time.monotonic() - last.get(cred["username"], 0))
            if wait > 0:
                time.sleep(wait)
            problem_id, lang, source = attempts[round_]
            api.call("POST", "/submissions", {"problemId": problem_id, "languageId": langs[lang], "source": source})
            last[cred["username"]] = time.monotonic()
            sent += 1
    print(f"{sent} envíos en cola")

    print("Clarificaciones…")
    answered = 0
    for i in range(36):
        cred, api, _ = random.choice(plans)
        team = teams_by_name[cred["teamName"]]
        general = i % 5 == 0
        problem_id = None if general else random.choice(problem_ids[team["category"]["id"]])[0]
        question = random.choice(GENERAL_QUESTIONS if general else QUESTIONS)
        clarification = api.call("POST", "/contest/clarifications", {"problemId": problem_id, "question": question})
        if random.random() < 0.7:
            staff.call("POST", f"/editions/{eid}/clarifications/{clarification['id']}/answer", {"answer": random.choice(ANSWERS)})
            answered += 1
    print(f"36 clarificaciones, {answered} respondidas")

    first = credentials[0]
    print(f'\nListo. Entra a la app con {first["username"]} / {first["password"]} ("{first["teamName"]}").')
    print("El worker seguirá juzgando unos minutos; el marcador se va llenando en vivo.")


if __name__ == "__main__":
    main()
