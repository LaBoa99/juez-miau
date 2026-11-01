from services.api_client import ApiError

MAX_QUESTION = 1000


class ClarificationService:
    def __init__(self, api):
        self.api = api

    def list(self):
        """Las propias (respondidas o no) y las respondidas visibles para la categoría del equipo."""
        return self.api.get("/contest/clarifications")

    def ask(self, problem_id, question):
        question = question.strip()
        if not question:
            raise ApiError(400, "Escribe tu pregunta.")
        if len(question) > MAX_QUESTION:
            raise ApiError(400, f"La pregunta es muy larga ({len(question)} caracteres; máximo {MAX_QUESTION}).")
        return self.api.post("/contest/clarifications", {"problemId": problem_id, "question": question})


def merge(clarifications, incoming, visible_problem_ids):
    """Une un evento (sin `mine`) a la lista. Ignora las de problemas de otra categoría.
    Regresa (lista nueva, la versión previa o None, si se aceptó)."""
    if incoming["problemId"] is not None and incoming["problemId"] not in visible_problem_ids:
        return clarifications, None, False
    previous = next((c for c in clarifications if c["id"] == incoming["id"]), None)
    merged = {**incoming, "mine": bool(previous and previous.get("mine"))}
    rest = [c for c in clarifications if c["id"] != incoming["id"]]
    return sorted(rest + [merged], key=lambda c: c["id"], reverse=True), previous, True


ALL_TOPICS = "all"


def by_topic(clarifications, topic):
    """Las del tema elegido (id de problema, None para las generales o ALL_TOPICS), de la más reciente a la más antigua."""
    chosen = [c for c in clarifications if topic == ALL_TOPICS or c["problemId"] == topic]
    return sorted(chosen, key=lambda c: (c["createdAt"], c["id"]), reverse=True)
