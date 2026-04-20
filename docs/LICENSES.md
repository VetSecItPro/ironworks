# Third-Party Licenses

This document enumerates the licenses of all runtime dependencies in the
IronWorks monorepo. It is generated from the lockfile's production
dependency tree.

**Last updated:** 2026-04-19 (UTC)

## Summary

| License                  | Count |
|--------------------------|------:|
| MIT                      |   647 |
| Apache-2.0               |   110 |
| ISC                      |    52 |
| BSD-3-Clause             |    14 |
| BSD-2-Clause             |     3 |
| MIT-0                    |     2 |
| Unlicense                |     2 |
| (MPL-2.0 OR Apache-2.0)  |     1 |
| MPL-2.0                  |     2 |
| LGPL-3.0-or-later        |     1 |
| 0BSD                     |     1 |
| BlueOak-1.0.0            |     1 |
| CC0-1.0                  |     1 |
| Python-2.0               |     1 |
| W3C-20150513             |     1 |
| Unknown                  |     2 |
| **Total**                | **841** |

**Category breakdown:**

| Category                        | Count |
|---------------------------------|------:|
| Permissive (MIT/Apache/BSD/ISC) |   833 |
| Copyleft weak (MPL/LGPL)        |     4 |
| Copyleft strong (GPL/AGPL)      |     0 |
| Other / Unknown                 |     4 |

## Copyleft dependencies (noteworthy)

Packages below carry copyleft or source-disclosure requirements that downstream
distributors should understand.

### MPL-2.0 (Mozilla Public License 2.0)

File-level copyleft. Modifications to MPL-2.0 licensed **source files** must be
released under MPL-2.0. Linking or bundling MPL-2.0 code with proprietary code
under a different license is permitted — only modifications to the MPL-2.0 files
themselves require disclosure. No obligations attach to the combined work as a
whole.

- **lightningcss** `1.32.0` — High-performance CSS parser/transformer written in
  Rust. Pulled in as a transitive dependency of `vite >=8` (build tooling). Not
  linked into runtime server bundles; present in the lockfile as an optional
  bundler optimization.
- **lightningcss-darwin-x64** — Platform-specific native binary for
  `lightningcss` on macOS x64. Same license and scope as `lightningcss` above.
- **dompurify** `^3.4.0` — HTML sanitization library used by
  `@ironworksai/server` to sanitize user-provided content before storage/render.
  This package carries a dual license `(MPL-2.0 OR Apache-2.0)` — the Apache-2.0
  branch is permissive; downstream distributors may elect it. No source-disclosure
  obligation arises when choosing the Apache-2.0 option.

### LGPL-3.0-or-later

Lesser GPL: linking is permitted without triggering copyleft; only modifications
to the LGPL library itself must be disclosed. Dynamic linking (Node.js `require`)
satisfies the "separate work" carve-out in LGPL-3.0 §4.

- **@img/sharp-libvips-darwin-x64** — Pre-built libvips native binary for
  `sharp`, the image processing library used by `@ironworksai/server` for
  thumbnail generation and image resizing. This is a platform-specific optional
  dependency; the shared library is loaded at runtime (dynamic link), satisfying
  the LGPL-3.0 linking exception. The libvips source is available at
  <https://github.com/libvips/libvips>.

### GPL (not present)

No GPL-2.0, GPL-3.0, or AGPL-3.0 dependencies detected in the production
dependency tree. No legal review required for copyleft-strong obligations.

## Other notable licenses

| Package                    | License          | Note |
|----------------------------|------------------|------|
| `lru-cache`                | BlueOak-1.0.0    | Permissive (more permissive than MIT — no trademark restriction). No action needed. |
| `argparse`                 | Python-2.0       | Python Software Foundation license. Permissive; compatible with commercial use. |
| `intersection-observer`    | W3C-20150513     | W3C Software Notice and License. Permissive; requires W3C copyright notice in distributions. |
| `@codesandbox/nodebox`     | Unknown          | License not detected in package metadata. Investigate before redistribution. |
| `khroma`                   | Unknown          | License not detected in package metadata. Investigate before redistribution. |

## Full license distribution

Full listing by package can be regenerated with:

```bash
pnpm licenses list --prod
```

(Stored in `/tmp/licenses-prod.txt` at generation time; regenerate before release.)

To regenerate as JSON for automated tooling:

```bash
npx license-checker-rseidelsohn --production --json > licenses-prod.json
```

Note: `license-checker-rseidelsohn` requires a non-pnpm-workspace layout — run
from a flat install root or use `pnpm licenses list` as the primary tool in this
monorepo.

## Project license

The IronWorks monorepo itself is licensed under the **MIT License**.
Copyright (c) 2025-2026 Steel Motion LLC. See [`LICENSE`](../LICENSE) at the
repository root.

## Notes for upstream contribution

All code in `packages/adapter-utils/`, `packages/adapters/*-api/`, and the
server test infrastructure under `server/src/__tests__/helpers/` is
upstream-contribution-safe. No dependencies added by the `http-adapter-family`
branch introduce new copyleft-strong (GPL/AGPL) obligations compared to upstream
`paperclipai/paperclip`. The four copyleft-weak entries (`lightningcss`,
`lightningcss-darwin-x64`, `dompurify`, `@img/sharp-libvips-darwin-x64`) were
already present in the dependency tree before this branch began; none were
introduced by adapter work in this PR.

The `dompurify` dual-license `(MPL-2.0 OR Apache-2.0)` allows downstream
distributors to elect Apache-2.0, eliminating any MPL source-disclosure
obligation entirely.
