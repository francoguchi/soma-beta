"""The static-only browser host must accept a burst from eight browser workers.

A bare ThreadingHTTPServer inherits TCPServer.request_queue_size == 5.
We deliberately do not service/accept connections in this test: sixteen
simultaneous connection handshakes must fit in the queued listener backlog.
This catches the original Windows Edge JS-fetch ERR_CONNECTION_REFUSED class
without changing runtime hosting or weakening a Playwright assertion.
"""

from http.server import BaseHTTPRequestHandler
import socket

from tools.serve_ui_test import BrowserTestHTTPServer


def test_browser_host_accept_backlog_handles_more_than_eight_workers():
    with BrowserTestHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler) as server:
        assert server.request_queue_size >= 64
        clients = []
        try:
            for _ in range(16):
                clients.append(socket.create_connection(server.server_address, timeout=2))
            assert len(clients) == 16
        finally:
            for client in clients:
                client.close()
