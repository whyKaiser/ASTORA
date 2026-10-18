# ASTORA native storefront — 0.6.0

The current console interface uses a conventional game-store structure: horizontal
navigation, a featured game with its own art, cover shelves, a details page,
My library, transfers, and sources. The supplied ASTORA logo stays unchanged.
Black/charcoal surfaces and a restrained gold accent keep controls distinct from
game artwork. No architectural arches, floating cubes, or ambient geometric
ornaments remain in the native interface.

## Behavior

- Arabic is the default; English mirrors the full layout. A title's original name
  remains when its catalog supplies no translation.
- Moving focus onto a cover changes the feature image and description. Short
  opacity/transform transitions give feedback without constant animation.
- Motion preference and language persist locally. Reduced motion removes those
  transitions; hidden pages pause animation.
- Store cards are bounded to five / four / two per page at wide / TV / narrow
  sizes. My library permits two rows; pagination reaches all 5,000 entries.
- My library contains saved entries and installations confirmed in ASTORA's own
  history. It is not a scan of every game installed on the PS4, and does not
  expose a launch action that has not been implemented.
- Transfers report actual bytes and retain separate accepted, transferring,
  failed, unknown and verified installed states.
- Source management provides URL, USB and individual-package entry. Duplicate
  titles merge mirrors; disabling a catalog keeps its saved metadata.
- Artwork is bundled from the original projects. Unknown entries may supply
  reviewed GitHub-hosted PNG/JPEG/WebP artwork, falling back to the ASTORA logo
  if loading fails. Arbitrary HTML and remote scripts are never rendered.

## Review

The new storefront and source page opened on PS4 13.52. Browser review covered
Arabic/English, 1920×1080 and 1280×720 layouts, search, details, saved favorites
across reload, source enable/disable and empty-transfer states. No measured FPS
claim is made. USB acceptance and SRB2 download/play testing remain pending after
loss of the console's hotspot connection. See [verification](verification.md).

## Earlier designs

Earlier captures remain as historical test evidence. They do not describe the
current native storefront. The separate desktop download prototype still runs
at port 4318; `node native/preview.mjs` previews the current console UI at 4319.
