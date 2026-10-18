# ASTORA roadmap

## Completed in 0.1.0-alpha.1

- Original Arabic UI, source management, search and catalog schema.
- Real PS4 package header inspection with human-readable failures.
- Desktop downloads, safe conditional resume, full-file SHA-256 comparison.
- Local regression tests and one real official homebrew download.

## Next: standalone PS4 proof

- Establish a clean OpenOrbis build and native API bindings.
- Package a small standalone ASTORA launcher with its own title ID.
- Run the Arabic UI locally on PS4 and test controller navigation.
- Inspect a developer-hosted homebrew PKG using verified TLS on the console.
- Register one native installation, track real progress, verify installation, and launch it.
- Demonstrate the same workflow with the computer turned off.

This is the next acceptance gate. It is not currently complete, and no release date is promised.

## After the native proof

- Queue management and recovery from uncertain installation registration.
- Per-provider link resolvers with expiry handling and clear authentication boundaries.
- Safe archive extraction with disk-space estimates, progress and cancellation.
- Catalog refresh, provenance, duplicate detection and export/backup.
- Gamepad testing, large-library performance, UI localization review and reproducible builds.
- Broader device support only after independent capability and firmware verification.

Catalog availability belongs to its source. A client can explain restricted or dead links, but cannot promise to repair them all. Popularity is not an acceptance criterion; reproducible working releases are.
