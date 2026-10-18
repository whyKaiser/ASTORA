# Contributing

Start with [the roadmap](docs/roadmap.md). The current release is a desktop pre-alpha, not an installable PS4 app.

Run `npm test` and `npm run check` with Node.js 22+. Automated tests use synthetic local fixtures, not commercial content or live external hosts. Keep live download checks separate from CI.

For a bug report, include the ASTORA version, operating system, visible error code and a reproducible public homebrew test case where possible. Remove signed query strings, access tokens, private catalog URLs, user paths and console network details. Do not upload `data/downloads/jobs.json` unchanged.

Contributions should preserve these invariants:

- No success message without evidence of that stage.
- Never append after a changed source validator or ignored Range request.
- No automatic insecure transport downgrade, disabled TLS validation or retry after an ambiguous installation response.
- Respect upstream attribution and licenses. Do not submit proprietary SDK files, commercial game packages, private scraped catalogs or credentials.
- Arabic text must remain legible, correctly shaped and in the correct direction. Technical identifiers stay unchanged.
