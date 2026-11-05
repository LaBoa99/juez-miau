import pytest

from commands.load_contest import LoadContestCommand
from commands.login import LoginCommand
from services.api_client import ApiError
from views.problems_view import problem_markdown


class FakeAuth:
    def __init__(self, error=None):
        self.error = error
        self.calls = []

    def login(self, username, password):
        self.calls.append((username, password))
        if self.error:
            raise self.error
        return {"name": "Alpha"}


def test_login_trims_username():
    auth = FakeAuth()
    assert LoginCommand(auth, "  alpha ", "pw").execute() == {"name": "Alpha"}
    assert auth.calls == [("alpha", "pw")]


def test_login_requires_both_fields_without_calling_server():
    auth = FakeAuth()
    with pytest.raises(ApiError):
        LoginCommand(auth, " ", "pw").execute()
    assert auth.calls == []


def test_login_401_becomes_credentials_message():
    with pytest.raises(ApiError) as error:
        LoginCommand(FakeAuth(ApiError(401, "x")), "a", "b").execute()
    assert error.value.message == "Usuario o contraseña incorrectos."


def test_login_other_errors_pass_through():
    original = ApiError(0, "sin red")
    with pytest.raises(ApiError) as error:
        LoginCommand(FakeAuth(original), "a", "b").execute()
    assert error.value is original


def test_load_contest_sorts_by_letter():
    class FakeContest:
        def load(self):
            return {"problems": [{"letter": "C"}, {"letter": "A"}, {"letter": "B"}]}

    view = LoadContestCommand(FakeContest()).execute()
    assert [p["letter"] for p in view["problems"]] == ["A", "B", "C"]


def test_problem_markdown_has_sections_and_copy_links():
    md = problem_markdown({
        "statement": "Suma.", "inputFormat": "n", "outputFormat": "",
        "samples": [{"input": "1 2", "output": "3"}],
    })
    assert "### Entrada" in md and "### Salida" not in md
    assert "(copy:0:input)" in md and "(copy:0:output)" in md


def test_login_403_means_suspended_team():
    with pytest.raises(ApiError) as error:
        LoginCommand(FakeAuth(ApiError(403, "Tu equipo fue suspendido por el staff")), "a", "b").execute()
    assert "suspendido" in error.value.message


def test_login_403_shows_server_detail():
    with pytest.raises(ApiError) as error:
        LoginCommand(FakeAuth(ApiError(403, "x", "La edición todavía no está abierta")), "a", "b").execute()
    assert error.value.message == "La edición todavía no está abierta"
