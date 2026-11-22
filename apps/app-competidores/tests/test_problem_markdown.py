import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QUrl
from PySide6.QtGui import QTextDocument
from PySide6.QtWidgets import QApplication

from views import problems_view
from views.case_table import case_input_text
from views.problems_view import ProblemsView, problem_markdown, render_problem


def rendered(problem):
    QApplication.instance() or QApplication([])
    document = QTextDocument()
    render_problem(document, problem)
    return document

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
    assert "Entrada: 5\n3\nSalida: 8" in rendered(problem).toPlainText()


def test_samples_look_like_leetcode():
    document = rendered({"statement": "Suma.", "samples": [{"input": '{"nums":[1,1,1],"k":2}', "output": "2"}, {"input": "4", "output": "4"}]})
    text = document.toPlainText()
    assert text.index("Suma.") < text.index("Ejemplo 1") < text.index("Ejemplo 2")
    assert "Entrada: nums = [1, 1, 1], k = 2\nSalida: 2" in text
    assert "Copiar" not in text  # cada lenguaje lee distinto: copiar no servía tal cual


def test_statement_links_open_outside(monkeypatch):
    opened = []
    monkeypatch.setattr(problems_view.QDesktopServices, "openUrl", lambda url: opened.append(url.toString()))
    QApplication.instance() or QApplication([])
    view = ProblemsView()
    view.body.anchorClicked.emit(QUrl("https://example.com/a:b"))
    assert opened == ["https://example.com/a:b"]


def test_sample_input_shows_one_parameter_per_line():
    # Espacio tras cada coma: las listas largas cortan entre números; las comas dentro de cadenas no se tocan
    assert case_input_text('{"nums":[2,7,11,15],"target":9}') == "nums = [2, 7, 11, 15]\ntarget = 9"
    assert case_input_text('{"s":"a,b}\\"c","n":123456789012345678901}') == 's = "a,b}\\"c"\nn = 123456789012345678901'
    text = rendered({"statement": "x", "samples": [{"input": '{"text":"abc"}', "output": "3"}]}).toPlainText()
    assert 'text = "abc"' in text and '{"text"' not in text
