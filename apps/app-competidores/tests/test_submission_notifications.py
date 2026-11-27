from unittest.mock import MagicMock

from controllers.submission_controller import SubmissionController


def make_controller():
    window, notifier = MagicMock(), MagicMock()
    window.problems.problems = [{"id": 7, "letter": "A"}]
    controller = SubmissionController(MagicMock(), MagicMock(), window, notifier, MagicMock())
    return controller, notifier


def sub(status, verdict=None):
    return {"id": 1, "problemId": 7, "status": status, "verdict": verdict}


def test_fast_verdict_before_http_response_notifies_once():
    # CE casi instantáneo (firma cambiada, .txt): el socket trae el veredicto antes que la respuesta
    # del POST, y el listener de progreso vuelve a publicar el DONE ya leído de la BD
    controller, notifier = make_controller()
    controller._on_update(sub("QUEUED"))
    controller._on_update(sub("DONE", "CE"))
    controller._submitted(sub("QUEUED"))  # respuesta HTTP atrasada
    controller._on_update(sub("DONE", "CE"))

    assert notifier.notify.call_count == 1
    assert controller.submissions[1]["status"] == "DONE"


def test_http_response_first_still_notifies_verdict():
    controller, notifier = make_controller()
    controller._submitted(sub("QUEUED"))
    controller._on_update(sub("DONE", "WA"))

    assert notifier.notify.call_count == 1


def test_rejudge_still_notifies_new_verdict():
    controller, notifier = make_controller()
    controller._on_update(sub("DONE", "WA"))
    controller._on_update(sub("QUEUED"))
    controller._on_update(sub("DONE", "AC"))

    assert notifier.notify.call_count == 2
