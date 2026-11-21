from PySide6.QtCore import QUrl

from views import problems_view
from views.problems_view import ProblemsView, case_input_text, problem_markdown, signature_text

SIGNATURE = {
    "functionName": "total",
    "params": [
        {"name": "n", "type": {"type": "int"}},
        {"name": "grid", "type": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}}},
    ],
    "returns": {"type": "array", "items": {"type": "long"}},
}


def test_signature_text_matches_staff_format():
    assert signature_text(SIGNATURE) == "total(n: int, grid: string[][]) -> long[]"


def test_problem_markdown_shows_the_function():
    md = problem_markdown({"statement": "Suma.", "signature": SIGNATURE, "samples": []})
    assert "### Función\n\n```\ntotal(n: int, grid: string[][]) -> long[]\n```" in md


def test_full_program_shows_the_read_order_instead_of_the_function():
    problem = {"statement": "Suma.", "signature": SIGNATURE, "fullProgram": True, "samples": [{"input": "5\n3", "output": "8"}]}
    md = problem_markdown(problem)
    assert "### Función" not in md
    assert "en este orden: `n`, `grid`" in md
    assert "```\n5\n3\n```" in md


def test_sample_with_backticks_does_not_break_the_block():
    md = problem_markdown({"statement": "x", "samples": [{"input": "1", "output": "a```b"}]})
    assert "````\na```b\n````" in md


def test_statement_links_open_outside(monkeypatch):
    opened = []
    monkeypatch.setattr(problems_view.QDesktopServices, "openUrl", lambda url: opened.append(url.toString()))
    # Sin ventana: _on_link solo usa self para los enlaces copy:
    ProblemsView._on_link(None, QUrl("https://example.com/a:b"))
    assert opened == ["https://example.com/a:b"]


def test_sample_input_shows_one_parameter_per_line():
    assert case_input_text('{"nums":[2,7,11,15],"target":9}') == "nums = [2,7,11,15]\ntarget = 9"
    assert case_input_text('{"s":"a,b}\\"c","n":123456789012345678901}') == 's = "a,b}\\"c"\nn = 123456789012345678901'
    md = problem_markdown({"statement": "x", "samples": [{"input": '{"text":"abc"}', "output": "3"}]})
    assert 'text = "abc"' in md and '{"text"' not in md
