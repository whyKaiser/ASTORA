# Catalog format v1

Import a JSON file using **إضافة مصدر**, or enter its public HTTP(S) URL. Catalog IDs are stable: importing the same ID replaces that locally saved catalog. The built-in ID `astora-homebrew` is reserved. Catalogs may contain up to 5,000 items and at most 2 MiB of JSON. Each item may have 1–12 mirrors.

```json
{
  "schemaVersion": 1,
  "id": "my-library",
  "name": "مكتبتي",
  "items": [
    {
      "id": "my-app",
      "title": "My application",
      "platform": "PS4",
      "kind": "app",
      "titleId": "ABCD00001",
      "version": "1.0",
      "description": "وصف عربي واضح للتطبيق.",
      "homepage": "https://example.org/my-app",
      "sources": [
        { "name": "Main mirror", "url": "https://example.org/my-app.pkg" },
        { "name": "Backup mirror", "url": "https://mirror.example.org/my-app.pkg" }
      ]
    }
  ]
}
```

The `example.org` addresses above are placeholders, not working downloads.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable ASCII letters, digits, `.`, `_`, `-`; unique within a catalog |
| `title` | yes | Display name, up to 160 characters |
| `platform` | yes | `PS1`, `PS2`, `PSP`, `PS3`, `PS4`, `PS5`; organization only |
| `kind` | yes | `app`, `game`, `update`, `dlc` |
| `sources` | yes | Named direct public HTTP(S) URLs |
| `titleId` | no | Four uppercase letters and five digits; checked against the header |
| `size` | no | Complete file size in bytes; checked against the header and HTTP response |
| `sha256` | no | 64 hexadecimal characters from a trusted published reference |
| `version`, `description`, `homepage` | no | Display metadata |

Files are expected to be PS4 PKG containers. Selecting PS1/PS2/PSP does not convert raw discs or archives. PS3/PS5 inspections return `UNSUPPORTED_PLATFORM` in this version.

Do not relabel a patch as a base game or share private/signed URLs in public catalogs. URLs with embedded username/password, fragments, control characters or unsupported schemes are rejected. Existing percent-escaping and query order are preserved. Unknown fields are discarded; arbitrary HTML and scripts are never rendered.

The app does not scrape or copy someone else's private catalog. Maintain your own metadata and link to sources you may access and share. Original application authorship stays with its creator.

## Optional Arabic/English translations

Existing catalogs remain valid. A catalog may add `"translations":{"ar":{"name":"مكتبتي"},"en":{"name":"My library"}}`. Each item may add `translations.ar` and `translations.en` with optional `title` (160 characters) and `description` (600 characters). Only these languages and fields are accepted. Missing text falls back to the original field. Text is rendered literally, never as HTML.

Search includes both translations regardless of interface language. The UI keeps at most 30 added catalogs; saving also depends on browser storage quota.


## Native PS4 0.6.0

The console UI accepts ASTORA catalogs and FPKGi `DATA` objects whose keys are
package URLs. The desktop schema remains stricter and does not import that
legacy format. Native limits are 20 catalogs, 5,000 visible unique entries and
12 mirrors per entry. Duplicate platform/title-ID entries merge mirrors without
mutating the saved input catalogs. Re-importing an ID updates that catalog;
source URLs can be refreshed explicitly. Enable/disable and remove operations
are saved locally, and storage-quota failures leave the current library intact.

Use Sources / From USB. Put JSON files in `ASTORA/catalogs/` on usb0 or usb1.
ASCII file names may contain letters, digits, `_`, `-`, and single dots, and must
end in `.json`. Empty files, files over 2 MiB, directories, links and traversal
paths are rejected. USB import reads only these dedicated directories.
`console-tools.json` is an example with actual developer package links.

Optional native-only `art` fields accept `cover` and `hero` image URLs on reviewed
GitHub hosts. PNG, JPEG and WebP are supported; untrusted markup and arbitrary
image domains are not accepted. Bundled title artwork takes precedence. The
native downloader still permits only reviewed HTTPS package hosts and base PS4
packages. A catalog category does not establish platform compatibility.

Sources / Add a game checks a direct package URL on the console, reads its
identifier and size, and adds it to My additions. This does not start installation.
Inspect again from the game's details before downloading. Changing a mirror
invalidates the earlier inspection; the selected inspected URL is the one passed
to installation.
