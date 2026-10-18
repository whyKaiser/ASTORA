# ASTORA native PS4 test build

Version **0.4.0-alpha.1**, title ID **ASTR00001**, package version **00.40**.
This is an independent process with its own console loopback server, browser dialog,
HTTPS client and BGFT adapter. It does not load NovaStore, DiPlay, their plugins,
or a computer-hosted server. **The tester confirmed that the ASTORA interface opened
on PS4. Native downloads, game installation and PC-off operation remain unverified.**

The initial package is 6,619,136 bytes. The bundled catalog links three developer
utilities and the free 2048 game; game binaries are not bundled. Files download
from their developers to the console. No paid hosting or service was configured.

## Build

Requirements: OpenOrbis 0.5.4, clang-18, ld.lld-18, make, Python3 and Pillow.
Use your own toolchain outside this repository. No proprietary SDK is included.

```sh
export OO_PS4_TOOLCHAIN=/absolute/path/to/OpenOrbis/PS4Toolchain
cd native
make package
```

The old bundled Linux PkgTool.Core needs an older OpenSSL runtime. On a newer WSL
distribution, `make prepare` still produces the ELF, SELF, assets, SFO and GP4;
use a compatible Windows LibOrbisPkg packager for final assembly:

```powershell
./native/build-windows.ps1 -Toolchain C:/tools/OpenOrbis/PS4Toolchain -PkgTool C:/tools/PkgTool.exe
```

`build-windows.ps1` uses WSL Ubuntu for compilation and the specified Windows
packager. It never changes global TLS/SSL settings. The Linux SFO helper runs
with .NET invariant globalization for its own process only. Build output stays
under `native/build/`, ignored by Git. `prepare-package.py` exports a 512×512
console icon while preserving the project-supplied original logo unchanged.

## UI preview and checks

```sh
node native/preview.mjs
# http://127.0.0.1:4319/ — browser-only preview, no console connection
python3 native/tests/test-server.py
clang-18 -std=c11 -Wall -Wextra -Werror -fsanitize=undefined -fsanitize-trap=all native/tests/backend-test.c -o /tmp/astora-backend-test
/tmp/astora-backend-test
clang-18 -std=c11 -Wall -Wextra -Werror -I native/tests native/tests/browser-lifecycle.c -o /tmp/astora-browser-test
/tmp/astora-browser-test
```

The host HTTP tests run the actual server with an explicit mock backend. Backend
tests supply native API doubles. They are not device tests. Browser rendering,
Arabic shaping and controller behavior need separate PS4 checks.

## Console installation and acceptance

1. Activate the user's existing GoldHEN session. Copy the generated PKG to USB.
2. GoldHEN → Debug Settings → Package Installer → ASTORA package.
3. Open ASTORA. Confirm the flame icon, Arabic UI, language and theme buttons,
   and controller navigation. Do not infer success from the app's launch result.
4. `/data/ASTORA/native-status.log` should record boot, native backend, listener,
   browser, splash and actual UI requests. UI requests prove a request, not rendering.
5. Open **2048 Game**, choose **Check source**, then **Download and install**.
   Confirm real progress, installation, game launch and controller operation.
6. Repeat using a different not-already-installed developer package with the
   computer powered off. Record firmware, package/version and observed outcome.

ASTORA creates only its own data directory and its own installation tasks.
It does not automatically uninstall, overwrite other titles or cancel other apps'
tasks. Closing ASTORA does not intentionally cancel accepted BGFT tasks. Progress
after reopening depends on the system still retaining the task record.

## Current limits

- Reviewed GitHub HTTPS hosts only; not arbitrary share links or link shorteners.
- Base PS4 packages only. Updates, DLC and raw ISO/BIN/PBP/ZIP extraction are not implemented.
- PS1/PS2/PSP metadata does not provide an emulator. Only already prepared PS4
  wrapper packages use this installer. None is advertised as gameplay-tested.
- PS3/PS5 local installation is rejected. The PS4 edition of a cross-generation
  game is a separate package.
- Native checks cover the 8KiB header, content/title/type/size and TLS path.
  The native BGFT path **does not compute a full-file SHA-256**. Desktop hash
  validation must not be attributed to the native build.
- Registration is not installation. Completion requires actual BGFT progress
  and installed-title confirmation. Missing task state is shown as unknown.
- HTTP requests have a 30-second budget; firmware BGFT IPC has no documented
  cancellation timeout. A native service failure can still require closing the app.
- Sources and their servers can change. Reachability does not prove compatibility.

Original application code is MIT. Packaged OpenOrbis runtime components retain
their own licenses; see [notices](notices/README.txt). Native binary publication
must include the corresponding dependency source/build material, not only the
ASTORA source tree. This local test package has not been published as a verified release.

Vendored parser: [cJSON v1.7.19](https://github.com/DaveGamble/cJSON/tree/v1.7.19), unmodified source with its MIT notice. The configured nesting limit is 32.
