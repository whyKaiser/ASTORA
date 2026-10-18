"""Exercise the real loopback manifest listener; no console or internet required."""
from pathlib import Path
import json
import subprocess
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
binary = root / "build" / "manifest-test"
subprocess.run(["clang-18", "-std=c11", "-Wall", "-Wextra", "-Werror", "-pthread",
                "-fsanitize=undefined", "-fsanitize-trap=all", "-DASTORA_HOST_TEST",
                str(root / "tests/manifest-test.c"), str(root / "ps4/manifest.c"),
                str(root / "vendor/cJSON.c"), "-lm", "-o", str(binary)], check=True)
process = subprocess.Popen([str(binary)], stdout=subprocess.PIPE, text=True)
try:
    url = process.stdout.readline().strip()
    assert url.startswith("http://127.0.0.1:12841/") and url.endswith("-0.json")
    with urllib.request.urlopen(url, timeout=5) as response:
        raw = response.read()
        assert response.headers["Content-Length"] == str(len(raw))
        document = json.loads(raw)
    assert document["originalFileSize"] == 229376
    assert document["packageDigest"] == "0123456789abcdef" * 4
    assert document["numberOfSplitFiles"] == 1
    assert document["pieces"] == [{"url": 'https://release-assets.githubusercontent.com/asset?sig=a%2Fb&name="x"',
                                    "fileOffset": 0, "fileSize": 229376, "hashValue": "0" * 40}]
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=5) as response:
        assert not response.read() and response.headers["Content-Length"] == str(len(raw))
    for target, method in [(url.replace("-0.json", "-1.json"), "GET"),
                           ("http://127.0.0.1:12841/wrong.json", "GET"), (url, "POST")]:
        try:
            urllib.request.urlopen(urllib.request.Request(target, method=method), timeout=5)
            raise AssertionError("Unexpected manifest exposure")
        except urllib.error.HTTPError as error:
            assert error.code == 404
    print("manifest: header digest, exact signed URL, bounds, GET/HEAD and capability routes passed")
finally:
    process.terminate()
    process.wait(timeout=5)
