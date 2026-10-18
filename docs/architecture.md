# Architecture

## Current implementation

```text
Arabic/English browser UI
    | same-origin JSON API and per-launch request token
Loopback desktop adapter (server.mjs)
    | catalog validator / package inspector / download manager
Pinned-DNS HTTP(S) transport
    | public sources, verified TLS, bounded header reads
Direct package sources

Local state:
  browser storage -> user catalogs
  data/downloads/jobs.json -> transfer state and original URLs
  data/downloads/<uuid>.part -> incomplete or unapproved bytes
  data/downloads/<uuid>.pkg -> completed file
```

`src/catalog.mjs` removes unknown fields and validates bounded metadata. `src/package.mjs` independently implements the PS4 header fields needed for inspection: magic at `0x00`, content ID at `0x40`, content type at `0x74`, flags at `0x78`, package size at `0x430`. This is a format check, not signature verification. `src/network.mjs` follows up to five redirects and validates each target; it pins DNS results to the connection and leaves TLS verification enabled.

`src/downloads.mjs` persists task state before transfer, writes a `.part` file, then verifies its full size and SHA-256. It renames to `.pkg` only after required verification passes. Interrupted tasks recover as paused; users explicitly resume. A strong ETag and an exact `Content-Range` are required to append. Without a reference checksum the UI says that a hash was calculated, not matched.

Transfer states: `checking`, `downloading`, `paused`, `verifying`, `downloaded`, `failed`. There is no `installed` state in this desktop adapter. A future native adapter must obtain actual installation evidence before adding it.

## Standalone PS4 work still required

The Node process is a development/runtime adapter, not a PS4 binary and not the intended final dependency. Running it on a phone, NAS or PC would still require another device and would not satisfy standalone PS4 operation.

A native version needs:

1. An original, distributable launcher built with an open toolchain, application metadata and independent title ID.
2. An on-console UI runtime with tested Arabic shaping, RTL, controller focus and text input. Modern browser behavior in this preview does not establish PS4 WebKit compatibility.
3. Native verified HTTP(S), storage, task persistence and package inspection adapters with the same failure semantics.
4. Native installation integration: prerequisites, registration, recovery after ambiguous responses, real progress, and proof of installation.
5. Real-device tests for power interruption, suspend/resume, low storage, expired URLs and supported firmware versions.

OpenOrbis is a candidate toolchain: [official repository](https://github.com/OpenOrbis/OpenOrbis-PS4-Toolchain). Its presence alone does not provide complete browser-dialog or installation bindings. Third-party source reuse requires checking the actual component license; this repository contains no copied NovaStore/DiPlay code.

## Development boundaries

The server binds only to `127.0.0.1`, checks Host and Origin, requires a per-launch token for API mutations, and sends no CORS permission. This protects a local development surface; it is not a hosted multi-user service. Do not proxy it to the public internet. LAN source support and a console transport must have an explicit separate design.

HTTP errors and redirects are evaluated before payload inspection. Public error reports include stable codes and safe metadata, never exception text or resolved signed URLs. Private originals are still needed locally for resume and are deliberately excluded from Git.

## UI model and localization

`web/i18n.js` holds plain-text Arabic/English strings and localized diagnostics. `web/library-model.js` builds a bilingual search index and returns at most 24 items per page. Locale and motion preferences persist in browser storage. Catalog mutations rebuild the index; keystrokes do not.

[Standalone research](standalone-research.md) records the source comparison and console acceptance gate. [Design](design.md) describes the original visual system and bounded rendering strategy.
