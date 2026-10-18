# ASTORA 0.3.0-alpha.1 — Flame identity and sand mode

The supplied ASTORA flame and wordmark now appear in the library, sidebar, browser icon and an app-opening preview. The original PNG is preserved byte-for-byte.

The interface uses black, red and gold. A new warm sand light mode applies across navigation, cards, dialogs and transfer states, and remembers its selection. Arabic design accents now use Sadu-inspired woven bands; the earlier arch and eight-point emblem are removed.

Verification: 35 regression checks pass. Actual browser checks cover theme persistence, logo rendering, Arabic/English layout, opening preview and narrow screens.

**Desktop preview only.** The branding manifest records the intended PS4 home-screen icon and app-opening uses. Native icon exports, the standalone PS4 package and console installation remain pending. This release changes no console files.

Run with Node.js 22+: `npm start`, then open `http://127.0.0.1:4318`.
