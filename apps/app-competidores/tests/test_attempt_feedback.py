import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication, QLabel, QPushButton

from services.submission_service import normalize, verdict_state
from views.attempts_view import AttemptsView

LANGUAGES = [{"id": "py", "code": "python"}]


def example(number, input_, expected, actual, stderr=None):
    return {"number": number, "input": input_, "expected": expected, "actual": actual, "stderr": stderr}


def view_with(verdict):
    QApplication.instance() or QApplication([])
    view = AttemptsView()
    requested = []
    view.feedback_requested.connect(requested.append)
    sub = normalize({"id": 9, "problemId": 1, "languageId": "py", "status": "DONE", "verdict": verdict, "contestMs": 60000})
    view.set_attempts([sub], LANGUAGES, {})
    view.select(9)
    return view, requested


def chips(view):
    return [chip for chip in view.detail_body.findChildren(QPushButton) if chip.objectName() == "caseChip"]


def test_verdict_state_drives_the_icon():
    state = lambda status, verdict=None: verdict_state(normalize({"status": status, "verdict": verdict}))
    assert state("DONE", "AC") == "ok"
    assert [state("DONE", v) for v in ("WA", "TLE", "MLE", "RE", "CE")] == ["bad"] * 5
    assert [state("QUEUED"), state("JUDGING"), state("DONE", "PENDING_REVIEW"), state("ERROR")] == ["wait"] * 4
    view, _ = view_with("WA")
    assert not view.table.item(0, 2).icon().isNull()


def test_judge_comment_is_a_prominent_plain_text_note():
    QApplication.instance() or QApplication([])
    view = AttemptsView()
    sub = normalize({"id": 9, "problemId": 1, "languageId": "py", "status": "DONE", "verdict": "WA", "contestMs": 0,
                     "reviewComment": "Solo imprime <b>el número</b>"})
    view.set_attempts([sub], LANGUAGES, {})
    view.select(9)
    note = next(label for label in view.detail_body.findChildren(QLabel) if label.objectName() == "judgeNote")
    assert note.property("state") == "bad" and "&lt;b&gt;" in note.text()
    assert view.detail_text().startswith("Comentario del juez\nSolo imprime <b>el número</b>")


def test_attempt_is_numbered_instead_of_showing_the_minute():
    view, _ = view_with("WA")
    assert view.table.item(0, 0).text() == "#1"
    assert "minuto 1" in view.table.item(0, 0).toolTip()


def test_failed_example_opens_by_default_with_input_output_expected_in_order():
    view, requested = view_with("WA")
    assert requested == [9] and "Cargando" in view.detail_text()

    view.set_feedback(9, {"passed": 1, "total": 3, "cases": [
        {"number": 1, "verdict": "AC", "example": example(1, '{"nums":[1],"k":1}', "[0]", "[0]")},
        {"number": 2, "verdict": "WA", "example": example(2, '{"nums":[2,7],"k":9}', "[0,1]", "[1,0]")},
        {"number": 3, "verdict": "WA", "example": None},
    ]})
    text = view.detail_text()
    assert text.startswith("Revisión") and "Falló" not in text
    assert text.index("La entrada fue") < text.index("nums = [\n  2,\n  7\n]\nk = 9") < text.index("Tu salida fue") \
        < text.index("[1, 0]") < text.index("Se esperaba") < text.index("[0, 1]")
    # Los ejemplos se abren; los ocultos se ven pero no se les puede dar clic
    assert [(c.text(), c.isEnabled(), c.isChecked(), c.locked) for c in chips(view)] == [
        ("1", True, False, False), ("2", True, True, False), ("3", False, False, True)]


def test_a_passing_example_can_be_opened_to_calibrate():
    view, _ = view_with("WA")
    view.set_feedback(9, {"passed": 1, "total": 2, "cases": [
        {"number": 1, "verdict": "AC", "example": example(1, '{"a":5}', "10", "10")},
        {"number": 2, "verdict": "WA", "example": None},
    ]})
    chips(view)[0].click()
    text = view.detail_text()
    assert "Caso 1" in text and "aceptado" in text and "a = 5" in text


def test_runtime_error_shows_stderr_and_skipped_cases():
    view, _ = view_with("RE")
    view.set_feedback(9, {"passed": 0, "total": 2, "cases": [
        {"number": 1, "verdict": "RE", "example": example(1, "5", "8", None, "ZeroDivisionError")},
        {"number": 2, "verdict": None, "example": None},
    ]})
    text = view.detail_text()
    assert "Tu salida fue\nTu programa lanzó un error." in text and "El error fue\nZeroDivisionError" in text
    assert chips(view)[1].property("state") == "skip"


def test_feedback_arriving_at_once_is_not_followed_by_the_loading_text():
    view, _ = view_with("WA")
    view.feedback_requested.connect(lambda i: view.set_feedback(i, {"passed": 0, "total": 1, "cases": [
        {"number": 1, "verdict": "WA", "example": None}]}))
    view.forget_feedback(9)
    view._show_detail()
    assert "Cargando" not in view.detail_text()


def test_compile_error_has_no_cases():
    view, requested = view_with("CE")
    assert requested == [] and not chips(view)
