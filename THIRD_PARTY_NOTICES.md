# Third-Party Notices

This file summarizes third-party material currently documented by the repository. It does not replace the full notices in each package.

## Microsoft Fluent Emoji

The Fluent Emoji SVGs listed with `source: "fluent-emoji"` in `content/packs/sprout-core/assets/sources.json` come from Microsoft Fluent Emoji and are licensed under the MIT License.

- Project: <https://github.com/microsoft/fluentui-emoji>
- License text and scope: `content/packs/sprout-core/LICENSES.md`

The repository may normalize SVG dimensions for layout. That build-time change does not alter the upstream copyright or license.

## Lucide

The player UI imports icons from `lucide-react`. Lucide is distributed under the ISC License. The player About page and package notices identify this dependency.

- Project: <https://lucide.dev/>
- Package: `lucide-react`

## CDC milestone material

`content/milestones/milestones.json` is a structured project compilation of CDC "Learn the Signs. Act Early." 2022 milestone material. Source URLs, revision details, and the repository disclaimer are kept in the JSON file and the research documentation. The compilation is for everyday observation and is not a diagnostic tool. Users must follow the source terms when reusing the underlying CDC material.

## Original artwork and other package material

Self-drawn SVG artwork is marked `custom` in each package's `assets/sources.json`; its license is stated in that package's `LICENSES.md` and `pack.json.credits`. Traditional melodies, original lyrics, and package text are separately identified and are not interchangeable.

No bundled font license is asserted here because the current applications use system font stacks rather than a checked-in font file.

## Audio

The public repository and release artifacts contain no pre-recorded audio. Local macOS `say` output is personal, non-commercial material and is deliberately kept outside public manifests, bundles, ZIP files, APKs, and the demo build. An authorized TTS provider or licensed recording must carry its own source, attribution, and redistribution notice before it is added to a release.
