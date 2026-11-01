from pathlib import Path

from services.api_client import ApiError

MAX_SOURCE_BYTES = 64 * 1024

# Códigos de lenguaje del seeder del backend
EXTENSION_TO_CODE = {
    ".c": "c", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".cs": "csharp", ".java": "java",
    ".js": "javascript", ".ts": "typescript", ".py": "python",
}
LANGUAGE_NAMES = {
    "c": "C", "cpp": "C++", "csharp": "C#", "java": "Java", "javascript": "JavaScript",
    "typescript": "TypeScript", "python": "Python",
}
CODE_TO_EXTENSION = {"c": ".c", "cpp": ".cpp", "csharp": ".cs", "java": ".java", "javascript": ".js", "typescript": ".ts", "python": ".py"}

VERDICTS = {
    "AC": "Aceptado",
    "WA": "Respuesta incorrecta",
    "TLE": "Tiempo límite excedido",
    "MLE": "Memoria excedida",
    "RE": "Error en ejecución",
    "CE": "Error de compilación",
    "PENDING_REVIEW": "En revisión del juez",
}
PENDING = {"QUEUED", "JUDGING"}


class SubmissionService:
    def __init__(self, api):
        self.api = api

    def submit(self, problem_id, language_id, source):
        return self.api.post("/submissions", {"problemId": problem_id, "languageId": language_id, "source": source})

    def list(self):
        return self.api.get("/submissions")


def language_for(path, languages):
    code = EXTENSION_TO_CODE.get(Path(path).suffix.lower())
    return next((lang for lang in languages if lang["code"] == code), None)


def read_source(path):
    try:
        data = Path(path).read_bytes()
    except OSError:
        raise ApiError(0, "No se pudo leer el archivo. Revisa que exista y no esté abierto en exclusiva.")
    if len(data) > MAX_SOURCE_BYTES:
        raise ApiError(422, f"El archivo pesa {len(data) // 1024} KB; el máximo es 64 KB.")
    if not data.strip():
        raise ApiError(422, "El archivo está vacío.")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ApiError(422, "El archivo no está en UTF-8. Guárdalo como UTF-8 desde tu IDE.")


# El backend omite los campos que valen undefined (p. ej. reviewComment al crear o en eventos)
OPTIONAL_FIELDS = ("verdict", "maxTimeMs", "maxMemoryKb", "compileLog", "reviewComment", "judgedAt")


def normalize(sub):
    return {**dict.fromkeys(OPTIONAL_FIELDS), **sub}


def is_final(sub):
    return sub["status"] not in PENDING


def verdict_text(sub, progress=None):
    if sub["status"] == "QUEUED":
        return "En cola"
    if sub["status"] == "JUDGING":
        return f"Juzgando {progress[0]}/{progress[1]}" if progress else "Juzgando"
    if sub["status"] == "ERROR":
        return "Error del sistema; el staff lo revisará"
    return VERDICTS.get(sub["verdict"], sub["verdict"] or "")


def problem_states(submissions):
    """{problemId: (estado, intentos)} con estado en solved | pending | rejected."""
    states = {}
    for sub in submissions:
        state, attempts = states.get(sub["problemId"], (None, 0))
        if sub["verdict"] == "AC":
            new = "solved"
        elif not is_final(sub) or sub["verdict"] == "PENDING_REVIEW":
            new = "pending"
        else:
            new = "rejected"
        rank = {None: 0, "rejected": 1, "pending": 2, "solved": 3}
        states[sub["problemId"]] = (new if rank[new] > rank[state] else state, attempts + 1)
    return states
