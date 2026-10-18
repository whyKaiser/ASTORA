# Verification record

Date: 2026-10-18. Desktop environment: Windows, Node.js 25.6.0. Local result: **31 checks passed, 0 failed**.

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
