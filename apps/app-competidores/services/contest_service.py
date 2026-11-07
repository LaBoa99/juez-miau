class ContestService:
    def __init__(self, api):
        self.api = api

    def load(self):
        """IContestView: edition, clock, languages y problems (vacío si el concurso no ha iniciado)."""
        return self.api.get("/contest")

    def statement_pdf(self, problem_id):
        """Bytes del enunciado en PDF; se abre en memoria, nunca se escribe a disco."""
        return self.api.get_bytes(f"/contest/problems/{problem_id}/statement-pdf")


def remaining_ms(clock, ms_since_received):
    """Tiempo restante. elapsedMs vale al momento de serverTime; solo corre mientras está RUNNING.
    Se cuenta desde que llegó la respuesta (se ignora la latencia de red, < 1 s)."""
    elapsed = clock["elapsedMs"] + (ms_since_received if clock["status"] == "RUNNING" else 0)
    if clock["status"] == "FINISHED":
        return 0
    return max(clock["durationMs"] - elapsed, 0)


def is_frozen(clock, ms_since_received):
    """El marcador se congela en los últimos freezeDurationMs (no hay evento; se calcula aquí)."""
    if clock["status"] == "FINISHED" or not clock["freezeDurationMs"]:
        return False
    return remaining_ms(clock, ms_since_received) <= clock["freezeDurationMs"]


def format_hms(ms):
    seconds = ms // 1000
    return f"{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}"
