import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QBuffer, QIODevice
from PySide6.QtGui import QPageSize, QPainter, QPdfWriter
from PySide6.QtPdf import QPdfDocument
from PySide6.QtWidgets import QApplication

from commands.load_contest import LoadStatementPdfCommand
from services.api_client import ApiClient
from views.problems_view import ProblemsView, problem_markdown


def tiny_pdf():
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    writer = QPdfWriter(buffer)
    writer.setPageSize(QPageSize(QPageSize.PageSizeId.A6))
    painter = QPainter(writer)
    painter.drawText(100, 100, "Enunciado")
    painter.end()
    return bytes(buffer.data())


class FakeResponse:
    status_code, ok, content = 200, True, b"%PDF-1.4"


class FakeContest:
    def statement_pdf(self, problem_id):
        return b"%PDF-" + str(problem_id).encode()


def test_get_bytes_returns_raw_body():
    api = ApiClient("http://server/")
    api.session.request = lambda *a, **k: FakeResponse()
    assert api.get_bytes("/contest/problems/1/statement-pdf") == b"%PDF-1.4"


def test_load_statement_pdf_command_returns_id_and_bytes():
    assert LoadStatementPdfCommand(FakeContest(), 7).execute() == (7, b"%PDF-7")


def test_markdown_without_statement_keeps_only_samples():
    md = problem_markdown({"statement": "", "samples": [{"input": "1", "output": "2"}]})
    assert md.startswith("### Ejemplo 1")


def test_view_asks_for_the_pdf_once_and_shows_it_in_memory():
    QApplication.instance() or QApplication([])
    view = ProblemsView()
    requested = []
    view.pdf_requested.connect(requested.append)
    problem = {"id": 5, "letter": "A", "title": "Suma", "statement": "", "hasStatementPdf": True, "samples": [], "limits": None}
    view.set_contest([problem], [])
    assert requested == [5]

    view.set_statement_pdf(5, tiny_pdf())
    assert view.pdf_document.status() == QPdfDocument.Status.Ready
    assert view.pdf_document.pageCount() == 1
    assert not view.pdf_view.isHidden()

    # Con markdown el visor se esconde
    view.set_contest([{**problem, "id": 6, "statement": "Hola", "hasStatementPdf": False}], [])
    assert view.pdf_view.isHidden()
