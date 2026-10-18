# Free sources and PS4 compatibility research

Checked: **2026-10-18, 01:49–01:52 UTC**. Scope: public developer documentation, GitHub release metadata, bounded HTTP probes, and ASTORA catalog validation. No console installation, gameplay, proprietary module download, commercial game download, or large archive download was performed in this research pass.

**Later device result, 2026-10-18:** ASTORA 0.4.10 downloaded and installed 2048
1.00 on PS4 13.52. Game launch and D-pad tile movement succeeded; 2048's own Quit
action produced `CE-34878-0`, cause unconfirmed. ASTORA retained its verified
installed record after reopening. Native full-file hash, 2048 saves/reopening and
literal PC-off operation remain unverified. The table below records the earlier
discovery pass; see the [device verification record](verification.md#native-0410-actual-download-installation-and-gameplay)
for the later results. Other candidates have no new gameplay verification.

## Result

A free catalog can link directly to developers' public release files. The user needs no paid host and no computer running at download time if the downloader runs on the PS4. This still depends on upstream servers staying online. A reachable file is not proof of installation, firmware compatibility, or gameplay.

The new [candidate catalog](../catalogs/free-games-candidates.json) contains **one self-contained game candidate and one engine requiring separate game data**. Its descriptions state the missing console verification. It passes ASTORA's schema validation. It is not a promise of a complete, tested game library.

## Candidates with bounded package checks

| Candidate | Developer source | What was checked | Remaining gate |
|---|---|---|---|
| 2048 Game 1.00, `SKID02048` | [SkidGFX release v1.0](https://github.com/skidgfx/PS4-2048/releases/tag/v1.0) | HTTPS, HTTP 206, first 8,192 bytes, PS4 PKG header, title ID, base-package type, total size 35,454,976 bytes, strong ETag | Full-file hash, installation, controller input, saves and reopening on the user's PS4 13.52 |
| OpenArena engine 1.8, `QUAK03002` | [Mayo1970 release 1.8](https://github.com/Mayo1970/ioQuake3-PS4/releases/tag/1.8) | HTTPS, HTTP 206, first 8,192 bytes, PS4 PKG header, title ID, base-package type, total size 13,762,560 bytes, strong ETag | Separate free `baseoa` data, full-file hash, dependencies, installation and gameplay |

Both resolved to `release-assets.githubusercontent.com`. Probes used ASTORA's actual `createTransport` and `inspectMirrors` functions. `resumable: true` here means Range plus strong ETag were observed; an interrupted full transfer was not performed. Only 8 KiB of each package was inspected.

Expected SHA-256 values came from GitHub release-asset `digest` metadata, not a locally computed full download:

```text
2048:
c53d517bb4ff86c62638edf03548bc94c9bd4b2b21c618c69770469a809c2e4a
OpenArena engine:
5ffe1e0c70ab455a693db4af6ac6960e2a2ec430519ea09571bf4e6e09f1d3f0
```

### Licensing and provenance

The [2048 repository](https://github.com/skidgfx/PS4-2048/tree/d7582734950d91b0443df097884ae221cb799ec8) declares MIT for its source. Its `credits.txt` separately credits Kevin MacLeod's “Cyborg Ninja” through Uppbeat. That is not evidence that ASTORA may relicense the music. The catalog links the developer's unmodified release; it neither mirrors nor repackages the binary or music. Before redistributing a modified build, audit and retain all asset terms. The developer recommends firmware 9.00; no 13.52 test was established here.

The [OpenArena PS4 port](https://github.com/Mayo1970/ioQuake3-PS4) is GPL-2.0. Its [installation instructions](https://github.com/Mayo1970/ioQuake3-PS4/blob/main/INSTALLATION.md) distinguish free OpenArena data from the commercial data needed by other build variants. Only the OpenArena engine is listed. It expects `pak*.pk3` under `/data/ioq3/baseoa/`. The upstream OpenArena download page timed out during this pass, so the data path is not marked ready. No GPL source was copied into ASTORA's MIT application.

## Additional sources, deliberately not presented as ready PS4 installs

| Source | Evidence and availability | Why not a ready ASTORA PS4 game |
|---|---|---|
| [PPSSPP Homebrew Repository](https://store.ppsspp.org/) | Official [index.json](https://store.ppsspp.org/index.json) returned HTTP 200, 7,755 bytes, 18 entries of which 15 are not marked hidden. It labels individual entries freeware or GPL. | These are PSP homebrew ZIPs, not PS4 packages. Needs an independently tested PS4 PSP runtime and controlled extraction/install recipe. Freeware listing does not authorize arbitrary rebranding or repackaging. |
| [Battlegrounds 3](https://github.com/xfacter/battlegrounds3) through PPSSPP | [Official-store ZIP](https://store.ppsspp.org/files/bg3.zip) returned HTTP 206 with `bytes 0-8191/2789524`; first four bytes `504b0304` identify ZIP. The store labels it GPL; upstream keeps separate `LICENSE.txt` and `LICENSE-etc.txt`. | PSP executable/data. Not accepted as a PS4 PKG. PS4 playback untested. |
| [Tetrade](https://github.com/Logan-Campbell/Tetrade), PS1 | Developer source declares MIT and credits separate music/sound authors. Release BIN: 3,196,368 bytes, HTTP 206; CUE also provided. Developer reports original PS1 hardware testing. | Needs a PS1 emulator and both BIN/CUE, plus any runtime requirements. No PS4 gameplay verification; no blanket relicensing of credited audio. |
| [Helengine Demo Disc](https://github.com/helworks/helengine-demo-disc/releases/tag/v1.0.0), PS2/PSP | PS2 ISO release: 25,731,072 bytes, HTTP 206; PSP 7z asset listed at 3,339,902 bytes. | No project-wide redistribution license established in the inspected material; no PS4 wrapper/runtime or gameplay check. Discovery reference only, not a bundled catalog item. |
| [Shattered Pixel Dungeon PS4](https://github.com/iHaiDeeZ/shattered-pixel-dungeon-ps4/releases/tag/v01.03) | GPL-3.0 source and public developer PKG. Release requires user-supplied `libScePigletv2VSH.sprx` and `libSceShaccVSH.sprx`. | These Sony modules are not included. Additionally, release-body SHA-256 and GitHub asset digest disagree. Do not mark verified or silently choose one hash. |
| [Freedoom](https://github.com/freedoom/freedoom) | Free game data under its included license; creator explicitly permits redistribution with notices. | Data only, not an executable. Needs a tested PS4 Doom engine and a data installation recipe. No ready PS4 package was established. |

The Shattered Pixel Dungeon discrepancy was observed through GitHub's release API:

```text
Asset size: 111804416
Release text: 65b0c8558d27767767fe326a40b37a25932d03a4b9aa96bd70cfc870ebb3591e
Asset digest: 13f28576ff7b251ecb0329f066d92a704a66cdf136b3f3c7b4d803e1ebbcf9bb
```

The PPSSPP URL construction is documented by its own [Store.cpp](https://github.com/hrydgard/ppsspp/blob/master/UI/Store.cpp): `download-url` when provided, otherwise `https://store.ppsspp.org/files/<file>.zip`. Preserve `hidden` entries as hidden; do not claim all entries are games, all are compatible, or all permit redistribution. Its [official documentation](https://www.ppsspp.org/docs/getting-started/how-to-get-demos-and-homebrew/) describes the store and the PSP `PSP/GAME` layout. This is useful adapter evidence, not an implemented ASTORA adapter.

## Platform contract for a PS4 build

| Requested platform | Honest PS4 behavior |
|---|---|
| PS4 | Accept a PS4 package after title/type/size checks. A successful header check is only the first gate; HEN, firmware, full-file integrity, dependencies and real execution still matter. |
| PS1 | Requires a compatible PS4 emulator or an already prepared PS4 wrapper. Raw PS1 BIN/CUE files are not installable PS4 packages. Check each title and save behavior. |
| PS2 | Requires a compatible PS2 runtime/wrapper and game-specific configuration. [mast1c0re's developer documentation](https://github.com/McCaulay/mast1c0re-ps2-usb-game-loader) demonstrates one path but lists firmware only through 10.71, so it does not establish support for this user's 13.52. |
| PSP | Requires a matching PS4 emulator/runtime or a compatible wrapper. The inspected [PPSSPP PS4 port project](https://github.com/ripevil3-commits/PPSSPP-PS4-Port) labels itself experimental; do not turn a catalog entry into a compatibility claim. |
| PS3 | A PS3 package is not a native PS4 package. ASTORA has no verified PS3 runtime. Keep local install/play unsupported, regardless of experimental projects or videos. |
| PS5 | PS5 packages are not PS4 packages. ASTORA has no PS5-on-PS4 runtime. A PS4 edition of the same title is a separate artifact and must be identified as PS4. |

The schema currently permits all six platform labels for metadata. `src/inspect.mjs` rejects PS3/PS5 and `src/package.mjs` requires the PS4 `7f434e54` package header even for PS1/PS2/PSP labels. Raw ZIP, ISO, BIN, PBP and ELF files therefore must not be put into the default PKG installation path. Display platform filtering separately from playability.

## Existing catalog rechecked

`node scripts/inspect-bundled.mjs` passed for all three existing developer releases on 2026-10-18, approximately 01:50 UTC:

- Apollo Save Tool 2.4.0: `APOL00004`, 22,806,528 bytes.
- ezRemote Client 2.07: `RMTC00001`, 52,756,480 bytes.
- PS4 Games Installer r34: `PGIN00001`, 6,619,136 bytes.

All had HTTPS, valid bounded PS4 headers, HTTP Range and strong ETags. This is a network/header recheck, not a full download, installation or gameplay test. They are utilities, not a replacement for game content.

## Catalog adapters and zero-cost operation

- **Developer release catalog:** pin release tag, original URL, exact byte size, expected hash, title ID, license/provenance and dependency notes. Native app resolves upstream redirects itself; no personal proxy needed. New candidate catalog uses this model.
- **ASTORA JSON:** already supported by the desktop foundation. A small public metadata file can live in the source repository; retain cached last-known-good data for offline browsing.
- **FPKGi JSON:** [developer README](https://github.com/ItsJokerZz/FPKGi#populate-content) defines external content lists. A format adapter can import a user's permitted catalog; copying the format does not confer rights to the files it references. Adapter implementation is separate from this report.
- **PPSSPP JSON:** feasible metadata adapter based on the official schema above, but download/install requires ZIP/data support and a PS4 PSP runtime; not ready for the current PKG-only engine.
- **PKGi PS3/PSP:** [PS3](https://github.com/bucanero/pkgi-ps3) and [PSP](https://github.com/bucanero/pkgi-psp) are different runtimes. Their catalog conventions do not turn their packages into PS4 games.

No paid accounts or hosting were created. No files were mirrored to ASTORA hosting. GitHub documents [release distribution](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), but this is not a promise that arbitrary game hosting is permitted or that an upstream service will remain available. Free catalogs still require maintenance when links move.

## Search coverage and evidence limits

GitHub repository/release APIs and primary project pages supplied actionable evidence. General web searches found additional ports, but source labels alone were not treated as proof of runnable packages.

Reddit was searched as requested. The [October 2026 homebrew games discussion](https://www.reddit.com/r/ps4homebrew/comments/1wz7z7c/any_good_homebrew_ports_games_for_the_ps4/) and [Quake3 PS4 discussion](https://www.reddit.com/r/ps4homebrew/comments/1szz5ui/quake3_ps4_crossplaying_with_a_very_old_console/) were leads; verified technical findings above come from developers' repositories. Retail-game link collections encountered during discovery were not imported or represented as developer-approved content.

X/Twitter domain searches included PS4 homebrew, PPSSPP and SkidGFX/2048. They surfaced [PPSSPP creator Henrik Rydgard's profile](https://x.com/henrikrydgard/with_replies) and unrelated/trending results, not an independently useful release artifact. No unsupported claim that X supplied working libraries is made.

## Next acceptance test

1. Build ASTORA's own independent PS4 application and retain truthful unsupported-platform states.
2. Test one public developer package, preferably 2048, with full expected-hash validation before installation.
3. Observe real installer completion, launch the game, verify controller input and save/reopen behavior.
4. Repeat with the computer shut down and no proxy/server bound to the computer.
5. Only then label that exact game/version/firmware combination tested. Add emulator-based games after their separate runtime and game tests pass.

No claim that all six requested platforms or all listed sources work has been established by this report.
