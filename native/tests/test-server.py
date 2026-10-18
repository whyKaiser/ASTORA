#!/usr/bin/env python3
"""Exercise the actual native HTTP adapter against a deterministic host backend.

Run on Linux/WSL: python3 native/tests/test-server.py
Builds into a temporary directory with clang-18, starts only 127.0.0.1:12840,
and always terminates its own fixture process. No console or internet needed.
Passing tests establish host HTTP behavior, not PS4 ABI/runtime compatibility.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
HOST = "127.0.0.1:12840"
ORIGIN = "http://" + HOST
BINARY = None
VALID_JOB = {"id": 700, "name": "valid", "titleId": "ASTR00700", "size": 16384, "complete": False}


def exchange(raw, fragments=None):
    with socket.create_connection(("127.0.0.1", 12840), timeout=7) as sock:
        sock.settimeout(7)
        for chunk in fragments or [raw]:
            sock.sendall(chunk)
        sock.shutdown(socket.SHUT_WR)
        chunks = []
        while True:
            try:
                chunk = sock.recv(65536)
            except ConnectionResetError:
                break
            if not chunk:
                break
            chunks.append(chunk)
    response = b"".join(chunks)
    if not response:
        return 0, {}, b""
    header, body = response.split(b"\r\n\r\n", 1)
    lines = header.decode("latin1").split("\r\n")
    status = int(lines[0].split()[1])
    headers = dict(line.split(": ", 1) for line in lines[1:])
    assert int(headers["Content-Length"]) == len(body), "response framing mismatch"
    return status, {key.lower(): value for key, value in headers.items()}, body


def request(method, path, body=None, headers=None):
    payload = b"" if body is None else json.dumps(body).encode()
    fields = [("Host", HOST), ("Connection", "close")]
    fields += headers or []
    if body is not None:
        fields += [("Content-Type", "application/json"), ("Content-Length", str(len(payload)))]
    raw = (method + " " + path + " HTTP/1.1\r\n" +
           "".join(key + ": " + value + "\r\n" for key, value in fields) + "\r\n").encode() + payload
    return exchange(raw)


class ServerFixture(unittest.TestCase):
    seeds = []

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="astora-server-test-")
        cls.root = Path(cls.temp.name)
        cls.assets = cls.root / "assets"
        cls.state = cls.root / "state"
        cls.assets.mkdir()
        cls.state.mkdir()
        (cls.assets / "index.html").write_text("<h1>ASTORA fixture</h1>")
        (cls.assets / "console.js").write_text("window.fixture=true;")
        (cls.root / "secret.txt").write_text("outside-root-secret")
        cls.catalog = {"schemaVersion": 1, "id": "fixture", "name": "Fixture", "items": []}
        (cls.root / "catalog.json").write_text(json.dumps(cls.catalog))
        (cls.state / "jobs.json").write_text(json.dumps(cls.seeds))
        cls.process = subprocess.Popen(
            [str(BINARY), str(cls.assets), str(cls.root / "catalog.json"), str(cls.state)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for _ in range(100):
            if cls.process.poll() is not None:
                raise RuntimeError(cls.process.stderr.read())
            try:
                status, _, body = request("GET", "/api/config")
                if status == 200:
                    cls.token = json.loads(body)["token"]
                    return
            except OSError:
                time.sleep(.02)
        cls.process.terminate()
        raise RuntimeError("fixture startup timed out")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.communicate(timeout=5)
        cls.temp.cleanup()

    def post(self, path, value):
        return request("POST", path, value, [("Origin", ORIGIN), ("X-Astora-Token", self.token)])

    def calls(self, method):
        path = self.state / "backend-calls.log"
        return sum(line.startswith(method + " ") for line in path.read_text().splitlines()) if path.exists() else 0

    def raw_post(self, body, fields=()):
        raw = ("POST /api/inspect HTTP/1.1\r\nHost: " + HOST +
               "\r\nX-Astora-Token: " + self.token + "\r\nContent-Type: application/json\r\n" +
               "".join(key + ": " + value + "\r\n" for key, value in fields) + "\r\n").encode() + body
        return exchange(raw)


class HttpBoundaries(ServerFixture):
    def test_listener_is_ipv4_loopback_only(self):
        # Linux exposes listening sockets without depending on ss/netstat.
        lines = Path("/proc/net/tcp").read_text().splitlines()[1:]
        matches = [line.split()[1] for line in lines
                   if line.split()[1].endswith(":%04X" % 12840) and line.split()[3] == "0A"]
        self.assertEqual(matches, ["0100007F:%04X" % 12840])

    def test_config_has_random_token_and_native_mode(self):
        status, headers, body = request("GET", "/api/config")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertRegex(data["token"], r"^[0-9a-f]{64}$")
        self.assertFalse(data["pcRequired"])
        self.assertEqual(data["mode"], "ps4-native-experimental")
        self.assertEqual(headers["cache-control"], "no-store")
        self.assertIn("frame-ancestors 'none'", headers["content-security-policy"])
        self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_host_and_origin_rejection(self):
        for host in ["localhost:12840", "evil.example", "127.0.0.1:80", ""]:
            with self.subTest(host=host):
                raw = f"GET /api/config HTTP/1.1\r\nHost: {host}\r\n\r\n".encode()
                self.assertEqual(exchange(raw)[0], 403)
        for origin in ["null", "https://127.0.0.1:12840", "http://evil.example"]:
            with self.subTest(origin=origin):
                self.assertEqual(request("GET", "/api/config", headers=[("Origin", origin)])[0], 403)

    def test_post_requires_token_without_backend_call(self):
        before = self.calls("inspect")
        for headers in [[], [("X-Astora-Token", "wrong")]]:
            self.assertEqual(request("POST", "/api/inspect", {"url": "https://github.com/example/pkg"}, headers)[0], 403)
        self.assertEqual(self.calls("inspect"), before)

    def test_static_assets_and_catalog(self):
        status, headers, body = request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"ASTORA fixture", body)
        self.assertEqual(headers["content-type"], "text/html; charset=utf-8")
        self.assertEqual(json.loads(request("GET", "/api/catalog")[2]), self.catalog)
        self.assertEqual(request("GET", "/missing-file")[0], 404)
        log = (self.state / "native-status.log").read_text()
        self.assertIn("ui_config_requested", log)
        self.assertIn("ui_index_served", log)
        self.assertNotIn(self.token, log)

    def test_traversal_and_encoded_paths(self):
        for path in ["/../secret.txt", "/%2e%2e/secret.txt", "/..\\secret.txt", "/console.js?x=1", "/index.html#fragment"]:
            with self.subTest(path=path):
                status, _, body = request("GET", path)
                self.assertEqual(status, 400)
                self.assertNotIn(b"outside-root-secret", body)

    def test_unsupported_method(self):
        self.assertEqual(request("PUT", "/api/config")[0], 405)

    def test_missing_length_and_chunked_rejected(self):
        self.assertEqual(self.raw_post(b"{}")[0], 411)
        self.assertEqual(self.raw_post(b"0\r\n\r\n", [("Transfer-Encoding", "chunked")])[0], 400)
        for length in ["+2", "-2", "2.0", "2x"]:
            with self.subTest(length=length):
                self.assertEqual(self.raw_post(b"{}", [("Content-Length", length)])[0], 400)

    def test_large_request_rejected_and_server_recovers(self):
        self.assertEqual(self.raw_post(b"", [("Content-Length", "20000")])[0], 413)
        raw = ("GET / HTTP/1.1\r\nHost: " + HOST + "\r\nX-Large: " + "a" * 17000).encode()
        self.assertEqual(exchange(raw)[0], 413)
        self.assertEqual(request("GET", "/api/config")[0], 200)

    def test_invalid_json_and_wrong_shape_do_not_call_backend(self):
        before = self.calls("inspect")
        for payload in [b"{", b"[]", b"null", b'"text"', b"", b'{"url":null}']:
            with self.subTest(payload=payload):
                self.assertEqual(self.raw_post(payload, [("Content-Length", str(len(payload)))])[0], 400)
        self.assertEqual(self.calls("inspect"), before)

    def test_json_trailing_garbage_rejected(self):
        for suffix in [b"malformed", b"\x00hidden"]:
            with self.subTest(suffix=suffix):
                body = b'{"url":"https://github.com/example/pkg"}' + suffix
                self.assertEqual(self.raw_post(body, [("Content-Length", str(len(body)))])[0], 400)

    def test_conflicting_duplicate_content_lengths_rejected(self):
        body = b'{"url":"https://github.com/example/pkg"}'
        self.assertEqual(self.raw_post(body, [("Content-Length", str(len(body))), ("Content-Length", "0")])[0], 400)

    def test_duplicate_host_rejected(self):
        self.assertIn(request("GET", "/api/config", headers=[("Host", "evil.example")])[0], [400, 403])

    def test_content_type_requires_json_media_type(self):
        body = b'{"url":"https://github.com/example/pkg"}'
        raw = (f"POST /api/inspect HTTP/1.1\r\nHost: {HOST}\r\nX-Astora-Token: {self.token}\r\n"
               f"Content-Type: application/json-not-really\r\nContent-Length: {len(body)}\r\n\r\n").encode() + body
        self.assertIn(exchange(raw)[0], [400, 403, 415])

    def test_inspection_and_backend_error_mapping(self):
        status, _, body = self.post("/api/inspect", {"url": "https://github.com/example/pkg", "platform": "PS4"})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"titleId": "ASTR00001", "size": 16384})
        status, _, body = self.post("/api/inspect", {"url": "https://github.com/backend-error"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], 13)

    def test_inspect_rejects_ps3_and_ps5_before_backend(self):
        before = self.calls("inspect")
        for platform in ["PS3", "PS5"]:
            with self.subTest(platform=platform):
                status, _, _ = self.post("/api/inspect", {"url": "https://github.com/example/pkg", "platform": platform})
                self.assertEqual(status, 400)
        self.assertEqual(self.calls("inspect"), before)

    def test_install_gates_platform_and_identity(self):
        before = self.calls("install")
        base = {"url": "https://github.com/example/pkg", "name": "Fixture", "titleId": "ASTR00001", "size": 16384, "platform": "PS4"}
        for change in [{"platform": "PS3"}, {"platform": "PS5"}, {"platform": "Windows"},
                       {"titleId": "bad"}, {"size": 8191}, {"size": 1099511627777}, {"name": "bad\nname"}]:
            with self.subTest(change=change):
                self.assertEqual(self.post("/api/install", dict(base, **change))[0], 400)
        self.assertEqual(self.calls("install"), before)

    def test_install_rejects_fractional_size_and_malformed_title(self):
        base = {"url": "https://github.com/example/pkg", "name": "Fixture", "titleId": "ASTR00011", "size": 16384, "platform": "PS4"}
        for change in [{"size": 16384.5}, {"titleId": "bad-title"}]:
            with self.subTest(change=change):
                self.assertEqual(self.post("/api/install", dict(base, **change))[0], 400)

    def test_install_records_only_safe_state_and_blocks_duplicate(self):
        item = {"url": "https://github.com/example/pkg?private=secret", "name": "Fixture save", "titleId": "ASTR00099", "size": 16384, "platform": "PS4"}
        status, _, body = self.post("/api/install", item)
        self.assertEqual(status, 202)
        self.assertTrue(json.loads(body)["stateSaved"])
        data = (self.state / "jobs.json").read_text()
        self.assertNotIn("secret", data)
        self.assertNotIn(self.token, data)
        records = json.loads(data)
        record = next(entry for entry in records if entry["titleId"] == item["titleId"])
        self.assertEqual(set(record), {"id", "name", "titleId", "size", "complete"})
        self.assertFalse(record["complete"])
        self.assertEqual(self.post("/api/install", item)[0], 409)

    def test_fragmented_http_body(self):
        body = b'{"url":"https://github.com/example/pkg"}'
        header = (f"POST /api/inspect HTTP/1.1\r\nHost: {HOST}\r\nX-Astora-Token: {self.token}\r\n"
                  f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n").encode()
        self.assertEqual(exchange(b"", fragments=[header[:20], header[20:], body[:9], body[9:]])[0], 200)


class ProgressState(ServerFixture):
    seeds = [{"id": task, "name": "Fixture " + str(task), "titleId": "ASTR00" + str(task), "size": 16384, "complete": False}
             for task in [700, 701, 702, 703, 704]]

    def test_missing_task_and_transferred_bytes_do_not_prove_installation(self):
        status, _, body = request("GET", "/api/jobs")
        self.assertEqual(status, 200)
        jobs = {entry["id"]: entry for entry in json.loads(body)}
        self.assertEqual(jobs[700]["state"], "transferring")
        self.assertEqual(jobs[701]["state"], "unknown")
        self.assertEqual(jobs[702]["state"], "failed")
        self.assertEqual(jobs[703]["state"], "installed")
        self.assertEqual(jobs[704]["state"], "transferring")
        saved = {entry["id"]: entry for entry in json.loads((self.state / "jobs.json").read_text())}
        self.assertTrue(saved[703]["complete"])
        self.assertFalse(saved[704]["complete"])


class RestoreValidation(ServerFixture):
    seeds = [VALID_JOB] + [dict(VALID_JOB, **change) for change in [
        {"id": -1}, {"id": 1.5}, {"id": 2**40}, {"titleId": "bad-title"},
        {"name": "bad\nname"}, {"size": 16384.5}, {"size": 2**60},
        {"id": 900, "complete": "true"}, {}]]

    def test_invalid_persisted_records_never_reach_backend(self):
        self.assertEqual(self.calls("restore"), 1)
        jobs = json.loads(request("GET", "/api/jobs")[2])
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["id"], 700)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="astora-server-build-") as build:
        BINARY = Path(build) / "server-test"
        subprocess.run([
            os.environ.get("CC", "clang-18"), "-std=c11", "-D_DEFAULT_SOURCE",
            "-DASTORA_HOST_TEST", "-DCJSON_NESTING_LIMIT=32", "-O1", "-g",
            "-Wall", "-Wextra", "-Werror", "-pthread",
            str(ROOT / "native/tests/server-test.c"), str(ROOT / "native/ps4/server.c"),
            str(ROOT / "native/vendor/cJSON.c"), "-o", str(BINARY)], check=True)
        unittest.main(verbosity=2)
