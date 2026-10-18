# Verification record

Date: 2026-10-18. Desktop environment: Windows. Local result: **35 checks passed, 0 failed** on both **Node.js 25.6.0** and **Node.js 22.23.3**.

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

- ASTORA running on PS4 or PS5.
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
