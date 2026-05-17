# Security policy

Do not report vulnerabilities in public issues or discussions.

## Scope of this repo

This repo ships consumer-facing starter scaffolds. Engine / runtime vulnerabilities should be reported against the parent SDK repo at https://github.com/AotterClam/mantle/security/advisories/new (see that repo's `SECURITY.md`).

**In-scope here:**

- Starter scaffold code (`blank/`, `publication/`, `presence/`, `intake/`, `transaction/`, plus theme overlays under `themes/`, plus `_common/`).
- The `create-mantle` scaffolder (`packages/create-mantle/`).
- Released tarball assets attached to GitHub releases on this repo.

**Out-of-scope here — report to parent `AotterClam/mantle`:**

- `@aotterclam/mantle-spec`, `@aotterclam/mantle-runtime`, `@aotterclam/mantle-admin-ui`, `@aotterclam/mantle-cloudflare`.
- Auth, MCP, D1 / KV / asset boundaries, render pipeline, deploy / provision scripts.

## How to report

Preferred path: open a private GitHub Security Advisory:

https://github.com/AotterClam/mantle-starters/security/advisories/new

Fallback contact: `phsu@aotter.net` (subject prefix `[mantle-starters security]`).

Include:

- affected starter, theme, or scaffolder area,
- reproduction steps,
- expected impact (especially: does the scaffolder produce code that leaks credentials, OAuth secrets, or `.dev.vars` content?),
- whether the issue affects the released tarball or only the source tree,
- any temporary mitigation you already applied.

## Response expectations

- Acknowledgement target: 3 business days.
- Initial triage target: 7 business days.
- Fix and disclosure timing depends on severity, exploitability, and release status.

These are targets, not contractual SLAs.

## Supported versions

Pre-v0.1.0: only the latest tagged starter release receives security fixes. Older releases will not get backports.

Post-v0.1.0: the latest minor receives fixes; older minors at maintainer discretion.

## Public handling

Once a fix is available, the maintainer may publish:

- a GitHub Security Advisory,
- release notes with the corrected tarball,
- a changelog entry,
- follow-up hardening issues without exploit detail.
