# Mantle Starters Release Skill

Use this skill for any `mantle-starters` release, starter version bump,
or landing fanout repair.

## Required Reading

Read these files before changing versions, tags, release workflow files,
or release tarball URLs:

- `.github/workflows/bump-from-sdk.yml`
- `.github/workflows/tag-and-dispatch-landing.yml`
- `package.json`
- `sources.json`

For full fanout context, also inspect sibling checkouts:

- `../mantle`
- `../mantle-landing`

## First Principle

Normal starter feature work lands on `develop`. Public release artifacts
come from `main` plus a pushed `v*` tag. Do not hand-edit public release
assets, retag an existing public version, or repair a published tarball
in place.

If a public tarball is incomplete, fix forward with the next aligned
Mantle alpha.

## Normal Release Path

1. Merge required starter content into `develop`.
2. Publish the next SDK alpha from `../mantle`.
3. Let the SDK release dispatch `bump-from-sdk.yml`.
4. Let the generated release PR promote current `develop` starter
   content to `main`, bump versions, and merge.
5. Let `tag-and-dispatch-landing.yml` tag `vX.Y.Z` and dispatch
   `mantle-landing`.
6. Let `tag-and-dispatch-landing.yml` tag `vX.Y.Z` and dispatch
   `mantle-landing`.
7. Confirm `bump-from-sdk.yml` synced the released `main` commit back to
   `develop`. The workflow opens and auto-merges a backport PR when
   needed, so `develop` should not remain one release behind.

## Pre-Merge Gate For Starter Feature PRs

Run the smallest relevant local gate before opening or merging a feature
PR:

```bash
pnpm check:starter-locks
```

## Pre-Tag Gate

Before accepting a `v*` tag or release PR as complete:

```bash
gh -R aotter/mantle-starters release view vX.Y.Z
gh -R aotter/mantle-landing pr list --search "X.Y.Z"
```

## Red Flags

Stop and explain the situation if any of these appear:

- `main` has release-only changes that are not backported to `develop`
  after the automatic sync step has had time to finish.
- A tarball URL points to a version that has not been tagged yet and no
  matching SDK release is planned.
- Landing points to a starter release different from the intended SDK
  version.
- A production handoff points at a floating branch or local URL instead
  of a tagged release asset.
