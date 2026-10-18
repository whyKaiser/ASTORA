# Verification record

Date: 2026-10-18. Desktop environment: Windows. The 0.2.0-alpha.1 baseline passed **35 checks, 0 failed** on both **Node.js 25.6.0** and **Node.js 22.23.3**. Version-specific verification follows below; 0.3.0-alpha.1 was rerun on Node.js 25.6.0.

## Automated

`node --test test/*.test.mjs` covers catalog validation, signed-query preservation, content classification, title/type/size mismatches, local-network rejection, source diagnostics, real local HTTP redirects, pause/restart/resume, changed ETags, missing validators, SHA-256 mismatch, duplicate active-job rejection, and the loopback API boundary. Run the command for the authoritative current count and results.

`npm run check` checks syntax in the server and browser entry points.

The synthetic fixtures are not installable PS4 applications. They test parser/transfer behavior only. GitHub Actions is not enabled: the publishing connection lacks the `workflow` scope. A workflow template is provided in `docs/github-actions.example.yml`; its tests do not use live external package sources.

## Live transfer through the UI

Source: [PS4 Games Installer r34, developer release](https://github.com/e1z0/PS4-Games-Installer/releases/tag/r34).

- Selected through the Arabic library UI.
- Followed the GitHub redirect over HTTPS.
- Header title ID: `PGIN00001`.
- Download completed: **6,619,136 bytes**.
- Full-file SHA-256 matched the developer release asset digest:

```text
48998dff70bd06cd686880d830627cf80892520e4b0a93b3de81534d9999cc55
```

This proves a real desktop transfer through ASTORA for this specific asset at this time. It does not prove every source, PS4 compatibility or a console installation.

An additional opt-in live header check passed for all three bundled sources: Apollo Save Tool 2.4.0 (`APOL00004`), ezRemote Client 2.07 (`RMTC00001`) and PS4 Games Installer r34 (`PGIN00001`). Run `npm run test:live` to repeat that check against the current external sources.

## Not yet verified

- Full native workflow acceptance on PS4; any ASTORA execution on PS5.
- Installation through ASTORA on a console.
- Console controller, suspend/resume and power interruption.
- Console-native HTTPS and source resolvers.
- Private, restricted or commercial-game sources.

## Browser checks

The local preview was exercised through its actual browser controls: search, empty platform filter, reset, source JSON file import, source disable, persistence after reload, source removal, package preflight and the completed transfer above. Arabic text and the layout were visually checked at the default desktop viewport and at a narrow mobile breakpoint. The narrow view had no horizontal document overflow. This is browser evidence, not PS4 controller evidence.

## 0.2.0-alpha.1 verification

The 35-check suite additionally verifies every static UI translation key, all backend diagnostic codes in English, translation validation/fallback, Arabic search normalization and complete 5000-entry pagination without duplicates or gaps. Both Node.js versions passed.

Actual UI checks: switch Arabic/English and reload; reduced motion persists; invalid catalog reports an English error; import a 5000-entry synthetic catalog; observe 5003 total entries with exactly 24 rendered cards and 209 pages; advance to page 2; search for the last entry; remove the synthetic catalog. Fixture URLs are non-downloadable example.org placeholders and were never opened.

RTL ArrowLeft moves focus from the first card to the next visually left card. The previously completed official-homebrew desktop transfer remains visible with matching hash and English download state. Arabic and English layouts were inspected at the default desktop viewport and a 390×844 viewport override (375 CSS pixels of content excluding the scrollbar); neither language had horizontal overflow. Viewport restored after testing. Browser logs reported no warning/error entries.

This release did not perform another console installation or a console frame-rate measurement. The standalone native acceptance gate remains open.

A live preflight through the 0.2 UI again identified PS4 Games Installer r34 as PGIN00001 over HTTPS with resume prerequisites. Closing the result dialog restored keyboard focus to its library card. No duplicate full-file download was started.

## 0.3.0-alpha.1 identity and appearance verification

- All 35 regression checks passed on Node.js 25.6.0. Syntax checks include the new early-theme script.
- The source and copied logo have identical SHA-256: `496aed3a014780681de3605493672c7ec409dd4d726880a938338156233eba2b`. Original dimensions remain 690 × 678.
- Actual browser switching confirmed dark and sand themes. Sand persists across reload, with computed body background `rgb(234, 217, 184)` and a successfully decoded original logo.
- Arabic and English layouts, the opening-preview dialog, library cards and narrow 390 × 844 viewport were inspected. Both measured content/scroll widths at 375 CSS pixels, without horizontal overflow. Viewport restored after testing.
- Native PS4 icon export/package integration was not performed. No console changes were made by this update.
- Final browser logs contained no warning/error entries.


## Native 0.4.0-alpha.1 preparation (not console acceptance)

- All 35 desktop regression checks still pass. Syntax checks pass for native ES5 UI and preview server.
- OpenOrbis 0.5.4 cross-compilation with clang18/ld.lld18 and `-Wall -Wextra -Werror` passed.
- Actual native HTTP server: 22 host tests pass with an explicit backend double, covering framing, Host/Origin/token validation, strict JSON, package metadata, traversal, persisted task validation and honest progress.
- Native backend contract tests pass, including UBSan trap mode: URL/DNS/TLS/redirect bounds, package identity, registration errors and progress. They do not execute console APIs.
- Browser adapter lifecycle mock tests pass; exact 328-byte ABI is guarded by compile-time assertions.
- Browser-only native UI checks: Arabic/English, dark/sand, persistence after reload, 2048 search and package details. Preview is visibly labeled as not connected to a console.
- A package was built as `IV0000-ASTR00001_00-ASTORA0000000000`, app version `00.40`, 6,619,136 bytes. Header title/type/size validated. Extracted inner-PFS assets, executable and runtime modules matched input SHA-256; metadata/icon were prepared separately.
- USB upload completed and complete FTP readback SHA-256 matched:

```text
cd97d904baee16d97962262e77a9c3bc45a10ca357a42d3d96670a437c1c9a43
```

The native BGFT implementation does not calculate full-file SHA-256.

### Console launch report — 2026-10-18

After being asked to install the staged `ASTORA-0.4.0-alpha.1-PS4.pkg` and open
ASTORA from the home screen, the tester reported: **“ظهرت واجهة أستورا”**
(the ASTORA interface appeared). This is user-reported evidence of interface
launch on the test PS4, whose previously reported firmware is 13.52.

Follow-up FTP reads timed out, so no native startup log or job record was collected
for this launch. Source inspection, native TLS, transfer progress, game installation,
gameplay, detailed Arabic/controller checks and PC-off operation remain unverified.
The next requested device check is **2048 Game → Check source → Download and install**.
Build success, desktop rendering and host tests do not satisfy these remaining checks.

## Native 0.4.1-alpha.1 TV interface and lifecycle

- Native cross-compilation passed with `-Wall -Wextra -Werror`.
- Eight UI model tests passed, including 5000-entry pagination with four rendered
  items per page, Arabic search normalization, filters, and geometric navigation.
- The actual HTTP server passed 23 host tests with a backend double. UI events
  require the session token, accept a fixed event allowlist, and stop after 64
  events per session. Arbitrary text, URLs and account IDs are not UI log fields.
- Browser lifecycle mock tests passed, including the new active-state accessor.
- Browser checks covered 1920×1080 and 1280×720 layouts, RTL navigation, detail
  opening, focus trapping/restoration, Arabic/English and dark/sand switching,
  reduced-motion persistence, the empty PS5 filter, and visible preview-only
  request errors. The 1280×720 document had no horizontal or vertical overflow.
  No browser warning/error entries were captured. Viewport override was reset.
- The package uses APP_VER/VERSION `00.41`. All 23 extracted inner-PFS files
  matched their input hashes. A complete USB FTP readback matched SHA-256:

```text
b1fcd0fec4f7a0e695e7f74ee59a09fc04365e76a3c66b8c7413822697765e84
```

The user confirmed **“ثبّتّه وفتح”** (installed it and it opened). Retrieved console
logs recorded `astora_boot_0.4.1`, successful backend/listener/browser startup,
`ui_library_ready`, and one browser close followed by
`interface_closed_exit_requested` before another successful launch.

The code previously kept its main loop alive after the browser dialog finished.
It now requests normal application exit. This is a verified code defect and
an observed exit sequence, but not proof of the cause of the user's earlier
black screen after selecting 2048. Console source inspection, native download,
installation, gameplay, measured frame rate and PC-off operation remain open.
