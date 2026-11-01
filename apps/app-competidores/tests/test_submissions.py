import pytest

from commands.save_template import SaveTemplateCommand
from commands.submit_solution import SubmitSolutionCommand
from services.api_client import ApiError
from services.submission_service import MAX_SOURCE_BYTES, language_for, normalize, problem_states, read_source, verdict_text

LANGS = [{"id": "uuid-py", "code": "python"}, {"id": "uuid-cpp", "code": "cpp"}]


def sub(id, problem, status="DONE", verdict=None):
    return {"id": id, "problemId": problem, "status": status, "verdict": verdict}


def test_language_for_extension_case_insensitive():
    assert language_for("C:/a/Sol.PY", LANGS)["id"] == "uuid-py"
    assert language_for("a.cc", LANGS)["id"] == "uuid-cpp"
    assert language_for("a.java", LANGS) is None  # no habilitado en la edición
    assert language_for("a.txt", LANGS) is None


def test_read_source_limits_and_encoding(tmp_path):
    ok = tmp_path / "a.py"
    ok.write_bytes("\ufeffprint('ñ')".encode("utf-8"))
    assert read_source(ok) == "print('ñ')"

    for content, fragment in (
        (b"x" * (MAX_SOURCE_BYTES + 1), "64 KB"),
        (b"  \n", "vacío"),
        ("ñ".encode("latin-1"), "UTF-8"),
    ):
        path = tmp_path / "b.py"
        path.write_bytes(content)
        with pytest.raises(ApiError) as error:
            read_source(path)
        assert fragment in error.value.message

    with pytest.raises(ApiError):
        read_source(tmp_path / "no-existe.py")


def test_problem_states_best_state_wins_and_counts_attempts():
    states = problem_states([
        sub(1, 10, verdict="WA"), sub(2, 10, verdict="AC"), sub(3, 10, "QUEUED"),
        sub(4, 20, verdict="CE"), sub(5, 20, "JUDGING"),
        sub(6, 30, verdict="PENDING_REVIEW"),
        sub(7, 40, verdict="TLE"),
    ])
    assert states == {10: ("solved", 3), 20: ("pending", 2), 30: ("pending", 1), 40: ("rejected", 1)}


def test_verdict_text():
    assert verdict_text(sub(1, 1, "QUEUED")) == "En cola"
    assert verdict_text(sub(1, 1, "JUDGING"), (3, 10)) == "Juzgando 3/10"
    assert verdict_text(sub(1, 1, verdict="WA")) == "Respuesta incorrecta"
    assert "staff" in verdict_text(sub(1, 1, "ERROR"))


class FakeService:
    def __init__(self):
        self.sent = None

    def submit(self, problem_id, language_id, source):
        self.sent = (problem_id, language_id, source)
        return {"id": 1}


def test_submit_uses_extension_over_chosen_language(tmp_path):
    path = tmp_path / "a.py"
    path.write_text("print(1)")
    service = FakeService()
    SubmitSolutionCommand(service, 7, str(path), LANGS, "uuid-cpp").execute()
    assert service.sent == (7, "uuid-py", "print(1)")


def test_submit_falls_back_to_chosen_language_or_fails(tmp_path):
    path = tmp_path / "solucion.txt"
    path.write_text("x")
    service = FakeService()
    SubmitSolutionCommand(service, 7, str(path), LANGS, "uuid-cpp").execute()
    assert service.sent[1] == "uuid-cpp"
    with pytest.raises(ApiError):
        SubmitSolutionCommand(FakeService(), 7, str(path), LANGS, None).execute()


def test_save_template_writes_file(tmp_path):
    path = tmp_path / "A.py"
    assert SaveTemplateCommand(str(path), "def f(): pass\n").execute() == str(path)
    assert path.read_text(encoding="utf-8") == "def f(): pass\n"
    with pytest.raises(ApiError):
        SaveTemplateCommand(str(tmp_path / "no" / "existe" / "A.py"), "x").execute()


def test_normalize_fills_missing_optional_fields():
    s = normalize({"id": 1, "problemId": 2, "status": "QUEUED", "contestMs": 0})
    assert s["reviewComment"] is None and s["compileLog"] is None and s["verdict"] is None
    assert normalize({"id": 1, "reviewComment": "ok"})["reviewComment"] == "ok"
