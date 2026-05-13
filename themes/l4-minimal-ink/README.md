# `themes/l4-minimal-ink`

L4-tier minimal-ink theme. v0.0.9 mechanism stub — artist deliverable
pending; the visual deliberately leans editorial-default (warm white,
near-black ink, Iowan-Old-Style serif, narrower measure) so it reads
distinct from the baseline neutral.

## Tokens this theme overrides

| Token | Baseline | This theme |
|---|---|---|
| `--paper` | `#ffffff` | `#fafafa` |
| `--ink` | `#1a1a1a` | `#0d0d0d` |
| `--rule` | `#e5e5e5` | `#d4d4d4` |
| `--rule-strong` | `#c0c0c0` | `#909090` |
| `--mute` | `#6b6b6b` | `#5a5a5a` |
| `--accent` | `#2563eb` (blue) | `#1a1a1a` (ink-on-ink) |
| `--accent-soft` | `#60a5fa` | `#555555` |
| `--selection` | blue-tinted | ink-tinted |
| `--font-display` | system-ui | Iowan Old Style serif |
| `--font-body` | system-ui | Iowan Old Style serif |
| `--measure` | `38rem` | `32rem` (narrower) |

Dark mode adjusted in parallel.

## Status

Stub. Mechanism-only — when consumed by `create-clam-cms`, this
overlay lands at `src/theme/tokens.ts` in the user's project. The
override is concatenated after baseline tokens; only the vars
declared above change.

Real artist content (component / template overrides, font assets,
license-cleared display faces) lands separately. Track at
[Epic AotterClam/clam-cms#116](https://github.com/AotterClam/clam-cms/issues/116).
