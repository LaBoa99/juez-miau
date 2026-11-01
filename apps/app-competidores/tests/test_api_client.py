import pytest
import requests

from services.api_client import MESSAGES, ApiClient, ApiError


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self.ok = status < 400
        self._body = body
        self.content = b"x" if body is not None else b""

    def json(self):
        if self._body is None:
            raise ValueError
        return self._body


def client_returning(response):
    api = ApiClient("http://server/")
    api.session.request = lambda *a, **k: response
    return api


def test_base_url_adds_api_prefix():
    assert ApiClient("http://server/").base_url == "http://server/api/v1"


def test_ok_returns_json_and_sends_token():
    seen = {}
    api = ApiClient("http://server")
    api.token = "abc"

    def fake(method, url, json, headers, timeout):
        seen.update(url=url, headers=headers)
        return FakeResponse(200, {"x": 1})

    api.session.request = fake
    assert api.get("/contest") == {"x": 1}
    assert seen == {"url": "http://server/api/v1/contest", "headers": {"Authorization": "Bearer abc"}}


@pytest.mark.parametrize("status", [401, 403, 404, 409, 429])
def test_known_status_uses_team_message(status):
    with pytest.raises(ApiError) as error:
        client_returning(FakeResponse(status, {"message": "detalle interno"})).get("/x")
    assert error.value.status == status
    assert error.value.message == MESSAGES[status]


def test_validation_list_uses_first_server_message():
    with pytest.raises(ApiError) as error:
        client_returning(FakeResponse(400, {"message": ["source too long", "otro"]})).get("/x")
    assert error.value.message == "source too long"


def test_unparseable_error_has_fallback():
    with pytest.raises(ApiError) as error:
        client_returning(FakeResponse(500)).get("/x")
    assert "500" in error.value.message


def test_network_failure_is_status_zero():
    api = ApiClient("http://server")

    def boom(*a, **k):
        raise requests.ConnectionError()

    api.session.request = boom
    with pytest.raises(ApiError) as error:
        api.get("/x")
    assert error.value.status == 0
