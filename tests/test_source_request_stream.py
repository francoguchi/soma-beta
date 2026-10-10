"""Exercise actual ASGI parsing with fragmented and oversized wire bodies."""
import asyncio
import json
from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse

from soma.application import SourceApplication
from soma.foundation.runtime.host import HostExecutor


def parse_stream(path, chunks):
    executor = HostExecutor(1, "soma-stream-test")
    app = SourceApplication.__new__(SourceApplication)
    app.security = SimpleNamespace(control=SimpleNamespace(_origin="http://127.0.0.1:1"))
    errors, dispatched, received = [], [], []
    app.host = SimpleNamespace(request_executor=executor, record_error_code=errors.append)
    def api(_request, body):
        dispatched.append(body)
        return JSONResponse({"parsed": True})
    app.api = api
    iterator = iter(chunks)
    async def receive():
        chunk = next(iterator)
        received.append(len(chunk))
        return {"type": "http.request", "body": chunk, "more_body": bool(chunk)}
    scope = {"type": "http", "method": "POST", "path": path, "query_string": b"",
        "headers": [(b"host", b"127.0.0.1:1"), (b"content-type", b"application/json")],
        "scheme": "http", "server": ("127.0.0.1", 1)}
    try:
        response = asyncio.run(app.request(Request(scope, receive)))
        assert not errors
        return response, dispatched, received
    finally:
        executor.close()
        assert executor.drain(5)


def test_fragmented_utf8_json_reaches_dispatch_without_changed_bytes():
    expected = {"value": "Español 🐍" * 2000}
    raw = json.dumps(expected, ensure_ascii=False).encode("utf-8")
    response, dispatched, _ = parse_stream("/api/v1/stream-test", (*map(bytes, ([byte] for byte in raw)), b""))
    assert response.status_code == 200 and dispatched == [expected]


@pytest.mark.parametrize("path,bound", [("/api/v1/auth/login", 4096),
    ("/api/v1/runtime/shutdown", 4096), ("/api/v1/stream-test", 262144)])
def test_exact_request_bound_and_early_oversize_rejection(path, bound):
    raw = b'{"value":"' + b"a" * (bound - 12) + b'"}'
    assert len(raw) == bound
    response, dispatched, _ = parse_stream(path, (raw, b""))
    assert response.status_code == 200 and len(dispatched) == 1
    response, dispatched, received = parse_stream(path, (raw, b"x", b"unread", b""))
    assert response.status_code == 400 and dispatched == [] and received == [bound, 1]
    assert json.loads(response.body)["code"] == "VALIDATION_FAILED"
