import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QUrl
from PySide6.QtGui import QTextCursor, QTextDocument
from PySide6.QtWidgets import QApplication

from views import problems_view
from views.case_table import case_input_text
from views.problems_view import ProblemsView, problem_markdown, render_problem


def rendered(problem):
    QApplication.instance() or QApplication([])
    document = QTextDocument()
    render_problem(document, problem)
    return document


def example_cells(document):
    """Por cada tabla de ejemplo: encabezados y valores, de izquierda a derecha."""
    result = []
    for table in document.rootFrame().childFrames():
        cells = []
        for row in range(table.rows()):
            for column in range(table.columns()):
                cell = table.cellAt(row, column)
                cursor = cell.firstCursorPosition()
                cursor.setPosition(cell.lastCursorPosition().position(), QTextCursor.MoveMode.KeepAnchor)
                cells.append(cursor.selection().toPlainText())
        result.append(cells)
    return result


SIGNATURE = {
    "functionName": "total",
    "params": [
        {"name": "n", "type": {"type": "int"}},
        {"name": "grid", "type": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}}},
    ],
    "returns": {"type": "array", "items": {"type": "long"}},
}


def test_statement_does_not_show_the_signature():
    # La plantilla ya trae la firma; como en LeetCode, el enunciado no la repite
    md = problem_markdown({"statement": "Suma.", "signature": SIGNATURE, "samples": []})
    assert "Función" not in md and "total(" not in md


def test_full_program_shows_the_read_order_instead_of_the_function():
    problem = {"statement": "Suma.", "signature": SIGNATURE, "fullProgram": True, "samples": [{"input": "5\n3", "output": "8"}]}
    md = problem_markdown(problem)
    assert "### Función" not in md
    assert "en este orden: `n`, `grid`" in md
    # El texto que lee el programa va tal cual, con sus saltos de línea
    assert example_cells(rendered(problem))[0] == ["Entrada", "Salida", "5\n3", "8"]


def test_samples_show_input_and_output_in_two_columns():
    document = rendered({"statement": "Suma.", "samples": [{"input": '{"nums":[1,1,1],"k":2}', "output": "2"}, {"input": "4", "output": "4"}]})
    text = document.toPlainText()
    assert text.index("Suma.") < text.index("Ejemplo 1") < text.index("Ejemplo 2")
    assert example_cells(document) == [
        ["Entrada", "Salida", "nums = [\n  1,\n  1,\n  1\n]\nk = 2", "2"],
        ["Entrada", "Salida", "4", "4"],
    ]
    assert "Copiar" not in text  # cada lenguaje lee distinto: copiar no servía tal cual


def test_statement_links_open_outside(monkeypatch):
    opened = []
    monkeypatch.setattr(problems_view.QDesktopServices, "openUrl", lambda url: opened.append(url.toString()))
    QApplication.instance() or QApplication([])
    view = ProblemsView()
    view.body.anchorClicked.emit(QUrl("https://example.com/a:b"))
    assert opened == ["https://example.com/a:b"]


def test_paused_contest_disables_submit_even_after_a_send_finishes():
    QApplication.instance() or QApplication([])
    view = ProblemsView()
    view.set_paused(True)
    view.set_submitting(True)
    view.set_submitting(False)
    assert not view.submit_button.isEnabled() and view.submit_button.text() == "Concurso en pausa"
    view.set_paused(False)
    assert view.submit_button.isEnabled() and view.submit_button.text() == "Enviar solución"


def test_solved_problem_asks_before_another_submission():
    QApplication.instance() or QApplication([])
    view = ProblemsView()
    view.problems = [{"id": 1, "letter": "A", "title": "Suma"}]
    view.sidebar.addItem("A")
    view.sidebar.setCurrentRow(0)
    asked, dialogs = [], []
    view._confirm_resubmit = lambda problem: asked.append(problem["id"]) or False
    view._file_dialog = lambda *a, **k: dialogs.append(a)

    view.submissions = [{"problemId": 1, "status": "DONE", "verdict": "WA"}]
    view._choose_file()
    assert asked == [] and len(dialogs) == 1

    view.submissions.append({"problemId": 1, "status": "DONE", "verdict": "AC"})
    view._choose_file()
    assert asked == [1] and len(dialogs) == 1  # canceló: no se abre el selector de archivo


def test_sample_input_shows_one_parameter_per_line():
    # Espacio tras cada coma: las listas largas cortan entre números; las comas dentro de cadenas no se tocan
    assert case_input_text('{"nums":[2,7,11,15],"target":9}') == "nums = [\n  2,\n  7,\n  11,\n  15\n]\ntarget = 9"
    # Una cuadrícula: una fila por línea; las comas dentro de un texto no cortan; la lista vacía se queda en una línea
    assert case_input_text('{"g":[[1,2],[3]],"ops":["a,b","P"],"v":[]}') == \
        'g = [\n  [1, 2],\n  [3]\n]\nops = [\n  "a,b",\n  "P"\n]\nv = []'
    assert case_input_text('{"s":"a,b}\\"c","n":123456789012345678901}') == 's = "a,b}\\"c"\nn = 123456789012345678901'
    text = rendered({"statement": "x", "samples": [{"input": '{"text":"abc"}', "output": "3"}]}).toPlainText()
    assert 'text = "abc"' in text and '{"text"' not in text
