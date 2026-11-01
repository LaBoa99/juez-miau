import pytest

from services.api_client import ApiError
from services.clarification_service import MAX_QUESTION, ClarificationService, merge


def c(id, problem=None, answer=None, mine=None):
    item = {"id": id, "problemId": problem, "question": "q", "answer": answer}
    if mine is not None:
        item["mine"] = mine
    return item


def test_merge_keeps_mine_and_orders_newest_first():
    current = [c(2, 10, mine=True), c(1, None, "sí", mine=False)]
    merged, previous, accepted = merge(current, c(2, 10, "no"), {10})
    assert accepted and previous["answer"] is None
    assert [x["id"] for x in merged] == [2, 1] and merged[0]["mine"] and merged[0]["answer"] == "no"


def test_merge_adds_new_general_and_ignores_other_category():
    merged, previous, accepted = merge([], c(5, None, "receso a las 12"), {10})
    assert accepted and previous is None and merged[0]["mine"] is False
    assert merge([], c(6, 99, "x"), {10})[2] is False


def test_ask_validates_locally():
    class Api:
        def post(self, path, body):
            return body
    service = ClarificationService(Api())
    assert service.ask(None, "  ¿hay receso?  ") == {"problemId": None, "question": "¿hay receso?"}
    for bad in ("   ", "x" * (MAX_QUESTION + 1)):
        with pytest.raises(ApiError):
            service.ask(3, bad)


def test_by_topic_filters_and_sorts_newest_first():
    items = [
        {"id": 1, "problemId": None, "createdAt": "2026-10-29T18:00:00.000Z"},
        {"id": 2, "problemId": 10, "createdAt": "2026-10-29T18:05:00.000Z"},
        {"id": 3, "problemId": None, "createdAt": "2026-10-29T18:10:00.000Z"},
        {"id": 4, "problemId": 10, "createdAt": "2026-10-29T17:00:00.000Z"},
    ]
    from services.clarification_service import by_topic
    assert [c["id"] for c in by_topic(items, None)] == [3, 1]
    assert [c["id"] for c in by_topic(items, 10)] == [2, 4]
    assert by_topic(items, 99) == []


def test_by_topic_all_topics_keeps_everything_newest_first():
    from services.clarification_service import ALL_TOPICS, by_topic
    items = [{"id": 1, "problemId": None, "createdAt": "2026-10-29T18:00:00.000Z"},
             {"id": 2, "problemId": 10, "createdAt": "2026-10-29T18:05:00.000Z"}]
    assert [c["id"] for c in by_topic(items, ALL_TOPICS)] == [2, 1]
