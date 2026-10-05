# Sprout

> A gentle, parent-led learning companion for ages 6 months to 3 years.

[![License: MIT](https://img.shields.io/badge/code-MIT-green.svg)](LICENSE) [![Content: CC BY-NC 4.0](https://img.shields.io/badge/content-CC%20BY--NC%204.0-orange.svg)](CONTENT-LICENSE.md) [![Release v0.0.1](https://img.shields.io/badge/release-v0.0.1-blue.svg)](https://github.com/gxlself/ai-study/releases/tag/v0.0.1) [![CI](https://github.com/gxlself/ai-study/actions/workflows/ci.yml/badge.svg)](https://github.com/gxlself/ai-study/actions/workflows/ci.yml)

[Chinese README](README.md) | [Website](https://gxlself.github.io/ai-study/) | [Online demo](https://gxlself.github.io/ai-study/demo/)

Sprout is a parent-child learning companion for families with children from 6 months to 3 years. The screen is only a slow invitation. The meaningful learning happens through a caregiver's response, real objects, play, books, songs, and time outdoors. Sprout is not an electronic babysitter and does not optimize for longer viewing.

## Principles

- Real interaction comes before passive viewing. Every child-facing lesson assumes a caregiver is present.
- Ages 6-17 months use parent guidance, printable cards, and real objects rather than child-facing lessons.
- Ages 18-23 months default to parent guidance; co-viewing is optional and requires a caregiver.
- Chinese conversation is the main language context. English is an optional, natural supplement.
- Math begins with quantities, space, comparison, and patterns in everyday life. Sprout does not use rapid flash cards or treat lesson performance as a developmental assessment.

These are product and family-use principles, not medical advice or a promise of developmental outcomes.

## Features

| Area | What it provides |
| --- | --- |
| Player | TV, iPad, and browser playback; D-pad, keyboard, and touch input; remote server or offline built-in content; parent gate, co-viewing, pause, and natural stopping points. |
| Parent area | Child profiles, language mode, screen windows, daily plan, route and lesson library, printable cards, milestone observations, device pairing, and backup/restore. |
| Content packs | `sprout.core`, festival content, everyday English, and a small hello-pack example with validation, bundling, import, and upgrade flows. |
| Activities | Built-in activities plus namespaced third-party plugins with lifecycle, focus, resource, sound, permission, and child-safety contracts. |
| Demo build | A static GitHub Pages build at `/ai-study/demo/` using local storage and no pre-recorded audio. |

## Architecture

The repository is a pnpm monorepo:

```text
apps/server/       Fastify, SQLite, REST API, static content
apps/admin/        Parent administration UI
apps/player/       TV/iPad/browser player and Capacitor projects
packages/schema/   Data contracts and validation
packages/core/     Scheduling and screen policy
packages/activities/ Built-in activity plugins
packages/plugin-sdk/ Plugin runtime contract
content/           Content packs and milestone data
scripts/           Content validation, bundling, and packaging
docs/              Research, curriculum, development, and deployment guides
```

The player exposes one `DataSource` interface. `RemoteSource` uses a paired household server; `LocalSource` uses the built-in `sprout.core` bundle and browser storage.

## Quick start

Requirements:

- Node.js `>=22.12`
- pnpm `11.1.0`
- Set `pnpm_config_verify_deps_before_run=false` before pnpm commands in this repository.

```sh
corepack enable
export pnpm_config_verify_deps_before_run=false
pnpm install
pnpm build
pnpm start
```

Open:

- Player: `http://localhost:4310/`
- Parent area: `http://localhost:4310/admin/`
- API docs: `http://localhost:4310/api/docs/`

For development, run the server, player, and admin with their workspace `dev` scripts. See [`docs/README.md`](docs/README.md) for the full index.

## Content and audio

Content source files are JSON and package-local assets. Use the schema and pipeline commands documented in [`docs/dev/content-pipeline.md`](docs/dev/content-pipeline.md).

The public repository and release artifacts contain no pre-recorded audio. An empty `audio/manifest.json` is valid. The player follows this order:

1. Pre-generated package audio, when a public manifest declares it.
2. The Web Speech API.
3. Text-only progression when speech is unavailable.

`pnpm content:audio` is a local-only macOS convenience for personal, non-commercial use. It writes the generated files under ignored `audio/tts/` and the ignored `audio/manifest.local.json`; it does not change the public manifest. The server and optional local player build can merge that local manifest for personal use. Public releases must use a `TtsProvider` or recordings with clear redistribution permission.

Build the static demo:

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player build:demo
```

The output is `apps/player/dist-demo/` and is configured for `https://gxlself.github.io/ai-study/demo/`. Demo data remains in the current browser, the server connection entry is unavailable, and the badge explains that there is no pre-recorded audio.

## Testing

```sh
export pnpm_config_verify_deps_before_run=false
pnpm typecheck
pnpm test
pnpm content:typecheck
pnpm content:test
pnpm qa:license
pnpm qa:verify
pnpm build
```

The CI workflow intentionally excludes macOS `say`, Android SDK, real-device, and long-running browser acceptance tasks.

## License

**Code:** MIT. See [`LICENSE`](LICENSE). This covers application code, packages, scripts, plugins, build configuration, and schemas.

**Original content:** CC BY-NC 4.0 with a separate commercial license requirement. See [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md). Personal, family, non-commercial educational use is free with attribution. Commercial use requires prior written permission.

**Third-party material:** Fluent Emoji is MIT, Lucide is ISC, CDC milestone data follows its documented source terms, and original SVG artwork is CC0 only where the package source index says so. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and package `LICENSES.md` files.

Licensing questions: open a GitHub issue labelled `licensing` or email `gxlself@gmail.com`.

## Disclaimer

Sprout is a parent-child activity tool, not a medical device, therapy, or developmental diagnostic. Milestone entries are for everyday observation and conversations with qualified professionals. If a child loses skills or a caregiver has concerns, contact a pediatric or child-health professional.
