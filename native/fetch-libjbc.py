"""Fetch a pinned external build dependency; do not vendor its source in ASTORA."""
import hashlib
import io
from pathlib import Path
import tarfile
import urllib.request

REVISION = "835fe016ff0ae5dd89b9249f39cc0fe093fd07dd"
SHA256 = "63583f40fc93d29ca763884c82c13db952526f22b96e12ce5ac81e92add8170a"
FILES = ("jailbreak.c", "kernelrw.c", "utils.c", "defs.h", "jailbreak.h",
         "kernelrw.h", "utils.h", "libjbc.h")
destination = Path(__file__).parent / "build" / "libjbc"
url = f"https://codeload.github.com/bucanero/ps4-libjbc/tar.gz/{REVISION}"
with urllib.request.urlopen(url, timeout=30) as response:
    data = response.read(1024 * 1024)
if hashlib.sha256(data).hexdigest() != SHA256:
    raise SystemExit("libjbc archive checksum mismatch")
destination.mkdir(parents=True, exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
    for name in FILES:
        member = archive.getmember(f"ps4-libjbc-{REVISION}/{name}")
        if not member.isfile() or member.size > 100000:
            raise SystemExit("Unexpected libjbc archive member")
        (destination / name).write_bytes(archive.extractfile(member).read())
(destination / "ready").write_text(REVISION + "\n")
