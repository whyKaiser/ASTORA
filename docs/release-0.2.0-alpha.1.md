# ASTORA 0.2.0-alpha.1 — Arabic roots, two languages

ASTORA now has a fully switchable Arabic/English interface with a new ink, teal and champagne identity, original Arabic-inspired geometry and reduced-motion controls.

Large catalogs render 24 cards per page. Search covers both catalog translations, handles Arabic diacritics and keeps its index between keystrokes. Transfer polling stops in hidden tabs and avoids rebuilding unchanged rows.

Catalog schema v1 now accepts optional `ar`/`en` translations. Existing catalogs remain valid. The release includes a source-based architecture comparison and explicit acceptance criteria for a future standalone PS4 app.

Verification: 35 automated checks pass on Node.js 22.23.3 and 25.6.0. Actual browser checks cover language/motion persistence, translated failures, a 5000-item imported catalog, pagination, search, RTL navigation, download history and narrow-screen layout.

**This is a desktop preview, not ASTORA.pkg.** Downloads go to the computer. Console-native rendering, installation and operation with the PC off are still unimplemented and unverified. No game files or third-party store catalogs are included.

Run with Node.js 22+: `npm start`, then open `http://127.0.0.1:4318`. No npm install step is required.
