# Standalone PS4: research and acceptance gate

Reviewed 2026-10-18. These are architecture findings, not a claim that ASTORA already runs on a console.

## Catalogs are not game files

A client can keep names, identifiers, descriptions and download URLs in a small JSON catalog. Large package bytes remain on external hosts until downloaded. The user's PC need not be that host. A console-native client can fetch the catalog and install directly from supported public sources.

An app and its metadata can be small. Installed games still consume storage. Archives, extracted packages and staged downloads can require additional temporary space. Direct background installation avoids an app-owned full staging copy where supported; it does not prove the system uses no temporary space.

## Public source findings

| Project | What the inspected source establishes | Build/design limit |
| --- | --- | --- |
| [FPKGi](https://github.com/ItsJokerZz/FPKGi/tree/2e8678915e8e81afb081166ce85380361469c3b3) | JSON catalogs and a managed UI calling native package routines | Unity/PS4 SDK integration; GPL-2.0 |
| [SSPI](https://github.com/Xyhlo/SSPI/tree/dc6cb98ee0b1c68d67bfee581fcbcb241246f456) | Console-local queue, native installer, loopback package feeder | Published README says the source export omits build/runtime inputs; not a complete buildable fork |
| [PS4 Games Installer](https://github.com/e1z0/PS4-Games-Installer/tree/8cb32140574ab4763e054f490a175f4207bab007) | OpenOrbis build, package checks and BGFT registration/start paths | Software renderer targets 30 FPS; inspected glyph path does not establish Arabic shaping; GPL-2.0 |

Source references: FPKGi `ControlMenu.cs`; SSPI `PkgInstaller.cs` and `LoopbackPkgServer.cs`; PS4 Games Installer `download.cpp`, `install.cpp`, `video.cpp` and `canvas.cpp`. This is bounded source inspection, not a runtime benchmark or universal firmware compatibility result.

## Local shipped-artifact study

Separately inspected user-supplied NovaStore and DiPlay artifacts. Raw artifacts, remote catalog snapshots, endpoints, extracted code and private evidence are not redistributed in this repository.

- Nova's inspected HTML fetches external JSON and sends package URLs to an installer on the console. One original PS4 handler treats any HTTP 200 as success without parsing the install result; even its network-error branch displays a success-styled notification. ASTORA must distinguish accepted requests, actual transfers and completed installations.
- DiPlay's extracted app contains native code, fonts, artwork and sound rather than its full game collection. Embedded catalog/download-plan strings, background-transfer imports and local artwork paths support a native-client architecture. A loopback package proxy points to the console itself. The actual game hosts and runtime behavior remain unknown.
- DiPlay's PS4 SELF was not supported by the configured decompilation providers. Those conclusions come from file hashes, bounded strings and shipped UI resources, not recovered source or a decompiled call graph. Nova's static JavaScript analysis has separate local provenance and evidence records.
- Source availability, catalog redistribution permission and runtime performance are separate questions. No Nova/DiPlay implementation or content was copied into ASTORA.

## Chosen direction

Keep the UI and original assets local to the app. Run networking, bounded preflight, state persistence and the native installation adapter on PS4. External catalog and package hosts supply content; no personal-PC runtime is part of this target design.

Separate rendering/input from network, package parsing and storage work. Keep the visible list bounded, cancel obsolete artwork requests, cap an eventual image cache and reconcile native task IDs after reopening. Do not promise background continuation when an app-owned proxy has exited.

The browser preview implements two languages, indexed catalog search, 24-card pagination, restrained motion and visibility-aware polling. It has no external font/image dependency. It does not establish PS4 WebKit support, 60 FPS, native gamepad behavior or native installation.

## Native acceptance gate

1. Produce an independent ASTORA application with an open toolchain and its own title identity. No Nova host/plugin dependency.
2. Prove the display engine on PS4: Arabic shaping, mixed-direction text, English, focus/navigation, text input and frame pacing. OpenOrbis WebBrowserDialog declarations alone do not provide a working HTML shell.
3. Fetch one public homebrew catalog and inspect one small package using verified TLS on the console.
4. Register one installation, preserve its task ID, observe real progress and confirm the installed application. Recover safely from uncertain responses.
5. Repeat with the PC off. Then test app exit, suspend/reopen, full storage and expired sources.

Until these pass, builds remain explicitly **experimental**. Desktop previews and
console test packages are identified separately. Desktop screenshots and native-library
symbol names cannot substitute for the console test. See [current device evidence](verification.md).

## Infinitykkj STORE — public metadata review, 2026-10-18

The user supplied [a YouTube demonstration](https://youtu.be/DQHXK576FhY), titled
“تثبيت ألعاب PS4 من مكتبة INFINITY STORE! 🎮 (شرح كامل)” by POARO0. Its description
advertises direct console downloads without a PC. Only the title and description
were retrieved; the video was not watched or used as runtime verification.

The developer's [public repository](https://github.com/infinitykkj/Infinitykkj-STORE-PS4)
currently contains a README identifying a beta store, but no application source
or license. The linked installer hostname did not resolve from the test machine.
The [activation panel](https://infinitydev.shop/Orbis-Helper/) presents username
and password login. These observations do not establish current pricing, permanent
free access, download reliability or an integration API. No package was installed,
no account was created, and no catalog was imported. Keep it as a comparison target,
not a dependency of ASTORA.
